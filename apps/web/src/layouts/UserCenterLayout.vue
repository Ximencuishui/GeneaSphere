<script setup lang="ts">
import { nextTick, ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserCenterStore } from '@/stores/userCenter'
import { useAuthStore } from '@/stores/auth'
import { SwitchButton, Search } from '@element-plus/icons-vue'
import { iconMap } from './iconMap'
import {
  filterMenuByRole,
  getUserCenterMenuGroups,
  searchMenu,
  shouldShowAdminEntry,
  type ClanContext,
} from './userCenterMenu'
import { BREADCRUMB_ROOT, USER_CENTER_EMPTY_TEXT } from './menuCopy'
import { isGroup, isLeaf, type MenuEntry, type MenuLeaf, type MenuGroup } from './menuTypes'
import PageLoader, { type PageLoaderLog } from '@/components/PageLoader.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserCenterStore()
const authStore = useAuthStore()

// 移动端侧边栏
const mobileSidebarVisible = ref(false)
// 移动端通知抽屉
const mobileNotifyVisible = ref(false)
// 菜单搜索关键词（与 AdminLayout 同方案：空组隐藏）
const menuKeyword = ref('')

// 当前主家族上下文（供给菜单生成与裁剪纯函数）
// 严格收紧 slug 字段为 string | undefined，兼容后端可能的 null 返回
const clanContext = computed<ClanContext | null>(() => {
  const c = userStore.profile?.primary_clan
  if (!c) return null
  return {
    slug: c.slug ?? undefined,
    id: c.id ?? undefined,
    role: (c.role ?? undefined) as ClanContext['role'],
  }
})

// 顶层生成：依赖主家族上下文（加入家族/未加入）
const rawMenuGroups = computed<MenuEntry[]>(() =>
  getUserCenterMenuGroups({ clan: clanContext.value }),
)

// 角色裁剪：EDITOR 在家族事务隐藏“我的验证/我的申请”，未加入家族隐藏依赖家族上下文项
const roleFilteredGroups = computed<MenuEntry[]>(() =>
  filterMenuByRole(rawMenuGroups.value, clanContext.value),
)

// 搜索过滤（仅子项命中，逻辑与 AdminLayout 一致）
const filteredMenuEntries = computed<MenuEntry[]>(() =>
  searchMenu(roleFilteredGroups.value, menuKeyword.value),
)

const leafMenuEntries = computed<MenuLeaf[]>(() =>
  filteredMenuEntries.value.filter(isLeaf),
)
const groupMenuEntries = computed<MenuGroup[]>(() =>
  filteredMenuEntries.value.filter(isGroup),
)

// 通知面板
const notifyVisible = ref(false)

/**
 * 侧边菜单（与族谱管理后台对齐）
 * - 数据源统一走 ./userCenterMenu 纯函数（已抽离）；
 * - 本处只负责：按当前路由推导高亮、面包屑、当前菜单项等响应式 UI 状态。
 * - “家族事务”分组仅在已加入家族时可见；
 * - “首页 / 家族概况”作为顶级直达项（leaf）渲染，与 AdminLayout 同构。
 */

// 子页面 → 所属菜单项（前缀匹配，用于详情页的高亮与面包屑）
const subPageMap: [RegExp, string][] = [
  [/^\/user-center\/orders\/.+/, '/user-center/orders'],
  [/^\/user-center\/groups\/.+/, '/user-center/groups'],
  [/^\/user-center\/buddies\/.+/, '/user-center/buddies'],
  [/^\/user-center\/videos\/(create|\d+)/, '/user-center/videos'],
  [/^\/user-center\/lineage-video\/.+/, '/user-center/lineage-video'],
  [/^\/user-center\/family-book\/(preview\/)?\d+/, '/user-center/family-book'],
  [/^\/user-center\/personal-space\//, '/user-center/personal-space/albums'],
  [/^\/user-center\/family-relation\/history/, '/user-center/family-relation'],
  // 我的验证二级页（tab 化后保持高亮）
  [/^\/user-center\/verify(\/|$)/, '/user-center/verify'],
  // 我的申请二级页
  [/^\/user-center\/my-applications(\/|$)/, '/user-center/my-applications'],
  // 家族公告详情
  [/^\/user-center\/announcements\/[^/]+/, '/user-center/announcements'],
]

/** 在给定菜单集合中查找路径精确匹配的项（涵盖 leaf 与 group 子项） */
const matchInEntries = (
  items: MenuEntry[],
  path: string,
): MenuLeaf | null => {
  for (const entry of items) {
    if (isLeaf(entry) && entry.path === path) return entry
    if (isGroup(entry)) {
      const child = entry.children.find((c) => c.path === path)
      if (child) return child
    }
  }
  return null
}

/**
 * 从菜单中查找路径精确匹配的项。
 * 优先查角色裁剪后的菜单；若找不到（如 EDITOR 直达被隐藏的
 * “我的申请/我的验证”时），回退到未裁剪的完整菜单，
 * 保证面包屑/高亮在 URL 直达时仍能正确解析。
 */
const findMenuItem = (path: string) =>
  matchInEntries(filteredMenuEntries.value, path) ||
  matchInEntries(rawMenuGroups.value, path)

/** 首页（无对应菜单项时的回退/面包屑目标） */
const HOME_MENU = { title: '首页', path: '/user-center' }

const activeMenu = computed(() => {
  // 精确命中直接返回
  if (findMenuItem(route.path)) return route.path
  // 子页面按前缀归类到所属菜单项
  for (const [re, parent] of subPageMap) {
    if (re.test(route.path)) return parent
  }
  return route.path
})

const currentMenu = computed(() => {
  // 首页本身没有子菜单项，直接回退到"首页"
  if (route.path === '/user-center') return HOME_MENU
  // 以 activeMenu（含子页归类结果）为准
  return findMenuItem(activeMenu.value) || HOME_MENU
})

// 同步计算“当前主家族角色”与“管理员入口可见性”
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
    { title: '用户中心', path: '/user-center' },
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
  // 有主家族 slug 时直达家族后台，避免多一次 /select-family 跳转
  const slug = userStore.profile?.primary_clan?.slug
  if (slug) {
    router.push(`/zupu/${slug}`)
  } else {
    router.push('/select-family')
  }
}

/**
 * 读取徽章计数（供侧边菜单使用）
 * - badgeKey 与 MenuLeaf.badgeKey 对齐，与 UserBadgeCounts 字段一致；
 * - 未加载时返回 0，避免渲染抖动。
 */
function getBadgeCount(key: string): number {
  const b = userStore.badgeCounts
  if (!b) return 0
  const v = (b as any)[key]
  return typeof v === 'number' ? v : 0
}

/**
 * 用户中心全局加载阶段机：避免初次进入时侧边栏头像/名字/家族名空白，
 * 让用户清楚看到"正在拉取资料 → 设置 → 通知 → 渲染子页面"的进度。
 *
 * - profile:        /api/user/profile（侧边栏关键依赖，必须先到位）
 * - settings+notif: /api/user/settings + /api/user/notifications/unread-count（并行）
 * - render:         子页面首帧 DOM 提交
 * - finalize:       准备就绪
 */
type CenterStage = 'profile' | 'settings' | 'render' | 'finalize'
const STAGES: { key: CenterStage; label: string; desc: string }[] = [
  { key: 'profile', label: '加载用户资料', desc: '头像/昵称/家族/角色' },
  { key: 'settings', label: '加载设置与通知', desc: '个人偏好 + 未读数' },
  { key: 'render', label: '渲染子页面', desc: '提交首帧 DOM' },
  { key: 'finalize', label: '完成加载', desc: '准备就绪' },
]

const centerLoading = ref(true)
const centerStage = ref<CenterStage>('profile')
const centerError = ref(false)
const centerErrorMessage = ref('')
const centerLogs = ref<PageLoaderLog[]>([])

function pushCenterLog(message: string, type: PageLoaderLog['type'] = 'info') {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  centerLogs.value.push({
    time: `${hh}:${mm}:${ss}`,
    stage: centerStage.value,
    message,
    type,
  })
}

async function loadUserCenter() {
  centerLoading.value = true
  centerError.value = false
  centerErrorMessage.value = ''
  centerLogs.value = []
  centerStage.value = 'profile'
  pushCenterLog('开始加载用户中心')

  try {
    // ========== 阶段1：profile（关键路径） ==========
    if (!userStore.isLoggedIn) {
      pushCenterLog('未登录，跳过用户资料加载', 'warn')
    } else {
      pushCenterLog('调用 /api/user/profile')
      const profile = await userStore.fetchProfile()
      pushCenterLog(
        profile
          ? `资料已就绪：${profile.nickname || profile.phone || '匿名用户'}`
          : '资料接口未返回数据',
        profile ? 'success' : 'warn',
      )
    }

    // ========== 阶段2：settings + notifications + badges（并行） ==========
    centerStage.value = 'settings'
    pushCenterLog('开始并行加载设置、通知与徽章')
    await Promise.all([
      userStore
        .fetchSettings()
        .then((s) => {
          pushCenterLog(
            s ? '设置已就绪' : '设置接口未返回数据，使用默认值',
            s ? 'success' : 'warn',
          )
        })
        .catch((err) => {
          pushCenterLog(`设置加载失败：${err?.message || err}`, 'error')
        }),
      userStore
        .fetchUnreadCount()
        .then(() => {
          pushCenterLog(`未读通知数：${userStore.unreadCount}`, 'success')
        })
        .catch((err) => {
          pushCenterLog(`通知加载失败：${err?.message || err}`, 'error')
        }),
      userStore
        .fetchBadgeCounts()
        .then((b) => {
          if (b) {
            pushCenterLog(
              `徽章已就绪（公告 ${b.announcements} / 申请 ${b.applications} / 验证 ${b.verify}）`,
              'success',
            )
          } else {
            pushCenterLog('徽章接口未返回数据，侧栏将不显示徽章', 'warn')
          }
        })
        .catch((err) => {
          pushCenterLog(`徽章加载失败：${err?.message || err}`, 'error')
        }),
    ])

    // ========== 阶段3：渲染子页面 ==========
    centerStage.value = 'render'
    await nextTick()
    pushCenterLog('首屏 DOM 已提交', 'success')

    // ========== 阶段4：完成 ==========
    centerStage.value = 'finalize'
    pushCenterLog('用户中心加载完成', 'success')
  } catch (error: any) {
    const status: number = error?.response?.status || error?.status || 0
    const message: string = error?.message || String(error)
    centerError.value = true
    if (status === 401) {
      centerErrorMessage.value = '登录已过期，请重新登录'
    } else if (status === 403) {
      centerErrorMessage.value = '当前账号无权访问用户中心'
    } else if (status >= 500) {
      centerErrorMessage.value = '服务器开小差了，请稍后重试'
    } else {
      centerErrorMessage.value = message || '加载失败，请稍后重试'
    }
    pushCenterLog(`失败：${centerErrorMessage.value} (HTTP ${status || '-'})`, 'error')
    console.error('[userCenterLayout] load failed:', error)
  } finally {
    centerLoading.value = false
  }
}

onMounted(async () => {
  await loadUserCenter()
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
        <ElButton
          icon="Bell"
          text
          circle
          size="large"
          aria-label="查看通知"
          @click="mobileNotifyVisible = true"
        />
      </ElBadge>
      <!-- P1-3 修复：移动端直接露出登出入口，不再依赖打开抽屉 -->
      <ElButton
        class="mobile-logout-btn"
        :icon="SwitchButton"
        text
        circle
        size="large"
        :title="'退出登录'"
        aria-label="退出登录"
        @click="handleLogout"
      />
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

        <div class="menu-search">
          <ElInput
            v-model="menuKeyword"
            placeholder="搜索菜单"
            clearable
            size="small"
          >
            <template #prefix>
              <ElIcon><Search /></ElIcon>
            </template>
          </ElInput>
        </div>

        <ElMenu
          :default-active="activeMenu"
          :default-openeds="['族谱']"
          class="side-menu"
          @select="handleMenuSelect"
          mode="vertical"
        >
          <!-- 顶级直达项（首页 / 家族概况） -->
          <ElMenuItem
            v-for="leaf in leafMenuEntries"
            :key="leaf.path"
            :index="leaf.path"
          >
            <ElIcon><component :is="iconMap[leaf.icon]" /></ElIcon>
            <span>{{ leaf.title }}</span>
          </ElMenuItem>
          <!-- 顶级分组 -->
          <ElSubMenu
            v-for="group in groupMenuEntries"
            :key="group.title"
            :index="group.title"
          >
            <template #title>
              <ElIcon><component :is="iconMap[group.icon]" /></ElIcon>
              <span>{{ group.title }}</span>
            </template>
            <ElMenuItem
              v-for="item in group.children"
              :key="item.path"
              :index="item.path"
            >
              <ElIcon><component :is="iconMap[item.icon]" /></ElIcon>
              <span class="menu-label">{{ item.title }}</span>
              <ElBadge
                v-if="item.badgeKey && getBadgeCount(item.badgeKey) > 0"
                :value="getBadgeCount(item.badgeKey)"
                :max="99"
                class="menu-badge"
              />
            </ElMenuItem>
          </ElSubMenu>
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
          <div class="menu-search">
            <ElInput
              v-model="menuKeyword"
              placeholder="搜索菜单"
              clearable
              size="small"
            >
              <template #prefix>
                <ElIcon><Search /></ElIcon>
              </template>
            </ElInput>
          </div>
          <ElMenu
            :default-active="activeMenu"
            :default-openeds="['族谱']"
            class="side-menu"
            @select="handleMenuSelect"
            mode="vertical"
          >
            <!-- 顶级直达项（首页 / 家族概况） -->
            <ElMenuItem
              v-for="leaf in leafMenuEntries"
              :key="leaf.path"
              :index="leaf.path"
            >
              <ElIcon><component :is="iconMap[leaf.icon]" /></ElIcon>
              <span>{{ leaf.title }}</span>
            </ElMenuItem>
            <!-- 顶级分组 -->
            <ElSubMenu
              v-for="group in groupMenuEntries"
              :key="group.title"
              :index="group.title"
            >
              <template #title>
                <ElIcon><component :is="iconMap[group.icon]" /></ElIcon>
                <span>{{ group.title }}</span>
              </template>
              <ElMenuItem
                v-for="item in group.children"
                :key="item.path"
                :index="item.path"
              >
                <ElIcon><component :is="iconMap[item.icon]" /></ElIcon>
                <span class="menu-label">{{ item.title }}</span>
                <ElBadge
                  v-if="item.badgeKey && getBadgeCount(item.badgeKey) > 0"
                  :value="getBadgeCount(item.badgeKey)"
                  :max="99"
                  class="menu-badge"
                />
              </ElMenuItem>
            </ElSubMenu>
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

      <!-- 移动端通知抽屉（UX-03 修复：移动端铃铛可查看通知） -->
      <ElDrawer v-model="mobileNotifyVisible" title="通知" direction="rtl" size="85%">
        <div class="notify-panel">
          <div v-if="userStore.notifications.length === 0" class="notify-empty">暂无通知</div>
          <div v-else class="notify-list">
            <div
              v-for="n in userStore.notifications"
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
          <!-- 初次加载占位：进度条 + 阶段列表 + 滚动日志 -->
          <PageLoader
            v-if="centerLoading || centerError"
            :visible="centerLoading || centerError"
            title="正在加载用户中心"
            :stages="STAGES"
            :current-stage="centerStage"
            :logs="centerLogs"
            :error="centerError"
            :error-message="centerErrorMessage"
          />
          <router-view v-else v-slot="{ Component, route: r }">
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

.menu-search {
  padding: 12px 16px 4px;
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
  overflow-y: auto;
}

.side-menu :deep(.el-sub-menu__title) {
  font-weight: 600;
  color: #5D4037;
  background-color: rgba(201, 169, 110, 0.08);
}

.side-menu :deep(.el-sub-menu__title:hover) {
  background-color: rgba(201, 169, 110, 0.15);
}

.side-menu :deep(.el-sub-menu.is-active .el-sub-menu__title) {
  background-color: rgba(201, 169, 110, 0.15);
  color: #5D4037;
}

.side-menu :deep(.el-menu-item) {
  padding-left: 48px !important;
}

.side-menu :deep(.el-menu-item.is-active) {
  background-color: rgba(201, 169, 110, 0.12);
  color: #5D4037;
}

.side-menu :deep(.el-menu-item:hover) {
  background-color: rgba(201, 169, 110, 0.08);
}

/* 菜单徽章：标题与数字横向并排，徽章靠右悬浮 */
.side-menu :deep(.el-menu-item .menu-label) {
  display: inline-block;
  vertical-align: middle;
  margin-right: 8px;
}

.side-menu :deep(.el-menu-item .menu-badge) {
  display: inline-block;
  vertical-align: middle;
}

.side-menu :deep(.el-menu-item .menu-badge .el-badge__content) {
  transform: translateY(-1px);
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