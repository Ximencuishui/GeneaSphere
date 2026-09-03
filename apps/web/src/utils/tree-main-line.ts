/**
 * tree-main-line.ts - 主脉对齐 + 整体居中模块
 *
 * [Phase C 2026-09-02] LayoutEngine v6 重构收尾：从 tree-layout.ts 抽取主脉对齐
 *   相关纯函数，让原 806 行单体拆为三模块。
 *
 * 本模块负责（纯函数 + 闭包递归辅助）：
 * - 主脉节点对齐到垂直中线 x=0（alignMainLineage）
 * - 非主脉子树平移（shiftNonMainSubtree，私有）
 * - 整体居中平移（shiftToCenter）
 *
 * 不在本模块范围：
 * - 节点定位（→ tree-positioning.ts）
 * - 子树外接矩形避让（→ tree-overlap.ts）
 * - 父子边正交路径（→ edge-router.ts）
 * - 配偶边正交路径（→ spouse-renderer.ts）
 */

import type {
  LayoutNode,
  NodePosition,
  CoupleUnit,
} from '@/types/layout';
import { getBoundingBox } from '@/utils/tree-positioning';

// ==================== 主脉对齐 ====================

/**
 * 主脉后处理对齐
 *
 * 将主脉节点向垂直中线（x=0）平移，同步平移配偶、继子女和非主脉子树。
 *
 * [2026-08-28 A4] 显式以 CoupleUnit 为绑定单位平移：
 *   coupleUnitByMain 已包含所有配偶 id 列表，平移时优先从 CoupleUnit 取值。
 *
 * [W2 2026-09-01] 新增 nodeMap 参数，让 shiftNonMainSubtree 能识别并跳过虚拟节点。
 */
export function alignMainLineage(
  nodePositions: Map<string, NodePosition>,
  nodeMap: Map<string, LayoutNode>,
  spouseByMain: Map<string, import('@/types/layout').LayoutEdge[]>,
  childrenByParent: Map<string, string[]>,
  coupleUnitByMain: Map<string, CoupleUnit>,
  nodeMapForVirtualCheck?: Map<string, LayoutNode>,
) {
  const mainLineageNodes: { id: string; gen: number }[] = [];
  for (const [id, node] of nodeMap) {
    if (node.isMainLineage && (node.generation ?? 0) >= 0) {
      mainLineageNodes.push({ id, gen: node.generation ?? 0 });
    }
  }

  if (mainLineageNodes.length === 0) return;

  mainLineageNodes.sort((a, b) => a.gen - b.gen);
  const targetCenterX = 0;
  const mainNodeIds = new Set(mainLineageNodes.map(n => n.id));

  for (const { id } of mainLineageNodes) {
    const pos = nodePositions.get(id);
    if (!pos) continue;

    const dx = targetCenterX - pos.x;
    if (Math.abs(dx) < 1) continue;

    pos.x += dx;

    const coupleUnit = coupleUnitByMain.get(id);
    const spouseIds: string[] = coupleUnit
      ? coupleUnit.spouseIds
      : (spouseByMain.get(id) || []).map((e) => (e.source === id ? e.target : e.source));

    for (const spouseId of spouseIds) {
      const spousePos = nodePositions.get(spouseId);
      if (spousePos) spousePos.x += dx;

      shiftNonMainSubtree(
        spouseId, dx, nodePositions, childrenByParent, spouseByMain, mainNodeIds,
        undefined, nodeMapForVirtualCheck ?? nodeMap,
      );
    }

    shiftNonMainSubtree(id, dx, nodePositions, childrenByParent, spouseByMain, mainNodeIds, undefined, nodeMapForVirtualCheck ?? nodeMap);
  }
}

/**
 * 平移非主脉子树（跳过主脉后代，避免重复平移）
 *
 * [W2 2026-09-01 修复] 跳过虚拟节点（virtualSpouse=true）：
 *   虚拟节点的 "child" 是真实配偶，已在 alignMainLineage 的 spouseIds 循环中
 *   单独平移过。若再次通过虚拟节点递归平移配偶，会造成配偶 X 被双倍平移（+2*dx）。
 */
function shiftNonMainSubtree(
  parentId: string,
  dx: number,
  nodePositions: Map<string, NodePosition>,
  childrenByParent: Map<string, string[]>,
  spouseByMain: Map<string, import('@/types/layout').LayoutEdge[]>,
  mainNodeIds: Set<string>,
  visited = new Set<string>(),
  nodeMap?: Map<string, LayoutNode>,
) {
  const children = childrenByParent.get(parentId) || [];
  for (const childId of children) {
    if (mainNodeIds.has(childId)) continue;
    // [W2 2026-09-01] 虚拟节点不进 shiftNonMainSubtree（避免双倍平移真实配偶）
    const childNode = nodeMap?.get(childId);
    if (childNode?.virtualSpouse) continue;
    if (visited.has(childId)) continue;
    visited.add(childId);

    const childPos = nodePositions.get(childId);
    if (childPos) childPos.x += dx;

    const childSpouseEdges = spouseByMain.get(childId) || [];
    for (const edge of childSpouseEdges) {
      const spouseId = edge.source === childId ? edge.target : edge.source;
      const spousePos = nodePositions.get(spouseId);
      if (spousePos) spousePos.x += dx;
      shiftNonMainSubtree(
        spouseId, dx, nodePositions, childrenByParent, spouseByMain, mainNodeIds,
        visited, nodeMap,
      );
    }

    shiftNonMainSubtree(
      childId, dx, nodePositions, childrenByParent, spouseByMain, mainNodeIds,
      visited, nodeMap,
    );
  }
}

// ==================== 整体居中平移 ====================

/**
 * 把整棵树平移到以 (0, 0) 为 bounds 中心
 *
 * 节点位置在阶段 15 调用：补偿之前所有阶段的累积偏移。
 */
export function shiftToCenter(
  nodePositions: Map<string, NodePosition>,
): number {
  const positions = Array.from(nodePositions.values());
  const bounds = getBoundingBox(positions);
  const contentWidth = bounds.maxX - bounds.minX;
  const offsetX = -bounds.minX - contentWidth / 2;

  for (const [, pos] of nodePositions) {
    pos.x += offsetX;
  }

  return offsetX;
}