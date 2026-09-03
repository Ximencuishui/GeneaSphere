/**
 * layout-engine.main-flows.spec.ts - 12 个主流程测试
 *
 * [W5.1 2026-09-01] LayoutEngine v6 第五阶段：测试收敛。
 *
 * 目标：从 38 个详细回归测试收敛到 12 个主流程测试，每个主流程测试覆盖一组相关功能。
 *
 * 12 主流程列表（见 plan §W5）：
 * | # | 名称 | 覆盖点 |
 * |---|------|--------|
 * | 1 | 一夫多妻横向排序 | 妻妾按 marriageOrder 从左到右 |
 * | 2 | spouse 边 junction 与梳状路径 | junction X = 丈夫右边缘，path 严格正交 |
 * | 3 | 同代对齐 | 同代节点 Y 一致 |
 * | 4 | 单子 L 形 + 多子 T 形 | 父子边正交路径形态 |
 * | 5 | v6.0.8 共享 drop line | 所有兄弟起点 X = coupleUnitMidX（与 motherId 无关） |
 * | 6 | 双重身份 | X 既是子又是配偶 |
 * | 7 | 兄弟共妻 | H1/H2 共 W |
 * | 8 | 连襟 | 兄弟各婚不同配偶 |
 * | 9 | 主脉对齐 | 主脉节点 X 平均 ≈ 0 |
 * | 10 | 子树避让 | 同代节点外接矩形不重叠 |
 * | 11 | birthOrder 排序 | 兄弟按 birthOrder 升序 |
 * | 12 | 计算鲁棒性 | layout 不崩溃（多场景混合） |
 *
 * 与 layout-engine.spec.ts（38 个详细回归测试）的关系：
 * - 本文件是高层语义测试：每个 it() 对应一个核心行为契约
 * - layout-engine.spec.ts 是低层断言测试：保留历史回归细节
 * - 两者并立存在，详细回归不丢失
 */

import { describe, it, expect } from 'vitest'
import { LayoutEngine } from '@/utils/layout-engine'
import type { LayoutNode, LayoutEdge, LayoutConfig } from '@/types/layout'

// ---------- 测试数据构造器（精简）----------

function buildMultiWife() {
  const W = 64
  const H = 28
  const nodes: LayoutNode[] = [
    { id: '1', label: '夫', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
    { id: '2', label: '妻1', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
    { id: '3', label: '妻2', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
    { id: '4', label: '妻3', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
    { id: '5', label: '妻4', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
    { id: 'A', label: '继A', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
    { id: 'B', label: '继B', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
    { id: 'C', label: '继C', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
  ]
  const edges: LayoutEdge[] = [
    { id: 'sp1', source: '1', target: '2', kind: 'spouse', marriageOrder: 1, isCurrent: true },
    { id: 'sp2', source: '1', target: '3', kind: 'spouse', marriageOrder: 2, isCurrent: true },
    { id: 'sp3', source: '1', target: '4', kind: 'spouse', marriageOrder: 3, isCurrent: true },
    { id: 'sp4', source: '1', target: '5', kind: 'spouse', marriageOrder: 4, isCurrent: true },
    { id: 'p1', source: '2', target: 'A', kind: 'parent-child' },
    { id: 'p2', source: '3', target: 'B', kind: 'parent-child' },
    { id: 'p3', source: '5', target: 'C', kind: 'parent-child' },
  ]
  return { nodes, edges }
}

function buildSingleWifeMultiKids() {
  const W = 64
  const H = 28
  const nodes: LayoutNode[] = [
    { id: 'F', label: '夫', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
    { id: 'W', label: '妻', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
    { id: 'C1', label: '子1', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
    { id: 'C2', label: '子2', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
    { id: 'C3', label: '子3', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
  ]
  const edges: LayoutEdge[] = [
    { id: 'sp', source: 'F', target: 'W', kind: 'spouse', marriageOrder: 1, isCurrent: true },
    { id: 'pc1', source: 'W', target: 'C1', kind: 'parent-child', birthOrder: 1 },
    { id: 'pc2', source: 'W', target: 'C2', kind: 'parent-child', birthOrder: 2 },
    { id: 'pc3', source: 'W', target: 'C3', kind: 'parent-child', birthOrder: 3 },
  ]
  return { nodes, edges }
}

const baseConfig: Partial<LayoutConfig> = {
  nodeSep: 24,
  rankSep: 48,
  spouseGap: 32,
  marriageJunctionOffset: 0,
  edgeHorizontalSeparation: 0,
  resolveSubtreeOverlap: true,
  mainLineageCenter: true,
  spouseOptimization: true,
}

const engine = () => new LayoutEngine({
  canvasSize: { width: 1200, height: 800 },
  config: baseConfig,
})

// ==================== 1. 一夫多妻横向排序 ====================

describe('W5.主流程 #1: 一夫多妻横向排序', () => {
  it('4 位妻子 X 严格按 marriageOrder 从左到右', async () => {
    const { nodes, edges } = buildMultiWife()
    const result = await engine().calculateLayout(nodes, edges)
    const pos = new Map(result.nodes.map(n => [n.id, n]))
    const xs = ['2', '3', '4', '5'].map(id => pos.get(id)!.x)
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1])
    }
  })
})

// ==================== 2. spouse 边 junction 与梳状路径 ====================

describe('W5.主流程 #2: spouse 边 junction 与梳状路径', () => {
  it('junction X = 丈夫右边缘，path 严格正交（无斜线）', async () => {
    const { nodes, edges } = buildMultiWife()
    const result = await engine().calculateLayout(nodes, edges)
    const spouseEdges = result.edges.filter(e => e.kind === 'spouse')
    const husbandPos = result.nodes.find(n => n.id === '1')!
    const expectedJX = husbandPos.x + husbandPos.width / 2

    // 所有 spouse 边共享同一 junction X
    const junctions = spouseEdges.map(e => e.path?.junction).filter(Boolean) as Array<{ x: number; y: number }>
    expect(junctions.length).toBe(4)
    for (const j of junctions) {
      expect(j.x).toBeCloseTo(expectedJX, 0)
    }

    // path 严格正交（相邻点 dx=0 或 dy=0）
    for (const e of spouseEdges) {
      const pts = e.path?.points ?? []
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1].x - pts[i].x
        const dy = pts[i + 1].y - pts[i].y
        expect(dx === 0 || dy === 0).toBe(true)
      }
    }
  })
})

// ==================== 3. 同代对齐 ====================

describe('W5.主流程 #3: 同代对齐', () => {
  it('同代子节点 Y 严格一致（dagre layered 算法 + alignMainLineage 阶段保证）', async () => {
    const { nodes, edges } = buildSingleWifeMultiKids()
    const result = await engine().calculateLayout(nodes, edges)
    const pos = new Map(result.nodes.map(n => [n.id, n]))
    // 三个子节点都在 gen=1 → Y 应一致
    const ys = ['C1', 'C2', 'C3'].map(id => pos.get(id)!.y)
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeCloseTo(ys[0], 1)
    }
  })
})

// ==================== 4. 单子 L 形 + 多子 T 形 ====================

describe('W5.主流程 #4: 父子边正交路径形态', () => {
  it('单子场景父子边 path 简洁（L 形）；多子场景 T 形梳状', async () => {
    // 单子
    const singleNodes: LayoutNode[] = [
      { id: 'F', label: 'F', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: 64, height: 28 },
      { id: 'C', label: 'C', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: 64, height: 28 },
    ]
    const singleEdges: LayoutEdge[] = [
      { id: 'pc', source: 'F', target: 'C', kind: 'parent-child' },
    ]
    const singleResult = await engine().calculateLayout(singleNodes, singleEdges)
    const singleParentChild = singleResult.edges.filter(e => e.kind === 'parent-child')[0]
    const singlePts = singleParentChild.path?.points ?? []
    // 单子：path 点数较少（L 形 ≤ 4）
    expect(singlePts.length).toBeLessThanOrEqual(4)

    // 多子
    const { nodes: multiNodes, edges: multiEdges } = buildSingleWifeMultiKids()
    const multiResult = await engine().calculateLayout(multiNodes, multiEdges)
    const multiParentChildEdges = multiResult.edges.filter(e => e.kind === 'parent-child')
    expect(multiParentChildEdges.length).toBe(3)
    // 多子：每条父子边 path 点数 ≥ 3（T 形 ≥ 4）
    for (const e of multiParentChildEdges) {
      const pts = e.path?.points ?? []
      expect(pts.length).toBeGreaterThanOrEqual(3)
    }
  })
})

// ==================== 5. v6.0.8 共享 drop line ====================

/**
 * [v6.0.8 2026-09-02] 走线解耦母亲归属：
 *   所有兄弟（无论 motherId 指向妻 / 妾 / 外部 / 未设）统一从 coupleUnitMidX 出发。
 *   母亲归属仅通过 `isConcubineChild + palette` 样式区分（G6 渲染层处理）。
 *
 * 与 v6.0.7 行为差异：
 *   - v6.0.7：motherId 优先 per-edge 分流到母亲节点中心 X
 *   - v6.0.8：移除 motherId 分流，统一从 coupleUnitMidX 出发
 *
 * 详见 docs/族谱树布局引擎 v6 §3.5 / §8.1 / §8.1 P4.1-P4.3
 */
describe('W6.0.8.主流程 #5: 共享 drop line（所有兄弟起点 X = coupleUnitMidX）', () => {
  // [v6.0.8-原 #5 改写] 一妻一妾 + motherId 区分 → 现在全部走 coupleUnitMidX
  it('一妻一妾：正妻之子 + 妾之子起点 X 完全相同 = coupleUnitMidX（v6.0.8 解耦 motherId）', async () => {
    const W = 64, H = 28
    const nodes: LayoutNode[] = [
      { id: 'F', label: 'F', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
      { id: 'W1', label: 'W1正妻', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'W2', label: 'W2妾', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'C1', label: 'C1正妻子', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'C2', label: 'C2妾子', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
    ]
    const edges: LayoutEdge[] = [
      { id: 'sp1', source: 'F', target: 'W1', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'sp2', source: 'F', target: 'W2', kind: 'spouse', marriageOrder: 2, isCurrent: true },
      { id: 'pc1', source: 'F', target: 'C1', kind: 'parent-child', motherId: 'W1' },
      { id: 'pc2', source: 'F', target: 'C2', kind: 'parent-child', motherId: 'W2' },
    ]
    const result = await engine().calculateLayout(nodes, edges)
    const pos = new Map(result.nodes.map(n => [n.id, n]))
    const fPos = pos.get('F')!
    const w1Pos = pos.get('W1')!
    const w2Pos = pos.get('W2')!
    // v6.0.8: coupleUnitMidX = (父.x + 最右配偶.x) / 2 = (F.x + W2.x) / 2
    const rightmostSpouseX = Math.max(w1Pos.x, w2Pos.x)
    const expectedStartX = (fPos.x + rightmostSpouseX) / 2

    const c1Edge = result.edges.find(e => e.target === 'C1')!
    const c2Edge = result.edges.find(e => e.target === 'C2')!
    const c1Start = c1Edge.path?.points[0]
    const c2Start = c2Edge.path?.points[0]

    // [v6.0.8 核心] C1（正妻子，motherId=W1）起点 X = coupleUnitMidX
    expect(c1Start?.x).toBeCloseTo(expectedStartX, 0)
    // [v6.0.8 核心] C2（妾子，motherId=W2）起点 X = coupleUnitMidX（不再 = W2.x）
    expect(c2Start?.x).toBeCloseTo(expectedStartX, 0)
    // [v6.0.8 核心] C1 与 C2 起点 X 完全相同（共享 drop line）
    expect(c1Start?.x).toBe(c2Start?.x)
    // [v6.0.8 核心] 起点 X 等于 coupleUnitMidX，不等于父节点中心 X
    // 注：原版另断言「不等于母亲 X」（v6.0.7 per-edge 分流时该断言有效），但 v6.0.8 起
    //   layout 自身可能把妻妾组的中点 X 与某位母亲 X 重合，故放弃此弱性断言，保留「共享」核心。
    expect(c1Start?.x).not.toBe(fPos.x)
    expect(c2Start?.x).not.toBe(fPos.x)
  })

  // [v6.0.8-原 #5b 改写] 无 motherId 仍然走 coupleUnitMidX（不是 fallback，是唯一规则）
  it('无 motherId 时起点 X = coupleUnitMidX（v6.0.8 唯一规则，无 fallback 概念）', async () => {
    const W = 64, H = 28
    const nodes: LayoutNode[] = [
      { id: 'F', label: 'F', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
      { id: 'W1', label: 'W1', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'W2', label: 'W2', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'C', label: 'C', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
    ]
    const edges: LayoutEdge[] = [
      { id: 'sp1', source: 'F', target: 'W1', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'sp2', source: 'F', target: 'W2', kind: 'spouse', marriageOrder: 2, isCurrent: true },
      // C 无 motherId
      { id: 'pc', source: 'F', target: 'C', kind: 'parent-child' },
    ]
    const result = await engine().calculateLayout(nodes, edges)
    const pos = new Map(result.nodes.map(n => [n.id, n]))
    const fPos = pos.get('F')!
    const w1Pos = pos.get('W1')!
    const w2Pos = pos.get('W2')!
    const rightmostSpouseX = Math.max(w1Pos.x, w2Pos.x)
    const expectedStartX = (fPos.x + rightmostSpouseX) / 2

    const cEdge = result.edges.find(e => e.target === 'C')!
    const cStart = cEdge.path?.points[0]
    expect(cStart?.x).toBeCloseTo(expectedStartX, 0)
  })

  // ============== v6.0.8 专项新增用例 ==============

  it('[v6.0.8-1] 一夫 4 妻 + 8 子（每妻 2 子 + 全部 motherId 不同）：8 条边起点 X 完全相同', async () => {
    const W = 64, H = 28
    const nodes: LayoutNode[] = [
      { id: 'F', label: 'F', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
      { id: 'W1', label: 'W1', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'W2', label: 'W2', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'W3', label: 'W3', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'W4', label: 'W4', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      // 8 个子女（每妻 2 子），全部带 motherId 区分
      { id: 'c1a', label: 'c1a', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'c1b', label: 'c1b', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'c2a', label: 'c2a', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'c2b', label: 'c2b', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'c3a', label: 'c3a', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'c3b', label: 'c3b', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'c4a', label: 'c4a', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'c4b', label: 'c4b', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
    ]
    const edges: LayoutEdge[] = [
      { id: 'sp1', source: 'F', target: 'W1', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'sp2', source: 'F', target: 'W2', kind: 'spouse', marriageOrder: 2, isCurrent: true },
      { id: 'sp3', source: 'F', target: 'W3', kind: 'spouse', marriageOrder: 3, isCurrent: true },
      { id: 'sp4', source: 'F', target: 'W4', kind: 'spouse', marriageOrder: 4, isCurrent: true },
      // 8 条父子边，motherId 各指向不同妻
      { id: 'pc1a', source: 'F', target: 'c1a', kind: 'parent-child', motherId: 'W1' },
      { id: 'pc1b', source: 'F', target: 'c1b', kind: 'parent-child', motherId: 'W1' },
      { id: 'pc2a', source: 'F', target: 'c2a', kind: 'parent-child', motherId: 'W2' },
      { id: 'pc2b', source: 'F', target: 'c2b', kind: 'parent-child', motherId: 'W2' },
      { id: 'pc3a', source: 'F', target: 'c3a', kind: 'parent-child', motherId: 'W3' },
      { id: 'pc3b', source: 'F', target: 'c3b', kind: 'parent-child', motherId: 'W3' },
      { id: 'pc4a', source: 'F', target: 'c4a', kind: 'parent-child', motherId: 'W4' },
      { id: 'pc4b', source: 'F', target: 'c4b', kind: 'parent-child', motherId: 'W4' },
    ]
    const result = await engine().calculateLayout(nodes, edges)
    const pos = new Map(result.nodes.map(n => [n.id, n]))
    const fPos = pos.get('F')!
    const w4Pos = pos.get('W4')! // 最右配偶
    const expectedStartX = (fPos.x + w4Pos.x) / 2

    // 收集 8 条父子边的起点 X
    const startXs: number[] = []
    for (const childId of ['c1a', 'c1b', 'c2a', 'c2b', 'c3a', 'c3b', 'c4a', 'c4b']) {
      const edge = result.edges.find(e => e.target === childId)!
      startXs.push(edge.path!.points[0].x)
    }

    // [v6.0.8 核心] 8 个起点 X **完全相同**
    const uniqueXs = [...new Set(startXs)]
    expect(uniqueXs.length).toBe(1)
    // [v6.0.8 核心] 起点 X = coupleUnitMidX
    expect(uniqueXs[0]).toBeCloseTo(expectedStartX, 0)
  })

  it('[v6.0.8-2] 混合 motherId：有 motherId 指向妾 + 有 motherId=null（缺失）：两组兄弟起点 X 完全相同', async () => {
    const W = 64, H = 28
    const nodes: LayoutNode[] = [
      { id: 'F', label: 'F', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
      { id: 'W1', label: 'W1正妻', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'W2', label: 'W2妾', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'C1', label: 'C1正妻子', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'C2', label: 'C2妾子', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'C3', label: 'C3（母未标记）', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
    ]
    const edges: LayoutEdge[] = [
      { id: 'sp1', source: 'F', target: 'W1', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'sp2', source: 'F', target: 'W2', kind: 'spouse', marriageOrder: 2, isCurrent: true },
      { id: 'pc1', source: 'F', target: 'C1', kind: 'parent-child', motherId: 'W1' }, // 正妻之子
      { id: 'pc2', source: 'F', target: 'C2', kind: 'parent-child', motherId: 'W2' }, // 妾子
      { id: 'pc3', source: 'F', target: 'C3', kind: 'parent-child' }, // 无 motherId
    ]
    const result = await engine().calculateLayout(nodes, edges)
    const pos = new Map(result.nodes.map(n => [n.id, n]))
    const fPos = pos.get('F')!
    const w2Pos = pos.get('W2')!
    const expectedStartX = (fPos.x + w2Pos.x) / 2

    const c1Start = result.edges.find(e => e.target === 'C1')!.path!.points[0].x
    const c2Start = result.edges.find(e => e.target === 'C2')!.path!.points[0].x
    const c3Start = result.edges.find(e => e.target === 'C3')!.path!.points[0].x

    // [v6.0.8] 三组兄弟起点 X 完全相同
    expect(c1Start).toBeCloseTo(expectedStartX, 0)
    expect(c2Start).toBeCloseTo(expectedStartX, 0)
    expect(c3Start).toBeCloseTo(expectedStartX, 0)
    expect(c1Start).toBe(c2Start)
    expect(c2Start).toBe(c3Start)
  })

  it('[v6.0.8-3] 无 coupleUnit 的单配偶父亲：起点 X = 父节点中心 X（fallback 路径）', async () => {
    const W = 64, H = 28
    const nodes: LayoutNode[] = [
      { id: 'F', label: 'F', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
      { id: 'C1', label: 'C1', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'C2', label: 'C2', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
    ]
    // F 无配偶 → 无 coupleUnit
    const edges: LayoutEdge[] = [
      { id: 'pc1', source: 'F', target: 'C1', kind: 'parent-child', motherId: 'X' }, // motherId 指向不存在的节点
      { id: 'pc2', source: 'F', target: 'C2', kind: 'parent-child' },
    ]
    const result = await engine().calculateLayout(nodes, edges)
    const pos = new Map(result.nodes.map(n => [n.id, n]))
    const fPos = pos.get('F')!

    const c1Start = result.edges.find(e => e.target === 'C1')!.path!.points[0].x
    const c2Start = result.edges.find(e => e.target === 'C2')!.path!.points[0].x

    // [v6.0.8 fallback] 无 coupleUnit → 起点 X = 父节点中心 X
    expect(c1Start).toBeCloseTo(fPos.x, 0)
    expect(c2Start).toBeCloseTo(fPos.x, 0)
    expect(c1Start).toBe(c2Start)
  })

  it('[v6.0.8-4] 正妻之子 motherId=null vs 妾之子 motherId=妾.id：两组兄弟起点 X 完全相同', async () => {
    const W = 64, H = 28
    const nodes: LayoutNode[] = [
      { id: 'F', label: 'F', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
      { id: 'W1', label: 'W1正妻', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'W2', label: 'W2妾', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'C1', label: 'C1正妻子(motherId=null)', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'C2', label: 'C2妾子(motherId=W2)', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
    ]
    const edges: LayoutEdge[] = [
      { id: 'sp1', source: 'F', target: 'W1', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'sp2', source: 'F', target: 'W2', kind: 'spouse', marriageOrder: 2, isCurrent: true },
      // 显式对比：正妻之子无 motherId，妾之子有 motherId
      { id: 'pc1', source: 'F', target: 'C1', kind: 'parent-child' },
      { id: 'pc2', source: 'F', target: 'C2', kind: 'parent-child', motherId: 'W2' },
    ]
    const result = await engine().calculateLayout(nodes, edges)
    const pos = new Map(result.nodes.map(n => [n.id, n]))
    const fPos = pos.get('F')!
    const w2Pos = pos.get('W2')!
    const expectedStartX = (fPos.x + w2Pos.x) / 2

    const c1Start = result.edges.find(e => e.target === 'C1')!.path!.points[0].x
    const c2Start = result.edges.find(e => e.target === 'C2')!.path!.points[0].x

    // [v6.0.8] 不论 motherId 是否存在 / 指向谁，起点 X 都 = coupleUnitMidX
    expect(c1Start).toBeCloseTo(expectedStartX, 0)
    expect(c2Start).toBeCloseTo(expectedStartX, 0)
    expect(c1Start).toBe(c2Start)
  })
})

// ==================== 6. 双重身份 ====================

describe('W5.主流程 #6: 双重身份（X 既是子又是配偶）', () => {
  it('X 既是 P 的子又与 Y 配偶：layout 不崩溃，X 与 Y 都被定位', async () => {
    const W = 64, H = 28
    const nodes: LayoutNode[] = [
      { id: 'P', label: 'P', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
      { id: 'X', label: 'X', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: W, height: H },
      { id: 'Y', label: 'Y', gender: 'female', isMainLineage: false, isLiving: false, generation: 0, width: W, height: H },
    ]
    const edges: LayoutEdge[] = [
      { id: 'pc', source: 'P', target: 'X', kind: 'parent-child' },
      { id: 'sp', source: 'X', target: 'Y', kind: 'spouse', marriageOrder: 1, isCurrent: true },
    ]
    const result = await engine().calculateLayout(nodes, edges)
    // 所有节点都被定位
    const ids = result.nodes.map(n => n.id).sort()
    expect(ids).toEqual(['P', 'X', 'Y'])
    // 数值合法
    for (const n of result.nodes) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
  })
})

// ==================== 7. 兄弟共妻 ====================

describe('W5.主流程 #7: 兄弟共妻（H1/H2 共 W）', () => {
  it('H1、H2 各与 W 配偶：两条独立虚拟链，layout 不崩', async () => {
    const W = 64, H = 28
    const nodes: LayoutNode[] = [
      { id: 'F', label: 'F', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
      { id: 'H1', label: 'H1', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: W, height: H },
      { id: 'H2', label: 'H2', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'W', label: 'W', gender: 'female', isMainLineage: false, isLiving: false, generation: 0, width: W, height: H },
    ]
    const edges: LayoutEdge[] = [
      { id: 'pc1', source: 'F', target: 'H1', kind: 'parent-child' },
      { id: 'pc2', source: 'F', target: 'H2', kind: 'parent-child' },
      { id: 'sp1', source: 'H1', target: 'W', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'sp2', source: 'H2', target: 'W', kind: 'spouse', marriageOrder: 2, isCurrent: true },
    ]
    const result = await engine().calculateLayout(nodes, edges)
    expect(result.nodes.map(n => n.id).sort()).toEqual(['F', 'H1', 'H2', 'W'])
    // W 必须在 result.nodes 中（两条虚拟链都收敛到 W）
    const wPos = result.nodes.find(n => n.id === 'W')!
    expect(Number.isFinite(wPos.x)).toBe(true)
  })
})

// ==================== 8. 连襟 ====================

describe('W5.主流程 #8: 连襟（兄弟各婚不同配偶）', () => {
  it('H1→W1, H2→W2：独立虚拟链，W1 与 W2 位置独立', async () => {
    const W = 64, H = 28
    const nodes: LayoutNode[] = [
      { id: 'F', label: 'F', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
      { id: 'H1', label: 'H1', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: W, height: H },
      { id: 'H2', label: 'H2', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'W1', label: 'W1', gender: 'female', isMainLineage: false, isLiving: false, generation: 0, width: W, height: H },
      { id: 'W2', label: 'W2', gender: 'female', isMainLineage: false, isLiving: false, generation: 0, width: W, height: H },
    ]
    const edges: LayoutEdge[] = [
      { id: 'pc1', source: 'F', target: 'H1', kind: 'parent-child' },
      { id: 'pc2', source: 'F', target: 'H2', kind: 'parent-child' },
      { id: 'sp1', source: 'H1', target: 'W1', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'sp2', source: 'H2', target: 'W2', kind: 'spouse', marriageOrder: 1, isCurrent: true },
    ]
    const result = await engine().calculateLayout(nodes, edges)
    const w1 = result.nodes.find(n => n.id === 'W1')!
    const w2 = result.nodes.find(n => n.id === 'W2')!
    // W1 与 W2 X 不同（独立虚拟链无交叉）
    expect(w1.x).not.toBe(w2.x)
    // 数值合法
    expect(Number.isFinite(w1.x)).toBe(true)
    expect(Number.isFinite(w2.x)).toBe(true)
  })
})

// ==================== 9. 主脉对齐 ====================

describe('W5.主流程 #9: 主脉对齐（mainLineageCenter）', () => {
  it('主脉节点 X 平均 ≈ 0（视觉锚点）', async () => {
    const { nodes, edges } = buildMultiWife()
    const result = await engine().calculateLayout(nodes, edges)
    const mainXValues: number[] = []
    for (const node of nodes) {
      if (node.isMainLineage && node.generation >= 0) {
        const pos = result.nodes.find(n => n.id === node.id)
        if (pos) mainXValues.push(pos.x)
      }
    }
    expect(mainXValues.length).toBeGreaterThan(0)
    const avg = mainXValues.reduce((a, b) => a + b, 0) / mainXValues.length
    expect(Math.abs(avg)).toBeLessThan(10) // 容差 10px
  })
})

// ==================== 10. 子树避让 ====================

describe('W5.主流程 #10: 子树避让', () => {
  it('resolveSubtreeOverlap 阶段后，同代节点外接矩形不重叠', async () => {
    const { nodes, edges } = buildMultiWife()
    const result = await engine().calculateLayout(nodes, edges)

    // 同代分组（按 Y 容差 < 5px）
    const byY = new Map<number, typeof result.nodes>()
    for (const n of result.nodes) {
      const key = Math.round(n.y / 5) * 5
      if (!byY.has(key)) byY.set(key, [])
      byY.get(key)!.push(n)
    }
    // 每组内检查不重叠（每对只检查一次，按 X 排序判断方向）
    for (const group of byY.values()) {
      if (group.length < 2) continue
      const sorted = [...group].sort((a, b) => a.x - b.x)
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i]
        const b = sorted[i + 1]
        const aRight = a.x + a.width / 2
        const bLeft = b.x - b.width / 2
        // a 在左、b 在右：a 右边缘 ≤ b 左边缘（允许 1px 容差）
        expect(aRight).toBeLessThanOrEqual(bLeft + 1)
      }
    }
  })
})

// ==================== 11. birthOrder 排序 ====================

describe('W5.主流程 #11: birthOrder 排序', () => {
  it('兄弟节点 X 严格按 birthOrder 升序排列', async () => {
    const { nodes, edges } = buildSingleWifeMultiKids()
    const result = await engine().calculateLayout(nodes, edges)
    const pos = new Map(result.nodes.map(n => [n.id, n]))
    const c1X = pos.get('C1')!.x // birthOrder=1
    const c2X = pos.get('C2')!.x // birthOrder=2
    const c3X = pos.get('C3')!.x // birthOrder=3
    expect(c1X).toBeLessThan(c2X)
    expect(c2X).toBeLessThan(c3X)
  })
})

// ==================== 12. 计算鲁棒性 ====================

describe('W5.主流程 #12: 计算鲁棒性（多场景混合不崩）', () => {
  it('混合场景：多夫多妻 + 双重身份 + 连襟 + 子树，layout 不崩且输出合法', async () => {
    const W = 64, H = 28
    // 简化场景：F 有 2 子（A、B），A 与 X 配偶，B 与 Y 配偶（连襟）；A 既是 F 子又是 X 配偶（双重身份）
    const nodes: LayoutNode[] = [
      { id: 'F', label: 'F', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
      { id: 'A', label: 'A', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: W, height: H },
      { id: 'B', label: 'B', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'X', label: 'X', gender: 'female', isMainLineage: false, isLiving: false, generation: 0, width: W, height: H },
      { id: 'Y', label: 'Y', gender: 'female', isMainLineage: false, isLiving: false, generation: 0, width: W, height: H },
      { id: 'AC', label: 'AC', gender: 'male', isMainLineage: false, isLiving: false, generation: 2, width: W, height: H },
    ]
    const edges: LayoutEdge[] = [
      { id: 'pcA', source: 'F', target: 'A', kind: 'parent-child' },
      { id: 'pcB', source: 'F', target: 'B', kind: 'parent-child' },
      { id: 'pcAC', source: 'A', target: 'AC', kind: 'parent-child' },
      { id: 'spAX', source: 'A', target: 'X', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'spBY', source: 'B', target: 'Y', kind: 'spouse', marriageOrder: 1, isCurrent: true },
    ]
    const result = await engine().calculateLayout(nodes, edges)
    // 所有节点都被定位（不含虚拟节点）
    expect(result.nodes.length).toBe(6)
    // 数值合法
    for (const n of result.nodes) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
    // 边路径合法（所有 parent-child 和 spouse 边都有 path）
    for (const e of result.edges) {
      expect(e.path).toBeDefined()
      expect(e.path!.points.length).toBeGreaterThanOrEqual(2)
    }
  })
})

// ==================== 13. P0 修复：极端宽树 autoFit ====================

describe('W6.1.P0.13: autoFit 极端宽树模式（横向爆炸兜底）', () => {
  /**
   * [2026-09-01 P0 修复] 模拟朱熹 demo 86 节点的极端宽树场景：
   *   - contentW ≈ 67000，contentH ≈ 1000（aspectRatio = 67，远超 3）
   *   - 原生 scaleX = (1200-80)/67000 ≈ 0.017，远低于 minZoom=0.25
   *   - 旧逻辑：min(scaleX, scaleY) = 0.017 → clamp 到 0.25 → 仍不可用
   *   - 新逻辑：识别 wideTree，强制用 scaleY（fitByHeight）= 0.78，返回可读 zoom
   *
   * 同时验证：
   *   - wideTree 字段 = true
   *   - contentAspectRatio = 67（保留给 UI 层参考）
   *   - 普通树 wideTree = false，行为不变（min(scaleX, scaleY)）
   */
  function makeFakeLayout(contentW: number, contentH: number) {
    return {
      nodes: [
        { id: 'a', x: 0, y: 0, width: 64, height: 28 },
        { id: 'b', x: contentW, y: contentH, width: 64, height: 28 },
      ],
      edges: [],
      bounds: { minX: 0, minY: 0, maxX: contentW, maxY: contentH },
      generations: 2,
      totalNodes: 2,
    }
  }

  it('P0.13.a 极端宽树：aspectRatio > 3 + scaleX < minZoom → wideTree=true，zoom 强制 fitByHeight', async () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: { ...baseConfig },
    })
    // 模拟朱熹 demo：67K × 1K
    const fakeLayout = makeFakeLayout(67000, 1000) as any
    const viewport = e.autoFit(fakeLayout)
    expect(viewport.wideTree).toBe(true)
    expect(viewport.contentAspectRatio).toBeGreaterThan(3)
    // fitByHeight = (800-80)/1000 = 0.72，clamp 到 [0.25, 2] = 0.72
    expect(viewport.zoom).toBeGreaterThan(0.5) // 显著优于旧逻辑的 0.25
    expect(viewport.zoom).toBeLessThan(1.5)
  })

  it('P0.13.b 普通树：aspectRatio < 3 → wideTree=false，沿用 min(scaleX, scaleY)', async () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: { ...baseConfig },
    })
    // 紧凑布局：800 × 600
    const fakeLayout = makeFakeLayout(800, 600) as any
    const viewport = e.autoFit(fakeLayout)
    expect(viewport.wideTree).toBe(false)
    expect(viewport.contentAspectRatio).toBeLessThan(3)
    // scaleX = 1120/800 = 1.4，scaleY = 720/600 = 1.2 → min = 1.2
    expect(viewport.zoom).toBeCloseTo(1.2, 1)
  })

  it('P0.13.c 边界：aspectRatio 略大于 3 但 scaleX ≥ minZoom → 不触发 wideTree', async () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: { ...baseConfig },
    })
    // 2400 × 700：aspectRatio ≈ 3.43，但 scaleX = 1120/2400 = 0.467 ≥ minZoom=0.25
    const fakeLayout = makeFakeLayout(2400, 700) as any
    const viewport = e.autoFit(fakeLayout)
    expect(viewport.wideTree).toBe(false)
    // min(0.467, 1.03) = 0.467
    expect(viewport.zoom).toBeCloseTo(0.467, 2)
  })

  it('P0.13.d contentAspectRatio 字段存在且准确', async () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: { ...baseConfig },
    })
    const fakeLayout = makeFakeLayout(4000, 1000) as any // aspectRatio = 4
    const viewport = e.autoFit(fakeLayout)
    expect(typeof viewport.contentAspectRatio).toBe('number')
    expect(viewport.contentAspectRatio).toBeCloseTo(4.0, 1)
  })

  it('P0.13.e layoutDirection 在 extreme 模式下正确推断为 LR', async () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: { ...baseConfig, autoFit: { ...baseConfig.autoFit, preferDirection: 'auto' } as any },
    })
    const fakeLayout = makeFakeLayout(67000, 1000) as any
    const viewport = e.autoFit(fakeLayout)
    expect(viewport.layoutDirection).toBe('LR') // contentW > contentH
  })
})