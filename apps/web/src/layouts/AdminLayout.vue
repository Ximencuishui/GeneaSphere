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
  Message,
  Document,
  HomeFilled,
  Bell,
  Fold,
  Expand,
  UserFilled,
  Menu,
  Search,
  EditPen,
  Calendar,
  ChatDotRound,
  DataLine,
} from '@element-plus/icons-vue'

const iconMap: Record<string, any> = {
  Monitor,
  User,
  PictureFilled,
  Connection,
  Setting,
  Message,
  Document,
  EditPen,
  Calendar,
  ChatDotRound,
  DataLine,
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const capabilityStore = useCapabilityStore()

const isCollapse = ref(false)
const pendingCount = ref(0)
// 存储用量（用于面包屑下方一行字提示）
const storageUsed = ref(0) // 字节
const storageTotal = ref(5 * 1024 * 1024 * 1024) // 5 GB（与 DashboardPage 一致）
const storagePercentage = ref(0)
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
    // 同步存储用量（面包屑下方提示条使用）
    storageUsed.value = stats.storage_used || 0
    storagePercentage.value = stats.storage_percentage || 0
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
// 顶级分组：
//   - 家族概况：顶级直达项（无子菜单，原【数据概览】+【家族信息】合并至此）
//   - 族谱：只读/查看类（树谱、册谱、旧谱）+ 数据统计
//   - 修谱：编辑/创作/分发全流程（族谱数据、众包修改、定谱、生成族谱、印刷）
//   - 家族大事：事件/迁移相关的内容与视频
//   - 家族管理：成员/公告/邀请/审核/字辈 等管理员职责 + 家族公众号
//   - 历史影像：影像库与历史影像的审核（原【内容与影像】+ 影像审核）
//   - 设置：系统配置类（原【系统设置】 + 题库管理）
//
// 菜单项两种形态：
//   - 顶级直达项（leaf）：{ title, icon, path }        — 点击标题直接跳路由
//   - 顶级分组（group）：{ title, icon, children[] }   — 可展开的折叠菜单
type MenuLeaf = { title: string; icon: string; path: string }
type MenuGroup = { title: string; icon: string; children: { title: string; path: string }[] }
type MenuEntry = MenuLeaf | MenuGroup

const menuItems = computed<MenuEntry[]>(() => [
  // ============= 顶级直达菜单：家族概况 =============
  // 原【数据概览】+【家族信息】合并至此，点击标题直接跳转
  {
    title: '家族概况',
    icon: 'DataLine',
    path: `/zupu/${clanSlug.value}`,
  },
  {
    title: '家族理事会',
    icon: 'User',
    path: `/zupu/${clanSlug.value}/council`,
  },
  {
    title: '修谱小组',
    icon: 'EditPen',
    path: `/zupu/${clanSlug.value}/revision-team`,
  },
  {
    title: '族谱',
    icon: 'Monitor',
    children: [
      { title: '树谱', path: `/tree/${clanSlug.value}` },
      { title: '册谱', path: `/cepu/${clanSlug.value}` },
      { title: '旧谱', path: `/zupu/${clanSlug.value}/genealogy/old` },
    ],
  },
  {
    title: '修谱',
    icon: 'EditPen',
    children: [
      { title: '族谱数据', path: `/zupu/${clanSlug.value}/genealogy/data` },
      { title: '众包修改', path: `/zupu/${clanSlug.value}/genealogy/crowdsource` },
      { title: '定谱', path: `/zupu/${clanSlug.value}/genealogy/finalize` },
      { title: '族员入口', path: `/zupu/${clanSlug.value}/genealogy/h5-entry` },
      { title: '印刷', path: `/zupu/${clanSlug.value}/print` },
    ],
  },
  {
    title: '家族大事',
    icon: 'Calendar',
    children: [
      { title: '大事件列表', path: `/zupu/${clanSlug.value}/family-events` },
      { title: '大事件视频', path: `/zupu/${clanSlug.value}/video/event` },
      { title: '迁徙管理', path: `/zupu/${clanSlug.value}/migration` },
      { title: '迁徙历史视频', path: `/zupu/${clanSlug.value}/video/migration` },
    ],
  },
  {
    title: '家族管理',
    icon: 'User',
    children: [
      // 族员管理：直接指向原【族员列表】页面（该页面内置【族员列表/权限分配】两个 tab）
      { title: '族员管理', path: `/zupu/${clanSlug.value}/members` },
      { title: '公告管理', path: `/zupu/${clanSlug.value}/announcements` },
      // 邀请二维码：内集成【验证记录】 tab，默认进入二维码列表
      { title: '邀请二维码', path: `/zupu/${clanSlug.value}/invite/qrcodes` },
      { title: '族员信息审核', path: `/zupu/${clanSlug.value}/invite/reviews` },
      { title: '生平审核', path: `/zupu/${clanSlug.value}/reviews/bio` },
      { title: '家庭关系变更审核', path: `/zupu/${clanSlug.value}/family-relation/reviews` },
      { title: '子女归属争议', path: `/zupu/${clanSlug.value}/family-relation/disputes` },
      { title: '举报管理', path: `/zupu/${clanSlug.value}/reports` },
      { title: '字辈管理', path: `/zupu/${clanSlug.value}/settings/xipai` },
      // 原【家族信息】已合并到【家族概况】（页面右上角设置图标打开弹窗）
      // 公众号配置与内容管理（原【家族公众号】顶级分组，已合并到【家族管理】下）
      { title: '公众号配置', path: `/zupu/${clanSlug.value}/wechat/config` },
      { title: '公众号内容', path: `/zupu/${clanSlug.value}/wechat/content` },
    ],
  },
  {
    title: '历史影像',
    icon: 'PictureFilled',
    children: [
      { title: '影像库', path: `/zupu/${clanSlug.value}/media/library` },
      { title: '相册管理', path: `/zupu/${clanSlug.value}/media/albums` },
      { title: '家庭图册', path: `/zupu/${clanSlug.value}/family-albums` },
      // 影像审核：从原【审核中心】调整到【历史影像】
      { title: '影像审核', path: `/zupu/${clanSlug.value}/reviews/media` },
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
    title: '通知与短信',
    icon: 'Message',
    children: [
      { title: '发送短信', path: `/zupu/${clanSlug.value}/sms/send` },
      { title: '余额管理', path: `/zupu/${clanSlug.value}/sms/balance` },
    ],
  },
  {
    title: '设置',
    icon: 'Setting',
    children: [
      { title: '隐私配置', path: `/zupu/${clanSlug.value}/settings/privacy` },
      { title: '云存储', path: `/zupu/${clanSlug.value}/settings/storage` },
      { title: '数据导出', path: `/zupu/${clanSlug.value}/settings/export` },
      // 题库管理：从原【内容与影像】调整到【设置】
      { title: '题库管理', path: `/zupu/${clanSlug.value}/memory/quizzes` },
      { title: 'AI工具使用记录', path: `/zupu/${clanSlug.value}/toolbox-usage` },
      { title: '回收站', path: `/zupu/${clanSlug.value}/trash` },
      { title: '操作日志', path: `/zupu/${clanSlug.value}/logs` },
    ],
  },
  // 原【家族公众号】顶级分组已于菜单重构后合并到【家族管理】下
])

// 根据当前路由自动展开对应的父级菜单；允许用户同时展开多个分组（UX-09）
const openedMenus = ref<string[]>([])
const isLeaf = (item: MenuEntry): item is MenuLeaf =>
  typeof (item as MenuLeaf).path === 'string'
const updateOpenedMenus = () => {
  const currentPath = route.path
  for (const item of menuItems.value) {
    // 顶级直达项（leaf）没有子菜单，无需展开
    if (isLeaf(item)) continue
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
  // 使用纯路径（不含 query）作为高亮依据；
  // 原【族员列表】与【权限分配】两个菜单项都指向同一页面（一个带 ?tab=roles），
  // 现在合并为单个【族员管理】菜单项，路径与页面一致即可：
  // 在该页面上（不论是否带 query）都高亮同一个菜单项。
  return route.path
})

// 生成面包屑
const breadcrumbs = computed(() => {
  const crumbs: { title: string; path?: string }[] = []
  const currentPath = route.path
  for (const item of menuItems.value) {
    // 顶级直达项（leaf）：面包屑只显示当前页标题，不显示上级
    if (isLeaf(item)) {
      if (item.path === currentPath) {
        crumbs.push({ title: item.title, path: item.path })
        return crumbs
      }
      continue
    }
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
const filteredMenuItems = computed<MenuEntry[]>(() => {
  const kw = menuKeyword.value.trim().toLowerCase()
  const hideSmsGroup = capabilityStore.loaded && !capabilityStore.isAvailable('sms')
  const result: MenuEntry[] = []
  for (const item of menuItems.value) {
    if (hideSmsGroup && item.title === '通知与短信') continue
    if (isLeaf(item)) {
      // 顶级直达项（leaf）：关键字命中则保留
      if (!kw || item.title.toLowerCase().includes(kw)) {
        result.push(item)
      }
      continue
    }
    // 顶级分组（group）：子项命中则保留分组，否则隐藏
    const group = item as MenuGroup
    const children = !kw
      ? group.children
      : group.children.filter((c) => c.title.toLowerCase().includes(kw))
    if (children.length > 0) {
      result.push({ ...group, children })
    }
  }
  return result
})

// 将过滤后的菜单拆分为顶级直达项（leaf）和顶级分组（group），
// 模板根据二者分别渲染为 ElMenuItem / ElSubMenu。
// 当前【家族概况】为唯一 leaf 项：点击标题直接跳转，无需展开。
const leafMenuItems = computed<MenuLeaf[]>(() =>
  filteredMenuItems.value.filter(isLeaf),
)
const groupMenuItems = computed<MenuGroup[]>(() =>
  filteredMenuItems.value.filter((it): it is MenuGroup => !isLeaf(it)),
)

// 存储用量显示文案（面包屑下方一行字提示）
const storageText = computed(() => {
  const usedGB = storageUsed.value / 1024 / 1024 / 1024
  return `存储已用 ${usedGB.toFixed(2)} GB / 5 GB（${storagePercentage.value}%）`
})
const storageTagType = computed(() => (storagePercentage.value > 80 ? 'danger' : 'info'))
const storageHint = computed(() =>
  storagePercentage.value > 80 ? '存储紧张，建议清理或扩容' : '存储正常',
)
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
        <!-- 顶级直达菜单（leaf）：无子菜单，点击直接跳转 -->
        <ElMenuItem
          v-for="leaf in leafMenuItems"
          :key="leaf.title"
          :index="leaf.path"
        >
          <ElIcon><component :is="iconMap[leaf.icon]" /></ElIcon>
          <template #title>
            <span>{{ leaf.title }}</span>
          </template>
        </ElMenuItem>
        <!-- 顶级分组菜单（group）：含子项的折叠菜单 -->
        <ElSubMenu
          v-for="group in groupMenuItems"
          :key="group.title"
          :index="group.title"
        >
          <template #title>
            <ElIcon><component :is="iconMap[group.icon]" /></ElIcon>
            <span>{{ group.title }}</span>
          </template>
          <ElMenuItem
            v-for="child in group.children"
            :key="child.path"
            :index="child.path"
          >
            {{ child.title }}
          </ElMenuItem>
        </ElSubMenu>
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
        <!-- 面包屑下方一行字高度的存储用量提示 -->
        <div class="storage-hint">
          <ElIcon class="storage-hint-icon"><Document /></ElIcon>
          <span class="storage-hint-text">{{ storageText }}</span>
          <ElTag :type="storageTagType" size="small" effect="light" class="storage-hint-tag">
            {{ storageHint }}
          </ElTag>
        </div>
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

/* 面包屑下方一行字高度的存储用量提示条 */
.storage-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  margin-bottom: 14px;
  background-color: #F5F7FA;
  border: 1px solid #E4E7ED;
  border-radius: 6px;
  color: #606266;
  font-size: 13px;
  line-height: 1.4;
}

.storage-hint-icon {
  color: #909399;
  font-size: 14px;
}

.storage-hint-text {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.storage-hint-tag {
  flex-shrink: 0;
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


