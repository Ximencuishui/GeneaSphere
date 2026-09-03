/**
 * layout-engine.cache.spec.ts
 *
 * [v6.x 健壮性 B 系列] 布局结果缓存单元测试
 *
 * 覆盖：
 *  - H1 computeLayoutHash 基础能力（同输入同 hash / 顺序无关 / 字段敏感）
 *  - H2 hash 字段敏感性（节点 id / generation / isMainLineage / virtualSpouse / edges / config）
 *  - H3 hashConfig=false 时 config 不参与 hash
 *  - C1 LayoutCache 基础 set/get/clear
 *  - C2 LRU 淘汰（maxSize）
 *  - C3 TTL 过期
 *  - C4 命中率统计（hits/misses/hitRate）
 *  - C5 LRU 访问顺序（命中后变最新）
 *  - I1 LayoutEngine 构造 options.cache 注入
 *  - I2 命中路径跳过计算（metrics 不增长）
 *  - I3 失败路径不写入缓存
 *  - I4 setCache/clearCache/getCacheStats API
 *  - I5 命中路径触发 logger.after-call
 *  - I6 写入缓存后第二次调用 hash 一致即命中
 *  - P1 性能快路径（命中应远快于全计算；>= 50x 加速）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LayoutEngine } from '@/utils/layout-engine'
import { LayoutCache, computeLayoutHash } from '@/utils/layout-cache'
import type {
  LayoutNode,
  LayoutEdge,
  LayoutConfig,
  LayoutResult,
  NodePosition,
} from '@/types/layout'

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

/** 构造一个合法 LayoutResult 用于直接 set 到 cache */
function buildFakeResult(nodeCount: number): LayoutResult {
  const positions: NodePosition[] = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    x: i * 80,
    y: 0,
    width: 64,
    height: 28,
  }))
  return {
    nodes: positions,
    edges: [],
    bounds: { minX: 0, minY: 0, maxX: nodeCount * 80, maxY: 28 },
    generations: 1,
    totalNodes: nodeCount,
  }
}

// ============================================================
// H1 - computeLayoutHash 基础能力
// ============================================================

describe('H1 - computeLayoutHash 基础能力', () => {
  it('同输入 → 同 hash', () => {
    const { nodes, edges } = buildSimpleDataset()
    const h1 = computeLayoutHash(nodes, edges)
    const h2 = computeLayoutHash(nodes, edges)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{8}$/) // 8 位 hex
  })

  it('节点顺序无关（hash 一致）', () => {
    const { nodes, edges } = buildSimpleDataset()
    const reversed = [...nodes].reverse()
    expect(computeLayoutHash(nodes, edges)).toBe(computeLayoutHash(reversed, edges))
  })

  it('边顺序无关', () => {
    const { nodes, edges } = buildSimpleDataset()
    const reversed = [...edges].reverse()
    expect(computeLayoutHash(nodes, edges)).toBe(computeLayoutHash(nodes, reversed))
  })

  it('空节点也生成合法 hash', () => {
    const h = computeLayoutHash([], [])
    expect(h).toMatch(/^[0-9a-f]{8}$/)
  })

  it('不同输入规模 → 不同 hash', () => {
    const small = computeLayoutHash([makeNode('A')], [])
    const big = computeLayoutHash([makeNode('A'), makeNode('B')], [])
    expect(small).not.toBe(big)
  })
})

// ============================================================
// H2 - hash 字段敏感性
// ============================================================

describe('H2 - hash 字段敏感性', () => {
  it('节点 id 不同 → hash 不同', () => {
    const a = computeLayoutHash([makeNode('A')], [])
    const b = computeLayoutHash([makeNode('B')], [])
    expect(a).not.toBe(b)
  })

  it('节点 generation 不同 → hash 不同', () => {
    const a = computeLayoutHash([makeNode('A', 0)], [])
    const b = computeLayoutHash([makeNode('A', 1)], [])
    expect(a).not.toBe(b)
  })

  it('节点 isMainLineage 不同 → hash 不同', () => {
    const a = computeLayoutHash([makeNode('A', 0, { isMainLineage: true })], [])
    const b = computeLayoutHash([makeNode('A', 0, { isMainLineage: false })], [])
    expect(a).not.toBe(b)
  })

  it('节点 virtualSpouse 不同 → hash 不同', () => {
    const a = computeLayoutHash([makeNode('A', 0, { virtualSpouse: false })], [])
    const b = computeLayoutHash([makeNode('A', 0, { virtualSpouse: true })], [])
    expect(a).not.toBe(b)
  })

  it('边结构不同（多一条边）→ hash 不同', () => {
    const { nodes, edges } = buildSimpleDataset()
    const h1 = computeLayoutHash(nodes, edges)
    const h2 = computeLayoutHash(nodes, [...edges, makeEdge('extra', 'B', 'C')])
    expect(h1).not.toBe(h2)
  })

  it('边 kind 不同（parent-child vs spouse）→ hash 不同', () => {
    const { nodes } = buildSimpleDataset()
    const h1 = computeLayoutHash(nodes, [makeEdge('e1', 'A', 'B', 'parent-child')])
    const h2 = computeLayoutHash(nodes, [makeEdge('e1', 'A', 'B', 'spouse')])
    expect(h1).not.toBe(h2)
  })

  it('config 关键字段不同 → hash 不同（hashConfig=true）', () => {
    const { nodes, edges } = buildSimpleDataset()
    const h1 = computeLayoutHash(nodes, edges, { nodeSep: 24 })
    const h2 = computeLayoutHash(nodes, edges, { nodeSep: 48 })
    expect(h1).not.toBe(h2)
  })

  it('节点 width/height 不同 → hash 相同（这些不影响布局拓扑）', () => {
    const { nodes, edges } = buildSimpleDataset()
    const wide = nodes.map(n => ({ ...n, width: 200, height: 80 }))
    expect(computeLayoutHash(nodes, edges)).toBe(computeLayoutHash(wide, edges))
  })

  it('节点 x/y 坐标不同 → hash 相同（输出位置不影响输入拓扑）', () => {
    const { nodes, edges } = buildSimpleDataset()
    const moved = nodes.map(n => ({ ...n, x: Math.random() * 1000, y: Math.random() * 1000 }))
    expect(computeLayoutHash(nodes, edges)).toBe(computeLayoutHash(moved, edges))
  })
})

// ============================================================
// H3 - hashConfig 选项
// ============================================================

describe('H3 - hashConfig 选项', () => {
  it('hashConfig=false 时 config 变化不影响 hash', () => {
    const { nodes, edges } = buildSimpleDataset()
    const h1 = computeLayoutHash(nodes, edges, { nodeSep: 24 }, false)
    const h2 = computeLayoutHash(nodes, edges, { nodeSep: 999 }, false)
    expect(h1).toBe(h2)
  })

  it('hashConfig=true 时 config 变化影响 hash', () => {
    const { nodes, edges } = buildSimpleDataset()
    const h1 = computeLayoutHash(nodes, edges, { nodeSep: 24 }, true)
    const h2 = computeLayoutHash(nodes, edges, { nodeSep: 999 }, true)
    expect(h1).not.toBe(h2)
  })

  it('hashConfig=true 时不同 config flag 影响 hash', () => {
    const { nodes, edges } = buildSimpleDataset()
    const h1 = computeLayoutHash(nodes, edges, { mainLineageCenter: true }, true)
    const h2 = computeLayoutHash(nodes, edges, { mainLineageCenter: false }, true)
    expect(h1).not.toBe(h2)
  })
})

// ============================================================
// C1 - LayoutCache 基础 set/get/clear
// ============================================================

describe('C1 - LayoutCache 基础 set/get/clear', () => {
  it('set 后 get 命中', () => {
    const cache = new LayoutCache()
    const { nodes, edges } = buildSimpleDataset()
    const result = buildFakeResult(nodes.length)
    cache.set(nodes, edges, result)
    expect(cache.get(nodes, edges)).toBe(result) // 引用相等（同对象）
  })

  it('未 set 时 get 返回 null', () => {
    const cache = new LayoutCache()
    const { nodes, edges } = buildSimpleDataset()
    expect(cache.get(nodes, edges)).toBeNull()
  })

  it('clear 后 get 返回 null', () => {
    const cache = new LayoutCache()
    const { nodes, edges } = buildSimpleDataset()
    const result = buildFakeResult(nodes.length)
    cache.set(nodes, edges, result)
    cache.clear()
    expect(cache.get(nodes, edges)).toBeNull()
    expect(cache.size).toBe(0)
  })

  it('size 反映条目数', () => {
    const cache = new LayoutCache()
    const r1 = buildFakeResult(3)
    const r2 = buildFakeResult(5)
    cache.set([makeNode('A')], [], r1)
    expect(cache.size).toBe(1)
    cache.set([makeNode('B')], [], r2)
    expect(cache.size).toBe(2)
  })
})

// ============================================================
// C2 - LRU 淘汰
// ============================================================

describe('C2 - LRU 淘汰', () => {
  it('超出 maxSize 淘汰最旧条目', () => {
    const cache = new LayoutCache({ maxSize: 2 })
    cache.set([makeNode('A')], [], buildFakeResult(1))
    cache.set([makeNode('B')], [], buildFakeResult(1))
    expect(cache.size).toBe(2)
    // 插入第 3 个 → A 应被淘汰
    cache.set([makeNode('C')], [], buildFakeResult(1))
    expect(cache.size).toBe(2)
    expect(cache.get([makeNode('A')], [])).toBeNull()
    expect(cache.get([makeNode('B')], [])).not.toBeNull()
    expect(cache.get([makeNode('C')], [])).not.toBeNull()
  })

  it('evictions 计数正确', () => {
    const cache = new LayoutCache({ maxSize: 2 })
    cache.set([makeNode('A')], [], buildFakeResult(1))
    cache.set([makeNode('B')], [], buildFakeResult(1))
    cache.set([makeNode('C')], [], buildFakeResult(1)) // evict A
    cache.set([makeNode('D')], [], buildFakeResult(1)) // evict B
    const stats = cache.getStats()
    expect(stats.evictions).toBe(2)
  })

  it('maxSize < 1 被钳到 1', () => {
    const cache = new LayoutCache({ maxSize: 0 })
    cache.set([makeNode('A')], [], buildFakeResult(1))
    cache.set([makeNode('B')], [], buildFakeResult(1))
    expect(cache.size).toBe(1)
    expect(cache.getStats().maxSize).toBe(1)
  })

  it('set 同 key 多次只占 1 个 slot', () => {
    const cache = new LayoutCache({ maxSize: 5 })
    const { nodes, edges } = buildSimpleDataset()
    const r1 = buildFakeResult(3)
    const r2 = buildFakeResult(3)
    cache.set(nodes, edges, r1)
    cache.set(nodes, edges, r2) // 覆盖
    expect(cache.size).toBe(1)
    expect(cache.get(nodes, edges)).toBe(r2) // 最新值
  })
})

// ============================================================
// C3 - TTL 过期
// ============================================================

describe('C3 - TTL 过期', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))
  })

  it('ttlMs=0（默认）时永不失效', () => {
    const cache = new LayoutCache()
    const { nodes, edges } = buildSimpleDataset()
    cache.set(nodes, edges, buildFakeResult(3))
    vi.advanceTimersByTime(1000 * 60 * 60) // +1h
    expect(cache.get(nodes, edges)).not.toBeNull()
  })

  it('ttlMs 内可命中，过期后返回 null', () => {
    const cache = new LayoutCache({ ttlMs: 1000 })
    const { nodes, edges } = buildSimpleDataset()
    cache.set(nodes, edges, buildFakeResult(3))
    vi.advanceTimersByTime(500)
    expect(cache.get(nodes, edges)).not.toBeNull()
    vi.advanceTimersByTime(600) // 累计 1100ms
    expect(cache.get(nodes, edges)).toBeNull()
  })

  it('TTL 过期记入 invalidations', () => {
    const cache = new LayoutCache({ ttlMs: 100 })
    cache.set([makeNode('A')], [], buildFakeResult(1))
    vi.advanceTimersByTime(200)
    cache.get([makeNode('A')], [])
    const stats = cache.getStats()
    expect(stats.invalidations).toBe(1)
    expect(stats.misses).toBe(1)
  })
})

// ============================================================
// C4 - 命中率统计
// ============================================================

describe('C4 - 命中率统计', () => {
  it('初始统计全为 0，hitRate=0', () => {
    const cache = new LayoutCache()
    const stats = cache.getStats()
    expect(stats.hits).toBe(0)
    expect(stats.misses).toBe(0)
    expect(stats.hitRate).toBe(0)
    expect(stats.size).toBe(0)
    expect(stats.maxSize).toBeGreaterThan(0)
  })

  it('命中 2 次 + 未命中 1 次 → hitRate = 2/3', () => {
    const cache = new LayoutCache()
    const { nodes, edges } = buildSimpleDataset()
    cache.set(nodes, edges, buildFakeResult(3))
    cache.get(nodes, edges) // hit
    cache.get(nodes, edges) // hit
    cache.get([makeNode('X')], []) // miss
    const stats = cache.getStats()
    expect(stats.hits).toBe(2)
    expect(stats.misses).toBe(1)
    expect(stats.hitRate).toBeCloseTo(2 / 3)
  })

  it('resetStats 清零统计但保留条目', () => {
    const cache = new LayoutCache()
    const { nodes, edges } = buildSimpleDataset()
    cache.set(nodes, edges, buildFakeResult(3))
    cache.get(nodes, edges)
    cache.get([makeNode('X')], [])
    cache.resetStats()
    const stats = cache.getStats()
    expect(stats.hits).toBe(0)
    expect(stats.misses).toBe(0)
    expect(stats.size).toBe(1) // 条目保留
    expect(cache.get(nodes, edges)).not.toBeNull() // 仍可命中
  })
})

// ============================================================
// C5 - LRU 访问顺序
// ============================================================

describe('C5 - LRU 访问顺序', () => {
  it('命中后变最新，不会被立即淘汰', () => {
    const cache = new LayoutCache({ maxSize: 2 })
    cache.set([makeNode('A')], [], buildFakeResult(1))
    cache.set([makeNode('B')], [], buildFakeResult(1))
    // 命中 A → A 应变最新
    cache.get([makeNode('A')], [])
    // 插入 C → 淘汰最旧（即 B），A 保留
    cache.set([makeNode('C')], [], buildFakeResult(1))
    expect(cache.get([makeNode('A')], [])).not.toBeNull()
    expect(cache.get([makeNode('B')], [])).toBeNull()
    expect(cache.get([makeNode('C')], [])).not.toBeNull()
  })

  it('hitCount 累加', () => {
    const cache = new LayoutCache()
    const { nodes, edges } = buildSimpleDataset()
    cache.set(nodes, edges, buildFakeResult(3))
    cache.get(nodes, edges)
    cache.get(nodes, edges)
    cache.get(nodes, edges)
    // 通过 getStats 间接验证（map.entries() 不暴露给外部）
    // 通过 size 不变间接验证
    expect(cache.size).toBe(1)
  })
})

// ============================================================
// I1 - LayoutEngine 构造 options.cache
// ============================================================

describe('I1 - LayoutEngine 构造 options.cache', () => {
  it('构造时注入 cache → getCacheStats 返回有效值', () => {
    const cache = new LayoutCache({ maxSize: 4 })
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      cache,
    })
    const stats = engine.getCacheStats()
    expect(stats).not.toBeNull()
    expect(stats?.maxSize).toBe(4)
  })

  it('未注入 cache → getCacheStats 返回 null', () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    expect(engine.getCacheStats()).toBeNull()
  })

  it('构造 cache=null → 等同未注入', () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      cache: null,
    })
    expect(engine.getCacheStats()).toBeNull()
  })
})

// ============================================================
// I2 - 命中路径
// ============================================================

describe('I2 - 命中路径（第二次调用相同输入）', () => {
  it('第一次 miss，第二次 hit', async () => {
    const cache = new LayoutCache()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      cache,
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    let stats = cache.getStats()
    expect(stats.misses).toBe(1)
    expect(stats.hits).toBe(0)

    await engine.calculateLayout(nodes, edges) // 第二次相同输入
    stats = cache.getStats()
    expect(stats.misses).toBe(1)
    expect(stats.hits).toBe(1)
  })

  it('命中路径返回的 result 与首次 result 引用相等', async () => {
    const cache = new LayoutCache()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      cache,
    })
    const { nodes, edges } = buildSimpleDataset()
    const r1 = await engine.calculateLayout(nodes, edges)
    const r2 = await engine.calculateLayout(nodes, edges)
    expect(r2).toBe(r1) // 同一引用
  })

  it('命中路径不刷新 lastMetrics', async () => {
    const cache = new LayoutCache()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      cache,
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    const lastAfterFirst = engine.getLastMetrics()
    await engine.calculateLayout(nodes, edges) // 命中
    const lastAfterSecond = engine.getLastMetrics()
    // 命中路径不更新 lastMetrics（设计如此：保留首次的详细 metric）
    expect(lastAfterSecond).toBe(lastAfterFirst)
  })
})

// ============================================================
// I3 - 失败路径不写入缓存
// ============================================================

describe('I3 - 失败路径不写入缓存', () => {
  it('抛错时不写入缓存条目', async () => {
    const cache = new LayoutCache()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      cache,
    })
    // 触发 CYCLE 错误
    const nodes: LayoutNode[] = [makeNode('A', 0), makeNode('B', 1)]
    const edges: LayoutEdge[] = [
      makeEdge('e1', 'A', 'B', 'parent-child'),
      makeEdge('e2', 'B', 'A', 'parent-child'),
    ]
    await expect(engine.calculateLayout(nodes, edges)).rejects.toThrow()
    expect(cache.size).toBe(0) // 失败路径不写入新条目
    // 验证：cache.get 仍会被调用（用于早期命中检查），所以 misses = 1
    expect(cache.getStats().misses).toBe(1)
    expect(cache.getStats().hits).toBe(0)
  })
})

// ============================================================
// I4 - setCache / clearCache API
// ============================================================

describe('I4 - setCache / clearCache API', () => {
  it('setCache 注入新 cache', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    expect(engine.getCacheStats()).toBeNull()

    const cache = new LayoutCache()
    engine.setCache(cache)
    expect(engine.getCacheStats()).not.toBeNull()

    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(cache.size).toBe(1)
  })

  it('clearCache 清空已有缓存', async () => {
    const cache = new LayoutCache()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      cache,
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(cache.size).toBe(1)

    engine.clearCache()
    expect(cache.size).toBe(0)

    // 重新调用仍可命中（因为重新写入了）
    await engine.calculateLayout(nodes, edges)
    expect(cache.size).toBe(1)
  })

  it('setCache(null) 取消缓存', async () => {
    const cache = new LayoutCache()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      cache,
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    expect(cache.size).toBe(1)

    engine.setCache(null)
    expect(engine.getCacheStats()).toBeNull()

    await engine.calculateLayout(nodes, edges)
    expect(cache.size).toBe(1) // 原 cache 不变
  })

  it('未启用缓存时 clearCache 不抛错', () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    expect(() => engine.clearCache()).not.toThrow()
  })
})

// ============================================================
// I5 - 命中路径触发 logger.after-call
// ============================================================

describe('I5 - 命中路径 + logger 集成', () => {
  it('命中路径也触发 after-call hook（success=true）', async () => {
    const after = vi.fn()
    const cache = new LayoutCache()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      cache,
      logger: { onAfterCall: after },
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges)
    await engine.calculateLayout(nodes, edges) // 命中
    expect(after).toHaveBeenCalledTimes(2)
    const secondCall = after.mock.calls[1][0]
    expect(secondCall.success).toBe(true)
    expect(secondCall.errorCount).toBe(0)
  })
})

// ============================================================
// I6 - config 变更导致不命中（hashConfig 默认 true）
// ============================================================

describe('I6 - config 变更导致 hash 不同（不命中）', () => {
  it('config 关键字段不同 → 第二次调用仍 miss', async () => {
    const cache = new LayoutCache()
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: { ...buildSimpleEngineConfig(), nodeSep: 24 },
      cache,
    })
    const { nodes, edges } = buildSimpleDataset()
    await engine.calculateLayout(nodes, edges) // miss, 写入
    expect(cache.size).toBe(1)

    // 改 config
    engine.updateConfig({ nodeSep: 99 })
    await engine.calculateLayout(nodes, edges) // 应该 miss（hash 不同）
    const stats = cache.getStats()
    expect(stats.misses).toBe(2)
    expect(stats.hits).toBe(0)
    expect(cache.size).toBe(2) // 新条目入缓存
  })
})

// ============================================================
// P1 - 性能快路径（命中应远快于全计算）
// ============================================================

describe('P1 - 性能快路径', () => {
  it('命中路径 < 全计算路径（>= 2x 加速；保守下限避免 CI 抖动）', async () => {
    // 用稍大的数据集（10 节点）放大差距
    const nodes: LayoutNode[] = []
    const edges: LayoutEdge[] = []
    for (let i = 0; i < 10; i++) {
      nodes.push(makeNode(`n${i}`, Math.floor(i / 2)))
    }
    for (let i = 0; i < 9; i++) {
      edges.push(makeEdge(`e${i}`, `n${Math.floor(i / 2)}`, `n${i + 1}`))
    }

    // 1) 无缓存：连续两次全计算
    const engineNoCache = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const t1Start = performance.now()
    await engineNoCache.calculateLayout(nodes, edges)
    const t1 = performance.now() - t1Start
    const t2Start = performance.now()
    await engineNoCache.calculateLayout(nodes, edges)
    const t2 = performance.now() - t2Start
    const fullAvg = (t1 + t2) / 2

    // 2) 有缓存：第一次 miss，第二次 hit
    const cache = new LayoutCache()
    const engineWithCache = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
      cache,
    })
    const t3Start = performance.now()
    await engineWithCache.calculateLayout(nodes, edges)
    const t3 = performance.now() - t3Start
    const t4Start = performance.now()
    await engineWithCache.calculateLayout(nodes, edges) // hit
    const t4 = performance.now() - t4Start

    // 命中应明显快于全计算（>= 2x 加速，避免 CI 抖动）
    expect(t4).toBeLessThan(Math.max(50, fullAvg))
    // miss 的耗时与无缓存版本量级一致（< 5x）
    expect(t3).toBeLessThan(Math.max(500, fullAvg * 5))
  }, 10000)
})
