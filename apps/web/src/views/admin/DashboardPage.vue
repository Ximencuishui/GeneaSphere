<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

const route = useRoute()

const clanId = ref('')
const loading = ref(false)
const statistics = ref({
  total_members: 0,
  living_count: 0,
  photo_count: 0,
  storage_used: 0,
  storage_percentage: 0,
  pending_media_reviews: 0,
  pending_applications: 0,
})
const recentReviews = ref<any[]>([])

const fetchDashboard = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/dashboard', {
      params: { clanId: clanId.value },
    })
    statistics.value = res.data.statistics
    recentReviews.value = res.data.recent_reviews || []
  } catch (error) {
    console.error('Failed to fetch dashboard:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 从 URL 或 store 获取 clanId
  clanId.value = route.query.clanId as string || '1'
  fetchDashboard()
})
</script>

<template>
  <div class="dashboard-page">
    <ElCard class="welcome-card">
      <template #header>
        <div class="card-header">
          <h2>欢迎回来</h2>
          <ElButton type="primary" @click="$router.push('/admin/members')">
            管理成员
          </ElButton>
        </div>
      </template>
      <p>今天是 {{ new Date().toLocaleDateString() }}，您有
        <ElText type="danger">{{ statistics.pending_media_reviews + statistics.pending_applications }}</ElText>
        项待办事项。
      </p>
    </ElCard>

    <!-- 统计卡片 -->
    <ElRow :gutter="20" class="stats-row">
      <ElCol :span="6">
        <ElCard class="stat-card" shadow="hover" @click="$router.push('/tree/' + clanId)">
          <div class="stat-content">
            <div class="stat-icon" style="background-color: #409EFF;">
              <ElIcon :size="32"><UserFilled /></ElIcon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.total_members }}</div>
              <div class="stat-label">总人数</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :span="6">
        <ElCard class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-icon" style="background-color: #67C23A;">
              <ElIcon :size="32"><SuccessFilled /></ElIcon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.living_count }}</div>
              <div class="stat-label">在世人数</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :span="6">
        <ElCard class="stat-card" shadow="hover" @click="$router.push('/admin/reviews/media')">
          <div class="stat-content">
            <div class="stat-icon" style="background-color: #E6A23C;">
              <ElIcon :size="32"><PictureFilled /></ElIcon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.photo_count }}</div>
              <div class="stat-label">照片总数</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :span="6">
        <ElCard class="stat-card" shadow="hover" @click="$router.push('/admin/reviews/media')">
          <div class="stat-content">
            <div class="stat-icon" style="background-color: #F56C6C;">
              <ElIcon :size="32"><BellFilled /></ElIcon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.pending_media_reviews }}</div>
              <div class="stat-label">待审影像</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- 存储用量 -->
    <ElRow :gutter="20" class="stats-row">
      <ElCol :span="12">
        <ElCard class="stat-card">
          <template #header>
            <span>存储用量</span>
          </template>
          <ElProgress
            type="dashboard"
            :percentage="statistics.storage_percentage"
            :color="statistics.storage_percentage > 80 ? '#F56C6C' : '#409EFF'"
          />
          <div class="storage-info">
            <p>已用: {{ (statistics.storage_used / 1024 / 1024 / 1024).toFixed(2) }} GB</p>
            <p>总量: 5 GB</p>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :span="12">
        <ElCard class="stat-card">
          <template #header>
            <span>快速入口</span>
          </template>
          <ElButton type="primary" @click="$router.push('/admin/settings/privacy')">
            隐私配置
          </ElButton>
          <ElButton type="primary" @click="$router.push('/admin/settings/xipai')">
            字辈管理
          </ElButton>
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- 待办列表 -->
    <ElCard class="todo-card">
      <template #header>
        <span>待办事项</span>
      </template>
      <ElTable :data="recentReviews" v-loading="loading">
        <ElTableColumn prop="media_url" label="缩略图" width="100">
          <template #default="{ row }">
            <ElImage :src="row.media_url" :preview-src-list="[row.media_url]" class="thumbnail" />
          </template>
        </ElTableColumn>
        <ElTableColumn prop="uploader_id" label="上传者" />
        <ElTableColumn prop="created_at" label="上传时间">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleDateString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="200">
          <template #default="{ row }">
            <ElButton type="primary" size="small" @click="$router.push('/admin/reviews/media')">
              审核
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-if="!loading && recentReviews.length === 0" description="暂无待办事项，一切井然有序" />
    </ElCard>
  </div>
</template>

<style scoped>
.dashboard-page {
  max-width: 1400px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h2 {
  margin: 0;
}

.stats-row {
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
  width: 64px;
  height: 64px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}

.storage-info {
  text-align: center;
  margin-top: 16px;
}

.todo-card {
  margin-top: 20px;
}

.thumbnail {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}
</style>
