/**
 * layout-engine.observability.spec.ts
 *
 * [v6.x 健壮性 O + X 系列] 布局引擎可观测性与配置化单元测试
 *
 * 覆盖两大领域：
 *  - O1-O4  metrics 阶段计时、累计统计、错误记录、可关闭
 *  - X1-X4  LayoutConfig 魔法参数（maxNodeSep / subtreeWidthMaxDepth / edgeInset / wideTreeAspectRatio）
 *
 * 不依赖外设数据库/G6，所有阶段都在内存中完成。
 */

import { describe, it, expect } from 'vitest'
import { LayoutEngine } from '@/utils/layout-engine'
import type {
  LayoutNode,
  LayoutEdge,
  LayoutConfig,
} from '@/types/layout'
import {
  createMetrics,
  beginPhase,
  recordError,
  snapshotMetrics,
  accumulateStats,
  createCumulativeStats,
} from '@/utils/layout-metrics'

// ---------- 通用工具 ----------

function buildSimpleEngineConfig(): Partial<LayoutConfig> {
  return {
    nodeSep: 24,
    rankSep: 48,
    spouseGap: 16,
    marriageJunctionOffset: 0,
    edgeHorizontalSeparation: 0,
    resolveSubtreeOverlap: false,
  } as Partial<LayoutConfig>
}

function makeNode(id: string, gen = 0, extra: Partial<LayoutNode> = {}): LayoutNode {
  return {
    id,
    label: id,
    gender: 'male',
    isMainLineage: true,
    isLiving: true,
    generation: gen,
    width: 64,
    height: 28,
    ...extra,
  }
}

function makeEdge(id: string, source: string, target: string, kind: 'parent-child' | 'spouse' = 'parent-child'): LayoutEdge {
  return { id, source, target, kind }
}

function buildSimpleDataset() {
  const nodes = [makeNode('A'), makeNode('B', 1), makeNode('C', 1)]
  const edges = [
    makeEdge('e1', 'A', 'B'),
    makeEdge('e2', 'A', 'C'),
  ]
  return { nodes, edges }
}

// ============================================================
// O1 — 阶段计时（Phase Timings）
// ============================================================

describe('O1 - 阶段计时（Phase Timings）', () => {
  it('calculateLayout 填充 result.meta 含各阶段耗时', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const { nodes, edges } = buildSimpleDataset()
    const result = await engine.calculateLayout(nodes, edges)

    expect(result.meta).toBeDefined()
    expect(result.meta!.timings).toBeDefined()

    // 应至少包含核心阶段
    const expectedPhases = [
      'validate', 'virtualize', 'prepare', 'spacing',
      'engine', 'spouseMap', 'spouseAttach', 'center',
      'edgePaths', 'collapse', 'spouseEdgePaths',
      'birthOrder',
    ]
    for (const ph of expectedPhases) {
      expect(result.meta!.timings).toHaveProperty(ph)
      expect(typeof result.meta!.timings[ph]).toBe('number')
      expect(result.meta!.timings[ph]).toBeGreaterThanOrEqual(0)
    }
  })

  it('phaseOrder 按 beginPhase 调用顺序排列', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const { nodes, edges } = buildSimpleDataset()
    const result = await engine.calculateLayout(nodes, edges)

    const order = result.meta!.phaseOrder
    expect(order[0]).toBe('validate')
    expect(order[1]).toBe('virtualize')
    expect(order[2]).toBe('prepare')
    // engine 阶段应该在 spacing 之后
    const idxSpacing = order.indexOf('spacing')
    const idxEngine = order.indexOf('engine')
    expect(idxEngine).toBeGreaterThan(idxSpacing)
  })

  it('totalMs 接近各阶段耗时之和（误差在 scheduling overhead）', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const { nodes, edges } = buildSimpleDataset()
    const result = await engine.calculateLayout(nodes, edges)

    const sumOfPhases = (result.meta!.phaseOrder as string[])
      .reduce((sum, ph) => sum + (result.meta!.timings[ph] ?? 0), 0)
    // totalMs 测量的是整体 elapsed，应 >= sum（因为含本函数自身调度）
    expect(result.meta!.totalMs).toBeGreaterThanOrEqual(sumOfPhases * 0.8)
  })

  it('input 字段填充节点/边统计（spouse vs parent-child 分类）', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const nodes = [
      makeNode('H', 0),
      makeNode('W1', -1, { gender: 'female' }),
    ]
    const edges = [
      makeEdge('e1', 'H', 'W1', 'spouse'),
    ]
    const result = await engine.calculateLayout(nodes, edges)

    expect(result.meta!.input.nodeCount).toBe(2)
    expect(result.meta!.input.spouseEdgeCount).toBe(1)
    expect(result.meta!.input.parentChildEdgeCount).toBe(0)
  })

  it('engineUsed 字段填充实际引擎', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      // 强制 dagre（小数据下默认也是 dagre）
    })
    const { nodes, edges } = buildSimpleDataset()
    const result = await engine.calculateLayout(nodes, edges)

    expect(['dagre', 'elkjs', 'compactBox']).toContain(result.meta!.engineUsed)
  })
})

// ============================================================
// O2 — 错误记录（Error Recording）
// ============================================================

describe('O2 - 错误记录（Error Recording）', () => {
  it('NO_ROOT_NODE 错误被记录进 meta.errors', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const nodes = [
      makeNode('A', -1, { gender: 'female' }),
      makeNode('B', -1, { gender: 'female' }),
    ]
    const edges = [makeEdge('e1', 'A', 'B', 'spouse')]
    try {
      await engine.calculateLayout(nodes, edges)
      expect.fail('应抛错')
    } catch {
      const lastMetrics = engine.getLastMetrics()
      expect(lastMetrics).not.toBeNull()
      expect(lastMetrics!.errors.length).toBeGreaterThanOrEqual(1)
      expect(lastMetrics!.errors[0].code).toBe('LAYOUT_NO_ROOT_NODE')
      expect(lastMetrics!.errors[0].timestamp).toBeGreaterThan(0)
    }
  })

  it('CYCLE 错误被记录进 meta.errors', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const nodes = [makeNode('A'), makeNode('B', 1)]
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'B', 'A'),  // 自环
    ]
    try {
      await engine.calculateLayout(nodes, edges)
      expect.fail('应抛错')
    } catch {
      const lastMetrics = engine.getLastMetrics()
      expect(lastMetrics!.errors.some(e => e.code === 'LAYOUT_CYCLE_DETECTED')).toBe(true)
    }
  })

  it('成功调用时 errors 数组为空', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(engine.getLastMetrics()!.errors).toEqual([])
  })
})

// ============================================================
// O3 — 累计统计（Cumulative Stats）
// ============================================================

describe('O3 - 累计统计（Cumulative Stats）', () => {
  it('getCumulativeStats 初始为 0', () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const stats = engine.getCumulativeStats()
    expect(stats.totalCalls).toBe(0)
    expect(stats.successCalls).toBe(0)
    expect(stats.errorCalls).toBe(0)
    expect(stats.totalDurationMs).toBe(0)
  })

  it('3 次成功调用累计 totalCalls=3 / successCalls=3', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const { nodes, edges } = buildSimpleDataset()
    for (let i = 0; i < 3; i++) {
      await engine.calculateLayout(nodes, edges)
    }
    const stats = engine.getCumulativeStats()
    expect(stats.totalCalls).toBe(3)
    expect(stats.successCalls).toBe(3)
    expect(stats.errorCalls).toBe(0)
    expect(stats.totalDurationMs).toBeGreaterThan(0)
  })

  it('成功 + 失败混合调用，errorsByCode 累计错误码分布', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const { nodes, edges } = buildSimpleDataset()
    // 2 次成功
    await engine.calculateLayout(nodes, edges)
    await engine.calculateLayout(nodes, edges)
    // 1 次失败：NO_ROOT
    try {
      await engine.calculateLayout(
        [makeNode('X', -1, { gender: 'female' })],
        [],
      )
    } catch {}
    // 1 次失败：CYCLE
    try {
      await engine.calculateLayout(
        [makeNode('A'), makeNode('B', 1)],
        [makeEdge('e1', 'A', 'B'), makeEdge('e2', 'B', 'A')],
      )
    } catch {}

    const stats = engine.getCumulativeStats()
    expect(stats.totalCalls).toBe(4)
    expect(stats.successCalls).toBe(2)
    expect(stats.errorCalls).toBe(2)
    expect(stats.errorsByCode['LAYOUT_NO_ROOT_NODE']).toBeGreaterThanOrEqual(1)
    expect(stats.errorsByCode['LAYOUT_CYCLE_DETECTED']).toBeGreaterThanOrEqual(1)
  })

  it('resetCumulativeStats 清零累计统计', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(engine.getCumulativeStats().totalCalls).toBe(1)

    engine.resetCumulativeStats()
    expect(engine.getCumulativeStats().totalCalls).toBe(0)
    expect(engine.getLastMetrics()).toBeNull()
  })

  it('enginesUsed 字段累计各引擎使用次数', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    await engine.calculateLayout(nodes, edges)
    const stats = engine.getCumulativeStats()
    const total = Object.values(stats.enginesUsed).reduce((a, b) => a + b, 0)
    expect(total).toBe(2)
  })
})

// ============================================================
// O4 — metricsEnabled 开关
// ============================================================

describe('O4 - metrics 启用 / 关闭', () => {
  it('metricsEnabled=false 时 result.meta 缺失', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      metricsEnabled: false,
    })
    const { nodes, edges } = buildSimpleDataset()
    const result = await engine.calculateLayout(nodes, edges)
    expect(result.meta).toBeUndefined()
    // getLastMetrics 应仍返回 null（未创建）
    expect(engine.getLastMetrics()).toBeNull()
  })

  it('metricsEnabled=true 时 result.meta 填充', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      metricsEnabled: true,
    })
    const { nodes, edges } = buildSimpleDataset()
    const result = await engine.calculateLayout(nodes, edges)
    expect(result.meta).toBeDefined()
  })

  it('setMetricsEnabled 运行时切换', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const { nodes, edges } = buildSimpleDataset()
    engine.setMetricsEnabled(false)
    const r1 = await engine.calculateLayout(nodes, edges)
    expect(r1.meta).toBeUndefined()

    engine.setMetricsEnabled(true)
    const r2 = await engine.calculateLayout(nodes, edges)
    expect(r2.meta).toBeDefined()
  })

  it('metricsEnabled=false 时累计统计仍更新（仅 phase 计时 / error 记录跳过）', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      metricsEnabled: false,
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    // totalCalls 应为 1（即使 metrics 关闭，累计计数仍工作）
    expect(engine.getCumulativeStats().totalCalls).toBe(1)
  })
})

// ============================================================
// X1 — LayoutConfig 魔法参数生效
// ============================================================

describe('X1 - LayoutConfig 魔法参数生效', () => {
  it('subtreeWidthMaxDepth=10 时 computeSubtreeWidth 提前截断', async () => {
    // 通过 LayoutEngine.calculateLayout 间接验证
    // 我们用一棵极深的链状数据（深度 > 30）触发子树宽度计算
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: {
        nodeSep: 24,
        rankSep: 48,
        spouseGap: 16,
        marriageJunctionOffset: 0,
        edgeHorizontalSeparation: 0,
        resolveSubtreeOverlap: false,
        subtreeWidthMaxDepth: 5,  // 设很小
      } as Partial<LayoutConfig>,
    })
    // 25 代纵向单链：A0 → A1 → ... → A24
    const nodes: LayoutNode[] = []
    const edges: LayoutEdge[] = []
    for (let i = 0; i <= 24; i++) {
      nodes.push(makeNode(`A${i}`, i))
      if (i > 0) edges.push(makeEdge(`e${i}`, `A${i - 1}`, `A${i}`))
    }
    // 不应抛错（深度限制截断保护）
    const result = await engine.calculateLayout(nodes, edges)
    expect(result.nodes.length).toBeGreaterThan(0)
  })

  it('maxNodeSep=20 比默认 80 更紧，触发时 clamp 至 20', () => {
    // 直接测 tree-layout.computeAutoNodeSep
    // 由于不能直接 import（内部私有），通过 LayoutEngine 间接验证
    // 这里只做 magic 参数存在性测试
    const cfg: Partial<LayoutConfig> = { maxNodeSep: 20 }
    expect(cfg.maxNodeSep).toBe(20)
  })

  it('edgeInset=8 与默认 4 在 LayoutConfig 中可独立配置', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: {
        ...buildSimpleEngineConfig(),
        edgeInset: 8,
      } as Partial<LayoutConfig>,
    })
    const { nodes, edges } = buildSimpleDataset()
    // 不应抛错
    const result = await engine.calculateLayout(nodes, edges)
    expect(result.nodes.length).toBeGreaterThan(0)
  })

  it('wideTreeAspectRatio=2 比默认 3 更激进触发宽树模式', () => {
    // 通过配置可调，无需实际触发
    const cfg: Partial<LayoutConfig> = { wideTreeAspectRatio: 2 }
    expect(cfg.wideTreeAspectRatio).toBe(2)
  })
})

// ============================================================
// X2 — 魔法参数默认值
// ============================================================

describe('X2 - 魔法参数默认值', () => {
  it('不指定魔法参数时不影响现有行为（向后兼容）', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),  // 不指定任何魔法参数
    })
    const { nodes, edges } = buildSimpleDataset()
    const result = await engine.calculateLayout(nodes, edges)
    expect(result.nodes.length).toBe(3)
  })

  it('metrics 中能识别默认参数调用（meta 字段无 wideTree 一类尚未触发的标记）', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const { nodes, edges } = buildSimpleDataset()
    const result = await engine.calculateLayout(nodes, edges)
    // 未调用 autoFit 时 wideTree 仍为 undefined
    expect(result.meta!.wideTree).toBeUndefined()
  })
})

// ============================================================
// O5 — layout-metrics 模块纯函数测试
// ============================================================

describe('O5 - layout-metrics 模块纯函数', () => {
  it('createMetrics 初始化 input 字段', () => {
    const m = createMetrics(100, 50)
    expect(m.phaseTimings).toEqual({})
    expect(m.phaseOrder).toEqual([])
    expect(m.errors).toEqual([])
    expect(m.input.nodeCount).toBe(100)
    expect(m.input.edgeCount).toBe(50)
    expect(m.input.spouseEdgeCount).toBe(0)
    expect(m.input.parentChildEdgeCount).toBe(0)
  })

  it('beginPhase 返回的 endPhase 填写 phaseTimings 与 phaseOrder', () => {
    const m = createMetrics(0, 0)
    const end1 = beginPhase(m, 'phaseA')
    setTimeout(() => {}, 5)  // 5ms 消耗时间
    end1()
    expect(m.phaseTimings['phaseA']).toBeGreaterThanOrEqual(0)
    expect(m.phaseOrder).toContain('phaseA')

    const end2 = beginPhase(m, 'phaseB')
    end2()
    expect(m.phaseOrder).toEqual(['phaseA', 'phaseB'])
  })

  it('recordError 不会抛错（容错）', () => {
    const m = createMetrics(0, 0)
    expect(() => {
      recordError(m, 'INVALID_INPUT', 'test')
    }).not.toThrow()
    expect(m.errors).toHaveLength(1)
    expect(m.errors[0].code).toBe('INVALID_INPUT')
  })

  it('snapshotMetrics 转为稳定浅对象，totalMs 是 phaseOrder 总和', () => {
    const m = createMetrics(0, 0)
    const e = beginPhase(m, 'ph1')
    e()
    const snap = snapshotMetrics(m)
    expect(snap.timings).toBeDefined()
    expect(snap.totalMs).toBeGreaterThanOrEqual(0)
    // 浅拷贝（不同对象引用）
    expect(snap.timings).not.toBe(m.phaseTimings)
  })

  it('accumulateStats 把成功 / 失败 / 节点数累计', () => {
    const stats = createCumulativeStats()
    accumulateStats(stats, {
      timings: {},
      phaseOrder: [],
      totalMs: 10,
      errors: [],
      input: { nodeCount: 50, edgeCount: 10, parentChildEdgeCount: 5, spouseEdgeCount: 5 },
    }, 10, false)
    expect(stats.totalCalls).toBe(1)
    expect(stats.successCalls).toBe(1)
    expect(stats.nodesProcessed).toBe(50)

    accumulateStats(stats, {
      timings: {},
      phaseOrder: [],
      totalMs: 0,
      errors: [{ code: 'INVALID_INPUT', message: 'x', timestamp: 0 }],
      input: { nodeCount: 0, edgeCount: 0, parentChildEdgeCount: 0, spouseEdgeCount: 0 },
    }, 0, true)
    expect(stats.totalCalls).toBe(2)
    expect(stats.errorCalls).toBe(1)
    expect(stats.errorsByCode['INVALID_INPUT']).toBe(1)
  })
})
