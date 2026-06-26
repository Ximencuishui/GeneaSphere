<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

interface AdminClan {
  id: string
  slug: string
  name: string
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'
  is_owner: boolean
}

const router = useRouter()
const auth = useAuthStore()
const clans = ref<AdminClan[]>([])
const loading = ref(false)

const fetchAdminClans = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/auth/me/admin-clans')
    clans.value = res.data.clans || []
  } catch (error: any) {
    console.error('Failed to fetch admin clans:', error)
    // 401 表明 token 过期 / 无效：触发退出走路由跳到 /login
    if (error?.response?.status === 401) {
      auth.logout()
    }
  } finally {
    loading.value = false
  }
}

const selectClan = (clan: AdminClan) => {
  router.push(`/zupu/${clan.slug}/dashboard`)
}

onMounted(() => {
  fetchAdminClans()
})
</script>

<template>
  <div class="select-family-page">
    <div class="select-family-container">
      <h1 class="page-title">选择家族</h1>
      <p class="page-desc">您管理着多个家族，请选择要进入的后台</p>

      <div v-loading="loading" class="clans-grid">
        <div
          v-for="clan in clans"
          :key="clan.id"
          class="clan-card"
          @click="selectClan(clan)"
        >
          <div class="clan-card-header">
            <h3 class="clan-name">{{ clan.name }}</h3>
            <el-tag v-if="clan.is_owner" type="warning" size="small">所有者</el-tag>
            <el-tag v-else type="info" size="small">{{ clan.role }}</el-tag>
          </div>
          <div class="clan-card-body">
            <div class="clan-slug">/{{ clan.slug }}</div>
            <el-button type="primary" size="small">进入后台 →</el-button>
          </div>
        </div>

        <el-empty
          v-if="!loading && clans.length === 0"
          description="您当前没有管理任何家族"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.select-family-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 40px 20px;
}

.select-family-container {
  width: 100%;
  max-width: 900px;
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px 0;
  color: #303133;
  text-align: center;
}

.page-desc {
  text-align: center;
  color: #909399;
  margin: 0 0 32px 0;
  font-size: 14px;
}

.clans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.clan-card {
  padding: 20px;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.clan-card:hover {
  border-color: #409eff;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
  transform: translateY(-2px);
}

.clan-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.clan-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.clan-card-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.clan-slug {
  color: #909399;
  font-size: 13px;
  font-family: monospace;
}

@media (max-width: 640px) {
  .select-family-container {
    padding: 24px;
  }
  .page-title {
    font-size: 22px;
  }
}
</style>