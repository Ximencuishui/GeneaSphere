/**
 * layout-logger-sampling.spec.ts
 *
 * [v6.x 健壮性 L 系列增强] 慢路径采样器单元测试
 *
 * 覆盖：
 *  - S1  always：全量透传
 *  - S2  probabilistic：sampleRate 抽样
 *  - S3  rate-limited：滑动窗口限速
 *  - S4  adaptive：phase + 规模签名去重 + 峰值保留
 *  - S5  predicate 自定义判定
 *  - S6  createSamplingLogger 包装器（onError / onAfterCall 不采样）
 *  - S7  reset() 清理内部状态
 */

import { describe, it, expect, vi } from 'vitest'
import {
  createSlowPathSampler,
  createSamplingLogger,
  DEV_SAMPLING,
  PROD_SAMPLING,
  LIGHT_SAMPLING,
} from '@/utils/layout-logger-sampling'
import type { SlowPhaseEvent } from '@/utils/layout-logger'

function fakeSlowPhase(overrides: Partial<SlowPhaseEvent> = {}): SlowPhaseEvent {
  return {
    phase: 'engine',
    durationMs: 300,
    thresholdMs: 200,
    totalMs: 500,
    engineUsed: 'dagre',
    input: { nodeCount: 100, edgeCount: 80 },
    message: 'fake',
    ...overrides,
  }
}

// ============================================================
// S1 - always
// ============================================================

describe('S1 - always 模式', () => {
  it('全量透传：100 次调用 100 次放行', () => {
    const sampler = createSlowPathSampler({ mode: 'always' })
    let pass = 0
    for (let i = 0; i < 100; i += 1) {
      if (sampler.shouldSample(fakeSlowPhase())) pass += 1
    }
    expect(pass).toBe(100)
  })
})

// ============================================================
// S2 - probabilistic
// ============================================================

describe('S2 - probabilistic 模式', () => {
  it('sampleRate=0.5 约 50% 放行（1000 次抽样误差 < 5%）', () => {
    const sampler = createSlowPathSampler({ mode: 'probabilistic', sampleRate: 0.5 })
    let pass = 0
    const N = 1000
    for (let i = 0; i < N; i += 1) {
      if (sampler.shouldSample(fakeSlowPhase())) pass += 1
    }
    // 期望 500，容许 [450, 550]
    expect(pass).toBeGreaterThanOrEqual(450)
    expect(pass).toBeLessThanOrEqual(550)
  })

  it('sampleRate=0 全部拦截', () => {
    const sampler = createSlowPathSampler({ mode: 'probabilistic', sampleRate: 0 })
    expect(sampler.shouldSample(fakeSlowPhase())).toBe(false)
  })

  it('sampleRate=1 全部放行', () => {
    const sampler = createSlowPathSampler({ mode: 'probabilistic', sampleRate: 1 })
    expect(sampler.shouldSample(fakeSlowPhase())).toBe(true)
  })
})

// ============================================================
// S3 - rate-limited
// ============================================================

describe('S3 - rate-limited 模式', () => {
  it('窗口内前 maxPerWindow 次放行，后续拦截', () => {
    const sampler = createSlowPathSampler({
      mode: 'rate-limited',
      windowMs: 60_000,
      maxPerWindow: 3,
    })
    const results = [
      sampler.shouldSample(fakeSlowPhase()),
      sampler.shouldSample(fakeSlowPhase()),
      sampler.shouldSample(fakeSlowPhase()),
      sampler.shouldSample(fakeSlowPhase()),
      sampler.shouldSample(fakeSlowPhase()),
    ]
    expect(results.slice(0, 3)).toEqual([true, true, true])
    expect(results[3]).toBe(false)
    expect(results[4]).toBe(false)
  })

  it('reset() 清空窗口，事件可再次放行', () => {
    const sampler = createSlowPathSampler({ mode: 'rate-limited', maxPerWindow: 2 })
    sampler.shouldSample(fakeSlowPhase())
    sampler.shouldSample(fakeSlowPhase())
    expect(sampler.shouldSample(fakeSlowPhase())).toBe(false)
    sampler.reset()
    expect(sampler.shouldSample(fakeSlowPhase())).toBe(true)
  })
})

// ============================================================
// S4 - adaptive
// ============================================================

describe('S4 - adaptive 模式', () => {
  it('同签名首次放行，后续窗口内拦截', () => {
    const sampler = createSlowPathSampler({
      mode: 'adaptive',
      windowMs: 60_000,
    })
    const e1 = fakeSlowPhase({ phase: 'engine', engineUsed: 'dagre', input: { nodeCount: 100, edgeCount: 80 } })
    const e2 = fakeSlowPhase({ phase: 'engine', engineUsed: 'dagre', input: { nodeCount: 105, edgeCount: 80 } })
    expect(sampler.shouldSample(e1)).toBe(true) // 首次
    expect(sampler.shouldSample(e2)).toBe(false) // 同签名（100 bucket）+ 低于 peak
  })

  it('同签名但耗时 > peak 时放行（保留峰值）', () => {
    const sampler = createSlowPathSampler({ mode: 'adaptive', windowMs: 60_000 })
    const e1 = fakeSlowPhase({ phase: 'engine', durationMs: 300 })
    const e2 = fakeSlowPhase({ phase: 'engine', durationMs: 280 })
    const e3 = fakeSlowPhase({ phase: 'engine', durationMs: 350 })
    expect(sampler.shouldSample(e1)).toBe(true)
    expect(sampler.shouldSample(e2)).toBe(false) // 280 < 300
    expect(sampler.shouldSample(e3)).toBe(true)  // 350 > 300，刷新峰值
  })

  it('不同 phase / engine 签名独立', () => {
    const sampler = createSlowPathSampler({ mode: 'adaptive', windowMs: 60_000 })
    const e1 = fakeSlowPhase({ phase: 'engine' })
    const e2 = fakeSlowPhase({ phase: 'spouseAttach' })
    const e3 = fakeSlowPhase({ phase: 'engine', engineUsed: 'elkjs' })
    expect(sampler.shouldSample(e1)).toBe(true)
    expect(sampler.shouldSample(e2)).toBe(true)
    expect(sampler.shouldSample(e3)).toBe(true)
  })
})

// ============================================================
// S5 - predicate
// ============================================================

describe('S5 - predicate 自定义判定', () => {
  it('predicate 返回 true → 放行（覆盖 mode 配置）', () => {
    const sampler = createSlowPathSampler({
      mode: 'probabilistic',
      sampleRate: 0,
      predicate: (e) => e.phase === 'engine',
    })
    expect(sampler.shouldSample(fakeSlowPhase({ phase: 'engine' }))).toBe(true)
  })

  it('predicate 返回 false → 拦截', () => {
    const sampler = createSlowPathSampler({
      mode: 'always',
      predicate: () => false,
    })
    expect(sampler.shouldSample(fakeSlowPhase())).toBe(false)
  })

  it('predicate 抛错 → fail-safe 拦截（不让 sampler 自身崩）', () => {
    const sampler = createSlowPathSampler({
      mode: 'always',
      predicate: () => { throw new Error('boom') },
    })
    expect(sampler.shouldSample(fakeSlowPhase())).toBe(false)
  })
})

// ============================================================
// S6 - createSamplingLogger 包装器
// ============================================================

describe('S6 - createSamplingLogger 包装器', () => {
  it('onSlowPhase 受采样过滤', () => {
    const slow = vi.fn()
    const base = { onSlowPhase: slow }
    const wrapped = createSamplingLogger(base, { mode: 'rate-limited', maxPerWindow: 1 })
    wrapped.onSlowPhase?.(fakeSlowPhase())  // 1st pass
    wrapped.onSlowPhase?.(fakeSlowPhase())  // 2nd blocked
    expect(slow).toHaveBeenCalledTimes(1)
  })

  it('onError 永远透传（错误不能丢）', () => {
    const err = vi.fn()
    const base = { onError: err }
    const wrapped = createSamplingLogger(base, { mode: 'probabilistic', sampleRate: 0 })
    wrapped.onError?.({ code: 'X', message: 'y', hasResult: false, timestamp: 0 })
    expect(err).toHaveBeenCalledTimes(1)
  })

  it('onAfterCall 永远透传', () => {
    const after = vi.fn()
    const base = { onAfterCall: after }
    const wrapped = createSamplingLogger(base, { mode: 'probabilistic', sampleRate: 0 })
    wrapped.onAfterCall?.({ durationMs: 1, success: true, hasMetrics: true, errorCount: 0 })
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('支持注入 sampler 实例（不是 options）', () => {
    const sampler = createSlowPathSampler({ mode: 'rate-limited', maxPerWindow: 1 })
    const slow = vi.fn()
    const wrapped = createSamplingLogger({ onSlowPhase: slow }, sampler)
    wrapped.onSlowPhase?.(fakeSlowPhase()) // pass
    wrapped.onSlowPhase?.(fakeSlowPhase()) // block
    expect(slow).toHaveBeenCalledTimes(1)
  })

  it('底层 sink 抛错被吞（不让 logger 成为 bug 源）', () => {
    const base = {
      onSlowPhase: () => { throw new Error('boom') },
    }
    const wrapped = createSamplingLogger(base, { mode: 'always' })
    expect(() => wrapped.onSlowPhase?.(fakeSlowPhase())).not.toThrow()
  })
})

// ============================================================
// S7 - 预设常量合理性
// ============================================================

describe('S7 - 预设常量', () => {
  it('DEV_SAMPLING 全量透传', () => {
    const sampler = createSlowPathSampler(DEV_SAMPLING)
    for (let i = 0; i < 10; i += 1) {
      expect(sampler.shouldSample(fakeSlowPhase())).toBe(true)
    }
  })

  it('PROD_SAMPLING 限速', () => {
    const sampler = createSlowPathSampler(PROD_SAMPLING)
    let pass = 0
    for (let i = 0; i < 100; i += 1) {
      if (sampler.shouldSample(fakeSlowPhase())) pass += 1
    }
    expect(pass).toBeLessThanOrEqual(5)
    expect(pass).toBeGreaterThan(0)
  })

  it('LIGHT_SAMPLING 概率抽样', () => {
    const sampler = createSlowPathSampler(LIGHT_SAMPLING)
    let pass = 0
    for (let i = 0; i < 1000; i += 1) {
      if (sampler.shouldSample(fakeSlowPhase())) pass += 1
    }
    expect(pass).toBeGreaterThan(50)
    expect(pass).toBeLessThan(200) // 期望 100
  })
})