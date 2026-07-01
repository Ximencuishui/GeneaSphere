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
  // 布局结果
  path?: EdgePath;
}

export interface EdgePath {
  points: Point[];
  type: 'cubic' | 'line' | 'orthogonal';
}

// ==================== 布局结果 ====================

export interface LayoutResult {
  nodes: NodePosition[];
  edges: LayoutEdge[];
  bounds: BoundingBox;
  generations: number;
  totalNodes: number;
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
  
  // 布局行为
  mainLineageCenter: boolean;    // 主脉是否居中
  spouseOptimization: boolean;   // 是否优化配偶位置
  generationAlign: boolean;      // 同代节点是否对齐
  
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
  spouseGap: 8,
  mainLineageCenter: true,
  spouseOptimization: true,
  generationAlign: true,
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
