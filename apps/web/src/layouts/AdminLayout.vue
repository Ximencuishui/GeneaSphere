<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isCollapse = ref(false)
const pendingCount = ref(0)
// 通知面板显示状态
const notifyVisible = ref(false)

// 待办数据
const pendingTodos = ref<{
  media_count: number
  bio_count: number
  merge_count: number
}>({ media_count: 0, bio_count: 0, merge_count: 0 })

const fetchPendingCount = async () => {
  try {
    const clanId = route.query.clanId || '1'
    const res = await axios.get('/api/admin/dashboard', {
      params: { clanId },
    })
    const stats = res.data.statistics
    pendingCount.value = (stats.pending_media_reviews || 0) + (stats.pending_bio_reviews || 0) + (stats.pending_applications || 0)
    pendingTodos.value = {
      media_count: stats.pending_media_reviews || 0,
      bio_count: stats.pending_bio_reviews || 0,
      merge_count: stats.pending_applications || 0,
    }
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
      { title: '族谱树', path: '/tree/1' },
    ],
  },
  {
    title: '人员管理',
    icon: 'User',
    children: [
      { title: '成员列表', path: '/admin/members' },
      { title: '权限分配', path: '/admin/members?tab=roles' },
      { title: '邀请二维码', path: '/admin/invite/qrcodes' },
      { title: '验证记录', path: '/admin/invite/records' },
      { title: '信息修改审核', path: '/admin/invite/reviews' },
      { title: '家庭关系变更审核', path: '/admin/family-relation/reviews' },
      { title: '子女归属争议', path: '/admin/family-relation/disputes' },
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
    title: '短信通知',
    icon: 'Message',
    children: [
      { title: '发送短信', path: '/admin/sms/send' },
      { title: '余额管理', path: '/admin/sms/balance' },
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

// 根据当前路由自动展开对应的父级菜单
const openedMenus = ref<string[]>([])
const updateOpenedMenus = () => {
  const currentPath = route.path
  for (const item of menuItems.value) {
    for (const child of item.children) {
      if (child.path === currentPath || currentPath.startsWith(child.path + '?')) {
        if (!openedMenus.value.includes(item.title)) {
          openedMenus.value = [item.title]
        }
        return
      }
    }
  }
}
watch(() => route.path, updateOpenedMenus, { immediate: true })

const activeMenu = computed(() => {
  // 处理带 query 的路由，如 /admin/members?tab=roles
  const path = route.path
  const tab = route.query.tab
  if (tab === 'roles') return '/admin/members?tab=roles'
  return path
})

// 生成面包屑
const breadcrumbs = computed(() => {
  const crumbs: { title: string; path?: string }[] = []
  const currentPath = route.path
  for (const item of menuItems.value) {
    for (const child of item.children) {
      const childBase = child.path.split('?')[0]
      if (currentPath === child.path || currentPath.startsWith(childBase + '/') || currentPath === childBase) {
        crumbs.push({ title: item.title })
        crumbs.push({ title: child.title, path: child.path })
        return crumbs
      }
    }
  }
  // fallback: 使用路由 meta title
  const metaTitle = route.meta.title as string
  if (metaTitle) {
    crumbs.push({ title: metaTitle })
  }
  return crumbs
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
        <h2 v-if="!isCollapse" class="logo">寻根路 · xungenlu.cn</h2>
        <h2 v-else class="logo">寻</h2>
      </div>
      <ElMenu
        :default-active="activeMenu"
        :default-openeds="openedMenus"
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
          <ElBreadcrumb separator="/" class="breadcrumb">
            <ElBreadcrumbItem :to="{ path: '/admin/dashboard' }">
              <ElIcon><HomeFilled /></ElIcon>
            </ElBreadcrumbItem>
            <ElBreadcrumbItem
              v-for="(crumb, idx) in breadcrumbs"
              :key="idx"
              :to="crumb.path ? { path: crumb.path } : undefined"
            >
              {{ crumb.title }}
            </ElBreadcrumbItem>
          </ElBreadcrumb>
        </div>
        <div class="right-section">
          <ElPopover
            v-model:visible="notifyVisible"
            placement="bottom"
            :width="320"
            trigger="click"
          >
            <template #reference>
              <ElBadge :value="pendingCount" :max="99" :hidden="pendingCount === 0" class="notification-badge">
                <ElButton icon="Bell" circle />
              </ElBadge>
            </template>
            <div class="notify-panel">
              <h4 class="notify-title">待办事项</h4>
              <div v-if="pendingCount === 0" class="notify-empty">暂无待办事项</div>
              <div v-else class="notify-list">
                <div
                  v-if="pendingTodos.media_count > 0"
                  class="notify-item"
                  @click="router.push('/admin/reviews/media'); notifyVisible = false"
                >
                  <ElIcon color="#E6A23C"><PictureFilled /></ElIcon>
                  <span>待审影像</span>
                  <ElTag size="small" type="warning">{{ pendingTodos.media_count }}</ElTag>
                </div>
                <div
                  v-if="pendingTodos.bio_count > 0"
                  class="notify-item"
                  @click="router.push('/admin/reviews/bio'); notifyVisible = false"
                >
                  <ElIcon color="#409EFF"><Document /></ElIcon>
                  <span>待审生平</span>
                  <ElTag size="small" type="warning">{{ pendingTodos.bio_count }}</ElTag>
                </div>
                <div
                  v-if="pendingTodos.merge_count > 0"
                  class="notify-item"
                  @click="router.push('/admin/merge/applications'); notifyVisible = false"
                >
                  <ElIcon color="#67C23A"><Connection /></ElIcon>
                  <span>待处理寻亲</span>
                  <ElTag size="small" type="warning">{{ pendingTodos.merge_count }}</ElTag>
                </div>
              </div>
            </div>
          </ElPopover>
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
        <router-view v-slot="{ Component, route: r }">
          <transition name="fade" mode="out-in">
            <component :is="Component" :key="r.fullPath" />
          </transition>
        </router-view>
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

.breadcrumb {
  font-size: 14px;
}

.right-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.notification-badge {
  cursor: pointer;
}

.notify-panel {
  padding: 4px 0;
}

.notify-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #303133;
}

.notify-empty {
  text-align: center;
  color: #909399;
  font-size: 13px;
  padding: 16px 0;
}

.notify-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notify-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.notify-item:hover {
  background-color: #F5F7FA;
}

.notify-item span {
  flex: 1;
  font-size: 14px;
  color: #303133;
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

/* 页面过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
