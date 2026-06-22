<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { usePlatformAuthStore } from '@/stores/platformAuth'

const route = useRoute()
const authStore = usePlatformAuthStore()

const isCollapse = ref(false)

const menuItems = ref([
  {
    title: '概况',
    icon: 'Monitor',
    children: [
      { title: '平台控制台', path: '/platform-admin/dashboard' },
    ],
  },
  {
    title: '家族管理',
    icon: 'House',
    children: [
      { title: '家族列表', path: '/platform-admin/families' },
    ],
  },
  {
    title: '用户管理',
    icon: 'UserFilled',
    children: [
      { title: '用户列表', path: '/platform-admin/users' },
    ],
  },
  {
    title: '内容审核',
    icon: 'PictureFilled',
    children: [
      { title: '影像审核', path: '/platform-admin/reviews/media' },
      { title: '寻亲帖审核', path: '/platform-admin/reviews/posts' },
    ],
  },
  {
    title: '订单管理',
    icon: 'Tickets',
    children: [
      { title: '印刷订单', path: '/platform-admin/orders/print' },
      { title: '充值订单', path: '/platform-admin/orders/recharge' },
    ],
  },
  {
    title: '系统配置',
    icon: 'Setting',
    children: [
      { title: '定价管理', path: '/platform-admin/settings/pricing' },
      { title: '家族默认配置', path: '/platform-admin/settings/defaults' },
      { title: '全局开关', path: '/platform-admin/settings/switches' },
    ],
  },
  {
    title: '数据统计',
    icon: 'TrendCharts',
    children: [
      { title: '统计报表', path: '/platform-admin/statistics' },
    ],
  },
  {
    title: '日志审计',
    icon: 'Document',
    children: [
      { title: '操作日志', path: '/platform-admin/logs' },
    ],
  },
])

const activeMenu = computed(() => route.path)

const handleLogout = async () => {
  await authStore.logout()
}

onMounted(async () => {
  if (authStore.token) {
    try {
      await authStore.fetchProfile()
    } catch {
      authStore.logout()
    }
  }
})
</script>

<template>
  <div class="platform-layout">
    <ElAside :width="isCollapse ? '64px' : '240px'" class="sidebar">
      <div class="sidebar-header">
        <h2 v-if="!isCollapse" class="logo">平台管理后台</h2>
        <h2 v-else class="logo">GS</h2>
      </div>
      <ElMenu
        :default-active="activeMenu"
        :collapse="isCollapse"
        background-color="#1f3a5f"
        text-color="#cfd6e2"
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

    <div class="main-area">
      <ElHeader class="top-bar">
        <div class="left-section">
          <ElButton
            :icon="isCollapse ? 'Expand' : 'Fold'"
            @click="isCollapse = !isCollapse"
            text
          />
          <h3 class="page-title">{{ route.meta.title || '平台控制台' }}</h3>
        </div>
        <div class="right-section">
          <ElTag type="warning" effect="dark" round>{{ authStore.roleLabel }}</ElTag>
          <ElDropdown trigger="click">
            <span class="user-info">
              <ElAvatar :size="32" icon="UserFilled" />
              <span class="username">{{ authStore.admin?.real_name || authStore.admin?.username || '管理员' }}</span>
            </span>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem @click="handleLogout">
                  退出登录
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>
      </ElHeader>

      <ElMain class="content-area">
        <router-view />
      </ElMain>
    </div>
  </div>
</template>

<style scoped>
.platform-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  background-color: #1f3a5f;
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
  color: #ffffff;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #f5f7fa;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #ffffff;
  border-bottom: 1px solid #e4e7ed;
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

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #303133;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
</style>
