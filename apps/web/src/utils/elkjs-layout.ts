/**
 * elkjs-layout.ts - elkjs 适配层（web worker 异步路径）
 *
 * [W3 2026-09-01] LayoutEngine v6 第三阶段：用 elkjs 异步布局处理 >1000 节点场景。
 *
 * 适用场景：
 * - >1000 节点大树（dagre 在 5000 节点约 200-400ms，elkjs WASM 算法更稳）
 * - Web Worker 异步执行，不阻塞主线程 UI
 * - elkjs 用 Java/Kotlin 实现 Sugiyama 算法，质量高于 dagre 但首次 WASM 加载较重
 *
 * 设计要点（与 v6 文档 §4.3 对齐）：
 * - algorithm: 'layered'（elkjs 的 Sugiyama 实现）
 * - 'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF'（最优节点放置）
 * - 'elk.layered.crossingMinimization.semiInteractive': true（小规模提速）
 * - web worker 通过 ELK({ workerUrl: new URL('./elkjs-layout.worker.ts', import.meta.url) })
 *
 * 边界场景（与 dagre 共享处理，因为都是 DAG 布局器）：
 * - 双重身份/兄弟共妻/连襟 → expandSpouseToVirtualNodes 已统一转为 parent-child 链
 *
 * 输出契约：
 * - 返回 Map<string, NodePosition>（key=nodeId）
 * - x/y 已转换为中心点（elkjs 输出左上角坐标，需 + width/2 / + height/2）
 * - width/height 透传自 nodeMap
 *
 * 见 docs/dagre-vs-elkjs-selection.md。
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs';
import type {
  LayoutNode,
  LayoutEdge,
  NodePosition,
  LayoutConfig,
} from '@/types/layout';

const elk = new ELK({
  workerUrl: new URL('../workers/elkjs-layout.worker.ts', import.meta.url).href,
});

/**
 * elkjs 布局统一入口（异步）
 *
 * @param virtualNodes 含虚拟节点的完整节点列表（来自 expandSpouseToVirtualNodes）
 * @param virtualEdges 含虚拟边的边列表（spouse 已转换为 parent-child 链）
 * @param config 布局配置（用于间距参数；引擎选择已由 adapter 完成）
 * @returns Promise<Map<string, NodePosition>> 节点位置
 */
export async function layoutWithElkjs(
  virtualNodes: LayoutNode[],
  virtualEdges: LayoutEdge[],
  config: LayoutConfig,
): Promise<Map<string, NodePosition>> {
  // elkjs 的图结构：根节点包含所有子节点和边
  const rootNode: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.semiInteractive': 'true',
      'elk.spacing.nodeNode': String(
        typeof config.nodeSep === 'number' ? config.nodeSep : 24,
      ),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(
        typeof config.rankSep === 'number' ? config.rankSep : 48,
      ),
      // 方向：族谱惯例 TB（top-to-bottom）
      'elk.direction': 'DOWN',
    },
    children: virtualNodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
      // 虚拟节点 width=0，elkjs 会按 0 宽度处理（不影响布局）
    })),
    edges: virtualEdges
      .filter((e) => e.kind === 'parent-child')
      .map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
  };

  // 异步执行布局（关闭 elkjs 内部 logging）
  const result = await elk.layout(rootNode, { logging: false });

  // 收集位置：elkjs 输出左上角 (x, y)，需转中心点
  const positions = new Map<string, NodePosition>();
  if (result.children) {
    for (let i = 0; i < virtualNodes.length; i++) {
      const node = virtualNodes[i];
      const laidOut = result.children[i];
      if (!laidOut || laidOut.x === undefined || laidOut.y === undefined) continue;
      positions.set(node.id, {
        id: node.id,
        // elkjs 输出左上角 → 转中心点
        x: laidOut.x + laidOut.width! / 2,
        y: laidOut.y + laidOut.height! / 2,
        width: node.width,
        height: node.height,
      });
    }
  }

  return positions;
}