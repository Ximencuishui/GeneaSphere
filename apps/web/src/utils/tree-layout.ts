/**
 * tree-layout.ts - 节点位置计算（编排入口）
 *
 * [Phase C 2026-09-02] LayoutEngine v6 重构收尾：从 806 行单体拆为三模块。
 *
 *   ├─ tree-positioning.ts   节点定位（≤540 行）
 *   ├─ tree-main-line.ts     主脉对齐 + 整体居中
 *   └─ tree-overlap.ts       子树外接矩形避让
 *
 * 本文件作为「向后兼容 re-export 编排入口」：原 `@/utils/tree-layout` 的所有
 * 命名导出全部保留，外部代码（layout-engine.ts / 各 spec / dagre-layout.ts 等）
 * 零改动即可继续工作。
 *
 * 新代码应优先直接 import 三个子模块以获得更精确的依赖声明。
 */

// ==================== 节点定位 ====================
export {
  getBoundingBox,
  buildSpouseMap,
  computeSpouseWidths,
  computeSubtreeWidth,
  computeAutoNodeSep,
  computeAutoRankSep,
  reorderSiblingsByBirthOrder,
  computeMaxGeneration,
  positionSpouseNodes,
  detectCycle,
} from '@/utils/tree-positioning';

// ==================== 主脉对齐 + 整体居中 ====================
export {
  alignMainLineage,
  shiftToCenter,
} from '@/utils/tree-main-line';

// ==================== 子树避让 ====================
export {
  resolveSubtreeOverlap,
  shiftSubtree,
} from '@/utils/tree-overlap';