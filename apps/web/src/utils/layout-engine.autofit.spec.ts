/**
 * layout-engine.autofit.spec.ts - LayoutEngine.autoFit 单元测试
 *
 * [2026-09-01 P0 修复] 新增专门覆盖 autoFit 极端宽树场景的回归测试。
 *
 * 触发根因（详见 docs/testing/2026-09-01-layout-v6/REPORT.md §3 P0）：
 * - 朱熹 demo 86 节点渲染画布宽 67 994 px
 * - 原生 scaleX = (1280-80)/67994 ≈ 0.017
 * - 旧逻辑 min(scaleX, scaleY) → 0.017 → clamp 到 minZoom=0.25 → 仍不可用
 * - 新逻辑：当 contentW/contentH > 3 且 scaleX < minZoom → 视为「极端宽树」
 *   强制使用 scaleY（fitByHeight），保证 zoom 在合理范围
 *
 * 测试要点：
 * 1. P0.A 极端宽树：aspectRatio > 3 + scaleX < minZoom → wideTree=true，zoom 显著大于旧值
 * 2. P0.B 普通树：aspectRatio ≤ 3 → wideTree=false，沿用 min(scaleX, scaleY)
 * 3. P0.C 边界：aspectRatio > 3 但 scaleX ≥ minZoom → 不触发 wideTree
 * 4. P0.D contentAspectRatio 字段准确性
 * 5. P0.E 极端宽树下 layoutDirection 正确推断为 LR
 */

import { describe, it, expect } from 'vitest'
import { LayoutEngine } from '@/utils/layout-engine'
import type { LayoutConfig, LayoutResult } from '@/types/layout'

const baseConfig: Partial<LayoutConfig> = {
  nodeSep: 24,
  rankSep: 48,
  spouseGap: 16,
  marriageJunctionOffset: 0,
  edgeHorizontalSeparation: 0,
  resolveSubtreeOverlap: true,
  mainLineageCenter: true,
  spouseOptimization: true,
  autoFit: {
    enabled: true,
    padding: 40,
    maxZoom: 2,
    minZoom: 0.25,
    preferDirection: 'auto',
  },
}

/**
 * 构造指定包围盒的 fake layout（不触发真实计算，仅用于 autoFit 输入）
 */
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

describe('LayoutEngine.autoFit - P0 极端宽树修复', () => {
  it('P0.A 极端宽树（朱熹 demo 复现）：aspectRatio > 3 + scaleX < minZoom → wideTree=true，zoom 显著优于旧值', () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: { ...baseConfig },
    })
    // 模拟朱熹 demo 86 节点场景：67K × 1K
    const fakeLayout = makeFakeLayout(67000, 1000)
    const viewport = e.autoFit(fakeLayout)

    // 验证 wideTree 触发
    expect(viewport.wideTree).toBe(true)
    expect(viewport.contentAspectRatio).toBeGreaterThan(3)

    // 验证 zoom 显著优于旧逻辑的 0.25
    //   fitByHeight = (800-80)/1000 = 0.72，clamp 到 [0.25, 2] = 0.72
    expect(viewport.zoom).toBeGreaterThan(0.5)
    expect(viewport.zoom).toBeLessThan(1.5)
    // 关键：实际值应接近 fitByHeight（即 0.72）
    expect(viewport.zoom).toBeCloseTo(0.72, 1)
  })

  it('P0.B 普通树：aspectRatio < 3 → wideTree=false，沿用 min(scaleX, scaleY)', () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: { ...baseConfig },
    })
    // 紧凑布局：800 × 600（aspectRatio = 1.33）
    const fakeLayout = makeFakeLayout(800, 600)
    const viewport = e.autoFit(fakeLayout)

    expect(viewport.wideTree).toBe(false)
    expect(viewport.contentAspectRatio).toBeLessThan(3)
    // scaleX = 1120/800 = 1.4，scaleY = 720/600 = 1.2 → min = 1.2
    expect(viewport.zoom).toBeCloseTo(1.2, 1)
  })

  it('P0.C 边界：aspectRatio 略大于 3 但 scaleX ≥ minZoom → 不触发 wideTree', () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: { ...baseConfig },
    })
    // 2400 × 700：aspectRatio ≈ 3.43，但 scaleX = 1120/2400 = 0.467 ≥ minZoom=0.25
    // 此场景下原 min(scaleX, scaleY) = 0.467 仍可用，不应强制 fitByHeight
    const fakeLayout = makeFakeLayout(2400, 700)
    const viewport = e.autoFit(fakeLayout)

    expect(viewport.wideTree).toBe(false)
    expect(viewport.contentAspectRatio).toBeGreaterThan(3)
    expect(viewport.zoom).toBeCloseTo(0.467, 2)
  })

  it('P0.D contentAspectRatio 字段存在且数值准确', () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: { ...baseConfig },
    })
    const fakeLayout = makeFakeLayout(4000, 1000) // aspectRatio = 4
    const viewport = e.autoFit(fakeLayout)

    expect(typeof viewport.contentAspectRatio).toBe('number')
    expect(viewport.contentAspectRatio).toBeCloseTo(4.0, 1)
  })

  it('P0.E 极端宽树下 layoutDirection 正确推断为 LR', () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: { ...baseConfig },
    })
    const fakeLayout = makeFakeLayout(67000, 1000)
    const viewport = e.autoFit(fakeLayout)

    // contentW >> contentH → 推断为 LR（横向布局）
    expect(viewport.layoutDirection).toBe('LR')
  })

  it('P0.F 正方形/偏高树：layoutDirection 推断为 TB', () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: { ...baseConfig },
    })
    const fakeLayout = makeFakeLayout(800, 1200) // 偏高
    const viewport = e.autoFit(fakeLayout)

    expect(viewport.layoutDirection).toBe('TB')
    expect(viewport.wideTree).toBe(false)
  })

  it('P0.G 退化输入：零尺寸 contentW/H 不会触发除零', () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: { ...baseConfig },
    })
    // 极端退化：单点 layout（contentW=H=0）
    const fakeLayout: LayoutResult = {
      nodes: [{ id: 'a', x: 100, y: 100, width: 64, height: 28 }],
      edges: [],
      bounds: { minX: 100, minY: 100, maxX: 100, maxY: 100 },
      generations: 1,
      totalNodes: 1,
    }
    const viewport = e.autoFit(fakeLayout)

    // Math.max(1, 0) 防御性处理 → aspectRatio = 1
    expect(Number.isFinite(viewport.zoom)).toBe(true)
    expect(Number.isFinite(viewport.centerX)).toBe(true)
    expect(Number.isFinite(viewport.centerY)).toBe(true)
    expect(viewport.wideTree).toBe(false)
  })

  it('P0.H preferDirection 显式指定时保留用户选择', () => {
    const e = new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: {
        ...baseConfig,
        autoFit: { ...baseConfig.autoFit!, preferDirection: 'TB' },
      },
    })
    const fakeLayout = makeFakeLayout(800, 1200) // 内容偏宽高比 0.67
    const viewport = e.autoFit(fakeLayout)

    // 即便 contentW < contentH，用户强制 TB → 保留 TB
    expect(viewport.layoutDirection).toBe('TB')
  })
})