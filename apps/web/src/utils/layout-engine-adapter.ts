/**
 * layout-engine-adapter.ts - 引擎选择与调度
 *
 * [W3 2026-09-01] LayoutEngine v6 第三阶段：根据节点数和配置选择合适的布局引擎，
 *   提供统一的 runLayoutEngine 入口。
 *
 * 引擎选择策略：
 * ```
 * if (engine === 'auto') {
 *   engineType = totalNodes <= threshold ? 'dagre' : 'elkjs'
 * } else {
 *   engineType = engine
 * }
 * ```
 *
 * Fallback 链（错误恢复）：
 * 1. elkjs worker 失败（CDN/WASM 加载失败）→ 回退到 dagre
 * 2. dagre 抛错（拓扑循环）→ 回退到 compactBox（@antv/hierarchy）
 * 3. compactBox 抛错（数据结构异常）→ 抛错给调用方
 *
 * 见 docs/dagre-vs-elkjs-selection.md。
 */

import type {
  LayoutNode,
  LayoutEdge,
  NodePosition,
  LayoutConfig,
} from '@/types/layout';
import { layoutWithDagre } from '@/utils/dagre-layout';
import { layoutWithElkjs } from '@/utils/elkjs-layout';
import { compactBox } from '@antv/hierarchy';
import type { HierarchyData, HierarchyNode } from '@antv/hierarchy';

export type LayoutEngineType = 'auto' | 'dagre' | 'elkjs' | 'compactBox';

export type ResolvedEngineType = 'dagre' | 'elkjs' | 'compactBox';

/**
 * 选择引擎（基于 totalNodes + config.engine + config.threshold）
 *
 * @param totalNodes 真实节点数（不含虚拟节点）
 * @param config LayoutConfig（读取 engine + threshold）
 * @returns 实际使用的引擎类型
 */
export function selectLayoutEngine(
  totalNodes: number,
  config: LayoutConfig,
): ResolvedEngineType {
  const engine = config.engine ?? 'auto';
  const threshold = config.engineThreshold ?? 1000;
  if (engine === 'auto') {
    return totalNodes <= threshold ? 'dagre' : 'elkjs';
  }
  return engine as ResolvedEngineType;
}

/**
 * 统一布局入口（含 fallback 链）
 *
 * 执行策略：
 * - 优先用 selectLayoutEngine 选出的引擎
 * - 失败时按 elkjs → dagre → compactBox 顺序回退
 * - compactBox 作为最终兜底（保证至少能产生布局结果）
 *
 * @param engineType 选定的引擎类型（来自 selectLayoutEngine）
 * @param virtualNodes 含虚拟节点的节点列表
 * @param virtualEdges 含虚拟边的边列表
 * @param config LayoutConfig
 * @returns Promise<Map<nodeId, NodePosition>> 节点位置
 */
export async function runLayoutEngine(
  engineType: ResolvedEngineType,
  virtualNodes: LayoutNode[],
  virtualEdges: LayoutEdge[],
  config: LayoutConfig,
): Promise<Map<string, NodePosition>> {
  // 构建 fallback 链：按 engine → 后续引擎顺序
  const chain: ResolvedEngineType[] = [engineType];
  if (engineType !== 'dagre') chain.push('dagre');
  if (engineType !== 'compactBox') chain.push('compactBox');

  let lastError: unknown = null;
  for (const engine of chain) {
    try {
      return await runSingleEngine(engine, virtualNodes, virtualEdges, config);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[W3 layout-engine-adapter] engine=${engine} failed:`, err);
      lastError = err;
    }
  }
  throw new Error(
    `[W3 layout-engine-adapter] all engines failed. last error: ${String(lastError)}`,
  );
}

/**
 * 单引擎调用（同步 dagre / 异步 elkjs / 同步 compactBox fallback）
 *
 * 注意：compactBox 是同步 API 但作为 Promise resolve 返回（与 elkjs API 一致），
 *   方便调用方统一 await。
 */
async function runSingleEngine(
  engine: ResolvedEngineType,
  virtualNodes: LayoutNode[],
  virtualEdges: LayoutEdge[],
  config: LayoutConfig,
): Promise<Map<string, NodePosition>> {
  if (engine === 'dagre') {
    return layoutWithDagre(virtualNodes, virtualEdges, config);
  }
  if (engine === 'elkjs') {
    return layoutWithElkjs(virtualNodes, virtualEdges, config);
  }
  // compactBox fallback：直接调用 @antv/hierarchy
  return runCompactBoxFallback(virtualNodes, virtualEdges, config);
}

/**
 * compactBox 兜底布局（从 v3-v5 保留）
 *
 * 仅作最终 fallback：当 elkjs + dagre 都失败时启用。
 * 复用 v3-v5 算法的核心思想，但用统一的 NodePosition 输出。
 */
function runCompactBoxFallback(
  virtualNodes: LayoutNode[],
  virtualEdges: LayoutEdge[],
  config: LayoutConfig,
): Map<string, NodePosition> {
  const nodeSep = typeof config.nodeSep === 'number' ? config.nodeSep : 24;
  const rankSep = typeof config.rankSep === 'number' ? config.rankSep : 48;
  const nodeMap = new Map<string, LayoutNode>();
  for (const n of virtualNodes) nodeMap.set(n.id, n);

  // 识别 spouse 节点（generation < 0 或被虚拟链映射的配偶）
  const spouseNodeIds = new Set<string>();
  for (const n of virtualNodes) {
    if ((n.generation ?? 0) < 0) spouseNodeIds.add(n.id);
  }
  // 双重身份：虚拟边 source 为非配偶、target 是 spouse 的情况已在 LayoutEngine 内处理
  // 此处保守地按 generation 识别即可（adapter 是 fallback 路径，不优化边界）

  // 构建 childrenByParent（跳过虚拟节点的 child）
  const childrenByParent = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  for (const e of virtualEdges) {
    if (e.kind !== 'parent-child') continue;
    const c = nodeMap.get(e.target);
    if (c?.virtualSpouse) continue; // 虚拟节点不进父表
    if (!childrenByParent.has(e.source)) childrenByParent.set(e.source, []);
    childrenByParent.get(e.source)!.push(e.target);
    parentOf.set(e.target, e.source);
  }

  // 找根节点
  const roots = virtualNodes.filter(
    (n) => !parentOf.has(n.id) && !spouseNodeIds.has(n.id) && !n.virtualSpouse,
  );

  const positions = new Map<string, NodePosition>();
  const visited = new Set<string>();

  const buildInput = (nodeId: string): HierarchyData | null => {
    if (visited.has(nodeId) || spouseNodeIds.has(nodeId)) return null;
    const node = nodeMap.get(nodeId);
    if (!node || node.virtualSpouse) return null;
    visited.add(nodeId);

    const sortedChildIds = [...(childrenByParent.get(nodeId) || [])].sort(
      (a, b) => {
        const ea = virtualEdges.find((e) => e.source === nodeId && e.target === a);
        const eb = virtualEdges.find((e) => e.source === nodeId && e.target === b);
        const oa = ea?.birthOrder;
        const ob = eb?.birthOrder;
        if (oa == null && ob == null) return 0;
        if (oa == null) return 1;
        if (ob == null) return -1;
        return oa - ob;
      },
    );

    const children = sortedChildIds
      .map((cid) => buildInput(cid))
      .filter((c): c is HierarchyData => c !== null);

    return {
      id: nodeId,
      width: config.nodeWidth,
      height: config.nodeHeight,
      hgap: nodeSep,
      vgap: rankSep,
      children: children.length > 0 ? children : undefined,
    };
  };

  for (const root of roots) {
    const input = buildInput(root.id);
    if (!input) continue;
    const laidOut = compactBox(input, {
      direction: 'TB',
      getWidth: () => config.nodeWidth,
      getHeight: () => config.nodeHeight,
      getHGap: () => nodeSep,
      getVGap: () => rankSep,
    });
    laidOut.eachNode((n: HierarchyNode) => {
      positions.set(n.id, {
        id: n.id,
        x: n.x + n.width / 2,
        y: n.y + n.height / 2,
        width: n.data.width ?? config.nodeWidth,
        height: n.data.height ?? config.nodeHeight,
      });
    });
  }

  return positions;
}