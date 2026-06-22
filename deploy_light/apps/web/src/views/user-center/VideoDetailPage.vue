<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import videoApi, { type VideoProject, type VideoMaterial } from '@/api/video'

const route = useRoute()
const router = useRouter()

// 状态
const loading = ref(false)
const project = ref<VideoProject | null>(null)
const materials = ref<VideoMaterial[]>([])
const refreshing = ref(false)

// 视频播放
const videoRef = ref<HTMLVideoElement | null>(null)

// 轮询定时器
let pollTimer: ReturnType<typeof setInterval> | null = null

// 计算属性
const isCompleted = computed(() => project.value?.status === 'completed')
const isProcessing = computed(() => project.value?.status === 'processing')
const isQueued = computed(() => project.value?.status === 'queued')
const isFailed = computed(() => project.value?.status === 'failed')

const statusText = computed(() => {
  switch (project.value?.status) {
    case 'queued': return '排队中'
    case 'processing': return '生成中'
    case 'completed': return '已完成'
    case 'failed': return '生成失败'
    default: return '未知'
  }
})

const statusType = computed(() => {
  switch (project.value?.status) {
    case 'completed': return 'success'
    case 'processing': return 'warning'
    case 'failed': return 'danger'
    default: return 'info'
  }
})

const formattedDuration = computed(() => {
  if (!project.value?.duration_seconds) return '--:--'
  const s = project.value.duration_seconds
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
})

// 加载项目详情
async function loadProject() {
  const id = route.params.id as string
  if (!id) return

  refreshing.value = true
  try {
    const res = await videoApi.getProject(id) as any
    project.value = res
    materials.value = res.materials || []
  } catch (err: any) {
    ElMessage.error(err.message || '加载失败')
    router.back()
  } finally {
    refreshing.value = false
  }
}

// 刷新状态
async function refresh() {
  await loadProject()
}

// 取消项目
async function handleCancel() {
  try {
    await ElMessageBox.confirm('确定要取消这个生成任务吗？', '确认取消', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await videoApi.cancelProject(project.value!.id)
    ElMessage.success('已取消')
    router.push('/user-center/videos')
  } catch (err: any) {
    ElMessage.error(err.message || '取消失败')
  }
}

// 删除项目
async function handleDelete() {
  try {
    await ElMessageBox.confirm('确定要删除这个项目吗？', '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await videoApi.deleteProject(project.value!.id)
    ElMessage.success('已删除')
    router.push('/user-center/videos')
  } catch (err: any) {
    ElMessage.error(err.message || '删除失败')
  }
}

// 下载视频
function handleDownload() {
  if (!project.value?.video_url) return
  const a = document.createElement('a')
  a.href = project.value.video_url
  a.download = `${project.value.target_person.full_name}_历史音像墙.mp4`
  a.click()
}

// 分享
function handleShare() {
  if (!project.value?.video_url) return
  ElMessage.info('分享功能开发中')
}

// 播放视频
function playVideo() {
  videoRef.value?.play()
}

// 初始化
onMounted(async () => {
  await loadProject()

  // 轮询更新状态（排队或处理中时）
  if (isQueued.value || isProcessing.value) {
    pollTimer = setInterval(async () => {
      await loadProject()
      if (isCompleted.value || isFailed.value) {
        if (pollTimer) clearInterval(pollTimer)
      }
    }, 10000) // 每10秒刷新一次
  }
})

// 清理
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="video-detail-page">
    <ElCard v-loading="loading">
      <template #header>
        <div class="header">
          <h2 class="page-title">音像墙详情</h2>
          <ElButton text @click="refresh">
            <ElIcon><Refresh /></ElIcon>
            刷新
          </ElButton>
        </div>
      </template>

      <div v-if="project" class="detail-content">
        <!-- 项目信息 -->
        <div class="project-info">
          <div class="person-header">
            <div class="person-avatar">
              <ElIcon :size="40"><User /></ElIcon>
            </div>
            <div class="person-details">
              <h3 class="person-name">{{ project.target_person.full_name }}</h3>
              <div class="person-meta">
                <span>{{ project.target_person.gender === 'male' ? '男' : '女' }}</span>
                <template v-if="project.target_person.birth_date">
                  <span>·</span>
                  <span>{{ project.target_person.birth_date?.slice(0, 4) }}年</span>
                </template>
                <template v-if="project.target_person.death_date">
                  <span>-</span>
                  <span>{{ project.target_person.death_date?.slice(0, 4) }}年</span>
                </template>
              </div>
            </div>
            <ElTag :type="statusType" size="large">{{ statusText }}</ElTag>
          </div>

          <div class="info-grid">
            <div class="info-item">
              <span class="label">创建时间</span>
              <span class="value">{{ new Date(project.created_at).toLocaleString() }}</span>
            </div>
            <div class="info-item">
              <span class="label">视频风格</span>
              <span class="value">
                {{ project.style === 'nostalgic' ? '温馨怀旧' : project.style === 'bw复古' ? '黑白复古' : '现代明亮' }}
              </span>
            </div>
            <div class="info-item">
              <span class="label">素材数量</span>
              <span class="value">{{ project.material_count }} 张照片</span>
            </div>
            <div class="info-item">
              <span class="label">视频时长</span>
              <span class="value">{{ formattedDuration }}</span>
            </div>
            <div v-if="project.priority" class="info-item">
              <span class="label">处理方式</span>
              <ElTag type="warning" size="small">VIP优先</ElTag>
            </div>
          </div>
        </div>

        <!-- 排队状态 -->
        <div v-if="isQueued" class="queue-status">
          <ElAlert type="info" :closable="false">
            <template #title>
              <div class="queue-title">
                <ElIcon :size="20"><Clock /></ElIcon>
                正在排队等待生成
              </div>
            </template>
            <div class="queue-info">
              当前排队位置：第 {{ project.queue_position }} 位<br>
              预计等待时间：约 {{ project.queue_position * 5 }} 分钟
            </div>
          </ElAlert>
          <div class="queue-actions">
            <ElButton @click="handleCancel">取消任务</ElButton>
          </div>
        </div>

        <!-- 处理状态 -->
        <div v-if="isProcessing" class="processing-status">
          <ElAlert type="warning" :closable="false">
            <template #title>
              <div class="processing-title">
                <ElIcon class="rotating" :size="20"><Loading /></ElIcon>
                正在生成视频，请稍候...
              </div>
            </template>
            <div class="processing-info">
              AI正在处理素材，预计需要 1-3 分钟
            </div>
          </ElAlert>
        </div>

        <!-- 失败状态 -->
        <div v-if="isFailed" class="failed-status">
          <ElAlert type="error" :closable="false">
            <template #title>
              <div class="failed-title">
                <ElIcon :size="20"><CircleClose /></ElIcon>
                视频生成失败
              </div>
            </template>
            <div class="failed-info">
              {{ project.error_message || '未知错误' }}
            </div>
          </ElAlert>
          <div class="failed-actions">
            <ElButton @click="handleDelete">删除项目</ElButton>
            <ElButton type="primary" @click="router.push('/user-center/videos/create')">重新生成</ElButton>
          </div>
        </div>

        <!-- 视频播放器 -->
        <div v-if="isCompleted" class="video-player-section">
          <div class="video-player">
            <video
              ref="videoRef"
              :src="project.video_url"
              controls
              playsinline
              class="video-element"
            >
              您的浏览器不支持视频播放
            </video>
          </div>
          <div class="player-actions">
            <ElButton type="primary" @click="playVideo">
              <ElIcon><VideoPlay /></ElIcon>
              播放
            </ElButton>
            <ElButton @click="handleDownload">
              <ElIcon><Download /></ElIcon>
              下载
            </ElButton>
            <ElButton @click="handleShare">
              <ElIcon><Share /></ElIcon>
              分享
            </ElButton>
          </div>
        </div>

        <!-- 素材列表 -->
        <div v-if="materials.length > 0" class="materials-section">
          <h3 class="section-title">使用的素材</h3>
          <div class="materials-grid">
            <div v-for="material in materials" :key="material.media_id" class="material-item">
              <img :src="material.file_url" :alt="material.description || '素材'" />
              <div v-if="material.taken_year" class="material-year">{{ material.taken_year }}</div>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div v-if="isCompleted" class="final-actions">
          <ElButton @click="router.push('/user-center/videos')">返回列表</ElButton>
          <ElButton type="danger" plain @click="handleDelete">删除项目</ElButton>
        </div>
      </div>
    </ElCard>
  </div>
</template>

<style scoped>
.video-detail-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  margin: 0;
  font-size: 20px;
}

.detail-content {
  padding: 20px 0;
}

.project-info {
  margin-bottom: 24px;
}

.person-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.person-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5d4037, #8d6e63);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.person-details {
  flex: 1;
}

.person-name {
  margin: 0 0 8px;
  font-size: 24px;
}

.person-meta {
  color: #909399;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.info-item {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
}

.info-item .label {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.info-item .value {
  font-size: 16px;
  font-weight: 500;
}

.queue-status,
.processing-status,
.failed-status {
  margin-bottom: 24px;
}

.queue-title,
.processing-title,
.failed-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.queue-info,
.processing-info,
.failed-info {
  margin-top: 8px;
  line-height: 1.6;
}

.queue-actions,
.failed-actions,
.final-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 16px;
}

.processing-status .rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.video-player-section {
  margin-bottom: 32px;
}

.video-player {
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 16px;
}

.video-element {
  width: 100%;
  max-height: 500px;
  display: block;
}

.player-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.materials-section {
  margin-bottom: 32px;
}

.section-title {
  margin: 0 0 16px;
  font-size: 16px;
}

.materials-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.material-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: #f5f7fa;
}

.material-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.material-year {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.final-actions {
  padding-top: 24px;
  border-top: 1px solid #ebeef5;
}
</style>
