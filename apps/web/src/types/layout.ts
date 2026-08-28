/**
 * 族谱树自适应布局引擎类型定义
 */

// ==================== 基础类型 ====================

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ==================== 节点类型 ====================

export interface LayoutNode {
  id: string;
  label: string;
  gender: 'male' | 'female';
  isMainLineage: boolean;
  isLiving: boolean;
  generation: number;
  data?: Record<string, any>;
  // 布局结果
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 包含配偶延伸的视觉占用宽度（不修改原始 width） */
  effectiveWidth?: number;
}

// ==================== 边类型 ====================

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  kind: 'parent-child' | 'spouse';
  isCurrent?: boolean;
  marriageOrder?: number;
  /**
    * [2026-08-28 P1 一妻多妾优化] 母亲节点 id。
    * 仅对 kind='parent-child' 生效，用于父子边按母亲归属选择牵引线起点 X：
    * - 未指定 / 等于 source：视为正妻之子（或无妾场景），起点为父节点中心 X（默认）
    * - 不等于 source：视为妾之子，起点为母亲（妾）节点底部中心 X
    * 背景：传统谱牒中妾之子画「另枝」，需与正妻之子视觉区分；同一父亲的子女可能因母亲不同而走不同牵引线。
    */
  motherId?: string;
  /**
    * [2026-08-28 P3] 子女出生顺序。
    * layout-engine 在构建 compactBox 输入时按 birthOrder 升序排序子节点，
    * 保证同一父亲的多个子女在画布上从左到右严格按排行排列（与谱牒传统一致）。
    * - 未指定：保持原顺序（向后兼容）
    * - 指定：按升序排列，相同 birthOrder 保持原顺序
    */
  birthOrder?: number;
  /**
    * [2026-08-28 P4] 是否为妾之子（用于边样式区分）。
    * true 时 GenealogyTree 边样式会用母亲调色板 + 虚线，达到「另枝」视觉。
    */
  isConcubineChild?: boolean;
  /**
    * [2026-08-28 P4] 母亲（妾）的调色板色（同 layout-engine 与 G6 data）。
    * 仅当 isConcubineChild=true 时使用。
    */
  palette?: string;
  // 布局结果
  path?: EdgePath;
}

export interface EdgePath {
  points: Point[];
  type: 'cubic' | 'line' | 'orthogonal';
  /** 一夫多妻婚姻汇聚点坐标（仅 spouse 边使用），用于按妻子颜色绘制分岔段 */
  junction?: Point;
}

// ==================== 布局结果 ====================

export interface LayoutResult {
  nodes: NodePosition[];
  edges: LayoutEdge[];
  bounds: BoundingBox;
  generations: number;
  totalNodes: number;
}

/**
 * 夫妻绑定单元（CoupleUnit）
 *
 * [A2 2026-08-28] 引入原因：原算法中「主节点 + 配偶」是松散拼接的，
 *   resolveSubtreeOverlap / alignMainLineage 阶段会把配偶子树拆开参与扫描对齐，
 *   导致夫妻对错位、中间被其他族员插入。
 * CoupleUnit 把「主节点 + 全部配偶 + 配偶继子女子树」视为一个不可拆的整体单元，
 *   供以下阶段统一以绑定单元为单位操作：
 *   - alignMainLineage：主脉子节点的 CoupleUnit 整体平移
 *   - resolveSubtreeOverlap：扫描时以 CoupleUnit.unitWidth 为最小单位宽度
 *   - computeSpouseEdgePaths：junction X 错定 mainPos.x + mainPos.width/2（丈夫右边缘），
 *     保证一夫多妻的 spouse 边从同一起点呈梳状分岔
 */
export interface CoupleUnit {
  /** 主节点 id（族内人，generation >= 0） */
  mainId: string;
  /** 按 marriageOrder 排序的配偶 id 列表（含族内女性与外部配偶） */
  spouseIds: string[];
  /**
   * 绑定单元总宽度 = 主节点宽度 + Σ(spouseWidth + spouseGap) + spouseGap
   * 不包含继子女子树的避让宽度（避让交给 resolveSubtreeOverlap 整体右推处理）
   */
  unitWidth: number;
  /** 绑定单元的视觉右边界 X = mainPos.x + mainPos.width/2 + Σ(spouseWidth + spouseGap) + spouseGap */
  unitRightX: number;
}

// ==================== 视口配置 ====================

export interface ViewportConfig {
  zoom: number;
  centerX: number;
  centerY: number;
  layoutDirection: 'TB' | 'LR';
}

// ==================== 布局配置 ====================

export interface LayoutConfig {
  // 节点尺寸
  nodeWidth: number;
  nodeHeight: number;
  
  // 间距配置（支持 'auto' 自动计算）
  nodeSep: number | 'auto';      // 同代节点间距
  rankSep: number | 'auto';      // 代际间距
  spouseGap: number;             // 配偶节点间距
  marriageJunctionOffset: number; // 丈夫节点底部到婚姻汇聚点的垂线长度
  edgeHorizontalSeparation: number; // 同层水平边段最小错开距离
  
  // 布局行为
  mainLineageCenter: boolean;    // 主脉是否居中
  spouseOptimization: boolean;   // 是否优化配偶位置
  generationAlign: boolean;      // 同代节点是否对齐
  resolveSubtreeOverlap: boolean; // 是否启用布局后子树扫描线推开
  
  // 自适应配置
  autoFit: {
    enabled: boolean;
    padding: number;             // 画布边距
    maxZoom: number;
    minZoom: number;
    preferDirection: 'TB' | 'LR' | 'auto';
  };
  
  // 性能配置
  performance: {
    maxNodesForFullLayout: number;
    viewportCulling: boolean;
    lodEnabled: boolean;
  };
}

// ==================== 引擎选项 ====================

export interface LayoutOptions {
  config?: Partial<LayoutConfig>;
  canvasSize: Size;
}

// ==================== 默认配置 ====================

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  nodeWidth: 64,
  nodeHeight: 28,
  nodeSep: 'auto',
  rankSep: 'auto',
  // [B1 2026-08-28] 32 → 16：夫妻紧贴，目标 夫妻中心距 / 卡片宽度 ≤ 1.3
  spouseGap: 16,
  // [B1 2026-08-28] 16 → 0：junction 与丈夫底重合，spouse 边退化为纯水平直线
  //   保持 PR 趋势向传统「夫妻一线连」看齐
  marriageJunctionOffset: 0,
  // [2026-08-27 调优] 之前默认 6 px 太近，同层水平边段仍会贴近；
  // 调到 10 后梳状布线肉眼可辨，避免边段重合。
  edgeHorizontalSeparation: 10,
  mainLineageCenter: true,
  spouseOptimization: true,
  generationAlign: true,
  resolveSubtreeOverlap: true,
  autoFit: {
    enabled: true,
    padding: 40,
    maxZoom: 2,
    minZoom: 0.1,
    preferDirection: 'auto',
  },
  performance: {
    maxNodesForFullLayout: 2000,
    viewportCulling: true,
    lodEnabled: true,
  },
};
