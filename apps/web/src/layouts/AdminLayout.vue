<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCapabilityStore } from '@/stores/capability'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import {
  Monitor,
  User,
  PictureFilled,
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
  Warning,
  Search,
  EditPen,
} from '@element-plus/icons-vue'

const iconMap: Record<string, any> = {
  Monitor,
  User,
  PictureFilled,
  Connection,
  Setting,
  Printer,
  Message,
  Document,
  Warning,
  EditPen,
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const capabilityStore = useCapabilityStore()

const isCollapse = ref(false)
const pendingCount = ref(0)
// 通知面板显示状态
const notifyVisible = ref(false)
// 移动端侧边栏显示状态
const sidebarVisible = ref(false)
// 菜单搜索关键词（方案 B）
const menuKeyword = ref('')

onMounted(() => {
  fetchPendingCount()
  // 拉取功能能力状态（用于按能力裁剪菜单，如短信未配置时隐藏"通知与短信"）
  capabilityStore.refresh().catch(() => {})
})

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
  } catch (err: any) {
    pendingCount.value = 0
    // 家族 slug 不存在（404）：提示用户并跳回家族选择页，
    // 避免 main 区域空白造成"页面打不开"的体感
    if (err?.response?.status === 404 && err?.response?.data?.code === 'NOT_FOUND') {
      ElMessage.error('家族不存在或已被删除，正在返回家族列表…')
      router.replace('/clans')
    }
  }
}

// 监听路由变化（slug 切换）时重新拉取待办
watch(
  () => route.params.slug,
  () => fetchPendingCount(),
)

// 当前路径的 clan slug（路径参数 :slug）
const clanSlug = computed(() => (route.params.slug as string) || '')

// 根据当前 slug 动态生成所有菜单路径（族谱管理员后台，按职责域重组）
const menuItems = computed(() => [
  {
    title: '族谱概况',
    icon: 'Monitor',
    children: [
      { title: '控制面板', path: `/zupu/${clanSlug.value}` },
      { title: '树谱', path: `/tree/${clanSlug.value}` },
      { title: '册谱', path: `/cepu/${clanSlug.value}` },
      { title: '生成族谱', path: `/zupu/${clanSlug.value}/genealogy/generate` },
      { title: '数据统计', path: `/zupu/${clanSlug.value}/statistics` },
    ],
  },
  {
    title: '修谱',
    icon: 'EditPen',
    children: [
      { title: '历史版本', path: `/zupu/${clanSlug.value}/genealogy/history` },
      { title: 'PDF 导入管理', path: `/zupu/${clanSlug.value}/import` },
    ],
  },
  {
    title: '族员管理',
    icon: 'User',
    children: [
      { title: '族员列表', path: `/zupu/${clanSlug.value}/members` },
      { title: '权限分配', path: `/zupu/${clanSlug.value}/members?tab=roles` },
      { title: '邀请二维码', path: `/zupu/${clanSlug.value}/invite/qrcodes` },
      { title: '验证记录', path: `/zupu/${clanSlug.value}/invite/records` },
      { title: '信息修改审核', path: `/zupu/${clanSlug.value}/invite/reviews` },
    ],
  },
  {
    title: '审核中心',
    icon: 'Warning',
    children: [
      { title: '影像审核', path: `/zupu/${clanSlug.value}/reviews/media` },
      { title: '生平审核', path: `/zupu/${clanSlug.value}/reviews/bio` },
      { title: '家庭关系变更审核', path: `/zupu/${clanSlug.value}/family-relation/reviews` },
      { title: '子女归属争议', path: `/zupu/${clanSlug.value}/family-relation/disputes` },
      { title: '举报管理', path: `/zupu/${clanSlug.value}/reports` },
    ],
  },
  {
    title: '内容与影像',
    icon: 'PictureFilled',
    children: [
      { title: '影像库', path: `/zupu/${clanSlug.value}/media/library` },
      { title: '相册管理', path: `/zupu/${clanSlug.value}/media/albums` },
      { title: '家庭图册', path: `/zupu/${clanSlug.value}/family-albums` },
      { title: '公告管理', path: `/zupu/${clanSlug.value}/announcements` },
      { title: '题库管理', path: `/zupu/${clanSlug.value}/memory/quizzes` },
      { title: '大事件列表', path: `/zupu/${clanSlug.value}/family-events` },
      { title: '迁徙管理', path: `/zupu/${clanSlug.value}/migration` },
      { title: '迁徙历史视频', path: `/zupu/${clanSlug.value}/video/migration` },
      { title: '大事件视频', path: `/zupu/${clanSlug.value}/video/event` },
    ],
  },
  {
    title: '寻亲与合并',
    icon: 'Connection',
    children: [
      { title: '认亲申请', path: `/zupu/${clanSlug.value}/merge/applications` },
      { title: '寻亲帖管理', path: `/zupu/${clanSlug.value}/merge/posts` },
    ],
  },
  {
    title: '族谱印刷',
    icon: 'Printer',
    children: [
      { title: '印刷订单', path: `/zupu/${clanSlug.value}/orders` },
    ],
  },
  {
    title: '通知与短信',
    icon: 'Message',
    children: [
      { title: '发送短信', path: `/zupu/${clanSlug.value}/sms/send` },
      { title: '余额管理', path: `/zupu/${clanSlug.value}/sms/balance` },
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
      { title: '数据导出', path: `/zupu/${clanSlug.value}/settings/export` },
      { title: 'AI工具使用记录', path: `/zupu/${clanSlug.value}/toolbox-usage` },
      { title: '回收站', path: `/zupu/${clanSlug.value}/trash` },
      { title: '操作日志', path: `/zupu/${clanSlug.value}/logs` },
    ],
  },
])

// 根据当前路由自动展开对应的父级菜单；允许用户同时展开多个分组（UX-09）
const openedMenus = ref<string[]>([])
const updateOpenedMenus = () => {
  const currentPath = route.path
  for (const item of menuItems.value) {
    for (const child of item.children) {
      if (child.path === currentPath || currentPath.startsWith(child.path + '?')) {
        if (!openedMenus.value.includes(item.title)) {
          openedMenus.value = [...openedMenus.value, item.title]
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

// 方案 B：菜单搜索过滤 + 按能力裁剪（短信未配置时隐藏"通知与短信"组）
const filteredMenuItems = computed(() => {
  const kw = menuKeyword.value.trim().toLowerCase()
  const hideSmsGroup = capabilityStore.loaded && !capabilityStore.isAvailable('sms')
  return menuItems.value
    .filter((item) => !(hideSmsGroup && item.title === '通知与短信'))
    .map((item) => {
      if (!kw) return item
      const children = item.children.filter((c) => c.title.toLowerCase().includes(kw))
      return { ...item, children }
    })
    .filter((item) => item.children.length > 0)
})
</script>

<template>
  <div class="admin-layout">
    <!-- 侧边栏 -->
    <ElAside :width="isCollapse ? '64px' : '240px'" :class="['sidebar', { visible: sidebarVisible }]">
      <div class="sidebar-header">
        <h2 v-if="!isCollapse" class="logo">寻根路 · xungenlu.cn</h2>
        <h2 v-else class="logo">寻</h2>
      </div>
      <div v-if="!isCollapse" class="menu-search">
        <ElInput
          v-model="menuKeyword"
          placeholder="搜索菜单"
          clearable
          size="small"
          class="menu-search-input"
        >
          <template #prefix>
            <ElIcon><Search /></ElIcon>
          </template>
        </ElInput>
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
        <template v-for="item in filteredMenuItems" :key="item.title">
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
                  隐私配置
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

.menu-search {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 252, 248, 0.1);
}

.menu-search-input :deep(.el-input__wrapper) {
  background-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 0 1px rgba(255, 252, 248, 0.2) inset;
}

.menu-search-input :deep(.el-input__inner) {
  color: #F5E6D3;
}

.menu-search-input :deep(.el-input__inner::placeholder) {
  color: rgba(245, 230, 211, 0.6);
}

.menu-search-input :deep(.el-input__prefix) {
  color: rgba(245, 230, 211, 0.7);
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


