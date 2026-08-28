/**
 * 菜单共享类型
 * --------------------------------------------------------------------
 * 家族管理后台（AdminLayout）与族员用户中心（UserCenterLayout）共用，
 * 把"顶级直达项（leaf） + 顶级分组（group）"二态模型抽到一处。
 *
 * 设计要点：
 * - leaf：顶级直达项，点击标题直接跳转，无子菜单。
 * - group：顶级折叠菜单，含 children 子项。
 * - MenuEntry = MenuLeaf | MenuGroup，TypeScript 通过类型守卫区分。
 * - 不依赖 Vue，可在 layout 外的纯函数、测试、单测脚本中复用。
 */
export type MenuLeaf = {
  /** 菜单标题（中文） */
  title: string
  /** 图标键值（iconMap 中注册的 Element Plus 图标组件名） */
  icon: string
  /** 目标路由，可包含 ?query */
  path: string
  /** 可选：徽章绑定的语义键，与 UserBadgeCounts 字段对齐（如 'verify' / 'applications' / 'announcements'） */
  badgeKey?: string
}

export type MenuGroup = {
  /** 分组标题（中文） */
  title: string
  /** 分组图标键值 */
  icon: string
  /** 子项列表 */
  children: MenuLeaf[]
}

export type MenuEntry = MenuLeaf | MenuGroup

/**
 * 类型守卫：是否为顶级直达项（leaf）。
 * 约定：leaf 的 path 必为非空字符串。
 */
export const isLeaf = (item: MenuEntry): item is MenuLeaf =>
  typeof (item as MenuLeaf).path === 'string'

/**
 * 类型守卫：是否为顶级分组（group）。
 * 分组必含 children 数组。
 */
export const isGroup = (item: MenuEntry): item is MenuGroup =>
  Array.isArray((item as MenuGroup).children)

/**
 * 将菜单按"叶子 + 分组"二态拆分。
 * 与 AdminLayout / UserCenterLayout 的过滤逻辑保持同形。
 */
export const partitionMenu = (
  items: MenuEntry[],
): { leaves: MenuLeaf[]; groups: MenuGroup[] } => ({
  leaves: items.filter(isLeaf),
  groups: items.filter(isGroup),
})