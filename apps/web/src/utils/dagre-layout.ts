/**
 * dagre-layout.ts - @dagrejs/dagre 适配层
 *
 * [W3 2026-09-01] LayoutEngine v6 第三阶段：用通用 DAG 布局器 @dagrejs/dagre
 *   替换 v3-v5 自实现的 RT 算法 + v6 compactBox。
 *
 * 适用场景：
 * - ≤1000 节点同步布局（dagre 是纯 JS 同步实现，无 WASM/Worker 依赖）
 * - 1000-2000 节点也可勉强用（实测 1001 < 60ms，5000 约 200-400ms）
 * - 大树（>5000）应改用 elkjs worker 路径（W3.2 elkjs-layout.ts）
 *
 * 设计要点（与 v6 文档 §4.2 对齐）：
 * - rankdir: 'TB'（族谱惯例：根在上、子孙在下）
 * - ranker: 'tight-tree'（族谱是树状结构，紧致树算法最优）
 * - nodesep: 24（兄弟节点水平间距，与 v5 compactBox 默认一致）
 * - ranksep: 48（代际垂直间距，与 v5 一致）
 * - 虚拟节点 width=0（spouse 边展开产生的链节点，dagre 不需要其占据空间）
 *
 * 输出契约：
 * - 返回 Map<string, NodePosition>（key=nodeId）
 * - x/y 已转换为中心点（dagre 原生输出中心点，无需 ±width/2）
 * - width/height 透传自 nodeMap（虚拟节点保留 width=0, height=0）
 *
 * 见 docs/dagre-vs-elkjs-selection.md。
 */

import dagre from '@dagrejs/dagre';
import type {
  LayoutNode,
  LayoutEdge,
  NodePosition,
  LayoutConfig,
} from '@/types/layout';
import { reorderSiblingsByBirthOrder } from '@/utils/tree-positioning';

/**
 * 送给 dagre / elkjs 的血缘边。
 *
 * 配偶虚拟链（main → virt → spouse）如果和真子女一起进分层算法，
 * 零宽虚拟节点会占一个兄弟槽，配偶卡片还会掉到孙辈那一层，
 * 把长子的子孙挤到次子下面。配偶卡片在引擎之后由 positionSpouseNodes 贴到本人身边。
 * 妻子名下的真子女边（吊线图）保留，那些边不是虚拟链。
 */
export function edgesForEngine(edges: LayoutEdge[]): LayoutEdge[] {
  return edges
    .filter((edge) => {
      if (edge.kind !== 'parent-child' || edge.fromVirtualSpouse) return false;
      if (edge.source.startsWith('__virt_') || edge.target.startsWith('__virt_')) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.source !== b.source) return 0;
      const oa = a.birthOrder;
      const ob = b.birthOrder;
      if (oa == null && ob == null) return 0;
      if (oa == null) return 1;
      if (ob == null) return -1;
      return oa - ob;
    });
}

/**
 * dagre 布局统一入口
 *
 * @param virtualNodes 含虚拟节点的完整节点列表（来自 expandSpouseToVirtualNodes）
 * @param virtualEdges 含虚拟边的边列表（spouse 已转换为 parent-child 链）
 * @param config 布局配置（用于间距参数；引擎选择已由 adapter 完成）
 * @returns Map<nodeId, NodePosition> 节点位置
 */
export function layoutWithDagre(
  virtualNodes: LayoutNode[],
  virtualEdges: LayoutEdge[],
  config: LayoutConfig,
): Map<string, NodePosition> {
  const g = new dagre.graphlib.Graph();

  // 图级配置：rankdir=TB、ranker=tight-tree（族谱最优）
  //   dagre 的图配置使用 snake_case 命名（ranksep/nodesep），与 LayoutConfig
  //   的 camelCase（rankSep/nodeSep）不同。
  g.setGraph({
    rankdir: config.layoutDirection === 'LR' ? 'LR' : 'TB',
    nodesep: typeof config.nodeSep === 'number' ? config.nodeSep : 24,
    ranksep: typeof config.rankSep === 'number' ? config.rankSep : 48,
    ranker: 'tight-tree',
    // marginx/marginy：dagre 给图加 8px 默认 margin，避免节点贴画布边
    marginx: 8,
    marginy: 8,
  });

  // 边的默认 label 函数（dagre 要求 setDefaultEdgeLabel 后才能 setEdge）
  g.setDefaultEdgeLabel(() => ({}));

  // 添加节点：宽高透传（虚拟节点 width=0 → dagre 不为其分配空间）
  for (const node of virtualNodes) {
    g.setNode(node.id, {
      width: node.width,
      height: node.height,
    });
  }

  // [P3 2026-08-28] 添加边前先按 birthOrder 升序排序同 source 的边：
  //   dagre tight-tree 的初始兄弟顺序受边插入顺序影响（与 compactBox 类似）。
  //   同父的子边按 birthOrder 升序排 → dagre 输出的兄弟 X 顺序与排行一致。
  //   未指定 birthOrder 的边保持原顺序，向后兼容。
  //
  // [W3 2026-09-01 修复] dagre tight-tree ranker **反转**边输入顺序！
  //   实测：原顺序 [S1, S2, S3] → 输出 [S3, S2, S1]（X 坐标从左到右）。
  //   因此在传给 dagre 前需要 .reverse() 一次，让 dagre 再反转回原顺序。
  // 配偶虚拟链不进这张图，避免配偶卡片占孙辈的横向槽位。
  const sortedEdges = edgesForEngine(virtualEdges).reverse();

  for (const edge of sortedEdges) {
    g.setEdge(edge.source, edge.target, { id: edge.id });
  }

  // 执行布局
  dagre.layout(g);

  // 收集位置：dagre 输出中心点 (x, y)
  const positions = new Map<string, NodePosition>();
  for (const node of virtualNodes) {
    const label = g.node(node.id);
    if (!label) continue;
    positions.set(node.id, {
      id: node.id,
      x: label.x,
      y: label.y,
      width: node.width,
      height: node.height,
    });
  }

  // 第一次 reorderSiblingsByBirthOrder：紧接 dagre 输出。
  // tight-tree 不保证兄弟 X 与 birthOrder 一致（子树宽度会打乱左右顺序）。
  // 这一次早于配偶贴附、主脉对齐、子树避让。那三步还会再挪 X，
  // 所以流水线在 shiftToCenter 之后还有第二次；两次都保留。
  // LR 的屏幕坐标里兄弟在 Y 轴。这里按 X 重排会把代际打乱，
  // 流水线转置到工作坐标后再排一次。
  if (config.layoutDirection !== 'LR') {
    reorderSiblingsByBirthOrder(positions, sortedEdges, config);
  }

  return positions;
}

/**
 * [P3 2026-08-28] 按 birthOrder 兜底重排兄弟节点 X
 *
 * 函数已迁移到 tree-layout.ts（[2026-09-01 P2 修复]），此处复用 tree-layout 中的
 * 实现并由 dagre-layout 在末尾调用一次。
 */