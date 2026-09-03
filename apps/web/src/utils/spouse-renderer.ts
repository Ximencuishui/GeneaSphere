/**
 * spouse-renderer.ts - 配偶边正交路径模块
 *
 * [W1.4 2026-09-01] LayoutEngine v6 重构第四阶段：从 layout-engine.ts 抽取
 *   配偶边（spouse edge）相关的路径计算逻辑为模块级纯函数。
 *
 * 本模块负责：
 * - computeSpouseEdgePaths：配偶边正交路径（含婚姻汇聚点分岔）
 *   - junction X 锚定丈夫右边缘（A3 修复）
 *   - junction Y 按 marriageOrder 在垂直方向 stagger（P0 修复）
 *   - 端点内缩 EDGE_INSET = 4px 让线段落在卡片可见区
 *
 * 不在本模块范围：
 * - 节点位置计算（→ tree-layout.ts）
 * - 父子边正交路径（→ edge-router.ts）
 *
 * v6 设计要点：
 * - 所有函数为纯函数，无 this 引用，无隐藏状态
 * - config 作为参数显式传入
 * - spouseByMain 由编排器从 tree-layout.buildSpouseMap 阶段获得
 *
 * 与 edge-router 的协作：
 * - 本模块在 alignMainLineage / resolveSubtreeOverlap 之后调用
 * - 输出的 spouse edge.path 与 edge-router.computeOrthogonalEdgePaths 输出的
 *   parent-child edge.path 共用 resolveEdgeHorizontalOverlaps（来自 edge-router）做水平段错开
 */

import type {
  LayoutEdge,
  NodePosition,
  LayoutConfig,
  Point,
} from '@/types/layout';

// ==================== 模块常量 ====================

/**
 * 端点内缩常量：让配偶边端点落在卡片可见区域内
 *
 * 背景：G6 矩形节点带 border-radius（默认 8px），几何边缘与可见边缘存在偏差。
 * 这里统一把 spouse 边起点 / 终点从几何边缘向内缩 EDGE_INSET px。
 *
 * 与 edge-router.EDGE_INSET 保持一致（4px）。
 */
const EDGE_INSET = 4;

// ==================== 配偶边正交路径 ====================

/**
 * 计算配偶边正交路径（含婚姻汇聚点分岔）
 *
 * 在节点位置最终确定后调用（alignMainLineage / resolveSubtreeOverlap 之后）。
 *
 * [2026-08-27 P0 修复] 一夫多妻场景的水平段重叠
 *   旧实现：所有妻子共享同一 junction Y（rawJunctionY 经 spouseTopY/mainBottomY 钳制后），
 *     多位妻子在同一 Y 的水平段完全重合，违反 PRD §2.7.3 第 5 条「同层边水平段错开」。
 *   修复：对每位妻子按 marriageOrder 沿垂直方向 stagger 分配独立 junction Y，
 *     从源头保证每位妻子的水平段落在不同 Y 层。
 *
 * [2026-08-28 A3 修复] junction X 从丈夫中心改为丈夫右边缘
 *   旧实现：junction.x = mainPos.x（丈夫中心 X），spouse 边起点也是 mainPos.x，
 *     路径需要"从中心偏上 16px 处"走到妻子中心，垂直段落在主节点内部，
 *     视觉上"穿卡而过"，与"夫妻一线连"的传统走线习惯不符。
 *   新实现：junction.x = mainPos.x + mainPos.width/2（丈夫右边缘 X），
 *     spouse 边起点也是 mainRightX，路径变为[mainRightX → junctionY → 妻子中心 → 妻子顶]，
 *     junction 起点紧贴丈夫底右侧（junctionOffset=0），仅一夫多妻场景下
 *     junctionY 沿垂直方向 stagger 使多条水平段错开。
 *
 * [2026-08-31 修复] 端点内缩：
 *   起点 / 终点从几何边缘向内缩 EDGE_INSET = 4px，避免 border-radius=8 导致视觉悬空。
 *
 * @param nodePositions  当前所有节点位置（含已对齐后的主节点 + 配偶节点）
 * @param spouseByMain   mainId → 配偶边列表（来自 tree-layout.buildSpouseMap）
 * @param config         布局配置（读 marriageJunctionOffset、edgeHorizontalSeparation）
 */
export function computeSpouseEdgePaths(
  nodePositions: Map<string, NodePosition>,
  spouseByMain: Map<string, LayoutEdge[]>,
  config: LayoutConfig,
) {
  // [2026-08-28 A3] junctionOffset 默认从 16 改为 0，
  //   让 junction 紧贴丈夫底（mainBottomY），spouse 边的水平段成为纯水平直线。
  const junctionOffset = config.marriageJunctionOffset ?? 0;
  // [2026-08-27 P0 修复] 同一丈夫的多位妻子 junction Y 的垂直错开间距
  const verticalGap = config.edgeHorizontalSeparation ?? 10;
  // [2026-08-31 修复] 端点内缩常量：让牵引线端点落在卡片可见区域内。
  //   使用模块常量 EDGE_INSET，与 edge-router 保持一致。
  // const EDGE_INSET_LOCAL = EDGE_INSET; // 显式引用模块常量，便于阅读

  for (const [mainId, mainSpouseEdges] of spouseByMain) {
    const mainPos = nodePositions.get(mainId);
    if (!mainPos) continue;

    const sorted = [...mainSpouseEdges].sort(
      (a, b) => (a.marriageOrder ?? 0) - (b.marriageOrder ?? 0),
    );

    const mainBottomY = mainPos.y + mainPos.height / 2;
    // [2026-08-28 A3] junction X 锚定到丈夫右边缘（供 G6 内部参考 / 测试断言），
    //   注意：path 起点 X 实际值使用 mainRightXInset（见下方），junction 不直接参与渲染。
    const mainRightX = mainPos.x + mainPos.width / 2;
    // [2026-08-31 修复] 端点内缩：让 path 起点 / 终点落在卡片可见区域内，
    //   避免因 border-radius=8 导致线段末端"悬空"在圆角区域外。
    const mainRightXInset = mainRightX - EDGE_INSET;
    // junctionY 初始值：丈夫底边缘 - junctionOffset（保持 A3 兼容）
    const rawJunctionY = mainBottomY - junctionOffset;

    // [2026-08-27 P0 修复] 先收集每位妻子的「自然」junction Y（未经错开）。
    // 同代妻子若都位于同一 Y（positionSpouseNodes 默认把妻子 y=mainPos.y），
    // 它们的 naturalJunctionY 会相等，必须错开。
    interface JunctionCandidate {
      edge: LayoutEdge;
      spousePos: NodePosition;
      spouseTopY: number;
      naturalJunctionY: number;
    }
    const candidates: JunctionCandidate[] = [];
    for (const edge of sorted) {
      const spouseId = edge.source === mainId ? edge.target : edge.source;
      const spousePos = nodePositions.get(spouseId);
      if (!spousePos) continue;
      // [2026-08-31 修复] 妻子顶点考虑 EDGE_INSET 内缩，让终点落在配偶节点可见区。
      //   使用模块常量 EDGE_INSET（4px），与 edge-router 保持一致。
      const spouseTopY = spousePos.y - spousePos.height / 2 + EDGE_INSET;
      const naturalJunctionY = Math.max(
        spouseTopY,
        Math.min(mainBottomY, rawJunctionY),
      );
      candidates.push({
        edge,
        spousePos,
        spouseTopY,
        naturalJunctionY,
      });
    }

    // [2026-08-27 P0 修复] 按 naturalJunctionY 分组，组内按 marriageOrder stagger。
    // 关键约束：jY ∈ [spouseTopY, mainBottomY - 2]，
    // 超出此区间的偏移会被钳制，但至少保证视觉上彼此分离 verticalGap px。
    const assignedJunctionY = new Map<string, number>();
    // 按 (junction Y rounded, spouseTopY) 二元组分组；同组内 stagger
    const groupKey = (c: JunctionCandidate) =>
      `${Math.round(c.naturalJunctionY)}_${Math.round(c.spouseTopY)}`;
    const groups = new Map<string, JunctionCandidate[]>();
    for (const c of candidates) {
      const key = groupKey(c);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    for (const [, group] of groups) {
      if (group.length === 1) {
        assignedJunctionY.set(group[0].edge.id, group[0].naturalJunctionY);
        continue;
      }
      // 多个候选人共享同一组：按 marriageOrder 索引居中分配 junction Y。
      // group[i].junctionY = naturalJunctionY + (i - (n-1)/2) * verticalGap
      // 这样保证组内 jY 间距 = verticalGap，且整体相对 naturalJunctionY 对称。
      const n = group.length;
      for (let i = 0; i < n; i++) {
        const c = group[i];
        const offset = (i - (n - 1) / 2) * verticalGap;
        let jY = c.naturalJunctionY + offset;
        // 钳制在合法区间：spouseTopY ≤ jY ≤ mainBottomY - 2
        // 否则路径会与节点边界相交
        jY = Math.max(c.spouseTopY, Math.min(mainBottomY - 2, jY));
        assignedJunctionY.set(c.edge.id, jY);
      }
    }

    for (const edge of sorted) {
      const jY = assignedJunctionY.get(edge.id);
      if (jY === undefined) continue;
      const spouseId = edge.source === mainId ? edge.target : edge.source;
      const c = candidates.find(x => x.edge.id === edge.id);
      if (!c) continue;

      const sourceIsMain = edge.source === mainId;
      // [2026-08-28 A3] path 起点/终点从 mainPos.x（丈夫中心）改为 mainRightX（丈夫右边缘），
      //   退化为主节点右边缘 → junctionY → 妻子中心 → 妻子顶 三个拐点的阶梯状路径，
      //   junctionOffset=0 时 junctionY=mainBottomY，阶梯退化为两点水平直线。
      // [2026-08-31 修复] path 实际端点使用 mainRightXInset（主节点内缩 4px），
      //   让线段起点落在主节点可见区域内，避免 border-radius=8 导致视觉「未接到」。
      //   junction 仍记录 mainRightX（与 A3 测试断言兼容）。
      // [2026-08-28 优化] 当 jY === mainBottomY 或 jY === spouseTopY 时，
      //   跳过重合的中间点，让 path 退化为 2 点水平直线（避免 G6 渲染不必要的拐点）。
      const sameAsMainBottom = Math.abs(jY - mainBottomY) < 0.5;
      const sameAsSpouseTop = Math.abs(jY - c.spouseTopY) < 0.5;
      // 起点 X：内缩后的主节点右边缘
      const startX = mainRightXInset;
      let points: Point[];
      if (sameAsMainBottom || sameAsSpouseTop) {
        // 主节点与配偶节点同 Y（或极接近）：退化为两点水平直线
        points = sourceIsMain
          ? [
              { x: startX, y: jY },
              { x: c.spousePos.x, y: jY },
            ]
          : [
              { x: c.spousePos.x, y: jY },
              { x: startX, y: jY },
            ];
      } else {
        points = sourceIsMain
          ? [
              { x: startX, y: mainBottomY },
              { x: startX, y: jY },
              { x: c.spousePos.x, y: jY },
              { x: c.spousePos.x, y: c.spouseTopY },
            ]
          : [
              { x: c.spousePos.x, y: c.spouseTopY },
              { x: c.spousePos.x, y: jY },
              { x: startX, y: jY },
              { x: startX, y: mainBottomY },
            ];
      }
      edge.path = {
        points,
        type: 'orthogonal',
        junction: { x: mainRightX, y: jY },
      };
    }
  }
}