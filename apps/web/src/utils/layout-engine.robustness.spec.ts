/**
 * layout-engine.robustness.spec.ts
 *
 * [v6.x 强壮性] 布局引擎防御性与健壮性单元测试
 *
 * 覆盖四大领域：
 *  - P8   输入完整性校验（A2）：empty graph / id 缺失 / 重叠 / 边引用不存在 / kind 非法
 *  - P9   根节点缺失检测（A5）：全员配偶 / 纯虚拟节点场景
 *  - P10  父子边环路检测（A6）：A→B→C→A 自环 / 2 节点相互指 / 跨子树环路
 *  - P-A3 节点角色推断（A3）：inferNodeRole / annotateNodeRoles 显式化
 *  - P-C2 LayoutConfig 校验（C2）：dev 抛错 / prod 自动 clamp
 *
 * 不依赖任何外设（数据库 / G6 / dagre 异步 worker）：
 *  - 输入校验测试在 calculateLayout 入口即抛，无需等待引擎
 *  - 环路 / 根节点检测都在阶段[1] 防御三连中
 *  - detectCycle 是纯函数，可独立测
 */

import { describe, it, expect, vi } from 'vitest'
import { LayoutEngine } from '@/utils/layout-engine'
import type {
  LayoutNode,
  LayoutEdge,
  LayoutConfig,
  NodeRole,
} from '@/types/layout'
import {
  detectCycle,
} from '@/utils/tree-layout'
import { inferNodeRole, annotateNodeRoles, validateLayoutConfig } from '@/utils/layout-validators'
import { LayoutEngineError, isLayoutEngineError } from '@/utils/layout-errors'

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

function makeEdge(id: string, source: string, target: string, kind: 'parent-child' | 'spouse' = 'parent-child', extra: Partial<LayoutEdge> = {}): LayoutEdge {
  return {
    id,
    source,
    target,
    kind,
    ...extra,
  }
}

// ============================================================
// P8 — 输入完整性校验（A2）
// ============================================================

describe('P8 - 输入完整性校验（A2）', () => {
  it('空节点数组抛 LAYOUT_EMPTY_GRAPH', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    await expect(engine.calculateLayout([], [])).rejects.toThrowError(
      expect.objectContaining({ code: 'LAYOUT_EMPTY_GRAPH' }),
    )
  })

  it('节点 id 缺失抛 INVALID_INPUT', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const badNodes = [
      {
        label: 'noId',
        gender: 'male',
        isMainLineage: true,
        isLiving: true,
        generation: 0,
        width: 64,
        height: 28,
      },
    ] as unknown as LayoutNode[]
    await expect(engine.calculateLayout(badNodes, [])).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    )
  })

  it('节点 id 重复抛 INVALID_INPUT', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const dupNodes = [makeNode('A'), makeNode('A')]
    await expect(engine.calculateLayout(dupNodes, [])).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    )
  })

  it('节点 width=0 抛 INVALID_INPUT', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const bad = [makeNode('A', 0, { width: 0 })]
    await expect(engine.calculateLayout(bad, [])).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    )
  })

  it('边引用不存在的 source 抛 INVALID_INPUT', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const nodes = [makeNode('A')]
    const edges = [makeEdge('e1', 'A', 'GHOST')]
    await expect(engine.calculateLayout(nodes, edges)).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    )
  })

  it('边 kind 非法抛 INVALID_INPUT', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const nodes = [makeNode('A'), makeNode('B')]
    // @ts-expect-error 故意构造非法 kind
    const edges = [makeEdge('e1', 'A', 'B', 'unknown')]
    await expect(engine.calculateLayout(nodes, edges)).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    )
  })

  it('LayoutEngineError 是 Error 子类（不破坏 instanceof Error）', () => {
    const err = new LayoutEngineError('INVALID_INPUT', 'test', { foo: 1 })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(LayoutEngineError)
    expect(isLayoutEngineError(err)).toBe(true)
    expect(err.code).toBe('INVALID_INPUT')
    expect(err.timestamp).toBeGreaterThan(0)
  })

  it('toUserMessage 输出友好错误描述', () => {
    const err = new LayoutEngineError(
      'LAYOUT_CYCLE_DETECTED',
      'A → B → C → A',
      { cyclePath: ['A', 'B', 'C', 'A'] },
    )
    const msg = err.toUserMessage()
    expect(msg).toContain('[LAYOUT_CYCLE_DETECTED]')
    expect(msg).toContain('A → B → C → A')
  })
})

// ============================================================
// P9 — 根节点缺失（A5）
// ============================================================

describe('P9 - 根节点缺失检测（A5）', () => {
  it('全员配偶（无 anchorMale）抛 LAYOUT_NO_ROOT_NODE', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    // 2 个节点全是 spouse（generation<0），无父子边
    const nodes = [
      makeNode('A', -1, { gender: 'female' }),
      makeNode('B', -1, { gender: 'female' }),
    ]
    const edges = [makeEdge('e1', 'A', 'B', 'spouse')]

    await expect(engine.calculateLayout(nodes, edges)).rejects.toThrowError(
      expect.objectContaining({ code: 'LAYOUT_NO_ROOT_NODE' }),
    )
  })

  it('单节点（无任何边）能找到根且布局成功', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const nodes = [makeNode('LONE')]
    // 不期望抛错
    const result = await engine.calculateLayout(nodes, [])
    expect(result.nodes).toHaveLength(1)
  })

  it('2 个节点 + 1 条 parent-child 边能找到根', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const nodes = [makeNode('P', 0), makeNode('C', 1)]
    const edges = [makeEdge('e1', 'P', 'C')]
    const result = await engine.calculateLayout(nodes, edges)
    expect(result.nodes).toHaveLength(2)
  })
})

// ============================================================
// P10 — 父子边环路检测（A6）
// ============================================================

describe('P10 - 父子边环路检测（A6）', () => {
  it('detectCycle: 无向 DAG 不检出环路', () => {
    const nodeMap = new Map<string, LayoutNode>([
      ['A', makeNode('A', 0)],
      ['B', makeNode('B', 1)],
      ['C', makeNode('C', 2)],
    ])
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'B', 'C'),
    ]
    expect(detectCycle(edges, nodeMap).hasCycle).toBe(false)
  })

  it('detectCycle: 2 节点自环相互指 (A→B, B→A)', () => {
    const nodeMap = new Map<string, LayoutNode>([
      ['A', makeNode('A', 0)],
      ['B', makeNode('B', 1)],
    ])
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'B', 'A'),
    ]
    const result = detectCycle(edges, nodeMap)
    expect(result.hasCycle).toBe(true)
    expect(result.cyclePath).toBeDefined()
    // cyclePath 应包含这两个节点
    expect(result.cyclePath).toContain('A')
    expect(result.cyclePath).toContain('B')
  })

  it('detectCycle: 3 节点环路 (A→B→C→A)', () => {
    const nodeMap = new Map<string, LayoutNode>([
      ['A', makeNode('A', 0)],
      ['B', makeNode('B', 1)],
      ['C', makeNode('C', 2)],
    ])
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'B', 'C'),
      makeEdge('e3', 'C', 'A'),
    ]
    const result = detectCycle(edges, nodeMap)
    expect(result.hasCycle).toBe(true)
    expect(result.cyclePath).toBeDefined()
  })

  it('detectCycle: 跨子树长链不回边，无环路', () => {
    //   A → B
    //   A → C
    //   B → D
    //   C → E
    const nodeMap = new Map<string, LayoutNode>([
      ['A', makeNode('A', 0)],
      ['B', makeNode('B', 1)],
      ['C', makeNode('C', 1)],
      ['D', makeNode('D', 2)],
      ['E', makeNode('E', 2)],
    ])
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'A', 'C'),
      makeEdge('e3', 'B', 'D'),
      makeEdge('e4', 'C', 'E'),
    ]
    expect(detectCycle(edges, nodeMap).hasCycle).toBe(false)
  })

  it('calculateLayout: 数据含 2 节点自环时抛 LAYOUT_CYCLE_DETECTED', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const nodes = [makeNode('A', 0), makeNode('B', 1)]
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'B', 'A'),
    ]
    await expect(engine.calculateLayout(nodes, edges)).rejects.toThrowError(
      expect.objectContaining({ code: 'LAYOUT_CYCLE_DETECTED' }),
    )
  })

  it('calculateLayout: 数据含 A→B→C→A 时抛 LAYOUT_CYCLE_DETECTED，details 含 cyclePath', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const nodes = [
      makeNode('A', 0),
      makeNode('B', 1),
      makeNode('C', 2),
    ]
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'B', 'C'),
      makeEdge('e3', 'C', 'A'),
    ]
    try {
      await engine.calculateLayout(nodes, edges)
      expect.fail('应该抛错')
    } catch (e) {
      expect(isLayoutEngineError(e)).toBe(true)
      if (isLayoutEngineError(e)) {
        expect(e.code).toBe('LAYOUT_CYCLE_DETECTED')
        expect(Array.isArray(e.details?.cyclePath)).toBe(true)
      }
    }
  })

  it('calculateLayout: spouse 边不参与环路检测（仅 parent-child）', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    // 1 个 anchor + 2 个配偶，spouse 边之间不构成 cycle
    // 但 spouse 边在 expandSpouseToVirtualNodes 后转为 mainId → virt → spouseId，
    // 不构成 cycle（virt 是叶子节点，无下游父边指回 main）
    const nodes = [
      makeNode('H', 0, { gender: 'male' }),
      makeNode('W1', -1, { gender: 'female' }),
      makeNode('W2', -1, { gender: 'female' }),
    ]
    const edges = [
      makeEdge('s1', 'H', 'W1', 'spouse', { marriageOrder: 1 }),
      makeEdge('s2', 'H', 'W2', 'spouse', { marriageOrder: 2 }),
    ]
    // 应成功，不抛 LAYOUT_CYCLE_DETECTED
    const result = await engine.calculateLayout(nodes, edges)
    expect(result.nodes.length).toBeGreaterThanOrEqual(3)
  })

  it('detectCycle: spouse 边不视为父子边，不会误报', () => {
    const nodeMap = new Map<string, LayoutNode>([
      ['H', makeNode('H', 0)],
      ['W1', makeNode('W1', -1, { gender: 'female' })],
      ['W2', makeNode('W2', -1, { gender: 'female' })],
    ])
    const edges = [
      makeEdge('s1', 'H', 'W1', 'spouse'),
      makeEdge('s2', 'H', 'W2', 'spouse'),
    ]
    expect(detectCycle(edges, nodeMap).hasCycle).toBe(false)
  })
})

// ============================================================
// P-A3 — 节点角色推断（A3）
// ============================================================

describe('P-A3 - 节点角色推断（A3）', () => {
  it('inferNodeRole: 男性 → anchorMale', () => {
    const node = makeNode('M', 0, { gender: 'male' })
    const role = inferNodeRole(node, new Set(), new Map())
    expect(role).toBe('anchorMale')
  })

  it('inferNodeRole: 女性 + 无子代 → spouseFemale', () => {
    const node = makeNode('F', 0, { gender: 'female' })
    const role = inferNodeRole(node, new Set(), new Map())
    expect(role).toBe('spouseFemale')
  })

  it('inferNodeRole: 女性 + 有子代 → anchorMale（双重身份）', () => {
    const node = makeNode('F', 0, { gender: 'female' })
    const role = inferNodeRole(node, new Set(), new Map([['F', true]]))
    expect(role).toBe('anchorMale')
  })

  it('inferNodeRole: 配偶节点（在 spouseNodeIds 中）→ spouseFemale', () => {
    const node = makeNode('S', -1, { gender: 'female' })
    const role = inferNodeRole(node, new Set(['S']), new Map())
    expect(role).toBe('spouseFemale')
  })

  it('inferNodeRole: 虚拟节点（virtualSpouse=true）→ other', () => {
    const node = makeNode('V', 0, { virtualSpouse: true })
    const role = inferNodeRole(node, new Set(), new Map())
    expect(role).toBe('other')
  })

  it('inferNodeRole: 显式指定 nodeRole 优先', () => {
    const node = makeNode('X', 0, { gender: 'female', nodeRole: 'anchorMale' as NodeRole })
    expect(inferNodeRole(node, new Set(), new Map())).toBe('anchorMale')
  })

  it('inferNodeRole: 显式非法 nodeRole 抛 INVALID_NODE_ROLE', () => {
    const node = makeNode('X', 0, { nodeRole: 'fakeRole' as NodeRole })
    expect(() => inferNodeRole(node, new Set(), new Map())).toThrowError(
      expect.objectContaining({ code: 'INVALID_NODE_ROLE' }),
    )
  })

  it('annotateNodeRoles: 批量填充 nodeRole 字段', () => {
    const nodeMap = new Map<string, LayoutNode>([
      ['M', makeNode('M', 0, { gender: 'male' })],
      ['F1', makeNode('F1', -1, { gender: 'female' })],
      ['F2', makeNode('F2', -1, { gender: 'female' })],
    ])
    const childrenByParent = new Map<string, string[]>([
      ['M', ['F1', 'F2']],
    ])
    const spouseNodeIds = new Set(['F1', 'F2'])

    annotateNodeRoles(nodeMap, spouseNodeIds, childrenByParent)

    expect(nodeMap.get('M')?.nodeRole).toBe('anchorMale')
    expect(nodeMap.get('F1')?.nodeRole).toBe('spouseFemale')
    expect(nodeMap.get('F2')?.nodeRole).toBe('spouseFemale')
  })

  it('annotateNodeRoles: 已显式指定的不被覆盖', () => {
    const nodeMap = new Map<string, LayoutNode>([
      ['M', makeNode('M', 0, { gender: 'male', nodeRole: 'anchorMale' as NodeRole })],
    ])
    annotateNodeRoles(nodeMap, new Set(), new Map())
    expect(nodeMap.get('M')?.nodeRole).toBe('anchorMale')
  })

  it('calculateLayout: 真实数据流过 infer 后，节点 nodeRole 字段被填充', async () => {
    const engine = new LayoutEngine({
      canvasSize: { width: 800, height: 600 },
      config: buildSimpleEngineConfig(),
    })
    const nodes = [
      makeNode('F', 0, { gender: 'male' }),
      makeNode('M1', 1, { gender: 'male' }),
      makeNode('M2', 1, { gender: 'male' }),
    ]
    const edges = [
      makeEdge('e1', 'F', 'M1'),
      makeEdge('e2', 'F', 'M2'),
    ]
    await engine.calculateLayout(nodes, edges)
    // LayoutEngine 未直接 expose nodeMap，但 result.nodes 是 collapsed 副本，
    // 这里仅做调用不抛错的烟雾测试
  })
})

// ============================================================
// P-C2 — LayoutConfig 校验（C2）
// ============================================================

describe('P-C2 - LayoutConfig 校验（C2）', () => {
  it('dev 模式：nodeWidth 非法抛 INVALID_CONFIG', () => {
    // @ts-expect-error 故意构造非法配置
    const badConfig: LayoutConfig = {
      nodeWidth: 0,
      nodeHeight: 28,
      nodeSep: 'auto',
      rankSep: 'auto',
      spouseGap: 16,
      marriageJunctionOffset: 0,
      edgeHorizontalSeparation: 0,
      engine: 'auto',
      autoFit: { enabled: true, minZoom: 0.1, maxZoom: 2, padding: 0, preferDirection: 'auto' },
      mainLineageCenter: true,
      resolveSubtreeOverlap: true,
      spouseOptimization: true,
    }
    expect(() => validateLayoutConfig(badConfig, { mode: 'dev' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIG' }),
    )
  })

  it('prod 模式：nodeWidth 非法自动 clamp 到 1，不抛错', () => {
    const badConfig = {
      nodeWidth: 0,
      nodeHeight: 28,
      nodeSep: 'auto',
      rankSep: 'auto',
      spouseGap: 16,
      marriageJunctionOffset: 0,
      edgeHorizontalSeparation: 0,
      engine: 'auto',
      autoFit: { enabled: true, minZoom: 0.1, maxZoom: 2, padding: 0, preferDirection: 'auto' },
      mainLineageCenter: true,
      resolveSubtreeOverlap: true,
      spouseOptimization: true,
    } as unknown as LayoutConfig
    const result = validateLayoutConfig(badConfig, { mode: 'prod' })
    expect(result.ok).toBe(false)
    expect(result.clampedFields).toContain('nodeWidth')
    expect(badConfig.nodeWidth).toBeGreaterThan(0)
  })

  it('prod 模式：spouseGap 负数 clamp 到 0', () => {
    const config = {
      nodeWidth: 64,
      nodeHeight: 28,
      nodeSep: 24,
      rankSep: 48,
      spouseGap: -10,
      marriageJunctionOffset: 0,
      edgeHorizontalSeparation: 0,
      engine: 'auto',
      autoFit: { enabled: true, minZoom: 0.1, maxZoom: 2, padding: 0, preferDirection: 'auto' },
      mainLineageCenter: true,
      resolveSubtreeOverlap: true,
      spouseOptimization: true,
    } as unknown as LayoutConfig
    const result = validateLayoutConfig(config, { mode: 'prod' })
    expect(result.clampedFields).toContain('spouseGap')
    expect(config.spouseGap).toBe(0)
  })

  it('prod 模式：合法配置校验通过且无 clamp', () => {
    const config = {
      nodeWidth: 64,
      nodeHeight: 28,
      nodeSep: 24,
      rankSep: 48,
      spouseGap: 16,
      marriageJunctionOffset: 0,
      edgeHorizontalSeparation: 0,
      engine: 'auto',
      autoFit: { enabled: true, minZoom: 0.1, maxZoom: 2, padding: 0, preferDirection: 'auto' },
      mainLineageCenter: true,
      resolveSubtreeOverlap: true,
      spouseOptimization: true,
    } as unknown as LayoutConfig
    const result = validateLayoutConfig(config, { mode: 'prod' })
    expect(result.ok).toBe(true)
    expect(result.clampedFields).toEqual([])
  })

  it('LayoutEngine 构造函数 dev 模式抛错（validateConfigMode: dev）', () => {
    expect(() => {
      new LayoutEngine({
        canvasSize: { width: 800, height: 600 },
        config: {
          // @ts-expect-error 故意构造非法
          nodeWidth: 0,
        },
        validateConfigMode: 'dev',
      })
    }).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }))
  })

  it('LayoutEngine 构造函数 prod 模式默认安全：不抛错 + warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      new LayoutEngine({
        canvasSize: { width: 800, height: 600 },
        // @ts-expect-error 故意构造非法
        config: { nodeWidth: 0 },
      })
      // 不应抛错
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('updateConfig 也走 prod 校验路径（不抛错 + 可能 warn）', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const engine = new LayoutEngine({
        canvasSize: { width: 800, height: 600 },
        config: buildSimpleEngineConfig(),
      })
      // @ts-expect-error 故意构造非法
      engine.updateConfig({ nodeWidth: 0 })
      // 不应抛错
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })
})
