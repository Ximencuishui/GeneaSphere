<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserCenterStore } from '@/stores/userCenter'

const router = useRouter()
const userStore = useUserCenterStore()

const families = computed(() => userStore.profile?.families || [])
const stats = computed(() => userStore.profile?.stats)

function roleTagType(role?: string) {
  switch (role) {
    case 'OWNER':
      return 'danger'
    case 'ADMIN':
      return 'warning'
    case 'EDITOR':
      return 'primary'
    default:
      return 'info'
  }
}

function roleLabel(role?: string) {
  switch (role) {
    case 'OWNER':
      return '所有者'
    case 'ADMIN':
      return '管理员'
    case 'EDITOR':
      return '编辑者'
    case 'VIEWER':
      return '观察员'
    default:
      return '成员'
  }
}

function gotoClan(id: string) {
  router.push(`/clans/${id}`)
}

function gotoTree(id: string) {
  router.push(`/tree/${id}`)
}

onMounted(async () => {
  await userStore.fetchProfile()
})
</script>

<template>
  <div class="families-page">
    <ElCard v-loading="userStore.loading">
      <template #header>
        <div class="header">
          <h2 class="page-title">我的家族</h2>
          <span class="header-meta">共 {{ families.length }} 个家族</span>
        </div>
      </template>

      <!-- 数据汇总 -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-num">{{ stats?.photo_count ?? 0 }}</div>
          <div class="stat-label">上传照片</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ stats?.annotation_count ?? 0 }}</div>
          <div class="stat-label">照片标注</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ stats?.order_count ?? 0 }}</div>
          <div class="stat-label">印刷订单</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ stats?.group_count ?? 0 }}</div>
          <div class="stat-label">加入小组</div>
        </div>
      </div>

      <!-- 家族卡片 -->
      <div v-if="families.length > 0" class="family-grid">
        <div
          v-for="family in families"
          :key="family.id"
          class="family-card"
          @click="gotoClan(family.id)"
        >
          <div class="family-card-header">
            <div class="family-icon">
              <ElIcon :size="20" color="#fff"><OfficeBuilding /></ElIcon>
            </div>
            <ElTag :type="roleTagType(family.role) as any" size="small" effect="light">
              {{ roleLabel(family.role) }}
            </ElTag>
          </div>
          <h3 class="family-name">{{ family.name }}</h3>
          <p class="family-desc">
            {{ family.description || '暂无简介' }}
          </p>
          <div class="family-footer">
            <span class="meta-item">
              <ElIcon><Clock /></ElIcon>
              {{ new Date(family.last_active_at || family.joined_at || '').toLocaleDateString() }}
            </span>
            <div class="family-actions">
              <ElButton
                size="small"
                type="primary"
                plain
                @click.stop="gotoTree(family.id)"
              >
                查看族谱
              </ElButton>
            </div>
          </div>
        </div>
      </div>

      <ElEmpty
        v-else
        description="您尚未加入任何家族"
      >
        <ElButton type="primary" @click="router.push('/clans')">
          去浏览家族
        </ElButton>
      </ElEmpty>
    </ElCard>
  </div>
</template>

<style scoped>
.families-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-meta {
  font-size: 13px;
  color: #909399;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: linear-gradient(135deg, #fff5f0, #fff);
  border: 1px solid #f0e6dd;
  border-radius: 10px;
  padding: 18px;
  text-align: center;
}

.stat-num {
  font-size: 28px;
  font-weight: 700;
  color: #5d4037;
}

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.family-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.family-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.family-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(93, 64, 55, 0.08);
  border-color: #d7ccc8;
}

.family-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.family-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(135deg, #5d4037, #8d6e63);
  display: flex;
  align-items: center;
  justify-content: center;
}

.family-name {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #303133;
}

.family-desc {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.family-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #f0f2f5;
  padding-top: 12px;
}

.meta-item {
  font-size: 12px;
  color: #909399;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.family-actions {
  display: flex;
  gap: 8px;
}
</style>