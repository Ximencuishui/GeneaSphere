<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const route = useRoute()
const clanId = computed(() => route.query.clanId || '1')

const overview = ref<any>(null)
const demographics = ref<any>(null)
const mediaStats = ref<any>(null)
const migrationStats = ref<any>(null)
const loading = ref(false)
const activeTab = ref('overview')

const fetchOverview = async () => {
  try {
    const res = await axios.get('/api/admin/statistics/overview', {
      params: { clanId: clanId.value },
    })
    overview.value = res.data
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  }
}

const fetchDemographics = async () => {
  try {
    const res = await axios.get('/api/admin/statistics/demographics', {
      params: { clanId: clanId.value },
    })
    demographics.value = res.data
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  }
}

const fetchMediaStats = async () => {
  try {
    const res = await axios.get('/api/admin/statistics/media', {
      params: { clanId: clanId.value },
    })
    mediaStats.value = res.data
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  }
}

const fetchMigrationStats = async () => {
  try {
    const res = await axios.get('/api/admin/statistics/migration', {
      params: { clanId: clanId.value },
    })
    migrationStats.value = res.data
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  }
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
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
  <div class="statistics-page">
    <div class="page-header">
      <h2>数据统计</h2>
    </div>

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
          <el-table :data="demographics.by_generation" stripe size="small">
            <el-table-column prop="generation" label="世代" />
            <el-table-column prop="total" label="总计" />
            <el-table-column prop="male" label="男" />
            <el-table-column prop="female" label="女" />
            <el-table-column prop="living" label="在世" />
            <el-table-column prop="deceased" label="已故" />
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
.statistics-page {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
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
