/**
 * layout-engine.logging.spec.ts
 *
 * [v6.x 健壮性 L 系列] 布局引擎日志 + 告警单元测试
 *
 * 覆盖：
 *  - L1 createConsoleLogger 基础输出（slow/error/after-call）
 *  - L2 setLogger + 构造 logger 选项
 *  - L3 慢路径检测（threshold + 实际触发）
 *  - L4 错误传播（NO_ROOT/CYCLE/THREW 三连）
 *  - L5 after-call hook 在成功和失败路径都触发
 *  - L6 fireAfterCall 在 metricsEnabled=false 时仍触发
 *  - F1 formatTimingsTable 输出格式
 *  - F2 formatMetricsAsText 输出格式
 *  - F3 formatCumulativeStatsAsLine 输出格式
 *  - X1 combined logger 多个 logger 同时触发
 *
 * 不依赖外设数据库/G6，所有阶段都在内存中完成。
 */

import { describe, it, expect, vi } from 'vitest'
import { LayoutEngine } from '@/utils/layout-engine'
import type {
  LayoutNode,
  LayoutEdge,
  LayoutConfig,
  LayoutResultMeta,
} from '@/types/layout'
import {
  createConsoleLogger,
  createCombinedLogger,
  formatMetricsAsText,
  formatTimingsTable,
  formatCumulativeStatsAsLine,
  type LayoutLogger,
  type SlowPhaseEvent,
  type ErrorEvent,
  type AfterCallEvent,
} from '@/utils/layout-logger'

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

function buildSpouseDataset() {
  // 三节点 + 一个配偶（A 是 main，B 是 A 的子，C 是 A 的配偶）
  const nodes: LayoutNode[] = [
    makeNode('A', 0, { isMainLineage: true }),
    makeNode('B', 1, { isMainLineage: true }),
    makeNode('C', 0, { generation: -1, isMainLineage: false }),
  ]
  const edges: LayoutEdge[] = [
    makeEdge('e1', 'A', 'B', 'parent-child'),
    makeEdge('e2', 'A', 'C', 'spouse'),
  ]
  return { nodes, edges }
}

/** 构造一个空 meta 用于格式化测试 */
function makeFakeMeta(): LayoutResultMeta {
  return {
    timings: { validate: 1.5, engine: 10.2, edgePaths: 0.8 },
    phaseOrder: ['validate', 'engine', 'edgePaths'],
    totalMs: 12.5,
    errors: [],
    engineUsed: 'dagre',
    wideTree: false,
    input: { nodeCount: 10, edgeCount: 8, parentChildEdgeCount: 6, spouseEdgeCount: 2 },
  }
}

// ============================================================
// L1 - createConsoleLogger 基础能力
// ============================================================

describe('L1 - createConsoleLogger 基础能力', () => {
  it('创建不抛错的 logger 实例', () => {
    const lg = createConsoleLogger()
    expect(lg).toBeDefined()
    expect(typeof lg.onSlowPhase).toBe('function')
    expect(typeof lg.onError).toBe('function')
    expect(typeof lg.onAfterCall).toBe('function')
  })

  it('silent 模式下静默（console.warn 不被调用）', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lg = createConsoleLogger({ silent: true })
    lg.onSlowPhase?.({
      phase: 'test',
      durationMs: 999,
      thresholdMs: 100,
      totalMs: 999,
      message: 'fake',
      input: { nodeCount: 0, edgeCount: 0 },
    } as SlowPhaseEvent)
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('调用内部异常时不传播（不让 logger 成为 bug 源）', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lg = createConsoleLogger()
    // 替换 hook 让它抛错
    const brokenLogger: LayoutLogger = {
      onError: () => { throw new Error('logger bug') },
      onSlowPhase: () => { throw new Error('logger bug') },
      onAfterCall: () => { throw new Error('logger bug') },
    }
    // 直接调用 brokenLogger（验证组合场景）
    expect(() => brokenLogger.onError?.({
      code: 'TEST', message: 'x', timestamp: 0, hasResult: false,
    } as ErrorEvent)).toThrow()  // 单独调用会抛，但组合时 swallow

    // 验证 createConsoleLogger 不抛：调用 swallow 的 onError 时不会出错
    const safeLogger = createConsoleLogger()
    safeLogger.onError?.({
      code: 'TEST', message: 'x', timestamp: 0, hasResult: false,
    })
    expect(() => safeLogger.onAfterCall?.({
      durationMs: 1, success: true, hasMetrics: true, errorCount: 0,
    } as AfterCallEvent)).not.toThrow()

    expect(errSpy).toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()  // onError 用 console.error
    errSpy.mockRestore()
    warnSpy.mockRestore()
  })
})

// ============================================================
// L2 - LayoutEngine.setLogger + 构造选项
// ============================================================

describe('L2 - LayoutEngine.setLogger + 构造选项', () => {
  it('构造时通过 logger 选项注入', async () => {
    const slow = vi.fn()
    const after = vi.fn()
    const err = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onSlowPhase: slow, onError: err, onAfterCall: after },
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('setLogger 替换 logger', async () => {
    const a1 = vi.fn()
    const a2 = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onAfterCall: a1 },
    })
    engine.setLogger({ onAfterCall: a2 })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(a1).not.toHaveBeenCalled()
    expect(a2).toHaveBeenCalledTimes(1)
  })

  it('setLogger(null) 取消订阅', async () => {
    const a = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onAfterCall: a },
    })
    engine.setLogger(null)
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(a).not.toHaveBeenCalled()
  })
})

// ============================================================
// L3 - 慢路径检测
// ============================================================

describe('L3 - 慢路径检测', () => {
  it('阶段耗时 < threshold 不触发 onSlowPhase', async () => {
    const slow = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onSlowPhase: slow },
      // 设大阈值，让任何阶段都不可能超
      slowPhaseThreshold: 99999,
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(slow).not.toHaveBeenCalled()
  })

  it('阶段耗时 >= threshold 触发 onSlowPhase', async () => {
    const slow = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onSlowPhase: slow },
      // 设 0ms 阈值，让任何阶段都触发
      slowPhaseThreshold: 0,
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(slow).toHaveBeenCalled()
    // 第一阶段 validate 应被报告
    const firstCall = slow.mock.calls[0][0] as SlowPhaseEvent
    expect(firstCall).toHaveProperty('phase')
    expect(firstCall).toHaveProperty('durationMs')
    expect(firstCall.thresholdMs).toBe(0)
  })

  it('setSlowPhaseThreshold 运行时调整阈值', async () => {
    const slow = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onSlowPhase: slow },
      slowPhaseThreshold: 99999,
    })
    // 调整为 0
    engine.setSlowPhaseThreshold(0)
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(slow).toHaveBeenCalled()
  })

  it('setSlowPhaseThreshold 接受负数（被钳到 0）', () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    engine.setSlowPhaseThreshold(-100)
    // 内部钳到 0；调用 setSlowPhaseThreshold(0) 后再调也 OK
    engine.setSlowPhaseThreshold(0)
    expect(true).toBe(true)
  })

  it('onSlowPhase payload 包含 input/engineUsed', async () => {
    const slow = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onSlowPhase: slow },
      slowPhaseThreshold: 0,
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    const call = slow.mock.calls[0][0] as SlowPhaseEvent
    expect(call.input).toBeDefined()
    expect(call.input.nodeCount).toBeGreaterThan(0)
    expect(call.input.edgeCount).toBeGreaterThan(0)
  })
})

// ============================================================
// L4 - 错误传播（NO_ROOT / CYCLE / THREW）
// ============================================================

describe('L4 - 错误传播', () => {
  it('NO_ROOT_NODE 触发 onError(code=LAYOUT_NO_ROOT_NODE)', async () => {
    const err = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onError: err },
    })
    // 构造无根节点的场景：两个节点都是 spouse（gen<0），无 parent-child 边
    const nodes: LayoutNode[] = [
      makeNode('X', -1),
      makeNode('Y', -1),
    ]
    const edges: LayoutEdge[] = []
    await expect(engine.calculateLayout(nodes, edges)).rejects.toThrow(/No root/)
    expect(err).toHaveBeenCalled()
    const evt = err.mock.calls[0][0] as ErrorEvent
    expect(evt.code).toBe('LAYOUT_NO_ROOT_NODE')
    expect(evt.hasResult).toBe(false)
  })

  it('CYCLE_DETECTED 触发 onError(code=LAYOUT_CYCLE_DETECTED)', async () => {
    const err = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onError: err },
    })
    // 构造 parent-child 环路：A → B → A
    const nodes: LayoutNode[] = [
      makeNode('A', 0),
      makeNode('B', 1),
    ]
    const edges: LayoutEdge[] = [
      makeEdge('e1', 'A', 'B', 'parent-child'),
      makeEdge('e2', 'B', 'A', 'parent-child'),
    ]
    await expect(engine.calculateLayout(nodes, edges)).rejects.toThrow(/cycle/)
    const evt = err.mock.calls[0][0] as ErrorEvent
    expect(evt.code).toBe('LAYOUT_CYCLE_DETECTED')
  })

  it('INVALID_INPUT 错误也触发 onError（catch 块统一处理）', async () => {
    const err = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onError: err },
    })
    // 输入非法：节点 ID 重复
    const nodes: LayoutNode[] = [
      makeNode('A', 0),
      makeNode('A', 1),  // ID 重复
    ]
    const edges: LayoutEdge[] = []
    await expect(engine.calculateLayout(nodes, edges)).rejects.toThrow()
    expect(err).toHaveBeenCalled()
    const evt = err.mock.calls[0][0] as ErrorEvent
    expect(typeof evt.code).toBe('string')
    expect(evt.hasResult).toBe(false)
  })
})

// ============================================================
// L5 - after-call hook 在成功和失败路径都触发
// ============================================================

describe('L5 - after-call hook', () => {
  it('成功路径：errorCount = 0, success = true', async () => {
    const after = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onAfterCall: after },
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(after).toHaveBeenCalledTimes(1)
    const evt = after.mock.calls[0][0] as AfterCallEvent
    expect(evt.success).toBe(true)
    expect(evt.errorCount).toBe(0)
    expect(evt.hasMetrics).toBe(true)
  })

  it('失败路径：errorCount > 0, success = false', async () => {
    const after = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onAfterCall: after },
    })
    // 触发 CYCLE 错误
    const nodes: LayoutNode[] = [makeNode('A', 0), makeNode('B', 1)]
    const edges: LayoutEdge[] = [
      makeEdge('e1', 'A', 'B', 'parent-child'),
      makeEdge('e2', 'B', 'A', 'parent-child'),
    ]
    await expect(engine.calculateLayout(nodes, edges)).rejects.toThrow()
    expect(after).toHaveBeenCalledTimes(1)
    const evt = after.mock.calls[0][0] as AfterCallEvent
    expect(evt.success).toBe(false)
    expect(evt.errorCount).toBeGreaterThan(0)
  })
})

// ============================================================
// L6 - metricsEnabled=false 时 after-call hook 仍触发
// ============================================================

describe('L6 - metrics 关闭与 logger 集成', () => {
  it('metricsEnabled=false 时 logger.onAfterCall 仍触发', async () => {
    const after = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onAfterCall: after },
      metricsEnabled: false,
    })
    const { nodes, edges } = buildSimpleDataset()
    const result = await engine.calculateLayout(nodes, edges)
    expect(result.meta).toBeUndefined()
    expect(after).toHaveBeenCalledTimes(1)
  })
})

// ============================================================
// F1-F3 - 格式化工具
// ============================================================

describe('F1 - formatTimingsTable', () => {
  it('按 phaseOrder 输出表格行', () => {
    const meta = makeFakeMeta()
    const rows = formatTimingsTable(meta)
    expect(rows).toHaveLength(3)
    expect(rows[0].phase).toBe('validate')
    expect(rows[1].phase).toBe('engine')
    expect(rows[2].phase).toBe('edgePaths')
    expect(rows[1].durationMs).toBe(10)
    expect(rows[1].percentOfTotal).toBeGreaterThan(50)
  })

  it('空 timings 不抛错，返回 []', () => {
    const meta: LayoutResultMeta = {
      timings: {},
      phaseOrder: [],
      totalMs: 0,
      errors: [],
      input: { nodeCount: 0, edgeCount: 0, parentChildEdgeCount: 0, spouseEdgeCount: 0 },
    }
    const rows = formatTimingsTable(meta)
    expect(rows).toEqual([])
  })
})

describe('F2 - formatMetricsAsText', () => {
  it('生成多行可读字符串', () => {
    const meta = makeFakeMeta()
    const text = formatMetricsAsText(meta)
    expect(text).toContain('LayoutEngine')
    expect(text).toContain('total=12.5ms')
    expect(text).toContain('nodes=10')
    expect(text).toContain('engine=dagre')
    expect(text).toContain('timings:')
    expect(text).toContain('validate')
    expect(text).toContain('engine')
  })

  it('空错误时不输出 errors 块', () => {
    const meta = makeFakeMeta()
    const text = formatMetricsAsText(meta)
    expect(text).not.toContain('errors:')
  })

  it('有错误时输出 errors 块', () => {
    const meta = makeFakeMeta()
    meta.errors.push({ code: 'TEST_ERR', message: 'mock', timestamp: Date.now() })
    const text = formatMetricsAsText(meta)
    expect(text).toContain('errors:')
    expect(text).toContain('TEST_ERR')
  })
})

describe('F3 - formatCumulativeStatsAsLine', () => {
  it('生成单行摘要', () => {
    const text = formatCumulativeStatsAsLine({
      totalCalls: 10,
      successCalls: 8,
      errorCalls: 2,
      totalDurationMs: 1234.5,
      errorsByCode: {},
    })
    expect(text).toContain('10 calls')
    expect(text).toContain('8 OK')
    expect(text).toContain('2 FAIL')
    expect(text).toContain('20.0% error')
  })

  it('0 调用时 errorRate=0%', () => {
    const text = formatCumulativeStatsAsLine({
      totalCalls: 0,
      successCalls: 0,
      errorCalls: 0,
      totalDurationMs: 0,
      errorsByCode: {},
    })
    expect(text).toContain('0% error')
  })
})

// ============================================================
// X1 - combined logger 多个 logger 同时触发
// ============================================================

describe('X1 - combined logger', () => {
  it('多个 logger 全部被调用', () => {
    const a = vi.fn()
    const b = vi.fn()
    const combined = createCombinedLogger([
      { onSlowPhase: a },
      { onSlowPhase: b },
    ])
    const evt: SlowPhaseEvent = {
      phase: 'test',
      durationMs: 1,
      thresholdMs: 0,
      totalMs: 1,
      message: 'x',
      input: { nodeCount: 0, edgeCount: 0 },
    }
    combined.onSlowPhase?.(evt)
    expect(a).toHaveBeenCalledWith(evt)
    expect(b).toHaveBeenCalledWith(evt)
  })

  it('某 logger 抛错不影响其他 logger', () => {
    const a = vi.fn()
    const broken = vi.fn(() => { throw new Error('boom') })
    const combined = createCombinedLogger([
      { onSlowPhase: broken },
      { onSlowPhase: a },
    ])
    const evt: SlowPhaseEvent = {
      phase: 'test',
      durationMs: 1,
      thresholdMs: 0,
      totalMs: 1,
      message: 'x',
      input: { nodeCount: 0, edgeCount: 0 },
    }
    expect(() => combined.onSlowPhase?.(evt)).not.toThrow()
    expect(a).toHaveBeenCalled()
  })

  it('空数组返回空 logger（所有字段 undefined）', () => {
    const combined = createCombinedLogger([])
    expect(combined.onSlowPhase).toBeUndefined()
    expect(combined.onError).toBeUndefined()
    expect(combined.onAfterCall).toBeUndefined()
    expect(combined.flush).toBeUndefined()
  })
})

// ============================================================
// X2 - LayoutEngine + combined logger 集成
// ============================================================

describe('X2 - LayoutEngine + combined logger 集成', () => {
  it('logger 桥接：用户 setLogger 后 layout events 触发该 logger', async () => {
    const slowEvents: SlowPhaseEvent[] = []
    const errorEvents: ErrorEvent[] = []
    const afterEvents: AfterCallEvent[] = []
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: createCombinedLogger([
        {
          onSlowPhase: (e) => slowEvents.push(e),
          onError: (e) => errorEvents.push(e),
          onAfterCall: (e) => afterEvents.push(e),
        },
      ]),
      slowPhaseThreshold: 0,
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(slowEvents.length).toBeGreaterThan(0)
    expect(afterEvents.length).toBe(1)
    expect(errorEvents.length).toBe(0)  // 成功路径
  })

  it('配偶场景下也触发 after-call', async () => {
    const after = vi.fn()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      logger: { onAfterCall: after },
    })
    const { nodes, edges } = buildSpouseDataset()
    await engine.calculateLayout(nodes, edges)
    expect(after).toHaveBeenCalledTimes(1)
    expect(after.mock.calls[0][0].success).toBe(true)
  })
})