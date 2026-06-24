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
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      { path: '', redirect: { name: 'admin-dashboard' } },
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
        path: 'merge/wizard/:appId',
        name: 'admin-merge-wizard',
        component: () => import('@/views/admin/MergeWizardPage.vue'),
        meta: { title: '归宗合并', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'merge/posts',
        name: 'admin-merge-posts',
        component: () => import('@/views/admin/SearchPostsPage.vue'),
        meta: { title: '寻亲帖管理', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'migration',
        name: 'admin-migration',
        component: () => import('@/views/admin/MigrationEventsPage.vue'),
        meta: { title: '迁徙管理', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'import',
        name: 'admin-import',
        component: () => import('@/views/admin/ImportManagementPage.vue'),
        meta: { title: 'PDF 导入管理', requiresAuth: true, requiresAdmin: true },
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
        path: 'genealogy/generate',
        name: 'admin-genealogy-generate',
        component: () => import('@/views/admin/GenealogyGeneratePage.vue'),
        meta: { title: '生成族谱', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'genealogy/history',
        name: 'admin-genealogy-history',
        component: () => import('@/views/admin/GenealogyHistoryPage.vue'),
        meta: { title: '历史版本', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'video/migration',
        name: 'admin-video-migration',
        component: () => import('@/views/admin/MigrationVideoPage.vue'),
        meta: { title: '迁徙历史视频', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'video/event',
        name: 'admin-video-event',
        component: () => import('@/views/admin/EventVideoPage.vue'),
        meta: { title: '大事件视频', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'family-events',
        name: 'admin-family-events',
        component: () => import('@/views/admin/FamilyEventPage.vue'),
        meta: { title: '大事件列表', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'sms/send',
        name: 'admin-sms-send',
        component: () => import('@/views/admin/SmsSendPage.vue'),
        meta: { title: '发送短信', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'sms/balance',
        name: 'admin-sms-balance',
        component: () => import('@/views/admin/SmsBalancePage.vue'),
        meta: { title: '余额管理', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'logs',
        name: 'admin-logs',
        component: () => import('@/views/admin/LogsPage.vue'),
        meta: { title: '操作日志', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'memory/quizzes',
        name: 'admin-memory-quizzes',
        component: () => import('@/views/admin/MemoryQuizManagement.vue'),
        meta: { title: '题库管理', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'family-relation/reviews',
        name: 'admin-family-relation-reviews',
        component: () => import('@/views/admin/FamilyRelationReviewsPage.vue'),
        meta: { title: '家庭关系变更审核', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'family-relation/disputes',
        name: 'admin-family-relation-disputes',
        component: () => import('@/views/admin/FamilyRelationDisputesPage.vue'),
        meta: { title: '子女归属争议', requiresAuth: true, requiresAdmin: true },
      },
      // v2.0 新增路由
      {
        path: 'announcements',
        name: 'admin-announcements',
        component: () => import('@/views/admin/AnnouncementsPage.vue'),
        meta: { title: '公告管理', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'reports',
        name: 'admin-reports',
        component: () => import('@/views/admin/ReportsPage.vue'),
        meta: { title: '举报管理', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'statistics',
        name: 'admin-statistics',
        component: () => import('@/views/admin/StatisticsPage.vue'),
        meta: { title: '数据统计', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'trash',
        name: 'admin-trash',
        component: () => import('@/views/admin/TrashPage.vue'),
        meta: { title: '回收站', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'media/library',
        name: 'admin-media-library',
        component: () => import('@/views/admin/MediaLibraryPage.vue'),
        meta: { title: '影像库', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'media/albums',
        name: 'admin-media-albums',
        component: () => import('@/views/admin/AlbumsPage.vue'),
        meta: { title: '相册管理', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'toolbox-usage',
        name: 'admin-toolbox-usage',
        component: () => import('@/views/admin/ToolboxUsagePage.vue'),
        meta: { title: 'AI工具使用记录', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'family-albums',
        name: 'admin-family-albums',
        component: () => import('@/views/admin/FamilyAlbumsPage.vue'),
        meta: { title: '家庭图册', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'settings/clan-info',
        name: 'admin-clan-info',
        component: () => import('@/views/admin/ClanInfoPage.vue'),
        meta: { title: '家族信息', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'settings/export',
        name: 'admin-export',
        component: () => import('@/views/admin/DataExportPage.vue'),
        meta: { title: '数据导出', requiresAuth: true, requiresAdmin: true },
      },
    ],
  },
  // 用户中心路由
  {
    path: '/user-center',
    component: () => import('@/layouts/UserCenterLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: 'user-profile' } },
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
        name: 'user-verify-records',
        component: () => import('@/views/user-center/verify/MyVerifyRecordsPage.vue'),
        meta: { title: '验证记录', requiresAuth: true },
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
    ],
  },
  // 管理员后台 - 邀请验证子模块
  {
    path: '/admin/invite/qrcodes',
    name: 'admin-invite-qrcodes',
    component: () => import('@/views/admin/invite/QrcodeListPage.vue'),
    meta: { title: '邀请二维码', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/invite/records',
    name: 'admin-invite-records',
    component: () => import('@/views/admin/invite/VerificationRecordsPage.vue'),
    meta: { title: '验证记录', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/invite/records/:id',
    name: 'admin-invite-record-detail',
    component: () => import('@/views/admin/invite/VerificationRecordDetailPage.vue'),
    meta: { title: '验证详情', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/invite/reviews',
    name: 'admin-invite-reviews',
    component: () => import('@/views/admin/invite/ModificationReviewPage.vue'),
    meta: { title: '信息修改审核', requiresAuth: true, requiresAdmin: true },
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
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  const platformToken = localStorage.getItem('geneasphere_platform_token')
  const familyToken = localStorage.getItem(TOKEN_KEY)
  const requiresPlatformAdmin = to.meta.requiresPlatformAdmin
  const requiresAuth = to.meta.requiresAuth
  const isLoggedInFamily = !!familyToken
  const isLoggedInPlatform = !!platformToken

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
      const payload = JSON.parse(atob(platformToken!.split('.')[1]))
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
      const tokenPayload = JSON.parse(atob(familyToken!.split('.')[1]))
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