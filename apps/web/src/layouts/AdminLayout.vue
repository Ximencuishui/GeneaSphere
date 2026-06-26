<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'
import {
  Monitor,
  User,
  PictureFilled,
  Collection,
  Connection,
  Setting,
  Printer,
  Message,
  Document,
  HomeFilled,
  Bell,
  Fold,
  Expand,
  UserFilled,
  Menu,
  DataLine,
  Warning,
  RefreshRight,
  Postcard,
  VideoCamera,
  Calendar,
} from '@element-plus/icons-vue'

const iconMap: Record<string, any> = {
  Monitor,
  User,
  PictureFilled,
  Collection,
  Connection,
  Setting,
  Printer,
  Message,
  Document,
  DataLine,
  Warning,
  RefreshRight,
  Postcard,
  VideoCamera,
  Calendar,
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isCollapse = ref(false)
const pendingCount = ref(0)
// 通知面板显示状态
const notifyVisible = ref(false)
// 移动端侧边栏显示状态
const sidebarVisible = ref(false)

// 待办数据
const pendingTodos = ref<{
  media_count: number
  bio_count: number
  merge_count: number
}>({ media_count: 0, bio_count: 0, merge_count: 0 })

const fetchPendingCount = async () => {
  try {
    const clanSlug = (route.params.slug as string) || route.query.clanSlug || ''
    const res = await axios.get('/api/admin/dashboard', {
      params: { clanSlug },
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

// 当前路径的 clan slug（路径参数 :slug）
const clanSlug = computed(() => (route.params.slug as string) || '')

// 根据当前 slug 动态生成所有菜单路径
const menuItems = computed(() => [
  {
    title: '概况',
    icon: 'Monitor',
    children: [
      { title: '控制面板', path: `/zupu/${clanSlug.value}/dashboard` },
      { title: '族谱树', path: `/tree/${clanSlug.value}` },
    ],
  },
  {
    title: '人员管理',
    icon: 'User',
    children: [
      { title: '成员列表', path: `/zupu/${clanSlug.value}/members` },
      { title: '权限分配', path: `/zupu/${clanSlug.value}/members?tab=roles` },
      { title: '邀请二维码', path: `/zupu/${clanSlug.value}/invite/qrcodes` },
      { title: '验证记录', path: `/zupu/${clanSlug.value}/invite/records` },
      { title: '信息修改审核', path: `/zupu/${clanSlug.value}/invite/reviews` },
      { title: '家庭关系变更审核', path: `/zupu/${clanSlug.value}/family-relation/reviews` },
      { title: '子女归属争议', path: `/zupu/${clanSlug.value}/family-relation/disputes` },
      { title: 'PDF 导入管理', path: `/zupu/${clanSlug.value}/import` },
    ],
  },
  {
    title: '内容审核',
    icon: 'PictureFilled',
    children: [
      { title: '影像审核', path: `/zupu/${clanSlug.value}/reviews/media` },
      { title: '生平审核', path: `/zupu/${clanSlug.value}/reviews/bio` },
      { title: '举报管理', path: `/zupu/${clanSlug.value}/reports` },
    ],
  },
  {
    title: '地方记忆',
    icon: 'Collection',
    children: [
      { title: '题库管理', path: `/zupu/${clanSlug.value}/memory/quizzes` },
    ],
  },
  {
    title: '寻亲管理',
    icon: 'Connection',
    children: [
      { title: '认亲申请', path: `/zupu/${clanSlug.value}/merge/applications` },
      { title: '寻亲帖管理', path: `/zupu/${clanSlug.value}/merge/posts` },
    ],
  },
  {
    title: '家族公告',
    icon: 'Postcard',
    children: [
      { title: '公告管理', path: `/zupu/${clanSlug.value}/announcements` },
    ],
  },
  {
    title: '数据管理',
    icon: 'DataLine',
    children: [
      { title: '数据统计', path: `/zupu/${clanSlug.value}/statistics` },
      { title: '回收站', path: `/zupu/${clanSlug.value}/trash` },
      { title: '数据导出', path: `/zupu/${clanSlug.value}/settings/export` },
    ],
  },
  {
    title: '影像管理',
    icon: 'PictureFilled',
    children: [
      { title: '影像库', path: `/zupu/${clanSlug.value}/media/library` },
      { title: '相册管理', path: `/zupu/${clanSlug.value}/media/albums` },
    ],
  },
  {
    title: '工具记录',
    icon: 'RefreshRight',
    children: [
      { title: 'AI工具使用记录', path: `/zupu/${clanSlug.value}/toolbox-usage` },
      { title: '家庭图册', path: `/zupu/${clanSlug.value}/family-albums` },
    ],
  },
  {
    title: '印刷服务',
    icon: 'Printer',
    children: [
      { title: '订单管理', path: `/zupu/${clanSlug.value}/orders` },
    ],
  },
  {
    title: '族谱生成',
    icon: 'Document',
    children: [
      { title: '生成族谱', path: `/zupu/${clanSlug.value}/genealogy/generate` },
      { title: '历史版本', path: `/zupu/${clanSlug.value}/genealogy/history` },
    ],
  },
  {
    title: '视频中心',
    icon: 'VideoCamera',
    children: [
      { title: '迁徙历史视频', path: `/zupu/${clanSlug.value}/video/migration` },
      { title: '大事件视频', path: `/zupu/${clanSlug.value}/video/event` },
    ],
  },
  {
    title: '事件管理',
    icon: 'Calendar',
    children: [
      { title: '大事件列表', path: `/zupu/${clanSlug.value}/family-events` },
      { title: '迁徙管理', path: `/zupu/${clanSlug.value}/migration` },
    ],
  },
  {
    title: '短信通知',
    icon: 'Message',
    children: [
      { title: '发送短信', path: `/zupu/${clanSlug.value}/sms/send` },
      { title: '余额管理', path: `/zupu/${clanSlug.value}/sms/balance` },
    ],
  },
  {
    title: '日志审计',
    icon: 'Document',
    children: [
      { title: '操作日志', path: `/zupu/${clanSlug.value}/logs` },
    ],
  },
  {
    title: '系统设置',
    icon: 'Setting',
    children: [
      { title: '隐私配置', path: `/zupu/${clanSlug.value}/settings/privacy` },
      { title: '字辈管理', path: `/zupu/${clanSlug.value}/settings/xipai` },
      { title: '家族信息', path: `/zupu/${clanSlug.value}/settings/clan-info` },
      { title: '云存储', path: `/zupu/${clanSlug.value}/settings/storage` },
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
  // 处理带 query 的路由，如 /zupu/:slug/members?tab=roles
  const fullPath = route.fullPath
  const tab = route.query.tab
  if (tab === 'roles') return `/zupu/${clanSlug.value}/members?tab=roles`
  return fullPath
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
    <ElAside :width="isCollapse ? '64px' : '240px'" :class="['sidebar', { visible: sidebarVisible }]">
      <div class="sidebar-header">
        <h2 v-if="!isCollapse" class="logo">寻根路 · xungenlu.cn</h2>
        <h2 v-else class="logo">寻</h2>
      </div>
      <ElMenu
        :default-active="activeMenu"
        :default-openeds="openedMenus"
        :collapse="isCollapse"
        background-color="#5D4037"
        text-color="#F5E6D3"
        active-text-color="#FFFFFF"
        :collapse-transition="true"
        router
        class="admin-menu"
      >
        <template v-for="item in menuItems" :key="item.title">
          <ElSubMenu :index="item.title">
            <template #title>
              <ElIcon><component :is="iconMap[item.icon]" /></ElIcon>
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
            :icon="isCollapse ? Expand : Fold"
            @click="isCollapse = !isCollapse"
            text
            class="collapse-btn"
          />
          <ElButton
            :icon="Menu"
            text
            class="mobile-menu-btn"
            @click="sidebarVisible = true"
          />
          <ElBreadcrumb separator="/" class="breadcrumb">
            <ElBreadcrumbItem :to="{ path: `/zupu/${clanSlug}/dashboard` }">
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
                <ElButton :icon="Bell" circle />
              </ElBadge>
            </template>
            <div class="notify-panel">
              <h4 class="notify-title">待办事项</h4>
              <div v-if="pendingCount === 0" class="notify-empty">暂无待办事项</div>
              <div v-else class="notify-list">
                <div
                  v-if="pendingTodos.media_count > 0"
                  class="notify-item"
                  @click="router.push(`/zupu/${clanSlug}/reviews/media`); notifyVisible = false"
                >
                  <ElIcon color="#E6A23C"><PictureFilled /></ElIcon>
                  <span>待审影像</span>
                  <ElTag size="small" type="warning">{{ pendingTodos.media_count }}</ElTag>
                </div>
                <div
                  v-if="pendingTodos.bio_count > 0"
                  class="notify-item"
                  @click="router.push(`/zupu/${clanSlug}/reviews/bio`); notifyVisible = false"
                >
                  <ElIcon color="#409EFF"><Document /></ElIcon>
                  <span>待审生平</span>
                  <ElTag size="small" type="warning">{{ pendingTodos.bio_count }}</ElTag>
                </div>
                <div
                  v-if="pendingTodos.merge_count > 0"
                  class="notify-item"
                  @click="router.push(`/zupu/${clanSlug}/merge/applications`); notifyVisible = false"
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
              <ElAvatar :size="32" :icon="UserFilled" />
              <span class="username">{{ authStore.user?.phone || '管理员' }}</span>
            </span>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem @click="router.push(`/zupu/${clanSlug}/settings/privacy`)">
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
  background-color: #5D4037;
  transition: width 0.3s;
  overflow-y: auto;
  flex-shrink: 0;
}

.sidebar-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(255, 252, 248, 0.15);
  background-color: rgba(0, 0, 0, 0.1);
}

.logo {
  color: #FFFFFF;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.admin-menu :deep(.el-sub-menu__title) {
  background-color: rgba(255, 252, 248, 0.05);
  color: #F5E6D3;
}

.admin-menu :deep(.el-sub-menu__title:hover) {
  background-color: rgba(255, 252, 248, 0.1);
}

.admin-menu :deep(.el-sub-menu.is-active .el-sub-menu__title) {
  background-color: rgba(201, 169, 110, 0.3);
  color: #FFFFFF;
}

.admin-menu :deep(.el-menu-item) {
  background-color: rgba(0, 0, 0, 0.08);
  color: #E8D5C4;
}

.admin-menu :deep(.el-menu-item.is-active) {
  background-color: rgba(201, 169, 110, 0.35);
  color: #FFFFFF;
}

.admin-menu :deep(.el-menu-item:hover) {
  background-color: rgba(255, 252, 248, 0.1);
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

.collapse-btn {
  display: block;
}

.mobile-menu-btn {
  display: none;
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

/* 响应式设计 */
@media (max-width: 768px) {
  .collapse-btn {
    display: none;
  }

  .mobile-menu-btn {
    display: block;
  }

  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 100;
    box-shadow: 2px 0 12px rgba(0, 0, 0, 0.3);
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .sidebar.visible {
    transform: translateX(0);
  }

  .main-area {
    width: 100%;
  }

  .top-bar {
    padding: 0 12px;
  }

  .breadcrumb {
    display: none;
  }

  .content-area {
    padding: 12px;
  }

  .logo {
    font-size: 14px;
  }
}

@media (max-width: 480px) {
  .sidebar {
    width: 240px !important;
  }

  .top-bar {
    height: 56px;
  }

  .content-area {
    padding: 8px;
  }
}
</style>
