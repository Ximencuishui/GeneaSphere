<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isCollapse = ref(false)
const pendingCount = ref(0)

const fetchPendingCount = async () => {
  try {
    const clanId = route.query.clanId || '1'
    const res = await axios.get('/api/admin/dashboard', {
      params: { clanId },
    })
    const stats = res.data.statistics
    pendingCount.value = (stats.pending_media_reviews || 0) + (stats.pending_applications || 0)
  } catch {
    pendingCount.value = 0
  }
}

onMounted(() => {
  fetchPendingCount()
})

const menuItems = ref([
  {
    title: '概况',
    icon: 'Monitor',
    children: [
      { title: '控制面板', path: '/admin/dashboard' },
    ],
  },
  {
    title: '人员管理',
    icon: 'User',
    children: [
      { title: '成员列表', path: '/admin/members' },
      { title: '权限分配', path: '/admin/members?tab=roles' },
    ],
  },
  {
    title: '内容审核',
    icon: 'PictureFilled',
    children: [
      { title: '影像审核', path: '/admin/reviews/media' },
      { title: '生平审核', path: '/admin/reviews/bio' },
    ],
  },
  {
    title: '寻亲管理',
    icon: 'Connection',
    children: [
      { title: '认亲申请', path: '/admin/merge/applications' },
      { title: '寻亲帖管理', path: '/admin/merge/posts' },
    ],
  },
  {
    title: '系统设置',
    icon: 'Setting',
    children: [
      { title: '隐私配置', path: '/admin/settings/privacy' },
      { title: '字辈管理', path: '/admin/settings/xipai' },
      { title: '云存储', path: '/admin/settings/storage' },
    ],
  },
  {
    title: '印刷服务',
    icon: 'Printer',
    children: [
      { title: '订单管理', path: '/admin/orders' },
    ],
  },
  {
    title: '日志审计',
    icon: 'Document',
    children: [
      { title: '操作日志', path: '/admin/logs' },
    ],
  },
])

const activeMenu = computed(() => {
  return route.path
})

const handleLogout = () => {
  authStore.logout()
}
</script>

<template>
  <div class="admin-layout">
    <!-- 侧边栏 -->
    <ElAside :width="isCollapse ? '64px' : '240px'" class="sidebar">
      <div class="sidebar-header">
        <h2 v-if="!isCollapse" class="logo">根脉云谱</h2>
        <h2 v-else class="logo">G</h2>
      </div>
      <ElMenu
        :default-active="activeMenu"
        :collapse="isCollapse"
        background-color="#3A506B"
        text-color="#E0E6ED"
        active-text-color="#FFFFFF"
        :collapse-transition="true"
        router
      >
        <template v-for="item in menuItems" :key="item.title">
          <ElSubMenu :index="item.title">
            <template #title>
              <ElIcon><component :is="item.icon" /></ElIcon>
              <span>{{ item.title }}</span>
            </template>
            <ElMenuItem
              v-for="child in item.children"
              :key="child.path"
              :index="child.path"
            >
              {{ child.title }}
            </ElMenuItem>
          </ElSubMenu>
        </template>
      </ElMenu>
    </ElAside>

    <!-- 主内容区 -->
    <div class="main-area">
      <!-- 顶部栏 -->
      <ElHeader class="top-bar">
        <div class="left-section">
          <ElButton
            :icon="isCollapse ? 'Expand' : 'Fold'"
            @click="isCollapse = !isCollapse"
            text
          />
          <h3 class="page-title">{{ route.meta.title || '控制面板' }}</h3>
        </div>
        <div class="right-section">
          <ElBadge :value="pendingCount" :max="99" :hidden="pendingCount === 0" class="notification-badge">
            <ElButton icon="Bell" circle text />
          </ElBadge>
          <ElDropdown trigger="click">
            <span class="user-info">
              <ElAvatar :size="32" icon="UserFilled" />
              <span class="username">{{ authStore.user?.phone || '管理员' }}</span>
            </span>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem @click="router.push('/admin/settings/privacy')">
                  个人设置
                </ElDropdownItem>
                <ElDropdownItem divided @click="handleLogout">
                  退出登录
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>
      </ElHeader>

      <!-- 内容区 -->
      <ElMain class="content-area">
        <router-view />
      </ElMain>
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  background-color: #3A506B;
  transition: width 0.3s;
  overflow-y: auto;
}

.sidebar-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo {
  color: #FFFFFF;
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #F5F7FA;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #FFFFFF;
  border-bottom: 1px solid #E4E7ED;
  padding: 0 20px;
  height: 60px;
}

.left-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.right-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.notification-badge {
  cursor: pointer;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.username {
  font-size: 14px;
  color: #303133;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
</style>
