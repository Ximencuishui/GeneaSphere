/**
 * spouse-virtualizer.ts - spouse 边虚拟节点化模块
 *
 * [W2 2026-09-01] LayoutEngine v6 第二阶段：把 spouse edge 在 in-memory 层
 *   转换为「虚拟 parent-child」链，让 dagre/elkjs 等通用 DAG 布局器可直接消费。
 *
 * 转换契约：
 *   输入：edges 含 spouse 边（kind='spouse'）
 *   输出：virtualEdges 全是 parent-child 类型，spouse 边信息映射保留在 spouseEdgeMap
 *
 * 虚拟节点 ID 命名：`__virt_w_<mainId>_<spouseId>`
 *   - 前缀 `__virt_` 避免与真实 ID 冲突
 *   - `_w_` 表示这是 spouse 边（`w` = wife/spouse）
 *   - 两端 id 用 `_` 连接，需要转义原始 id 中的 `_`
 *
 * 边界场景（函数内部统一处理）：
 *   - 双重身份（X 既是 P 的子又是 Y 的配偶）：X 的 P→X 真实父子不变；
 *     X→Y 的 spouse 边独立生成虚拟链 X→virt→Y
 *   - 兄弟共妻（H1、H2 共 W）：每条 spouse 边独立虚拟链
 *     H1→virt1→W，H2→virt2→W；W 在 DAG 中有两个父（通过虚拟节点）
 *   - 连襟（兄弟各婚不同配偶）：每条独立虚拟链，互不影响
 *
 * 虚拟节点属性：width=0, height=0, virtualSpouse=true，不参与渲染
 * 虚拟边属性：kind='parent-child' + fromVirtualSpouse=true 标记
 *
 * 见 docs/spouse-virtual-node-model.md。
 */

import type {
  LayoutNode,
  LayoutEdge,
  NodePosition,
} from '@/types/layout';

// ==================== 公共接口 ====================

/**
 * expandSpouseToVirtualNodes 输出
 */
export interface VirtualizedGraph {
  /** 包含虚拟节点的完整节点列表（原始节点 + 虚拟节点） */
  virtualNodes: LayoutNode[];
  /** 包含虚拟边的边列表（原始 parent-child + 展开后的 parent-child，spouse 已转换） */
  virtualEdges: LayoutEdge[];
  /**
   * spouse 边 → 虚拟边映射表
   *
   * key = 原始 spouse 边 id（如 'e-fw1'）
   * value = 展开后的虚拟边 id（mainId → virtualSpouseId）
   *
   * 用于：
   * 1. LayoutEngine 在 collapse 后，把虚拟边 path 还原为 spouse 边 path
   * 2. 渲染层判断 spouse 边的视觉渲染
   */
  spouseEdgeMap: Map<string, string>;
  /**
   * 虚拟节点 id → 真实 spouse id 映射表
   *
   * key = 虚拟节点 id（如 '__virt_w_F_W1'）
   * value = 真实配偶 id（如 'W1'）
   *
   * collapse 时用于把虚拟节点位置映射回真实配偶。
   */
  virtualToSpouse: Map<string, string>;
}

/**
 * collapseVirtualNodes 输出（与 LayoutResult 同形）
 */
export interface CollapsedLayout {
  /** 不含虚拟节点的 NodePosition 列表 */
  nodes: NodePosition[];
  /** 不含虚拟边的 edges 数组（spouse 边信息保留） */
  edges: LayoutEdge[];
  /**
   * 虚拟节点 id → 真实配偶 NodePosition 的映射
   *
   * 用于 spouse-renderer 从虚拟节点 X 推导 spouse 边 junction X。
   */
  virtualToSpousePos: Map<string, NodePosition>;
}

// ==================== expand ====================

/**
 * 将 spouse 边展开为虚拟 parent-child 链
 *
 * 算法：
 * 1. 遍历 edges，找出所有 spouse 边
 * 2. 对每条 spouse 边，根据 source/target 是否为配偶节点（generation<0）识别 mainId 和 spouseId
 * 3. 创建虚拟节点 `__virt_w_<mainId>_<spouseId>`（width=0, height=0）
 * 4. 替换原 spouse 边为两条 parent-child 边：
 *    a) mainId → virtualSpouseId（标记 fromVirtualSpouse=true）
 *    b) virtualSpouseId → spouseId（普通 parent-child）
 *
 * 边界场景处理：
 * - 双重身份：如果 mainId 本身已是配偶节点（generation<0），仍按 spouse 边展开；
 *   即双重身份节点既作为 P 的真实子（保留 parent-child 边），
 *   又作为另一节点的配偶（虚拟链），两条边互不干扰
 * - 兄弟共妻：每条 spouse 边独立虚拟链，互不影响
 * - 连襟：每条 spouse 边独立虚拟链
 *
 * @param nodes 原始节点列表（不变）
 * @param edges 原始边列表（含 spouse 边）
 * @returns VirtualizedGraph
 */
export function expandSpouseToVirtualNodes(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
): VirtualizedGraph {
  const virtualNodes: LayoutNode[] = [...nodes];
  const virtualEdges: LayoutEdge[] = [];
  const spouseEdgeMap = new Map<string, string>();
  const virtualToSpouse = new Map<string, string>();

  // 识别配偶节点
  // 两种识别方式互补：
  // 1. generation < 0：传统的"外部配偶"标记（GenealogyTree.vue 用此区分）
  // 2. gender === 'female' 且出现在 spouse 边的端点：处理双重身份场景（如 X 既是 P 的子又是 Y 的配偶）
  //   此时 X 可能是 main（男）或 spouse（女），取决于另一端的 gender
  // 我们按"节点列表 + generation < 0"先建立 spouseNodeIds 集合；
  // 对于双重身份（即一端 generation<0、另一端不是），仍按 generation 区分；
  // 对于两端都 generation>=0 的 spouse 边（理论上不应存在，兜底走 gender 识别）。
  const spouseNodeIds = new Set<string>();
  for (const node of nodes) {
    if ((node.generation ?? 0) < 0) {
      spouseNodeIds.add(node.id);
    }
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // 跳过虚拟化的虚拟边 id 计数器（确保 id 唯一）
  let virtualEdgeCounter = 0;

  for (const edge of edges) {
    if (edge.kind !== 'spouse') {
      virtualEdges.push(edge);
      continue;
    }

    // 识别 mainId 与 spouseId
    // 优先级：
    //   a) 一端 generation<0 → 另一端为 mainId（传统配偶节点）
    //   b) 一端 gender='male' → 另一端为 mainId（双重身份兜底）
    //   c) 两端都不是 → 兜底按 source 为 main
    const sourceIsSpouse = spouseNodeIds.has(edge.source);
    const targetIsSpouse = spouseNodeIds.has(edge.target);
    let mainId: string;
    let spouseId: string;
    if (sourceIsSpouse && !targetIsSpouse) {
      mainId = edge.target;
      spouseId = edge.source;
    } else if (targetIsSpouse && !sourceIsSpouse) {
      mainId = edge.source;
      spouseId = edge.target;
    } else if (!sourceIsSpouse && !targetIsSpouse) {
      // 兜底：两端都是 main 节点（双重身份场景，generation 都 ≥ 0）
      // 用 gender 区分：男性为 main，女性为 spouse
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      if (sourceNode?.gender === 'male' && targetNode?.gender === 'female') {
        mainId = edge.source;
        spouseId = edge.target;
      } else if (targetNode?.gender === 'male' && sourceNode?.gender === 'female') {
        mainId = edge.target;
        spouseId = edge.source;
      } else {
        // 兜底：source 为 main
        mainId = edge.source;
        spouseId = edge.target;
      }
    } else {
      // 边界：两端都是配偶节点（实际数据不应存在，但稳健起见保留原 spouse 边）
      virtualEdges.push(edge);
      continue;
    }

    // 构造虚拟节点 id
    const virtualNodeId = makeVirtualNodeId(mainId, spouseId);
    // 防御性：如果两个 mainId→spouseId 重名（罕见），追加 -N 后缀保证唯一
    let uniqueVirtualId = virtualNodeId;
    let dupCounter = 1;
    while (virtualToSpouse.has(uniqueVirtualId)) {
      uniqueVirtualId = `${virtualNodeId}_${dupCounter++}`;
    }

    // 创建虚拟节点（width=0, height=0, virtualSpouse=true）
    virtualNodes.push({
      id: uniqueVirtualId,
      label: '',
      gender: 'male', // 虚拟节点无性别，但字段必填
      isMainLineage: false,
      isLiving: false,
      generation: -2, // 标记为比配偶更深一层
      width: 0,
      height: 0,
      virtualSpouse: true,
    });

    // 添加虚拟链第一条边：mainId → virtualSpouseId（标记 fromVirtualSpouse=true）
    const firstVirtualEdgeId = `${edge.id}__virt_e_${virtualEdgeCounter++}`;
    virtualEdges.push({
      id: firstVirtualEdgeId,
      source: mainId,
      target: uniqueVirtualId,
      kind: 'parent-child',
      fromVirtualSpouse: true,
      // 保留 spouse 边的元数据，供 collapse 后恢复 spouse 边使用
      marriageOrder: edge.marriageOrder,
      isCurrent: edge.isCurrent,
    });

    // 添加虚拟链第二条边：virtualSpouseId → spouseId（普通 parent-child）
    virtualEdges.push({
      id: `${edge.id}__virt_e_${virtualEdgeCounter++}`,
      source: uniqueVirtualId,
      target: spouseId,
      kind: 'parent-child',
    });

    // 记录映射
    spouseEdgeMap.set(edge.id, firstVirtualEdgeId);
    virtualToSpouse.set(uniqueVirtualId, spouseId);
  }

  return {
    virtualNodes,
    virtualEdges,
    spouseEdgeMap,
    virtualToSpouse,
  };
}

/**
 * 构造虚拟节点 id
 *
 * 转义原始 id 中的 `_` 为 `__`，避免解析冲突
 */
export function makeVirtualNodeId(mainId: string, spouseId: string): string {
  const safeMain = mainId.replace(/_/g, '__');
  const safeSpouse = spouseId.replace(/_/g, '__');
  return `__virt_w_${safeMain}_${safeSpouse}`;
}

/**
 * 从 virtualToSpouse map 反向构造 spouseToVirtual map
 *
 * 用于 positionSpouseNodes 阶段：根据 spouseId 快速定位对应的虚拟节点 id。
 */
export function buildSpouseToVirtual(
  virtualToSpouse: Map<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [virtualId, spouseId] of virtualToSpouse) {
    map.set(spouseId, virtualId);
  }
  return map;
}

// ==================== collapse ====================

/**
 * 将带虚拟节点的布局结果折叠回真实图
 *
 * 算法：
 * 1. 从 nodes 中过滤掉 virtualSpouse=true 的节点
 * 2. 从 edges 中过滤掉 id 包含 `__virt_e_` 的虚拟边（来自 spouse 展开）
 * 3. 记录虚拟节点位置 → 真实配偶位置映射，供 spouse-renderer 使用
 *
 * 注：spouse 边的 path 不在此处计算，由 spouse-renderer 在 collapse 后的
 *   真实图上重新计算（与 v5 行为一致）。
 *
 * @param layout 含虚拟节点的 LayoutResult
 * @param virtualToSpouse 虚拟节点 id → 真实配偶 id 映射
 * @returns CollapsedLayout
 */
export function collapseVirtualNodes(
  layout: {
    nodes: NodePosition[];
    edges: LayoutEdge[];
  },
  virtualToSpouse: Map<string, string>,
): CollapsedLayout {
  const realNodes: NodePosition[] = [];
  const virtualToSpousePos = new Map<string, NodePosition>();

  for (const node of layout.nodes) {
    // 虚拟节点的 id 在 virtualToSpouse 映射表中 → 折叠时记录其配偶节点位置
    if (virtualToSpouse.has(node.id)) {
      const spouseId = virtualToSpouse.get(node.id)!;
      // [W2 2026-09-01 契约] virtualToSpousePos.spread 保留虚拟节点自身 X/Y（来自 layout-engine 阶段 4 设定的虚拟节点位置）。
      //   这个 X 用于 spouse-renderer 从虚拟节点 X 推导 spouse 边 junction X（不取真实配偶 X，因为真实配偶 X 可能被紧凑布局 / 主脉对齐调整过）。
      //   真实配偶 X 由 collapse 后的 nodes 数组提供（即 result.nodes 中配偶 id 的位置）。
      virtualToSpousePos.set(node.id, {
        id: spouseId,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      });
      continue;
    }
    realNodes.push(node);
  }

  // 过滤虚拟边（id 包含 '__virt_e_' 标记）
  const realEdges = layout.edges.filter((e) => !e.id.includes('__virt_e_'));

  return {
    nodes: realNodes,
    edges: realEdges,
    virtualToSpousePos,
  };
}