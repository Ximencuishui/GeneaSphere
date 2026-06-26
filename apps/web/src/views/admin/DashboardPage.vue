<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const clanSlug = ref('')
const loading = ref(false)

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

// 多种待办类型（依据需求 4.1）
interface MediaReviewTodo {
  id: string
  media_id: string
  media_url: string
  uploader_id: string
  created_at: string
  link: string
}
interface BioReviewTodo {
  id: string
  person_id: string
  person_name: string
  title: string
  author_phone: string
  created_at: string
  link: string
}
interface MergeApplicationTodo {
  id: string
  applicant_id: string
  applicant_phone: string
  origin_place: string
  ancestor_name: string | null
  match_score: number | null
  created_at: string
  link: string
}

const todos = ref<{
  media_reviews: MediaReviewTodo[]
  bio_reviews: BioReviewTodo[]
  merge_applications: MergeApplicationTodo[]
}>({
  media_reviews: [],
  bio_reviews: [],
  merge_applications: [],
})

const fetchDashboard = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/dashboard', {
      params: { clanSlug: clanId.value },
    })
    statistics.value = res.data.statistics
    todos.value = res.data.todos || {
      media_reviews: [],
      bio_reviews: [],
      merge_applications: [],
    }
  } catch (error) {
    console.error('Failed to fetch dashboard:', error)
  } finally {
    loading.value = false
  }
}

// 待办总条数
const totalTodoCount = computed(
  () =>
    statistics.value.pending_media_reviews +
    statistics.value.pending_bio_reviews +
    statistics.value.pending_applications,
)

// 是否完全无待办
const hasAnyTodo = computed(() => totalTodoCount.value > 0)

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

const goMediaReviews = () => router.push(`/zupu/${clanSlug}//admin/reviews/media`)
const goBioReviews = () => router.push(`/zupu/${clanSlug}//admin/reviews/bio`)
const goMergeApplications = () => router.push(`/zupu/${clanSlug}//admin/merge/applications`)

const navigateTo = (link: string) => {
  if (link) router.push(link)
}

onMounted(() => {
  clanId.value = (route.params.slug as string) || '1'
  fetchDashboard()
})

// 获取当前用户名
const userName = computed(() => {
  return authStore.user?.phone || '管理员'
})
</script>

<template>
  <div class="dashboard-page">
    <ElCard class="welcome-card" v-loading="loading">
      <template #header>
        <div class="card-header">
          <div class="welcome-info">
            <h2>欢迎回来，{{ userName }}</h2>
            <p class="welcome-date">{{ new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) }}</p>
          </div>
          <ElButton type="primary" size="large" @click="$router.push(`/zupu/${clanSlug}//admin/members`)">
            管理成员
          </ElButton>
        </div>
      </template>
      <div class="welcome-stats">
        <div class="welcome-stat-item">
          <span class="welcome-stat-num">{{ totalTodoCount }}</span>
          <span class="welcome-stat-label">待办事项</span>
        </div>
        <div class="welcome-stat-item">
          <span class="welcome-stat-num">{{ statistics.total_members }}</span>
          <span class="welcome-stat-label">家族成员</span>
        </div>
        <div class="welcome-stat-item">
          <span class="welcome-stat-num">{{ statistics.photo_count }}</span>
          <span class="welcome-stat-label">家族影像</span>
        </div>
        <div class="welcome-stat-item">
          <span class="welcome-stat-num">{{ (statistics.storage_used / 1024 / 1024 / 1024).toFixed(1) }}G</span>
          <span class="welcome-stat-label">已用存储</span>
        </div>
      </div>
    </ElCard>

    <!-- 统计卡片 -->
    <ElRow :gutter="20" class="stats-row">
      <ElCol :xs="12" :sm="6">
        <ElCard class="stat-card" shadow="hover" @click="$router.push('/tree/' + clanSlug)">
          <div class="stat-content">
            <div class="stat-icon" style="background: linear-gradient(135deg, #409EFF, #337ECC);">
              <ElIcon :size="28"><UserFilled /></ElIcon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.total_members }}</div>
              <div class="stat-label">族谱树</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="6">
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
      <ElCol :xs="12" :sm="6">
        <ElCard class="stat-card" shadow="hover" @click="goMediaReviews">
          <div class="stat-content">
            <div class="stat-icon" style="background: linear-gradient(135deg, #E6A23C, #C98A2E);">
              <ElIcon :size="28"><PictureFilled /></ElIcon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.photo_count }}</div>
              <div class="stat-label">照片总数</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="6">
        <ElCard class="stat-card" shadow="hover" @click="goMediaReviews">
          <div class="stat-content">
            <div class="stat-icon" style="background: linear-gradient(135deg, #F56C6C, #D9534F);">
              <ElIcon :size="28"><WarningFilled /></ElIcon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ totalTodoCount }}</div>
              <div class="stat-label">待办总数</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- 存储用量 + 快速入口 -->
    <ElRow :gutter="20" class="stats-row">
      <ElCol :xs="24" :md="12">
        <ElCard class="section-card">
          <template #header>
            <div class="section-header">
              <span>存储用量</span>
              <ElTag :type="statistics.storage_percentage > 80 ? 'danger' : 'info'" size="small">
                {{ statistics.storage_percentage }}%
              </ElTag>
            </div>
          </template>
          <ElProgress
            :percentage="statistics.storage_percentage"
            :stroke-width="12"
            :color="statistics.storage_percentage > 80 ? '#F56C6C' : '#409EFF'"
          />
          <div class="storage-detail">
            <div class="storage-item">
              <span class="storage-label">已使用</span>
              <span class="storage-value">{{ (statistics.storage_used / 1024 / 1024 / 1024).toFixed(2) }} GB</span>
            </div>
            <div class="storage-item">
              <span class="storage-label">总容量</span>
              <span class="storage-value">5 GB</span>
            </div>
            <div class="storage-item">
              <span class="storage-label">剩余</span>
              <span class="storage-value">{{ (5 - statistics.storage_used / 1024 / 1024 / 1024).toFixed(2) }} GB</span>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :md="12">
        <ElCard class="section-card">
          <template #header>
            <span>快速入口</span>
          </template>
          <div class="quick-grid">
            <div class="quick-item" @click="$router.push(`/zupu/${clanSlug}//admin/settings/privacy`)">
              <div class="quick-icon" style="background: #ECF5FF; color: #409EFF;">
                <ElIcon :size="22"><Lock /></ElIcon>
              </div>
              <span class="quick-text">隐私配置</span>
            </div>
            <div class="quick-item" @click="$router.push(`/zupu/${clanSlug}//admin/settings/xipai`)">
              <div class="quick-icon" style="background: #FDF6EC; color: #E6A23C;">
                <ElIcon :size="22"><EditPen /></ElIcon>
              </div>
              <span class="quick-text">字辈管理</span>
            </div>
            <div class="quick-item" @click="goBioReviews">
              <div class="quick-icon" style="background: #F0F9EB; color: #67C23A;">
                <ElIcon :size="22"><DocumentChecked /></ElIcon>
                <span v-if="statistics.pending_bio_reviews > 0" class="quick-badge">{{ statistics.pending_bio_reviews }}</span>
              </div>
              <span class="quick-text">生平审核</span>
            </div>
            <div class="quick-item" @click="goMergeApplications">
              <div class="quick-icon" style="background: #FEF0F0; color: #F56C6C;">
                <ElIcon :size="22"><Connection /></ElIcon>
                <span v-if="statistics.pending_applications > 0" class="quick-badge">{{ statistics.pending_applications }}</span>
              </div>
              <span class="quick-text">寻亲申请</span>
            </div>
            <div class="quick-item" @click="$router.push(`/zupu/${clanSlug}//admin/settings/storage`)">
              <div class="quick-icon" style="background: #F4F4F5; color: #909399;">
                <ElIcon :size="22"><FolderOpened /></ElIcon>
              </div>
              <span class="quick-text">云存储</span>
            </div>
            <div class="quick-item" @click="$router.push(`/zupu/${clanSlug}//admin/orders`)">
              <div class="quick-icon" style="background: #F4F4F5; color: #909399;">
                <ElIcon :size="22"><Printer /></ElIcon>
              </div>
              <span class="quick-text">印刷订单</span>
            </div>
            <div class="quick-item" @click="$router.push(`/zupu/${clanSlug}//admin/sms/send`)">
              <div class="quick-icon" style="background: #F0F9EB; color: #67C23A;">
                <ElIcon :size="22"><Message /></ElIcon>
              </div>
              <span class="quick-text">发送短信</span>
            </div>
            <div class="quick-item" @click="$router.push(`/zupu/${clanSlug}//admin/sms/balance`)">
              <div class="quick-icon" style="background: #FEF0F0; color: #E6A23C;">
                <ElIcon :size="22"><Wallet /></ElIcon>
              </div>
              <span class="quick-text">短信余额</span>
            </div>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- 待办事项：影像、生平、寻亲申请 -->
    <ElCard class="todo-card">
      <template #header>
        <div class="todo-header">
          <span>待办事项</span>
          <span class="todo-summary">
            影像 {{ statistics.pending_media_reviews }} ·
            生平 {{ statistics.pending_bio_reviews }} ·
            寻亲 {{ statistics.pending_applications }}
          </span>
        </div>
      </template>

      <!-- 待办为空时显示空状态文案 -->
      <ElEmpty
        v-if="!loading && !hasAnyTodo"
        description="暂无待办事项，一切井然有序"
      />

      <!-- 影像待办 -->
      <template v-else>
        <div v-if="todos.media_reviews.length > 0" class="todo-section">
          <h4 class="todo-title">
            待审影像
            <ElTag size="small" type="warning">
              {{ todos.media_reviews.length }}
            </ElTag>
            <ElButton text type="primary" size="small" @click="goMediaReviews">
              查看全部
            </ElButton>
          </h4>
          <ElTable :data="todos.media_reviews" stripe size="small">
            <ElTableColumn label="缩略图" width="100">
              <template #default="{ row }">
                <ElImage
                  :src="row.media_url"
                  :preview-src-list="[row.media_url]"
                  class="thumbnail"
                />
              </template>
            </ElTableColumn>
            <ElTableColumn prop="uploader_id" label="上传者" />
            <ElTableColumn label="上传时间" width="160">
              <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
            </ElTableColumn>
            <ElTableColumn label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <ElButton type="primary" size="small" @click="navigateTo(row.link)">
                  去审核
                </ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </div>

        <!-- 生平待办 -->
        <div v-if="todos.bio_reviews.length > 0" class="todo-section">
          <h4 class="todo-title">
            待审生平
            <ElTag size="small" type="warning">{{ todos.bio_reviews.length }}</ElTag>
            <ElButton text type="primary" size="small" @click="goBioReviews">
              查看全部
            </ElButton>
          </h4>
          <ElTable :data="todos.bio_reviews" stripe size="small">
            <ElTableColumn prop="title" label="标题" min-width="180" />
            <ElTableColumn prop="person_name" label="关联人物" width="120" />
            <ElTableColumn prop="author_phone" label="作者" width="150" />
            <ElTableColumn label="提交时间" width="160">
              <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
            </ElTableColumn>
            <ElTableColumn label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <ElButton type="primary" size="small" @click="navigateTo(row.link)">
                  去审核
                </ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </div>

        <!-- 寻亲申请待办 -->
        <div v-if="todos.merge_applications.length > 0" class="todo-section">
          <h4 class="todo-title">
            待处理寻亲申请
            <ElTag size="small" type="warning">
              {{ todos.merge_applications.length }}
            </ElTag>
            <ElButton text type="primary" size="small" @click="goMergeApplications">
              查看全部
            </ElButton>
          </h4>
          <ElTable :data="todos.merge_applications" stripe size="small">
            <ElTableColumn prop="applicant_phone" label="申请人" width="160" />
            <ElTableColumn prop="origin_place" label="祖籍" min-width="120" />
            <ElTableColumn prop="ancestor_name" label="自称祖先" width="140" />
            <ElTableColumn label="匹配度" width="100">
              <template #default="{ row }">
                <ElTag v-if="row.match_score !== null && row.match_score !== undefined" :type="row.match_score > 50 ? 'success' : 'info'">
                  {{ row.match_score }}%
                </ElTag>
                <span v-else>-</span>
              </template>
            </ElTableColumn>
            <ElTableColumn label="提交时间" width="140">
              <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
            </ElTableColumn>
            <ElTableColumn label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <ElButton type="primary" size="small" @click="navigateTo(row.link)">
                  处理
                </ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </div>
      </template>
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

.welcome-info h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
}

.welcome-date {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.welcome-stats {
  display: flex;
  gap: 32px;
  margin-top: 8px;
}

.welcome-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.welcome-stat-num {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
}

.welcome-stat-label {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
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

.section-card {
  height: 100%;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.storage-detail {
  display: flex;
  justify-content: space-around;
  margin-top: 16px;
  text-align: center;
}

.storage-item {
  display: flex;
  flex-direction: column;
}

.storage-label {
  font-size: 12px;
  color: #909399;
}

.storage-value {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-top: 4px;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 12px 8px;
  border-radius: 8px;
  transition: background-color 0.2s;
}

.quick-item:hover {
  background-color: #F5F7FA;
}

.quick-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.quick-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  font-size: 11px;
  text-align: center;
  background: #F56C6C;
  color: #FFF;
  border-radius: 9px;
  padding: 0 4px;
}

.quick-text {
  font-size: 13px;
  color: #606266;
}

.todo-card {
  margin-top: 20px;
}

.todo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.todo-summary {
  font-size: 13px;
  color: #909399;
}

.todo-section {
  margin-bottom: 24px;
}

.todo-section:last-child {
  margin-bottom: 0;
}

.todo-title {
  margin: 0 0 12px 0;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.thumbnail {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .welcome-stats {
    gap: 16px;
    flex-wrap: wrap;
  }

  .quick-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .stat-value {
    font-size: 22px;
  }

  .stat-icon {
    width: 44px;
    height: 44px;
  }
}
</style>