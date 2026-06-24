<script setup lang="ts">
import { ref, onMounted } from 'vue';import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import videoApi, { type VideoProject } from '@/api/video'

const router = useRouter()

// 状态
const loading = ref(false)
const refreshing = ref(false)
const videos = ref<VideoProject[]>([])
const pagination = ref({
  page: 1,
  page_size: 12,
  total: 0,
  total_pages: 0,
})

// 轮询定时器
let pollTimer: ReturnType<typeof setInterval> | null = null

// 格式化时长
function formatDuration(seconds?: number) {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// 状态标签
function statusTagType(status: VideoProject['status']) {
  switch (status) {
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'processing': return 'warning'
    default: return 'info'
  }
}

function statusLabel(status: VideoProject['status']) {
  switch (status) {
    case 'queued': return '排队中'
    case 'processing': return '生成中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    default: return '未知'
  }
}

// 获取列表
async function fetchVideos() {
  refreshing.value = true
  try {
    const res = await videoApi.listProjects({
      page: pagination.value.page,
      pageSize: pagination.value.page_size,
    }) as any
    videos.value = res.data || []
    pagination.value = res.pagination || pagination.value
  } catch (err: any) {
    ElMessage.error(err.message || '加载失败')
  } finally {
    refreshing.value = false
  }
}

// 刷新
async function refresh() {
  await fetchVideos()

  // 如果有正在处理的任务，继续轮询
  const hasProcessing = videos.value.some(v => v.status === 'queued' || v.status === 'processing')
  if (hasProcessing && !pollTimer) {
    startPolling()
  }
}

// 轮询更新
function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    await fetchVideos()

    // 如果没有处理中的任务，停止轮询
    const hasProcessing = videos.value.some(v => v.status === 'queued' || v.status === 'processing')
    if (!hasProcessing && pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }, 10000)
}

// 跳转到创建页
function goToCreate() {
  router.push('/user-center/videos/create')
}

// 查看详情
function viewDetail(video: VideoProject) {
  router.push(`/user-center/videos/${video.id}`)
}

// 删除
async function handleDelete(video: VideoProject, event: Event) {
  event.stopPropagation()

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
    await videoApi.deleteProject(video.id)
    ElMessage.success('已删除')
    await fetchVideos()
  } catch (err: any) {
    ElMessage.error(err.message || '删除失败')
  }
}

// 取消
async function handleCancel(video: VideoProject, event: Event) {
  event.stopPropagation()

  try {
    await ElMessageBox.confirm('确定要取消这个任务吗？', '确认取消', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await videoApi.cancelProject(video.id)
    ElMessage.success('已取消')
    await fetchVideos()
  } catch (err: any) {
    ElMessage.error(err.message || '取消失败')
  }
}

// 页码变化
function onPageChange(page: number) {
  pagination.value.page = page
  fetchVideos()
}

// 初始化
onMounted(async () => {
  await fetchVideos()

  // 如果有处理中的任务，开始轮询
  const hasProcessing = videos.value.some(v => v.status === 'queued' || v.status === 'processing')
  if (hasProcessing) {
    startPolling()
  }
})
</script>

<template>
  <div class="videos-page">
    <ElCard v-loading="loading">
      <template #header>
        <div class="header">
          <h2 class="page-title">我的音像墙</h2>
          <div class="header-actions">
            <ElButton text @click="refresh">
              <ElIcon><Refresh /></ElIcon>
              刷新
            </ElButton>
            <ElButton type="primary" @click="goToCreate">
              <ElIcon><Plus /></ElIcon>
              生成新视频
            </ElButton>
          </div>
        </div>
      </template>

      <div v-if="videos.length > 0" class="video-grid">
        <div
          v-for="video in videos"
          :key="video.id"
          :class="['video-card', { 'is-processing': video.status === 'processing' || video.status === 'queued' }]"
          @click="viewDetail(video)"
        >
          <div class="video-thumb">
            <template v-if="video.status === 'completed' && video.video_url">
              <video :src="video.video_url" class="thumb-video" muted />
            </template>
            <template v-else>
              <div class="thumb-placeholder">
                <ElIcon :size="48" color="#fff">
                  <VideoCamera v-if="video.status === 'completed'" />
                  <Loading v-else-if="video.status === 'processing'" class="rotating" />
                  <Clock v-else />
                </ElIcon>
              </div>
            </template>
            <span v-if="video.duration_seconds" class="duration">{{ formatDuration(video.duration_seconds) }}</span>
            <span v-if="video.priority" class="vip-badge">VIP</span>
          </div>
          <div class="video-info">
            <div class="video-name">{{ video.target_person.full_name }} 的历史音像</div>
            <div class="video-meta">
              <ElTag :type="statusTagType(video.status)" size="small">
                {{ statusLabel(video.status) }}
              </ElTag>
              <span class="time">{{ new Date(video.created_at).toLocaleDateString() }}</span>
            </div>
            <div v-if="video.status === 'queued'" class="queue-info">
              排队第 {{ video.queue_position }} 位
            </div>
            <div class="video-actions" @click.stop>
              <ElButton
                v-if="video.status === 'completed'"
                size="small"
                type="primary"
                plain
              >
                播放
              </ElButton>
              <ElButton
                v-if="video.status === 'queued'"
                size="small"
                type="warning"
                plain
                @click="handleCancel(video, $event)"
              >
                取消
              </ElButton>
              <ElButton size="small" @click="handleDelete(video, $event)">
                删除
              </ElButton>
            </div>
          </div>
        </div>
      </div>

      <ElEmpty v-else-if="!loading" description="暂无音像墙视频">
        <template #image>
          <ElIcon :size="64" color="#c0c4cc"><VideoCamera /></ElIcon>
        </template>
        <ElButton type="primary" @click="goToCreate">生成第一个视频</ElButton>
      </ElEmpty>

      <!-- 分页 -->
      <div v-if="pagination.total_pages > 1" class="pagination">
        <ElPagination
          v-model:current-page="pagination.page"
          :page-size="pagination.page_size"
          :total="pagination.total"
          layout="prev, pager, next"
          @current-change="onPageChange"
        />
      </div>
    </ElCard>
  </div>
</template>

<style scoped>
.videos-page {
  max-width: 1200px;
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
  font-size: 18px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.video-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.video-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
}

.video-card.is-processing {
  border-color: #e6a23c;
}

.video-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  position: relative;
  overflow: hidden;
}

.thumb-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #3e2723, #5d4037);
  display: flex;
  align-items: center;
  justify-content: center;
}

.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.duration {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.vip-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #e6a23c;
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
}

.video-info {
  padding: 14px;
}

.video-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.video-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.queue-info {
  font-size: 12px;
  color: #e6a23c;
  margin-bottom: 8px;
}

.video-actions {
  display: flex;
  gap: 8px;
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}
</style>