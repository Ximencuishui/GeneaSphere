/**
 * 族员用户中心菜单纯函数
 * --------------------------------------------------------------------
 * 不依赖 Vue / Pinia，可在布局组件、单测、Node 脚本中复用。
 *
 * 角色 × 分组可见性矩阵（与 docs/族员用户中心 · 菜单对齐族谱管理后台优化计划 v1.0.md §4.3 一致）：
 * ┌─────────────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
 * │ 分组 / 角色      │ OWNER   │ ADMIN   │ EDITOR  │ VIEWER  │ 未加入   │
 * ├─────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
 * │ 首页(leaf)       │ ✓       │ ✓       │ ✓       │ ✓       │ ✓       │
 * │ 家族概况(leaf)    │ ✓       │ ✓       │ ✓       │ ✓       │ ✗       │
 * │ 族谱              │ ✓       │ ✓       │ ✓       │ ✓       │ 仅我的家族│
 * │ 我的内容          │ ✓       │ ✓       │ ✓       │ ✓       │ 仅个人空间│
 * │ 家族事务          │ ✓       │ ✓       │ 部分     │ ✓       │ ✗       │
 * │ 互动与工具        │ ✓       │ ✓       │ ✓       │ ✓       │ ✓       │
 * │ 账户与服务        │ ✓       │ ✓       │ ✓       │ ✓       │ ✓       │
 * └─────────────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
 *
 * EDITOR 在「家族事务」中看不到"我的验证 / 我的申请"（无修改/邀请权限）。
 */
import type { MenuEntry, MenuLeaf, MenuGroup } from './menuTypes'
import {
  ACCOUNT_ITEMS,
  FAMILY_AFFAIRS_ITEMS,
  GENEALOGY_ITEMS,
  INTERACTION_ITEMS,
  MY_CONTENT_ITEMS,
  USER_CENTER_GROUP_TITLES,
  USER_CENTER_LEAF_TITLES,
} from './menuCopy'

/** 族员在主家族中的角色（与后端 UserProfile.primary_clan.role 对齐） */
export type ClanRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER' | 'MEMBER'

/** 当前用户主家族上下文（用于路径参数生成与可见性判定） */
export type ClanContext = {
  slug?: string
  id?: string
  role?: ClanRole
}

/** 菜单生成入参 */
export type BuildMenuInput = {
  clan: ClanContext | null
}

/**
 * 取当前主家族路由键值（slug 优先，兜底 id）。
 * 主家族不存在时返回空串（路径会因此变成 /tree/、/cepu/，由路由兜底 404）。
 */
export const clanKey = (clan: ClanContext | null): string => {
  if (!clan) return ''
  return clan.slug || clan.id || ''
}

/**
 * 判定当前是否"已加入家族"（slug 或 id 至少有一个）。
 */
export const hasClan = (clan: ClanContext | null): boolean => !!clanKey(clan)

/**
 * 当前角色是否在集合内。
 * 未加入家族时一律视为 'MEMBER'，但 hasClan=false 时按 §4.3 单独裁剪。
 */
export const effectiveRole = (clan: ClanContext | null): ClanRole => {
  if (!hasClan(clan)) return 'MEMBER'
  return clan?.role || 'MEMBER'
}

/**
 * 生成族员用户中心顶级直达项 + 分组。
 *
 * 返回顺序：
 *   [首页, 家族概况, 族谱, 我的内容, 家族事务, 互动与工具, 账户与服务]
 *
 * 注意：
 * - 函数是纯函数，不读 store / 不依赖 Vue 响应式；
 * - 调用方（如 UserCenterLayout）应在外层用 computed 包裹，并在 filterMenuByRole 中按角色裁剪。
 */
export const getUserCenterMenuGroups = (input: BuildMenuInput): MenuEntry[] => {
  const key = clanKey(input.clan)
  const leaves: MenuLeaf[] = [
    {
      title: USER_CENTER_LEAF_TITLES.home,
      icon: 'HomeFilled',
      path: '/user-center',
    },
    {
      title: USER_CENTER_LEAF_TITLES.clanOverview,
      icon: 'DataLine',
      path: '/user-center/clan-overview',
    },
  ]

  const genealogyChildren: MenuLeaf[] = hasClan(input.clan)
    ? [
        { title: GENEALOGY_ITEMS.tree, icon: 'Share', path: `/tree/${key}` },
        { title: GENEALOGY_ITEMS.cepu, icon: 'Notebook', path: `/cepu/${key}` },
        {
          title: GENEALOGY_ITEMS.oldGenealogy,
          icon: 'Document',
          path: `/zupu/${key}/genealogy/old`,
        },
        {
          title: GENEALOGY_ITEMS.myFamilies,
          icon: 'OfficeBuilding',
          path: '/user-center/families',
        },
      ]
    : [
        {
          title: GENEALOGY_ITEMS.myFamilies,
          icon: 'OfficeBuilding',
          path: '/user-center/families',
        },
      ]

  const myContentChildren: MenuLeaf[] = hasClan(input.clan)
    ? [
        {
          title: MY_CONTENT_ITEMS.timeline,
          icon: 'PictureFilled',
          path: '/user-center/timeline',
        },
        {
          title: MY_CONTENT_ITEMS.familyBook,
          icon: 'Notebook',
          path: '/user-center/family-book',
        },
        {
          title: MY_CONTENT_ITEMS.videos,
          icon: 'VideoCamera',
          path: '/user-center/videos',
        },
        {
          title: MY_CONTENT_ITEMS.annotations,
          icon: 'EditPen',
          path: '/user-center/annotations',
        },
        {
          title: MY_CONTENT_ITEMS.memoryContributions,
          icon: 'Collection',
          path: '/user-center/memory-contributions',
        },
        {
          title: MY_CONTENT_ITEMS.personalSpace,
          icon: 'House',
          path: '/user-center/personal-space/albums',
        },
      ]
    : [
        {
          title: MY_CONTENT_ITEMS.personalSpace,
          icon: 'House',
          path: '/user-center/personal-space/albums',
        },
      ]

  const familyAffairsChildren: MenuLeaf[] = hasClan(input.clan)
    ? [
        {
          title: FAMILY_AFFAIRS_ITEMS.myVerify,
          icon: 'CircleCheck',
          path: '/user-center/verify',
          badgeKey: 'verify',
        },
        {
          title: FAMILY_AFFAIRS_ITEMS.myApplications,
          icon: 'Tickets',
          path: '/user-center/my-applications',
          badgeKey: 'applications',
        },
        {
          title: FAMILY_AFFAIRS_ITEMS.familyRelation,
          icon: 'Connection',
          path: '/user-center/family-relation',
        },
        {
          title: FAMILY_AFFAIRS_ITEMS.announcements,
          icon: 'Message',
          path: '/user-center/announcements',
          badgeKey: 'announcements',
        },
        {
          title: FAMILY_AFFAIRS_ITEMS.orders,
          icon: 'List',
          path: '/user-center/orders',
          badgeKey: 'orders',
        },
      ]
    : []

  const interactionChildren: MenuLeaf[] = [
    {
      title: INTERACTION_ITEMS.toolbox,
      icon: 'Tools',
      path: '/user-center/toolbox',
    },
    {
      title: INTERACTION_ITEMS.groups,
      icon: 'ChatLineRound',
      path: '/user-center/groups',
    },
    {
      title: INTERACTION_ITEMS.buddies,
      icon: 'UserFilled',
      path: '/user-center/buddies',
    },
    {
      title: INTERACTION_ITEMS.lineageVideo,
      icon: 'VideoPlay',
      path: '/user-center/lineage-video',
    },
  ]

  const accountChildren: MenuLeaf[] = [
    {
      title: ACCOUNT_ITEMS.profile,
      icon: 'User',
      path: '/user-center/profile',
    },
    {
      title: ACCOUNT_ITEMS.settings,
      icon: 'Setting',
      path: '/user-center/settings',
    },
  ]

  const groups: MenuGroup[] = [
    {
      title: USER_CENTER_GROUP_TITLES.genealogy,
      icon: 'Monitor',
      children: genealogyChildren,
    },
    {
      title: USER_CENTER_GROUP_TITLES.myContent,
      icon: 'FolderOpened',
      children: myContentChildren,
    },
    ...(familyAffairsChildren.length > 0
      ? [
          {
            title: USER_CENTER_GROUP_TITLES.familyAffairs,
            icon: 'User',
            children: familyAffairsChildren,
          },
        ]
      : []),
    {
      title: USER_CENTER_GROUP_TITLES.interaction,
      icon: 'Tools',
      children: interactionChildren,
    },
    {
      title: USER_CENTER_GROUP_TITLES.account,
      icon: 'User',
      children: accountChildren,
    },
  ]

  return [...leaves, ...groups]
}

/**
 * EDITOR 在「家族事务」中隐藏"我的验证 / 我的申请"（无修改/邀请权限）。
 * 返回新数组，不修改入参。
 */
export const filterMenuByRole = (
  items: MenuEntry[],
  clan: ClanContext | null,
): MenuEntry[] => {
  const role = effectiveRole(clan)
  const isEditor = role === 'EDITOR'
  const isNoClan = !hasClan(clan)

  return items
    .map<MenuEntry>((item) => {
      // leaf：直接隐藏条件
      if (typeof (item as MenuLeaf).path === 'string') {
        const path = (item as MenuLeaf).path
        // 未加入家族：隐藏依赖 clan slug 的项
        if (isNoClan) {
          if (
            path === '/user-center/clan-overview' ||
            path.startsWith('/tree/') ||
            path.startsWith('/cepu/') ||
            path.startsWith('/zupu/')
          ) {
            return null as unknown as MenuEntry
          }
        }
        return item
      }
      // group：处理子项
      const group = item as MenuGroup
      let children = group.children
      // EDITOR 在「家族事务」隐藏"我的验证 / 我的申请"
      if (isEditor && group.title === USER_CENTER_GROUP_TITLES.familyAffairs) {
        children = children.filter(
          (c) =>
            c.title !== FAMILY_AFFAIRS_ITEMS.myVerify &&
            c.title !== FAMILY_AFFAIRS_ITEMS.myApplications,
        )
      }
      // 未加入家族：「家族事务」整体隐藏
      if (isNoClan && group.title === USER_CENTER_GROUP_TITLES.familyAffairs) {
        return null as unknown as MenuEntry
      }
      return { ...group, children }
    })
    .filter((it): it is MenuEntry => it !== null)
}

/**
 * 菜单搜索：按关键词（不区分大小写）过滤，分组下子项命中即保留。
 * 命中策略：
 * - leaf：title 包含关键字即保留；
 * - group：保留 children 中命中的项；若所有子项都被过滤则整组隐藏。
 */
export const searchMenu = (items: MenuEntry[], keyword: string): MenuEntry[] => {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return items
  return items
    .map<MenuEntry | null>((item) => {
      if (typeof (item as MenuLeaf).path === 'string') {
        const title = (item as MenuLeaf).title.toLowerCase()
        return title.includes(kw) ? item : null
      }
      const group = item as MenuGroup
      const children = group.children.filter((c) =>
        c.title.toLowerCase().includes(kw),
      )
      if (children.length === 0) return null
      return { ...group, children }
    })
    .filter((it): it is MenuEntry => it !== null)
}

/**
 * 是否应显示底部"家族管理后台"按钮（OWNER / ADMIN 才显示）。
 */
export const shouldShowAdminEntry = (clan: ClanContext | null): boolean => {
  const role = effectiveRole(clan)
  return role === 'OWNER' || role === 'ADMIN'
}