/**
 * 族员用户中心菜单文案
 * --------------------------------------------------------------------
 * 集中管理族员用户中心侧栏菜单的标题、面包屑文案、空态文案。
 *
 * 与 AdminLayout 的命名对齐约定：
 * - 同一资源在两侧使用同一标题（如"我的验证"对应"邀请二维码"）；
 * - 仅在族员侧出现的页面使用"我的"前缀，以体现"个人视角"；
 * - 图标键值在 menuTypes.ts / iconMap.ts 中统一注册。
 *
 * 注意：本文件仅含文案常量，不含路径，路径由 userCenterMenu.ts 维护。
 */

/** 顶级直达项标题 */
export const USER_CENTER_LEAF_TITLES = {
  home: '首页',
  clanOverview: '家族概况',
} as const

/** 顶级分组标题 */
export const USER_CENTER_GROUP_TITLES = {
  genealogy: '族谱',
  myContent: '我的内容',
  familyAffairs: '家族事务',
  interaction: '互动与工具',
  account: '账户与服务',
} as const

/** 族谱分组子项 */
export const GENEALOGY_ITEMS = {
  tree: '树谱',
  cepu: '册谱',
  oldGenealogy: '旧谱',
  myFamilies: '我的家族',
} as const

/** 我的内容分组子项 */
export const MY_CONTENT_ITEMS = {
  timeline: '我的时光',
  familyBook: '家庭图册',
  videos: '我的音像墙',
  annotations: '我的标注',
  memoryContributions: '我的记忆贡献',
  personalSpace: '个人空间',
} as const

/** 家族事务分组子项（新增对齐管理员"家族管理"分组） */
export const FAMILY_AFFAIRS_ITEMS = {
  myVerify: '我的验证',
  myApplications: '我的申请',
  familyRelation: '家庭关系',
  announcements: '家族公告',
  orders: '我的订单',
} as const

/** 互动与工具分组子项 */
export const INTERACTION_ITEMS = {
  toolbox: '我的工具箱',
  groups: '我的小组',
  buddies: '寻找小伙伴',
  lineageVideo: '直系血缘视频',
} as const

/** 账户与服务分组子项 */
export const ACCOUNT_ITEMS = {
  profile: '个人资料',
  settings: '设置',
} as const

/** 角色标签（与 UserCenterLayout 现有 roleLabel 保持一致） */
export const ROLE_LABELS = {
  OWNER: '所有者',
  ADMIN: '管理员',
  EDITOR: '编辑者',
  VIEWER: '观察员',
  MEMBER: '成员',
} as const

/** 空态 / 引导文案 */
export const USER_CENTER_EMPTY_TEXT = {
  noClanTitle: '尚未加入家族',
  noClanDesc: '加入家族后可查看树谱、册谱，参与家族事务',
  goToBrowse: '去浏览家族',
  noPermission: '当前角色无权访问此功能',
  menuSearchPlaceholder: '搜索菜单',
} as const

/** 面包屑根节点 */
export const BREADCRUMB_ROOT = '用户中心'

/** 管理员入口按钮文案 */
export const ADMIN_ENTRY_TEXT = '家族管理后台'