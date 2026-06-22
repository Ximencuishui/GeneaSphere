<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserCenterStore } from '@/stores/userCenter'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const userStore = useUserCenterStore()
const authStore = useAuthStore()

// 移动端侧边栏
const mobileSidebarVisible = ref(false)

// 通知面板
const notifyVisible = ref(false)

const menuItems = [
  { title: '个人资料', icon: 'User', path: '/user-center/profile' },
  { title: '我的家族', icon: 'OfficeBuilding', path: '/user-center/families' },
  { title: '我的验证', icon: 'CircleCheck', path: '/user-center/verify' },
  { title: '家庭关系', icon: 'Connection', path: '/user-center/family-relation' },
  { title: '验证记录', icon: 'Tickets', path: '/user-center/verify/records' },
  { title: '我的时光', icon: 'PictureFilled', path: '/user-center/timeline' },
  { title: '我的工具箱', icon: 'Tools', path: '/user-center/toolbox' },
  { title: '家庭图册', icon: 'Notebook', path: '/user-center/family-book' },
  { title: '我的订单', icon: 'List', path: '/user-center/orders' },
  { title: '我的小组', icon: 'ChatLineRound', path: '/user-center/groups' },
  { title: '寻找小伙伴', icon: 'UserFilled', path: '/user-center/buddies' },
  { title: '我的标注', icon: 'EditPen', path: '/user-center/annotations' },
  { title: '我的记忆贡献', icon: 'Collection', path: '/user-center/memory-contributions' },
  { title: '我的音像墙', icon: 'VideoCamera', path: '/user-center/videos' },
  { title: '直系血缘视频', icon: 'VideoPlay', path: '/user-center/lineage-video' },
  { title: '个人空间', icon: 'House', path: '/user-center/personal-space/albums' },
  { title: '设置', icon: 'Setting', path: '/user-center/settings' },
]

const activeMenu = computed(() => {
  // 个人空间子页面统一高亮“个人空间”菜单
  if (route.path.startsWith('/user-center/personal-space')) {
    return '/user-center/personal-space/albums'
  }
  return route.path
})
const currentMenu = computed(
  () => {
    // 个人空间子页面匹配
    if (route.path.startsWith('/user-center/personal-space')) {
      return menuItems.find((m) => m.path === '/user-center/personal-space/albums') || menuItems[0]
    }
    return menuItems.find((m) => m.path === route.path) || menuItems[0]
  },
)

const roleTagType = computed(() => {
  const role = userStore.profile?.primary_clan?.role
  if (role === 'OWNER') return 'danger'
  if (role === 'ADMIN') return 'warning'
  if (role === 'EDITOR') return 'primary'
  return 'info'
})

const roleLabel = computed(() => {
  const role = userStore.profile?.primary_clan?.role
  if (role === 'OWNER') return '所有者'
  if (role === 'ADMIN') return '管理员'
  if (role === 'EDITOR') return '编辑者'
  if (role === 'VIEWER') return '观察员'
  return '成员'
})

const breadcrumb = computed(() => {
  return [
    { title: '用户中心', path: '/user-center/profile' },
    { title: currentMenu.value.title },
  ]
})

const displayName = computed(() => {
  return (
    userStore.profile?.nickname ||
    userStore.profile?.phone ||
    authStore.user?.phone ||
    '用户'
  )
})

const clanName = computed(
  () => userStore.profile?.primary_clan?.name || '尚未加入家族',
)

const avatarUrl = computed(
  () => userStore.profile?.avatar_url || undefined,
)

function handleMenuSelect(path: string) {
  router.push(path)
  mobileSidebarVisible.value = false
}

function handleLogout() {
  userStore.reset()
  authStore.logout()
}

function gotoAdminDashboard() {
  router.push('/admin/dashboard')
}

onMounted(async () => {
  await Promise.all([
    userStore.fetchProfile(),
    userStore.fetchSettings(),
    userStore.fetchUnreadCount(),
  ])
})

watch(
  () => route.fullPath,
  () => {
    // 切换路由时关闭移动端菜单
    mobileSidebarVisible.value = false
  },
)
</script>

<template>
  <div class="user-center-layout">
    <!-- 移动端顶部条 -->
    <div class="mobile-topbar">
      <ElButton
        icon="Menu"
        text
        size="large"
        @click="mobileSidebarVisible = true"
      />
      <span class="mobile-title">用户中心</span>
      <ElBadge
        :value="userStore.unreadCount"
        :max="99"
        :hidden="userStore.unreadCount === 0"
      >
        <ElButton icon="Bell" text circle size="large" />
      </ElBadge>
    </div>

    <div class="layout-body">
      <!-- 桌面端侧边栏 -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <div
            class="avatar"
            :style="
              avatarUrl
                ? { backgroundImage: `url(${avatarUrl})` }
                : undefined
            "
          >
            <ElIcon v-if="!avatarUrl" :size="32" color="#fff"
              ><UserFilled
            /></ElIcon>
          </div>
          <div class="user-meta">
            <div class="user-name">{{ displayName }}</div>
            <div class="clan-name" :title="clanName">{{ clanName }}</div>
            <ElTag
              v-if="userStore.profile?.primary_clan"
              :type="roleTagType"
              size="small"
              effect="light"
              class="role-tag"
            >
              {{ roleLabel }}
            </ElTag>
          </div>
        </div>

        <ElMenu
          :default-active="activeMenu"
          class="side-menu"
          @select="handleMenuSelect"
        >
          <ElMenuItem
            v-for="item in menuItems"
            :key="item.path"
            :index="item.path"
          >
            <ElIcon><component :is="item.icon" /></ElIcon>
            <span>{{ item.title }}</span>
          </ElMenuItem>
        </ElMenu>

        <div v-if="userStore.isFamilyAdmin" class="admin-entry">
          <ElButton
            type="primary"
            plain
            style="width: 100%"
            @click="gotoAdminDashboard"
          >
            <ElIcon><Management /></ElIcon>
            <span>家族管理后台</span>
          </ElButton>
        </div>
      </aside>

      <!-- 移动端侧边抽屉 -->
      <ElDrawer
        v-model="mobileSidebarVisible"
        direction="ltr"
        size="280px"
        :with-header="false"
      >
        <aside class="sidebar mobile-sidebar">
          <div class="sidebar-header">
            <div
              class="avatar"
              :style="
                avatarUrl
                  ? { backgroundImage: `url(${avatarUrl})` }
                  : undefined
              "
            >
              <ElIcon v-if="!avatarUrl" :size="32" color="#fff"
                ><UserFilled
              /></ElIcon>
            </div>
            <div class="user-meta">
              <div class="user-name">{{ displayName }}</div>
              <div class="clan-name" :title="clanName">{{ clanName }}</div>
              <ElTag
                v-if="userStore.profile?.primary_clan"
                :type="roleTagType"
                size="small"
                effect="light"
                class="role-tag"
              >
                {{ roleLabel }}
              </ElTag>
            </div>
          </div>
          <ElMenu
            :default-active="activeMenu"
            class="side-menu"
            @select="handleMenuSelect"
          >
            <ElMenuItem
              v-for="item in menuItems"
              :key="item.path"
              :index="item.path"
            >
              <ElIcon><component :is="item.icon" /></ElIcon>
              <span>{{ item.title }}</span>
            </ElMenuItem>
          </ElMenu>
          <div v-if="userStore.isFamilyAdmin" class="admin-entry">
            <ElButton
              type="primary"
              plain
              style="width: 100%"
              @click="gotoAdminDashboard"
            >
              <ElIcon><Management /></ElIcon>
              <span>家族管理后台</span>
            </ElButton>
          </div>
        </aside>
      </ElDrawer>

      <!-- 主内容区 -->
      <div class="main-area">
        <!-- 顶部导航 -->
        <ElHeader class="top-bar">
          <div class="left-section">
            <ElBreadcrumb separator="/" class="breadcrumb">
              <ElBreadcrumbItem :to="{ path: '/clans' }">
                <ElIcon><HomeFilled /></ElIcon>
              </ElBreadcrumbItem>
              <ElBreadcrumbItem
                v-for="(crumb, idx) in breadcrumb"
                :key="idx"
                :to="
                  crumb.path ? { path: crumb.path } : undefined
                "
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
                <ElBadge
                  :value="userStore.unreadCount"
                  :max="99"
                  :hidden="userStore.unreadCount === 0"
                  class="notification-badge"
                >
                  <ElButton icon="Bell" circle />
                </ElBadge>
              </template>
              <div class="notify-panel">
                <h4 class="notify-title">通知</h4>
                <div
                  v-if="userStore.unreadCount === 0"
                  class="notify-empty"
                >
                  暂无新通知
                </div>
                <div v-else class="notify-list">
                  <div
                    v-for="n in userStore.notifications.slice(0, 5)"
                    :key="n.id"
                    class="notify-item"
                  >
                    <div class="notify-line">
                      <span class="notify-content-title">{{ n.title }}</span>
                      <ElTag
                        v-if="!n.is_read"
                        size="small"
                        type="danger"
                        effect="plain"
                        >未读</ElTag
                      >
                    </div>
                    <div class="notify-content-body">{{ n.content }}</div>
                    <div class="notify-content-time">
                      {{ new Date(n.created_at).toLocaleString() }}
                    </div>
                  </div>
                </div>
              </div>
            </ElPopover>

            <ElDropdown trigger="click">
              <span class="user-info">
                <div
                  class="user-info-avatar"
                  :style="
                    avatarUrl
                      ? { backgroundImage: `url(${avatarUrl})` }
                      : undefined
                  "
                >
                  <ElIcon v-if="!avatarUrl" :size="20" color="#fff"
                    ><UserFilled
                  /></ElIcon>
                </div>
                <span class="username">{{ displayName }}</span>
              </span>
              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem @click="router.push('/clans')">
                    返回家族空间
                  </ElDropdownItem>
                  <ElDropdownItem
                    divided
                    @click="handleLogout"
                  >
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
  </div>
</template>

<style scoped>
.user-center-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f5f7fa;
  overflow: hidden;
}

.mobile-topbar {
  display: none;
  height: 56px;
  background-color: #fff;
  border-bottom: 1px solid #e4e7ed;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
}

.mobile-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.layout-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 260px;
  background-color: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 24px 20px 16px;
  display: flex;
  gap: 12px;
  align-items: center;
  border-bottom: 1px solid #f0f2f5;
}

.avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5d4037, #8d6e63);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-meta {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clan-name {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.role-tag {
  margin-top: 6px;
}

.side-menu {
  flex: 1;
  border-right: none;
}

.admin-entry {
  padding: 16px 20px;
  border-top: 1px solid #f0f2f5;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #fff;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 20px;
  height: 60px;
}

.left-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.right-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.breadcrumb {
  font-size: 14px;
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
  padding: 8px 12px;
  border-radius: 6px;
  background-color: #f8f9fa;
}

.notify-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.notify-content-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.notify-content-body {
  font-size: 12px;
  color: #606266;
  margin-top: 4px;
  line-height: 1.5;
}

.notify-content-time {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.user-info-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5d4037, #8d6e63);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .mobile-topbar {
    display: flex;
  }
  .sidebar:not(.mobile-sidebar) {
    display: none;
  }
  .content-area {
    padding: 16px;
  }
  .top-bar {
    display: none;
  }
  .breadcrumb {
    display: none;
  }
}
</style>