import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const TOKEN_KEY = 'geneasphere_token'

function hasUsableToken(token: string | null): boolean {
  if (!token) return false
  try {
    const [, encodedPayload] = token.split('.')
    if (!encodedPayload) return false
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp !== 'number' || payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

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
    path: '/demo/tree-multi-wife',
    name: 'demo-tree-multi-wife',
    component: () => import('@/views/TreeMultiWifeDemoPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/cepu/:clanId',
    name: 'cepu',
    component: () => import('@/views/CepuPage.vue'),
    // 允许匿名访问：支持 ?share=<token> 分享只读链接；无凭证时由后端 403，页面给友好提示
    meta: { title: '册谱' },
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
    path: '/clans/:id/migration',
    name: 'clan-migration',
    component: () => import('@/views/clan/MigrationIndex.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true },
  },
  // 法务页面路由（无需登录）
  {
    path: '/privacy',
    name: 'privacy-policy',
    component: () => import('@/views/PrivacyPolicy.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/terms',
    name: 'user-agreement',
    component: () => import('@/views/UserAgreement.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/service-terms',
    name: 'service-terms',
    component: () => import('@/views/ServiceTerms.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/cookie-policy',
    name: 'cookie-policy',
    component: () => import('@/views/CookiePolicy.vue'),
    meta: { requiresAuth: false },
  },
  // 管理员后台路由
  {
    path: '/platform-admin/login',
    name: 'platform-login',
    component: () => import('@/views/PlatformLoginView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/platform-admin',
    component: () => import('@/layouts/PlatformAdminLayout.vue'),
    meta: { requiresAuth: true, requiresPlatformAdmin: true },
    children: [
      { path: '', redirect: { name: 'platform-dashboard' } },
      {
        path: 'dashboard',
        name: 'platform-dashboard',
        component: () => import('@/views/platform-admin/DashboardPage.vue'),
        meta: { title: '平台控制台', requiresAuth: true, requiresPlatformAdmin: true },
      },
      {
        path: 'families',
        name: 'platform-families',
        component: () => import('@/views/platform-admin/FamiliesPage.vue'),
        meta: { title: '家族管理', requiresAuth: true, requiresPlatformAdmin: true },
      },
      {
        path: 'families/:id',
        name: 'platform-family-detail',
        component: () => import('@/views/platform-admin/FamilyDetailPage.vue'),
        meta: { title: '家族详情', requiresAuth: true, requiresPlatformAdmin: true },
      },
      {
        path: 'users',
        name: 'platform-users',
        component: () => import('@/views/platform-admin/UsersPage.vue'),
        meta: { title: '用户管理', requiresAuth: true, requiresPlatformAdmin: true },
      },
      {
        path: 'reviews/media',
        name: 'platform-reviews-media',
        component: () => import('@/views/platform-admin/MediaReviewsPage.vue'),
        meta: { title: '影像审核', requiresAuth: true, requiresPlatformAdmin: true },
      },
      {
        path: 'reviews/posts',
        name: 'platform-reviews-posts',
        component: () => import('@/views/platform-admin/PostReviewsPage.vue'),
        meta: { title: '寻亲帖审核', requiresAuth: true, requiresPlatformAdmin: true },
      },
      {
        path: 'orders/print',
        name: 'platform-orders-print',
        component: () => import('@/views/platform-admin/PrintOrdersPage.vue'),
        meta: { title: '印刷订单', requiresAuth: true, requiresPlatformAdmin: true },
      },
      {
        path: 'orders/recharge',
        name: 'platform-orders-recharge',
        component: () => import('@/views/platform-admin/RechargeOrdersPage.vue'),
        meta: { title: '充值订单', requiresAuth: true, requiresPlatformAdmin: true },
      },
      {
        path: 'settings/pricing',
        name: 'platform-settings-pricing',
        component: () => import('@/views/platform-admin/PricingSettingsPage.vue'),
        meta: { title: '定价管理', requiresAuth: true, requiresPlatformAdmin: true },
      },
      {
        path: 'settings/defaults',
        name: 'platform-settings-defaults',
        component: () => import('@/views/platform-admin/ClanDefaultsPage.vue'),
        meta: { title: '家族默认配置', requiresAuth: true, requiresPlatformAdmin: true },
      },
      {
        path: 'settings/switches',
        name: 'platform-settings-switches',
        component: () => import('@/views/platform-admin/FeatureSwitchesPage.vue'),
        meta: { title: '全局开关', requiresAuth: true, requiresPlatformAdmin: true },
      },
      {
        path: 'statistics',
        name: 'platform-statistics',
        component: () => import('@/views/platform-admin/StatisticsPage.vue'),
        meta: { title: '数据统计', requiresAuth: true, requiresPlatformAdmin: true },
      },
      {
        path: 'logs',
        name: 'platform-logs',
        component: () => import('@/views/platform-admin/LogsPage.vue'),
        meta: { title: '操作日志', requiresAuth: true, requiresPlatformAdmin: true },
      },
    ],
  },
  {
    // 兼容旧链接：/admin/* 整体跳到家族后台（默认）
    // 优先级：
    //   1. 未登录 → /login（保留原意图）
    //   2. 已登录 → /select-family 让用户选择家族
    //   3. 平台管理员走 /platform-admin 仅在显式访问时
    path: '/admin/:restPath(.*)*',
    redirect: (to) => {
      const familyToken = localStorage.getItem(TOKEN_KEY)
      if (!familyToken) {
        return { path: '/login', query: { redirect: to.fullPath } }
      }
      // 已登录：默认走家族选择器（避免 /platform-admin/<restPath> 不存在的子路由导致空白页）
      return { path: '/select-family' }
    },
  },
  {
    // 家族选择页：登录后用户管理多个家族时使用
    path: '/select-family',
    name: 'select-family',
    component: () => import('@/views/SelectFamilyPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    // =================== 家族后台：/zupu/:slug/* ===================
    path: '/zupu/:slug',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
    props: true,
    children: [
      { path: '', name: 'admin-dashboard', component: () => import('@/views/admin/FamilyOverviewPage.vue'), meta: { title: '家族概况', requiresAuth: true, requiresAdmin: true } },
      // 家族理事会 / 修谱小组：已集成到 FamilyOverviewPage，通过入口卡片弹窗查看，不再保留独立路由
      { path: 'members', name: 'admin-members', component: () => import('@/views/admin/MembersPage.vue'), meta: { title: '族员管理', requiresAuth: true, requiresAdmin: true } },
      { path: 'reviews/media', name: 'admin-media-reviews', component: () => import('@/views/admin/MediaReviewPage.vue'), meta: { title: '影像审核', requiresAuth: true, requiresAdmin: true } },
      { path: 'reviews/bio', name: 'admin-bio-reviews', component: () => import('@/views/admin/BioReviewPage.vue'), meta: { title: '生平审核', requiresAuth: true, requiresAdmin: true } },
      { path: 'merge/applications', name: 'admin-merge-applications', component: () => import('@/views/admin/MergeApplicationsPage.vue'), meta: { title: '认亲申请', requiresAuth: true, requiresAdmin: true } },
      { path: 'merge/wizard/:appId', name: 'admin-merge-wizard', component: () => import('@/views/admin/MergeWizardPage.vue'), meta: { title: '归宗合并', requiresAuth: true, requiresAdmin: true } },
      { path: 'merge/posts', name: 'admin-merge-posts', component: () => import('@/views/admin/SearchPostsPage.vue'), meta: { title: '寻亲帖管理', requiresAuth: true, requiresAdmin: true } },
      { path: 'migration', name: 'admin-migration', component: () => import('@/views/admin/MigrationEventsPage.vue'), meta: { title: '迁徙管理', requiresAuth: true, requiresAdmin: true } },
      // 'import' 路径已重定向到 'genealogy/data?tab=pdf-import'（见下方 redirect）；原 admin-import 路由移除以避免冲突。
      { path: 'settings/privacy', name: 'admin-privacy-settings', component: () => import('@/views/admin/PrivacySettingsPage.vue'), meta: { title: '隐私配置', requiresAuth: true, requiresAdmin: true } },
      { path: 'settings/xipai', name: 'admin-xipai-settings', component: () => import('@/views/admin/XipaiSettingsPage.vue'), meta: { title: '字辈管理', requiresAuth: true, requiresAdmin: true } },
      { path: 'settings/storage', name: 'admin-storage-settings', component: () => import('@/views/admin/StoragePage.vue'), meta: { title: '云存储', requiresAuth: true, requiresAdmin: true } },
      { path: 'print', name: 'admin-print', component: () => import('@/views/admin/OrdersPage.vue'), meta: { title: '印刷', requiresAuth: true, requiresAdmin: true } },
      { path: 'genealogy/data', name: 'admin-genealogy-data', component: () => import('@/views/admin/GenealogyDataPage.vue'), meta: { title: '族谱数据', requiresAuth: true, requiresAdmin: true } },
      { path: 'genealogy/crowdsource', name: 'admin-genealogy-crowdsource', component: () => import('@/views/admin/CrowdsourceEditPage.vue'), meta: { title: '众包修改', requiresAuth: true, requiresAdmin: true } },
      { path: 'genealogy/finalize', name: 'admin-genealogy-finalize', component: () => import('@/views/admin/GenealogyFinalizePage.vue'), meta: { title: '定谱', requiresAuth: true, requiresAdmin: true } },
      { path: 'genealogy/h5-entry', name: 'admin-genealogy-h5-entry', component: () => import('@/views/admin/H5EntryPage.vue'), meta: { title: '族员入口', requiresAuth: true, requiresAdmin: true } },
      { path: 'genealogy/old', name: 'admin-genealogy-old', component: () => import('@/views/admin/GenealogyHistoryPage.vue'), meta: { title: '旧谱', requiresAuth: true, requiresAdmin: true } },
      { path: 'video/migration', name: 'admin-video-migration', component: () => import('@/views/admin/MigrationVideoPage.vue'), meta: { title: '迁徙历史视频', requiresAuth: true, requiresAdmin: true } },
      { path: 'video/event', name: 'admin-video-event', component: () => import('@/views/admin/EventVideoPage.vue'), meta: { title: '大事件视频', requiresAuth: true, requiresAdmin: true } },
      { path: 'family-events', name: 'admin-family-events', component: () => import('@/views/admin/FamilyEventPage.vue'), meta: { title: '大事件列表', requiresAuth: true, requiresAdmin: true } },
      { path: 'sms/send', name: 'admin-sms-send', component: () => import('@/views/admin/SmsSendPage.vue'), meta: { title: '发送短信', requiresAuth: true, requiresAdmin: true } },
      { path: 'sms/balance', name: 'admin-sms-balance', component: () => import('@/views/admin/SmsBalancePage.vue'), meta: { title: '余额管理', requiresAuth: true, requiresAdmin: true } },
      { path: 'logs', name: 'admin-logs', component: () => import('@/views/admin/LogsPage.vue'), meta: { title: '操作日志', requiresAuth: true, requiresAdmin: true } },
      { path: 'memory/quizzes', name: 'admin-memory-quizzes', component: () => import('@/views/admin/MemoryQuizManagement.vue'), meta: { title: '题库管理', requiresAuth: true, requiresAdmin: true } },
      { path: 'family-relation/reviews', name: 'admin-family-relation-reviews', component: () => import('@/views/admin/FamilyRelationReviewsPage.vue'), meta: { title: '家庭关系变更审核', requiresAuth: true, requiresAdmin: true } },
      { path: 'family-relation/disputes', name: 'admin-family-relation-disputes', component: () => import('@/views/admin/FamilyRelationDisputesPage.vue'), meta: { title: '子女归属争议', requiresAuth: true, requiresAdmin: true } },
      { path: 'announcements', name: 'admin-announcements', component: () => import('@/views/admin/AnnouncementsPage.vue'), meta: { title: '公告管理', requiresAuth: true, requiresAdmin: true } },
      { path: 'reports', name: 'admin-reports', component: () => import('@/views/admin/ReportsPage.vue'), meta: { title: '举报管理', requiresAuth: true, requiresAdmin: true } },
      { path: 'statistics', name: 'admin-statistics', component: () => import('@/views/admin/StatisticsPage.vue'), meta: { title: '数据统计', requiresAuth: true, requiresAdmin: true } },
      { path: 'trash', name: 'admin-trash', component: () => import('@/views/admin/TrashPage.vue'), meta: { title: '回收站', requiresAuth: true, requiresAdmin: true } },
      { path: 'media/library', name: 'admin-media-library', component: () => import('@/views/admin/MediaLibraryPage.vue'), meta: { title: '影像库', requiresAuth: true, requiresAdmin: true } },
      { path: 'media/albums', name: 'admin-media-albums', component: () => import('@/views/admin/AlbumsPage.vue'), meta: { title: '相册管理', requiresAuth: true, requiresAdmin: true } },
      { path: 'toolbox-usage', name: 'admin-toolbox-usage', component: () => import('@/views/admin/ToolboxUsagePage.vue'), meta: { title: 'AI工具使用记录', requiresAuth: true, requiresAdmin: true } },
      { path: 'family-albums', name: 'admin-family-albums', component: () => import('@/views/admin/FamilyAlbumsPage.vue'), meta: { title: '家庭图册', requiresAuth: true, requiresAdmin: true } },
      { path: 'settings/clan-info', name: 'admin-clan-info', component: () => import('@/views/admin/ClanInfoPage.vue'), meta: { title: '家族信息', requiresAuth: true, requiresAdmin: true } },
      { path: 'settings/export', name: 'admin-export', component: () => import('@/views/admin/DataExportPage.vue'), meta: { title: '数据导出', requiresAuth: true, requiresAdmin: true } },
      { path: 'invite/qrcodes', name: 'admin-invite-qrcodes', component: () => import('@/views/admin/invite/QrcodeListPage.vue'), meta: { title: '邀请二维码', requiresAuth: true, requiresAdmin: true } },
      // 验证记录：菜单调整后已合并到【邀请二维码】的“验证记录” tab；保留旧路径直连以防外链失效
      { path: 'invite/records', redirect: (to) => `/zupu/${to.params.slug}/invite/qrcodes?tab=verification` },
      { path: 'invite/records/:id', name: 'admin-invite-record-detail', component: () => import('@/views/admin/invite/VerificationRecordDetailPage.vue'), meta: { title: '验证详情', requiresAuth: true, requiresAdmin: true } },
      { path: 'invite/reviews', name: 'admin-invite-reviews', component: () => import('@/views/admin/invite/ModificationReviewPage.vue'), meta: { title: '族员信息审核', requiresAuth: true, requiresAdmin: true } },
      // 家族公众号（2026-08-18 菜单调整后新增）
      { path: 'wechat/config', name: 'admin-wechat-config', component: () => import('@/views/admin/WechatConfigPage.vue'), meta: { title: '公众号配置', requiresAuth: true, requiresAdmin: true } },
      { path: 'wechat/content', name: 'admin-wechat-content', component: () => import('@/views/admin/WechatContentPage.vue'), meta: { title: '内容管理', requiresAuth: true, requiresAdmin: true } },
      // 兼容旧路径：/zupu/:slug/dashboard 与 /zupu/:slug/dashboard/* 全部归并到 /zupu/:slug
      { path: 'dashboard/:rest(.*)*', redirect: (to) => `/zupu/${to.params.slug}` },
      // 旧路径重定向（菜单重构后旧链接仍可用，避免失效）
      // - 历史版本 → 旧谱
      { path: 'genealogy/history', redirect: (to) => `/zupu/${to.params.slug}/genealogy/old` },
      // - PDF 导入管理 → 族谱数据（默认 PDF 导入管理 tab）
      { path: 'import', redirect: (to) => `/zupu/${to.params.slug}/genealogy/data?tab=pdf-import` },
      // - 印刷订单 → 印刷
      { path: 'orders', redirect: (to) => `/zupu/${to.params.slug}/print` },
      // - 生成族谱 → 定谱（默认 generate tab，原独立页面已合并到定谱的"生成族谱"子功能）
      { path: 'genealogy/generate', redirect: (to) => `/zupu/${to.params.slug}/genealogy/finalize?tab=generate` },
    ],
  },
  // 全局 catch-all：未匹配的 /zupu/:slug/* 子路径 → 跳到 /zupu/:slug（默认子路由）
  {
    path: '/zupu/:slug/:restPath(.*)*',
    redirect: (to) => {
      const familyToken = localStorage.getItem(TOKEN_KEY)
      if (!familyToken) {
        return { path: '/login', query: { redirect: to.fullPath } }
      }
      return { path: `/zupu/${to.params.slug}` }
    },
  },
  // 用户中心路由
  {
    path: '/user-center',
    component: () => import('@/layouts/UserCenterLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'user-home',
        component: () => import('@/views/user-center/HomePage.vue'),
        meta: { title: '首页', requiresAuth: true },
      },
      {
        path: 'profile',
        name: 'user-profile',
        component: () => import('@/views/user-center/ProfilePage.vue'),
        meta: { title: '个人资料', requiresAuth: true },
      },
      {
        path: 'families',
        name: 'user-families',
        component: () => import('@/views/user-center/FamiliesPage.vue'),
        meta: { title: '我的家族', requiresAuth: true },
      },
      {
        path: 'clan-overview',
        name: 'user-clan-overview',
        component: () => import('@/views/user-center/ClanOverviewPage.vue'),
        meta: { title: '家族概况', requiresAuth: true },
      },
      {
        path: 'timeline',
        name: 'user-timeline',
        component: () => import('@/views/user-center/TimelinePage.vue'),
        meta: { title: '我的时光', requiresAuth: true },
      },
      {
        path: 'toolbox',
        name: 'user-toolbox',
        component: () => import('@/views/user-center/ToolboxPage.vue'),
        meta: { title: '我的工具箱', requiresAuth: true },
      },
      {
        path: 'orders',
        name: 'user-orders',
        component: () => import('@/views/user-center/OrdersPage.vue'),
        meta: { title: '我的订单', requiresAuth: true },
      },
      {
        path: 'orders/:id',
        name: 'user-order-detail',
        component: () => import('@/views/user-center/OrderDetailPage.vue'),
        meta: { title: '订单详情', requiresAuth: true },
      },
      {
        path: 'groups',
        name: 'user-groups',
        component: () => import('@/views/user-center/GroupsPage.vue'),
        meta: { title: '我的小组', requiresAuth: true },
      },
      {
        path: 'groups/:id',
        name: 'group-detail',
        component: () => import('@/views/user-center/GroupDetailPage.vue'),
        meta: { title: '小组详情', requiresAuth: true },
      },
      {
        path: 'groups/topic/:id',
        name: 'topic-detail',
        component: () => import('@/views/user-center/TopicDetailPage.vue'),
        meta: { title: '话题详情', requiresAuth: true },
      },
      {
        path: 'groups/summary/:id',
        name: 'summary-detail',
        component: () => import('@/views/user-center/SummaryDetailPage.vue'),
        meta: { title: '讨论总结', requiresAuth: true },
      },
      {
        path: 'buddies',
        name: 'user-buddies',
        component: () => import('@/views/user-center/BuddiesPage.vue'),
        meta: { title: '寻找小伙伴', requiresAuth: true },
      },
      {
        path: 'buddies/:id',
        name: 'user-buddy-detail',
        component: () => import('@/views/user-center/BuddyDetailPage.vue'),
        meta: { title: '匹配详情', requiresAuth: true },
      },
      {
        path: 'buddies/childhood-places',
        name: 'user-childhood-places',
        component: () => import('@/views/user-center/ChildhoodPlacesPage.vue'),
        meta: { title: '我的童年地点', requiresAuth: true },
      },
      {
        path: 'annotations',
        name: 'user-annotations',
        component: () => import('@/views/user-center/AnnotationsPage.vue'),
        meta: { title: '我的标注', requiresAuth: true },
      },
      {
        path: 'videos',
        name: 'user-videos',
        component: () => import('@/views/user-center/VideosPage.vue'),
        meta: { title: '我的音像墙', requiresAuth: true },
      },
      {
        path: 'videos/create',
        name: 'user-video-create',
        component: () => import('@/views/user-center/VideoCreatePage.vue'),
        meta: { title: '生成音像墙', requiresAuth: true },
      },
      {
        path: 'videos/:id',
        name: 'user-video-detail',
        component: () => import('@/views/user-center/VideoDetailPage.vue'),
        meta: { title: '音像墙详情', requiresAuth: true },
      },
      {
        path: 'lineage-video/:id',
        name: 'user-lineage-video-detail',
        component: () => import('@/views/user-center/LineageVideoDetailPage.vue'),
        meta: { title: '直系血缘视频详情', requiresAuth: true },
      },
      {
        path: 'lineage-video',
        name: 'user-lineage-video',
        component: () => import('@/views/user-center/LineageVideoPage.vue'),
        meta: { title: '直系血缘视频', requiresAuth: true },
      },
      {
        path: 'family-book',
        name: 'user-family-book',
        component: () => import('@/views/user-center/FamilyBookPage.vue'),
        meta: { title: '家庭图册', requiresAuth: true },
      },
      {
        path: 'family-book/:id',
        name: 'user-family-book-detail',
        component: () => import('@/views/user-center/FamilyBookDetailPage.vue'),
        meta: { title: '家庭图册详情', requiresAuth: true },
      },
      {
        path: 'family-book/preview/:id',
        name: 'user-family-book-preview',
        component: () => import('@/views/user-center/FamilyBookPreviewPage.vue'),
        meta: { title: '家庭图册预览', requiresAuth: true },
      },
      {
        path: 'personal-space',
        redirect: { name: 'user-personal-albums' },
      },
      {
        path: 'personal-space/albums',
        name: 'user-personal-albums',
        component: () => import('@/views/user-center/AlbumsPage.vue'),
        meta: { title: '个人空间 · 相册', requiresAuth: true },
      },
      {
        path: 'personal-space/messages',
        name: 'user-personal-messages',
        component: () => import('@/views/user-center/MessagesPage.vue'),
        meta: { title: '个人空间 · 留言板', requiresAuth: true },
      },
      {
        path: 'settings',
        name: 'user-settings',
        component: () => import('@/views/user-center/SettingsPage.vue'),
        meta: { title: '设置', requiresAuth: true },
      },
      {
        path: 'verify',
        name: 'user-verify',
        component: () => import('@/views/user-center/verify/InviteVerifyPage.vue'),
        meta: { title: '我的验证二维码', requiresAuth: true },
      },
      {
        path: 'verify/records',
        // 验证记录已合并到「我的验证」tab 化页面（菜单对齐计划 v1.0 P2）
        redirect: () => '/user-center/verify?tab=records',
      },
      // 我的申请（与菜单对齐族谱管理后台补充 · v1.0）
      // 详细实现见 P2，当前提供占位页使菜单可点击。
      {
        path: 'my-applications',
        name: 'user-my-applications',
        component: () => import('@/views/user-center/MyApplicationsPage.vue'),
        meta: { title: '我的申请', requiresAuth: true },
      },
      // 家族公告族员只读页（同上 P2 计划实现详情）
      {
        path: 'announcements',
        name: 'user-announcements',
        component: () => import('@/views/user-center/AnnouncementsPage.vue'),
        meta: { title: '家族公告', requiresAuth: true },
      },
      {
        path: 'family-relation',
        name: 'user-family-relation',
        component: () => import('@/views/user-center/FamilyRelationPage.vue'),
        meta: { title: '家庭关系维护', requiresAuth: true },
      },
      {
        path: 'family-relation/history',
        name: 'user-family-relation-history',
        component: () => import('@/views/user-center/FamilyRelationHistoryPage.vue'),
        meta: { title: '家庭关系变更历史', requiresAuth: true },
      },
      {
        path: 'memory-contributions',
        name: 'user-memory-contributions',
        component: () => import('@/views/user-center/MemoryContributionsPage.vue'),
        meta: { title: '我的记忆贡献', requiresAuth: true },
      },
      {
        path: ':pathMatch(.*)*',
        name: 'user-center-not-found',
        component: () => import('@/views/NotFoundPage.vue'),
        meta: { title: '页面不存在', requiresAuth: true },
      },
    ],
  },
  // 地方记忆拼图路由
  {
    path: '/memory-wall',
    name: 'memory-wall',
    component: () => import('@/views/LocalMemoryWall.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/quiz-verify',
    name: 'quiz-verify',
    component: () => import('@/views/QuizVerificationPage.vue'),
    meta: { requiresAuth: false },
  },
  // H5 扫码流程（公开，无需登录）
  {
    path: '/h5/scan',
    name: 'h5-scan',
    component: () => import('@/views/h5/ScanLandingPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/h5/wx-auth',
    name: 'h5-wx-auth',
    component: () => import('@/views/h5/WxAuthPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/h5/info',
    name: 'h5-info',
    component: () => import('@/views/h5/InfoPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/h5/quiz',
    name: 'h5-quiz',
    component: () => import('@/views/h5/QuizPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/h5/endorsement',
    name: 'h5-endorsement',
    component: () => import('@/views/h5/EndorsementPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/h5/endorsement-respond',
    name: 'h5-endorsement-respond',
    component: () => import('@/views/h5/EndorsementRespondPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/h5/success',
    name: 'h5-success',
    component: () => import('@/views/h5/SuccessPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/h5/expired',
    name: 'h5-expired',
    component: () => import('@/views/h5/ExpiredPage.vue'),
    meta: { requiresAuth: false },
  },
  // 修谱众包修改 H5（族员手机号登录修改入口）
  {
    path: '/h5/genealogy-edit',
    name: 'h5-genealogy-edit',
    component: () => import('@/views/h5/GenealogyEditPage.vue'),
    meta: { requiresAuth: false, title: '族谱信息修改' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  const platformToken = localStorage.getItem('geneasphere_platform_token')
  const familyToken = localStorage.getItem(TOKEN_KEY)
  const requiresPlatformAdmin = to.matched.some((record) => record.meta.requiresPlatformAdmin === true)
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth === true)
  const isLoggedInFamily = hasUsableToken(familyToken)
  const isLoggedInPlatform = hasUsableToken(platformToken)

  if (!isLoggedInFamily && familyToken) {
    localStorage.removeItem(TOKEN_KEY)
  }
  if (!isLoggedInPlatform && platformToken) {
    localStorage.removeItem('geneasphere_platform_token')
  }

  // 营销首页始终可访问（无论登录状态）
  if (to.path === '/') {
    next()
    return
  }

  // 已登录访问登录/注册 → 放行（页面自行处理）
  if ((isLoggedInFamily || isLoggedInPlatform) && !requiresAuth && (to.path === '/login' || to.path === '/register' || to.path === '/platform-admin/login')) {
    next()
    return
  }

  // 平台管理路由：使用平台 Token 校验
  if (requiresPlatformAdmin) {
    if (!isLoggedInPlatform) {
      next('/platform-admin/login')
      return
    }
    try {
      const payload = JSON.parse(atob(platformToken!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      const role = payload.role
      const allowed = ['super', 'operator', 'finance', 'auditor']
      if (!allowed.includes(role)) {
        next('/platform-admin/login')
        return
      }
    } catch {
      localStorage.removeItem('geneasphere_platform_token')
      next('/platform-admin/login')
      return
    }
    next()
    return
  }

  // 家族端：未登录访问需登录页面 → 跳转登录
  if (requiresAuth && !isLoggedInFamily) {
    next('/login')
    return
  }

  // 家族管理员页面校验：检查用户角色
  if (to.meta.requiresAdmin && isLoggedInFamily) {
    try {
      const tokenPayload = JSON.parse(atob(familyToken!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
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