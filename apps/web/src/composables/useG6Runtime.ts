/**
 * G6 运行时加载 + 扩展注册 + 自定义类集成
 *
 * [2026-09-03 拆分 P1] 从 useG6GraphInit.ts 抽出 loadG6Runtime() 主体（约 420 行），
 * 单独成模块，避免单文件 1889 行不可维护。
 *
 * 设计原则：
 *   - 单一职责：仅负责"加载 G6 子路径 + register 17+ 扩展 + register GenealogyNode/OrthEdge"
 *   - 缓存策略：本模块**不持有缓存**。每次调用都重新 dynamic import + register。
 *     缓存由 caller（useGraphInit 的工厂闭包）持有，保证 GenealogyNode 类捕获的 deps
 *     与该组件实例一致（避免模块级缓存导致"第一个组件胜出"的副作用）。
 *   - 依赖注入：GenealogyNode / OrthEdge 由 caller 通过 deps 传入（业务 deps），
 *     G6 子类（Rect / Polyline / GText）由本模块在 dynamic import 后直接构造
 *   - PinchZoomBehavior（双指缩放）保留在本模块：与业务 0 耦合，纯 G6 行为
 *
 * 与原 useG6GraphInit.ts 内 loadG6Runtime 的等价性：
 *   - 所有 dynamic import 路径一致（保留 vendor-antv 优化）
 *   - 17+ register 调用顺序一致
 *   - GenealogyNode / OrthEdge 现在通过 createGenealogyNodeClass / createOrthEdgeClass
 *     工厂传入，行为与原内联类完全一致
 */
import type { ComputedRef } from 'vue';
import type { ViewMode } from '@/stores/genealogy';
import { createGenealogyNodeClass } from './useGenealogyNode';
import { createOrthEdgeClass } from './useOrthEdge';

/** G6 Graph 类（caller 通过 loadG6Runtime() 返回值使用） */
export type G6GraphCtor = any;
/** G6 treeToGraphData 函数（caller 通过 loadG6Runtime() 返回值使用） */
export type G6TreeToGraphData = (tree: any) => { nodes?: any[]; edges?: any[] };
/** loadG6Runtime() 返回值 */
export interface G6Runtime {
  Graph: G6GraphCtor;
  treeToGraphData: G6TreeToGraphData;
}

/**
 * 加载 G6 runtime 所需的业务 deps。
 *
 * genealogyStore 与 viewModeConfig 由 GenealogyNode 类内部读取，用于
 * 根据 viewMode 决定卡片样式（compact / detailed / xianshi / su / zhe）。
 * 传入的引用必须是 reactive 的（Vue 自动解包 .viewMode），否则视图模式切换不会触发重绘。
 */
export interface G6RuntimeDeps {
  /** genealogy store 切片：GenealogyNode.render 时读 .viewMode */
  genealogyStore: { viewMode: ViewMode };
  /** 视图模式参数表：GenealogyNode.render 时读 .value */
  viewModeConfig: ComputedRef<Record<ViewMode, any>>;
}

/**
 * 加载 G6 runtime + 注册扩展（纯函数，无内部缓存）。
 *
 * 推荐用法（caller 持有缓存）：
 *   ```ts
 *   let g6RuntimePromise: Promise<G6Runtime> | null = null;
 *   function loadG6() {
 *     if (!g6RuntimePromise) {
 *       g6RuntimePromise = loadG6Runtime({ genealogyStore, viewModeConfig });
 *     }
 *     return g6RuntimePromise;
 *   }
 *   ```
 *
 * 每次调用会触发所有 G6 子路径的 dynamic import + 17+ register。
 * G6 register 是 idempotent 但仍耗时间，所以重复调用应当被 caller 缓存。
 */
export function loadG6Runtime(deps: G6RuntimeDeps): Promise<G6Runtime> {
  return _loadG6RuntimeInternal(deps);
}

async function _loadG6RuntimeInternal(deps: G6RuntimeDeps): Promise<G6Runtime> {
  // 1) Graph / treeToGraphData / register 从 G6 子路径取，绕过主入口的 preset
  //    themes/light 是必需的：G6 默认 theme='light'（见 Graph.defaultOptions），
  //    绕过 preset 后若不显式注册，themeOf() 会 warn "The theme of light is not registered"
  //    并返回空对象，导致 node 的 fill/palette 退化（节点背景变白、palette 失效）
  const [{ Graph }, treeMod, { register }, { light }] = await Promise.all([
    import('@antv/g6/esm/runtime/graph'),
    import('@antv/g6/esm/utils/tree'),
    import('@antv/g6/esm/registry/register'),
    import('@antv/g6/esm/themes/light'),
  ]);
  const treeToGraphData = treeMod.treeToGraphData as G6TreeToGraphData;

  // 2) 注册家族树实际用到的扩展
  //    Tooltip 组件使用自定义 HTML 实现（见 node:mouseenter handler），
  //    无需注册 G6 内置 Tooltip 插件
  const [
    { Rect },
    { CubicHorizontal },
    { CubicVertical },
    { Line },
    { Polyline },
    { Fade },
    { compactBox },
    { DragCanvas },
    { ZoomCanvas },
    { DragElement },
    { ArrangeDrawOrder },
    { CollapseExpandCombo },
    { CollapseExpandNode },
    { GetEdgeActualEnds },
    { UpdateRelatedEdge },
    // [2026-08-19 修复] 双指缩放行为依赖：动态加载避免 G6 深层循环依赖
    // 进入静态合并路径（BaseBehavior ↔ elements ↔ base-node 导致 TDZ）。
    { BaseBehavior },
    { Shortcut },
    { CommonEvent },
    { parsePoint },
    // [树谱卡片 2026-08-26] 引入底层图形 Shape，用于自定义绘制身份标签/日期/称谓
    { Text: GText, Rect: GRect },
  ] = await Promise.all([
    import('@antv/g6/esm/elements/nodes/rect'),
    import('@antv/g6/esm/elements/edges/cubic-horizontal'),
    import('@antv/g6/esm/elements/edges/cubic-vertical'),
    import('@antv/g6/esm/elements/edges/line'),
    import('@antv/g6/esm/elements/edges/polyline'),
    import('@antv/g6/esm/animations/index').then(m => ({ Fade: m.Fade })),
    // compactBox 是唯一一个不依赖 @antv/layout 的 layout
    // （来自 @antv/hierarchy，19.6KB 轻量库），
    // 使用 as any 绕开 TS 类型检查：@antv/hierarchy 导出的是纯函数，
    // 而 ExtensionRegistry.layout 期望类构造器，G6 内部也是这样注册的
    import('@antv/hierarchy').then(m => ({ compactBox: m.compactBox })),
    import('@antv/g6/esm/behaviors/drag-canvas'),
    // zoom-canvas 行为：绑定 canvas 滚轮事件实现缩放。
    // 注意：MCP browser-use 的 evaluate_script 注入合成 wheel 事件时不会触发此行为
    // （G6 v5 + 按需子模块导入场景下事件绑定在特定渲染层，CDP 注入事件不冒泡）。
    // 自动化测试时请改用工具栏 zoomIn/zoomOut 按钮或直接调 graph.value.zoomTo()。
    import('@antv/g6/esm/behaviors/zoom-canvas'),
    import('@antv/g6/esm/behaviors/drag-element'),
    // transforms：treeToGraphData + compact-box 布局内部依赖的 transforms
    import('@antv/g6/esm/transforms/arrange-draw-order'),
    import('@antv/g6/esm/transforms/collapse-expand-combo'),
    import('@antv/g6/esm/transforms/collapse-expand-node'),
    import('@antv/g6/esm/transforms/get-edge-actual-ends'),
    import('@antv/g6/esm/transforms/update-related-edge'),
    import('@antv/g6/esm/behaviors/base-behavior'),
    import('@antv/g6/esm/utils/shortcut'),
    import('@antv/g6/esm/constants'),
    import('@antv/g6/esm/utils/point'),
    // [树谱卡片 2026-08-26] @antv/g-lite 导出基础 Text/Rect shape
    import('@antv/g-lite'),
  ]);

  // 自定义节点：按传统树谱卡片绘制身份标签、生卒日期、姓名、称谓
  // 通过 useGenealogyNode 工厂创建，传入动态加载得到的 Rect / GText
  const GenealogyNode = createGenealogyNodeClass({
    Rect,
    GText,
    genealogyStore: deps.genealogyStore,
    viewModeConfig: deps.viewModeConfig,
  });
  register('node', 'rect', GenealogyNode);

  // 自定义边：使用布局引擎预计算的正交路径
  // 通过 useOrthEdge 工厂创建，传入动态加载得到的 Polyline
  // [2026-08-28 C1] 生成圆角拐弯路径，使牵引线视觉上更柔顺（代替硬直角）。
  //   仅在路径点数 ≥ 3 且是拐点时插入圆弧，未拐点处保持纯直线。
  //   默认圆角半径 4 px（由 useOrthEdge 内的 ORTH_CORNER_RADIUS 常量控制）。
  const OrthEdge = createOrthEdgeClass({ Polyline });
  register('edge', 'cubic-horizontal', CubicHorizontal);
  register('edge', 'cubic-vertical', CubicVertical);
  register('edge', 'line', Line);
  register('edge', 'polyline', Polyline);
  register('edge', 'orth', OrthEdge);
  register('animation', 'fade', Fade);
  register('layout', 'compact-box', compactBox as any);
  register('behavior', 'drag-canvas', DragCanvas);
  register('behavior', 'zoom-canvas', ZoomCanvas);
  register('behavior', 'drag-element', DragElement);
  // [移动端 H5 2026-08-17] 双指缩放（触摸）
  // [2026-08-19 修复] 类定义移入动态加载区域：BaseBehavior 等依赖随本函数一起
  // 动态 import，避免 G6 深层循环依赖进入静态合并路径导致生产构建 TDZ。
  // [P0-3 2026-09-03] Shortcut 是 G6 导出的类构造器（值），不能作为类型注解。
  // 这里改为 any，等价于「不约束字段类型」，运行行为不变。
  class PinchZoomBehavior extends BaseBehavior {
    private shortcut: any;
    constructor(context: any, options: any) {
      super(context, options);
      this.shortcut = new Shortcut(context.graph);
      this.shortcut.bind([CommonEvent.PINCH], (event: any) => {
        const { graph } = this.context;
        const ratio = 1 + (event.scale || 0) / 5; // 还原两点距离比
        const zoom = graph.getZoom();
        const target = Math.min(2, Math.max(0.25, zoom * ratio));
        const origin = event.viewport ? parsePoint(event.viewport) : undefined;
        graph.zoomTo(target, false, origin);
      });
    }
    destroy() {
      this.shortcut.destroy();
      super.destroy();
    }
  }
  register('behavior', 'pinch-zoom', PinchZoomBehavior);

  // transforms：treeToGraphData + compact-box 布局内部依赖的 transforms
  // 注册 key 使用 G6 内置的扩展名（build-in.js 中的 key）
  register('transform', 'arrange-draw-order', ArrangeDrawOrder);
  register('transform', 'collapse-expand-combo', CollapseExpandCombo);
  register('transform', 'collapse-expand-node', CollapseExpandNode);
  register('transform', 'get-edge-actual-ends', GetEdgeActualEnds);
  register('transform', 'update-related-edges', UpdateRelatedEdge);

  // theme：注册 light 主题（G6 默认 theme='light'）
  // 仅注册 light，dark 暂未使用，待需要深色模式时再补 register('theme', 'dark', dark)
  register('theme', 'light', light);

  // GRect 在本模块未直接使用，仅用于触发 @antv/g-lite 模块的副作用加载
  // （GText 已在 GenealogyNode 中使用）
  void GRect;

  return { Graph, treeToGraphData };
}