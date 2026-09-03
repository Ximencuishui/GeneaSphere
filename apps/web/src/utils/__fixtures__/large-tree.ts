/**
 * __fixtures__/large-tree.ts - 大树测试数据构造器（性能基准专用）
 *
 * [W4 2026-09-01] LayoutEngine v6 性能基准 fixture：
 *   按广度优先生成平衡二叉树，每代兄弟节点数 = 2^N，
 *   用于验证 dagre（≤1000）/ elkjs（>1000）引擎在大树下的性能。
 *
 * 与 zhuxi.ts 的区别：
 * - zhuxi.ts：模拟真实族谱结构（含配偶、代际宽度不均），用于视觉回归
 * - large-tree.ts：纯 DAG 平衡二叉树，最坏情况布局压力测试
 *
 * 用法：
 *   - 1000 节点 = 10 代二叉树（每代 2^N，最深 1024 兄弟 → 实际根 + 9 代 = ~1000）
 *   - 5000 节点 = 13 代（最深 4096 兄弟 → 实际根 + 12 代 = ~8000，取前 5000）
 *
 * 见 docs/bench-results.md（B1: 1000<60ms；B2: 5000<1s）。
 */

import type { LayoutNode, LayoutEdge } from '@/types/layout';

/**
 * 构造大型平衡树
 *
 * @param targetSize 目标节点数：1000 / 5000（实际生成节点数可能略多于 targetSize，
 *                   由广度优先 + 完整代决定；最后一代若超出则截断）
 * @returns 节点和边列表
 */
export function buildLargeTree(
  targetSize: 1000 | 5000,
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const W = 64;
  const H = 28;
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  // 根节点
  nodes.push({
    id: 'root',
    label: 'Root',
    gender: 'male',
    isMainLineage: true,
    isLiving: false,
    generation: 0,
    width: W,
    height: H,
  });

  let edgeCounter = 0;

  // BFS：每代节点数 = 2^gen（gen 从 0 起算，根 gen=0）
  let currentGenIds: string[] = ['root'];
  let gen = 0;
  while (nodes.length < targetSize) {
    const nextGenIds: string[] = [];
    gen++;
    // 父节点索引：从当前代首部均匀循环取，确保子树均匀
    for (let i = 0; i < currentGenIds.length; i++) {
      const parentId = currentGenIds[i];
      // 每父节点生 2 个子（平衡二叉）
      for (let c = 0; c < 2; c++) {
        if (nodes.length >= targetSize) break;
        const childId = `g${gen}_n${i}_c${c}`;
        nodes.push({
          id: childId,
          label: childId,
          gender: 'male',
          isMainLineage: false,
          isLiving: false,
          generation: gen,
          width: W,
          height: H,
        });
        edges.push({
          id: `e_${edgeCounter++}`,
          source: parentId,
          target: childId,
          kind: 'parent-child',
          birthOrder: c,
        });
        nextGenIds.push(childId);
      }
      if (nodes.length >= targetSize) break;
    }
    currentGenIds = nextGenIds;
    // 安全保护：避免无穷循环（5000 节点约 13 代即满足）
    if (gen > 20) break;
  }

  return { nodes, edges };
}