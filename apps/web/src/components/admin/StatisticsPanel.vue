<script setup lang="ts">
/**
 * 数据统计面板（可复用）
 *
 * 由 DashboardPage 与 StatisticsPage 共同引用。
 * 保持原有 el-tabs + 分列卡片样式不变。
 */
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

const route = useRoute()
const clanSlug = computed(() => (route.params.slug as string) || '1')

const overview = ref<any>(null)
const demographics = ref<any>(null)
const mediaStats = ref<any>(null)
const migrationStats = ref<any>(null)
const loading = ref(false)
const activeTab = ref('overview')

/**
 * 中文世系数：1→第一世，2→第二世，...，10→第十世，11→第十一世，...
 * 与册谱世系表「第N世」表述一致。
 */
const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
function genToChinese(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return String(n)
  if (n < 10) return `第${CN_DIGITS[n]}世`
  if (n === 10) return '第十世'
  if (n < 20) return `第十${CN_DIGITS[n - 10]}世`
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    return ones === 0
      ? `第${CN_DIGITS[tens]}十世`
      : `第${CN_DIGITS[tens]}十${CN_DIGITS[ones]}世`
  }
  // >100 直接用阿拉伯数字
  return `第${n}世`
}

/**
 * 房支 A/B/C → 中文「长房/二房/三房」（参考《family-book.service.ts》中文房支命名）。
 * 未知/null 退化为「未知」。
 */
const BRANCH_LABEL: Record<string, string> = {
  A: '长房',
  B: '二房',
  C: '三房',
}
function branchToChinese(b: string): string {
  return BRANCH_LABEL[b] ?? (b || '未知')
}

const generationRows = computed(() =>
  (demographics.value?.by_generation ?? []).map((g: any) => ({
    ...g,
    generationLabel: genToChinese(g.generation),
  })),
)
const branchRows = computed(() =>
  (demographics.value?.by_branch ?? []).map((b: any) => ({
    ...b,
    branchLabel: branchToChinese(b.branch),
  })),
)

const fetchOverview = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/statistics/overview', {
      params: { clanSlug: clanSlug.value },
    })
    overview.value = res.data
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const fetchDemographics = async () => {
  try {
    const res = await axios.get('/api/admin/statistics/demographics', {
      params: { clanSlug: clanSlug.value },
    })
    demographics.value = res.data
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  }
}

const fetchMediaStats = async () => {
  try {
    const res = await axios.get('/api/admin/statistics/media', {
      params: { clanSlug: clanSlug.value },
    })
    mediaStats.value = res.data
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  }
}

const fetchMigrationStats = async () => {
  try {
    const res = await axios.get('/api/admin/statistics/migration', {
      params: { clanSlug: clanSlug.value },
    })
    migrationStats.value = res.data
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  }
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const handleTabChange = (tab: string) => {
  if (tab === 'demographics' && !demographics.value) {
    fetchDemographics()
  } else if (tab === 'media' && !mediaStats.value) {
    fetchMediaStats()
  } else if (tab === 'migration' && !migrationStats.value) {
    fetchMigrationStats()
  }
}

onMounted(() => {
  fetchOverview()
})
</script>

<template>
  <div class="statistics-panel">
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <!-- 概览 -->
      <el-tab-pane label="概览" name="overview">
        <div v-if="overview" class="overview-grid">
          <!-- 成员统计 -->
          <el-card class="stat-card">
            <template #header>
              <span>成员统计</span>
            </template>
            <div class="stat-item">
              <span class="label">总人数</span>
              <span class="value">{{ overview.members?.total || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="label">在世</span>
              <span class="value success">{{ overview.members?.living || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="label">已故</span>
              <span class="value">{{ overview.members?.deceased || 0 }}</span>
            </div>
          </el-card>

          <!-- 影像统计 -->
          <el-card class="stat-card">
            <template #header>
              <span>影像统计</span>
            </template>
            <div class="stat-item">
              <span class="label">照片</span>
              <span class="value">{{ overview.media?.photos || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="label">视频</span>
              <span class="value">{{ overview.media?.videos || 0 }}</span>
            </div>
          </el-card>

          <!-- 存储统计 -->
          <el-card class="stat-card">
            <template #header>
              <span>存储使用</span>
            </template>
            <div class="stat-item">
              <span class="label">已用空间</span>
              <span class="value">{{ formatBytes(overview.storage?.used || 0) }}</span>
            </div>
            <div class="stat-item">
              <span class="label">使用率</span>
              <span class="value">{{ overview.storage?.percentage || 0 }}%</span>
            </div>
            <el-progress :percentage="overview.storage?.percentage || 0" :stroke-width="10" />
          </el-card>

          <!-- 待处理 -->
          <el-card class="stat-card">
            <template #header>
              <span>待处理事项</span>
            </template>
            <div class="stat-item">
              <span class="label">影像审核</span>
              <span class="value warning">{{ overview.pending?.media_reviews || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="label">生平审核</span>
              <span class="value warning">{{ overview.pending?.bio_reviews || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="label">认亲申请</span>
              <span class="value warning">{{ overview.pending?.applications || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="label">举报</span>
              <span class="value warning">{{ overview.pending?.reports || 0 }}</span>
            </div>
          </el-card>

          <!-- AI工具 -->
          <el-card class="stat-card">
            <template #header>
              <span>AI工具本月使用</span>
            </template>
            <div class="stat-item">
              <span class="label">使用次数</span>
              <span class="value">{{ overview.ai_tools?.this_month_usage?.length || 0 }}</span>
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- 人口统计 -->
      <el-tab-pane label="人口统计" name="demographics">
        <el-card v-if="demographics">
          <h4>按世代分布</h4>
          <el-table :data="generationRows" stripe size="small">
            <el-table-column prop="generationLabel" label="世代" width="100" />
            <el-table-column prop="total" label="总计" width="80" />
            <el-table-column prop="male" label="男" width="80" />
            <el-table-column prop="female" label="女" width="80" />
            <el-table-column prop="living" label="在世" width="80" />
            <el-table-column prop="deceased" label="已故" width="80" />
          </el-table>

          <h4 style="margin-top: 24px;">按房支分布</h4>
          <el-table :data="branchRows" stripe size="small">
            <el-table-column prop="branchLabel" label="房支" width="100" />
            <el-table-column prop="total" label="总计" width="80" />
            <el-table-column prop="male" label="男" width="80" />
            <el-table-column prop="female" label="女" width="80" />
            <el-table-column prop="living" label="在世" width="80" />
            <el-table-column prop="deceased" label="已故" width="80" />
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- 影像统计 -->
      <el-tab-pane label="影像统计" name="media">
        <el-card v-if="mediaStats">
          <h4>按分类分布</h4>
          <el-table :data="mediaStats.by_category" stripe size="small">
            <el-table-column prop="category" label="分类" />
            <el-table-column prop="count" label="数量" />
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- 迁徙统计 -->
      <el-tab-pane label="迁徙统计" name="migration">
        <el-card v-if="migrationStats">
          <div class="stat-item">
            <span class="label">迁徙事件总数</span>
            <span class="value">{{ migrationStats.total_events || 0 }}</span>
          </div>
          <h4>按年份分布</h4>
          <el-table :data="migrationStats.by_year" stripe size="small">
            <el-table-column prop="year" label="年份" />
            <el-table-column prop="count" label="事件数" />
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.statistics-panel {
  /* 与原 StatisticsPage 保持同样的分列外观 */
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.stat-card {
  margin-bottom: 0;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.stat-item:last-child {
  border-bottom: none;
}

.stat-item .label {
  color: #666;
}

.stat-item .value {
  font-weight: bold;
  font-size: 16px;
}

.stat-item .value.success {
  color: #67c23a;
}

.stat-item .value.warning {
  color: #e6a23c;
}

h4 {
  margin: 16px 0 12px;
  color: #333;
}
</style>