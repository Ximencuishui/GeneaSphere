/**
 * [2026-09-02 P2] partialTree 子树深度截断算法（纯函数模块，便于单测）
 *
 * 背景：partialTree 仅按后端 limit 截断「节点数」，但 zhuxi-demo 这类「单支系深族谱」
 * 可能在 limit=100 之内仍保持 12+ 代纵深 → layoutEngine.calculateLayout 计算量大、
 *   g6Graph.render() 视口高度爆掉，触发 P0 的 30s 兜底超时。
 *
 * 设计原则：
 * - 截断点选「最深的叶子层」，把超深支系的 children 数组清空（DFS 自然终止）
 * - 仅截断子节点（保留被截断层级的节点本身）
 *
 * 适用：仅 GenealogyNode 类型树（duck typing，不依赖 Vue store）
 */

/** 任意具有 children 数组的对象（duck type，避免对 GenealogyNode 强耦合） */
export interface TreeLike {
  id?: any;
  children?: TreeLike[];
}

/** 深度截断的默认上限（根 = 0；超过此深度的子孙全部清空） */
export const DEFAULT_PARTIAL_TREE_MAX_DEPTH = 10;
/** 触发深度截断的总节点数阈值 */
export const DEFAULT_PARTIAL_TREE_TRUNCATE_THRESHOLD = 500;

/**
 * 计算树的最大深度（根 = 0；无 children 的节点深度为 0）。
 * 空树返回 0。
 */
export function computeTreeMaxDepth(root: TreeLike | null | undefined): number {
  if (!root) return 0;
  let max = 0;
  const walk = (n: TreeLike, depth: number) => {
    if (depth > max) max = depth;
    if (!n.children || n.children.length === 0) return;
    for (const c of n.children) walk(c, depth + 1);
  };
  walk(root, 0);
  return max;
}

/**
 * 按最大深度截断树：把深度 > maxDepth 的子孙后代从 children 数组中清空。
 * - 直接 mutate root.children
 * - 保留被截断层级的节点本身（仅清空 children 数组）
 * - 返回被截断的节点总数
 */
export function truncateTreeByDepth(
  root: TreeLike | null | undefined,
  maxDepth: number,
): number {
  if (!root) return 0;
  let truncated = 0;
  const walk = (n: TreeLike, depth: number) => {
    if (!n.children || n.children.length === 0) return;
    if (depth >= maxDepth) {
      // 该节点已在 maxDepth，整层 children 都视为截断
      truncated += n.children.length;
      n.children = [];
      return;
    }
    for (const c of n.children) walk(c, depth + 1);
  };
  walk(root, 0);
  return truncated;
}

/**
 * 计算树的总节点数（DFS，包含根）。
 */
export function countTreeNodes(root: TreeLike | null | undefined): number {
  if (!root) return 0;
  let count = 0;
  const walk = (n: TreeLike) => {
    count += 1;
    if (!n.children) return;
    for (const c of n.children) walk(c);
  };
  walk(root);
  return count;
}

/**
 * 条件性深度截断包装函数：仅在满足以下条件时执行截断：
 *   1) isPartial === true（业务上下文：后端已声明 partial，避免对全量数据动刀）
 *   2) 节点总数 > threshold
 *   3) maxDepth > maxDepthLimit
 *
 * @returns 截断结果摘要；无截断时 truncated=0
 */
export interface TruncateSummary {
  truncated: number;
  depthBefore: number;
  depthAfter: number;
  nodeCount: number;
  triggered: boolean; // 是否真的执行了截断
}

export function maybeTruncateByDepthPure(
  root: TreeLike | null | undefined,
  opts: {
    isPartial: boolean;
    maxDepth?: number;
    nodeCountThreshold?: number;
  },
): TruncateSummary {
  const maxDepth = opts.maxDepth ?? DEFAULT_PARTIAL_TREE_MAX_DEPTH;
  const threshold = opts.nodeCountThreshold ?? DEFAULT_PARTIAL_TREE_TRUNCATE_THRESHOLD;
  const empty: TruncateSummary = {
    truncated: 0,
    depthBefore: 0,
    depthAfter: 0,
    nodeCount: 0,
    triggered: false,
  };
  if (!root || !opts.isPartial) return empty;
  const nodeCount = countTreeNodes(root);
  if (nodeCount <= threshold) {
    return { ...empty, nodeCount };
  }
  const depthBefore = computeTreeMaxDepth(root);
  if (depthBefore <= maxDepth) {
    return { ...empty, nodeCount, depthBefore };
  }
  const truncated = truncateTreeByDepth(root, maxDepth);
  const depthAfter = computeTreeMaxDepth(root);
  return { truncated, depthBefore, depthAfter, nodeCount, triggered: true };
}
