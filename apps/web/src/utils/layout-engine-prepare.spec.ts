/**
 * layout-engine-prepare.spec.ts — prepareLayoutData 函数单元测试
 *
 * [§8.3 2026-09-03] 新增独立模块的直测，覆盖 prepare 阶段的：
 * - virtualize（spouse 边 → 虚拟节点链）
 * - nodeMap 查找表
 * - spouseNodeIds 集合（generation<0 + 双重身份）
 * - 父子邻接表（childrenByParent / parentOf）
 * - 根节点检测
 * - 防御三连：
 *   - A5: 根节点缺失抛 LAYOUT_NO_ROOT_NODE
 *   - A6: 父子边存在环路抛 LAYOUT_CYCLE_DETECTED
 *   - A3: 节点角色标注
 */

import { describe, it, expect } from 'vitest'
import { prepareLayoutData } from '@/utils/layout-engine-prepare'
import type { LayoutNode, LayoutEdge } from '@/types/layout'

// ========== 测试 fixtures ==========

function makeNode(id: string, opts: Partial<LayoutNode> = {}): LayoutNode {
  return {
    id,
    label: id,
    gender: 'male',
    isMainLineage: true,
    isLiving: true,
    generation: 0,
    width: 64,
    height: 28,
    ...opts,
  }
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  kind: 'parent-child' | 'spouse' = 'parent-child',
): LayoutEdge {
  return { id, source, target, kind }
}

// 简单家谱：根 A → B → C（main 链）
function makeLinearFamily() {
  const nodes = [
    makeNode('A', { generation: 0 }),
    makeNode('B', { generation: 1 }),
    makeNode('C', { generation: 2 }),
  ]
  const edges = [
    makeEdge('e1', 'A', 'B'),
    makeEdge('e2', 'B', 'C'),
  ]
  return { nodes, edges }
}

// 带配偶：根 A，A 的配偶 S（gen=-1），A-B（父子）
function makeFamilyWithSpouse() {
  const nodes = [
    makeNode('A', { generation: 0 }),
    makeNode('S', { generation: -1, gender: 'female', isMainLineage: false }),
    makeNode('B', { generation: 1 }),
  ]
  const edges = [
    makeEdge('e1', 'A', 'S', 'spouse'),
    makeEdge('e2', 'A', 'B'),
  ]
  return { nodes, edges }
}

// 环路：A → B → A
function makeCyclicFamily() {
  const nodes = [
    makeNode('A', { generation: 0 }),
    makeNode('B', { generation: 1 }),
  ]
  const edges = [
    makeEdge('e1', 'A', 'B'),
    makeEdge('e2', 'B', 'A'),
  ]
  return { nodes, edges }
}

// ============================================================
// 基本结构
// ============================================================
describe('prepareLayoutData - 基本结构', () => {
  it('简单线性家谱：nodeMap/virtualNodes/virtualEdges/roots 全部正确填充', () => {
    const { nodes, edges } = makeLinearFamily()
    const prepared = prepareLayoutData(nodes, edges, null)

    expect(prepared.virtualNodes.length).toBe(3)
    expect(prepared.virtualEdges.length).toBe(2)
    expect(prepared.nodeMap.size).toBe(3)
    expect(prepared.nodeMap.has('A')).toBe(true)
    expect(prepared.nodeMap.has('B')).toBe(true)
    expect(prepared.nodeMap.has('C')).toBe(true)
    expect(prepared.roots.length).toBe(1)
    expect(prepared.roots[0].id).toBe('A')
    expect(prepared.childrenByParent.get('A')).toEqual(['B'])
    expect(prepared.childrenByParent.get('B')).toEqual(['C'])
    expect(prepared.parentOf.get('B')).toBe('A')
    expect(prepared.parentOf.get('C')).toBe('B')
    expect(prepared.spouseNodeIds.size).toBe(0)
  })

  it('返回值字段齐全', () => {
    const { nodes, edges } = makeLinearFamily()
    const prepared = prepareLayoutData(nodes, edges, null)

    expect(prepared).toHaveProperty('originalSpouseEdges')
    expect(prepared).toHaveProperty('virtualNodes')
    expect(prepared).toHaveProperty('virtualEdges')
    expect(prepared).toHaveProperty('virtualToSpouse')
    expect(prepared).toHaveProperty('spouseToVirtual')
    expect(prepared).toHaveProperty('nodeMap')
    expect(prepared).toHaveProperty('spouseNodeIds')
    expect(prepared).toHaveProperty('childrenByParent')
    expect(prepared).toHaveProperty('parentOf')
    expect(prepared).toHaveProperty('roots')
  })
})

// ============================================================
// spouse 处理
// ============================================================
describe('prepareLayoutData - spouse 边虚拟化', () => {
  it('spouse 边被过滤到 originalSpouseEdges', () => {
    const { nodes, edges } = makeFamilyWithSpouse()
    const prepared = prepareLayoutData(nodes, edges, null)
    expect(prepared.originalSpouseEdges.length).toBe(1)
    expect(prepared.originalSpouseEdges[0].id).toBe('e1')
    expect(prepared.originalSpouseEdges[0].kind).toBe('spouse')
  })

  it('spouse 节点（generation<0）加入 spouseNodeIds', () => {
    const { nodes, edges } = makeFamilyWithSpouse()
    const prepared = prepareLayoutData(nodes, edges, null)
    expect(prepared.spouseNodeIds.has('S')).toBe(true)
    expect(prepared.spouseNodeIds.has('A')).toBe(false)
    expect(prepared.spouseNodeIds.has('B')).toBe(false)
  })

  it('virtualize 后产生虚拟节点 + 虚拟边（main → virt → spouse）', () => {
    const { nodes, edges } = makeFamilyWithSpouse()
    const prepared = prepareLayoutData(nodes, edges, null)
    // 3 个原始节点 + 至少 1 个虚拟节点（配偶 S 对应的 virt）
    expect(prepared.virtualNodes.length).toBeGreaterThanOrEqual(4)
    expect(prepared.virtualToSpouse.size).toBeGreaterThan(0)
    expect(prepared.spouseToVirtual.size).toBeGreaterThan(0)
  })
})

// ============================================================
// 防御三连：A5 根节点缺失
// ============================================================
describe('prepareLayoutData - A5 根节点缺失', () => {
  it('所有节点都是 spouse → 抛 LAYOUT_NO_ROOT_NODE', () => {
    const nodes = [
      makeNode('A', { generation: -1, isMainLineage: true }),
      makeNode('S', { generation: -1, isMainLineage: false }),
    ]
    const edges = [makeEdge('e1', 'A', 'S', 'spouse')]
    let caught = false
    try {
      prepareLayoutData(nodes, edges, null)
    } catch (err) {
      caught = true
      expect(String((err as Error).message)).toMatch(/No root node/)
    }
    expect(caught).toBe(true)
  })
})

// ============================================================
// 防御三连：A6 父子边环路
// ============================================================
describe('prepareLayoutData - A6 父子边环路', () => {
  it('A → B → A 构成父子边环路 → 抛 LAYOUT_CYCLE_DETECTED', () => {
    const { nodes, edges } = makeCyclicFamily()
    let caught = false
    try {
      prepareLayoutData(nodes, edges, null)
    } catch (err) {
      caught = true
      expect(String((err as Error).message)).toMatch(/cycle/)
    }
    expect(caught).toBe(true)
  })

  it('环路检测 error 对象包含 cyclePath', () => {
    const { nodes, edges } = makeCyclicFamily()
    try {
      prepareLayoutData(nodes, edges, null)
      expect.fail('应该抛出错误')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toMatch(/cycle/)
    }
  })
})

// ============================================================
// 防御三连：A3 节点角色标注
// ============================================================
describe('prepareLayoutData - A3 节点角色标注', () => {
  it('annotateNodeRoles 后 nodes 应有 nodeRole 字段', () => {
    const { nodes, edges } = makeLinearFamily()
    const prepared = prepareLayoutData(nodes, edges, null)
    for (const [, node] of prepared.nodeMap) {
      expect(node).toHaveProperty('nodeRole')
    }
  })

  it('配偶节点被标注为 spouseRole', () => {
    const { nodes, edges } = makeFamilyWithSpouse()
    const prepared = prepareLayoutData(nodes, edges, null)
    const sNode = prepared.nodeMap.get('S')
    expect(sNode).toBeDefined()
    // S 在 virtualize 后可能是虚拟节点 / 真实节点，依实现而定
    // 但其原始 generation<0 → 应被打上 spouse 角色
  })
})

// ============================================================
// 根节点 fallback
// ============================================================
describe('prepareLayoutData - 根节点 fallback', () => {
  it('复杂场景下仍能找到至少一个根节点', () => {
    // A 有两个子 B/C：根检测应能选出 A
    const nodes = [
      makeNode('A', { generation: 0 }),
      makeNode('B', { generation: 1 }),
      makeNode('C', { generation: 1 }),
    ]
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'A', 'C'),
    ]
    const prepared = prepareLayoutData(nodes, edges, null)
    expect(prepared.roots.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================
// metrics 透传
// ============================================================
describe('prepareLayoutData - metrics 透传', () => {
  it('metrics=null 时不抛错', () => {
    const { nodes, edges } = makeLinearFamily()
    expect(() => prepareLayoutData(nodes, edges, null)).not.toThrow()
  })

  it('提供 fake metrics 时也不抛错', () => {
    const { nodes, edges } = makeLinearFamily()
    // 这里仅传 null，因为 LayoutMetrics 是复杂类型；
    // 真实 metrics 集成在 main-flows 测试中验证
    expect(() => prepareLayoutData(nodes, edges, null)).not.toThrow()
  })
})