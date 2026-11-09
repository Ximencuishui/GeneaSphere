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
 * 线段停在卡片外缘，不向内缩。
 */

// ==================== 配偶边正交路径 ====================

/**
 * 计算配偶边正交路径（含婚姻汇聚点分岔）
 *
 * 在节点位置最终确定后调用（alignMainLineage / resolveSubtreeOverlap 之后）。
 * 工作坐标里配偶边从主节点右缘接到配偶。LR 转置回屏幕后，这条边变成从主节点下缘接到下方的配偶。
 * 多妻的错开在工作坐标里沿 Y，转置后沿 X。
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
/** 两张卡片外侧锚点之间的正交段。同高时是一条横线，错高时先竖后横。 */
export function connectAdjacentCards(
  fromRight: number,
  fromY: number,
  toLeft: number,
  toY: number,
): Point[] {
  if (Math.abs(fromY - toY) < 0.5) {
    return [
      { x: fromRight, y: fromY },
      { x: toLeft, y: toY },
    ];
  }
  return [
    { x: fromRight, y: fromY },
    { x: fromRight, y: toY },
    { x: toLeft, y: toY },
  ];
}

export function computeSpouseEdgePaths(
  nodePositions: Map<string, NodePosition>,
  spouseByMain: Map<string, LayoutEdge[]>,
  _config: LayoutConfig,
) {
  for (const [mainId, mainSpouseEdges] of spouseByMain) {
    const mainPos = nodePositions.get(mainId);
    if (!mainPos) continue;

    const chain = mainSpouseEdges
      .map((edge) => {
        const spouseId = edge.source === mainId ? edge.target : edge.source;
        const pos = nodePositions.get(spouseId);
        return pos && pos.width > 0 ? { edge, pos } : null;
      })
      .filter((item): item is { edge: LayoutEdge; pos: NodePosition } => !!item)
      .sort((a, b) => a.pos.x - b.pos.x || (a.edge.marriageOrder ?? 0) - (b.edge.marriageOrder ?? 0));

    // 工作坐标里妻子排在丈夫右侧。一段一段接在上一张卡片的右缘，
    // 看起来是一条横线穿过所有配偶，但线段在每张卡片边缘断开。
    // LR 转置后，这条横线变成从上到下的垂直总线。
    let prevRight = mainPos.x + mainPos.width / 2;
    let prevY = mainPos.y;
    for (const { edge, pos } of chain) {
      const left = pos.x - pos.width / 2;
      const points = connectAdjacentCards(prevRight, prevY, left, pos.y);
      edge.path = {
        points,
        type: 'orthogonal',
        junction: { x: prevRight, y: prevY },
        junctionGroup: `spouse-${mainId}`,
        doubleLine: true,
      };
      prevRight = pos.x + pos.width / 2;
      prevY = pos.y;
    }
  }
}