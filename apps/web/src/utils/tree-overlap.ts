/**
 * tree-overlap.ts - 子树外接矩形避让模块
 *
 * [Phase C 2026-09-02] LayoutEngine v6 重构收尾：从 tree-layout.ts 抽取子树避让
 *   相关纯函数，让原 806 行单体拆为三模块。
 *
 * 本模块负责（纯函数 + 闭包递归辅助）：
 * - 节点 AABB 碰撞避让（同代夫妻组间距 + 跨代相交，resolveSubtreeOverlap）
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
  CoupleUnit,
} from '@/types/layout';

// ==================== 子树外接矩形扫描线推开 ====================

interface HouseBox {
  id: string;
  y: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * 节点 AABB 避让。
 *
 * 工作坐标里兄弟沿 X、代际沿 Y。LR 屏幕坐标由流水线转置进来，这里仍只沿 X 推开，
 * 转置回屏幕后就是沿 Y 上下推开。配偶在工作坐标里排在主节点右侧，户宽已经含配偶；
 * 转置后这户宽变成 LR 里夫妻上下堆叠的总高度。
 *
 * 每一代从左到右只排一次。碰撞时只把这一户（主节点 + 配偶 + 其子孙）向右推到
 * 上一户的右缘之外，不再爬到共同祖先去推整支。共同祖先那一推在百人树上会
 * 互相制造新的碰撞，把兄弟轴拉到一万像素以上，停步时卡片仍然叠着。
 *
 * - 同一水平带（|Δy| ≤ 1.5）户与户之间留 nodeSep。
 * - 垂直区间相交的跨代卡片留 2px，避免两代卡片贴死。
 * - 已经分开的空隙保持原样，不把 dagre 的正常间距再压紧。
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
  const nodeMapForShift = nodeMapForVirtualCheck ?? nodeMap;
  const mainOfSpouse = new Map<string, string>();
  for (const [mainId, unit] of coupleUnitByMain) {
    for (const spouseId of unit.spouseIds) mainOfSpouse.set(spouseId, mainId);
  }
  for (const [mainId, edges] of spouseByMain) {
    for (const edge of edges) {
      const spouseId = edge.source === mainId ? edge.target : edge.source;
      if (!mainOfSpouse.has(spouseId)) mainOfSpouse.set(spouseId, mainId);
    }
  }

  const membersOf = (mainId: string): string[] => {
    const fromUnit = coupleUnitByMain.get(mainId)?.spouseIds;
    if (fromUnit && fromUnit.length > 0) return [mainId, ...fromUnit];
    const edges = spouseByMain.get(mainId) || [];
    const spouses = edges.map((edge) => (edge.source === mainId ? edge.target : edge.source));
    return [mainId, ...spouses];
  };

  const houseBox = (mainId: string): HouseBox | null => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let y = 0;
    let found = false;
    for (const member of membersOf(mainId)) {
      const pos = nodePositions.get(member);
      if (!pos || !(pos.width > 0) || !(pos.height > 0)) continue;
      if (member === mainId) y = pos.y;
      minX = Math.min(minX, pos.x - pos.width / 2);
      maxX = Math.max(maxX, pos.x + pos.width / 2);
      minY = Math.min(minY, pos.y - pos.height / 2);
      maxY = Math.max(maxY, pos.y + pos.height / 2);
      found = true;
    }
    if (!found) return null;
    const main = nodePositions.get(mainId);
    return { id: mainId, y: main?.y ?? y, minX, maxX, minY, maxY };
  };

  const yHits = (a: HouseBox, b: HouseBox) =>
    a.minY < b.maxY - 0.5 && b.minY < a.maxY - 0.5;

  const mains: { id: string; y: number }[] = [];
  for (const [id, pos] of nodePositions) {
    if (nodeMap.get(id)?.virtualSpouse) continue;
    if (!(pos.width > 0) || !(pos.height > 0)) continue;
    if (mainOfSpouse.has(id)) continue;
    mains.push({ id, y: pos.y });
  }
  mains.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));

  const bands: string[][] = [];
  for (const main of mains) {
    const band = bands[bands.length - 1];
    const anchor = band ? nodePositions.get(band[0]) : undefined;
    if (!band || !anchor || Math.abs(main.y - anchor.y) > 1.5) bands.push([main.id]);
    else band.push(main.id);
  }

  const placed: HouseBox[] = [];
  const crossGap = 2;
  for (const band of bands) {
    const houses = band
      .map((id) => houseBox(id))
      .filter((box): box is HouseBox => box !== null)
      .sort((a, b) => a.minX - b.minX || a.y - b.y);
    for (const house of houses) {
      let box = houseBox(house.id) ?? house;
      let need = -Infinity;
      for (const prev of placed) {
        if (!yHits(prev, box)) continue;
        const sameBand = Math.abs(prev.y - box.y) <= 1.5;
        need = Math.max(need, prev.maxX + (sameBand ? nodeSep : crossGap));
      }
      const dx = need - box.minX;
      if (dx > 0.5) {
        shiftSubtree(
          box.id,
          dx,
          nodePositions,
          childrenByParent,
          spouseByMain,
          coupleUnitByMain,
          undefined,
          nodeMapForShift,
        );
        box = houseBox(box.id) ?? box;
      }
      placed.push(box);
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
