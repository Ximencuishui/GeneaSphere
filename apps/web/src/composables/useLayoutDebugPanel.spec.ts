/**
 * useLayoutDebugPanel.spec.ts
 *
 * [v6.x 健壮性 L+D 系列] 布局调试面板 composable 单元测试
 *
 * 覆盖：
 *  - P1  直接传 engine 实例：setup 阶段同步绑定 logger
 *  - P2  传 ref：ref 变化时自动重新绑定
 *  - P3  传 getter：内部 ref 变化时自动重新绑定
 *  - P4  refresh() 把 engine 数据同步到响应式 ref
 *  - P5  recordSlowPhase / recordError 累积历史（带上限）
 *  - P6  detach 旧 engine 后 previousLogger 还原
 *  - P7  onUnmounted 时清理当前 binding
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, shallowRef, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useLayoutDebugPanel } from '@/composables/useLayoutDebugPanel'
import { LayoutEngine } from '@/utils/layout-engine'
import type { LayoutLogger, SlowPhaseEvent, ErrorEvent } from '@/utils/layout-logger'

// ---------- helpers ----------

function buildHost(opts: {
  factory: () => ReturnType<typeof useLayoutDebugPanel>
}) {
  return defineComponent({
    setup() {
      const panel = opts.factory()
      return { panel }
    },
    render() {
      return h('div')
    },
  })
}

/** mount host 并返回 panel（同步）；nextTick 由调用方按需 await */
function mountHost(opts: {
  factory: () => ReturnType<typeof useLayoutDebugPanel>
}) {
  const Comp = buildHost(opts)
  const wrapper = mount(Comp)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { wrapper, panel: (wrapper.vm as any).panel as ReturnType<typeof useLayoutDebugPanel> }
}

function buildEngine(): LayoutEngine {
  return new LayoutEngine({
    canvasSize: { width: 800, height: 600 },
    config: { nodeSep: 24, rankSep: 48 },
  })
}

// ---------- tests ----------

describe('P1 - 直接传 engine 实例', () => {
  it('setup 阶段同步替换 logger', () => {
    const engine = buildEngine()
    const original = { onSlowPhase: vi.fn() }
    engine.setLogger(original)

    const { panel } = mountHost({
      factory: () => useLayoutDebugPanel(engine),
    })

    // currentEngine() getter 暴露当前实例
    expect(panel.currentEngine()).toBe(engine)
  })

  it('refresh() 同步 engine 数据到 ref', async () => {
    const engine = buildEngine()
    const { panel } = mountHost({
      factory: () => useLayoutDebugPanel(engine),
    })

    // 跑一次 calculateLayout 让 metrics 填充
    await engine.calculateLayout(
      [{ id: 'A', label: 'A', gender: 'male', isMainLineage: true, isLiving: true, generation: 0, width: 64, height: 28 }],
      [],
    )

    panel.refresh()

    expect(panel.cumulative.value.totalCalls).toBe(1)
    expect(panel.lastMeta.value).not.toBeNull()
    expect(panel.timings.value.length).toBeGreaterThan(0)
  })

  it('engine 为 null 时 refresh() 不抛错', () => {
    let captured: ReturnType<typeof useLayoutDebugPanel> | null = null
    const Comp = defineComponent({
      setup() {
        captured = useLayoutDebugPanel(null)
        return () => h('div')
      },
    })
    const wrapper = mount(Comp)
    expect(() => captured!.refresh()).not.toThrow()
    wrapper.unmount()
  })
})

describe('P2 - 传 ref 形式', () => {
  it('ref 初始为 null：不绑定 engine', () => {
    const ref = shallowRef<LayoutEngine | null>(null)
    const { panel } = mountHost({
      factory: () => useLayoutDebugPanel(ref),
    })
    expect(panel.currentEngine()).toBeNull()
  })

  it('ref 变化时自动重新绑定', async () => {
    const ref = shallowRef<LayoutEngine | null>(null)
    const { panel, wrapper } = mountHost({
      factory: () => useLayoutDebugPanel(ref),
    })
    expect(panel.currentEngine()).toBeNull()

    const engine = buildEngine()
    ref.value = engine
    await nextTick()

    expect(panel.currentEngine()).toBe(engine)

    wrapper.unmount()
  })

  it('ref 从 A 切换到 B：A 还原原 logger，B 绑定新 logger', async () => {
    const engineA = buildEngine()
    const originalA = { onSlowPhase: vi.fn() }
    engineA.setLogger(originalA)

    const ref = shallowRef<LayoutEngine | null>(engineA)
    const { panel, wrapper } = mountHost({
      factory: () => useLayoutDebugPanel(ref),
    })
    await nextTick()

    // 替换为 B
    const engineB = buildEngine()
    const originalB = { onSlowPhase: vi.fn() }
    engineB.setLogger(originalB)
    ref.value = engineB
    await nextTick()

    // A 应还原 originalA
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loggerOnA = (engineA as any).logger as LayoutLogger | null
    expect(loggerOnA?.onSlowPhase).toBe(originalA.onSlowPhase)
    // B 应被 composable 接管
    expect(panel.currentEngine()).toBe(engineB)

    wrapper.unmount()
  })

  it('getter 形式：内部 ref 变化触发重新绑定', async () => {
    const ref = shallowRef<LayoutEngine | null>(null)
    const { panel, wrapper } = mountHost({
      factory: () => useLayoutDebugPanel(() => ref.value),
    })

    const engine = buildEngine()
    ref.value = engine
    await nextTick()
    expect(panel.currentEngine()).toBe(engine)

    wrapper.unmount()
  })
})

describe('P3 - recordSlowPhase / recordError 上限', () => {
  it('recordSlowPhase 历史超过 50 条后丢弃最早的', () => {
    const engine = buildEngine()
    const { panel } = mountHost({
      factory: () => useLayoutDebugPanel(engine),
    })

    for (let i = 0; i < 60; i += 1) {
      panel.recordSlowPhase({
        phase: 'engine',
        durationMs: 300 + i,
        thresholdMs: 200,
        message: `event ${i}`,
      })
    }

    expect(panel.slowPhases.value.length).toBe(50)
    // 最新一条应是第 59 次
    expect(panel.slowPhases.value[49].durationMs).toBe(359)
  })

  it('recordError 历史超过 50 条后丢弃最早的', () => {
    const engine = buildEngine()
    const { panel } = mountHost({
      factory: () => useLayoutDebugPanel(engine),
    })

    for (let i = 0; i < 60; i += 1) {
      panel.recordError({ code: 'X', message: `m${i}` })
    }

    expect(panel.errors.value.length).toBe(50)
    expect(panel.errors.value[49].message).toBe('m59')
  })
})

describe('P4 - onSlowPhase 通过 logger 桥接', () => {
  it('engine 上触发 onSlowPhase → panel.slowPhases 自动累积', async () => {
    const engine = buildEngine()
    // 设 0ms 阈值让所有阶段都触发 onSlowPhase
    engine.setSlowPhaseThreshold(0)

    const { panel } = mountHost({
      factory: () => useLayoutDebugPanel(engine),
    })

    await engine.calculateLayout(
      [{ id: 'A', label: 'A', gender: 'male', isMainLineage: true, isLiving: true, generation: 0, width: 64, height: 28 }],
      [],
    )

    // 应有慢路径事件被记录
    expect(panel.slowPhases.value.length).toBeGreaterThan(0)
    const first = panel.slowPhases.value[0]
    expect(first.phase).toBeDefined()
    expect(first.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('engine 上 onError 触发 → panel.errors 自动累积', async () => {
    const engine = buildEngine()
    const { panel } = mountHost({
      factory: () => useLayoutDebugPanel(engine),
    })

    // 触发 CYCLE 错误
    await expect(engine.calculateLayout(
      [
        { id: 'A', label: 'A', gender: 'male', isMainLineage: true, isLiving: true, generation: 0, width: 64, height: 28 },
        { id: 'B', label: 'B', gender: 'male', isMainLineage: true, isLiving: true, generation: 1, width: 64, height: 28 },
      ],
      [
        { id: 'e1', source: 'A', target: 'B', kind: 'parent-child' },
        { id: 'e2', source: 'B', target: 'A', kind: 'parent-child' },
      ],
    )).rejects.toThrow()

    expect(panel.errors.value.length).toBeGreaterThan(0)
    expect(panel.errors.value[0].code).toBe('LAYOUT_CYCLE_DETECTED')
  })
})

describe('P5 - detach 行为', () => {
  it('unmount 时还原 previousLogger', async () => {
    const engine = buildEngine()
    const original = { onSlowPhase: vi.fn() }
    engine.setLogger(original)

    const { wrapper } = mountHost({
      factory: () => useLayoutDebugPanel(engine),
    })
    await nextTick()

    wrapper.unmount()

    // unmount 后 previousLogger 应被还原
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restored = (engine as any).logger as LayoutLogger | null
    expect(restored?.onSlowPhase).toBe(original.onSlowPhase)
  })

  it('多次切换 ref：每次都正确清理上一个 binding', async () => {
    const ref = shallowRef<LayoutEngine | null>(null)
    const { wrapper } = mountHost({
      factory: () => useLayoutDebugPanel(ref),
    })
    await nextTick()

    const e1 = buildEngine()
    const o1 = { onSlowPhase: vi.fn() }
    e1.setLogger(o1)
    ref.value = e1
    await nextTick()

    const e2 = buildEngine()
    const o2 = { onSlowPhase: vi.fn() }
    e2.setLogger(o2)
    ref.value = e2
    await nextTick()

    // e1 应还原 original
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((e1 as any).logger as LayoutLogger)?.onSlowPhase).toBe(o1.onSlowPhase)

    wrapper.unmount()

    // e2 也应在 unmount 时还原
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((e2 as any).logger as LayoutLogger)?.onSlowPhase).toBe(o2.onSlowPhase)
  })
})

describe('P6 - errorRate 计算属性', () => {
  it('0 调用时 errorRate=0', () => {
    const engine = buildEngine()
    const { panel } = mountHost({
      factory: () => useLayoutDebugPanel(engine),
    })
    expect(panel.errorRate.value).toBe(0)
  })

  it('多次调用后 errorRate 正确', async () => {
    const engine = buildEngine()
    const { panel } = mountHost({
      factory: () => useLayoutDebugPanel(engine),
    })

    // 成功 1 次
    await engine.calculateLayout(
      [{ id: 'A', label: 'A', gender: 'male', isMainLineage: true, isLiving: true, generation: 0, width: 64, height: 28 }],
      [],
    )

    // 失败 1 次（CYCLE）
    await expect(engine.calculateLayout(
      [
        { id: 'A', label: 'A', gender: 'male', isMainLineage: true, isLiving: true, generation: 0, width: 64, height: 28 },
        { id: 'B', label: 'B', gender: 'male', isMainLineage: true, isLiving: true, generation: 1, width: 64, height: 28 },
      ],
      [
        { id: 'e1', source: 'A', target: 'B', kind: 'parent-child' },
        { id: 'e2', source: 'B', target: 'A', kind: 'parent-child' },
      ],
    )).rejects.toThrow()

    panel.refresh()

    expect(panel.cumulative.value.totalCalls).toBe(2)
    expect(panel.cumulative.value.errorCalls).toBe(1)
    expect(panel.errorRate.value).toBe(0.5)
  })
})