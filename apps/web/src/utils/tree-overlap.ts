/**
 * tree-overlap.ts - 子树外接矩形避让模块
 *
 * [Phase C 2026-09-02] LayoutEngine v6 重构收尾：从 tree-layout.ts 抽取子树避让
 *   相关纯函数，让原 806 行单体拆为三模块。
 *
 * 本模块负责（纯函数 + 闭包递归辅助）：
 * - 同一 Y 层各子树外接矩形扫描线推开（resolveSubtreeOverlap）
 * - 整体子树平移（含子女、配偶、继子女）（shiftSubtree）
 *
 * 不在本模块范围：
 * - 节点定位（→ tree-positioning.ts）
 * - 主脉对齐（→ tree-main-line.ts）
 * - 父子边正交路径（→ edge-router.ts）
 * - 配偶边正交路径（→ spouse-renderer.ts）
 */

import type {
  LayoutNode,
  NodePosition,
  BoundingBox,
  CoupleUnit,
} from '@/types/layout';

// ==================== 子树外接矩形扫描线推开 ====================

/**
 * 子树外接矩形扫描线推开
 *
 * 在 alignMainLineage 之后调用，检测同一 Y 层各子树外接矩形是否重叠，
 * 若重叠则将右侧子树整体右推，同步推开其配偶与继子女子树。
 *
 * [2026-08-28 A5] 以 CoupleUnit 为绑定单位计算边界 + 平移。
 *
 * [W2 2026-09-01] 新增 nodeMapForVirtualCheck 参数：
 *   - computeBounds 跳过虚拟节点的 child（避免真实配偶作为独立节点被加入 nodesByY）
 *   - shiftSubtree 跳过虚拟节点子树（已在 coupleUnit.spouseIds 路径处理）
 */
export function resolveSubtreeOverlap(
  nodePositions: Map<string, NodePosition>,
  nodeMap: Map<string, LayoutNode>,
  childrenByParent: Map<string, string[]>,
  spouseByMain: Map<string, import('@/types/layout').LayoutEdge[]>,
  coupleUnitByMain: Map<string, CoupleUnit>,
  nodeSep: number,
  nodeMapForVirtualCheck?: Map<string, LayoutNode>,
) {
  const subtreeBounds = new Map<string, BoundingBox>();

  const computeBounds = (nodeId: string): BoundingBox => {
    const cached = subtreeBounds.get(nodeId);
    if (cached) return cached;

    const pos = nodePositions.get(nodeId);
    if (!pos) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    const coupleUnit = coupleUnitByMain.get(nodeId);
    let minX = pos.x - pos.width / 2;
    let maxX = coupleUnit ? coupleUnit.unitRightX : pos.x + pos.width / 2;
    let minY = pos.y - pos.height / 2;
    let maxY = pos.y + pos.height / 2;

    const children = childrenByParent.get(nodeId) || [];
    for (const childId of children) {
      // [W2 2026-09-01] 跳过虚拟节点的 child（真实配偶）：
      //   当 mainId 有 coupleUnit 时，配偶位置已包含在 unitRightX 内（[minX, maxX] = 自身 + 配偶链）。
      //   若再递归虚拟节点，配偶 bounds 会作为独立节点被加入 nodesByY，导致 overlap 检测误判。
      //   此时也不需要把配偶视为独立子树——配偶与主节点是绑定单元。
      const childNode = nodeMap.get(childId);
      if (childNode?.virtualSpouse) continue;
      const childBounds = computeBounds(childId);
      minX = Math.min(minX, childBounds.minX);
      maxX = Math.max(maxX, childBounds.maxX);
      minY = Math.min(minY, childBounds.minY);
      maxY = Math.max(maxY, childBounds.maxY);
    }

    if (!coupleUnit) {
      const spouseEdges = spouseByMain.get(nodeId) || [];
      for (const edge of spouseEdges) {
        const spouseId = edge.source === nodeId ? edge.target : edge.source;
        const spouseBounds = computeBounds(spouseId);
        minX = Math.min(minX, spouseBounds.minX);
        maxX = Math.max(maxX, spouseBounds.maxX);
        minY = Math.min(minY, spouseBounds.minY);
        maxY = Math.max(maxY, spouseBounds.maxY);
      }
    }

    const bounds: BoundingBox = { minX, minY, maxX, maxY };
    subtreeBounds.set(nodeId, bounds);
    return bounds;
  };

  for (const [id, node] of nodeMap) {
    if ((node.generation ?? 0) < 0) continue;
    computeBounds(id);
  }

  const nodesByY = new Map<number, { id: string; bounds: BoundingBox }[]>();
  for (const [id, bounds] of subtreeBounds) {
    // [W2 2026-09-01] 跳过虚拟节点（virtualSpouse=true）：
    //   虚拟节点被 computeBounds 递归时加入 subtreeBounds（其 child 是真实配偶），
    //   但虚拟节点本身不参与子树重叠检测——它的位置会在 collapse 时被过滤掉。
    const n = nodeMap.get(id);
    if (n?.virtualSpouse) continue;
    const pos = nodePositions.get(id);
    if (!pos) continue;
    const y = pos.y;
    if (!nodesByY.has(y)) nodesByY.set(y, []);
    nodesByY.get(y)!.push({ id, bounds });
  }

  for (const [, items] of nodesByY) {
    items.sort((a, b) => a.bounds.minX - b.bounds.minX);
    let prevMaxX = -Infinity;
    for (const item of items) {
      if (item.bounds.minX < prevMaxX + nodeSep) {
        const dx = prevMaxX + nodeSep - item.bounds.minX;
        shiftSubtree(item.id, dx, nodePositions, childrenByParent, spouseByMain, coupleUnitByMain, undefined, nodeMapForVirtualCheck ?? nodeMap);
        item.bounds.minX += dx;
        item.bounds.maxX += dx;
      }
      prevMaxX = item.bounds.maxX;
    }
  }
}

/**
 * 整体平移子树（递归包含子女、配偶、继子女）
 *
 * [2026-08-28 A5] 当 nodeId 是 CoupleUnit.mainId 时，以绑定单元为单位平移。
 *
 * [W2 2026-09-01] 跳过虚拟节点（virtualSpouse=true）的子树：
 *   虚拟节点的 "child" 是真实配偶，已在 coupleUnit.spouseIds 路径平移过。
 *   若再通过虚拟节点递归，会导致配偶 X 双倍平移。
 */
export function shiftSubtree(
  nodeId: string,
  dx: number,
  nodePositions: Map<string, NodePosition>,
  childrenByParent: Map<string, string[]>,
  spouseByMain: Map<string, import('@/types/layout').LayoutEdge[]>,
  coupleUnitByMain: Map<string, CoupleUnit>,
  visited = new Set<string>(),
  nodeMap?: Map<string, LayoutNode>,
) {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  const pos = nodePositions.get(nodeId);
  if (pos) pos.x += dx;

  const coupleUnit = coupleUnitByMain.get(nodeId);
  const spouseIds: string[] = coupleUnit
    ? coupleUnit.spouseIds
    : (spouseByMain.get(nodeId) || []).map((e) => (e.source === nodeId ? e.target : e.source));

  for (const spouseId of spouseIds) {
    shiftSubtree(spouseId, dx, nodePositions, childrenByParent, spouseByMain, coupleUnitByMain, visited, nodeMap);
  }

  const children = childrenByParent.get(nodeId) || [];
  for (const childId of children) {
    // [W2 2026-09-01] 虚拟节点子树已在 coupleUnit.spouseIds 路径处理，跳过避免重复
    const childNode = nodeMap?.get(childId);
    if (childNode?.virtualSpouse) continue;
    shiftSubtree(childId, dx, nodePositions, childrenByParent, spouseByMain, coupleUnitByMain, visited, nodeMap);
  }
}