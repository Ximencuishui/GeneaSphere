/**
 * layout-logger-sinks.spec.ts
 *
 * [v6.x 健壮性 L 系列增强] Sentry / DataDog 适配器单元测试
 *
 * 覆盖：
 *  - K1  Sentry sink 基础：slowPhase → captureMessage, error → captureException, afterCall → addBreadcrumb
 *  - K2  Sentry sink 抛错被吞（不污染主流程）
 *  - K3  Sentry sink 选项控制（silentIfUnavailable / slowPhaseAsWarning=false / attachMetaContext=false）
 *  - K4  Sentry stub 工厂（开发期占位）
 *  - K5  DataDog sink 基础：slowPhase → logger.warn, error → addError
 *  - K6  DataDog sink afterCallSampleRate 概率抽样
 *  - K7  DataDog sink afterCallAsAction=false 时不调用 addAction
 *  - K8  DataDog stub 工厂
 *  - K9  duck-typing：缺方法的客户端仍可用（部分方法 undefined）
 *  - K10 与 createCombinedLogger 兼容
 */

import { describe, it, expect, vi } from 'vitest'
import {
  createSentrySink,
  createDatadogSink,
  createDevSentryStub,
  createDevDatadogStub,
  type SentryLikeClient,
  type DatadogLikeClient,
} from '@/utils/layout-logger-sinks'
import { createCombinedLogger } from '@/utils/layout-logger'
import type { SlowPhaseEvent, ErrorEvent, AfterCallEvent } from '@/utils/layout-logger'

function fakeSlow(overrides: Partial<SlowPhaseEvent> = {}): SlowPhaseEvent {
  return {
    phase: 'engine',
    durationMs: 350,
    thresholdMs: 200,
    totalMs: 500,
    engineUsed: 'dagre',
    input: { nodeCount: 100, edgeCount: 80 },
    message: 'engine slow',
    ...overrides,
  }
}

function fakeError(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    code: 'LAYOUT_NO_ROOT_NODE',
    message: 'no root',
    timestamp: 1000,
    hasResult: false,
    ...overrides,
  }
}

function fakeAfter(overrides: Partial<AfterCallEvent> = {}): AfterCallEvent {
  return {
    durationMs: 123,
    success: true,
    hasMetrics: true,
    errorCount: 0,
    wideTree: false,
    ...overrides,
  }
}

// ============================================================
// K1 - Sentry sink 基础
// ============================================================

describe('K1 - Sentry sink 基础桥接', () => {
  it('onSlowPhase → captureMessage("warning", tags/extra)', () => {
    const captureMessage = vi.fn()
    const client: SentryLikeClient = { captureMessage }
    const sink = createSentrySink(client)
    sink.onSlowPhase?.(fakeSlow())
    expect(captureMessage).toHaveBeenCalledTimes(1)
    const [msg, level, ctx] = captureMessage.mock.calls[0]
    expect(msg).toContain('LayoutEngine slow phase')
    expect(msg).toContain('engine')
    expect(level).toBe('warning')
    expect(ctx.tags['layout.phase']).toBe('engine')
    expect(ctx.tags['layout.engine']).toBe('dagre')
    expect(ctx.extra.durationMs).toBe(350)
  })

  it('onError → captureException(err, ctx)', () => {
    const captureException = vi.fn()
    const client: SentryLikeClient = { captureException }
    const sink = createSentrySink(client)
    sink.onError?.(fakeError())
    expect(captureException).toHaveBeenCalledTimes(1)
    const [err, ctx] = captureException.mock.calls[0]
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('no root')
    expect((err as Error).name).toBe('LAYOUT_NO_ROOT_NODE')
    expect(ctx.tags['layout.error_code']).toBe('LAYOUT_NO_ROOT_NODE')
  })

  it('onAfterCall → addBreadcrumb(category=layout)', () => {
    const addBreadcrumb = vi.fn()
    const client: SentryLikeClient = { addBreadcrumb }
    const sink = createSentrySink(client)
    sink.onAfterCall?.(fakeAfter({ success: true, durationMs: 99 }))
    expect(addBreadcrumb).toHaveBeenCalledTimes(1)
    const crumb = addBreadcrumb.mock.calls[0][0]
    expect(crumb.category).toBe('layout')
    expect(crumb.level).toBe('info')
    expect(crumb.data.durationMs).toBe(99)
  })

  it('afterCall failure → level=error', () => {
    const addBreadcrumb = vi.fn()
    const sink = createSentrySink({ addBreadcrumb })
    sink.onAfterCall?.(fakeAfter({ success: false }))
    expect(addBreadcrumb.mock.calls[0][0].level).toBe('error')
  })
})

// ============================================================
// K2 - Sentry sink 抛错被吞
// ============================================================

describe('K2 - Sentry sink 抛错被吞', () => {
  it('captureMessage 抛错时不传播', () => {
    const broken: SentryLikeClient = {
      captureMessage: () => { throw new Error('sdk bug') },
    }
    const sink = createSentrySink(broken)
    expect(() => sink.onSlowPhase?.(fakeSlow())).not.toThrow()
  })

  it('captureException 抛错时不传播', () => {
    const broken: SentryLikeClient = {
      captureException: () => { throw new Error('sdk bug') },
    }
    const sink = createSentrySink(broken)
    expect(() => sink.onError?.(fakeError())).not.toThrow()
  })

  it('silentIfUnavailable=false 时输出 console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: SentryLikeClient = {
      captureMessage: () => { throw new Error('sdk bug') },
    }
    const sink = createSentrySink(broken, { silentIfUnavailable: false })
    sink.onSlowPhase?.(fakeSlow())
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

// ============================================================
// K3 - Sentry sink 选项
// ============================================================

describe('K3 - Sentry sink 选项控制', () => {
  it('slowPhaseAsWarning=false → 不调用 captureMessage', () => {
    const captureMessage = vi.fn()
    const sink = createSentrySink({ captureMessage }, { slowPhaseAsWarning: false })
    sink.onSlowPhase?.(fakeSlow())
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('errorAsException=false → 不调用 captureException', () => {
    const captureException = vi.fn()
    const sink = createSentrySink({ captureException }, { errorAsException: false })
    sink.onError?.(fakeError())
    expect(captureException).not.toHaveBeenCalled()
  })

  it('afterCallAsBreadcrumb=false → 不调用 addBreadcrumb', () => {
    const addBreadcrumb = vi.fn()
    const sink = createSentrySink({ addBreadcrumb }, { afterCallAsBreadcrumb: false })
    sink.onAfterCall?.(fakeAfter())
    expect(addBreadcrumb).not.toHaveBeenCalled()
  })

  it('tagPrefix 自定义', () => {
    const captureMessage = vi.fn()
    const sink = createSentrySink({ captureMessage }, { tagPrefix: 'app' })
    sink.onSlowPhase?.(fakeSlow())
    const ctx = captureMessage.mock.calls[0][2]
    expect(ctx.tags['app.phase']).toBe('engine')
    expect(ctx.tags['app.engine']).toBe('dagre')
  })
})

// ============================================================
// K4 - Sentry stub
// ============================================================

describe('K4 - createDevSentryStub', () => {
  it('captureException 输出 console.error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stub = createDevSentryStub()
    stub.captureException?.(new Error('x'))
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('captureMessage 输出 console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stub = createDevSentryStub()
    stub.captureMessage?.('msg', 'warning')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('addBreadcrumb 输出 console.debug', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const stub = createDevSentryStub()
    stub.addBreadcrumb?.({ message: 'm' })
    expect(debugSpy).toHaveBeenCalled()
    debugSpy.mockRestore()
  })
})

// ============================================================
// K5 - DataDog sink 基础
// ============================================================

describe('K5 - DataDog sink 基础桥接', () => {
  it('onSlowPhase → logger.warn(msg, ctx)', () => {
    const warn = vi.fn()
    const client: DatadogLikeClient = { logger: { warn } }
    const sink = createDatadogSink(client)
    sink.onSlowPhase?.(fakeSlow())
    expect(warn).toHaveBeenCalledTimes(1)
    const [msg, ctx] = warn.mock.calls[0]
    expect(msg).toContain('Layout')
    expect(ctx.phase).toBe('engine')
    expect(ctx.engine).toBe('dagre')
    expect(ctx.durationMs).toBe(350)
  })

  it('onError → addError(err, ctx)', () => {
    const addError = vi.fn()
    const client: DatadogLikeClient = { addError }
    const sink = createDatadogSink(client)
    sink.onError?.(fakeError())
    expect(addError).toHaveBeenCalledTimes(1)
    const [err, ctx] = addError.mock.calls[0]
    expect(err).toBeInstanceOf(Error)
    expect(ctx.code).toBe('LAYOUT_NO_ROOT_NODE')
  })

  it('afterCallAsAction=false（默认）不调用 addAction', () => {
    const addAction = vi.fn()
    const sink = createDatadogSink({ addAction })
    sink.onAfterCall?.(fakeAfter())
    expect(addAction).not.toHaveBeenCalled()
  })
})

// ============================================================
// K6 - DataDog afterCallSampleRate
// ============================================================

describe('K6 - DataDog afterCall 采样', () => {
  it('afterCallSampleRate=1 全部调用', () => {
    const addAction = vi.fn()
    const sink = createDatadogSink({ addAction }, {
      afterCallAsAction: true,
      afterCallSampleRate: 1,
    })
    for (let i = 0; i < 10; i += 1) sink.onAfterCall?.(fakeAfter())
    expect(addAction).toHaveBeenCalledTimes(10)
  })

  it('afterCallSampleRate=0 不调用', () => {
    const addAction = vi.fn()
    const sink = createDatadogSink({ addAction }, {
      afterCallAsAction: true,
      afterCallSampleRate: 0,
    })
    for (let i = 0; i < 100; i += 1) sink.onAfterCall?.(fakeAfter())
    expect(addAction).not.toHaveBeenCalled()
  })

  it('afterCallSampleRate=0.5 约 50% 调用（容差 ±20%）', () => {
    const addAction = vi.fn()
    const sink = createDatadogSink({ addAction }, {
      afterCallAsAction: true,
      afterCallSampleRate: 0.5,
    })
    for (let i = 0; i < 1000; i += 1) sink.onAfterCall?.(fakeAfter())
    const calls = addAction.mock.calls.length
    expect(calls).toBeGreaterThanOrEqual(400)
    expect(calls).toBeLessThanOrEqual(600)
  })
})

// ============================================================
// K7 - DataDog 抛错被吞
// ============================================================

describe('K7 - DataDog sink 抛错被吞', () => {
  it('addError 抛错时不传播', () => {
    const broken: DatadogLikeClient = {
      addError: () => { throw new Error('boom') },
    }
    const sink = createDatadogSink(broken)
    expect(() => sink.onError?.(fakeError())).not.toThrow()
  })
})

// ============================================================
// K8 - Datadog stub
// ============================================================

describe('K8 - createDevDatadogStub', () => {
  it('addError 输出 console.error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stub = createDevDatadogStub()
    stub.addError?.(new Error('x'))
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('logger.warn 输出 console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stub = createDevDatadogStub()
    stub.logger?.warn?.('m')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

// ============================================================
// K9 - duck-typing 兼容
// ============================================================

describe('K9 - duck-typing 兼容性', () => {
  it('Sentry 客户端无 captureMessage 时不抛错（跳过该事件）', () => {
    const client: SentryLikeClient = {
      captureException: vi.fn(),
      // captureMessage: undefined（缺）
    }
    const sink = createSentrySink(client)
    // 不抛错，且 captureException 仍可用
    expect(() => sink.onSlowPhase?.(fakeSlow())).not.toThrow()
  })

  it('空对象客户端不抛错（什么都跳过）', () => {
    const sink = createSentrySink({})
    expect(() => sink.onSlowPhase?.(fakeSlow())).not.toThrow()
    expect(() => sink.onError?.(fakeError())).not.toThrow()
    expect(() => sink.onAfterCall?.(fakeAfter())).not.toThrow()
  })
})

// ============================================================
// K10 - 与 createCombinedLogger 兼容
// ============================================================

describe('K10 - 与 createCombinedLogger 集成', () => {
  it('Sentry + Console 同时被调用', () => {
    const captureMessage = vi.fn()
    const consoleLogger = {
      onSlowPhase: vi.fn(),
    }
    const combined = createCombinedLogger([
      consoleLogger,
      createSentrySink({ captureMessage }),
    ])
    combined.onSlowPhase?.(fakeSlow())
    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(consoleLogger.onSlowPhase).toHaveBeenCalledTimes(1)
  })
})