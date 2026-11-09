/**
 * 1000 人演示族谱：十六世，人数先增后减。
 * 生产布局配置（详细视图间距、避让、正交边都开着）。
 * 验收：画布跨度不到 100 万像素，卡片不重叠，父子边贴在卡片外缘。
 */
import { describe, expect, it } from 'vitest'
import { LayoutEngine } from '@/utils/layout-engine'
import { buildSkewedClan } from '@/utils/__fixtures__/skewed-clan'
import type { LayoutConfig, NodePosition } from '@/types/layout'

const SPAN_LIMIT = 1_000_000

function overlaps(a: NodePosition, b: NodePosition): boolean {
  const eps = 0.5
  const ax1 = a.x - a.width / 2
  const ax2 = a.x + a.width / 2
  const ay1 = a.y - a.height / 2
  const ay2 = a.y + a.height / 2
  const bx1 = b.x - b.width / 2
  const bx2 = b.x + b.width / 2
  const by1 = b.y - b.height / 2
  const by2 = b.y + b.height / 2
  return ax1 < bx2 - eps && ax2 > bx1 + eps && ay1 < by2 - eps && ay2 > by1 + eps
}

describe('畸形族谱 1000 人', () => {
  it('十六世先增后减，每代都不只一人，总数 1000', () => {
    const { nodes, edges, stats } = buildSkewedClan(1000)
    expect(nodes).toHaveLength(1000)
    expect(edges).toHaveLength(999)
    expect(stats.deepGenerations).toBe(16)
    expect(stats.generationCounts).toEqual({
      0: 1,
      1: 3,
      2: 6,
      3: 12,
      4: 22,
      5: 38,
      6: 68,
      7: 92,
      8: 120,
      9: 122,
      10: 117,
      11: 109,
      12: 105,
      13: 88,
      14: 61,
      15: 36,
    })
    expect(stats.widestGeneration).toBe(9)
    expect(stats.widestCount).toBe(122)
    for (const [gen, count] of Object.entries(stats.generationCounts)) {
      if (Number(gen) > 0) expect(count).toBeGreaterThan(1)
    }
  })

  it('dagre 完整流水线：跨度 < 100 万像素，不重叠，边贴外缘', async () => {
    const { nodes, edges, stats } = buildSkewedClan(1000)
    const engine = new LayoutEngine({
      canvasSize: { width: 1600, height: 900 },
      config: {
        nodeWidth: 132,
        nodeHeight: 100,
        nodeSep: 28,
        rankSep: 70,
        layoutDirection: 'TB',
        spouseGap: 48,
        mainLineageCenter: true,
        spouseOptimization: true,
        generationAlign: true,
        resolveSubtreeOverlap: true,
        engine: 'dagre',
        engineThreshold: 1000,
      } satisfies Partial<LayoutConfig>,
    })

    const t0 = performance.now()
    const result = await engine.calculateLayout(nodes, edges)
    const elapsed = performance.now() - t0
    const spanW = result.bounds.maxX - result.bounds.minX
    const spanH = result.bounds.maxY - result.bounds.minY
    const pos = new Map(result.nodes.map((n) => [n.id, n]))

    const hits: string[] = []
    const list = result.nodes
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (overlaps(list[i], list[j])) {
          hits.push(`${list[i].id}×${list[j].id}`)
          if (hits.length >= 5) break
        }
      }
      if (hits.length >= 5) break
    }

    let offEdge = 0
    for (const edge of result.edges) {
      if (edge.kind !== 'parent-child' || !edge.path || edge.path.points.length < 2) continue
      const parent = pos.get(edge.source)
      const child = pos.get(edge.target)
      if (!parent || !child) {
        offEdge++
        continue
      }
      const start = edge.path.points[0]
      const end = edge.path.points[edge.path.points.length - 1]
      if (Math.abs(start.y - (parent.y + parent.height / 2)) > 1.5) offEdge++
      if (Math.abs(end.y - (child.y - child.height / 2)) > 1.5) offEdge++
    }

    let deepYOk = true
    let prevY = pos.get('root')!.y
    for (let gen = 1; gen <= 15; gen++) {
      const y = pos.get(`deep-${gen}`)!.y
      if (!(y > prevY)) deepYOk = false
      prevY = y
    }

    const summary = {
      elapsedMs: Math.round(elapsed),
      engine: result.meta?.engineUsed,
      spanW: Math.round(spanW),
      spanH: Math.round(spanH),
      widest: `${stats.widestGeneration}:${stats.widestCount}`,
      overlaps: hits,
      offEdge,
      deepYOk,
      phases: result.meta?.timings,
    }
    // eslint-disable-next-line no-console
    console.log(`[skew-1000] ${JSON.stringify(summary)}`)

    expect(result.totalNodes).toBe(1000)
    expect(result.meta?.engineUsed).toBe('dagre')
    expect(spanW).toBeLessThan(SPAN_LIMIT)
    expect(spanH).toBeLessThan(SPAN_LIMIT)
    expect(hits).toEqual([])
    expect(offEdge).toBe(0)
    expect(deepYOk).toBe(true)
    for (const node of result.nodes) {
      expect(Number.isFinite(node.x)).toBe(true)
      expect(Number.isFinite(node.y)).toBe(true)
    }
  }, 60000)
})
