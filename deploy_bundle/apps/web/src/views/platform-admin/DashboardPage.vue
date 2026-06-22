<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { usePlatformAuthStore } from '@/stores/platformAuth'

const router = useRouter()
const authStore = usePlatformAuthStore()

const loading = ref(false)
const stats = ref<any>({
  totals: {
    families: 0, users: 0, media: 0, storage_bytes: 0,
    pending_clans: 0, pending_media: 0, pending_posts: 0, refund_requests: 0,
  },
  today: { new_families: 0, new_users: 0, new_media: 0, new_orders: 0 },
  revenue: { this_month: 0, last_month: 0, growth_rate: 0 },
  trends: { users_7d: [], revenue_7d: [] },
})

const storageGb = computed(() => (stats.value.totals.storage_bytes / 1024 / 1024 / 1024).toFixed(2))
const growthSign = computed(() => {
  const r = stats.value.revenue.growth_rate
  if (r > 0) return `+${r}%`
  if (r < 0) return `${r}%`
  return '0%'
})
const growthType = computed(() => {
  const r = stats.value.revenue.growth_rate
  if (r > 0) return 'success'
  if (r < 0) return 'danger'
  return 'info'
})

const fetchStats = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/platform/dashboard/stats')
    stats.value = res.data
  } catch (err) {
    console.error('获取平台统计数据失败', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchStats()
})
</script>

<template>
  <div class="platform-dashboard">
    <ElCard class="welcome-card" shadow="hover">
      <div class="welcome">
        <div>
          <h2>欢迎回来，{{ authStore.admin?.real_name || authStore.admin?.username || '管理员' }}</h2>
          <p class="muted">今天是 {{ new Date().toLocaleDateString() }}，平台运行一切正常</p>
        </div>
        <ElButton type="primary" @click="fetchStats">刷新数据</ElButton>
      </div>
    </ElCard>

    <ElRow :gutter="20" class="stat-row" v-loading="loading">
      <ElCol :span="6">
        <ElCard class="stat-card" shadow="hover" @click="router.push('/platform-admin/families')">
          <div class="stat-content">
            <div class="stat-icon" style="background: #409EFF;">
              <span>家</span>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totals.families.toLocaleString() }}</div>
              <div class="stat-label">总家族数</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :span="6">
        <ElCard class="stat-card" shadow="hover" @click="router.push('/platform-admin/users')">
          <div class="stat-content">
            <div class="stat-icon" style="background: #67C23A;">
              <span>人</span>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totals.users.toLocaleString() }}</div>
              <div class="stat-label">总用户数</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :span="6">
        <ElCard class="stat-card" shadow="hover" @click="router.push('/platform-admin/reviews/media')">
          <div class="stat-content">
            <div class="stat-icon" style="background: #E6A23C;">
              <span>照</span>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totals.media.toLocaleString() }}</div>
              <div class="stat-label">总照片数</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :span="6">
        <ElCard class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-icon" style="background: #909399;">
              <span>T</span>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ storageGb }} GB</div>
              <div class="stat-label">总存储用量</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>

    <ElRow :gutter="20" class="stat-row" v-loading="loading">
      <ElCol :span="6">
        <ElCard class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-icon" style="background: #F56C6C;">
              <span>家</span>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totals.pending_clans }}</div>
              <div class="stat-label">待审核家族</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :span="6">
        <ElCard class="stat-card" shadow="hover" @click="router.push('/platform-admin/reviews/media')">
          <div class="stat-content">
            <div class="stat-icon" style="background: #F56C6C;">
              <span>影</span>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totals.pending_media }}</div>
              <div class="stat-label">待审影像</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :span="6">
        <ElCard class="stat-card" shadow="hover" @click="router.push('/platform-admin/reviews/posts')">
          <div class="stat-content">
            <div class="stat-icon" style="background: #F56C6C;">
              <span>帖</span>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totals.pending_posts }}</div>
              <div class="stat-label">待审寻亲帖</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :span="6">
        <ElCard class="stat-card" shadow="hover" @click="router.push('/platform-admin/orders/print')">
          <div class="stat-content">
            <div class="stat-icon" style="background: #F56C6C;">
              <span>退</span>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totals.refund_requests }}</div>
              <div class="stat-label">待退款</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>

    <ElRow :gutter="20" class="stat-row" v-loading="loading">
      <ElCol :span="8">
        <ElCard class="trend-card" shadow="hover">
          <template #header>
            <span>本月收入概览</span>
          </template>
          <div class="revenue-block">
            <div class="revenue-value">¥{{ Number(stats.revenue.this_month).toFixed(2) }}</div>
            <ElTag :type="growthType" effect="dark">环比 {{ growthSign }}</ElTag>
            <div class="muted">上月：¥{{ Number(stats.revenue.last_month).toFixed(2) }}</div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :span="8">
        <ElCard class="trend-card" shadow="hover">
          <template #header>
            <span>今日新增</span>
          </template>
          <div class="today-block">
            <div><strong>{{ stats.today.new_families }}</strong> 家族</div>
            <div><strong>{{ stats.today.new_users }}</strong> 用户</div>
            <div><strong>{{ stats.today.new_media }}</strong> 照片</div>
            <div><strong>{{ stats.today.new_orders }}</strong> 订单</div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :span="8">
        <ElCard class="trend-card" shadow="hover">
          <template #header>
            <span>近 7 天趋势</span>
          </template>
          <div class="trend-simple">
            <div class="muted">用户增长</div>
            <div class="trend-values">
              <span v-for="(d, idx) in stats.trends.users_7d" :key="`u${idx}`" class="trend-bar" :title="`${d.date}: ${d.count}人`">
                <span class="bar" :style="{ height: Math.min(d.count * 8, 60) + 'px' }"></span>
                <span class="bar-label">{{ d.date.slice(5) }}</span>
              </span>
            </div>
            <div class="muted" style="margin-top: 8px;">日收入</div>
            <div class="trend-values">
              <span v-for="(d, idx) in stats.trends.revenue_7d" :key="`r${idx}`" class="trend-bar" :title="`${d.date}: ¥${d.amount}`">
                <span class="bar bar-revenue" :style="{ height: Math.min(d.amount * 2, 60) + 'px' }"></span>
                <span class="bar-label">{{ d.date.slice(5) }}</span>
              </span>
            </div>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>
  </div>
</template>

<style scoped>
.platform-dashboard {
  max-width: 1400px;
  margin: 0 auto;
}

.welcome-card {
  margin-bottom: 20px;
}

.welcome {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.welcome h2 {
  margin: 0 0 4px;
  color: #1f3a5f;
}

.muted {
  color: #909399;
  font-size: 13px;
}

.stat-row {
  margin-bottom: 4px;
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
  font-size: 22px;
  font-weight: 700;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

.trend-card {
  height: 100%;
}

.revenue-block {
  text-align: center;
}

.revenue-value {
  font-size: 32px;
  font-weight: 700;
  color: #1f3a5f;
  margin-bottom: 8px;
}

.today-block {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  font-size: 14px;
  color: #5a6678;
}

.today-block strong {
  color: #1f3a5f;
  font-size: 18px;
  margin-right: 4px;
}

.trend-simple {
  font-size: 13px;
}

.trend-values {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 70px;
  margin-top: 6px;
}

.trend-bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.bar {
  width: 14px;
  background: linear-gradient(180deg, #409eff 0%, #79bbff 100%);
  border-radius: 3px 3px 0 0;
  min-height: 2px;
}

.bar-revenue {
  background: linear-gradient(180deg, #67c23a 0%, #95d475 100%);
}

.bar-label {
  font-size: 10px;
  color: #909399;
}
</style>
