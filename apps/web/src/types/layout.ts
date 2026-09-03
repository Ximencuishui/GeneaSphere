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

/**
 * [v6.x 强壮性 A3] 节点角色枚举
 *
 * 布局引擎下游模块（positionSpouseNodes / alignMainLineage / edge-router），
 * 一律以 `nodeRole` 显式判定代替「gender + generation + virtualSpouse」三重隐式条件。
 *
 * - `anchorMale`：世系锚点男性节点；可作为父子边 source，可发起子女分支
 * - `spouseFemale`：女性配偶节点；不可作为父子边 source，不发起子女分支（默认）
 * - `spouseMale`：男性配偶节点（极少见；例如男嫁入女方家族）
 * - `other`：未明确分类的节点（含虚拟节点、纯展示节点等）
 */
export type NodeRole = 'anchorMale' | 'spouseFemale' | 'spouseMale' | 'other';

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
  /**
   * [W2 2026-09-01] 是否为 spouse 边展开产生的虚拟节点。
   *
   * 背景：spouse edge 在 in-memory 层转换为「虚拟 parent-child」链
   *   mainId → virtualSpouseId → spouseId
   * 虚拟节点 width=0/height=0，不参与渲染；
   * 渲染层（GenealogyTree.vue）跳过此标志为 true 的节点。
   *
   * 见 docs/spouse-virtual-node-model.md。
   */
  virtualSpouse?: boolean;
  /**
   * [v6.x 强壮性 A3] 节点角色（Chain-Spouse-Tree 规范对齐）。
   *
   * 上游调用方可在传入时显式指定；未指定时由 `inferNodeRole()` 在
   * LayoutEngine.calculateLayout 入口推断并写入 nodeMap。
   *
   * 下游模块应优先读 `nodeRole`，仅在不可靠/缺失时回退到
   * `gender + generation + virtualSpouse` 隐式条件（向后兼容）。
   */
  nodeRole?: NodeRole;
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
  /**
   * [W2 2026-09-01] 是否由 spouse 边展开而来的虚拟边（parent-child 类型）。
   *
   * 仅对从 spouse 边 expand 出的「mainId → virtualSpouseId」边生效。
   * edge-router 在 computeOrthogonalEdgePaths 时跳过此边
   * （其路径渲染由 spouse-renderer 在 collapse 后的 spouse 边接管）。
   *
   * 见 docs/spouse-virtual-node-model.md。
   */
  fromVirtualSpouse?: boolean;
}

export interface EdgePath {
  points: Point[];
  type: 'cubic' | 'line' | 'orthogonal';
  /** 一夫多妻婚姻汇聚点坐标（仅 spouse 边使用），用于按妻子颜色绘制分岔段 */
  junction?: Point;
  /**
   * [2026-09-01 修复] 共享总线组标识：标记本路径属于哪个"父-多妻妾组共享 drop line"。
   * 同一 junctionGroup 的多条边在 busY 上的水平段应保持 Y 一致（重合），
   * resolveEdgeHorizontalOverlaps 会跳过同组水平段的错开。
   * 仅 parent-child 边使用。
   */
  junctionGroup?: string;
}

// ==================== 布局结果 ====================

/**
 * [v6.x 健壮性 O 系列] 布局结果元数据
 *
 * 包含：
 * - 阶段耗时（timings）：各流水阶段耗时分析
 * - 错误记录（errors）：在防御三连阶段捕获的错误（含错误码）
 * - 引擎/宽树标记：便于 UI 区分渲染策略
 * - 输入规模统计：便于诊断"为什么这么慢"
 */
export interface LayoutResultMeta {
  /** 各阶段耗时（毫秒） */
  timings: Record<string, number>;
  /** 阶段顺序（按 beginPhase 调用顺序） */
  phaseOrder: string[];
  /** 总耗时估算（timings 之和） */
  totalMs: number;
  /** 防御三连触发的错误（不阻塞流水的内部错误） */
  errors: { code: string; message: string; timestamp: number }[];
  /** 实际使用的引擎 */
  engineUsed?: 'dagre' | 'elkjs' | 'compactBox';
  /** 是否触发宽树策略 */
  wideTree?: boolean;
  /** 输入规模统计 */
  input: {
    nodeCount: number;
    edgeCount: number;
    parentChildEdgeCount: number;
    spouseEdgeCount: number;
  };
}

export interface LayoutResult {
  nodes: NodePosition[];
  edges: LayoutEdge[];
  bounds: BoundingBox;
  generations: number;
  totalNodes: number;
  /**
   * [v6.x 健壮性 O 系列] 布局元数据
   *
   * 仅当 LayoutEngine.metricsEnabled !== false 时填充。
   * 生产环境如需关闭（节省 1-2% 耗时），传 metricsEnabled: false 给 LayoutOptions。
   */
  meta?: LayoutResultMeta;
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
  /**
   * [2026-09-01 P0 修复] 是否为「极端宽树」模式。
   *
   * 触发条件：contentW / contentH > 3 且原生 scaleX 已低于 minZoom。
   * 此模式下 autoFit 强制使用 fitByHeight（让 Y 适配画布高度），让用户用横向
   * 滚动浏览支系。调用方应据此降低默认 zoom 下限（避免节点看不清）。
   *
   * 见 docs/testing/2026-09-01-layout-v6/REPORT.md §3 P0。
   */
  wideTree?: boolean;
  /**
   * [2026-09-01 P0 修复] contentW / contentH，用于调用方按比例调整 zoom 策略。
   */
  contentAspectRatio?: number;
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

  // [W3 2026-09-01] 布局引擎选择：'auto'（按节点数自动）/'dagre'/'elkjs'/'compactBox'
  //   - 'auto': 默认策略。≤engineThreshold 走 dagre 同步路径；>engineThreshold 走 elkjs 异步 web worker 路径
  //   - 'dagre': 强制使用 dagre（同步），适合中小型树（≤1000 节点 < 60ms）
  //   - 'elkjs': 强制使用 elkjs（异步 worker），适合大型树（>1000 节点 < 1s）
  //   - 'compactBox': 强制使用 @antv/hierarchy compactBox（仅作调试/兜底用）
  //   见 docs/dagre-vs-elkjs-selection.md。
  engine?: 'auto' | 'dagre' | 'elkjs' | 'compactBox';

  // [W3 2026-09-01] engine='auto' 模式下 dagre ↔ elkjs 切换阈值（默认 1000）
  //   ≤engineThreshold 走 dagre 同步路径；>engineThreshold 走 elkjs 异步 worker 路径
  engineThreshold?: number;

  // ==================== [v6.x 健壮性 X 系列] 高级调参魔法常量 ====================
  // 以下参数为可选，不指定时使用默认值（与 LayoutEngine v6.0.8 行为一致）
  // 仅在特定场景（极端宽树 / 极深递归 / 边距不对齐）下需要微调

  /**
   * 子树宽度递归深度上限（默认 20）
   *
   * 用途：避免 computeSubtreeWidth 在异常数据下栈溢出或性能塌方
   * 见 tree-layout.ts computeSubtreeWidth：当 depth > subtreeWidthMaxDepth 时直接返回 0。
   */
  subtreeWidthMaxDepth?: number;

  /**
   * auto-spacing nodeSep 上限（默认 80 px）
   *
   * 用途：computeAutoNodeSep 返回值不超过此值
   * 触发条件：avgNodesPerGen 极大（30+）且节点子树不平衡时
   * 真正的修复在 wideTreeAspectRatio 兜底
   */
  maxNodeSep?: number;

  /**
   * 边路径端点向节点内缩距离（默认 4 px）
   *
   * 用途：computeOrthogonalEdgePaths 在父子边起点/终点向节点内缩 inset 像素
   *       确保末端点落在卡片可见区域内，避免 border-radius=8 导致终点"悬空"
   */
  edgeInset?: number;

  /**
   * 宽树自适应缩放阈值（默认 3）
   *
   * 用途：autoFit 当 contentW/contentH > 该阈值 且 scaleX 已低于 minZoom 时，
   *       强制使用 fitByHeight（让 Y 适配画布高度，横向通过 pan 浏览支系）
   */
  wideTreeAspectRatio?: number;
}

// ==================== 引擎选项 ====================

export interface LayoutOptions {
  config?: Partial<LayoutConfig>;
  canvasSize: Size;
  /**
   * [v6.x 强壮性 C2] LayoutConfig 校验模式
   * - 'prod'（默认）：数值非法时自动 clamp 兜底，不抛错
   * - 'dev'：数值非法时立即抛 LayoutEngineError('INVALID_CONFIG')，
   *   适用于单元测试与本地调试
   */
  validateConfigMode?: 'prod' | 'dev';
  /**
   * [v6.x 健壮性 O 系列] 是否启用可观测性 metrics
   * - 默认 true：填充 LayoutResult.meta，启动阶段计时，记录防御三连错误
   * - 设为 false：省 1-2% 性能开销，但无法获知阶段耗时与错误记录
   */
  metricsEnabled?: boolean;
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
  // [W3 2026-09-01] 默认 'auto'，由 layout-engine-adapter 按 totalNodes + engineThreshold 调度
  engine: 'auto',
  engineThreshold: 1000,
};
