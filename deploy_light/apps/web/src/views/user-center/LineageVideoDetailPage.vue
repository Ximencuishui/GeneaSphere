<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import lineageVideoApi, {
  type LineageVideoProject,
  type LineageVideoMaterial,
} from '@/api/lineageVideo'

const route = useRoute()
const router = useRouter()

const refreshing = ref(false)
const project = ref<LineageVideoProject | null>(null)
const materials = ref<LineageVideoMaterial[]>([])

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
    case 'failed': return '失败'
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

const directionLabel = computed(() => {
  switch (project.value?.direction) {
    case 'paternal': return '父系'
    case 'maternal': return '母系'
    case 'both': return '双系'
    default: return ''
  }
})

const styleLabel = computed(() => {
  switch (project.value?.style) {
    case 'nostalgic': return '温馨怀旧'
    case 'bw复古': return '黑白复古'
    case 'modern': return '现代明亮'
    default: return ''
  }
})

// 按人物分组的素材
const materialsByPerson = computed(() => {
  const map = new Map<string, { name: string; items: LineageVideoMaterial[] }>()
  for (const m of materials.value) {
    if (!map.has(m.person_id)) {
      map.set(m.person_id, { name: m.person_name, items: [] })
    }
    map.get(m.person_id)!.items.push(m)
  }
  return Array.from(map.values())
})

// 加载项目详情
async function loadProject() {
  const id = route.params.id as string
  if (!id) return

  refreshing.value = true
  try {
    const res = await lineageVideoApi.getProject(id) as any
    project.value = res
    materials.value = res.materials || []
  } catch (err: any) {
    ElMessage.error(err.message || '加载失败')
    router.back()
  } finally {
    refreshing.value = false
  }
}

// 轮询
function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(loadProject, 10000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 取消项目
async function handleCancel() {
  if (!project.value) return
  try {
    await ElMessageBox.confirm('确定取消该项目吗？', '确认取消', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await lineageVideoApi.cancelProject(project.value.id)
    ElMessage.success('已取消')
    router.push('/user-center/lineage-video')
  } catch (err: any) {
    ElMessage.error(err.message || '取消失败')
  }
}

// 删除项目
async function handleDelete() {
  if (!project.value) return
  try {
    await ElMessageBox.confirm('确定要删除该项目吗？', '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await lineageVideoApi.deleteProject(project.value.id)
    ElMessage.success('已删除')
    router.push('/user-center/lineage-video')
  } catch (err: any) {
    ElMessage.error(err.message || '删除失败')
  }
}

// 下载视频
function handleDownload() {
  if (!project.value?.video_url) return
  const a = document.createElement('a')
  a.href = project.value.video_url
  a.download = `${project.value.center_person.full_name}_直系血缘视频.mp4`
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// 申请纳入印刷版
function handleApplyForPrint() {
  ElMessage.success('已提交印刷申请，管理员审核后将出现在印刷版中')
}

onMounted(async () => {
  await loadProject()
  if (isQueued.value || isProcessing.value) {
    startPolling()
  }
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<template>
  <div class="lineage-video-detail">
    <ElCard v-loading="refreshing">
      <template #header>
        <div class="header">
          <h2 class="page-title">{{ project?.center_person?.full_name }} 的直系血脉视频</h2>
          <div class="header-actions">
            <ElButton text @click="router.push('/user-center/lineage-video')">
              <ElIcon><ArrowLeft /></ElIcon> 返回列表
            </ElButton>
          </div>
        </div>
      </template>

      <div v-if="project" class="content">
        <!-- 状态信息 -->
        <div class="info-row">
          <ElTag :type="statusType as any" size="large">{{ statusText }}</ElTag>
          <ElTag size="large" type="info">{{ directionLabel }}</ElTag>
          <ElTag size="large">上{{ project.up_generations }}代 / 下{{ project.down_generations }}代</ElTag>
          <ElTag v-if="project.include_spouse" size="large">含配偶</ElTag>
          <ElTag v-if="project.priority" size="large" type="warning">付费优先</ElTag>
        </div>

        <!-- 排队信息 -->
        <ElAlert
          v-if="isQueued"
          :title="`当前排队位置：第 ${project.queue_position} 位`"
          type="info"
          :closable="false"
          show-icon
          class="queue-alert"
        />

        <!-- 处理中 -->
        <ElAlert
          v-if="isProcessing"
          title="视频正在生成中，请耐心等待..."
          type="warning"
          :closable="false"
          show-icon
          class="queue-alert"
        />

        <!-- 视频播放器 -->
        <div v-if="isCompleted && project.video_url" class="player-section">
          <h3 class="section-title">视频播放</h3>
          <video
            :src="project.video_url"
            controls
            class="video-player"
            preload="metadata"
          ></video>
          <div class="video-meta">
            <span>时长：{{ formattedDuration }}</span>
            <span>风格：{{ styleLabel }}</span>
            <span>素材：{{ materials.length }} 份</span>
          </div>
          <div class="video-actions">
            <ElButton type="primary" @click="handleDownload">
              <ElIcon><Download /></ElIcon> 下载视频
            </ElButton>
            <ElButton @click="handleApplyForPrint">
              <ElIcon><Printer /></ElIcon> 申请纳入印刷版
            </ElButton>
          </div>
        </div>

        <!-- 失败信息 -->
        <ElAlert
          v-if="isFailed"
          :title="`生成失败：${project.error_message || '未知错误'}`"
          type="error"
          :closable="false"
          show-icon
          class="queue-alert"
        />

        <!-- 错误信息 -->
        <ElAlert
          v-if="isFailed"
          title="您可以重新创建项目"
          type="info"
          :closable="false"
          show-icon
        />

        <!-- 血脉图谱 -->
        <ElDivider />
        <h3 class="section-title">血脉图谱</h3>
        <div class="lineage-tree">
          <div class="tree-line">
            <div
              v-for="person in materialsByPerson"
              :key="person.name"
              class="tree-node"
            >
              <ElAvatar :size="40">
                {{ person.name.charAt(0) }}
              </ElAvatar>
              <div class="node-name">{{ person.name }}</div>
              <div class="node-count">{{ person.items.length }} 张</div>
            </div>
          </div>
        </div>

        <!-- 素材列表 -->
        <ElDivider />
        <h3 class="section-title">使用素材（{{ materials.length }}）</h3>
        <div class="materials-grid">
          <div
            v-for="m in materials"
            :key="m.media_id"
            class="material-card"
          >
            <img v-if="m.media_type === 'image'" :src="m.file_url" :alt="m.person_name" />
            <video v-else :src="m.file_url" class="video-thumb"></video>
            <div class="material-info">
              <span class="person-tag">{{ m.person_name }}</span>
              <span v-if="m.taken_year" class="year">{{ m.taken_year }}年</span>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <ElDivider />
        <div class="footer-actions">
          <div class="footer-time">
            创建于 {{ new Date(project.created_at).toLocaleString() }}
          </div>
          <div class="footer-buttons">
            <ElButton
              v-if="isQueued"
              type="warning"
              @click="handleCancel"
            >
              取消项目
            </ElButton>
            <ElButton
              v-if="isCompleted || isFailed || isQueued"
              type="danger"
              @click="handleDelete"
            >
              删除
            </ElButton>
            <ElButton
              type="primary"
              @click="router.push('/user-center/lineage-video')"
            >
              创建新项目
            </ElButton>
          </div>
        </div>
      </div>
    </ElCard>
  </div>
</template>

<style scoped>
.lineage-video-detail {
  padding: 0;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.info-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.queue-alert {
  margin-bottom: 16px;
}

.player-section {
  margin: 24px 0;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 16px 0;
}

.video-player {
  width: 100%;
  max-height: 480px;
  background: #000;
  border-radius: 8px;
}

.video-meta {
  display: flex;
  gap: 24px;
  margin: 12px 0;
  font-size: 14px;
  color: #606266;
}

.video-actions {
  display: flex;
  gap: 12px;
}

.lineage-tree {
  background: #fafafa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.tree-line {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: center;
}

.tree-node {
  text-align: center;
}

.node-name {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 500;
}

.node-count {
  font-size: 11px;
  color: #909399;
}

.materials-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.material-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
  transition: transform 0.2s;
}

.material-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.material-card img,
.video-thumb {
  width: 100%;
  height: 120px;
  object-fit: cover;
  background: #f5f7fa;
}

.material-info {
  padding: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.person-tag {
  color: #409eff;
  font-weight: 500;
}

.year {
  color: #909399;
}

.footer-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.footer-time {
  font-size: 13px;
  color: #909399;
}

.footer-buttons {
  display: flex;
  gap: 12px;
}
</style>