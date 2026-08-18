<script setup lang="ts">
/**
 * 家族数据概览（控制面板 -> 数据概览）
 *
 * 结构：
 *   1. 顶部 3 张统计卡（成员/在世/影像）—— 一眼看到家族概况
 *   2. 下方集成 StatisticsPanel —— 完整的分列数据统计（概览/人口/影像/迁徙）
 *
 * 注意：
 *   - 存储用量已下沉到 AdminLayout 顶部一行字高度的提示条，避免重复展示
 *   - 修谱工作流已移除（按需求）
 */
import { nextTick, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import PageLoader, { type PageLoaderLog } from '@/components/PageLoader.vue'
import StatisticsPanel from '@/components/admin/StatisticsPanel.vue'

const route = useRoute()

const clanSlug = ref('')

/**
 * 加载阶段机：控制 PageLoader 展示进度与阶段列表
 * - fetch:    调用 /api/admin/dashboard（网络阶段，最重）
 * - parse:    解析响应，填充 statistics
 * - render:   首帧 DOM 提交完成（nextTick）
 * - finalize: 准备就绪，关闭加载
 */
type LoadStage = 'fetch' | 'parse' | 'render' | 'finalize'
const STAGES: { key: LoadStage; label: string; desc: string }[] = [
  { key: 'fetch', label: '拉取数据概览', desc: '请求 /api/admin/dashboard' },
  { key: 'parse', label: '解析统计数据', desc: '拆分成员/影像/存储' },
  { key: 'render', label: '渲染卡片', desc: '提交首帧 DOM' },
  { key: 'finalize', label: '完成加载', desc: '准备就绪' },
]

const loading = ref(false)
const loadStage = ref<LoadStage>('fetch')
const loadError = ref(false)
const loadErrorMessage = ref('')
const loadLogs = ref<PageLoaderLog[]>([])

/** 推一条日志（带当前阶段前缀和时间戳） */
function pushLog(message: string, type: PageLoaderLog['type'] = 'info') {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  loadLogs.value.push({
    time: `${hh}:${mm}:${ss}`,
    stage: loadStage.value,
    message,
    type,
  })
}

const statistics = ref({
  total_members: 0,
  living_count: 0,
  photo_count: 0,
  storage_used: 0,
  storage_percentage: 0,
  pending_media_reviews: 0,
  pending_bio_reviews: 0,
  pending_applications: 0,
})

const fetchDashboard = async () => {
  loading.value = true
  loadError.value = false
  loadErrorMessage.value = ''
  loadLogs.value = []
  loadStage.value = 'fetch'
  pushLog('开始加载家族数据概览')
  try {
    // ========== 阶段1：拉取 ==========
    pushLog(`调用 /api/admin/dashboard?clanSlug=${clanSlug.value}`)
    const res = await axios.get('/api/admin/dashboard', {
      params: { clanSlug: clanSlug.value },
    })
    pushLog(`响应已收到 (HTTP 200)，payload ${JSON.stringify(res.data).length} bytes`, 'success')

    // ========== 阶段2：解析 ==========
    loadStage.value = 'parse'
    const stats = res.data?.statistics || {}
    statistics.value = {
      total_members: stats.total_members ?? 0,
      living_count: stats.living_count ?? 0,
      photo_count: stats.photo_count ?? 0,
      storage_used: stats.storage_used ?? 0,
      storage_percentage: stats.storage_percentage ?? 0,
      pending_media_reviews: stats.pending_media_reviews ?? 0,
      pending_bio_reviews: stats.pending_bio_reviews ?? 0,
      pending_applications: stats.pending_applications ?? 0,
    }
    pushLog(
      `成员 ${statistics.value.total_members} · 在世 ${statistics.value.living_count} · 影像 ${statistics.value.photo_count}`,
      'success',
    )

    // ========== 阶段3：渲染 ==========
    loadStage.value = 'render'
    await nextTick()
    pushLog('首屏 DOM 已提交', 'success')

    // ========== 阶段4：完成 ==========
    loadStage.value = 'finalize'
    pushLog('数据概览加载完成', 'success')
  } catch (error: any) {
    const status: number = error?.response?.status || error?.status || 0
    const message: string = error?.message || String(error)
    loadError.value = true
    if (status === 401) {
      loadErrorMessage.value = '登录已过期，请重新登录后再访问'
    } else if (status === 403) {
      loadErrorMessage.value = '当前账号无权查看该家族'
    } else if (status === 404) {
      loadErrorMessage.value = '未找到该家族，可能已被删除'
    } else if (status >= 500) {
      loadErrorMessage.value = '服务器开小差了，请稍后重试'
    } else {
      loadErrorMessage.value = message || '加载失败，请稍后重试'
    }
    pushLog(`失败：${loadErrorMessage.value} (HTTP ${status || '-'})`, 'error')
    console.error('Failed to fetch dashboard:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  clanSlug.value = (route.params.slug as string) || '1'
  fetchDashboard()
})
</script>

<template>
  <div class="dashboard-page">
    <!-- 全屏加载占位：进度条 + 阶段列表 + 滚动日志 -->
    <PageLoader
      :visible="loading"
      title="正在加载家族数据概览"
      :stages="STAGES"
      :current-stage="loadStage"
      :logs="loadLogs"
      :error="loadError"
      :error-message="loadErrorMessage"
    />

    <!-- 实际内容：加载完成后渲染，加载中隐藏以避免空白骨架 -->
    <template v-if="!loading">
      <!-- 家族概况（成员 / 在世 / 影像） -->
      <ElRow :gutter="20" class="stats-row">
        <ElCol :xs="12" :sm="8">
          <ElCard class="stat-card" shadow="hover" @click="$router.push('/tree/' + clanSlug)">
            <div class="stat-content">
              <div class="stat-icon" style="background: linear-gradient(135deg, #409EFF, #337ECC);">
                <ElIcon :size="28"><UserFilled /></ElIcon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ statistics.total_members }}</div>
                <div class="stat-label">家族成员</div>
              </div>
            </div>
          </ElCard>
        </ElCol>
        <ElCol :xs="12" :sm="8">
          <ElCard class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon" style="background: linear-gradient(135deg, #67C23A, #529B2E);">
                <ElIcon :size="28"><HomeFilled /></ElIcon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ statistics.living_count }}</div>
                <div class="stat-label">在世人数</div>
              </div>
            </div>
          </ElCard>
        </ElCol>
        <ElCol :xs="12" :sm="8">
          <ElCard class="stat-card" shadow="hover" @click="$router.push(`/zupu/${clanSlug}/media/library`)">
            <div class="stat-content">
              <div class="stat-icon" style="background: linear-gradient(135deg, #E6A23C, #C98A2E);">
                <ElIcon :size="28"><PictureFilled /></ElIcon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ statistics.photo_count }}</div>
                <div class="stat-label">家族影像</div>
              </div>
            </div>
          </ElCard>
        </ElCol>
      </ElRow>

      <!-- 数据统计（原独立页面，已集成到本页面下方，保留 el-tabs 分列样式） -->
      <div class="stats-panel-wrapper">
        <StatisticsPanel />
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard-page {
  max-width: 1400px;
  margin: 0 auto;
}

.stats-row {
  margin-top: 20px;
}

.stats-panel-wrapper {
  margin-top: 20px;
}

.stat-card {
  cursor: pointer;
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-4px);
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  flex-shrink: 0;
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 2px;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .stat-value {
    font-size: 22px;
  }

  .stat-icon {
    width: 44px;
    height: 44px;
  }
}
</style>