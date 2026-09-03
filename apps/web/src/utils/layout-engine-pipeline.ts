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
 *   [9]  edgePaths     computeOrthogonalEdgePaths
 *   [10] collapse      collapseVirtualNodes（W2 引入）
 *   [11] spouseEdgePaths computeSpouseEdgePaths + merge finalEdges
 *   [12] separation    resolveEdgeHorizontalOverlaps（仅当 config.edgeHorizontalSeparation > 0）
 *   [13] recenter      强制主脉 x=0（仅当 config.mainLineageCenter）
 *   [14] birthOrder    reorderSiblingsByBirthOrder（P2 修复）
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
  buildSpouseMap,
} from '@/utils/tree-layout';
import {
  computeOrthogonalEdgePaths,
  resolveEdgeHorizontalOverlaps,
  shiftEdgePathsX,
} from '@/utils/edge-router';
import { computeSpouseEdgePaths } from '@/utils/spouse-renderer';
import { collapseVirtualNodes } from '@/utils/spouse-virtualizer';
import { selectLayoutEngine, runLayoutEngine } from '@/utils/layout-engine-adapter';
import type { PreparedLayoutData } from '@/utils/layout-engine-prepare';

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
  const maxGeneration = computeMaxGeneration(childrenByParent, roots);
  const nodeSep =
    config.nodeSep === 'auto'
      ? computeAutoNodeSep(nodes.length, maxGeneration, config.nodeWidth, config.maxNodeSep ?? 80)
      : config.nodeSep;
  const rankSep = config.rankSep === 'auto' ? computeAutoRankSep(config.nodeHeight) : config.rankSep;
  endPhase(ctx, 'spacing', endSpacing);

  // ========== [3] engine ==========
  const endEngine = metrics ? beginPhase(metrics, 'engine') : null;
  const engineType = selectLayoutEngine(nodes.length, config);
  const positionsFromEngine = await runLayoutEngine(engineType, virtualNodes, virtualEdges, config);
  const nodePositions = new Map<string, NodePosition>();
  for (const [id, pos] of positionsFromEngine) nodePositions.set(id, pos);
  endPhase(ctx, 'engine', endEngine);

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

  // ========== [9] edgePaths ==========
  const endEdge = metrics ? beginPhase(metrics, 'edgePaths') : null;
  computeOrthogonalEdgePaths(nodePositions, virtualEdges, coupleUnitByMain, config.edgeInset);
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
  if (config.edgeHorizontalSeparation > 0) {
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

  // ========== [14] birthOrder ==========
  const endBirthOrder = metrics ? beginPhase(metrics, 'birthOrder') : null;
  reorderSiblingsByBirthOrder(realNodePositions, finalEdges, config);
  endPhase(ctx, 'birthOrder', endBirthOrder);

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
}