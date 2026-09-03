/**
 * layout-engine-auto-fit.spec.ts — computeAutoFit 函数单元测试
 *
 * [§8.3 2026-09-03] 新增独立模块的直测，补充 layout-engine.autofit.spec.ts
 *   （后者走 LayoutEngine 类 API，本文件直接测 free 函数）
 *
 * 测试目标：
 * 1. P0.A 极端宽树：aspectRatio > 3 + scaleX < minZoom → wideTree=true
 * 2. P0.B 普通树：aspectRatio ≤ 3 → 走 min(scaleX, scaleY)
 * 3. P0.C 边界：aspectRatio > 3 但 scaleX ≥ minZoom → 不触发 wideTree
 * 4. P0.D contentAspectRatio 字段准确性
 * 5. P0.E layoutDirection 推断（auto 模式）
 * 6. P0.F 退化输入：零尺寸不触发除零
 * 7. P0.G preferDirection 显式指定保留用户选择
 * 8. P0.H onWideTreeDetected 回调正确触发
 * 9. P0.I wideTreeAspectRatio 配置覆盖（默认 3）
 */

import { describe, it, expect, vi } from 'vitest'
import { computeAutoFit, type AutoFitContext } from '@/utils/layout-engine-auto-fit'
import type { LayoutConfig, LayoutResult } from '@/types/layout'
import { DEFAULT_LAYOUT_CONFIG } from '@/types/layout'

const baseConfig: LayoutConfig = {
  ...DEFAULT_LAYOUT_CONFIG,
  autoFit: {
    enabled: true,
    padding: 40,
    maxZoom: 2,
    minZoom: 0.25,
    preferDirection: 'auto',
  },
}

function makeFakeLayout(contentW: number, contentH: number): LayoutResult {
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

function makeCtx(
  config: LayoutConfig = baseConfig,
  canvasSize = { width: 1200, height: 800 },
): AutoFitContext {
  return { canvasSize, config }
}

// ============================================================
// P0.A — 极端宽树（朱熹 demo 复现）
// ============================================================
describe('computeAutoFit - P0.A 极端宽树', () => {
  it('aspectRatio > 3 + scaleX < minZoom → wideTree=true，zoom 接近 fitByHeight', () => {
    // 朱熹 demo 86 节点：67K × 1K
    const layout = makeFakeLayout(67000, 1000)
    const viewport = computeAutoFit(layout, makeCtx())

    expect(viewport.wideTree).toBe(true)
    expect(viewport.contentAspectRatio).toBeGreaterThan(3)
    // fitByHeight = (800-80)/1000 = 0.72
    expect(viewport.zoom).toBeCloseTo(0.72, 1)
    // 显著优于旧逻辑的 0.25
    expect(viewport.zoom).toBeGreaterThan(0.5)
  })
})

// ============================================================
// P0.B — 普通树（aspectRatio ≤ 3）
// ============================================================
describe('computeAutoFit - P0.B 普通树', () => {
  it('aspectRatio 1.33 → wideTree=false，走 min(scaleX, scaleY)', () => {
    const layout = makeFakeLayout(800, 600)
    const viewport = computeAutoFit(layout, makeCtx())

    expect(viewport.wideTree).toBe(false)
    // scaleX = 1120/800 = 1.4，scaleY = 720/600 = 1.2 → min = 1.2
    expect(viewport.zoom).toBeCloseTo(1.2, 1)
  })

  it('aspectRatio 1.0 → zoom 取较小边（min），仍在合理范围', () => {
    // layout 1000×1000，canvas 1200×800：
    // scaleX = 1120/1000 = 1.12，scaleY = 720/1000 = 0.72 → min = 0.72
    const layout = makeFakeLayout(1000, 1000)
    const viewport = computeAutoFit(layout, makeCtx())

    expect(viewport.wideTree).toBe(false)
    expect(viewport.zoom).toBeCloseTo(0.72, 1)
  })
})

// ============================================================
// P0.C — 边界（aspectRatio > 3 但 scaleX ≥ minZoom）
// ============================================================
describe('computeAutoFit - P0.C 边界', () => {
  it('aspectRatio 3.43 + scaleX 0.467 ≥ minZoom → 不触发 wideTree', () => {
    const layout = makeFakeLayout(2400, 700)
    const viewport = computeAutoFit(layout, makeCtx())

    expect(viewport.wideTree).toBe(false)
    expect(viewport.contentAspectRatio).toBeGreaterThan(3)
    expect(viewport.zoom).toBeCloseTo(0.467, 2)
  })
})

// ============================================================
// P0.D — contentAspectRatio 字段准确性
// ============================================================
describe('computeAutoFit - P0.D contentAspectRatio', () => {
  it('aspectRatio = 4 → contentAspectRatio = 4.0', () => {
    const layout = makeFakeLayout(4000, 1000)
    const viewport = computeAutoFit(layout, makeCtx())

    expect(typeof viewport.contentAspectRatio).toBe('number')
    expect(viewport.contentAspectRatio).toBeCloseTo(4.0, 1)
  })

  it('正方形 layout → contentAspectRatio = 1', () => {
    const layout = makeFakeLayout(500, 500)
    const viewport = computeAutoFit(layout, makeCtx())

    expect(viewport.contentAspectRatio).toBeCloseTo(1.0, 1)
  })
})

// ============================================================
// P0.E — layoutDirection 推断
// ============================================================
describe('computeAutoFit - P0.E layoutDirection 推断', () => {
  it('极端宽树 → LR（contentW >> contentH）', () => {
    const layout = makeFakeLayout(67000, 1000)
    const viewport = computeAutoFit(layout, makeCtx())
    expect(viewport.layoutDirection).toBe('LR')
  })

  it('正方形/偏高树 → TB', () => {
    const layout = makeFakeLayout(800, 1200)
    const viewport = computeAutoFit(layout, makeCtx())
    expect(viewport.layoutDirection).toBe('TB')
  })
})

// ============================================================
// P0.F — 退化输入：零尺寸不触发除零
// ============================================================
describe('computeAutoFit - P0.F 退化输入', () => {
  it('单点 layout（contentW=H=0）不触发除零', () => {
    const layout: LayoutResult = {
      nodes: [{ id: 'a', x: 100, y: 100, width: 64, height: 28 }],
      edges: [],
      bounds: { minX: 100, minY: 100, maxX: 100, maxY: 100 },
      generations: 1,
      totalNodes: 1,
    }
    const viewport = computeAutoFit(layout, makeCtx())

    expect(Number.isFinite(viewport.zoom)).toBe(true)
    expect(Number.isFinite(viewport.centerX)).toBe(true)
    expect(Number.isFinite(viewport.centerY)).toBe(true)
    expect(viewport.wideTree).toBe(false)
    expect(viewport.contentAspectRatio).toBeCloseTo(1.0, 1)
  })
})

// ============================================================
// P0.G — preferDirection 显式指定
// ============================================================
describe('computeAutoFit - P0.G preferDirection 显式', () => {
  it('preferDirection=TB 即便 contentW < contentH → 保留 TB', () => {
    const layout = makeFakeLayout(800, 1200)
    const ctx = makeCtx({
      ...baseConfig,
      autoFit: { ...baseConfig.autoFit, preferDirection: 'TB' },
    })
    const viewport = computeAutoFit(layout, ctx)
    expect(viewport.layoutDirection).toBe('TB')
  })

  it('preferDirection=LR 即便 contentW > contentH 但不宽 → 保留 LR', () => {
    const layout = makeFakeLayout(800, 1200)
    const ctx = makeCtx({
      ...baseConfig,
      autoFit: { ...baseConfig.autoFit, preferDirection: 'LR' },
    })
    const viewport = computeAutoFit(layout, ctx)
    expect(viewport.layoutDirection).toBe('LR')
  })
})

// ============================================================
// P0.H — onWideTreeDetected 回调
// ============================================================
describe('computeAutoFit - P0.H onWideTreeDetected 回调', () => {
  it('触发 wideTree=true → 回调 wideTree=true', () => {
    const layout = makeFakeLayout(67000, 1000)
    const onWideTreeDetected = vi.fn()
    computeAutoFit(layout, { ...makeCtx(), onWideTreeDetected })
    expect(onWideTreeDetected).toHaveBeenCalledWith(true)
  })

  it('普通树 → 回调 wideTree=false', () => {
    const layout = makeFakeLayout(800, 600)
    const onWideTreeDetected = vi.fn()
    computeAutoFit(layout, { ...makeCtx(), onWideTreeDetected })
    expect(onWideTreeDetected).toHaveBeenCalledWith(false)
  })

  it('不传回调不抛错', () => {
    const layout = makeFakeLayout(67000, 1000)
    expect(() => computeAutoFit(layout, makeCtx())).not.toThrow()
  })
})

// ============================================================
// P0.I — wideTreeAspectRatio 配置覆盖
// ============================================================
describe('computeAutoFit - P0.I wideTreeAspectRatio 配置', () => {
  it('默认 wideTreeAspectRatio=3：宽树（aspectRatio=10, scaleX < minZoom）触发 wideTree', () => {
    // 10000×1000：aspectRatio=10，且 scaleX = 1120/10000 = 0.112 < minZoom=0.25 → wideTree
    const layout = makeFakeLayout(10000, 1000)
    const viewport = computeAutoFit(layout, makeCtx())
    expect(viewport.wideTree).toBe(true)
  })

  it('自定义 wideTreeAspectRatio=5：宽树（aspectRatio=10）触发 wideTree', () => {
    const layout = makeFakeLayout(10000, 1000) // aspectRatio = 10, scaleX 0.112 < minZoom
    const customConfig: LayoutConfig = {
      ...baseConfig,
      wideTreeAspectRatio: 5,
    }
    const viewport = computeAutoFit(layout, makeCtx(customConfig))
    expect(viewport.wideTree).toBe(true)
  })

  it('自定义 wideTreeAspectRatio=10：aspectRatio=4（低于阈值）不触发 wideTree', () => {
    const layout = makeFakeLayout(4000, 1000) // aspectRatio = 4
    const customConfig: LayoutConfig = {
      ...baseConfig,
      wideTreeAspectRatio: 10,
    }
    const viewport = computeAutoFit(layout, makeCtx(customConfig))
    expect(viewport.wideTree).toBe(false)
  })
})

// ============================================================
// P0.J — zoom clamp 到 [minZoom, maxZoom]
// ============================================================
describe('computeAutoFit - P0.J zoom clamp', () => {
  it('原始 scaleY 超出 maxZoom → 被 clamp 到 maxZoom', () => {
    // 极小 layout → scaleY 极大
    const layout = makeFakeLayout(50, 50)
    const viewport = computeAutoFit(layout, makeCtx())
    expect(viewport.zoom).toBeLessThanOrEqual(baseConfig.autoFit.maxZoom)
  })

  it('原始 scaleX 低于 minZoom 但非宽树 → 仍走 min 但保留 ≥ minZoom', () => {
    // 巨大 layout：scaleX 远低于 minZoom，但 aspectRatio ≈ 1 → 不是宽树
    const layout = makeFakeLayout(100000, 100000)
    const viewport = computeAutoFit(layout, makeCtx())
    // min(scaleX, scaleY) ≈ 0.011，clamp 到 minZoom=0.25
    expect(viewport.zoom).toBe(baseConfig.autoFit.minZoom)
    expect(viewport.wideTree).toBe(false)
  })
})