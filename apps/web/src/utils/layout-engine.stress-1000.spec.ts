/**
 * 树谱 1000 节点压测：按页面实际传给 LayoutEngine 的配置跑完整流水线。
 *
 * 与 layout-engine.bench.spec.ts 的差别：
 * - 卡片尺寸走 cardSizeForDensity（简洁 / 详情）
 * - 间距走详细视图（nodeSep 28 / rankSep 70 / spouseGap 48）
 * - 主脉居中、配偶贴附、代际对齐、子树避让全部打开
 * - 父子正交边端点必须落在卡片外缘，卡片之间不重叠
 *
 * 预算与页面一致：单次布局 15s（LAYOUT_TIMEOUT_MS）。
 */
import { describe, it, expect } from 'vitest'
import { LayoutEngine } from '@/utils/layout-engine'
import { buildLargeTree } from '@/utils/__fixtures__/large-tree'
import { cardSizeForDensity, type CardDensity } from '@/utils/genealogy-card'
import { VIEW_MODE_SETTINGS } from '@/utils/view-mode-config'
import type { LayoutConfig, LayoutDirection, LayoutResult, NodePosition } from '@/types/layout'

const BUDGET_MS = 15000
const view = VIEW_MODE_SETTINGS.detailed

function boxesOverlap(a: NodePosition, b: NodePosition): boolean {
  const ax1 = a.x - a.width / 2
  const ax2 = a.x + a.width / 2
  const ay1 = a.y - a.height / 2
  const ay2 = a.y + a.height / 2
  const bx1 = b.x - b.width / 2
  const bx2 = b.x + b.width / 2
  const by1 = b.y - b.height / 2
  const by2 = b.y + b.height / 2
  const eps = 0.5
  const overlapX = ax1 < bx2 - eps && ax2 > bx1 + eps
  const overlapY = ay1 < by2 - eps && ay2 > by1 + eps
  return overlapX && overlapY
}

async function layoutThousand(
  direction: LayoutDirection,
  density: CardDensity,
): Promise<{ elapsed: number; result: LayoutResult; width: number; height: number }> {
  const card = cardSizeForDensity(view, direction, density)
  const built = buildLargeTree(1000)
  const nodes = built.nodes.map((n) => ({
    ...n,
    width: card.nodeWidth,
    height: card.nodeHeight,
  }))
  const engine = new LayoutEngine({
    canvasSize: { width: 1600, height: 900 },
    config: {
      nodeWidth: card.nodeWidth,
      nodeHeight: card.nodeHeight,
      nodeSep: view.nodeSep,
      rankSep: view.rankSep,
      layoutDirection: direction,
      spouseGap: 48,
      mainLineageCenter: true,
      spouseOptimization: true,
      generationAlign: true,
      resolveSubtreeOverlap: true,
      autoFit: {
        enabled: true,
        padding: 40,
        maxZoom: 2,
        minZoom: 0.25,
        preferDirection: direction,
      },
      performance: {
        maxNodesForFullLayout: 2000,
        viewportCulling: true,
        lodEnabled: true,
      },
      engine: 'auto',
      engineThreshold: 1000,
    } satisfies Partial<LayoutConfig>,
  })
  const t0 = performance.now()
  const result = await engine.calculateLayout(nodes, built.edges)
  return {
    elapsed: performance.now() - t0,
    result,
    width: card.nodeWidth,
    height: card.nodeHeight,
  }
}

describe('树谱 1000 节点压测（生产布局配置）', () => {
  const cases: Array<{ dir: LayoutDirection; density: CardDensity }> = [
    { dir: 'TB', density: 'simple' },
    { dir: 'TB', density: 'detailed' },
    { dir: 'LR', density: 'simple' },
    { dir: 'LR', density: 'detailed' },
  ]

  for (const c of cases) {
    it(`${c.dir} · ${c.density}：1000 节点完整流水线 < ${BUDGET_MS}ms，不重叠，边贴卡片外缘`, async () => {
      const { elapsed, result, width, height } = await layoutThousand(c.dir, c.density)
      const pos = new Map(result.nodes.map((n) => [n.id, n]))

      // eslint-disable-next-line no-console
      console.log(
        `[stress-1000] ${c.dir} ${c.density} ${width}x${height} ` +
          `nodes=${result.totalNodes} engine=${result.meta?.engineUsed ?? '?'} ` +
          `elapsed=${elapsed.toFixed(0)}ms phases=${result.meta?.totalMs?.toFixed(0) ?? '?'}ms ` +
          `bounds=${Math.round(result.bounds.maxX - result.bounds.minX)}x${Math.round(result.bounds.maxY - result.bounds.minY)}`,
      )
      if (result.meta?.timings) {
        const slow = Object.entries(result.meta.timings)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([k, v]) => `${k}=${v.toFixed(0)}`)
          .join(' ')
        // eslint-disable-next-line no-console
        console.log(`[stress-1000] phases ${slow}`)
      }

      expect(result.totalNodes).toBeGreaterThanOrEqual(1000)
      expect(result.meta?.engineUsed).toBe('dagre')
      expect(elapsed).toBeLessThan(BUDGET_MS)
      expect(result.meta?.errors ?? []).toEqual([])

      for (const node of result.nodes) {
        expect(Number.isFinite(node.x)).toBe(true)
        expect(Number.isFinite(node.y)).toBe(true)
        expect(node.width).toBe(width)
        expect(node.height).toBe(height)
      }

      const list = result.nodes
      const hits: string[] = []
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (boxesOverlap(list[i], list[j])) {
            hits.push(`${list[i].id}×${list[j].id}`)
            if (hits.length >= 5) break
          }
        }
        if (hits.length >= 5) break
      }
      expect(hits, `卡片重叠 ${hits.join(', ')}`).toEqual([])

      const pc = result.edges.filter(
        (e) => e.kind === 'parent-child' && e.path && e.path.points.length >= 2,
      )
      expect(pc.length).toBeGreaterThan(900)
      let offEdge = 0
      for (const edge of pc) {
        const parent = pos.get(edge.source)
        const child = pos.get(edge.target)
        const pts = edge.path!.points
        if (!parent || !child) {
          offEdge++
          continue
        }
        const start = pts[0]
        const end = pts[pts.length - 1]
        if (c.dir === 'TB') {
          if (Math.abs(start.y - (parent.y + parent.height / 2)) > 1.5) offEdge++
          if (Math.abs(end.y - (child.y - child.height / 2)) > 1.5) offEdge++
        } else {
          if (Math.abs(start.x - (parent.x + parent.width / 2)) > 1.5) offEdge++
          if (Math.abs(end.x - (child.x - child.width / 2)) > 1.5) offEdge++
        }
      }
      expect(offEdge, '父子边端点未贴在卡片外缘').toBe(0)
    }, 60000)
  }
})
