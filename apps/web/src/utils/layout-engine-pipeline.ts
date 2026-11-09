/**
 * layout-engine-pipeline.ts — LayoutEngine 编排器流水线（独立模块）
 *
 * [§8.3 2026-09-03 拆分产物] 把 LayoutEngine.calculateLayout 的 14 阶段流水线
 *   从「prepare」之后的所有阶段抽到独立函数 runLayoutPipeline。
 *
 * 抽出动机：
 * - layout-engine.ts 单文件 578 行（目标 ≤400）；calculateLayout 主体（含 14 phase）
 *   ~340 行，把 prepare 之后的 phase 抽到独立模块后，编排器类本身只剩调度逻辑。
 * - 每个 phase 的核心算法已下沉到三模块（tree-layout / edge-router / spouse-renderer），
 *   本文件只是「按顺序调用 + metrics 记录 + 编排决策（如 config.mainLineageCenter）」。
 *
 * 流水线（W2 文档化）：
 *   [2]  spacing       nodeSep / rankSep / maxGeneration
 *   [3]  engine        dagre / elkjs / compactBox（adapter 调度）
 *   [4]  spouseMap     buildSpouseMap
 *   [5]  spouseAttach  positionSpouseNodes（仅当 config.spouseOptimization）
 *   [6]  align         alignMainLineage（仅当 config.mainLineageCenter）
 *   [7]  subtreeOverlap resolveSubtreeOverlap（仅当 config.resolveSubtreeOverlap）
 *   [8]  center        shiftToCenter + shiftEdgePathsX
 *   [9]  birthOrder    reorderSiblingsByBirthOrder（必须在任何 edge.path 之前）
 *   [10] edgePaths     computeOrthogonalEdgePaths
 *   [11] collapse      collapseVirtualNodes（W2 引入）
 *   [12] spouseEdgePaths computeSpouseEdgePaths + merge finalEdges
 *   [13] separation    resolveEdgeHorizontalOverlaps（仅当 config.edgeHorizontalSeparation > 0）
 *   [14] recenter      强制主脉 x=0（仅当 config.mainLineageCenter）
 *
 * 注意：cache 写入 + meta 填充 + 累计统计由 LayoutEngine.calculateLayout 统一处理。
 */
import type {
  LayoutNode,
  LayoutEdge,
  LayoutResult,
  NodePosition,
  LayoutConfig,
  CoupleUnit,
} from '@/types/layout';
import type { LayoutMetrics } from '@/utils/layout-metrics';
import type { HookContext } from '@/utils/layout-engine-hooks';
import { endPhase } from '@/utils/layout-engine-hooks';
import { beginPhase } from '@/utils/layout-metrics';
import {
  computeAutoNodeSep,
  computeAutoRankSep,
  computeMaxGeneration,
  positionSpouseNodes,
  alignMainLineage,
  resolveSubtreeOverlap,
  shiftToCenter,
  getBoundingBox,
  reorderSiblingsByBirthOrder,
  packSubtreesByBirthOrder,
  buildSpouseMap,
} from '@/utils/tree-layout';
import {
  computeOrthogonalEdgePaths,
  clampOrthogonalPathsOutsideCards,
  markOrthogonalBridges,
  resolveEdgeHorizontalOverlaps,
  shiftEdgePathsX,
} from '@/utils/edge-router';
import { computeSpouseEdgePaths } from '@/utils/spouse-renderer';
import { collapseVirtualNodes } from '@/utils/spouse-virtualizer';
import { selectLayoutEngine, runLayoutEngine } from '@/utils/layout-engine-adapter';
import type { PreparedLayoutData } from '@/utils/layout-engine-prepare';
import { assertParentChildEdgeEndpoints, logLayoutAlignment } from '@/utils/tree-align-debug';
import {
  normalizeLayoutDirection,
  transposeEdgePaths,
  transposeNodeSizes,
  transposePositions,
} from '@/utils/layout-direction';

export interface PipelineOutput {
  result: LayoutResult;
  /** 引擎类型 / 宽树标记 写入到 metrics */
  engineUsed: 'dagre' | 'elkjs' | 'compactBox';
  wideTree: boolean;
}

/**
 * 编排器流水线：从 spacing 到 birthOrder 的全部 phase
 *
 * @param prepared    prepareLayoutData 返回值
 * @param edges       原始 edges（用于 buildSpouseMap 和 result.totalNodes）
 * @param nodes       原始 nodes（用于 result.totalNodes）
 * @param config      LayoutConfig
 * @param metrics     LayoutMetrics（用于 beginPhase/endPhase 计时）
 * @param ctx         HookContext（用于慢路径钩子）
 * @param coupleUnitByMain 跨模块共享状态（§5.3 CoupleUnit 共享模式）
 */
export async function runLayoutPipeline(
  prepared: PreparedLayoutData,
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  config: LayoutConfig,
  metrics: LayoutMetrics | null,
  ctx: HookContext,
  coupleUnitByMain: Map<string, CoupleUnit>,
): Promise<PipelineOutput> {
  const {
    originalSpouseEdges,
    virtualNodes,
    virtualEdges,
    virtualToSpouse,
    spouseToVirtual,
    nodeMap,
    spouseNodeIds,
    childrenByParent,
    roots,
  } = prepared;

  // ========== [2] spacing ==========
  const endSpacing = metrics ? beginPhase(metrics, 'spacing') : null;
  const direction = normalizeLayoutDirection(config.layoutDirection);
  const maxGeneration = computeMaxGeneration(childrenByParent, roots);
  // 兄弟轴上的卡片尺寸：TB 用宽，LR 用高。代际轴相反。
  const siblingExtent = direction === 'LR' ? config.nodeHeight : config.nodeWidth;
  const rankExtent = direction === 'LR' ? config.nodeWidth : config.nodeHeight;
  const nodeSep =
    config.nodeSep === 'auto'
      ? computeAutoNodeSep(nodes.length, maxGeneration, siblingExtent, config.maxNodeSep ?? 80)
      : config.nodeSep;
  const rankSep = config.rankSep === 'auto' ? computeAutoRankSep(rankExtent) : config.rankSep;
  endPhase(ctx, 'spacing', endSpacing);

  let nodeSizesSwapped = false;
  const restoreNodeSizes = () => {
    if (!nodeSizesSwapped) return;
    transposeNodeSizes(nodeMap.values());
    nodeSizesSwapped = false;
  };

  // ========== [3] engine ==========
  const endEngine = metrics ? beginPhase(metrics, 'engine') : null;
  const engineType = selectLayoutEngine(nodes.length, config);
  const positionsFromEngine = await runLayoutEngine(engineType, virtualNodes, virtualEdges, config);
  const nodePositions = new Map<string, NodePosition>();
  for (const [id, pos] of positionsFromEngine) nodePositions.set(id, pos);
  endPhase(ctx, 'engine', endEngine);

  // LR 引擎输出已经是屏幕坐标（代际 X、兄弟 Y）。
  // 后面的配偶贴附、避让、正交边都写在工作坐标里（代际 Y、兄弟 X），
  // 所以先转置进去，整条流水线结束再转置回屏幕。
  if (direction === 'LR') {
    transposePositions(nodePositions.values());
    transposeNodeSizes(nodeMap.values());
    nodeSizesSwapped = true;
  }

  try {
  // ========== [4] spouseMap ==========
  const endSpouseMap = metrics ? beginPhase(metrics, 'spouseMap') : null;
  const spouseByMain = buildSpouseMap(edges, spouseNodeIds);
  endPhase(ctx, 'spouseMap', endSpouseMap);

  // ========== [5] spouseAttach ==========
  const endSpouseAttach = metrics ? beginPhase(metrics, 'spouseAttach') : null;
  if (config.spouseOptimization) {
    positionSpouseNodes(
      nodePositions, nodeMap, spouseByMain, virtualEdges,
      childrenByParent, config, rankSep, nodeSep,
      coupleUnitByMain, spouseToVirtual,
    );
  }
  endPhase(ctx, 'spouseAttach', endSpouseAttach);

  // ========== [6] align ==========
  const endAlign = metrics ? beginPhase(metrics, 'align') : null;
  if (config.mainLineageCenter) {
    alignMainLineage(
      nodePositions, nodeMap, spouseByMain, childrenByParent,
      coupleUnitByMain, nodeMap,
    );
  }
  endPhase(ctx, 'align', endAlign);

  // ========== [7] subtreeOverlap ==========
  const endOverlap = metrics ? beginPhase(metrics, 'subtreeOverlap') : null;
  if (config.resolveSubtreeOverlap) {
    resolveSubtreeOverlap(
      nodePositions, nodeMap, childrenByParent, spouseByMain,
      coupleUnitByMain, nodeSep, nodeMap,
    );
  }
  endPhase(ctx, 'subtreeOverlap', endOverlap);

  // ========== [8] center ==========
  const endCenter = metrics ? beginPhase(metrics, 'center') : null;
  const offsetX = shiftToCenter(nodePositions);
  shiftEdgePathsX(virtualEdges, offsetX);
  endPhase(ctx, 'center', endCenter);

  // 第二次 reorderSiblingsByBirthOrder。shiftToCenter 是全体同一偏移，不改变兄弟相对间距，
  // 不是这次调用的理由。第一次在 layoutWithDagre 末尾，早于配偶贴附、主脉对齐、子树避让；
  // 这三步会再次挪动 X。正交边紧跟本次调用，必须读到最终出生序，所以居中后这一次保留。
  const endBirthOrder = metrics ? beginPhase(metrics, 'birthOrder') : null;
  reorderSiblingsByBirthOrder(nodePositions, virtualEdges, config);
  endPhase(ctx, 'birthOrder', endBirthOrder);

  // 出生序重排只保证同父兄弟的中心距，不管跨代卡片是否相交。
  // 正交边要读最终坐标，所以避让放在走线之前再做一遍。
  if (config.resolveSubtreeOverlap) {
    resolveSubtreeOverlap(
      nodePositions, nodeMap, childrenByParent, spouseByMain,
      coupleUnitByMain, nodeSep, nodeMap,
    );
  }

  // 避让可能把子孙单独推开。走线前再按排行收拢子树，并把父节点拉到子女中心。
  // 收拢之后同代卡片可能重新贴上（比如继子女子树比妻子槽更宽），再推开一次。
  // 这次推的是整户，父亲和子女一起动，正上正下的关系还在。
  packSubtreesByBirthOrder(
    nodePositions,
    virtualEdges,
    nodeMap,
    spouseByMain,
    coupleUnitByMain,
    childrenByParent,
    nodeSep,
  );
  if (config.resolveSubtreeOverlap) {
    resolveSubtreeOverlap(
      nodePositions, nodeMap, childrenByParent, spouseByMain,
      coupleUnitByMain, nodeSep, nodeMap,
    );
  }

  // ========== [9] edgePaths ==========
  const endEdge = metrics ? beginPhase(metrics, 'edgePaths') : null;
  computeOrthogonalEdgePaths(
    nodePositions,
    virtualEdges,
    coupleUnitByMain,
    config.edgeInset,
    { mode: config.edgeRouting === 'traditional' ? 'traditional' : 'modern' },
  );
  endPhase(ctx, 'edgePaths', endEdge);

  // ========== [10] collapse ==========
  const endCollapse = metrics ? beginPhase(metrics, 'collapse') : null;
  const collapsed = collapseVirtualNodes(
    { nodes: Array.from(nodePositions.values()), edges: virtualEdges },
    virtualToSpouse,
  );
  endPhase(ctx, 'collapse', endCollapse);

  // ========== [11] spouseEdgePaths ==========
  const endSpouseEdge = metrics ? beginPhase(metrics, 'spouseEdgePaths') : null;
  const realNodePositions = new Map<string, NodePosition>(
    collapsed.nodes.map((n) => [n.id, n]),
  );
  computeSpouseEdgePaths(realNodePositions, spouseByMain, config);

  // 把 spouse 边 path 从 spouseByMain 收集 + merge 到 finalEdges
  const finalEdges: LayoutEdge[] = [...collapsed.edges];
  for (const [, mainSpouseEdges] of spouseByMain) {
    for (const edge of mainSpouseEdges) {
      if (!finalEdges.find((e) => e.id === edge.id)) finalEdges.push(edge);
    }
  }
  // 保留 originalSpouseEdges 引用（spouse-renderer 已写回 path）
  void originalSpouseEdges;
  endPhase(ctx, 'spouseEdgePaths', endSpouseEdge);

  // ========== [12] separation ==========
  const endSeparation = metrics ? beginPhase(metrics, 'separation') : null;
  if (config.edgeRouting !== 'traditional' && config.edgeHorizontalSeparation > 0) {
    resolveEdgeHorizontalOverlaps(finalEdges, config);
  }
  endPhase(ctx, 'separation', endSeparation);

  // ========== [13] recenter ==========
  const endRecenter = metrics ? beginPhase(metrics, 'recenter') : null;
  if (config.mainLineageCenter) {
    const mainXValues: number[] = [];
    for (const [id, node] of nodeMap) {
      if (node.isMainLineage && (node.generation ?? 0) >= 0 && !node.virtualSpouse) {
        const pos = realNodePositions.get(id);
        if (pos) mainXValues.push(pos.x);
      }
    }
    if (mainXValues.length > 0) {
      const mainAvgX = mainXValues.reduce((a, b) => a + b, 0) / mainXValues.length;
      if (Math.abs(mainAvgX) > 1) {
        for (const [, pos] of realNodePositions) pos.x -= mainAvgX;
        shiftEdgePathsX(finalEdges, -mainAvgX);
      }
    }
  }
  endPhase(ctx, 'recenter', endRecenter);

  // 古谱保留横担交叉，不钳线、不拱桥。现代模式才把线段推出卡片并标记桥接点。
  if (config.edgeRouting !== 'traditional') {
    clampOrthogonalPathsOutsideCards(collapsed.nodes, finalEdges);
    markOrthogonalBridges(finalEdges);
  }

  logLayoutAlignment(realNodePositions, finalEdges, nodeMap, coupleUnitByMain);
  assertParentChildEdgeEndpoints(realNodePositions, finalEdges);

  // 工作坐标转回屏幕：配偶的 X+ 变成 Y+，避让的 X 推移变成 Y 推移，
  // 向下的父子边变成从右侧向右接入左侧。
  if (direction === 'LR') {
    transposePositions(collapsed.nodes);
    transposeEdgePaths(finalEdges);
  }

  logLayoutExtents(direction, collapsed.nodes);

  // ========== 组装 result ==========
  const finalBounds = getBoundingBox(collapsed.nodes);
  const result: LayoutResult = {
    nodes: collapsed.nodes,
    edges: finalEdges,
    bounds: finalBounds,
    generations: maxGeneration + 1,
    totalNodes: nodes.length,
  };

  return {
    result,
    engineUsed: engineType,
    wideTree: false, // 由 autoFit 阶段回写到 metrics；此处不强制
  };
  } finally {
    restoreNodeSizes();
  }
}

/** 开发时打印节点坐标极值，用来确认 LR 兄弟轴没有再被拉爆。测试里不打。 */
function logLayoutExtents(direction: 'TB' | 'LR', nodes: NodePosition[]) {
  let dev = false;
  try {
    const env = import.meta.env;
    dev = Boolean(env?.DEV) && env?.MODE !== 'test' && !env?.VITEST;
  } catch {
    dev = false;
  }
  if (!dev) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const node of nodes) {
    if (!(node.width > 0) || !(node.height > 0)) continue;
    count += 1;
    minX = Math.min(minX, node.x - node.width / 2);
    maxX = Math.max(maxX, node.x + node.width / 2);
    minY = Math.min(minY, node.y - node.height / 2);
    maxY = Math.max(maxY, node.y + node.height / 2);
  }
  if (!count) return;
  console.log(
    `[layout:${direction}] nodes=${count} spanX=${Math.round(maxX - minX)} spanY=${Math.round(maxY - minY)} ` +
    `x=[${Math.round(minX)},${Math.round(maxX)}] y=[${Math.round(minY)},${Math.round(maxY)}]`,
  );
}