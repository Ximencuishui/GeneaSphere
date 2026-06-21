import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const TOKEN_KEY = 'geneasphere_token'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'landing',
    component: () => import('@/views/LandingPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/clans',
    name: 'clans',
    component: () => import('@/views/ClansPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/clans/:id',
    name: 'clan-detail',
    component: () => import('@/views/ClanDetailPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/tree/:clanId',
    name: 'tree',
    component: () => import('@/views/TreePage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/import',
    name: 'import',
    component: () => import('@/views/ImportPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/timeline',
    name: 'timeline',
    component: () => import('@/views/TimelinePage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/search',
    name: 'search',
    component: () => import('@/views/SearchPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/print',
    name: 'print',
    component: () => import('@/views/PrintPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true },
  },
  // 管理员后台路由
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      {
        path: 'dashboard',
        name: 'admin-dashboard',
        component: () => import('@/views/admin/DashboardPage.vue'),
        meta: { title: '控制面板', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'members',
        name: 'admin-members',
        component: () => import('@/views/admin/MembersPage.vue'),
        meta: { title: '成员管理', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'reviews/media',
        name: 'admin-media-reviews',
        component: () => import('@/views/admin/MediaReviewPage.vue'),
        meta: { title: '影像审核', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'reviews/bio',
        name: 'admin-bio-reviews',
        component: () => import('@/views/admin/BioReviewPage.vue'),
        meta: { title: '生平审核', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'merge/applications',
        name: 'admin-merge-applications',
        component: () => import('@/views/admin/MergeApplicationsPage.vue'),
        meta: { title: '认亲申请', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'merge/posts',
        name: 'admin-merge-posts',
        component: () => import('@/views/admin/SearchPostsPage.vue'),
        meta: { title: '寻亲帖管理', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'settings/privacy',
        name: 'admin-privacy-settings',
        component: () => import('@/views/admin/PrivacySettingsPage.vue'),
        meta: { title: '隐私配置', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'settings/xipai',
        name: 'admin-xipai-settings',
        component: () => import('@/views/admin/XipaiSettingsPage.vue'),
        meta: { title: '字辈管理', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'settings/storage',
        name: 'admin-storage-settings',
        component: () => import('@/views/admin/StoragePage.vue'),
        meta: { title: '云存储', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'orders',
        name: 'admin-orders',
        component: () => import('@/views/admin/OrdersPage.vue'),
        meta: { title: '订单管理', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'logs',
        name: 'admin-logs',
        component: () => import('@/views/admin/LogsPage.vue'),
        meta: { title: '操作日志', requiresAuth: true, requiresAdmin: true },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem(TOKEN_KEY)
  const isLoggedIn = !!token
  const requiresAuth = to.meta.requiresAuth
  const requiresAdmin = to.meta.requiresAdmin

  // 营销首页始终可访问（无论登录状态）
  if (to.path === '/') {
    next()
    return
  }

  // 已登录访问登录/注册 → 放行（页面自行处理）
  if (isLoggedIn && !requiresAuth && (to.path === '/login' || to.path === '/register')) {
    next()
    return
  }

  // 未登录访问需登录页面 → 跳转登录
  if (requiresAuth && !isLoggedIn) {
    next('/login')
    return
  }

  // 管理员页面校验：检查用户角色
  if (requiresAdmin && isLoggedIn) {
    try {
      const tokenPayload = JSON.parse(atob(token!.split('.')[1]))
      const userRole = tokenPayload.role || ''
      const allowedRoles = ['OWNER', 'ADMIN']
      if (!allowedRoles.includes(userRole)) {
        next('/clans')
        return
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      next('/login')
      return
    }
  }

  next()
})

export default router