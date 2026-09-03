/**
 * layout-engine-prepare.ts — 数据准备阶段（独立模块）
 *
 * [§8.3 2026-09-03 拆分产物] 把 LayoutEngine.calculateLayout 的「virtualize + prepare」阶段
 *   抽到独立函数 prepareLayoutData。
 *
 * 抽出动机：
 * - layout-engine.ts 单文件 651 行（目标 ≤400）；virtualize + prepare 共 ~100 行
 *   是纯数据转换逻辑（virtualize + nodeMap + 邻接表 + 根节点 + 防御三连），
 *   与编排器主流程耦合度低，单独成文件更易维护。
 * - prepare 是无状态纯函数（除 metrics 入参用于错误记录），便于写单元测试。
 *
 * 阶段定义（W2 文档化）：
 * - [Phase: virtualize] spouse 边 → main → virt → spouseId 虚拟链转换
 *   详见 docs/spouse-virtual-node-model.md
 * - [Phase: prepare]    nodeMap + 父子邻接表 + 根节点 + 节点角色标注
 *   防御三连（A5/A6/A3）：
 *   - A5: 根节点缺失抛 LAYOUT_NO_ROOT_NODE
 *   - A6: 父子边存在环路抛 LAYOUT_CYCLE_DETECTED
 *   - A3: 节点角色标注（fill nodeRole，给下游 infer 用）
 */
import type { LayoutNode, LayoutEdge } from '@/types/layout';
import type { LayoutMetrics } from '@/utils/layout-metrics';
import { recordError } from '@/utils/layout-metrics';
import { LayoutEngineError } from '@/utils/layout-errors';
import { detectCycle } from '@/utils/tree-layout';
import { annotateNodeRoles } from '@/utils/layout-validators';
import { expandSpouseToVirtualNodes, buildSpouseToVirtual } from '@/utils/spouse-virtualizer';

/** prepare 阶段输出：下游 [2]~[14] phase 所需的全部数据结构 */
export interface PreparedLayoutData {
  /** 原始 spouse 边（用于配偶边路径阶段 [11]） */
  originalSpouseEdges: LayoutEdge[];
  /** 含虚拟节点的节点数组（用于 [3] 引擎主布局） */
  virtualNodes: LayoutNode[];
  /** 含虚拟边的边数组（用于 [3] 引擎主布局 / [8]~[9] 边路径） */
  virtualEdges: LayoutEdge[];
  /** 虚拟节点 ID → 真实配偶 ID 映射（用于 [10] collapse 阶段） */
  virtualToSpouse: Map<string, string>;
  /** 真实配偶 ID → 虚拟节点 ID 反向映射（用于 [5] spouseAttach） */
  spouseToVirtual: Map<string, string>;
  /** 节点查找表（含虚拟节点） */
  nodeMap: Map<string, LayoutNode>;
  /** 配偶节点 ID 集合（含 generation<0 + virtualToSpouse 双重身份） */
  spouseNodeIds: Set<string>;
  /** 父子邻接表（parent → children） */
  childrenByParent: Map<string, string[]>;
  /** child → parent 映射 */
  parentOf: Map<string, string>;
  /** 根节点列表（无父且非配偶节点） */
  roots: LayoutNode[];
}

/**
 * 数据准备：virtualize + prepare 合并执行
 *
 * @throws LayoutEngineError (LAYOUT_NO_ROOT_NODE / LAYOUT_CYCLE_DETECTED)
 */
export function prepareLayoutData(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  metrics: LayoutMetrics | null,
): PreparedLayoutData {
  // ========== Phase: virtualize ==========
  const originalSpouseEdges = edges.filter((e) => e.kind === 'spouse');
  const virtualized = expandSpouseToVirtualNodes(nodes, edges);
  const virtualNodes = virtualized.virtualNodes;
  const virtualEdges = virtualized.virtualEdges;
  const virtualToSpouse = virtualized.virtualToSpouse;
  const spouseToVirtual = buildSpouseToVirtual(virtualToSpouse);

  // ========== 1.1 节点查找表（含虚拟节点） ==========
  const nodeMap = new Map<string, LayoutNode>();
  for (const node of virtualNodes) {
    nodeMap.set(node.id, node);
  }

  // ========== 1.2 识别配偶节点 ==========
  //   双重身份：X 既是 P 的子又是 Y 的配偶（Y 可能是 gen=0 或其他非负值）。
  //   仅靠 generation<0 无法识别双重身份的配偶节点。
  const spouseNodeIds = new Set<string>();
  for (const node of nodes) {
    if ((node.generation ?? 0) < 0) spouseNodeIds.add(node.id);
  }
  for (const spouseId of virtualToSpouse.values()) {
    spouseNodeIds.add(spouseId);
  }

  // ========== 1.3 父子邻接表（用虚拟 edges） ==========
  const childrenByParent = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  for (const edge of virtualEdges) {
    if (edge.kind === 'spouse') continue;
    if (!childrenByParent.has(edge.source)) childrenByParent.set(edge.source, []);
    childrenByParent.get(edge.source)!.push(edge.target);
    parentOf.set(edge.target, edge.source);
  }

  // ========== 1.4 找根节点 ==========
  const roots = virtualNodes.filter(
    (n) => !parentOf.has(n.id) && !spouseNodeIds.has(n.id) && !n.virtualSpouse,
  );
  if (roots.length === 0) {
    const fallback = virtualNodes.find((n) => !spouseNodeIds.has(n.id) && !n.virtualSpouse);
    if (fallback) roots.push(fallback);
  }

  // ========== 防御三连（A5/A6/A3） ==========
  if (roots.length === 0) {
    if (metrics) {
      recordError(
        metrics,
        'LAYOUT_NO_ROOT_NODE',
        `No root node found in graph with ${nodes.length} node(s) and ${edges.length} edge(s).`,
      );
    }
    throw new LayoutEngineError(
      'LAYOUT_NO_ROOT_NODE',
      `No root node found in graph with ${nodes.length} node(s) and ${edges.length} edge(s).`,
      {
        nodeIds: nodes.map((n) => n.id).slice(0, 50),
        virtualNodeIds: virtualNodes.map((n) => n.id).slice(0, 50),
        spouseNodeIds: Array.from(spouseNodeIds).slice(0, 50),
        hint: '检查数据：所有节点都被标记为 spouse / virtualSpouse，或父子关系全部构成环路。',
      },
    );
  }

  // 环路检测：仅对 parent-child 边扫
  const cycleCheck = detectCycle(virtualEdges, nodeMap);
  if (cycleCheck.hasCycle) {
    if (metrics) {
      recordError(
        metrics,
        'LAYOUT_CYCLE_DETECTED',
        `parent-child edges contain a cycle: ${(cycleCheck.cyclePath ?? []).join(' → ')}`,
      );
    }
    throw new LayoutEngineError(
      'LAYOUT_CYCLE_DETECTED',
      `parent-child edges contain a cycle: ${(cycleCheck.cyclePath ?? []).join(' → ')}`,
      {
        cyclePath: cycleCheck.cyclePath,
        edgeCount: virtualEdges.length,
      },
    );
  }

  // 节点角色标注（fill nodeRole 字段）
  annotateNodeRoles(nodeMap, spouseNodeIds, childrenByParent);

  return {
    originalSpouseEdges,
    virtualNodes,
    virtualEdges,
    virtualToSpouse,
    spouseToVirtual,
    nodeMap,
    spouseNodeIds,
    childrenByParent,
    parentOf,
    roots,
  };
}