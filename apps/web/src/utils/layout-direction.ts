/**
 * 族谱布局方向。
 *
 * 屏幕坐标：
 * - TB：代际沿 Y 向下，兄弟沿 X 向右，配偶在主节点右侧。
 * - LR：代际沿 X 向右，兄弟沿 Y 向下，配偶在主节点下方。
 *
 * 配偶贴附、子树避让、正交边都写在「工作坐标」里（代际 = Y，兄弟 = X）。
 * LR 时 dagre / elkjs / compactBox 先按 LR 出屏幕坐标，流水线把它们转置进工作坐标，
 * 走完贴附、避让和走线后再转置回屏幕。转置是对合的：做两次回到原样。
 */
import type { LayoutEdge, LayoutNode, NodePosition, Point } from '@/types/layout';

export type LayoutDirection = 'TB' | 'LR';

export function normalizeLayoutDirection(value: unknown): LayoutDirection {
  return value === 'LR' ? 'LR' : 'TB';
}

function swapPoint(point: Point) {
  const x = point.x;
  point.x = point.y;
  point.y = x;
}

function swapBox(box: { width: number; height: number; x?: number; y?: number }) {
  if (typeof box.x === 'number' && typeof box.y === 'number') swapPoint(box as Point);
  const width = box.width;
  box.width = box.height;
  box.height = width;
}

/** 屏幕 LR ↔ 工作坐标。同时交换宽高，让兄弟轴上的占位和卡片在该轴上的尺寸一致。 */
export function transposePositions(positions: Iterable<NodePosition>) {
  for (const pos of positions) swapBox(pos);
}

/** 节点表上的宽高。调用方必须在布局结束后换回来，避免改到输入节点。 */
export function transposeNodeSizes(nodes: Iterable<LayoutNode>) {
  for (const node of nodes) {
    const width = node.width;
    node.width = node.height;
    node.height = width;
  }
}

/** 正交边的折点和配偶汇聚点。水平段转置后变成垂直段，错开方向一起翻过去。 */
export function transposeEdgePaths(edges: Iterable<LayoutEdge>) {
  for (const edge of edges) {
    const path = edge.path;
    if (!path) continue;
    for (const point of path.points) swapPoint(point);
    if (path.junction) swapPoint(path.junction);
    if (path.bridges) {
      for (const point of path.bridges) swapPoint(point);
    }
  }
}
