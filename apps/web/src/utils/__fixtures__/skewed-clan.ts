/**
 * 1000 人演示族谱。十六世，人数先增后减，不把某一代撑成几百人、后面又只剩单传。
 *
 * 1000 人时各代人数（generation 从 0 起，画面上是 1 世到 16 世）：
 * 1、3、6、12、22、38、68、92、120、122、117、109、105、88、61、36。
 * 长房每代留一人作为主脉，其余按房均分，后几代有的支系不再续。
 */
import type { LayoutEdge, LayoutNode } from '@/types/layout'

export interface SkewedClanStats {
  total: number
  deepGenerations: number
  wideFanout: number
  widestGeneration: number
  widestCount: number
  generationCounts: Record<number, number>
}

/** 1000 人的基准曲线。其它人数按这个形状缩放，并保证总和恰好等于目标。 */
const CLAN_SHAPE = [1, 3, 6, 12, 22, 38, 68, 92, 120, 122, 117, 109, 105, 88, 61, 36]

/**
 * 与演示库字辈表相同：第 1 世「熹」，第 2 世「塾」，依次向后。
 * 见 demo-seed.service.ts 的 ZIBEI_CHARS。
 */
const DEMO_GENERATION_WORDS = ['熹', '塾', '埜', '在', '鉴', '铨', '潜', '鋆', '浚', '洪', '沐', '深', '桂', '桐', '森', '柄', '模', '朴', '梓', '樾', '楷', '检', '樽', '栻', '栉', '栒', '栋', '梁', '焕', '炽', '炜', '炤', '焘', '煜', '烨', '炳']

const MAIN_NAMES = ['承宗', '承志', '承先', '承业', '承德', '承恩', '承训', '承谟', '承烈', '承基', '承祧', '承绪', '承祐', '承祚', '承庆']

const GIVEN_NAMES = [
  '伯安', '仲和', '叔明', '季成', '孟坚', '仲远', '叔夜', '季直',
  '文渊', '文正', '文昭', '文定', '景行', '景明', '景和', '景仁',
  '元亮', '元方', '元礼', '元凯', '子长', '子建', '子真', '子云',
  '廷玉', '廷珪', '廷珍', '廷瓒', '汝为', '汝舟', '汝霖', '汝梅',
  '德润', '德辉', '德馨', '德裕', '世昌', '世延', '世南', '世卿',
]

export function clanGenerationPlan(targetSize = 1000): number[] {
  if (!(targetSize >= 1)) throw new Error(`targetSize must be positive, got ${targetSize}`)
  if (targetSize === CLAN_SHAPE.reduce((sum, count) => sum + count, 0)) return CLAN_SHAPE.slice()
  const shapeSum = CLAN_SHAPE.reduce((sum, count) => sum + count, 0)
  const plan = CLAN_SHAPE.map((count, index) => (
    index === 0 ? 1 : Math.max(2, Math.round((count * targetSize) / shapeSum))
  ))
  plan[0] = 1
  let drift = targetSize - plan.reduce((sum, count) => sum + count, 0)
  let guard = 0
  while (drift !== 0 && guard < targetSize * 2) {
    const index = 1 + (guard % (plan.length - 1))
    if (drift > 0) {
      plan[index] += 1
      drift -= 1
    } else if (plan[index] > 2) {
      plan[index] -= 1
      drift += 1
    }
    guard += 1
  }
  if (drift !== 0) throw new Error(`cannot fit ${targetSize} people into the generation curve`)
  return plan
}

export function buildSkewedClan(
  targetSize = 1000,
): { nodes: LayoutNode[]; edges: LayoutEdge[]; stats: SkewedClanStats } {
  const plan = clanGenerationPlan(targetSize)
  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []
  let edgeSeq = 0
  let widestSiblingGroup = 1

  const add = (id: string, label: string, generation: number, isMainLineage: boolean) => {
    nodes.push({
      id,
      label,
      gender: 'male',
      isMainLineage,
      isLiving: false,
      generation,
      width: 132,
      height: 100,
    })
  }
  const link = (source: string, target: string, birthOrder: number) => {
    edges.push({
      id: `sk-${edgeSeq++}`,
      source,
      target,
      kind: 'parent-child',
      birthOrder,
    })
  }

  add('root', '始祖', 0, true)
  let parents = ['root']
  for (let gen = 0; gen < plan.length - 1; gen++) {
    const childCount = plan[gen + 1]
    const share = Math.floor(childCount / parents.length)
    let remainder = childCount % parents.length
    const next: string[] = []
    for (let parentIndex = 0; parentIndex < parents.length; parentIndex++) {
      const siblings = share + (parentIndex < remainder ? 1 : 0)
      if (siblings > widestSiblingGroup) widestSiblingGroup = siblings
      for (let birth = 0; birth < siblings; birth++) {
        const generation = gen + 1
        const isMain = parentIndex === 0 && birth === 0
        const id = isMain ? `deep-${generation}` : `p-${generation}-${next.length}`
        const label = isMain
          ? MAIN_NAMES[generation - 1] || `长${generation}`
          : GIVEN_NAMES[(generation * 13 + next.length) % GIVEN_NAMES.length]
        add(id, label, generation, isMain)
        link(parents[parentIndex], id, birth + 1)
        next.push(id)
      }
    }
    if (next.length !== childCount) {
      throw new Error(`generation ${gen + 1} built ${next.length}, planned ${childCount}`)
    }
    parents = next
  }

  const generationCounts: Record<number, number> = {}
  for (const node of nodes) {
    generationCounts[node.generation] = (generationCounts[node.generation] || 0) + 1
  }
  let widestGeneration = 0
  let widestCount = 0
  for (const [gen, count] of Object.entries(generationCounts)) {
    if (count > widestCount) {
      widestGeneration = Number(gen)
      widestCount = count
    }
  }

  return {
    nodes,
    edges,
    stats: {
      total: nodes.length,
      deepGenerations: plan.length,
      wideFanout: widestSiblingGroup,
      widestGeneration,
      widestCount,
      generationCounts,
    },
  }
}

/** 同一棵畸形树，做成家谱节点，供古谱视图直接渲染。根节点用三字名和两位配偶。 */
export function buildSkewedGenealogyTree(targetSize = 1000): { root: any; count: number } {
  const clan = buildSkewedClan(targetSize)
  const people = new Map<string, any>()
  for (const node of clan.nodes) {
    const person: any = {
      id: node.id,
      full_name: node.id === 'root' ? '欧阳修' : node.label,
      generation_word: DEMO_GENERATION_WORDS[node.generation % DEMO_GENERATION_WORDS.length],
      gender: 'male',
      is_living: false,
      has_photo: false,
      children: [] as any[],
    }
    if (node.id === 'root' || node.id === 'deep-1') {
      person.spouses = [
        { name: '刘', gender: 'female', marriage_order: 1 },
        { name: '王', gender: 'female', marriage_order: 2 },
      ]
    }
    people.set(node.id, person)
  }
  for (const edge of clan.edges) {
    const parent = people.get(edge.source)
    const child = people.get(edge.target)
    if (parent && child) parent.children.push(child)
  }
  const root = people.get('root')
  if (!root) throw new Error('skewed genealogy is missing the root')
  return { root, count: clan.nodes.length }
}
