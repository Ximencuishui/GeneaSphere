import { describe, expect, it } from 'vitest';
import { computeOrthogonalEdgePaths } from '@/utils/edge-router';
import type { LayoutEdge, NodePosition } from '@/types/layout';

function place(id: string, x: number, y: number, width = 22, height = 120): [string, NodePosition] {
  return [id, { id, x, y, width, height }];
}

function edge(id: string, source: string, target: string): LayoutEdge {
  return { id, source, target, kind: 'parent-child' };
}

describe('垂丝图横担', () => {
  it('多子共用父底到子顶正中的一条横担，不拱桥', () => {
    const positions = new Map<string, NodePosition>([
      place('F', 0, 0),
      place('A', -40, 180),
      place('B', 40, 180),
    ]);
    const edges = [edge('e1', 'F', 'A'), edge('e2', 'F', 'B')];
    computeOrthogonalEdgePaths(positions, edges, new Map(), 0, { mode: 'traditional' });

    const busY = edges[0].path?.points[1]?.y;
    expect(busY).toBeCloseTo(90);
    expect(edges[1].path?.points[1]?.y).toBeCloseTo(90);
    expect(edges[0].path?.points.map((point) => point.x)).toEqual([0, 0, -40, -40]);
    expect(edges[0].path?.classic).toBe(true);
    expect(edges[0].path?.bridges).toBeUndefined();
    expect(edges[1].path?.bridges).toBeUndefined();
  });

  it('父子正对时退成一条竖线', () => {
    const positions = new Map<string, NodePosition>([
      place('F', 10, 0),
      place('A', 10, 180),
    ]);
    const edges = [edge('e1', 'F', 'A')];
    computeOrthogonalEdgePaths(positions, edges, new Map(), 0, { mode: 'traditional' });
    expect(edges[0].path?.points).toEqual([
      { x: 10, y: 60 },
      { x: 10, y: 120 },
    ]);
  });
});
