import { describe, expect, it } from 'vitest';
import { LayoutEngine } from '@/utils/layout-engine';
import { clampOrthogonalPathsOutsideCards, computeOrthogonalEdgePaths, markOrthogonalBridges } from '@/utils/edge-router';
import type { LayoutConfig, LayoutEdge, LayoutNode } from '@/types/layout';
import { cardSizeForDensity, cardSizeForDirection } from '@/utils/genealogy-card';

function family() {
  const nodes: LayoutNode[] = [
    { id: 'H', label: 'H', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: 80, height: 40 },
    { id: 'W', label: 'W', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: 80, height: 40 },
    { id: 'C', label: 'C', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: 80, height: 40 },
  ];
  const edges: LayoutEdge[] = [
    { id: 'hw', source: 'H', target: 'W', kind: 'spouse', marriageOrder: 1, isCurrent: true },
    { id: 'hc', source: 'H', target: 'C', kind: 'parent-child' },
  ];
  return { nodes, edges };
}

function engine(direction: 'TB' | 'LR') {
  return new LayoutEngine({
    canvasSize: { width: 1200, height: 800 },
    config: {
      nodeWidth: 80,
      nodeHeight: 40,
      nodeSep: 24,
      rankSep: 48,
      spouseGap: 16,
      resolveSubtreeOverlap: true,
      mainLineageCenter: false,
      spouseOptimization: true,
      layoutDirection: direction,
    } as Partial<LayoutConfig>,
  });
}

describe('layoutDirection', () => {
  it('TB：子代在下方，配偶在右侧，父子边从底部进顶部', async () => {
    const { nodes, edges } = family();
    const result = await engine('TB').calculateLayout(nodes, edges);
    const pos = new Map(result.nodes.map((n) => [n.id, n]));
    const h = pos.get('H')!;
    const w = pos.get('W')!;
    const c = pos.get('C')!;
    expect(c.y).toBeGreaterThan(h.y + h.height / 2);
    expect(w.x).toBeGreaterThan(h.x);
    expect(Math.abs(w.y - h.y)).toBeLessThan(1);

    const edge = result.edges.find((e) => e.kind === 'parent-child' && e.target === 'C');
    const points = edge?.path?.points ?? [];
    expect(points.length).toBeGreaterThan(0);
    expect(points[0].y).toBeGreaterThan(h.y);
    expect(points[points.length - 1].y).toBeLessThan(c.y);
    expect(nodes[0].width).toBe(80);
    expect(nodes[0].height).toBe(40);
  });

  it('LR：子代在右侧，配偶在下方，父子边从右侧进左侧', async () => {
    const { nodes, edges } = family();
    const result = await engine('LR').calculateLayout(nodes, edges);
    const pos = new Map(result.nodes.map((n) => [n.id, n]));
    const h = pos.get('H')!;
    const w = pos.get('W')!;
    const c = pos.get('C')!;
    expect(c.x).toBeGreaterThan(h.x + h.width / 2);
    expect(w.y).toBeGreaterThan(h.y);
    expect(Math.abs(w.x - h.x)).toBeLessThan(1);
    expect(h.width).toBe(80);
    expect(h.height).toBe(40);

    const edge = result.edges.find((e) => e.kind === 'parent-child' && e.target === 'C');
    const points = edge?.path?.points ?? [];
    expect(points[0].x).toBeGreaterThan(h.x);
    expect(points[points.length - 1].x).toBeLessThan(c.x);
    expect(nodes[0].width).toBe(80);
    expect(nodes[0].height).toBe(40);
  });

  it('LR 160×80：配偶在下方，继子女在右侧，卡片外框不相交', async () => {
    const W = 160;
    const H = 80;
    const nodes: LayoutNode[] = [
      { id: 'H', label: '夫', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
      { id: 'W1', label: '妻1', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'W2', label: '妻2', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'A', label: '继A', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: W, height: H },
      { id: 'B', label: '继B', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: W, height: H },
      { id: 'G', label: '孙', gender: 'male', isMainLineage: true, isLiving: false, generation: 2, width: W, height: H },
    ];
    const edges: LayoutEdge[] = [
      { id: 'hw1', source: 'H', target: 'W1', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'hw2', source: 'H', target: 'W2', kind: 'spouse', marriageOrder: 2, isCurrent: true },
      { id: 'w1a', source: 'W1', target: 'A', kind: 'parent-child' },
      { id: 'w2b', source: 'W2', target: 'B', kind: 'parent-child' },
      { id: 'bg', source: 'B', target: 'G', kind: 'parent-child' },
    ];
    const result = await new LayoutEngine({
      canvasSize: { width: 1400, height: 800 },
      config: {
        nodeWidth: W,
        nodeHeight: H,
        nodeSep: 22,
        rankSep: 115,
        spouseGap: 16,
        resolveSubtreeOverlap: true,
        mainLineageCenter: true,
        spouseOptimization: true,
        layoutDirection: 'LR',
      } as Partial<LayoutConfig>,
    }).calculateLayout(nodes, edges);
    const pos = new Map(result.nodes.map((n) => [n.id, n]));
    const h = pos.get('H')!;
    const w1 = pos.get('W1')!;
    const a = pos.get('A')!;
    const b = pos.get('B')!;
    const g = pos.get('G')!;

    expect(w1.y).toBeGreaterThan(h.y);
    expect(Math.abs(w1.x - h.x)).toBeLessThan(1);
    expect(a.x).toBeGreaterThan(w1.x + w1.width / 2);
    expect(g.x).toBeGreaterThan(b.x + b.width / 2);

    const boxes = result.nodes.map((n) => ({
      id: n.id,
      minX: n.x - n.width / 2,
      maxX: n.x + n.width / 2,
      minY: n.y - n.height / 2,
      maxY: n.y + n.height / 2,
    }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i];
        const q = boxes[j];
        const overlap = p.minX < q.maxX - 0.5 && q.minX < p.maxX - 0.5
          && p.minY < q.maxY - 0.5 && q.minY < p.maxY - 0.5;
        expect(overlap, `${p.id} 与 ${q.id} 重叠`).toBe(false);
      }
    }
  });

  it('子女线从父亲边缘引出，配偶线停在卡片侧边', async () => {
    const nodes: LayoutNode[] = [
      { id: 'H', label: '夫', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: 80, height: 40 },
      { id: 'W', label: '妻', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: 80, height: 40 },
      { id: 'C', label: '子', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: 80, height: 40 },
    ];
    const edges: LayoutEdge[] = [
      { id: 'hw', source: 'H', target: 'W', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'wc', source: 'W', target: 'C', kind: 'parent-child' },
    ];
    const result = await new LayoutEngine({
      canvasSize: { width: 1200, height: 800 },
      config: {
        nodeWidth: 80,
        nodeHeight: 40,
        nodeSep: 24,
        rankSep: 80,
        spouseGap: 16,
        resolveSubtreeOverlap: true,
        mainLineageCenter: false,
        spouseOptimization: true,
        layoutDirection: 'TB',
      } as Partial<LayoutConfig>,
    }).calculateLayout(nodes, edges);
    const pos = new Map(result.nodes.map((n) => [n.id, n]));
    const h = pos.get('H')!;
    const w = pos.get('W')!;
    const c = pos.get('C')!;
    const childEdge = result.edges.find((e) => e.target === 'C')!;
    const spouseEdge = result.edges.find((e) => e.kind === 'spouse')!;
    const start = childEdge.path!.points[0];
    const end = childEdge.path!.points[childEdge.path!.points.length - 1];
    expect(start.x).toBeCloseTo(h.x, 0);
    expect(start.y).toBeCloseTo(h.y + h.height / 2, 0);
    expect(start.x).not.toBeCloseTo(w.x, 0);
    expect(end.x).toBeCloseTo(c.x, 0);
    expect(end.y).toBeCloseTo(c.y - c.height / 2, 0);

    const sp = spouseEdge.path!.points;
    expect(sp[0].x).toBeCloseTo(h.x + h.width / 2, 0);
    expect(sp[sp.length - 1].x).toBeCloseTo(w.x - w.width / 2, 0);
    expect(sp[0].y).toBeCloseTo(h.y, 0);
  });

  it('同一代两户的水平总线不占同一个 Y', () => {
    const positions = new Map<string, { id: string; x: number; y: number; width: number; height: number }>([
      ['A', { id: 'A', x: 0, y: 0, width: 80, height: 40 }],
      ['B', { id: 'B', x: 280, y: 0, width: 80, height: 40 }],
      ['A1', { id: 'A1', x: -40, y: 180, width: 80, height: 40 }],
      ['A2', { id: 'A2', x: 140, y: 180, width: 80, height: 40 }],
      ['B1', { id: 'B1', x: 80, y: 180, width: 80, height: 40 }],
      ['B2', { id: 'B2', x: 360, y: 180, width: 80, height: 40 }],
    ]);
    const edges: LayoutEdge[] = [
      { id: 'a1', source: 'A', target: 'A1', kind: 'parent-child' },
      { id: 'a2', source: 'A', target: 'A2', kind: 'parent-child' },
      { id: 'b1', source: 'B', target: 'B1', kind: 'parent-child' },
      { id: 'b2', source: 'B', target: 'B2', kind: 'parent-child' },
    ];
    computeOrthogonalEdgePaths(positions, edges, new Map());
    const busY = (id: string) => {
      const pts = edges.find((edge) => edge.id === id)!.path!.points;
      return pts[1].y;
    };
    expect(Math.abs(busY('a1') - busY('b1'))).toBeGreaterThanOrEqual(8);
    expect(busY('a1')).toBeCloseTo(busY('a2'), 0);
    expect(busY('a1')).toBeGreaterThan(20);
    expect(busY('a1')).toBeLessThan(160);
  });

  it('垂直空隙放不下 2px 车道时，同一代总线合并到一条 Y', () => {
    const positions = new Map<string, { id: string; x: number; y: number; width: number; height: number }>([
      ['A', { id: 'A', x: 0, y: 0, width: 80, height: 40 }],
      ['B', { id: 'B', x: 100, y: 0, width: 80, height: 40 }],
      ['C', { id: 'C', x: 180, y: 0, width: 80, height: 40 }],
      ['A1', { id: 'A1', x: -40, y: 47, width: 40, height: 20 }],
      ['A2', { id: 'A2', x: 80, y: 47, width: 40, height: 20 }],
      ['B1', { id: 'B1', x: 40, y: 47, width: 40, height: 20 }],
      ['B2', { id: 'B2', x: 160, y: 47, width: 40, height: 20 }],
      ['C1', { id: 'C1', x: 120, y: 47, width: 40, height: 20 }],
      ['C2', { id: 'C2', x: 240, y: 47, width: 40, height: 20 }],
    ]);
    const edges: LayoutEdge[] = [
      { id: 'a1', source: 'A', target: 'A1', kind: 'parent-child' },
      { id: 'a2', source: 'A', target: 'A2', kind: 'parent-child' },
      { id: 'b1', source: 'B', target: 'B1', kind: 'parent-child' },
      { id: 'b2', source: 'B', target: 'B2', kind: 'parent-child' },
      { id: 'c1', source: 'C', target: 'C1', kind: 'parent-child' },
      { id: 'c2', source: 'C', target: 'C2', kind: 'parent-child' },
    ];
    computeOrthogonalEdgePaths(positions, edges, new Map());
    const busY = (id: string) => edges.find((edge) => edge.id === id)!.path!.points[1].y;
    expect(Math.abs(busY('a1') - busY('b1'))).toBeLessThan(0.01);
    expect(Math.abs(busY('b1') - busY('c1'))).toBeLessThan(0.01);
    expect(edges[0].path?.laneCollapsed).toBe(true);
    const parentBottom = 20;
    const childTop = 47 - 10;
    for (const id of ['a1', 'b1', 'c1']) {
      expect(busY(id)).toBeGreaterThanOrEqual(parentBottom);
      expect(busY(id)).toBeLessThanOrEqual(childTop);
    }
  });

  it('水平总线被推进卡片后，钳回父亲底边与子女顶边之间', () => {
    const nodes = [
      { id: 'A', x: 0, y: 0, width: 80, height: 40 },
      { id: 'C', x: 40, y: 120, width: 80, height: 40 },
    ];
    const edge: LayoutEdge = {
      id: 'ac',
      source: 'A',
      target: 'C',
      kind: 'parent-child',
      path: {
        type: 'orthogonal',
        points: [
          { x: 0, y: 20 },
          { x: 0, y: 10 },
          { x: 80, y: 10 },
          { x: 80, y: 100 },
        ],
      },
    };
    clampOrthogonalPathsOutsideCards(nodes, [edge]);
    const busY = edge.path!.points[1].y;
    expect(busY).toBe(edge.path!.points[2].y);
    expect(busY).toBeGreaterThanOrEqual(20 + 14);
    expect(busY).toBeLessThanOrEqual(100 - 14);
    expect(edge.path!.points[0].y).toBe(20);
    expect(edge.path!.points[3].y).toBe(100);
  });

  it('已经落在父子空隙里的总线保持不动', () => {
    const nodes = [
      { id: 'A', x: 0, y: 0, width: 80, height: 40 },
      { id: 'C', x: 0, y: 120, width: 80, height: 40 },
    ];
    const edge: LayoutEdge = {
      id: 'ac',
      source: 'A',
      target: 'C',
      kind: 'parent-child',
      path: {
        type: 'orthogonal',
        points: [
          { x: 0, y: 20 },
          { x: 0, y: 60 },
          { x: 40, y: 60 },
          { x: 40, y: 100 },
        ],
      },
    };
    clampOrthogonalPathsOutsideCards(nodes, [edge]);
    expect(edge.path!.points[1].y).toBe(60);
  });

  it('竖线穿过别人的卡片时，中段改走旁边的 X', () => {
    const positions = new Map<string, { id: string; x: number; y: number; width: number; height: number }>([
      ['A', { id: 'A', x: 0, y: 0, width: 80, height: 40 }],
      ['Z', { id: 'Z', x: 0, y: 100, width: 40, height: 40 }],
      ['A1', { id: 'A1', x: 0, y: 200, width: 80, height: 40 }],
    ]);
    const edges: LayoutEdge[] = [
      { id: 'a1', source: 'A', target: 'A1', kind: 'parent-child' },
    ];
    computeOrthogonalEdgePaths(positions, edges, new Map());
    const pts = edges[0].path!.points;
    expect(pts[0]).toMatchObject({ x: 0, y: 20 });
    expect(pts[pts.length - 1]).toMatchObject({ x: 0, y: 180 });
    const box = { x1: -20, x2: 20, y1: 80, y2: 120 };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (Math.abs(a.x - b.x) > 0.5) continue;
      const y1 = Math.min(a.y, b.y);
      const y2 = Math.max(a.y, b.y);
      const through = a.x > box.x1 && a.x < box.x2 && y2 > box.y1 && y1 < box.y2;
      expect(through, `竖线 x=${a.x} 仍穿过障碍卡片`).toBe(false);
    }
    expect(pts.some((point) => Math.abs(point.x) >= 20)).toBe(true);
  });

  it('两户总线叠在一起时，交叉点记在桥接上，同组 T 形不记', () => {
    const positions = new Map<string, { id: string; x: number; y: number; width: number; height: number }>([
      ['A', { id: 'A', x: 0, y: 0, width: 80, height: 40 }],
      ['B', { id: 'B', x: 280, y: 0, width: 80, height: 40 }],
      ['A1', { id: 'A1', x: -40, y: 180, width: 80, height: 40 }],
      ['A2', { id: 'A2', x: 140, y: 180, width: 80, height: 40 }],
      ['B1', { id: 'B1', x: 80, y: 180, width: 80, height: 40 }],
      ['B2', { id: 'B2', x: 360, y: 180, width: 80, height: 40 }],
    ]);
    const edges: LayoutEdge[] = [
      { id: 'a1', source: 'A', target: 'A1', kind: 'parent-child' },
      { id: 'a2', source: 'A', target: 'A2', kind: 'parent-child' },
      { id: 'b1', source: 'B', target: 'B1', kind: 'parent-child' },
      { id: 'b2', source: 'B', target: 'B2', kind: 'parent-child' },
    ];
    computeOrthogonalEdgePaths(positions, edges, new Map());
    markOrthogonalBridges(edges);
    const bridged = edges.filter((edge) => (edge.path?.bridges?.length ?? 0) > 0);
    expect(bridged.length).toBeGreaterThan(0);
    const alone: LayoutEdge[] = [
      { id: 'p1', source: 'A', target: 'A1', kind: 'parent-child' },
      { id: 'p2', source: 'A', target: 'A2', kind: 'parent-child' },
    ];
    const alonePos = new Map<string, { id: string; x: number; y: number; width: number; height: number }>([
      ['A', { id: 'A', x: 0, y: 0, width: 80, height: 40 }],
      ['A1', { id: 'A1', x: -40, y: 180, width: 80, height: 40 }],
      ['A2', { id: 'A2', x: 140, y: 180, width: 80, height: 40 }],
    ]);
    computeOrthogonalEdgePaths(alonePos, alone, new Map());
    markOrthogonalBridges(alone);
    expect(alone.every((edge) => !edge.path?.bridges?.length)).toBe(true);
  });

  it('LR 100 人：夫妻不叠，兄弟轴不再被避让拉爆', async () => {
    const W = 160;
    const H = 80;
    const nodes: LayoutNode[] = [];
    const edges: LayoutEdge[] = [];
    const add = (id: string, label: string, gender: 'male' | 'female', generation: number, main = false) => {
      nodes.push({
        id, label, gender, isMainLineage: main, isLiving: false, generation, width: W, height: H,
      });
    };
    add('p0', '始祖', 'male', 0, true);
    add('w0', '始祖妻', 'female', -1);
    edges.push({ id: 's0', source: 'p0', target: 'w0', kind: 'spouse', marriageOrder: 1, isCurrent: true });
    let born = 2;
    let seq = 0;
    let frontier = [{ id: 'p0', gen: 0 }];
    while (born < 100 && frontier.length) {
      const next: { id: string; gen: number }[] = [];
      for (const person of frontier) {
        for (let i = 0; i < 3 && born < 100; i++) {
          seq += 1;
          add(`p${seq}`, `子${seq}`, 'male', person.gen + 1, i === 0);
          edges.push({
            id: `e${seq}`, source: person.id, target: `p${seq}`, kind: 'parent-child', birthOrder: i + 1,
          });
          born += 1;
          if (born < 100) {
            add(`w${seq}`, `妻${seq}`, 'female', -1);
            edges.push({
              id: `sw${seq}`, source: `p${seq}`, target: `w${seq}`, kind: 'spouse', marriageOrder: 1, isCurrent: true,
            });
            born += 1;
          }
          next.push({ id: `p${seq}`, gen: person.gen + 1 });
        }
      }
      frontier = next;
    }
    const result = await new LayoutEngine({
      canvasSize: { width: 1400, height: 900 },
      metricsEnabled: false,
      config: {
        nodeWidth: W,
        nodeHeight: H,
        nodeSep: 28,
        rankSep: 70,
        spouseGap: 48,
        resolveSubtreeOverlap: true,
        mainLineageCenter: true,
        spouseOptimization: true,
        layoutDirection: 'LR',
      } as Partial<LayoutConfig>,
    }).calculateLayout(nodes, edges);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of result.nodes) {
      minX = Math.min(minX, n.x - n.width / 2);
      maxX = Math.max(maxX, n.x + n.width / 2);
      minY = Math.min(minY, n.y - n.height / 2);
      maxY = Math.max(maxY, n.y + n.height / 2);
    }
    const pos = new Map(result.nodes.map((n) => [n.id, n]));
    for (const edge of result.edges) {
      if (edge.kind !== 'spouse') continue;
      const husband = pos.get(edge.source);
      const wife = pos.get(edge.target);
      if (!husband || !wife) continue;
      expect(Math.abs(wife.x - husband.x), `${edge.source} 与配偶不在同一代际列`).toBeLessThan(1);
      expect(wife.y - husband.y, `${edge.target} 应在丈夫下方`).toBeGreaterThan(husband.height / 2 + wife.height / 2);
    }
    const boxes = result.nodes.map((n) => ({
      id: n.id,
      minX: n.x - n.width / 2,
      maxX: n.x + n.width / 2,
      minY: n.y - n.height / 2,
      maxY: n.y + n.height / 2,
    }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i];
        const q = boxes[j];
        const overlap = p.minX < q.maxX - 0.5 && q.minX < p.maxX - 0.5
          && p.minY < q.maxY - 0.5 && q.minY < p.maxY - 0.5;
        expect(overlap, `${p.id} 与 ${q.id} 重叠`).toBe(false);
      }
    }
    // 5 代 ×（卡片宽 160 + 代际空隙 70）量级。旧避让把兄弟轴拉到 1.3 万以上。
    expect(maxX - minX).toBeLessThan(1600);
    expect(maxY - minY).toBeLessThan(9000);
    expect(maxY - minY).toBeGreaterThan(maxX - minX);
  });

  it('详情密度 160×100：卡片不相交，父子线贴在加高后的外缘', async () => {
    const { nodeWidth: W, nodeHeight: H } = cardSizeForDensity(
      { nodeWidth: 132, nodeHeight: 100 },
      'LR',
      'detailed',
    );
    expect({ nodeWidth: W, nodeHeight: H }).toEqual({ nodeWidth: 160, nodeHeight: 100 });
    const nodes: LayoutNode[] = [
      { id: 'H', label: '夫', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: W, height: H },
      { id: 'W', label: '妻', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: W, height: H },
      { id: 'C', label: '子', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: W, height: H },
    ];
    const edges: LayoutEdge[] = [
      { id: 'hw', source: 'H', target: 'W', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'hc', source: 'H', target: 'C', kind: 'parent-child' },
    ];
    const result = await new LayoutEngine({
      canvasSize: { width: 1400, height: 900 },
      config: {
        nodeWidth: W,
        nodeHeight: H,
        nodeSep: 28,
        rankSep: 70,
        spouseGap: 16,
        resolveSubtreeOverlap: true,
        mainLineageCenter: true,
        spouseOptimization: true,
        layoutDirection: 'TB',
      } as Partial<LayoutConfig>,
    }).calculateLayout(nodes, edges);
    const pos = new Map(result.nodes.map((n) => [n.id, n]));
    const boxes = result.nodes.map((n) => ({
      id: n.id,
      minX: n.x - n.width / 2,
      maxX: n.x + n.width / 2,
      minY: n.y - n.height / 2,
      maxY: n.y + n.height / 2,
    }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i];
        const q = boxes[j];
        const overlap = p.minX < q.maxX - 0.5 && q.minX < p.maxX - 0.5
          && p.minY < q.maxY - 0.5 && q.minY < p.maxY - 0.5;
        expect(overlap, `${p.id} 与 ${q.id} 重叠`).toBe(false);
      }
    }
    const h = pos.get('H')!;
    const c = pos.get('C')!;
    const childEdge = result.edges.find((edge) => edge.target === 'C')!;
    const points = childEdge.path!.points;
    expect(points[0].y).toBeCloseTo(h.y + h.height / 2, 0);
    expect(points[points.length - 1].y).toBeCloseTo(c.y - c.height / 2, 0);
    expect(h.height).toBe(100);
    expect(c.height).toBe(100);
  });

  it('LR 传统卡片用 160×80，和渲染外框一致', () => {
    expect(cardSizeForDirection({ nodeWidth: 84, nodeHeight: 100 }, 'LR')).toEqual({
      nodeWidth: 160,
      nodeHeight: 80,
    });
    expect(cardSizeForDirection({ nodeWidth: 84, nodeHeight: 100 }, 'TB')).toEqual({
      nodeWidth: 84,
      nodeHeight: 100,
    });
  });
});
