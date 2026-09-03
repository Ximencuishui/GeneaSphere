/**
 * layout-engine-hooks.spec.ts — 钩子函数（fireSlowPhase / fireError / fireAfterCall / endPhase）单元测试
 *
 * [§8.3 2026-09-03] 新增独立模块的直测。
 *
 * 测试目标：
 * 1. fireSlowPhase
 *    - logger=null 静默 skip
 *    - logger.onSlowPhase 未定义静默 skip
 *    - duration < threshold 静默 skip
 *    - duration >= threshold 触发，事件字段完整
 *    - logger 抛错被 try/catch 吞掉，不冒泡
 * 2. fireError
 *    - logger=null 静默 skip
 *    - 触发时事件 code/message/timestamp/hasResult 字段正确
 *    - logger 抛错被吞掉
 * 3. fireAfterCall
 *    - logger=null 静默 skip
 *    - 触发时透传完整 event
 *    - logger 抛错被吞掉
 * 4. endPhase
 *    - endFn=null 不调用 fireSlowPhase
 *    - endFn() 返回 duration 后正常触发 fireSlowPhase
 */

import { describe, it, expect, vi } from 'vitest'
import {
  fireSlowPhase,
  fireError,
  fireAfterCall,
  endPhase,
  type HookContext,
} from '@/utils/layout-engine-hooks'
import type { LayoutMetrics } from '@/utils/layout-metrics'

function makeCtx(opts: Partial<HookContext> = {}): HookContext {
  return {
    logger: null,
    slowPhaseThreshold: 200,
    lastMetrics: null,
    ...opts,
  }
}

function makeMetrics(): LayoutMetrics {
  // 简单 stub，仅提供 onLastError 字段访问
  return {
    input: { nodeCount: 10, edgeCount: 8, parentChildEdgeCount: 6, spouseEdgeCount: 2 },
    timings: {},
    phaseOrder: [],
    errors: [],
    engineUsed: 'dagre',
    wideTree: false,
    totalMs: 0,
  } as unknown as LayoutMetrics
}

// ============================================================
// fireSlowPhase
// ============================================================
describe('fireSlowPhase', () => {
  it('logger=null 静默 skip', () => {
    expect(() =>
      fireSlowPhase(makeCtx({ logger: null }), 'phase', 500),
    ).not.toThrow()
  })

  it('logger.onSlowPhase 未定义 → 静默 skip', () => {
    const logger = {} as any
    expect(() =>
      fireSlowPhase(makeCtx({ logger }), 'phase', 500),
    ).not.toThrow()
  })

  it('duration < threshold → 不触发 onSlowPhase', () => {
    const onSlowPhase = vi.fn()
    const logger = { onSlowPhase } as any
    fireSlowPhase(makeCtx({ logger, slowPhaseThreshold: 200 }), 'phase', 100)
    expect(onSlowPhase).not.toHaveBeenCalled()
  })

  it('duration >= threshold → 触发 onSlowPhase，事件字段完整', () => {
    const onSlowPhase = vi.fn()
    const logger = { onSlowPhase } as any
    const metrics = makeMetrics()
    fireSlowPhase(makeCtx({ logger, slowPhaseThreshold: 200, lastMetrics: metrics }), 'engine', 250)

    expect(onSlowPhase).toHaveBeenCalledTimes(1)
    const evt = onSlowPhase.mock.calls[0][0]
    expect(evt.phase).toBe('engine')
    expect(evt.durationMs).toBe(250)
    expect(evt.thresholdMs).toBe(200)
    expect(evt.engineUsed).toBe('dagre')
    expect(evt.input.nodeCount).toBe(10)
    expect(evt.input.edgeCount).toBe(8)
    expect(evt.message).toMatch(/engine.*250\.0ms/)
  })

  it('logger.onSlowPhase 抛错被 try/catch 吞掉', () => {
    const logger = {
      onSlowPhase: vi.fn(() => {
        throw new Error('logger error')
      }),
    } as any
    expect(() =>
      fireSlowPhase(makeCtx({ logger, slowPhaseThreshold: 0 }), 'phase', 1000),
    ).not.toThrow()
  })

  it('lastMetrics 为 null 时 engineUsed/input 默认 0', () => {
    const onSlowPhase = vi.fn()
    const logger = { onSlowPhase } as any
    fireSlowPhase(makeCtx({ logger, slowPhaseThreshold: 0, lastMetrics: null }), 'p', 500)

    const evt = onSlowPhase.mock.calls[0][0]
    expect(evt.engineUsed).toBeUndefined()
    expect(evt.input.nodeCount).toBe(0)
    expect(evt.input.edgeCount).toBe(0)
  })
})

// ============================================================
// fireError
// ============================================================
describe('fireError', () => {
  it('logger=null 静默 skip', () => {
    expect(() =>
      fireError(makeCtx({ logger: null }), 'CODE', 'msg', false),
    ).not.toThrow()
  })

  it('logger.onError 未定义 → 静默 skip', () => {
    const logger = {} as any
    expect(() => fireError(makeCtx({ logger }), 'CODE', 'msg', true)).not.toThrow()
  })

  it('触发时事件字段完整', () => {
    const onError = vi.fn()
    const logger = { onError } as any
    const before = Date.now()
    fireError(makeCtx({ logger }), 'LAYOUT_EMPTY_GRAPH', 'no nodes', true)
    const after = Date.now()

    expect(onError).toHaveBeenCalledTimes(1)
    const evt = onError.mock.calls[0][0]
    expect(evt.code).toBe('LAYOUT_EMPTY_GRAPH')
    expect(evt.message).toBe('no nodes')
    expect(evt.hasResult).toBe(true)
    expect(evt.timestamp).toBeGreaterThanOrEqual(before)
    expect(evt.timestamp).toBeLessThanOrEqual(after)
  })

  it('logger.onError 抛错被 try/catch 吞掉', () => {
    const logger = {
      onError: vi.fn(() => {
        throw new Error('logger error')
      }),
    } as any
    expect(() => fireError(makeCtx({ logger }), 'CODE', 'msg', false)).not.toThrow()
  })
})

// ============================================================
// fireAfterCall
// ============================================================
describe('fireAfterCall', () => {
  it('logger=null 静默 skip', () => {
    expect(() =>
      fireAfterCall(makeCtx({ logger: null }), {
        durationMs: 100,
        success: true,
        hasMetrics: true,
        errorCount: 0,
        wideTree: false,
      }),
    ).not.toThrow()
  })

  it('logger.onAfterCall 未定义 → 静默 skip', () => {
    const logger = {} as any
    expect(() =>
      fireAfterCall(makeCtx({ logger }), {
        durationMs: 100,
        success: true,
        hasMetrics: true,
        errorCount: 0,
        wideTree: false,
      }),
    ).not.toThrow()
  })

  it('触发时透传完整 event', () => {
    const onAfterCall = vi.fn()
    const logger = { onAfterCall } as any
    const event = {
      durationMs: 250,
      success: false,
      hasMetrics: true,
      errorCount: 3,
      wideTree: true,
    }
    fireAfterCall(makeCtx({ logger }), event)
    expect(onAfterCall).toHaveBeenCalledWith(event)
  })

  it('logger.onAfterCall 抛错被 try/catch 吞掉', () => {
    const logger = {
      onAfterCall: vi.fn(() => {
        throw new Error('logger error')
      }),
    } as any
    expect(() =>
      fireAfterCall(makeCtx({ logger }), {
        durationMs: 100,
        success: true,
        hasMetrics: true,
        errorCount: 0,
        wideTree: false,
      }),
    ).not.toThrow()
  })
})

// ============================================================
// endPhase
// ============================================================
describe('endPhase', () => {
  it('endFn=null → 不调用 fireSlowPhase', () => {
    const onSlowPhase = vi.fn()
    const logger = { onSlowPhase } as any
    endPhase(makeCtx({ logger, slowPhaseThreshold: 0 }), 'phase', null)
    expect(onSlowPhase).not.toHaveBeenCalled()
  })

  it('endFn=undefined → 不调用 fireSlowPhase', () => {
    const onSlowPhase = vi.fn()
    const logger = { onSlowPhase } as any
    endPhase(makeCtx({ logger, slowPhaseThreshold: 0 }), 'phase', undefined)
    expect(onSlowPhase).not.toHaveBeenCalled()
  })

  it('endFn 返回 duration → 正常触发 fireSlowPhase', () => {
    const onSlowPhase = vi.fn()
    const logger = { onSlowPhase } as any
    endPhase(makeCtx({ logger, slowPhaseThreshold: 100 }), 'engine', () => 150)
    expect(onSlowPhase).toHaveBeenCalledTimes(1)
    const evt = onSlowPhase.mock.calls[0][0]
    expect(evt.phase).toBe('engine')
    expect(evt.durationMs).toBe(150)
  })

  it('endFn 返回值 < threshold → 不触发 fireSlowPhase', () => {
    const onSlowPhase = vi.fn()
    const logger = { onSlowPhase } as any
    endPhase(makeCtx({ logger, slowPhaseThreshold: 200 }), 'engine', () => 50)
    expect(onSlowPhase).not.toHaveBeenCalled()
  })

  it('endFn 返回值 ≥ threshold → 触发 fireSlowPhase', () => {
    const onSlowPhase = vi.fn()
    const logger = { onSlowPhase } as any
    endPhase(makeCtx({ logger, slowPhaseThreshold: 200 }), 'engine', () => 250)
    expect(onSlowPhase).toHaveBeenCalledTimes(1)
  })
})