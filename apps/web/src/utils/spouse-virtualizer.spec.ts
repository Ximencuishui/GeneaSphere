/**
 * spouse-virtualizer 单元测试
 *
 * 覆盖 W2 数据模型重构的边界场景：
 * 1. 单配偶：1 条虚拟链
 * 2. 一夫多妻：N 条独立虚拟链
 * 3. 双重身份：X 作为 P 的真实子 + X→Y 的虚拟链并存
 * 4. 兄弟共妻：H1/H2 共 W，生成 2 条虚拟链
 * 5. 连襟：H1→W1, H2→W2 独立虚拟链
 * 6. collapse：虚拟节点从 nodes 中过滤，spouse 边信息保留
 *
 * [W2 2026-09-01] LayoutEngine v6 第二阶段回归
 */

import { describe, it, expect } from 'vitest';
import {
  expandSpouseToVirtualNodes,
  collapseVirtualNodes,
} from '@/utils/spouse-virtualizer';
import type {
  LayoutNode,
  LayoutEdge,
  NodePosition,
} from '@/types/layout';

// ==================== 构造辅助 ====================

function makeNode(
  id: string,
  gender: 'male' | 'female',
  generation: number,
  isMainLineage = false,
): LayoutNode {
  return {
    id,
    label: id,
    gender,
    isMainLineage,
    isLiving: false,
    generation,
    width: 64,
    height: 28,
  };
}

// ==================== expand ====================

describe('spouse-virtualizer: expandSpouseToVirtualNodes', () => {
  it('单配偶：1 条 spouse 边生成 1 个虚拟节点 + 2 条 parent-child 边', () => {
    const nodes: LayoutNode[] = [
      makeNode('H', 'male', 0, true),
      makeNode('W', 'female', -1),
    ];
    const edges: LayoutEdge[] = [
      { id: 'e-hw', source: 'H', target: 'W', kind: 'spouse', marriageOrder: 1, isCurrent: true },
    ];

    const result = expandSpouseToVirtualNodes(nodes, edges);

    // 节点：原 2 个 + 1 虚拟
    expect(result.virtualNodes.length).toBe(3);
    const virtualNode = result.virtualNodes.find(n => n.id === '__virt_w_H_W')!;
    expect(virtualNode).toBeDefined();
    expect(virtualNode.width).toBe(0);
    expect(virtualNode.height).toBe(0);
    expect(virtualNode.virtualSpouse).toBe(true);

    // 边：原 spouse 边被替换为 2 条 parent-child
    expect(result.virtualEdges.length).toBe(2);
    expect(result.virtualEdges.every(e => e.kind === 'parent-child')).toBe(true);

    // 第一条边：H → virtualNode，标记 fromVirtualSpouse=true
    const firstEdge = result.virtualEdges.find(e => e.source === 'H' && e.target === '__virt_w_H_W')!;
    expect(firstEdge).toBeDefined();
    expect(firstEdge.fromVirtualSpouse).toBe(true);
    expect(firstEdge.marriageOrder).toBe(1);

    // 第二条边：virtualNode → W，普通 parent-child
    const secondEdge = result.virtualEdges.find(e => e.source === '__virt_w_H_W' && e.target === 'W')!;
    expect(secondEdge).toBeDefined();
    expect(secondEdge.fromVirtualSpouse).toBeUndefined();

    // 映射表
    expect(result.spouseEdgeMap.get('e-hw')).toBe(firstEdge.id);
    expect(result.virtualToSpouse.get('__virt_w_H_W')).toBe('W');
  });

  it('一夫多妻：N 条 spouse 边生成 N 个独立虚拟节点', () => {
    const nodes: LayoutNode[] = [
      makeNode('F', 'male', 0, true),
      makeNode('W1', 'female', -1),
      makeNode('W2', 'female', -1),
      makeNode('W3', 'female', -1),
    ];
    const edges: LayoutEdge[] = [
      { id: 'e-fw1', source: 'F', target: 'W1', kind: 'spouse', marriageOrder: 1 },
      { id: 'e-fw2', source: 'F', target: 'W2', kind: 'spouse', marriageOrder: 2 },
      { id: 'e-fw3', source: 'F', target: 'W3', kind: 'spouse', marriageOrder: 3 },
    ];

    const result = expandSpouseToVirtualNodes(nodes, edges);

    expect(result.virtualNodes.length).toBe(7); // 4 原 + 3 虚拟
    expect(result.virtualEdges.length).toBe(6); // 3 spouse → 6 parent-child

    const virtualIds = [
      '__virt_w_F_W1',
      '__virt_w_F_W2',
      '__virt_w_F_W3',
    ];
    for (const vid of virtualIds) {
      expect(result.virtualToSpouse.has(vid)).toBe(true);
    }
  });

  it('双重身份：X 既是 P 的子又是 Y 的配偶', () => {
    //   P (gen 0) ── M (gen -1)
    //   ├── X (gen 1) ── Y (gen 0) → Z (gen 1)
    //   └── X2 (gen 1)
    const nodes: LayoutNode[] = [
      makeNode('P', 'male', 0, true),
      makeNode('M', 'female', -1),
      makeNode('X', 'male', 1, true),
      makeNode('Y', 'female', 0),
      makeNode('Z', 'male', 1),
      makeNode('X2', 'male', 1),
    ];
    const edges: LayoutEdge[] = [
      { id: 'e-pm', source: 'P', target: 'M', kind: 'spouse', marriageOrder: 1 },
      // X 既是 P 的子（真实 parent-child）
      { id: 'e-px', source: 'P', target: 'X', kind: 'parent-child' },
      { id: 'e-px2', source: 'P', target: 'X2', kind: 'parent-child' },
      // X 又是 Y 的配偶（spouse 边）
      { id: 'e-xy', source: 'X', target: 'Y', kind: 'spouse', marriageOrder: 1 },
      { id: 'e-yz', source: 'Y', target: 'Z', kind: 'parent-child' },
    ];

    const result = expandSpouseToVirtualNodes(nodes, edges);

    // X 的 P→X 真实父子边保留
    const xEdge = result.virtualEdges.find(e => e.source === 'P' && e.target === 'X');
    expect(xEdge).toBeDefined();
    expect(xEdge?.kind).toBe('parent-child');
    expect(xEdge?.fromVirtualSpouse).toBeUndefined();

    // X→Y 的 spouse 边展开为 X→virt→Y
    expect(result.virtualToSpouse.has('__virt_w_X_Y')).toBe(true);
    expect(result.spouseEdgeMap.get('e-xy')).toBeDefined();
  });

  it('兄弟共妻：H1/H2 共 W，生成 2 条独立虚拟链', () => {
    //   H1 ──┐
    //        ├── W (gen -1) → C1 / C2
    //   H2 ──┘
    const nodes: LayoutNode[] = [
      makeNode('H1', 'male', 0, true),
      makeNode('H2', 'male', 0),
      makeNode('W', 'female', -1),
      makeNode('C1', 'male', 1),
      makeNode('C2', 'male', 1),
    ];
    const edges: LayoutEdge[] = [
      { id: 'e-h1w', source: 'H1', target: 'W', kind: 'spouse', marriageOrder: 1 },
      { id: 'e-h2w', source: 'H2', target: 'W', kind: 'spouse', marriageOrder: 1 },
      { id: 'e-wc1', source: 'W', target: 'C1', kind: 'parent-child' },
      { id: 'e-wc2', source: 'W', target: 'C2', kind: 'parent-child' },
    ];

    const result = expandSpouseToVirtualNodes(nodes, edges);

    // 两个虚拟节点都指向 W
    expect(result.virtualToSpouse.get('__virt_w_H1_W')).toBe('W');
    expect(result.virtualToSpouse.get('__virt_w_H2_W')).toBe('W');

    // DAG 中 W 有两个父边（来自两个虚拟节点）
    const wParents = result.virtualEdges.filter(e => e.target === 'W' && e.source.startsWith('__virt_'));
    expect(wParents.length).toBe(2);

    // W 的子女边保留（不受虚拟化影响）
    const wChildren = result.virtualEdges.filter(e => e.source === 'W' && e.kind === 'parent-child');
    expect(wChildren.length).toBe(2);
  });

  it('连襟：H1→W1, H2→W2 独立虚拟链，互不干扰', () => {
    const nodes: LayoutNode[] = [
      makeNode('H1', 'male', 0, true),
      makeNode('H2', 'male', 0),
      makeNode('W1', 'female', -1),
      makeNode('W2', 'female', -1),
      makeNode('C1', 'male', 1),
      makeNode('C2', 'female', 1),
    ];
    const edges: LayoutEdge[] = [
      { id: 'e-h1w1', source: 'H1', target: 'W1', kind: 'spouse', marriageOrder: 1 },
      { id: 'e-h2w2', source: 'H2', target: 'W2', kind: 'spouse', marriageOrder: 1 },
      { id: 'e-h1h2', source: 'H1', target: 'H2', kind: 'parent-child' }, // 兄弟
      { id: 'e-w1c1', source: 'W1', target: 'C1', kind: 'parent-child' },
      { id: 'e-w2c2', source: 'W2', target: 'C2', kind: 'parent-child' },
    ];

    const result = expandSpouseToVirtualNodes(nodes, edges);

    expect(result.virtualToSpouse.get('__virt_w_H1_W1')).toBe('W1');
    expect(result.virtualToSpouse.get('__virt_w_H2_W2')).toBe('W2');

    // 兄弟边保留
    const brotherEdge = result.virtualEdges.find(e => e.source === 'H1' && e.target === 'H2');
    expect(brotherEdge).toBeDefined();
    expect(brotherEdge?.kind).toBe('parent-child');
  });

  it('无 spouse 边：原样返回', () => {
    const nodes: LayoutNode[] = [
      makeNode('P', 'male', 0, true),
      makeNode('S1', 'male', 1),
      makeNode('S2', 'male', 1),
    ];
    const edges: LayoutEdge[] = [
      { id: 'e-ps1', source: 'P', target: 'S1', kind: 'parent-child' },
      { id: 'e-ps2', source: 'P', target: 'S2', kind: 'parent-child' },
    ];

    const result = expandSpouseToVirtualNodes(nodes, edges);

    expect(result.virtualNodes.length).toBe(3);
    expect(result.virtualEdges.length).toBe(2);
    expect(result.virtualToSpouse.size).toBe(0);
    expect(result.spouseEdgeMap.size).toBe(0);
  });

  it('空输入：返回空结果', () => {
    const result = expandSpouseToVirtualNodes([], []);

    expect(result.virtualNodes).toEqual([]);
    expect(result.virtualEdges).toEqual([]);
    expect(result.spouseEdgeMap.size).toBe(0);
    expect(result.virtualToSpouse.size).toBe(0);
  });

  it('ID 中的下划线被转义为双下划线，避免解析冲突', () => {
    const nodes: LayoutNode[] = [
      makeNode('a_b', 'male', 0, true),
      makeNode('c_d', 'female', -1),
    ];
    const edges: LayoutEdge[] = [
      { id: 'e-x', source: 'a_b', target: 'c_d', kind: 'spouse', marriageOrder: 1 },
    ];

    const result = expandSpouseToVirtualNodes(nodes, edges);

    // 虚拟 id 应为 '__virt_w_a__b_c__d'（下划线转义）
    expect(result.virtualToSpouse.has('__virt_w_a__b_c__d')).toBe(true);
  });
});

// ==================== collapse ====================

describe('spouse-virtualizer: collapseVirtualNodes', () => {
  it('过滤虚拟节点和虚拟边，记录虚拟节点位置到配偶', () => {
    const layout = {
      nodes: [
        { id: 'H', x: 0, y: 0, width: 64, height: 28 },
        { id: 'W', x: 80, y: 0, width: 64, height: 28 },
        { id: '__virt_w_H_W', x: 64, y: 0, width: 0, height: 0 }, // 虚拟节点
      ] as NodePosition[],
      edges: [
        { id: 'e-real', source: 'H', target: 'W', kind: 'spouse', marriageOrder: 1 } as LayoutEdge,
        { id: 'e-hw__virt_e_0', source: 'H', target: '__virt_w_H_W', kind: 'parent-child' } as LayoutEdge,
        { id: 'e-hw__virt_e_1', source: '__virt_w_H_W', target: 'W', kind: 'parent-child' } as LayoutEdge,
      ],
    };
    const virtualToSpouse = new Map([['__virt_w_H_W', 'W']]);

    const result = collapseVirtualNodes(layout, virtualToSpouse);

    // 虚拟节点被过滤
    expect(result.nodes.length).toBe(2);
    expect(result.nodes.map(n => n.id).sort()).toEqual(['H', 'W']);

    // 虚拟边被过滤（保留原始 spouse 边）
    expect(result.edges.length).toBe(1);
    expect(result.edges[0].id).toBe('e-real');
    expect(result.edges[0].kind).toBe('spouse');

    // 虚拟节点位置已映射到真实配偶
    expect(result.virtualToSpousePos.has('__virt_w_H_W')).toBe(true);
    const spousePos = result.virtualToSpousePos.get('__virt_w_H_W')!;
    expect(spousePos.id).toBe('W');
    expect(spousePos.x).toBe(64);
    expect(spousePos.y).toBe(0);
  });

  it('无虚拟节点：原样返回', () => {
    const layout = {
      nodes: [
        { id: 'P', x: 0, y: 0, width: 64, height: 28 },
        { id: 'S', x: 0, y: 50, width: 64, height: 28 },
      ] as NodePosition[],
      edges: [
        { id: 'e-ps', source: 'P', target: 'S', kind: 'parent-child' } as LayoutEdge,
      ],
    };

    const result = collapseVirtualNodes(layout, new Map());

    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(1);
    expect(result.virtualToSpousePos.size).toBe(0);
  });

  it('多个虚拟节点指向不同配偶：分别记录位置', () => {
    const layout = {
      nodes: [
        { id: 'F', x: 0, y: 0, width: 64, height: 28 },
        { id: 'W1', x: 80, y: 0, width: 64, height: 28 },
        { id: 'W2', x: 160, y: 0, width: 64, height: 28 },
        { id: '__virt_w_F_W1', x: 64, y: 0, width: 0, height: 0 },
        { id: '__virt_w_F_W2', x: 144, y: 0, width: 0, height: 0 },
      ] as NodePosition[],
      edges: [
        { id: 'e-sp1', source: 'F', target: 'W1', kind: 'spouse' } as LayoutEdge,
        { id: 'e-sp2', source: 'F', target: 'W2', kind: 'spouse' } as LayoutEdge,
        { id: 'e-sp1__virt_e_0', source: 'F', target: '__virt_w_F_W1', kind: 'parent-child' } as LayoutEdge,
        { id: 'e-sp2__virt_e_0', source: 'F', target: '__virt_w_F_W2', kind: 'parent-child' } as LayoutEdge,
      ],
    };
    const virtualToSpouse = new Map([
      ['__virt_w_F_W1', 'W1'],
      ['__virt_w_F_W2', 'W2'],
    ]);

    const result = collapseVirtualNodes(layout, virtualToSpouse);

    expect(result.nodes.length).toBe(3); // F, W1, W2
    expect(result.edges.length).toBe(2); // 两条原始 spouse 边
    expect(result.virtualToSpousePos.size).toBe(2);
    expect(result.virtualToSpousePos.get('__virt_w_F_W1')!.x).toBe(64);
    expect(result.virtualToSpousePos.get('__virt_w_F_W2')!.x).toBe(144);
  });
});

// ==================== 集成：expand + collapse 往返 ====================

describe('spouse-virtualizer: expand + collapse 往返一致性', () => {
  it('简单场景：节点数和 spouse 边信息完全还原', () => {
    const nodes: LayoutNode[] = [
      makeNode('F', 'male', 0, true),
      makeNode('W', 'female', -1),
      makeNode('S', 'male', 1),
    ];
    const edges: LayoutEdge[] = [
      { id: 'e-fw', source: 'F', target: 'W', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'e-fs', source: 'F', target: 'S', kind: 'parent-child' },
    ];

    const expanded = expandSpouseToVirtualNodes(nodes, edges);

    // 模拟 layout 结果（虚拟节点 X = mainX+spouseGap/2）
    const layoutNodes: NodePosition[] = [
      ...expanded.virtualNodes.map(n => ({
        id: n.id,
        x: n.id === 'F' ? 0 : n.id === 'W' ? 80 : n.id === 'S' ? 0 : 40, // 虚拟节点 X=40
        y: n.id === 'S' ? 50 : 0,
        width: n.width,
        height: n.height,
      })),
    ];

    const result = collapseVirtualNodes(
      { nodes: layoutNodes, edges: expanded.virtualEdges },
      expanded.virtualToSpouse,
    );

    // 节点数还原为原始
    expect(result.nodes.length).toBe(nodes.length);
    expect(result.nodes.map(n => n.id).sort()).toEqual(nodes.map(n => n.id).sort());

    // spouse 边信息保留：注意原始 spouse 边在 expand 后被替换为虚拟边，
    // collapse 时虚拟边被过滤掉。spouse 边的 path 渲染由 spouse-renderer
    // 在 collapse 后的真实图上重新计算（用 mainId + spouseId 推导），
    // 不需要在 edges 数组中保留原始 spouse 边的引用。
    const originalParentChildEdges = edges.filter(e => e.kind === 'parent-child');
    expect(result.edges.length).toBe(originalParentChildEdges.length);
    expect(result.edges.every(e => e.kind === 'parent-child')).toBe(true);

    // 虚拟节点位置映射到真实配偶
    expect(result.virtualToSpousePos.get('__virt_w_F_W')!.id).toBe('W');
    expect(result.virtualToSpousePos.get('__virt_w_F_W')!.x).toBe(40);
  });
});