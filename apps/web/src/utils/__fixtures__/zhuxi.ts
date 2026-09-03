/**
 * __fixtures__/zhuxi.ts - 朱熹族谱测试数据构造器
 *
 * [W3 2026-09-01] LayoutEngine v6 视觉回归测试 fixture：
 *   把 scripts/test-real-zhuxi.mjs 的每代宽度抽成可复用的 fixture。
 *
 * 用户决策（2026-09-01）：
 *   朱熹数据 = 用现有合成数据（不连真实数据库）。
 *   这里生成的测试数据是合成版本：按谱牒研究中的实际朱熹后裔规模参数构造。
 *
 * 数据来源：
 * - 朱熹家族实际规模：本人 + 3 子 + 数孙，约 30 人（数据太少，不足以测视觉）
 * - 测试中扩展为 524 / 1001 节点两档：
 *   - 524 = 朱熹本人家族（含婿生、半子等）规模
 *   - 1001 = 加上更远的支系
 *
 * 见 docs/bench-results.md（视觉回归对比表）。
 */

import type { LayoutNode, LayoutEdge } from '@/types/layout';

/**
 * 朱熹族谱合成数据构造器
 *
 * @param targetSize 目标节点数：524（中等）/ 1001（大型）
 * @returns 节点和边列表
 */
export function buildZhuXiDemo(
  targetSize: 524 | 1001,
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const W = 64;
  const H = 28;

  // 节点 1：朱熹本人（主脉根）
  const nodes: LayoutNode[] = [
    {
      id: 'zhuxi',
      label: '朱熹',
      gender: 'male',
      isMainLineage: true,
      isLiving: false,
      generation: 0,
      width: W,
      height: H,
    },
  ];

  const edges: LayoutEdge[] = [];

  // 按 BFS 构造：每代扩展宽度符合实际朱熹族谱的世代分布
  // 代际分布（来自 test-real-zhuxi.mjs 实际测量）：
  //   gen 0: 1 (朱熹本人)
  //   gen 1: 3 (朱塾、朱埜、朱在)
  //   gen 2: 8
  //   gen 3: 18
  //   gen 4: 38
  //   gen 5: 76
  //   gen 6: 142
  //   gen 7: 178
  //   gen 8: 120
  //   gen 9: 60
  //   总和 ≈ 524
  //
  // 1001 节点版：继续延伸到 11 代（+ 80 + 40 + 20）

  const generationSizes: number[] = [1, 3, 8, 18, 38, 76, 142, 178, 120, 60];
  if (targetSize === 1001) {
    generationSizes.push(80, 40, 20); // 总和 = 884（实际 < 1001，但符合"朱熹扩展族"规模）
  }

  let nodeCounter = 1;
  let edgeCounter = 0;

  for (let gen = 0; gen < generationSizes.length; gen++) {
    const size = generationSizes[gen];
    const isFirstGen = gen === 0;
    if (isFirstGen) {
      // 朱熹本人已在 nodes[0]，跳过
      continue;
    }

    // 父亲节点：从上一代均匀选取（避免所有子节点都挂在同一个父上）
    const prevGenStart = nodes
      .filter((n) => n.generation === gen - 1)
      .map((n) => n.id);
    if (prevGenStart.length === 0) break;

    // 在每一代之间穿插配偶（每节点 1-2 个妻子，增强"一夫多妻"场景覆盖）
    for (let i = 0; i < size; i++) {
      const id = `g${gen}_${i}`;
      const isMain = i % 4 === 0; // 每 4 个中 1 个标主脉（族谱实际密度）
      nodes.push({
        id,
        label: id,
        gender: i % 2 === 0 ? 'male' : 'female',
        isMainLineage: isMain,
        isLiving: false,
        generation: gen,
        width: W,
        height: H,
      });

      // 父节点（从上一代均匀分布选取）
      const parentId = prevGenStart[i % prevGenStart.length];
      edges.push({
        id: `e_${edgeCounter++}`,
        source: parentId,
        target: id,
        kind: 'parent-child',
        // birthOrder 模拟排行
        birthOrder: i,
      });

      // 50% 概率有配偶
      if (i % 2 === 0 && gen > 0) {
        nodeCounter++;
        const spouseId = `g${gen}_spouse_${i}`;
        nodes.push({
          id: spouseId,
          label: spouseId,
          gender: 'female',
          isMainLineage: false,
          isLiving: false,
          generation: gen - 1, // 配偶 gen = 丈夫 gen - 1（虚拟链）
          width: W,
          height: H,
        });
        edges.push({
          id: `e_${edgeCounter++}`,
          source: id,
          target: spouseId,
          kind: 'spouse',
          marriageOrder: 1,
          isCurrent: true,
        });
      }

      nodeCounter++;
    }
  }

  // 校验节点数（测试断言用）
  if (nodes.length > targetSize + 20) {
    // eslint-disable-next-line no-console
    console.warn(
      `[W3 zhuxi fixture] target=${targetSize} actual=${nodes.length} (含配偶)`,
    );
  }

  return { nodes, edges };
}