/**
 * 族员用户中心菜单纯函数单测
 * --------------------------------------------------------------------
 * 覆盖：
 * - getUserCenterMenuGroups（5 种角色 + 2 状态：已加入/未加入）
 * - filterMenuByRole（按计划书 §4.3 矩阵）
 * - searchMenu
 * - shouldShowAdminEntry
 * - partitionMenu / 类型守卫
 */
import { describe, it, expect } from 'vitest'
import {
  clanKey,
  effectiveRole,
  filterMenuByRole,
  getUserCenterMenuGroups,
  hasClan,
  searchMenu,
  shouldShowAdminEntry,
  type ClanContext,
  type ClanRole,
} from './userCenterMenu'
import {
  ACCOUNT_ITEMS,
  FAMILY_AFFAIRS_ITEMS,
  GENEALOGY_ITEMS,
  INTERACTION_ITEMS,
  MY_CONTENT_ITEMS,
  USER_CENTER_GROUP_TITLES,
  USER_CENTER_LEAF_TITLES,
} from './menuCopy'
import { isGroup, isLeaf, partitionMenu, type MenuEntry } from './menuTypes'

const ctx = (
  role: ClanRole | undefined,
  slug: string | null = 'zhu-xi',
): ClanContext | null =>
  slug ? { slug, role } : null

describe('getUserCenterMenuGroups', () => {
  it('已加入家族（OWNER）返回完整菜单：2 leaf + 5 group（含家族事务）', () => {
    const items = getUserCenterMenuGroups({ clan: ctx('OWNER') })
    expect(items.length).toBe(7)
    const { leaves, groups } = partitionMenu(items)
    expect(leaves.map((l) => l.title)).toEqual([
      USER_CENTER_LEAF_TITLES.home,
      USER_CENTER_LEAF_TITLES.clanOverview,
    ])
    expect(groups.map((g) => g.title)).toEqual([
      USER_CENTER_GROUP_TITLES.genealogy,
      USER_CENTER_GROUP_TITLES.myContent,
      USER_CENTER_GROUP_TITLES.familyAffairs,
      USER_CENTER_GROUP_TITLES.interaction,
      USER_CENTER_GROUP_TITLES.account,
    ])
  })

  it('未加入家族时，族谱分组只剩"我的家族"，家族事务整组隐藏', () => {
    const items = getUserCenterMenuGroups({ clan: null })
    const groups = items.filter(isGroup)
    const genealogy = groups.find((g) => g.title === USER_CENTER_GROUP_TITLES.genealogy)!
    expect(genealogy.children.map((c) => c.title)).toEqual([
      GENEALOGY_ITEMS.myFamilies,
    ])
    expect(
      groups.find((g) => g.title === USER_CENTER_GROUP_TITLES.familyAffairs),
    ).toBeUndefined()
  })

  it('未加入家族时，我的内容只剩"个人空间"', () => {
    const items = getUserCenterMenuGroups({ clan: null })
    const groups = items.filter(isGroup)
    const myContent = groups.find((g) => g.title === USER_CENTER_GROUP_TITLES.myContent)!
    expect(myContent.children.map((c) => c.title)).toEqual([
      MY_CONTENT_ITEMS.personalSpace,
    ])
  })

  it('slug 与 id 同时存在时，路径优先使用 slug', () => {
    const items = getUserCenterMenuGroups({
      clan: { slug: 'zhu-xi', id: 'clan-001', role: 'ADMIN' },
    })
    const genealogy = items
      .filter(isGroup)
      .find((g) => g.title === USER_CENTER_GROUP_TITLES.genealogy)!
    const tree = genealogy.children.find((c) => c.title === GENEALOGY_ITEMS.tree)!
    expect(tree.path).toBe('/tree/zhu-xi')
  })

  it('没有 slug 但有 id 时，路径回退到 id', () => {
    const items = getUserCenterMenuGroups({
      clan: { id: 'clan-001', role: 'VIEWER' },
    })
    const genealogy = items
      .filter(isGroup)
      .find((g) => g.title === USER_CENTER_GROUP_TITLES.genealogy)!
    const tree = genealogy.children.find((c) => c.title === GENEALOGY_ITEMS.tree)!
    expect(tree.path).toBe('/tree/clan-001')
  })
})

describe('filterMenuByRole（§4.3 角色矩阵）', () => {
  const roleCases: ClanRole[] = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER', 'MEMBER']

  roleCases.forEach((role) => {
    it(`角色 ${role}：已加入家族时可见全部分组（含家族事务）`, () => {
      const items = filterMenuByRole(
        getUserCenterMenuGroups({ clan: ctx(role) }),
        ctx(role),
      )
      const titles = items.filter(isGroup).map((g) => g.title)
      expect(titles).toContain(USER_CENTER_GROUP_TITLES.familyAffairs)
    })
  })

  it('EDITOR 在「家族事务」看不到"我的验证 / 我的申请"，但保留其它项', () => {
    const items = filterMenuByRole(
      getUserCenterMenuGroups({ clan: ctx('EDITOR') }),
      ctx('EDITOR'),
    )
    const affairs = items
      .filter(isGroup)
      .find((g) => g.title === USER_CENTER_GROUP_TITLES.familyAffairs)!
    const titles = affairs.children.map((c) => c.title)
    expect(titles).not.toContain(FAMILY_AFFAIRS_ITEMS.myVerify)
    expect(titles).not.toContain(FAMILY_AFFAIRS_ITEMS.myApplications)
    expect(titles).toContain(FAMILY_AFFAIRS_ITEMS.familyRelation)
    expect(titles).toContain(FAMILY_AFFAIRS_ITEMS.announcements)
    expect(titles).toContain(FAMILY_AFFAIRS_ITEMS.orders)
  })

  it('OWNER / ADMIN / VIEWER 在「家族事务」能看到全部 5 项', () => {
    ;(['OWNER', 'ADMIN', 'VIEWER'] as ClanRole[]).forEach((role) => {
      const items = filterMenuByRole(
        getUserCenterMenuGroups({ clan: ctx(role) }),
        ctx(role),
      )
      const affairs = items
        .filter(isGroup)
        .find((g) => g.title === USER_CENTER_GROUP_TITLES.familyAffairs)!
      expect(affairs.children.length).toBe(5)
    })
  })

  it('未加入家族：依赖 clan 的 leaf 全部隐藏', () => {
    const items = filterMenuByRole(
      getUserCenterMenuGroups({ clan: null }),
      null,
    )
    const leaves = items.filter(isLeaf).map((l) => l.path)
    expect(leaves).not.toContain('/user-center/clan-overview')
    expect(leaves).not.toContain('/tree/')
    expect(leaves).not.toContain('/cepu/')
    expect(leaves).not.toContain('/zupu/')
    expect(leaves).toContain('/user-center') // 首页保留
  })

  it('未加入家族：「家族事务」整组不出现', () => {
    const items = filterMenuByRole(
      getUserCenterMenuGroups({ clan: null }),
      null,
    )
    expect(
      items.filter(isGroup).find((g) => g.title === USER_CENTER_GROUP_TITLES.familyAffairs),
    ).toBeUndefined()
  })

  it('未加入家族：「互动与工具」「账户与服务」仍可见', () => {
    const items = filterMenuByRole(
      getUserCenterMenuGroups({ clan: null }),
      null,
    )
    const titles = items.filter(isGroup).map((g) => g.title)
    expect(titles).toContain(USER_CENTER_GROUP_TITLES.interaction)
    expect(titles).toContain(USER_CENTER_GROUP_TITLES.account)
  })
})

describe('searchMenu', () => {
  const base = getUserCenterMenuGroups({ clan: ctx('ADMIN') })

  it('空关键字返回原菜单', () => {
    expect(searchMenu(base, '')).toBe(base)
    expect(searchMenu(base, '   ').length).toBe(base.length)
  })

  it('命中单个 leaf：返回单 leaf 列表', () => {
    const result = searchMenu(base, '设置')
    expect(result.length).toBe(1)
    expect(result[0].title).toBe(USER_CENTER_GROUP_TITLES.account)
  })

  it('命中子项标题：返回包含该项的分组', () => {
    // 当前实现仅搜索子项标题（与 AdminLayout 一致）；
    // "族谱"分组中含"树谱"子项，"族谱"二字搜索应空，"树谱"应命中。
    const groupResult = searchMenu(base, '族谱')
    expect(groupResult.length).toBe(0)

    const childResult = searchMenu(base, '树谱')
    expect(childResult.length).toBeGreaterThanOrEqual(1)
    expect(childResult[0].title).toBe(USER_CENTER_GROUP_TITLES.genealogy)
    expect(isGroup(childResult[0])).toBe(true)
    if (isGroup(childResult[0])) {
      expect(childResult[0].children.map((c) => c.title)).toContain(
        GENEALOGY_ITEMS.tree,
      )
    }
  })

  it('英文关键字大小写不敏感', () => {
    const upper = searchMenu(base, 'VIDEO')
    const lower = searchMenu(base, 'video')
    expect(upper.length).toBe(lower.length)
  })

  it('无命中返回空数组', () => {
    expect(searchMenu(base, '不存在的功能XYZ').length).toBe(0)
  })

  it('分组下子项全部被过滤则整组隐藏', () => {
    // 找出一个分组下子项都不匹配 "设置" 的分组
    const result = searchMenu(base, '个人空间')
    const titles = result.map((r) => r.title)
    expect(titles).toContain(USER_CENTER_GROUP_TITLES.myContent)
    // 其它分组不应出现（因为它们没有"个人空间"子项）
    expect(titles).not.toContain(USER_CENTER_GROUP_TITLES.account)
  })
})

describe('shouldShowAdminEntry', () => {
  it('OWNER / ADMIN 显示', () => {
    expect(shouldShowAdminEntry(ctx('OWNER'))).toBe(true)
    expect(shouldShowAdminEntry(ctx('ADMIN'))).toBe(true)
  })

  it('EDITOR / VIEWER / MEMBER 不显示', () => {
    expect(shouldShowAdminEntry(ctx('EDITOR'))).toBe(false)
    expect(shouldShowAdminEntry(ctx('VIEWER'))).toBe(false)
    expect(shouldShowAdminEntry(ctx('MEMBER'))).toBe(false)
  })

  it('未加入家族时不显示', () => {
    expect(shouldShowAdminEntry(null)).toBe(false)
  })
})

describe('类型守卫与工具函数', () => {
  it('isLeaf / isGroup 互斥', () => {
    const items: MenuEntry[] = getUserCenterMenuGroups({ clan: ctx('ADMIN') })
    const leaves = items.filter(isLeaf)
    const groups = items.filter(isGroup)
    expect(leaves.length + groups.length).toBe(items.length)
    expect(leaves.length).toBe(2)
    expect(groups.length).toBe(5)
  })

  it('partitionMenu 返回对象形态正确', () => {
    const items: MenuEntry[] = getUserCenterMenuGroups({ clan: ctx('ADMIN') })
    const { leaves, groups } = partitionMenu(items)
    expect(Array.isArray(leaves)).toBe(true)
    expect(Array.isArray(groups)).toBe(true)
    expect(leaves.every(isLeaf)).toBe(true)
    expect(groups.every(isGroup)).toBe(true)
  })

  it('clanKey / hasClan / effectiveRole 一致', () => {
    expect(clanKey(null)).toBe('')
    expect(clanKey({ slug: 's', id: 'i' })).toBe('s')
    expect(clanKey({ id: 'i' })).toBe('i')
    expect(hasClan(null)).toBe(false)
    expect(hasClan({ slug: 's' })).toBe(true)
    expect(effectiveRole(null)).toBe('MEMBER')
    expect(effectiveRole({ slug: 's', role: 'OWNER' })).toBe('OWNER')
    expect(effectiveRole({ slug: 's' })).toBe('MEMBER')
  })
})

describe('iconMap 注册完整性', () => {
  // 延迟加载以避免在 beforeAll 中出现副作用
  it('所有菜单项引用的 icon 键值均在 iconMap 中', async () => {
    const { iconMap } = await import('./iconMap')
    const items = getUserCenterMenuGroups({ clan: ctx('ADMIN') })
    const referenced: string[] = []
    items.forEach((it) => {
      referenced.push((it as { icon: string }).icon)
      if (isGroup(it)) it.children.forEach((c) => referenced.push(c.icon))
    })
    const missing = referenced.filter((k) => !Object.prototype.hasOwnProperty.call(iconMap, k))
    expect(missing).toEqual([])
  })
})