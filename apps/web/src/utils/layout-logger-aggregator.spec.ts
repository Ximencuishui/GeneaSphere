/**
 * layout-logger-aggregator.spec.ts
 *
 * [v6.x 健壮性 L 系列增强] threshold-breach by phase 聚合器单元测试
 *
 * 覆盖：
 *  - A1  record + peek：单 phase 多次事件 buffer 累积
 *  - A2  flush 返回正确 summary（count / p50 / p95 / p99 / max / min / avg）
 *  - A3  flush 清空 buffer
 *  - A4  多 phase 独立 buffer（per-phase 摘要）
 *  - A5  排序按 count 降序（运维一眼定位热点）
 *  - A6  empty flush 返回 null
 *  - A7  hasPending / reset 行为
 *  - A8  formatAggregationAsText 渲染多行可读字符串
 *  - A9  createAggregatorLogger 把事件转 record
 */

import { describe, it, expect } from 'vitest'
import {
  createThresholdAggregator,
  createAggregatorLogger,
  formatAggregationAsText,
  type PhaseBreachSummary,
} from '@/utils/layout-logger-aggregator'
import type { SlowPhaseEvent } from '@/utils/layout-logger'

function evt(phase: string, durationMs: number, engineUsed = 'dagre'): SlowPhaseEvent {
  return {
    phase,
    durationMs,
    thresholdMs: 200,
    totalMs: durationMs + 50,
    engineUsed,
    input: { nodeCount: 100, edgeCount: 80 },
    message: `${phase} took ${durationMs}ms`,
  }
}

// ============================================================
// A1 - record + peek
// ============================================================

describe('A1 - record + peek 累积', () => {
  it('单 phase 多次 record 后 peek 返回 1 个 summary', () => {
    const agg = createThresholdAggregator()
    agg.record(evt('engine', 300))
    agg.record(evt('engine', 320))
    agg.record(evt('engine', 280))
    const peek = agg.peek()
    expect(peek).toHaveLength(1)
    expect(peek[0].phase).toBe('engine')
    expect(peek[0].count).toBe(3)
    expect(peek[0].minMs).toBe(280)
    expect(peek[0].maxMs).toBe(320)
    expect(peek[0].avgMs).toBeCloseTo(300, 0)
  })

  it('peek 不清空 buffer', () => {
    const agg = createThresholdAggregator()
    agg.record(evt('engine', 300))
    agg.peek()
    expect(agg.hasPending()).toBe(true)
    agg.peek()
    expect(agg.hasPending()).toBe(true)
  })
})

// ============================================================
// A2 - flush 输出正确
// ============================================================

describe('A2 - flush 输出 summary', () => {
  it('count / min / max / avg / p50 / p95 / p99 正确', () => {
    const agg = createThresholdAggregator()
    // 10 个样本：300, 305, 310, 315, 320, 325, 330, 335, 340, 350
    for (const d of [300, 305, 310, 315, 320, 325, 330, 335, 340, 350]) {
      agg.record(evt('engine', d))
    }
    const payload = agg.flush('manual')
    expect(payload).not.toBeNull()
    expect(payload!.totalBreaches).toBe(10)
    expect(payload!.summaries).toHaveLength(1)
    const s = payload!.summaries[0]
    expect(s.count).toBe(10)
    expect(s.minMs).toBe(300)
    expect(s.maxMs).toBe(350)
    expect(s.avgMs).toBe(323)
    // p50 ≈ 322 (排序后 [300,305,310,315,320,325,330,335,340,350] 第 5 个 = 320)
    expect(s.p50Ms).toBeGreaterThanOrEqual(315)
    expect(s.p50Ms).toBeLessThanOrEqual(325)
    // p95 在 [340, 350] 之间
    expect(s.p95Ms).toBeGreaterThanOrEqual(335)
    expect(s.p99Ms).toBeGreaterThanOrEqual(340)
  })

  it('lastMs 是最新一次 record 的值', () => {
    const agg = createThresholdAggregator()
    agg.record(evt('engine', 300))
    agg.record(evt('engine', 500))
    agg.record(evt('engine', 400))
    const payload = agg.flush('manual')
    expect(payload!.summaries[0].lastMs).toBe(400)
  })

  it('thresholdMs 跟随第一次事件的阈值', () => {
    const agg = createThresholdAggregator()
    agg.record({ ...evt('engine', 300), thresholdMs: 200 })
    agg.record({ ...evt('engine', 350), thresholdMs: 250 }) // 不同阈值，应被忽略
    const payload = agg.flush('manual')
    expect(payload!.summaries[0].thresholdMs).toBe(200)
  })
})

// ============================================================
// A3 - flush 清空 buffer
// ============================================================

describe('A3 - flush 清空 buffer', () => {
  it('flush 后 hasPending() = false', () => {
    const agg = createThresholdAggregator()
    agg.record(evt('engine', 300))
    expect(agg.hasPending()).toBe(true)
    agg.flush('manual')
    expect(agg.hasPending()).toBe(false)
  })

  it('flush 后 peek() 返回 []', () => {
    const agg = createThresholdAggregator()
    agg.record(evt('engine', 300))
    agg.flush('manual')
    expect(agg.peek()).toEqual([])
  })

  it('flush 第二次返回 null（已清空）', () => {
    const agg = createThresholdAggregator()
    agg.record(evt('engine', 300))
    agg.flush('manual')
    const second = agg.flush('manual')
    expect(second).toBeNull()
  })
})

// ============================================================
// A4 - 多 phase 独立
// ============================================================

describe('A4 - 多 phase 独立 buffer', () => {
  it('不同 phase 各自聚合', () => {
    const agg = createThresholdAggregator()
    agg.record(evt('engine', 800))
    agg.record(evt('engine', 820))
    agg.record(evt('edgePaths', 220))
    agg.record(evt('spouseAttach', 350))
    const payload = agg.flush('manual')
    expect(payload).not.toBeNull()
    expect(payload!.summaries).toHaveLength(3)
    const phases = payload!.summaries.map((s) => s.phase).sort()
    expect(phases).toEqual(['edgePaths', 'engine', 'spouseAttach'])
  })

  it('不同 engine 各自聚合（即使 phase 相同）', () => {
    const agg = createThresholdAggregator()
    agg.record(evt('engine', 300, 'dagre'))
    agg.record(evt('engine', 500, 'elkjs'))
    const payload = agg.flush('manual')
    expect(payload!.summaries).toHaveLength(2)
    expect(payload!.totalBreaches).toBe(2)
  })
})

// ============================================================
// A5 - 按 count 降序
// ============================================================

describe('A5 - summaries 按 count 降序', () => {
  it('count=10 phase 排在 count=2 phase 前', () => {
    const agg = createThresholdAggregator()
    agg.record(evt('engine', 300))
    agg.record(evt('edgePaths', 220))
    agg.record(evt('edgePaths', 230))
    agg.record(evt('spouseAttach', 350))
    for (let i = 0; i < 7; i += 1) agg.record(evt('engine', 310))
    const payload = agg.flush('manual')
    expect(payload!.summaries[0].phase).toBe('engine')
    expect(payload!.summaries[0].count).toBe(8)
    expect(payload!.summaries[1].phase).toBe('edgePaths')
    expect(payload!.summaries[1].count).toBe(2)
  })
})

// ============================================================
// A6 - empty flush
// ============================================================

describe('A6 - 空 buffer flush', () => {
  it('无事件时 flush 返回 null', () => {
    const agg = createThresholdAggregator()
    expect(agg.flush('manual')).toBeNull()
  })
})

// ============================================================
// A7 - reset
// ============================================================

describe('A7 - reset 清空状态', () => {
  it('reset 后 hasPending() = false', () => {
    const agg = createThresholdAggregator()
    agg.record(evt('engine', 300))
    agg.reset()
    expect(agg.hasPending()).toBe(false)
  })

  it('reset 后 peek() 返回 []', () => {
    const agg = createThresholdAggregator()
    agg.record(evt('engine', 300))
    agg.reset()
    expect(agg.peek()).toEqual([])
  })
})

// ============================================================
// A8 - formatAggregationAsText
// ============================================================

describe('A8 - formatAggregationAsText', () => {
  it('生成多行可读字符串', () => {
    const agg = createThresholdAggregator({ contextTag: 'main-panel' })
    agg.record(evt('engine', 800))
    agg.record(evt('engine', 820))
    agg.record(evt('edgePaths', 220))
    const payload = agg.flush('manual')!
    const text = formatAggregationAsText(payload)
    expect(text).toContain('LayoutEngine BREACH SUMMARY')
    expect(text).toContain('total=3 events')
    expect(text).toContain('tag=main-panel')
    expect(text).toContain('engine')
    expect(text).toContain('edgePaths')
    expect(text).toContain('count=')
    expect(text).toContain('p50=')
    expect(text).toContain('p95=')
    expect(text).toContain('p99=')
  })

  it('包含 trigger 字段', () => {
    const agg = createThresholdAggregator()
    agg.record(evt('engine', 300))
    const payload = agg.flush('time')!
    const text = formatAggregationAsText(payload)
    expect(text).toContain('trigger=time')
  })
})

// ============================================================
// A9 - createAggregatorLogger
// ============================================================

describe('A9 - createAggregatorLogger 包装', () => {
  it('onSlowPhase 转发到 record', () => {
    const agg = createThresholdAggregator()
    const lg = createAggregatorLogger(agg)
    lg.onSlowPhase?.(evt('engine', 300))
    lg.onSlowPhase?.(evt('engine', 320))
    expect(agg.peek()).toHaveLength(1)
    expect(agg.peek()[0].count).toBe(2)
  })

  it('onError / onAfterCall 不被处理（undefined）', () => {
    const agg = createThresholdAggregator()
    const lg = createAggregatorLogger(agg)
    expect(lg.onError).toBeUndefined()
    expect(lg.onAfterCall).toBeUndefined()
  })
})

// ============================================================
// A10 - 性能边界
// ============================================================

describe('A10 - 性能边界', () => {
  it('1000 次 record 不阻塞（应在 < 50ms 内完成）', () => {
    const agg = createThresholdAggregator()
    const t0 = performance.now()
    for (let i = 0; i < 1000; i += 1) {
      agg.record(evt('engine', 200 + (i % 100)))
    }
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(100) // 1000 次应在 100ms 内
  })

  it('flush 输出 payload.contextTag 跟随配置', () => {
    const agg = createThresholdAggregator({ contextTag: 'left-panel' })
    agg.record(evt('engine', 300))
    const payload = agg.flush('manual')!
    expect(payload.contextTag).toBe('left-panel')
  })
})