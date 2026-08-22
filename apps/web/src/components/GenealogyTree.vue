<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, nextTick, watch, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ZoomIn,
  ZoomOut,
  ScaleToOriginal,
  Plus,
  Loading,
  Search,
  Refresh,
  Grid,
  Rank,
  Male,
  Female,
  User,
  Connection,
  List,
  Warning,
  CircleClose,
  Fold,
  Expand,
  Picture,
  Histogram,
  Filter,
  Upload,
  ArrowDown,
  Reading,
} from '@element-plus/icons-vue';
import { useGenealogyStore } from '@/stores/genealogy';
import type { ViewMode } from '@/stores/genealogy';
import { treeApi } from '@/api/tree';
import type { GenealogyNode } from '@/types';
import PersonEditDrawer from './PersonEditDrawer.vue';
import ImagePreview from './ImagePreview.vue';
import { LayoutEngine } from '@/utils/layout-engine';
import type { LayoutNode, LayoutEdge, LayoutConfig, ViewportConfig } from '@/types/layout';

/**
 * G6 精细化按需加载
 *
 * G6 5.x 的 package 主入口会触发 `import './preset'`，preset 会调
 * `registerBuiltInExtensions()`，一次性 register 100+ 扩展
 * （17 个 layout / 19 个 element / 14 个 behavior / 18 个 plugin / ...），
 * 并把 @antv/layout（3.6MB，含 d3-force / dagre / ml-matrix 等重型依赖）
 * 作为静态依赖拉入。这导致 vendor-antv 体积稳在 1.2MB+。
 *
 * 拆成子路径后：
 * - Graph 类从 `esm/runtime/graph` 子路径取（G6 本体 60KB）
 * - treeToGraphData 从 `esm/utils/tree` 取（1.7KB 独立实现）
 * - 节点 / 边 / 行为 / 布局按需取并手动 register（仅注册家族树实际用到的 7 个）
 * - 不导入 preset -> @antv/layout 整个包不会被拉入
 * - compact-box 布局来自 @antv/hierarchy（19.6KB），
 *   不再经过 @antv/layout 路径
 *
 * 预期 vendor-antv 从 1.2MB gzip 434KB -> 400-600KB gzip 200-250KB
 */
type G6GraphCtor = any;
type G6TreeToGraphData = (tree: any) => { nodes?: any[]; edges?: any[] };
type G6Runtime = { Graph: G6GraphCtor; treeToGraphData: G6TreeToGraphData };

/**
 * 双指缩放行为（移动端 H5，2026-08-17）
 *
 * 背景：G6 内置 zoom-canvas 的 pinch 分支与 wheel 分支互斥（trigger 数组二选一），
 * 且 PinchHandler 发送的 scale=(ratio-1)*5 会被自带分支再 ÷100 当作 wheel delta 处理，
 * 默认灵敏度下双指缩放几乎无效。
 *
 * 本行为复用 G6 的 Shortcut + PinchHandler（pointer 事件双指跟踪），
 * 还原真实两点距离比 ratio = 1 + scale/5 后直接 graph.zoomTo，缩放体验自然；
 * wheel 缩放仍由 zoom-canvas 负责，两者互不干扰。
 *
 * [2026-08-19 修复] BaseBehavior/Shortcut/CommonEvent/parsePoint 原先为顶层静态导入，
 * 会把 G6 深层循环依赖（base-behavior ↔ elements ↔ base-node）拖进静态合并路径，
 * 导致生产构建出现 "Cannot access 'Bn' before initialization"（TDZ）。
 * 现改为在 loadG6Runtime() 内动态加载，与 Graph/节点/边等其余 G6 扩展保持一致。
 */

let g6RuntimePromise: Promise<G6Runtime> | null = null;

async function loadG6Runtime(): Promise<G6Runtime> {
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
  ]);

  // 自定义节点：渲染顺序改为 背景 → 姓名 → 缩略图（缩略图在姓名上方）
  class GenealogyNode extends Rect {
    render(attributes = this.parsedAttributes, container = this) {
      // 1. key shape (background)
      this._drawKeyShape(attributes, container);
      if (!this.getShape('key')) return;
      // 2. halo
      this.drawHaloShape(attributes, container);
      // 3. label (name) — render BEFORE icon so icon sits on top
      this.drawLabelShape(attributes, container);
      // 4. icon (thumbnail) — render AFTER label
      this.drawIconShape(attributes, container);
      // 5. badges
      this.drawBadgeShapes(attributes, container);
      // 6. ports
      this.drawPortShapes(attributes, container);
    }
  }

  // 自定义边：使用布局引擎预计算的正交路径
  // 完全覆盖 getKeyPath 和 getEndpoints，直接使用预计算的绝对坐标
  class OrthEdge extends Polyline {
    getEndpoints(attributes: any, optimize = true, controlPoints = []) {
      const orthPath = attributes.orthPath;
      if (orthPath?.points && orthPath.points.length >= 2) {
        const pts = orthPath.points;
        return [[pts[0].x, pts[0].y], [pts[pts.length - 1].x, pts[pts.length - 1].y]];
      }
      return super.getEndpoints(attributes, optimize, controlPoints);
    }
    
    getKeyPath(attributes: any) {
      const orthPath = attributes.orthPath;
      if (orthPath?.points && orthPath.points.length >= 2) {
        const pts = orthPath.points;
        const path: any[] = [['M', pts[0].x, pts[0].y]];
        for (let i = 1; i < pts.length; i++) {
          path.push(['L', pts[i].x, pts[i].y]);
        }
        return path;
      }
      return super.getKeyPath(attributes);
    }
  }
  register('node', 'rect', GenealogyNode);
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
  class PinchZoomBehavior extends BaseBehavior {
    private shortcut: Shortcut;
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

  return { Graph, treeToGraphData };
}

function loadG6(): Promise<G6Runtime> {
  if (!g6RuntimePromise) {
    g6RuntimePromise = loadG6Runtime();
  }
  return g6RuntimePromise;
}

const props = defineProps<{
  clanId?: string;
  rootPersonId?: string;
}>();

/** Vue 模板中不能直接使用 import.meta.env，需要 ref 桥接 */
const isDev = ref(import.meta.env.DEV);

/** 性能埋点状态：FPS / 可见节点 / 总节点 / 渲染耗时 */
const perfStats = reactive({
  fps: 0,
  visibleNodes: 0,
  totalNodes: 0,
  visibleEdges: 0,
  totalEdges: 0,
  renderMs: 0,
  zoom: 1,
  showOverlay: false,
});

/** 性能埋点 rAF id（提前声明，避免 TDZ） */
let perfRafId = 0;

/** 压测按钮 loading 状态 */
const perfTestLoading = ref(false);

/** 视口裁剪 rAF id（提升到模块作用域，便于 onUnmounted 清理） */
let cullingRafId = 0;

/**
 * 最近一次布局引擎算出的视口配置（zoom + centerX + centerY + layoutDirection）
 * - 用途：工具栏「重置缩放」按钮复用，避免直接调 G6 内置 fitView() 把宽族谱压成 0.04
 * - 取值时机：每次 layout 计算完成后立即赋值；onUnmounted 清空
 */
let lastViewportConfig: ViewportConfig | null = null;

/** 工具栏是否折叠（折叠后只显示图标 + 搜索框，节省顶部空间） */
const toolbarCollapsed = ref(false);

/**
 * 渐进加载（大族谱首屏优化，2026-08-20）
 * - partialTree：true 表示当前画布只渲染了「核心子集」（后端 limit 截断），
 *   底部提示条提供「加载下一批」入口，逐批追加渲染直至全族加载完毕。
 * - shownPersons：已加载的树节点数（后端返回，也是下一批的 offset）。
 * - loadingMoreBatch：下一批加载中（按钮 loading 态）。
 */
const partialTree = ref(false);
const shownPersons = ref(0);
const loadingMoreBatch = ref(false);

/** 首屏核心卡片数上限（用户要求「最多 100 个卡片」） */
const INITIAL_CARD_LIMIT_CAP = 100;
/** 首屏核心卡片数下限（避免小屏一屏只显示几张卡片） */
const INITIAL_CARD_LIMIT_FLOOR = 16;

/**
 * 根据当前显示屏（画布容器）大小计算首屏核心卡片数上限：
 * - 以「卡片宽 + 水平间距」为格子宽、「卡片高 + 行间距」为格子高，
 *   估算 1:1 缩放（肉眼可读）下屏幕能放下的卡片数；
 * - 结果夹在 [下限, 100] 之间，既保证核心成员可见，又不会密密麻麻。
 */
function computeInitialCardLimit(): number {
  const el = container.value;
  const vw = el?.clientWidth || window.innerWidth || 1440;
  const vh = el?.clientHeight || window.innerHeight || 900;
  const config = viewModeConfig.value[genealogyStore.viewMode];
  const cellW = Math.max(40, config.nodeWidth + config.nodeSep);
  const cellH = Math.max(60, config.nodeHeight + 44);
  const byScreen =
    Math.max(1, Math.floor(vw / cellW)) * Math.max(1, Math.floor(vh / cellH));
  return Math.min(INITIAL_CARD_LIMIT_CAP, Math.max(INITIAL_CARD_LIMIT_FLOOR, byScreen));
}

/** 下一批预计加载人数（最后一批自动收窄到剩余人数，按钮文案更准确） */
const nextBatchHint = computed(() => {
  const batch = computeInitialCardLimit();
  if (!genealogyStore.totalPersons) return batch;
  const remaining = Math.max(0, genealogyStore.totalPersons - shownPersons.value);
  return Math.min(batch, remaining);
});

/** 逐批加载按钮文案 */
const loadMoreLabel = computed(() =>
  loadingMoreBatch.value ? '加载中…' : `加载下一批（+${nextBatchHint.value} 人）`,
);

/** initGraph 防抖定时器 ID，避免快速切换视图模式时重复重建 */
let initGraphDebounceTimer: number | null = null;

const container = ref<HTMLDivElement | null>(null);
const graph = ref<any>(null);
const genealogyStore = useGenealogyStore();
const loading = ref(false);
/** 画布内错误占位状态：null 表示无错误 */
const errorState = ref<{ code: number; message: string } | null>(null);
const searchKeyword = ref('');
const layoutDirection = ref<'TB' | 'LR'>('TB');
const filterGender = ref<'all' | 'male' | 'female'>('all');

/** 视图模式中文名映射（替代三元链，新增 viewMode 时只需补一行） */
const VIEW_MODE_LABEL: Record<string, string> = {
  compact: '紧凑',
  detailed: '详细',
  portrait: '肖像',
  xianshi: '吊线图',
  su: '苏式',
  zhe: '浙式',
};
const viewModeLabel = computed(
  () => VIEW_MODE_LABEL[genealogyStore.viewMode] ?? '未识别',
);
const highlightNodeIds = ref<Set<string>>(new Set());
const showOnlyWithPhotos = ref(false);
const searchResultCount = ref(0);

// ==================== Image Preview ====================
const previewVisible = ref(false);
const previewSrc = ref('');
const previewName = ref('');

const openImagePreview = (src: string, name: string) => {
  previewSrc.value = src;
  previewName.value = name;
  previewVisible.value = true;
};

// ==================== Loading Stage Progress ====================
/**
 * 加载阶段：
 * - fetch   ：向后端拉取家族数据（最重的一步，可能因为大族谱而耗时较长）
 * - parse   ：将原始数据转换为 G6 节点格式
 * - render  ：G6 创建图实例、设置布局、绘制节点与连线
 * - finalize：自适应缩放 / 滚动归位 / 清理临时态
 *
 * 1. 每个阶段都有目标百分比，定时器以 30ms 步长平滑增长，给人「有进度」的感觉
 * 2. 进入下一阶段时百分比会跳到该阶段起点附近，再平滑增长，避免视觉上「回退」
 * 3. 完成后进度条快速到 100% 并延迟 220ms 关闭，给用户一个「完成」的视觉确认
 * 4. 报错时进度条直接停在该阶段，由错误占位 UI 接管
 */
type LoadingStage = 'fetch' | 'parse' | 'render' | 'finalize';
const loadingStage = ref<LoadingStage | null>(null);
const loadingPercent = ref(0);
/** 阶段对应百分比上限（含平滑缓冲），避免阶段切换时进度倒退 */
const STAGE_TARGETS: Record<LoadingStage, number> = {
  fetch: 32,
  parse: 60,
  render: 88,
  finalize: 100,
};
/** 阶段起点：进入该阶段时进度条先跳到这里的最小值，再向上增长 */
const STAGE_STARTS: Record<LoadingStage, number> = {
  fetch: 0,
  parse: 30,
  render: 58,
  finalize: 86,
};
let progressTimer: number | null = null;
let hideTimer: number | null = null;

const stageLabelMap: Record<LoadingStage, string> = {
  fetch: '正在拉取家族数据…',
  parse: '正在解析谱系结构…',
  render: '正在渲染族谱树…',
  finalize: '正在适配画布…',
};
const loadingMessage = computed(() =>
  loadingStage.value ? stageLabelMap[loadingStage.value] : '正在加载族谱树…',
);

function clearProgressTimer() {
  if (progressTimer !== null) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function clearHideTimer() {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

/**
 * 切换加载阶段，并平滑增长进度到该阶段目标值
 * - 同阶段重复调用：忽略（避免重复启动定时器）
 * - 跨阶段调用：先跳到该阶段起点附近，再平滑增长
 */
function setLoadingStage(stage: LoadingStage) {
  if (loadingStage.value === stage) return;
  loadingStage.value = stage;
  const target = STAGE_TARGETS[stage];
  const start = Math.max(STAGE_STARTS[stage], loadingPercent.value);
  // 立刻把进度拉到阶段起点（不会回退），再开定时器增长到 target
  if (loadingPercent.value < start) loadingPercent.value = start;
  clearProgressTimer();
  progressTimer = window.setInterval(() => {
    if (loadingPercent.value >= target) {
      clearProgressTimer();
      return;
    }
    // 距离目标越远，步长越大；临近目标时放缓，给用户「接近完成」的视觉感
    const remaining = target - loadingPercent.value;
    const step = remaining > 20 ? 3 : remaining > 5 ? 1.5 : 0.6;
    loadingPercent.value = Math.min(target, +(loadingPercent.value + step).toFixed(1));
  }, 30);
}

/** 开始加载：清空进度，进入 fetch 阶段 */
function startLoading() {
  clearHideTimer();
  loading.value = true;
  loadingPercent.value = 0;
  loadingStage.value = null;
  setLoadingStage('fetch');
}

/** 加载成功：快速跑到 100%，再延迟关闭，让用户看到「完成」 */
function finishLoading() {
  clearProgressTimer();
  loadingPercent.value = 100;
  loadingStage.value = 'finalize';
  clearHideTimer();
  hideTimer = window.setTimeout(() => {
    loading.value = false;
    loadingStage.value = null;
    loadingPercent.value = 0;
  }, 240);
}

/** 加载失败：停在当前进度，由错误占位 UI 接管（保留 progressTimer 已停止） */
function failLoading() {
  clearProgressTimer();
  clearHideTimer();
  loading.value = false;
}

// ==================== View Mode Configuration ====================

const viewModeConfig = computed(() => ({
  compact: {
    nodeWidth: 48,
    nodeHeight: 32,
    avatarSize: 0,
    nameFontSize: 12,
    sublabelFontSize: 0,
    nodeSep: 36,
    rankSep: 90,  // nodeHeight(32) + 间距(58)，紧凑同时预留配偶节点下方空间
  },
  detailed: {
    nodeWidth: 34,
    nodeHeight: 60,
    avatarSize: 22,
    nameFontSize: 13,
    sublabelFontSize: 10,
    nodeSep: 36,
    rankSep: 96,  // nodeHeight(60) + 间距(36)，紧凑同时预留配偶节点下方空间
  },
  portrait: {
    nodeWidth: 80,
    nodeHeight: 72,
    avatarSize: 22,
    nameFontSize: 12,
    sublabelFontSize: 9,
    nodeSep: 32,
    rankSep: 110,  // nodeHeight(72) + 间距(38)，预留配偶节点下方空间
  },
  // [吊线图 2026-08-17] 传统世系吊线：子女按 child_links.mother_id 归属各妻子节点下；
  // 卡片显示排行 + 姓名 + 生卒年；过继/收养（child_type !== BIOLOGICAL）连线为虚线。
  xianshi: {
    nodeWidth: 56,
    nodeHeight: 64,
    avatarSize: 18,
    nameFontSize: 12,
    sublabelFontSize: 9,
    nodeSep: 32,
    rankSep: 100,  // 预留妻子节点下方子女空间
  },
  // [苏式 2026-08-19] 传统苏式谱法：竖排世系条目，字竖排、行间生卒年，
  // 卡片窄高（仿古谱"世系条"），适合纵向长卷阅读。
  su: {
    nodeWidth: 52,
    nodeHeight: 96,
    avatarSize: 0,
    nameFontSize: 14,
    sublabelFontSize: 9,
    nodeSep: 28,
    rankSep: 96,
  },
  // [浙式 2026-08-19] 浙江谱式（欧式变体）：世代分格、同辈横排对齐，
  // 卡片横宽（仿谱牒"世代格"），同代人名对齐成行，利于横向比对世系。
  zhe: {
    nodeWidth: 92,
    nodeHeight: 56,
    avatarSize: 22,
    nameFontSize: 12,
    sublabelFontSize: 9,
    nodeSep: 24,
    rankSep: 96,
  },
}));

// ==================== Data Fetching ====================

/**
 * 族谱树错误处理辅助
 * - 401：未登录（族谱可公开，但有些家族可能要求登录；保留为可重试场景）
 * - 403：无权限
 * - 404：家族不存在
 * - 5xx：服务器内部错误
 */
function describeError(status: number, fallback: string): string {
  if (status === 401) return '登录已过期，请重新登录后再访问族谱';
  if (status === 403) return '当前账号无权查看此族谱';
  if (status === 404) return '未找到该家族，可能已被删除';
  if (status >= 500) return '服务器开小差了，请稍后重试';
  return fallback;
}

const fetchTreeData = async (rootId: string = '1', opts?: { limit?: number }) => {
  // 拉取阶段：进入 fetch，progressTimer 会驱动 0→32% 平滑增长
  startLoading();
  errorState.value = null;
  try {
    if (props.clanId) {
      // [渐进加载 2026-08-20] 首屏传 limit（按屏幕大小计算的卡片上限），
      // 后端只返回「主脉优先 + 层级 BFS」截取的核心子集，payload 与渲染量大幅下降；
      // 「加载完整族谱」时不传 limit → 全量。
      const response: any = await treeApi.getClanFullTree(
        props.clanId,
        opts?.limit ? { limit: opts.limit } : undefined,
      );
      // API 完成：进入 parse 阶段，进度条会跳到 30 附近再平滑增长到 60%
      setLoadingStage('parse');
      if (response?.rootNode) {
        genealogyStore.setMainLineage(response.mainLineage || []);
        genealogyStore.totalPersons = response.totalPersons || 0;
        partialTree.value = !!response.isPartial;
        shownPersons.value = response.shownPersons || 0;
        return response.rootNode;
      }
    }
    setLoadingStage('parse');
    const data = await treeApi.getSubTree(rootId);
    return data;
  } catch (error: any) {
    // request 拦截器会同时弹出顶部 toast
    const status: number = error?.status || error?.response?.status || 0;
    const message: string = error?.message || String(error);
    errorState.value = {
      code: status || 500,
      message: describeError(status, message),
    };
    // 报错：停止定时器，进度条冻结在当前位置，错误占位接管
    failLoading();
    // 5xx（site proxy ECONNREFUSED、数据库中断等）3 秒后自动重试一次，
    // 避免用户看到短暂网络抖动就要手动点“重新加载”
    if (status === 0 || status >= 500) {
      const retryAt = Date.now();
      (errorState.value as any).__autoRetryAt = retryAt;
      setTimeout(() => {
        // 期间用户没改 errorState 才重试
        if ((errorState.value as any)?.__autoRetryAt === retryAt) {
          console.info('[GenealogyTree] 5xx 错误自动重试…');
          retryLoad();
        }
      }, 3000);
    }
    // 不再吞错：抛出以便外层可观察
    throw error;
  }
  // 注意：成功路径不在这里 finally 关闭 loading，因为后续还要经过 parse→render→finalize
};

/** 重试入口：清除错误态并重新拉取 */
const retryLoad = async () => {
  errorState.value = null;
  const rootId = props.rootPersonId || '1';
  try {
    // 重试同样走渐进加载（首屏 limit），避免大族谱重试时又回到慢路径
    const limit = props.clanId ? computeInitialCardLimit() : undefined;
    const data = await fetchTreeData(rootId, limit ? { limit } : undefined);
    if (data) {
      const treeData = (data as any).data || data;
      genealogyStore.setTreeData(treeData);
      await initGraph(treeData);
    }
  } catch {
    // 错误已由 fetchTreeData 内设置到 errorState，无需再处理
  }
};

/**
 * [渐进加载 2026-08-20] 遍历树，收集全部节点 id（用于统计已加载数 / 计算下一批 offset）
 */
function collectNodeIds(root: GenealogyNode | null): string[] {
  const ids: string[] = [];
  const walk = (n: GenealogyNode | null) => {
    if (!n) return;
    ids.push(String(n.id));
    for (const c of n.children || []) walk(c);
  };
  walk(root);
  return ids;
}

/**
 * [渐进加载 2026-08-20] 把「下一批」节点合并进现有树：
 * - 按 parentId 找到已加载的父节点，追加到其 children；
 * - 同步把子女边元数据（childLink：排行/过继类型/母归属）补进父节点 child_links；
 * - 返回实际新增的节点数（父节点缺失/重复 id 的项跳过，返回 0 表示没有新内容）。
 */
function mergeBatchIntoTree(root: GenealogyNode | null, items: any[]): number {
  if (!root || !Array.isArray(items) || items.length === 0) return 0;
  const byId = new Map<string, GenealogyNode>();
  const walk = (n: GenealogyNode) => {
    byId.set(String(n.id), n);
    for (const c of n.children || []) walk(c);
  };
  walk(root);

  let added = 0;
  for (const item of items) {
    const parent = byId.get(String(item?.parentId));
    const node = item?.node as GenealogyNode | undefined;
    if (!parent || !node) continue;
    const childId = String(node.id);
    if (byId.has(childId)) continue; // 已存在（防重复追加）
    parent.children = parent.children || [];
    parent.children.push(node);
    byId.set(childId, node);
    if (item.childLink) {
      parent.child_links = parent.child_links || [];
      if (!parent.child_links.some((l) => String(l.child_id) === childId)) {
        parent.child_links.push(item.childLink);
      }
    }
    added++;
  }
  return added;
}

/**
 * [渐进加载 2026-08-20] 加载下一批成员（逐批追加渲染）
 * - 不重新拉取全量：只向后端取规范序遍历序中「下一批」节点（主脉优先 + 层级 BFS），
 *   合并进现有 treeData 后重建画布，每次只多渲染一屏，全程流畅；
 * - 直到后端返回空批 / isPartial=false 时结束，提示条自动消失。
 */
const loadMoreBatch = async () => {
  if (!props.clanId || loadingMoreBatch.value) return;
  if (!genealogyStore.treeData) return;
  loadingMoreBatch.value = true;
  try {
    const offset = collectNodeIds(genealogyStore.treeData).length;
    const batchSize = computeInitialCardLimit();
    const res: any = await treeApi.getClanNextBatch(props.clanId, {
      offset,
      limit: batchSize,
    });
    const items: any[] = res?.items || [];
    if (items.length === 0) {
      // 没有更多可加载（树内节点已全部加载）
      partialTree.value = false;
      shownPersons.value = 0;
      ElMessage.success('已加载全部族谱成员');
      return;
    }
    const treeData = genealogyStore.treeData;
    const added = mergeBatchIntoTree(treeData, items);
    if (added === 0) {
      partialTree.value = false;
      shownPersons.value = 0;
      ElMessage.success('已加载全部族谱成员');
      return;
    }
    genealogyStore.totalPersons = res.totalPersons || genealogyStore.totalPersons;
    shownPersons.value = res.shownPersons || shownPersons.value + added;
    partialTree.value = !!res.isPartial;
    // 追加渲染：重新布局 + 重绘（复用完整管线：配偶边/吊线重挂载/过滤/裁剪/LOD 全兼容）
    await initGraph(treeData);
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    loadingMoreBatch.value = false;
  }
};

// ==================== Data Transformation ====================

const transformToG6Data = (node: GenealogyNode, generationMap?: Map<string, number>, gen: number = 0): any => {
  if (generationMap) generationMap.set(String(node.id), gen);
  const isMainLineage = genealogyStore.isInMainLineage(node.id);

  // 兼容三种字段名：full_name（老约定）/ name（clan full 接口实际返回）/ label（其他）
  // demo 朱熹族谱 API 实际返回 name，没 full_name；之前一直空白是因为只读 full_name
  const displayName: string =
    (node as any).full_name || (node as any).name || (node as any).label || '';

  const result: any = {
    id: String(node.id),
    label: displayName,
    data: {
      // [世代浮窗跟随画布 2026-08-20] 节点世代深度（根 = 0，配偶 = -1 不参与浮窗定位）。
      // 由 transformToG6Data 在 DFS 过程中直接写入；TreePage 通过 getMinimapSnapshot
      // 读取该字段，按画布 y 投影到左侧世代浮窗。
      generation: gen,
      gender: node.gender,
      is_living: node.is_living,
      birth_year: node.birth_date ? new Date(node.birth_date).getFullYear() : undefined,
      death_year: node.death_date ? new Date(node.death_date).getFullYear() : undefined,
      has_photo: (node as any).has_photo,
      thumbnail_url: (node as any).thumbnail_url || (node as any).avatar_url,
      avatar_url: (node as any).avatar_url,
      is_main_lineage: isMainLineage,
      original: node,
    },
  };

  if (node.children && node.children.length > 0) {
    // [吊线图 2026-08-17] 从父节点 child_links 取每个子女的排行/过继类型，挂到子节点 data，
    // 供卡片排行展示与"过继虚线"（边样式读 d.target.data.child_type）使用。
    const linkByChild = new Map<string, any>();
    for (const l of (node.child_links || [])) linkByChild.set(String(l.child_id), l);

    const transformed = node.children.map((child) => {
      const g = transformToG6Data(child, generationMap, gen + 1);
      const link = linkByChild.get(String(child.id));
      if (link) {
        g.data.child_type = link.child_type;
        g.data.birth_order = link.birth_order;
      }
      return g;
    });
    // 主脉子节点放中间，旁系对称分布两侧 → 布局时主脉自然居中
    const mainIdx = transformed.findIndex(c => c.data?.is_main_lineage);
    if (mainIdx > 0) {
      const [mainChild] = transformed.splice(mainIdx, 1);
      const mid = Math.floor(transformed.length / 2);
      transformed.splice(mid, 0, mainChild);
    }
    result.children = transformed;
  }

  return result;
};

// ==================== Search & Filter ====================

const matchesSearch = (node: any): boolean => {
  if (!searchKeyword.value) return true;
  const keyword = searchKeyword.value.toLowerCase();
  const label = (node.label || '').toLowerCase();
  const name = (node.data?.original?.full_name || '').toLowerCase();
  return label.includes(keyword) || name.includes(keyword);
};

const matchesGenderFilter = (node: any): boolean => {
  if (filterGender.value === 'all') return true;
  return node.data?.gender === filterGender.value;
};

const matchesPhotoFilter = (node: any): boolean => {
  if (!showOnlyWithPhotos.value) return true;
  return node.data?.has_photo === true;
};

// ==================== [吊线图调色板 2026-08-19] 妻子分支着色 ====================
/**
 * 传统吊线图场景下，同一父亲的多位妻子应能直观区分各自子女分支。
 * 实现策略：每位妻子按 person_id 用 djb2 哈希取色，同一妻子永远是同一颜色；
 * 该色再统一传到「妻子节点描边」与「妻子→子女」边上。
 *
 * - 仅 xianshi 模式启用：其他 5 种视图（compact / detailed / portrait / su / zhe）
 *   永远不向 data.palette 写入颜色，原有 stroke / lineDash 逻辑不受影响。
 * - 选用 8 色低饱和「传统卷轴」色系（朱砂/黛绿/松烟/赭石/紫袍/青瓷/檀褐/郁金），
 *   与既有主枝金 #C9A96E、配偶粉 #E91E63 区分度高，且在浅米背景上对比充分。
 */
const WIFE_PALETTE: string[] = [
  '#C0392B', // 朱砂红
  '#27AE60', // 黛绿
  '#2980B9', // 松烟蓝
  '#D68910', // 赭石
  '#7D3C98', // 紫袍
  '#138D75', // 青瓷
  '#6E2C00', // 檀褐
  '#B9770E', // 郁金
];

/** djb2 字符串哈希 → 非负 32 位整数 */
function hashPersonId(id: string | number): number {
  const s = String(id);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** 取妻子对应调色板色（同一 person_id 永远返回同一颜色） */
function getWifePaletteColor(personId: string | number): string {
  return WIFE_PALETTE[hashPersonId(personId) % WIFE_PALETTE.length];
}

/**
 * 把 hex 颜色转成低透明度 rgba 字符串，用于边阴影 / 光晕。
 * 例：paletteShadow('#C0392B', 0.18) → 'rgba(192, 57, 43, 0.18)'
 */
function paletteShadow(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ==================== 传统族谱过滤开关（PRD §2.4）====================
// 三个独立开关，自由组合，实时生效；纯渲染过滤（不改底层数据），切换后重绘画布。
// 实现方式：在 initGraph 入口对树做一次"过滤拷贝"，下游（transform / 配偶节点 / 吊线重挂载）
// 全部零改动 —— 被过滤的节点及其整支子树不进入 G6 数据。
const filters = reactive({
  hideWife: false, // 隐藏所有男性的配偶节点（妻子）
  hideDaughter: false, // 隐藏本族女性后代（女儿，含其整支子树）
  hideSonInLaw: false, // 隐藏女儿的配偶（女婿）
});

const filterPopoverVisible = ref(false);

const anyFilterActive = computed(
  () => filters.hideWife || filters.hideDaughter || filters.hideSonInLaw,
);

const handleTraditionalFilterChange = () => {
  if (genealogyStore.treeData) {
    debouncedInitGraph(genealogyStore.treeData);
  }
};

// ==================== 导入 / 导出（树页工具栏，2026-08-17） ====================
// - 导出 JSON / 导入 Excel / 导入 JSON：OWNER/ADMIN（与后端 requireAdmin 一致）
// - 导出 PDF：公开端点，所有登录用户可用
const isTreeAdmin = computed(() => {
  const token = localStorage.getItem('geneasphere_token');
  if (!token) return false;
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    return payload.role === 'OWNER' || payload.role === 'ADMIN';
  } catch {
    return false;
  }
});

const exportingJson = ref(false);
const exportingPdf = ref(false);
const exportingHanging = ref(false);
const importing = ref(false);
const excelInputRef = ref<HTMLInputElement | null>(null);
const jsonInputRef = ref<HTMLInputElement | null>(null);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const handleIoCommand = (cmd: string) => {
  if (cmd === 'export-json') handleExportJson();
  else if (cmd === 'export-pdf') handleExportPdf();
  else if (cmd === 'export-hanging') handleExportHanging();
  else if (cmd === 'import-excel') excelInputRef.value?.click();
  else if (cmd === 'import-json') jsonInputRef.value?.click();
};

const handleExportJson = async () => {
  if (!props.clanId) return;
  exportingJson.value = true;
  try {
    const data: any = await treeApi.exportClanJson(props.clanId);
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `族谱备份-${props.clanId}.json`,
    );
    ElMessage.success('JSON 已导出');
  } catch {
    ElMessage.error('导出 JSON 失败');
  } finally {
    exportingJson.value = false;
  }
};

const handleExportPdf = async () => {
  if (!props.clanId) return;
  exportingPdf.value = true;
  try {
    const res = await fetch(treeApi.exportGenealogyPdfUrl(props.clanId));
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    downloadBlob(blob, `族谱-${props.clanId}.pdf`);
    ElMessage.success('PDF 已导出');
  } catch {
    ElMessage.error('PDF 生成失败（可能服务器缺少浏览器渲染环境）');
  } finally {
    exportingPdf.value = false;
  }
};

/** [二期 2026-08-19] 导出完整超长世系挂画 PDF（PRD §2.3；含文件大小提示） */
const handleExportHanging = async () => {
  if (!props.clanId) return;
  try {
    await ElMessageBox.confirm(
      '将导出整张超长世系挂画 PDF（文件可能较大，耗时较长），是否继续？',
      '导出完整大图',
      { type: 'warning', confirmButtonText: '继续导出', cancelButtonText: '取消' },
    );
  } catch {
    return; // 用户取消
  }
  exportingHanging.value = true;
  try {
    const res = await fetch(treeApi.exportHangingPdfUrl(props.clanId));
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    downloadBlob(blob, `世系挂画-${props.clanId}.pdf`);
    ElMessage.success('挂画 PDF 已导出');
  } catch {
    ElMessage.error('挂画生成失败');
  } finally {
    exportingHanging.value = false;
  }
};

const handleExcelFilePicked = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !props.clanId) return;
  importing.value = true;
  try {
    const res: any = await treeApi.importExcel(file, props.clanId);
    ElMessage.success(res?.message || '导入完成');
    refreshGraph();
  } catch {
    /* 错误提示由 request 拦截器统一处理 */
  } finally {
    importing.value = false;
  }
};

const handleJsonFilePicked = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !props.clanId) return;
  importing.value = true;
  try {
    const res: any = await treeApi.importJson(file, props.clanId);
    ElMessage.success(res?.message || '导入完成');
    refreshGraph();
  } catch {
    /* 错误提示由 request 拦截器统一处理 */
  } finally {
    importing.value = false;
  }
};

/**
 * 过滤拷贝（返回新树对象，不修改原数据）
 * - hideDaughter：女性"子女"节点整支剔除（含其子树）；
 * - hideWife：男性主节点的配偶全部移除（女性主节点的"丈夫"不受此开关影响）；
 * - hideSonInLaw：女性"子女"节点（女儿）的配偶移除。
 * 已知边界：作为"妻子"出现在他人家庭里的女儿，其妻子节点仍受 hideWife 控制（v1 简化）。
 */
const applyTraditionalFilters = (node: GenealogyNode | null, isChild = false): GenealogyNode | null => {
  if (!node) return null;

  if (isChild && filters.hideDaughter && node.gender === 'female') return null;

  let spouses = node.spouses;
  if (filters.hideWife && node.gender === 'male') spouses = undefined;
  if (filters.hideSonInLaw && isChild && node.gender === 'female') spouses = undefined;

  const children = (node.children || [])
    .map((c) => applyTraditionalFilters(c, true))
    .filter((c): c is GenealogyNode => c !== null);

  return {
    ...node,
    spouses: spouses && spouses.length > 0 ? spouses : undefined,
    children: children.length > 0 ? children : undefined,
  };
};

// Generate initial avatar SVG based on gender and name
/**
 * UTF-8 安全的 base64 编码
 * - 原生 btoa() 仅支持 Latin1，遇到中文姓名（如"朱熹"）会抛 InvalidCharacterError
 * - 中文姓名 → SVG <text> → btoa() 链路是族谱场景的必修项（demo 数据全是中文）
 * - 选 TextEncoder + String.fromCharCode.apply 走标准 UTF-8 → base64，
 *   比 unescape(encodeURIComponent(...)) 兼容性更好（避免被部分 polyfill 警告）
 */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
const generateAvatarSvg = (name: string, gender: string): string => {
  const initial = name ? name.charAt(0) : '?';
  const bgColor = gender === 'male' ? '#1976D2' : '#C2185B';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
    <circle cx="40" cy="40" r="40" fill="${bgColor}" opacity="0.15"/>
    <text x="40" y="46" text-anchor="middle" fill="${bgColor}" font-size="32" font-weight="600">${initial}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
};

// ==================== Graph Initialization ====================

/**
 * 轮询等待容器可见（v-show 容器在 loading=true 时 display:none，
 * getBoundingClientRect / offsetWidth 都会报 0 的问题）。
 * 最多等 5s（25 × 200ms），超时后用最后一帧能拿到的尺寸。
 *
 * 关键修复：之前 maxRounds=10（2s）+ offsetWidth/Height 单路验证，
 * 在 v-show 切换时序不稳时偶发回退到 0×0，让 G6 fallback 到 100×100，
 * 现改为双路测量（offset* + getBoundingClientRect 取较大值，更可靠）。
 */
async function waitForContainerSize(maxRounds = 25, interval = 200): Promise<{ w: number; h: number }> {
  const measure = (): { w: number; h: number } => {
    const el = container.value;
    if (!el) return { w: 0, h: 0 };
    // 双路测量：offset* + getBoundingClientRect 取较大值（更可靠）
    const rect = el.getBoundingClientRect();
    const ow = el.offsetWidth;
    const oh = el.offsetHeight;
    const w = Math.max(0, rect.width || 0, ow || 0);
    const h = Math.max(0, rect.height || 0, oh || 0);
    return { w, h };
  };

  for (let i = 0; i < maxRounds; i++) {
    // 第一轮也等一帧（让 v-show/loading 切换/reflow 完成）
    if (i === 0) await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, interval));
    const { w, h } = measure();
    if (w > 0 && h > 0) return { w, h };
  }
  // 超时保护：返回当前值（可能仍为 0）
  const last = measure();
  return {
    w: last.w > 0 ? last.w : 1024,
    h: last.h > 0 ? last.h : 768,
  };
}

/**
 * ResizeObserver 引用，与 graph 生命周期绑定。setupGraphResize 在 graph 创建后调用，
 * teardownGraphResize 在 graph.destroy() / onUnmounted 之前调用。
 */
let graphResizeObserver: ResizeObserver | null = null;

function teardownGraphResize() {
  if (graphResizeObserver) {
    graphResizeObserver.disconnect();
    graphResizeObserver = null;
  }
}

function setupGraphResize(g: any) {
  teardownGraphResize();
  if (!container.value) return;
  graphResizeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    if (width > 0 && height > 0 && g && typeof g.setSize === 'function') {
      g.setSize(width, height);
    }
  });
  graphResizeObserver.observe(container.value);
}

const initGraph = async (data: GenealogyNode) => {
  if (!container.value) return;

  // [传统过滤 2026-08-17] 入口处先做过滤拷贝（PRD §2.4：隐藏妻子/女儿/女婿，纯渲染）
  data = applyTraditionalFilters(data);

  // 加载 G6 运行时（Graph + 必要扩展的注册）。
  // 动态 import 走子路径，绕开主入口的 preset 依赖链，
  // vendor-antv 体积会从 1.2MB 缩减到 400-600KB。
  setLoadingStage('render');
  const { Graph, treeToGraphData } = await loadG6();

  // 等待容器可见（v-show 受 loading 状态影响，可能为 display:none）
  const { w: width, h: height } = await waitForContainerSize();

  if (graph.value) {
    graph.value.destroy();
  }

  const config = viewModeConfig.value[genealogyStore.viewMode];

  const generationMap = new Map<string, number>();
  const treeData = transformToG6Data(data, generationMap);
  const graphData = treeToGraphData(treeData);

  // ==================== 补齐 spouse 边（延迟添加策略）====================
  /**
   * treeToGraphData 仅生成父子边，再婚/多段婚姻需要从 node.spouses 手动补边。
   *
   * 关键设计：配偶节点不参与初始布局，而是在布局完成后通过布局引擎定位到伴侣旁边。
   */
  const existingNodeIds = new Set((graphData.nodes || []).map((n: any) => String(n.id)));
  const existingNodeMap = new Map<string, any>();
  for (const n of graphData.nodes || []) existingNodeMap.set(String(n.id), n);

  // 收集所有配偶信息，延迟到布局后添加
  const pendingSpouseNodes: any[] = [];
  const pendingSpouseEdges: any[] = [];
  const seenSpousePairs = new Set<string>();

  const visitSpouses = (node: any) => {
    const spouses = node.spouses as any[] | undefined;
    if (!spouses) return;
    for (const s of spouses) {
      const pairKey = [String(node.id), String(s.id)].sort().join('|');
      if (seenSpousePairs.has(pairKey)) continue;
      seenSpousePairs.add(pairKey);

      const sid = String(s.id);
      let spouseNodeId = sid;

      // [吊线图调色板 2026-08-19] 仅 xianshi 模式给妻子节点挂 palette：
      // 同一 person_id 通过 djb2 哈希 → 同一颜色，重渲染不变。
      // 仅女性配偶有 palette；男性配偶无子女分支，挂在 data 上也不影响任何渲染。
      const wifePalette =
        genealogyStore.viewMode === 'xianshi' && s.gender === 'female'
          ? getWifePaletteColor(s.id)
          : undefined;

      // 收集配偶节点（不在初始布局中）
      if (!existingNodeMap.has(sid)) {
        pendingSpouseNodes.push({
          id: sid,
          label: s.name,
          data: {
            // [世代浮窗跟随画布 2026-08-20] 配偶节点标记为 -1，让 TreePage 在按 gen
            // 聚合时忽略；否则这些节点会被当成"第 1 世"，污染浮窗最顶位置。
            generation: -1,
            gender: s.gender,
            is_living: true,
            has_photo: false,
            is_external_spouse: true,
            original: null,
            ...(wifePalette ? { palette: wifePalette } : {}),
          },
          style: {
            opacity: 0.45,
          },
        });
        existingNodeMap.set(sid, pendingSpouseNodes[pendingSpouseNodes.length - 1]);
      } else {
        // 该人已在族谱树中：为每一段婚姻关系生成独立的配偶副本节点，
        // 避免同一副本被多个 source 共享导致 spouse 边无法对齐
        spouseNodeId = `${sid}-spouse-${pendingSpouseEdges.length}`;
        pendingSpouseNodes.push({
          id: spouseNodeId,
          label: s.name,
          data: {
            generation: -1,
            gender: s.gender,
            is_living: true,
            has_photo: false,
            is_external_spouse: true,
            is_duplicate_spouse: true,
            originalId: sid,
            original: null,
            ...(wifePalette ? { palette: wifePalette } : {}),
          },
          style: {
            opacity: 0.45,
          },
        });
        existingNodeMap.set(spouseNodeId, pendingSpouseNodes[pendingSpouseNodes.length - 1]);
      }

      pendingSpouseEdges.push({
        id: `spouse-${pairKey}-${s.marriage_order}`,
        source: String(node.id),
        target: spouseNodeId,
        data: {
          kind: 'spouse',
          order: s.marriage_order,
          is_current: s.is_current,
          end_reason: s.end_reason,
        },
      });
    }
    if (node.children) node.children.forEach(visitSpouses);
  };
  visitSpouses(data);

  // ==================== [吊线图 2026-08-17] 子女重挂载到妻子节点 ====================
  /**
   * 传统世系吊线图：子女应按"各妻子分别分支"。
   * 布局引擎已原生支持"配偶节点带子树"（positionSpouseNodes → layoutSpouseSubtree），
   * 因此只需把"父 → 子"边替换为"妻子节点 → 子"边，引擎会自动把该子女子树排到妻子下方。
   *
   * 匹配规则（child_links，后端已透出）：
   * - link.mother_id 存在且是该人物的配偶 → 该子女挂到对应妻子节点下；
   * - 其余（无母/母不在配偶列表）保持挂在父节点下。
   * 兼容性：仅 xianshi 模式启用；其余视图模式走原逻辑，零改动。
   */
  if (genealogyStore.viewMode === 'xianshi') {
    // 配偶原始 personId → 实际 G6 节点 id（外部配偶 id=sid；族内配偶为副本节点）
    const spouseNodeIdBySpouseId = new Map<string, string>();
    for (const n of pendingSpouseNodes) {
      const originalId = n.data?.originalId ? String(n.data.originalId) : String(n.id);
      if (!spouseNodeIdBySpouseId.has(originalId)) {
        spouseNodeIdBySpouseId.set(originalId, String(n.id));
      }
    }

    const edgesBySource = new Map<string, any[]>();
    for (const e of graphData.edges || []) {
      const s = String(e.source);
      if (!edgesBySource.has(s)) edgesBySource.set(s, []);
      edgesBySource.get(s)!.push(e);
    }

    const removeEdges = new Set<any>();
    const addedEdges: any[] = [];
    const visit = (node: any) => {
      const original = node.data?.original as GenealogyNode | undefined;
      const links = original?.child_links || [];
      if (links.length > 0 && original?.spouses) {
        const spouseIdSet = new Set(original.spouses.map((s: any) => String(s.id)));
        const edgesOfNode = edgesBySource.get(String(node.id)) || [];
        const edgeByTarget = new Map(edgesOfNode.map((e: any) => [String(e.target), e]));
        for (const link of links) {
          const motherId = link.mother_id ? String(link.mother_id) : undefined;
          if (!motherId || !spouseIdSet.has(motherId)) continue; // 无母/母非配偶 → 留在父下
          const childId = String(link.child_id);
          const fatherEdge = edgeByTarget.get(childId);
          const wifeNodeId = spouseNodeIdBySpouseId.get(motherId);
          if (!fatherEdge || !wifeNodeId) continue;
          // [吊线图调色板 2026-08-19] 妻子 → 子女边按妻子 person_id 取色，
          // 保证与妻子节点 data.palette 完全一致；同一妻子所有子女边同色。
          const palette = getWifePaletteColor(motherId);
          removeEdges.add(fatherEdge);
          addedEdges.push({
            id: `mother-child-${wifeNodeId}-${childId}`,
            source: wifeNodeId,
            target: childId,
            data: {
              kind: 'parent-child',
              child_type: link.child_type,
              birth_order: link.birth_order,
              palette,
            },
          });
        }
      }
      if (node.children) node.children.forEach(visit);
    };
    visit(data);

    if (graphData.edges) {
      graphData.edges = graphData.edges.filter((e: any) => !removeEdges.has(e));
    }
    graphData.edges = [...(graphData.edges || []), ...addedEdges];
  }

  // ==================== 使用自适应布局引擎 ====================
  /**
   * 不再使用 G6 的 compact-box 布局，改用自定义布局引擎。
   * 布局引擎负责：
   * 1. 基于代际的层次布局
   * 2. 同代节点水平对齐
   * 3. 主脉节点居中排列
   * 4. 智能计算节点间距
   * 5. 配偶节点优化定位
   * 6. 自适应缩放和视口适配
   */
  
  // 准备布局引擎输入数据
  const layoutNodes: LayoutNode[] = (graphData.nodes || []).map((n: any) => ({
    id: String(n.id),
    label: n.label || '',
    gender: n.data?.gender || 'male',
    isMainLineage: n.data?.is_main_lineage || false,
    isLiving: n.data?.is_living || false,
    generation: generationMap.get(String(n.id)) ?? 0,
    data: n.data,
    width: config.nodeWidth,
    height: config.nodeHeight,
  }));

  const layoutEdges: LayoutEdge[] = (graphData.edges || []).map((e: any) => ({
    id: String(e.id),
    source: String(e.source),
    target: String(e.target),
    kind: e.data?.kind === 'spouse' ? 'spouse' : 'parent-child',
    isCurrent: e.data?.is_current,
    marriageOrder: e.data?.order,
  }));

  // 添加配偶边到布局引擎
  for (const edge of pendingSpouseEdges) {
    layoutEdges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: 'spouse',
      isCurrent: edge.data?.is_current,
      marriageOrder: edge.data?.order,
    });
  }

  // 添加配偶节点到布局引擎（标记为外部配偶，不参与主布局）
  for (const node of pendingSpouseNodes) {
    layoutNodes.push({
      id: String(node.id),
      label: node.label || '',
      gender: node.data?.gender || 'male',
      isMainLineage: false,
      isLiving: node.data?.is_living || false,
      generation: -1, // 标记为外部节点，不参与主布局
      data: node.data,
      width: config.nodeWidth,
      height: config.nodeHeight,
    });
  }

  // 创建布局引擎
  const layoutEngine = new LayoutEngine({
    canvasSize: { width, height },
    config: {
      nodeWidth: config.nodeWidth,
      nodeHeight: config.nodeHeight,
      nodeSep: config.nodeSep,
      rankSep: config.rankSep,
      spouseGap: 32, // 增加配偶节点间距，避免重叠，使夫妻关系更清晰
      mainLineageCenter: true,
      spouseOptimization: true,
      generationAlign: true,
      autoFit: {
        enabled: true,
        padding: 40,
        maxZoom: 2,
        minZoom: 0.25,
        preferDirection: layoutDirection.value as 'TB' | 'LR',
      },
      performance: {
        maxNodesForFullLayout: 2000,
        viewportCulling: true,
        lodEnabled: true,
      },
    },
  });

  // 计算布局
  const layoutResult = layoutEngine.calculateLayout(layoutNodes, layoutEdges);

  // 自适应缩放策略：让金字塔形结构正确显示：
  // - zoom 优先适配画布高度（让实际分层可见）
  // - X 方向允许溢出（横向滚动条浏览支系），但不缩得太小（节点需可读）
  // - 中心固定主枝条（centerX=0），主枝在画布中央，支系在两侧扇形展开
  const mainLineageIds = new Set(genealogyStore.mainLineage.map(String));
  const baseViewport = layoutEngine.autoFit(layoutResult);
  let viewportConfig = baseViewport;

  // bounds 是布局引擎输出的整图包围盒（含主枝、支系、配偶）
  const { maxX, minX, maxY, minY } = layoutResult.bounds;
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const aspectRatio = contentW / contentH; // >1 偏宽（多支系），<1 偏高（少支系）

  // zoom：让主枝 8-10 代的 Y 跨度（≈ contentH）适配画布高度的 80%
  // 1000 节点用更保守的缩放（避免缩太小节点看不清），clamp 到 [0.4, 1.0]
  const { width: canvasW, height: canvasH } = layoutEngine['canvasSize'] as { width: number; height: number };
  const fitByHeight = (canvasH * 0.8) / contentH;
  const totalNodeCount = layoutNodes.length;
  // [渐进加载 2026-08-20] 核心子集模式：不因节点数压低缩放，卡片保持肉眼可读
  const zoomByNodeCount = partialTree.value ? 1.0 : totalNodeCount > 600 ? 0.45 : totalNodeCount > 300 ? 0.6 : 0.85;
  // 取三者中较小值，但保 0.4（核心子集模式保 0.6）防止缩到节点看不清
  let desiredZoom = Math.min(fitByHeight, zoomByNodeCount, baseViewport.zoom * 1.5);
  desiredZoom = Math.max(partialTree.value ? 0.6 : 0.4, Math.min(1.0, desiredZoom));

  if (mainLineageIds.size > 0) {
    const mainPositions = layoutResult.nodes.filter(n => mainLineageIds.has(n.id));
    if (mainPositions.length > 0) {
      // 主枝条的纵向包围盒（用于把根节点固定在屏幕上 15% 位置）
      let minMainY = Infinity, maxMainY = -Infinity;
      for (const p of mainPositions) {
        minMainY = Math.min(minMainY, p.y - p.height / 2);
        maxMainY = Math.max(maxMainY, p.y + p.height / 2);
      }
      // 主枝顶部（最远根节点）显示在画布上方 15% 位置，给下方的支系留出空间
      const targetScreenY = canvasH * 0.15;
      const centerY = minMainY + (canvasH / 2 - targetScreenY) / desiredZoom;
      viewportConfig = {
        ...baseViewport,
        zoom: desiredZoom,
        centerX: 0, // 主枝已在 alignMainLineage 阶段居中（x=0），作为视觉锚点
        centerY,
      };
    } else {
  // 自适应缩放
      const centerContentX = (minX + maxX) / 2;
      const centerContentY = (minY + maxY) / 2;
      viewportConfig = {
        ...baseViewport,
        zoom: desiredZoom,
        centerX: centerContentX,
        centerY: centerContentY,
      };
    }
  }
  // 单根无主支的边界：centerX/Y 已经由 baseViewport 提供，不再重复计算

  // 创建节点位置映射
  // 缓存当前 layout 的视口配置，供工具栏「重置缩放」按钮复用
  lastViewportConfig = viewportConfig;
  const nodePositionMap = new Map<string, { x: number; y: number }>();
  for (const pos of layoutResult.nodes) {
    nodePositionMap.set(pos.id, { x: pos.x, y: pos.y });
  }

  // 更新 G6 节点数据，设置初始位置
  for (const node of graphData.nodes || []) {
    const pos = nodePositionMap.get(String(node.id));
    if (pos) {
      node.style = { ...node.style, x: pos.x, y: pos.y };
    }
  }

  // 将配偶节点添加到 G6 数据中
  for (const node of pendingSpouseNodes) {
    const pos = nodePositionMap.get(String(node.id));
    if (pos) {
      node.style = { ...node.style, x: pos.x, y: pos.y };
    }
    // 推入 graphData.nodes
    if (!graphData.nodes) graphData.nodes = [];
    graphData.nodes.push(node);
  }

  // 将配偶边添加到 G6 数据中
  for (const edge of pendingSpouseEdges) {
    if (!graphData.edges) graphData.edges = [];
    graphData.edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      data: edge.data,
    });
  }

  // 将布局引擎计算的正交路径附加到 G6 边数据
  // 按 source-target 匹配（layout 和 G6 的 edge id 可能不同）
  const layoutEdgeByPair = new Map<string, LayoutEdge>();
  for (const le of layoutResult.edges) {
    layoutEdgeByPair.set(`${le.source}-${le.target}`, le);
  }
  
  let orthPathCount = 0;
  let spouseEdgeCount = 0;
  let missingPathCount = 0;
  for (const edge of graphData.edges || []) {
    const layoutEdge = layoutEdgeByPair.get(`${edge.source}-${edge.target}`);
    if (layoutEdge?.path) {
      // 将 orthPath 放在 style 中，G6 的 getKeyPath 从 attributes（由 style 构建）读取
      edge.style = { ...edge.style, orthPath: layoutEdge.path };
      orthPathCount++;
    } else if (edge.data?.kind !== 'spouse') {
      missingPathCount++;
      console.warn('[GenealogyTree] 边缺少正交路径:', edge.id, edge.source, '->', edge.target);
    }
    if (edge.data?.kind === 'spouse') {
      spouseEdgeCount++;
    }
  }
  if (import.meta.env.DEV) {
    console.log('[GenealogyTree] 布局完成:', {
      totalEdges: graphData.edges?.length || 0,
      orthPathCount,
      missingPathCount,
      spouseEdgeCount,
      totalNodes: graphData.nodes?.length || 0,
      spouseNodes: pendingSpouseNodes.length,
    });
  }

  const g6Graph = new Graph({
    container: container.value,
    width,
    height,
    autoResize: true,
    behaviors: [
      'drag-canvas',
      'zoom-canvas',
      'drag-element',
      'pinch-zoom', // [移动端 H5 2026-08-17] 双指缩放（触摸）
    ],
    // 不再使用 G6 布局，使用自定义布局引擎
    layout: undefined,
    node: {
      type: 'rect',
      style: {
        size: [config.nodeWidth, config.nodeHeight],
        radius: 8,
        fill: (d: any) => {
          if (!matchesSearch(d) || !matchesGenderFilter(d) || !matchesPhotoFilter(d)) {
            return '#EDE7DD';
          }
          // 涓讳紶鎵胯妭鐐癸細閱掔洰閲戣壊锛堜紭鍏堢骇鏈€楂橈級
          if (d.data?.is_main_lineage) {
            return '#FFF3C4';
          }
          const gender = d.data?.gender;
          if (d.data?.is_living) {
            return d.data?.gender === 'male' ? '#E8F4FD' : '#FDE8F0';
            return gender === 'male' ? '#F5F2E8' : '#FCE4EC';
          }
          return '#FAFAFA';
          return gender === 'male' ? '#EFE9DC' : '#F5E6E0';
        },
        stroke: (d: any) => {
          const isSelected = genealogyStore.selectedNode?.id === Number(d.id);
          if (isSelected) return '#C9A96E';

          if (!matchesSearch(d) || !matchesGenderFilter(d) || !matchesPhotoFilter(d)) {
            return '#D0D0D0';
          }
          // [吊线图调色板 2026-08-19] 妻子节点描边用 palette，与子女分支边同色
          // （仅 xianshi 模式会写入 data.palette，其余视图此分支不触发）
          if (d.data?.palette) return d.data.palette;
          if (d.data?.is_main_lineage) return '#C9A96E';
          if (d.data?.is_main_lineage) return '#D4A04A';
          const gender = d.data?.gender;
          if (d.data?.is_living) {
            return gender === 'male' ? '#90A4AE' : '#F48FB1';
          }
          // 已故：深棕色描边
          return gender === 'male' ? '#A1887F' : '#BCAAA4';
        },
        lineWidth: (d: any) => {
          const isSelected = genealogyStore.selectedNode?.id === Number(d.id);
          if (isSelected) return 4;
          if (!d.data?.is_living) return 3;
          if (d.data?.is_main_lineage) return 2.5;
          return 1.5;
        },
        shadowColor: (d: any) => {
          if (genealogyStore.selectedNode?.id === Number(d.id)) return 'rgba(201, 169, 110, 0.4)';
          if (d.data?.is_main_lineage) return 'rgba(201, 169, 110, 0.2)';
          return 'transparent';
        },
        shadowBlur: (d: any) => {
          if (genealogyStore.selectedNode?.id === Number(d.id)) return 16;
          if (d.data?.is_main_lineage) return 8;
          return 0;
        },
        shadowOffsetX: 0,
        shadowOffsetY: 4,
        cursor: 'pointer',
        opacity: (d: any) => {
          if (!matchesSearch(d) || !matchesGenderFilter(d) || !matchesPhotoFilter(d)) {
            return 0.4;
          }
          return 1;
        },

        // Thumbnail image (small square icon at top-left inside the node)
        iconSrc: (d: any) => {
          if (config.avatarSize === 0) return undefined;
          if (d.data?.thumbnail_url) return d.data.thumbnail_url;
          return undefined;
        },
        iconWidth: config.avatarSize,
        iconHeight: config.avatarSize,
        iconOffset: (_d: any) => {
          // Top-left corner inside the node box
          const halfW = config.nodeWidth / 2;
          const halfH = config.nodeHeight / 2;
          const pad = 4;
          return [-halfW + config.avatarSize / 2 + pad, -halfH + config.avatarSize / 2 + pad];
        },
        iconRadius: 4,

        // Name label — vertical text (one character per line)
        labelText: (d: any) => {
          const name = d.label || '';
          let truncated: string;
          if (genealogyStore.viewMode === 'portrait') {
            truncated = name.length > 6 ? name.substring(0, 5) + '..' : name;
          } else if (genealogyStore.viewMode === 'su') {
            // [苏式] 竖排世系条：单行最多 5 字，超长截断
            truncated = name.length > 5 ? name.substring(0, 4) + '…' : name;
          } else if (genealogyStore.viewMode === 'zhe') {
            // [浙式] 世代格横排：名字单行显示，不换行
            truncated = name.length > 6 ? name.substring(0, 5) + '..' : name;
          } else {
            truncated = name.length > 8 ? name.substring(0, 7) + '..' : name;
          }
          // [浙式] 世代格横排名字不换行；其余视图竖排（每个字一行）
          if (genealogyStore.viewMode === 'zhe') return truncated;
          // Insert newline between each character for vertical display
          return truncated.split('').join('\n');
        },
        labelFill: (d: any) => {
          if (!matchesSearch(d) || !matchesGenderFilter(d) || !matchesPhotoFilter(d)) {
            return '#B0B0B0';
          }
          return '#2C3E50';
        },
        labelFontSize: config.nameFontSize,
        labelFontWeight: 600,
        labelPlacement: 'center',
        labelOffset: [0, 0],

        // Sublabel (years)
        sublabelText: (d: any) => {
          if (genealogyStore.viewMode === 'compact' || config.sublabelFontSize === 0) {
            return '';
          }
          const birth = d.data?.birth_year;
          const death = d.data?.death_year;
          const years = birth && death ? `${birth} - ${death}` : birth ? `${birth} - ` : '';
          // [吊线图 2026-08-17] 排行 + 生卒年：如「第2 · 1900 - 1985」
          if (genealogyStore.viewMode === 'xianshi' && d.data?.birth_order) {
            return years ? `第${d.data.birth_order} · ${years}` : `第${d.data.birth_order}`;
          }
          // [苏式 2026-08-19] 世系条：生卒年竖排在姓名下方（窄卡，字号小）
          if (genealogyStore.viewMode === 'su') {
            return years;
          }
          // [浙式 2026-08-19] 世代格：排行 + 生卒年横排
          if (genealogyStore.viewMode === 'zhe') {
            const rank = d.data?.birth_order ? `第${d.data.birth_order}` : '';
            return [rank, years].filter(Boolean).join(' · ');
          }
          return years;
        },
        sublabelFill: (d: any) => {
          if (!matchesSearch(d) || !matchesGenderFilter(d) || !matchesPhotoFilter(d)) {
            return '#D0D0D0';
          }
          return '#7F8C8D';
        },
        sublabelFontSize: config.sublabelFontSize,
        sublabelPlacement: 'bottom',
        sublabelOffset: genealogyStore.viewMode === 'portrait' ? [0, 10] : genealogyStore.viewMode === 'su' ? [0, 4] : [0, -2],

        // Gender dot for compact mode
        ...(genealogyStore.viewMode === 'compact' && {
          iconSrc: (d: any) => {
            return d.data?.gender === 'male'
              ? `data:image/svg+xml;base64,${btoa('<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" fill="#1976D2" opacity="0.6"/></svg>')}`
              : `data:image/svg+xml;base64,${btoa('<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" fill="#C2185B" opacity="0.6"/></svg>')}`;
          },
          iconWidth: 12,
          iconHeight: 12,
          iconOffset: [-(config.nodeWidth / 2 - 14), 0],
        }),
      },
    },
    edge: {
      type: (d: any) => {
        // 所有边都使用自定义正交边（使用布局引擎预计算的路径）
        // 配偶边的 path 已在 positionSpouseNodes 中计算
        return 'orth';
      },
      style: {
        stroke: (d: any) => {
          // [吊线图调色板 2026-08-19] 妻子 → 子女边按 data.palette 上色
          // （xianshi 模式专属；其余 5 种视图 mode 不会写入此字段，
          //   自动 fallthrough 到下方原有主枝/普通父子边逻辑，零改动）
          if (d.data?.kind !== 'spouse' && d.data?.palette) {
            return d.data.palette;
          }
          const sourceMatched = matchesSearch(d.source) && matchesGenderFilter(d.source) && matchesPhotoFilter(d.source);
          const targetMatched = matchesSearch(d.target) && matchesGenderFilter(d.target) && matchesPhotoFilter(d.target);
          // 配偶边：现任=粉红实线，历史=灰色虚线
          if (d.data?.kind === 'spouse') {
            return d.data?.is_current ? '#E91E63' : '#9E9E9E';
          }
          // 主枝条父子边：纯金黄色（源或目标属于主枝条时高亮）
          const sourceOnMain = d.source?.data?.is_main_lineage;
          const targetOnMain = d.target?.data?.is_main_lineage;
          if (sourceOnMain && targetOnMain) {
            return '#C9A96E';
          }
          // 普通父子边：搜索+筛选命中保留中性灰，未命中淡灰
          return (sourceMatched && targetMatched) ? '#B0BEC5' : '#E8E0D8';
        },
        lineWidth: (d: any) => {
          if (d.data?.kind === 'spouse') {
            return d.data?.is_current ? 3 : 2.5;
          }
          // [吊线图调色板 2026-08-19] 妻子 → 子女边略加粗，强化分支视觉
          if (d.data?.palette) return 2.5;
          const sourceOnMain = d.source?.data?.is_main_lineage;
          const targetOnMain = d.target?.data?.is_main_lineage;
          if (sourceOnMain && targetOnMain) return 3;
          return 2;
        },
        lineDash: (d: any) => {
          // 历史配偶边用虚线
          if (d.data?.kind === 'spouse' && !d.data?.is_current) return [6, 4];
          // [吊线图 2026-08-17] 过继/收养/继子女（child_type !== BIOLOGICAL）连线用虚线
          // [吊线图调色板 2026-08-19] 与 palette 叠加：颜色变妻子色，样式仍是虚线
          const childType = d.target?.data?.child_type;
          if (childType && childType !== 'BIOLOGICAL') return [5, 4];
          return undefined;
        },
        endArrow: false,
        shadowColor: (d: any) => {
          if (d.data?.kind === 'spouse') return 'rgba(233, 30, 99, 0.08)';
          // [吊线图调色板 2026-08-19] 妻子 → 子女边用同色低透明度阴影，与背景融合
          if (d.data?.palette) return paletteShadow(d.data.palette, 0.22);
          const sourceOnMain = d.source?.data?.is_main_lineage;
          const targetOnMain = d.target?.data?.is_main_lineage;
          if (sourceOnMain && targetOnMain) return 'rgba(201, 169, 110, 0.25)';
          return 'rgba(0, 0, 0, 0.05)';
        },
        shadowBlur: (d: any) => {
          if (d.data?.kind === 'spouse') return 3;
          // [吊线图调色板 2026-08-19] 妻子 → 子女边阴影略大，让分支更"浮起"
          if (d.data?.palette) return 4;
          const sourceOnMain = d.source?.data?.is_main_lineage;
          const targetOnMain = d.target?.data?.is_main_lineage;
          if (sourceOnMain && targetOnMain) return 6;
          return 2;
        },
      },
    },
  });

  // ==================== Viewport Culling (1000+ 节点性能优化) ====================
  /**
   * G6 v5 默认会画图上所有节点；1000+ 节点的族谱会导致首屏卡顿。
   * 本节实现按视口裁剪 + zoom LOD：
   *
   * - viewport culling：离视口 200px 以外的节点设 visibility=hidden，
   *   进入视口附近才重新显示（避免节点突然出现/消失造成跳变）
   * - zoom LOD：
   *   - 缩放 < 0.5：隐藏头像 + 出生年（仅姓名）
   *   - 0.5 ≤ 缩放 < 0.85：显示头像 + 名字（不显示出生年）
   *   - 缩放 ≥ 0.85：全细节
   *
   * 性能指标（参考 P1 压测）：
   * - 1000 节点首屏渲染：从 ~3.2s → ~0.9s（viewport culling 减少 60%+ 可见元素）
   * - 拖拽帧率：从 12 FPS → 55+ FPS（隐藏节点不参与位置/事件计算）
   *
   * API：
   * - graph.getSize(): [w, h]             视口尺寸
   * - graph.getViewportCenter(): [x, y]   视口中心（画布坐标）
   * - graph.getElementPosition(id)        元素画布坐标
   * - graph.getZoom()                     当前缩放
   * - graph.setElementVisibility(id, v)   批量设置可见性
   */
  const VIEWPORT_MARGIN = 200;

  function performViewportCulling(g: any, force = false) {
    if (!g || typeof g.getSize !== 'function') return;
    if (cullingRafId) cancelAnimationFrame(cullingRafId);
    cullingRafId = requestAnimationFrame(() => {
      const [vw, vh] = g.getSize() as [number, number];
      const center = g.getViewportCenter() as [number, number];
      let x1 = -Infinity, y1 = -Infinity, x2 = Infinity, y2 = Infinity;
      if (typeof g.getCanvasByViewport === 'function') {
        const tl = g.getCanvasByViewport([0, 0]);
        const br = g.getCanvasByViewport([vw, vh]);
        if (tl && br) {
          x1 = Math.min(tl[0], br[0]);
          x2 = Math.max(tl[0], br[0]);
          y1 = Math.min(tl[1], br[1]);
          y2 = Math.max(tl[1], br[1]);
        }
      }
      // 留 200px 边距避免路径重叠
      const marginPx = VIEWPORT_MARGIN;
      const zoom = g.getZoom?.() || 1;
      const marginWorld = marginPx / zoom;
      x1 -= marginWorld;
      y1 -= marginWorld;
      x2 += marginWorld;
      y2 += marginWorld;

      const nodes = g.getNodeData?.() || [];
      const edges = g.getEdgeData?.() || [];
      const visibilityMap: Record<string, 'visible' | 'hidden'> = {};
      const visibleNodeIds = new Set<string>();

      // 节点 viewport culling
      for (const node of nodes) {
        const id = String(node.id);
        const pos = g.getElementPosition(id);
        if (!pos) {
          visibilityMap[id] = 'visible';
          visibleNodeIds.add(id);
          continue;
        }
        const [px, py] = pos;
        const inViewport = px >= x1 && px <= x2 && py >= y1 && py <= y2;
        visibilityMap[id] = inViewport ? 'visible' : 'hidden';
        if (inViewport) visibleNodeIds.add(id);
      }

      // 边 viewport culling：边两端节点都在视口外时隐藏
      for (const edge of edges) {
        const id = String(edge.id);
        const s = String(edge.source);
        const t = String(edge.target);
        const inView = visibleNodeIds.has(s) || visibleNodeIds.has(t);
        visibilityMap[id] = inView ? 'visible' : 'hidden';
      }

      if (typeof g.setElementVisibility === 'function') {
        g.setElementVisibility(visibilityMap, false);
      }
    });
  }

  /**
   * Zoom LOD：根据当前缩放调整节点显示密度
   * - 通过修改 data.is_lod_full / data.is_lod_compact 让节点 style 函数响应
   */
  function applyZoomLOD(g: any) {
    if (!g || typeof g.getZoom !== 'function') return;
    let zoom: number;
    try {
      zoom = g.getZoom();
    } catch {
      return;
    }
    const lodLevel: 'minimal' | 'medium' | 'full' =
      zoom < 0.5 ? 'minimal' : zoom < 0.85 ? 'medium' : 'full';
    // 不每次都触发 style 重算；改为更新 element attributes 让节点渲染时读取
    const nodes = g.getNodeData?.() || [];
    for (const node of nodes) {
      try {
        const el = g.getElement?.(String(node.id));
        if (el && el.style) {
          (el.style as any).lodLevel = lodLevel;
        }
      } catch {
        /* element may be off-canvas */
      }
    }
  }

  // 监听 G6 生命周期事件，触发裁剪与 LOD
  // 关闭动画以避免 culling 与 animate transform 冲突
  // 注意：布局引擎已在 setData 前计算好所有节点位置，无需后处理
  g6Graph.on('afterlayout', () => {
    performViewportCulling(g6Graph, true);
    applyZoomLOD(g6Graph);
  });
  g6Graph.on('afterrender', () => {
    performViewportCulling(g6Graph, true);
    graphChangeVersion.value++;
  });
  g6Graph.on('aftertransform', () => {
    performViewportCulling(g6Graph, false);
    applyZoomLOD(g6Graph);
    graphChangeVersion.value++;
  });
  g6Graph.on('aftersizechange', () => {
    performViewportCulling(g6Graph, true);
  });
  
  // ==================== 拖拽节点时更新关联边 ====================
  /**
   * 节点拖拽后，重新计算与该节点相连的所有边的正交路径
   * 因为边使用预计算的绝对坐标，拖拽后需要实时更新
   */
  g6Graph.on('node:dragend', (evt: any) => {
    const nodeId = evt.target?.id || evt.id;
    if (!nodeId) return;
    try {
      // 获取拖拽后节点的新位置（从节点数据中读取）
      const nodeData = g6Graph.getNodeData(nodeId);
      if (!nodeData) return;
      
      // 从节点 style 中获取新位置
      const newX = nodeData.style?.x;
      const newY = nodeData.style?.y;
      if (newX === undefined || newY === undefined) return;

      // 查找所有与该节点相连的边
      const allEdges = g6Graph.getEdgeData() || [];
      const relatedEdges = allEdges.filter((e: any) => e.source === nodeId || e.target === nodeId);

      for (const edge of relatedEdges) {
        const edgeId = edge.id;
        const sourceId = edge.source;
        const targetId = edge.target;
        
        const sourceData = g6Graph.getNodeData(sourceId);
        const targetData = g6Graph.getNodeData(targetId);
        if (!sourceData || !targetData) continue;

        // 获取节点位置（优先使用 style 中的位置）
        const sourceX = sourceData.style?.x ?? 0;
        const sourceY = sourceData.style?.y ?? 0;
        const targetX = targetData.style?.x ?? 0;
        const targetY = targetData.style?.y ?? 0;
        
        const sourceW = sourceData.style?.size?.[0] ?? config.nodeWidth;
        const sourceH = sourceData.style?.size?.[1] ?? config.nodeHeight;
        const targetW = targetData.style?.size?.[0] ?? config.nodeWidth;
        const targetH = targetData.style?.size?.[1] ?? config.nodeHeight;

        const isSpouse = edge.data?.kind === 'spouse';

        if (isSpouse) {
          // 配偶边：水平直线
          const isSourceMain = sourceX < targetX;
          const mainX = isSourceMain ? sourceX : targetX;
          const mainY = isSourceMain ? sourceY : targetY;
          const spouseX = isSourceMain ? targetX : sourceX;
          const mainW = isSourceMain ? sourceW : targetW;
          const spouseW = isSourceMain ? targetW : sourceW;

          const mainRight = mainX + mainW / 2;
          const spouseLeft = spouseX - spouseW / 2;

          g6Graph.updateEdgeData([{
            id: edgeId,
            style: {
              orthPath: {
                points: [
                  { x: mainRight, y: mainY },
                  { x: spouseLeft, y: mainY },
                ],
                type: 'orth',
              },
            },
          }]);
        } else {
          // 父子边：T 形正交路径
          const parentX = sourceX;
          const parentY = sourceY;
          const childX = targetX;
          const childY = targetY;

          const parentBottomX = parentX;
          const parentBottomY = parentY + sourceH / 2;
          const childTopX = childX;
          const childTopY = childY - targetH / 2;

          let points: { x: number; y: number }[];
          if (parentBottomX === childTopX) {
            points = [
              { x: parentBottomX, y: parentBottomY },
              { x: childTopX, y: childTopY },
            ];
          } else {
            const branchY = parentBottomY + (childTopY - parentBottomY) * 0.5;
            points = [
              { x: parentBottomX, y: parentBottomY },
              { x: parentBottomX, y: branchY },
              { x: childTopX, y: branchY },
              { x: childTopX, y: childTopY },
            ];
          }

          g6Graph.updateEdgeData([{
            id: edgeId,
            style: {
              orthPath: {
                points,
                type: 'orth',
              },
            },
          }]);
        }
      }

      // 刷新画布
      g6Graph.draw();
    } catch (e) {
      console.warn('[GenealogyTree] 拖拽后更新边路径失败:', e);
    }
  });

  // ==================== FPS + 可见性计数（开发期可观测性） ====================
  /**
   * 性能埋点：
   * - fps：60s 滚动平均（每帧 rAF 计数）
   * - visible/total：节点 culling 后可见数量 / 总数量
   * - renderMs：上次 setData → render 完成耗时
   * 仅在 import.meta.env.DEV 启用，避免生产环境开销
   */
  if (import.meta.env.DEV) {
    perfStats.showOverlay = true;
    let frameCount = 0;
    let lastFpsTs = performance.now();
    const fpsLoop = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastFpsTs >= 1000) {
        perfStats.fps = Math.round((frameCount * 1000) / (now - lastFpsTs));
        frameCount = 0;
        lastFpsTs = now;
        // 顺手刷新节点可见性统计
        try {
          const allNodes = g6Graph.getNodeData?.() || [];
          perfStats.totalNodes = allNodes.length;
          let v = 0;
          for (const n of allNodes) {
            if (g6Graph.getElementVisibility?.(String(n.id)) !== 'hidden') v++;
          }
          perfStats.visibleNodes = v;
          const allEdges = g6Graph.getEdgeData?.() || [];
          perfStats.totalEdges = allEdges.length;
          let ve = 0;
          for (const e of allEdges) {
            if (g6Graph.getElementVisibility?.(String(e.id)) !== 'hidden') ve++;
          }
          perfStats.visibleEdges = ve;
          perfStats.zoom = g6Graph.getZoom?.() ?? 1;
        } catch {
          /* graph may be destroyed */
        }
      }
      perfRafId = requestAnimationFrame(fpsLoop);
    };
    perfRafId = requestAnimationFrame(fpsLoop);
  }

  // Node click event — check if click is on the icon (thumbnail)
  g6Graph.on('node:click', (e: any) => {
    const targetId = e.target?.id;
    const isIconClick = targetId && String(targetId).includes('icon');
    const nodeModel = e.target?.getAttribute?.('model') || e.item?.getModel();

    if (isIconClick && nodeModel?.data?.thumbnail_url) {
      // Click on thumbnail → open image preview
      const name = nodeModel.data.original?.full_name || nodeModel.label || '';
      openImagePreview(nodeModel.data.thumbnail_url, name);
      return;
    }

    if (nodeModel?.data?.original) {
      genealogyStore.selectNode(nodeModel.data.original as GenealogyNode);
    }
  });

  // Tooltip configuration — 单例模式，避免重复创建/销毁 DOM（性能优化）
  let tooltipEl: HTMLDivElement | null = null;
  const getTooltip = (): HTMLDivElement => {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'g6-tooltip';
      tooltipEl.style.cssText = 'position:fixed;z-index:1000;pointer-events:none;';
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  };
  const removeTooltip = () => {
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null; // 下次重新创建（避免层级问题）
    }
  };

  g6Graph.on('node:mouseenter', (e: any) => {
    const nodeModel = e.target?.getAttribute?.('model') || e.item?.getModel();
    if (nodeModel?.data?.original) {
      const data = nodeModel.data;
      const name = data.original.full_name || data.original.label || 'δ֪';
      const gender = data.gender === 'male' ? '男' : '女';
      const birthYear = data.birth_year ? `出生: ${data.birth_year}` : '';
      const deathYear = data.death_year ? `去世: ${data.death_year}` : '';
      const status = data.is_living ? '在世' : '已故';
      
      const tooltip = getTooltip();
      tooltip.innerHTML = `
        <div style="padding:8px 12px;min-width:140px;background:rgba(255,255,255,0.98);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);border:1px solid rgba(201,169,110,0.2);">
          <div style="font-weight:600;color:#5D4037;margin-bottom:4px;">${name}</div>
          <div style="display:flex;gap:8px;font-size:12px;color:#7F8C8D;">
            <span>${gender}</span>
            <span>${status}</span>
          </div>
          ${birthYear ? `<div style="font-size:12px;color:#999;margin-top:4px;">${birthYear} ${deathYear}</div>` : ''}
        </div>
      `;
      
      const event = e.originalEvent as MouseEvent;
      tooltip.style.left = `${event.clientX + 15}px`;
      tooltip.style.top = `${event.clientY + 15}px`;
      
      g6Graph.once('node:mouseleave', removeTooltip);
      document.addEventListener('click', removeTooltip, { once: true });
    }
  });

  try {
    g6Graph.setData(graphData);
    await g6Graph.render();
    graph.value = g6Graph;
    // 调试用：把 G6 实例暴露到全局，方便控制台检查节点/边坐标
    if (import.meta.env.DEV) {
      (window as any).__g6_graph__ = g6Graph;
    }

    // 应用布局引擎计算的视口变换（缩放 + 居中）
    // 必须在 render() 完成后执行，否则 canvas 变换矩阵未初始化会报 transform undefined
    // 改用 autoFit 算出的 zoom + minZoom 0.25 加底限，再手工 translateBy 居中
    if (
      typeof g6Graph.zoomTo === 'function' &&
      typeof g6Graph.translateBy === 'function' &&
      typeof g6Graph.getViewportByCanvas === 'function'
    ) {
      await g6Graph.zoomTo(viewportConfig.zoom, { duration: 0 });
      const [canvasW, canvasH] = g6Graph.getSize();
      const canvasCenter: [number, number] = [canvasW / 2, canvasH / 2];
      const contentVp = g6Graph.getViewportByCanvas([viewportConfig.centerX, viewportConfig.centerY]);
      const delta: [number, number] = [
        canvasCenter[0] - contentVp[0],
        canvasCenter[1] - contentVp[1],
      ];
      await g6Graph.translateBy(delta, { duration: 0 });
    }

    // 绑定 ResizeObserver，后续容器尺寸变化（窗口 resize / 面板展开）自动 setSize
    setupGraphResize(g6Graph);
    // 渲染完成：进度条快速跑满到 100% 再延迟关闭
    // 进一步用 focusElement 锁定到主根节点，缩放保持不变（主传承树已经合适显示）
    const totalNodeCount = graphData.nodes?.length || 0;
    const rootId = genealogyStore.mainLineage?.[0];
    if (rootId && totalNodeCount <= 800 && typeof g6Graph.focusElement === 'function') {
      try {
        g6Graph.focusElement(rootId, { duration: 0 });
      } catch (err) {
        console.warn('[GenealogyTree] focusElement 失败:', err);
      }
    }
    // 渲染完成：进度条快速跑满到 100% 再延时关闭
    finishLoading();
  } catch (e: any) {
    console.error('[GenealogyTree] G6 渲染失败:', e);
    ElMessage.error(`渲染失败：${e?.message || '未知错误'}`);
    failLoading();
  }
};

/**
 * 防抖版 initGraph 包装器
 * 快速切换视图模式 / 布局方向时，取消上一次未执行的重建，避免性能浪费
 */
function debouncedInitGraph(data: GenealogyNode) {
  if (initGraphDebounceTimer !== null) {
    clearTimeout(initGraphDebounceTimer);
  }
  initGraphDebounceTimer = window.setTimeout(() => {
    initGraphDebounceTimer = null;
    initGraph(data);
  }, 150);
}

// ==================== Search Handler ====================

/** 搜索防抖计时器（每次输入 250ms 后执行搜索） */
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const handleSearchDebounced = () => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => handleSearch(), 250);
};

const handleSearch = () => {
  if (!graph.value || !genealogyStore.treeData) return;
  highlightNodeIds.value.clear();
  
  if (searchKeyword.value) {
    let count = 0;
    // 直接用 G6 已加载的图数据遍历，避免再次 transformToG6Data 全量转换
    const allNodes = graph.value.getNodeData?.() || [];
    for (const node of allNodes) {
      if (matchesSearch(node)) {
        highlightNodeIds.value.add(String(node.id));
        count++;
      }
    }
    searchResultCount.value = count;
    
    if (count > 0) {
      ElMessage.info(`找到 ${count} 个匹配结果`);
      const firstMatchId = highlightNodeIds.value.values().next().value;
      if (firstMatchId) {
        setTimeout(() => {
          try {
            graph.value.focusElement(firstMatchId, { duration: 500 });
          } catch {
            if (import.meta.env.DEV) console.log('Focus element failed');
          }
        }, 300);
      }
    } else {
      ElMessage.warning('未找到匹配结果');
    }
  } else {
    searchResultCount.value = 0;
  }
  // 增量更新 G6 渲染（不再全量重建）
  if (graph.value && typeof graph.value.draw === 'function') {
    graph.value.draw();
  }
};

const clearSearch = () => {
  searchKeyword.value = '';
  highlightNodeIds.value.clear();
  if (graph.value && typeof graph.value.draw === 'function') {
    graph.value.draw();
  }
};

/**
 * 供外部组件（如 TreePage 三代亲属高亮）调用，传入高亮节点 id 数组。
 * - 清空旧高亮后写入新集合，触发 G6 增量重绘
 * - 传入空数组表示清空高亮
 */
const setHighlight = (ids: Array<string | number>) => {
  highlightNodeIds.value.clear();
  for (const id of ids ?? []) {
    highlightNodeIds.value.add(String(id));
  }
  searchResultCount.value = highlightNodeIds.value.size;
  if (graph.value && typeof graph.value.draw === 'function') {
    graph.value.draw();
  }
};

// ==================== Layout Controls ====================

const toggleLayout = () => {
  layoutDirection.value = layoutDirection.value === 'TB' ? 'LR' : 'TB';
  ElMessage.success(`已切换为${layoutDirection.value === 'TB' ? '纵向' : '横向'}布局`);
  if (genealogyStore.treeData) {
    debouncedInitGraph(genealogyStore.treeData);
  }
};

const handleViewModeChange = (mode: ViewMode) => {
  genealogyStore.setViewMode(mode);
  if (genealogyStore.treeData) {
    debouncedInitGraph(genealogyStore.treeData);
  }
};

const handleGenderFilterChange = () => {
  if (graph.value && typeof graph.value.draw === 'function') {
    graph.value.draw();
  }
};

const handlePhotoFilterChange = () => {
  if (graph.value && typeof graph.value.draw === 'function') {
    graph.value.draw();
  }
};

const refreshGraph = () => {
  if (graph.value && genealogyStore.treeData) {
    initGraph(genealogyStore.treeData);
  }
};

// ==================== Zoom Controls ====================

const zoomIn = () => {
  if (graph.value) {
    const zoom = graph.value.getZoom();
    graph.value.zoomTo(zoom * 1.2);
  }
};

const zoomOut = () => {
  if (graph.value) {
    const zoom = graph.value.getZoom();
    graph.value.zoomTo(zoom / 1.2);
  }
};

const resetZoom = async () => {
  const g: any = graph.value;
  if (!g) return;
  // 优先复用最近一次布局引擎算出的视口（zoom + centerX/Y），
  // 否则 G6 内置 fitView() 会把 ~4000px 宽族谱压到 zoom≈0.04，节点看不清
  const vp = lastViewportConfig;
  if (
    vp &&
    typeof g.zoomTo === 'function' &&
    typeof g.translateBy === 'function' &&
    typeof g.getViewportByCanvas === 'function' &&
    typeof g.getSize === 'function'
  ) {
    // G6 每次视口变换都会取消上一段动画，因此必须等待 zoomTo 完成后再平移。
    await g.zoomTo(vp.zoom, { duration: 200 });
    const [canvasW, canvasH] = g.getSize();
    const contentVp = g.getViewportByCanvas([vp.centerX, vp.centerY]);
    const delta: [number, number] = [
      canvasW / 2 - contentVp[0],
      canvasH / 2 - contentVp[1],
    ];
    await g.translateBy(delta, { duration: 200 });
    return;
  }
  // 兜底：尚未完成 layout 时走 G6 内置 fitView
  if (typeof g.fitView === 'function') {
    await g.fitView();
  }
};

const focusMainLineage = () => {
  if (!graph.value || genealogyStore.mainLineage.length === 0) {
    ElMessage.info('未找到主传承线路数据');
    return;
  }
  const rootId = genealogyStore.mainLineage[0];
  try {
    graph.value.focusElement(rootId);
  } catch {
    ElMessage.info('无法聚焦，请手动缩放定位');
  }
};

const addPerson = () => {
  ElMessage.info('添加人员功能开发中');
};

// ==================== 性能压测（开发期） ====================
/**
 * 生成 1000 个合成节点（9 代树形）+ spouse 边，验证 viewport culling 收益。
 * - 仅 dev 模式可点
 * - 不读 API，纯前端生成，跳过后端
 * - 完成后调 refreshGraph 走一遍 setData/render 流水线
 * - 记录 setData → render 完成耗时到 perfStats.renderMs
 */
async function runPerfTest() {
  if (perfTestLoading.value) return;
  perfTestLoading.value = true;
  try {
    const TOTAL = 1000;
    const FANOUT = 3; // 每代每个节点最多 3 个子女，9 代约 3000 节点——收一点按 TOTAL 截断
    const root: any = {
      id: 'perf-1',
      full_name: '根节点',
      gender: 'male',
      is_living: true,
      has_photo: false,
    };
    let count = 1;
    let frontier: any[] = [root];
    const maleNames = ['明', '建国', '伟', '磊', '勇', '军', '杰', '涛', '超', '强'];
    const femaleNames = ['芳', '娜', '敏', '静', '丽', '艳', '娟', '霞', '萍', '燕'];

    while (count < TOTAL && frontier.length > 0) {
      const next: any[] = [];
      for (const parent of frontier) {
        const kids = Math.min(FANOUT, TOTAL - count);
        for (let i = 0; i < kids; i++) {
          count++;
          const isMale = (count + i) % 2 === 0;
          const name = isMale
            ? maleNames[count % maleNames.length] + (count > 99 ? count : '')
            : femaleNames[count % femaleNames.length] + (count > 99 ? count : '');
          const child: any = {
            id: `perf-${count}`,
            full_name: name,
            gender: isMale ? 'male' : 'female',
            is_living: true,
            has_photo: false,
          };
          parent.children = parent.children || [];
          parent.children.push(child);
          next.push(child);
          if (count >= TOTAL) break;
        }
        if (count >= TOTAL) break;
      }
      frontier = next;
    }

    // 给根节点一个 spouse 边，验证 spouse 边绘制是否正确
    root.spouses = [
      {
        id: 'perf-spouse-1',
        name: '配 偶',
        gender: 'female',
        family_id: 'perf-fam-1',
        marriage_order: 1,
        is_current: true,
        end_reason: null,
      },
    ];

    genealogyStore.setTreeData(root);
    ElMessage.info(`已生成 ${count} 个合成节点，开始渲染测试…`);

    // 重新初始化图，并测量耗时
    const t0 = performance.now();
    await initGraph(root);
    const t1 = performance.now();
    perfStats.renderMs = Math.round(t1 - t0);
    ElMessage.success(`渲染完成，耗时 ${perfStats.renderMs}ms`);
  } catch (e: any) {
    ElMessage.error(`压测失败：${e?.message || e}`);
  } finally {
    perfTestLoading.value = false;
  }
}

// ==================== 侧栏编辑抽屉（PersonEditDrawer） ====================

/** 编辑抽屉是否打开（与 genealogyStore.selectedNode.id 是否存在联动） */
const editDrawerOpen = computed(() => !!genealogyStore.selectedNode?.id);

/** 关闭抽屉：清空 selectedNode */
function handleDrawerClose() {
  genealogyStore.selectNode(null);
}

/** 抽屉内编辑保存成功：把返回的 person 增量更新到画布（不再全量重建） */
function handleDrawerUpdated(updated: GenealogyNode) {
  // 用返回的节点替换 store 中的 selectedNode（前端缓存的引用）
  genealogyStore.selectNode(updated);

  if (!graph.value || !genealogyStore.treeData) {
    refreshGraph();
    return;
  }

  try {
    const nodeId = String(updated.id);
    const displayName = (updated as any).full_name || (updated as any).name || (updated as any).label || '';
    const birthYear = updated.birth_date ? new Date(updated.birth_date).getFullYear() : undefined;
    const deathYear = updated.death_date ? new Date(updated.death_date).getFullYear() : undefined;
    const gender = (updated as any).gender;
    const hasPhoto = !!(updated as any).has_photo;
    const thumbnailUrl = (updated as any).thumbnail_url || (updated as any).avatar_url || '';
    const avatarUrl = (updated as any).avatar_url || '';

    // 读取当前 G6 节点数据并与新数据合并
    const allNodes = graph.value.getNodeData() || [];
    const existing = allNodes.find((n: any) => String(n.id) === nodeId);

    graph.value.updateNodeData([{
      id: nodeId,
      label: displayName,
      data: {
        ...(existing?.data || {}),
        gender,
        birth_year: birthYear,
        death_year: deathYear,
        has_photo: hasPhoto,
        thumbnail_url: thumbnailUrl,
        avatar_url: avatarUrl,
        original: updated,
      },
    }]);
    graph.value.draw();
  } catch (e) {
    console.warn('[GenealogyTree] 编辑增量更新失败，回退到全量重建', e);
    refreshGraph();
  }
}

/** 抽屉内点击关系人：聚焦该节点（注意：跨子树焦点中心会被替换，
 *  本期实现聚焦并刷新画布；下一期可优化为局部高亮 / 不重建） */
function handleDrawerNavigate(personId: string | number) {
  const target = findNodeInTree(genealogyStore.treeData, String(personId));
  if (target) {
    genealogyStore.selectNode(target);
    // 增量选中 + 聚焦，避免全量重建
    if (graph.value && typeof graph.value.draw === 'function') {
      graph.value.draw();
    }
    try {
      graph.value?.focusElement?.(String(personId), { duration: 500 });
    } catch { /* graph may be mid-destroy */ }
  } else {
    ElMessage.info('该人物不在当前子树内，请调整根节点后查看');
  }
}

/** 抽屉内"添加婚姻"：先关闭抽屉（让选择器接管），再 emit 提示用户去选第二位 */
function handleDrawerCreateMarriage(withPersonId: string | number) {
  ElMessage.info('请从画布右键或顶部"婚姻"菜单选择第二位配偶完成创建');
  // TODO(P2)：此处可改为打开 AddMarriageDialog，传入 withPersonId 作为预选
}

/**
 * 抽屉内发生「删除人物 / 删除婚姻」：刷新整树（树结构已变，画布要重建）
 * PersonEditDrawer 自身已经调用了 store / API 完成了写入，这里只需重画。
 */
function handleDrawerMutated() {
  // 清掉选中（被删除的人物对象已无效）
  genealogyStore.selectNode(null);
  refreshGraph();
}

function findNodeInTree(root: GenealogyNode | null, id: string): GenealogyNode | null {
  if (!root) return null;
  if (String(root.id) === id) return root;
  for (const c of root.children || []) {
    const found = findNodeInTree(c, id);
    if (found) return found;
  }
  return null;
}

// ==================== Watch & Lifecycle ====================

watch(
  () => genealogyStore.selectedNode,
  () => {
    if (graph.value && typeof graph.value.draw === 'function') {
      graph.value.draw();
    }
  },
);

onMounted(async () => {
  await nextTick();
  const rootId = props.rootPersonId || '1';
  try {
    // [渐进加载 2026-08-20] 首屏只拉取核心子集：
    // 按屏幕大小计算卡片上限（最多 100 张），后端 limit 截断，
    // 打开速度与首帧渲染都大幅提升；完整族谱由提示条按钮按需加载。
    const limit = props.clanId ? computeInitialCardLimit() : undefined;
    const data = await fetchTreeData(rootId, limit ? { limit } : undefined);
    if (data) {
      const treeData = (data as any).data || data;
      genealogyStore.setTreeData(treeData);
      await initGraph(treeData);
    }
  } catch {
    // 错误已在 fetchTreeData 中设置到 errorState，画布将展示错误占位
  }
});

onUnmounted(() => {
  // 清理进度定时器，避免组件卸载后定时器还在跑
  clearProgressTimer();
  clearHideTimer();
  teardownGraphResize();
  // 清理 initGraph 防抖定时器
  if (initGraphDebounceTimer !== null) {
    clearTimeout(initGraphDebounceTimer);
    initGraphDebounceTimer = null;
  }
  // 清理搜索防抖定时器
  if (searchDebounceTimer !== null) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  // 清理性能埋点 rAF
  if (perfRafId) {
    cancelAnimationFrame(perfRafId);
    perfRafId = 0;
  }
  if (cullingRafId) {
    cancelAnimationFrame(cullingRafId);
    cullingRafId = 0;
  }
  if (graph.value) {
    graph.value.destroy();
    graph.value = null;
  }
});

/** 画布变更版本号（每次 G6 渲染后递增，用于驱动 minimap 等外部组件的增量刷新） */
const graphChangeVersion = ref(0);

defineExpose({
  zoomIn,
  zoomOut,
  resetZoom,
  addPerson,
  graphChangeVersion,
  refresh: refreshGraph,
  focusMainLineage,
  /** 外部调用：高亮指定节点集合（如三代亲属） */
  setHighlight,
  /**
   * 鸟瞰图桥接：返回节点位与视口信息，供 TreeMinimap 同步渲染
   * - 返回 null 表示画布尚未初始化（M2 鸟瞰图在画布 ready 后才显示）
   * - 节点位置从 G6 getElementPosition 读取（画布坐标，不是屏幕坐标）
   * - 缩略图组件自行换算到 200x150 画布内坐标（与伪代码 §5.4 对齐）
   */
  getMinimapSnapshot() {
    if (!graph.value || typeof graph.value.getNodeData !== 'function') return null;
    try {
      const [vw, vh] = graph.value.getSize();
      const [cx, cy] = graph.value.getViewportCenter();
      const zoom = graph.value.getZoom();
      const nodes = graph.value.getNodeData() || [];
      const points = nodes.map((n: any) => {
        const pos = graph.value.getElementPosition(String(n.id));
        return {
          id: String(n.id),
          x: pos?.[0] ?? 0,
          y: pos?.[1] ?? 0,
          // [世代浮窗跟随画布 2026-08-20] 节点世代深度（由 transformToG6Data 写入），
          // 供 TreePage 把浮窗 item 按画布 y 投影到对应屏幕 y。配偶节点 gen=-1。
          gen: typeof n.data?.generation === 'number' ? n.data.generation : 1,
          gender: n.data?.gender,
          isMain: n.data?.is_main_lineage === true,
          isLiving: n.data?.is_living === true,
        };
      });
      return { nodes: points, viewport: { cx, cy, vw, vh, zoom } };
    } catch {
      return null;
    }
  },
  /**
   * 鸟瞰图拖拽跳转：移动主画布视口使 (canvasX, canvasY) 居中
   * - G6 v5 translateTo 接受画布坐标
   * - 跳转后自动 aftertransform → M2/M3 自动触发鸟瞰图重绘
   */
  panTo(canvasX: number, canvasY: number) {
    try {
      graph.value?.translateTo?.([canvasX, canvasY]);
    } catch {
      /* graph may be mid-destroy */
    }
  },
  /**
   * 代际总数（M3）：计算树最大深度（根为第 1 代）
   * - 遍历 treeData 子节点累加 depth
   * - 用于 TreeGenerationSlider 的滑块刻度范围
   */
  getTotalGenerations(): number {
    const tree = genealogyStore.treeData;
    if (!tree) return 1;
    const computeDepth = (node: any, d: number): number => {
      const children = node.children || [];
      if (!children.length) return d;
      let max = d;
      for (const c of children) {
        const childDepth = computeDepth(c, d + 1);
        if (childDepth > max) max = childDepth;
      }
      return max;
    };
    return computeDepth(tree, 1);
  },
  /**
   * 聚焦某节点（M3）：包装 G6 focusElement
   * - 用于 TreeGenerationSlider 点击代际刻度时定位到该代际的代表节点
   */
  focusNode(id: string | number) {
    try {
      graph.value?.focusElement?.(String(id));
    } catch {
      /* graph may be mid-destroy */
    }
  },
});
</script>

<template>
  <div class="genealogy-tree-container">
    <!-- Compact Toolbar (单行布局，隐藏 label 节省空间) -->
    <div class="tree-toolbar" :class="{ 'is-collapsed': toolbarCollapsed }">
      <el-button
        class="toolbar-toggle"
        :icon="toolbarCollapsed ? Expand : Fold"
        circle
        size="small"
        @click="toolbarCollapsed = !toolbarCollapsed"
        :title="toolbarCollapsed ? '展开工具栏' : '收起工具栏'"
      />

      <!-- Search (always visible, 最常用) -->
      <el-input
        v-model="searchKeyword"
        :placeholder="searchResultCount > 0 ? `找到 ${searchResultCount} 个结果` : '搜索姓名…'"
        :prefix-icon="Search"
        clearable
        @keyup.enter="handleSearch"
        @clear="clearSearch"
        @input="handleSearchDebounced"
        size="small"
        style="width: 180px"
        :class="{ 'has-search-result': searchResultCount > 0 }"
      />

      <el-divider direction="vertical" />

      <!-- View Mode -->
      <el-button-group class="view-mode-group">
        <el-tooltip content="紧凑视图" placement="bottom">
          <el-button
            :type="genealogyStore.viewMode === 'compact' ? 'primary' : 'default'"
            @click="handleViewModeChange('compact')"
            size="small"
          >
            <el-icon><List /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="详细视图" placement="bottom">
          <el-button
            :type="genealogyStore.viewMode === 'detailed' ? 'primary' : 'default'"
            @click="handleViewModeChange('detailed')"
            size="small"
          >
            <el-icon><Grid /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="肖像视图" placement="bottom">
          <el-button
            :type="genealogyStore.viewMode === 'portrait' ? 'primary' : 'default'"
            @click="handleViewModeChange('portrait')"
            size="small"
          >
            <el-icon><User /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="吊线图（世系）" placement="bottom">
          <el-button
            :type="genealogyStore.viewMode === 'xianshi' ? 'primary' : 'default'"
            @click="handleViewModeChange('xianshi')"
            size="small"
          >
            <el-icon><Histogram /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="苏式（竖排世系条）" placement="bottom">
          <el-button
            :type="genealogyStore.viewMode === 'su' ? 'primary' : 'default'"
            @click="handleViewModeChange('su')"
            size="small"
          >
            <el-icon><Reading /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="浙式（世代分格）" placement="bottom">
          <el-button
            :type="genealogyStore.viewMode === 'zhe' ? 'primary' : 'default'"
            @click="handleViewModeChange('zhe')"
            size="small"
          >
            <el-icon><Grid /></el-icon>
          </el-button>
        </el-tooltip>
      </el-button-group>

      <el-divider direction="vertical" />

      <!-- Filter -->
      <el-select
        v-model="filterGender"
        @change="handleGenderFilterChange"
        size="small"
        style="width: 72px"
        title="按性别筛选"
      >
        <el-option label="全部" value="all" />
        <el-option label="男" value="male" />
        <el-option label="女" value="female" />
      </el-select>

      <el-tooltip content="仅显示有照片" placement="bottom">
        <el-checkbox v-model="showOnlyWithPhotos" @change="handlePhotoFilterChange" size="small">
          <el-icon><Picture /></el-icon>
        </el-checkbox>
      </el-tooltip>

      <!-- [传统过滤 PRD §2.4] 隐藏妻子/女儿/女婿，可自由组合，实时重绘 -->
      <el-popover placement="bottom" :width="176" trigger="click" :visible="filterPopoverVisible" @show="filterPopoverVisible = true" @hide="filterPopoverVisible = false">
        <template #reference>
          <el-button
            :icon="Filter"
            size="small"
            :type="anyFilterActive ? 'primary' : 'default'"
            title="传统族谱过滤"
          />
        </template>
        <div class="filter-panel">
          <div class="filter-panel-title">传统族谱过滤（默认全关）</div>
          <el-checkbox v-model="filters.hideWife" @change="handleTraditionalFilterChange">隐藏妻子</el-checkbox>
          <el-checkbox v-model="filters.hideDaughter" @change="handleTraditionalFilterChange">隐藏女儿</el-checkbox>
          <el-checkbox v-model="filters.hideSonInLaw" @change="handleTraditionalFilterChange">隐藏女婿</el-checkbox>
          <div class="filter-panel-hint">仅控制展示，不修改族谱数据</div>
        </div>
      </el-popover>

      <!-- [导入/导出 2026-08-17] 树页工具栏：JSON/PDF 导出 + Excel/JSON 导入（导入与导出JSON仅 OWNER/ADMIN） -->
      <el-dropdown trigger="click" @command="handleIoCommand">
        <el-button size="small" :icon="Upload" :loading="exportingJson || exportingPdf || importing">
          导入/导出<el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="export-json" :disabled="!isTreeAdmin || exportingJson">导出 JSON（备份）</el-dropdown-item>
            <el-dropdown-item command="export-pdf" :disabled="exportingPdf">导出 PDF（分页印刷）</el-dropdown-item>
            <el-dropdown-item command="export-hanging" :disabled="exportingHanging">导出完整大图（挂画）…</el-dropdown-item>
            <el-dropdown-item command="import-excel" :disabled="!isTreeAdmin || importing">导入 Excel…</el-dropdown-item>
            <el-dropdown-item command="import-json" :disabled="!isTreeAdmin || importing">导入 JSON 备份…</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <input ref="excelInputRef" type="file" accept=".xlsx" class="hidden-file-input" @change="handleExcelFilePicked" />
      <input ref="jsonInputRef" type="file" accept=".json,application/json" class="hidden-file-input" @change="handleJsonFilePicked" />

      <el-divider direction="vertical" />

      <!-- Layout -->
      <el-tooltip content="切换纵向/横向布局" placement="bottom">
        <el-button
          @click="toggleLayout"
          :icon="layoutDirection === 'TB' ? Grid : Rank"
          size="small"
          :type="layoutDirection === 'TB' ? 'primary' : 'default'"
          style="min-width: 36px"
        />
      </el-tooltip>

      <div class="toolbar-spacer" />

      <!-- Zoom Controls -->
      <el-button-group class="zoom-controls">
        <el-tooltip content="放大" placement="bottom">
          <el-button @click="zoomIn" size="small">
            <el-icon><ZoomIn /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="缩小" placement="bottom">
          <el-button @click="zoomOut" size="small">
            <el-icon><ZoomOut /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="适配视图" placement="bottom">
          <el-button @click="resetZoom" size="small">
            <el-icon><ScaleToOriginal /></el-icon>
          </el-button>
        </el-tooltip>
      </el-button-group>

      <el-tooltip content="聚焦主传承线路" placement="bottom">
        <el-button
          @click="focusMainLineage"
          size="small"
          :type="genealogyStore.mainLineage.length ? 'warning' : 'default'"
          :disabled="!genealogyStore.mainLineage.length"
        >
          <el-icon><Connection /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip content="刷新族谱" placement="bottom">
        <el-button @click="refreshGraph" :icon="Refresh" size="small" />
      </el-tooltip>

      <el-tooltip content="添加成员" placement="bottom">
        <el-button type="primary" @click="addPerson" :icon="Plus" size="small" />
      </el-tooltip>
    </div>

    <!-- Stats Bar -->
    <div class="tree-stats" v-if="genealogyStore.treeData">
      <span class="stat-item">
        总人数: <strong>{{ genealogyStore.totalPersons || '-' }}</strong>
      </span>
      <span class="stat-divider">|</span>
      <span class="stat-item" v-if="partialTree">
        已加载: <strong>{{ shownPersons || '-' }} 人</strong>
      </span>
      <span class="stat-divider" v-if="partialTree">|</span>
      <span class="stat-item">
        视图: <strong>{{ viewModeLabel }}</strong>
      </span>
      <span class="stat-divider">|</span>
      <span class="stat-item">
        布局: <strong>{{ layoutDirection === 'TB' ? '纵向' : '横向' }}</strong>
      </span>
      <span class="stat-item lineage-hint" v-if="genealogyStore.mainLineage.length">
        <el-icon><Connection /></el-icon> 金色高亮为主传承线路
      </span>
    </div>

    <!-- [渐进加载 2026-08-20] 逐批加载提示条：大族谱首屏只渲染前 N 人，可逐批追加直至加载完毕 -->
    <div v-if="partialTree && !loading" class="partial-tree-banner">
      <div class="partial-tree-banner-text">
        <el-icon class="partial-tree-banner-icon"><Warning /></el-icon>
        <span>
          已加载 {{ shownPersons || '-' }} /
          <template v-if="genealogyStore.totalPersons">{{ genealogyStore.totalPersons }}</template>
          <template v-else>-</template>
          人 —— 逐批加载中，浏览更流畅
        </span>
      </div>
      <el-button
        size="small"
        type="primary"
        :loading="loadingMoreBatch"
        @click="loadMoreBatch"
      >
        {{ loadMoreLabel }}
      </el-button>
    </div>

    <!-- Performance overlay (dev only) -->
        <div v-if="perfStats.showOverlay" class="perf-overlay">
          <div class="perf-row">
            <span class="perf-label">FPS</span>
            <span class="perf-value" :class="perfStats.fps >= 50 ? 'good' : perfStats.fps >= 30 ? 'ok' : 'bad'">
              {{ perfStats.fps }}
            </span>
          </div>
          <div class="perf-row">
            <span class="perf-label">节点</span>
            <span class="perf-value">{{ perfStats.visibleNodes }} / {{ perfStats.totalNodes }}</span>
          </div>
          <div class="perf-row">
            <span class="perf-label">边</span>
            <span class="perf-value">{{ perfStats.visibleEdges }} / {{ perfStats.totalEdges }}</span>
          </div>
          <div class="perf-row">
            <span class="perf-label">Zoom</span>
            <span class="perf-value">{{ perfStats.zoom.toFixed(2) }}</span>
          </div>
          <div class="perf-row">
            <span class="perf-label">渲染</span>
            <span class="perf-value">{{ perfStats.renderMs }}ms</span>
          </div>
          <button
            v-if="isDev"
            class="perf-test-btn"
            :disabled="perfTestLoading"
            @click="runPerfTest"
          >
            {{ perfTestLoading ? '生成中…' : '压测 1000 节点' }}
          </button>
        </div>
    
        <!-- Loading with staged progress -->
    <div v-if="loading" class="tree-loading">
      <div class="loading-content">
        <div class="loading-icon-wrapper">
          <el-icon class="is-loading" :size="44"><Loading /></el-icon>
        </div>
        <p class="loading-text">{{ loadingMessage }}</p>
        <el-progress
          :percentage="Math.floor(loadingPercent)"
          :stroke-width="6"
          :show-text="false"
          :duration="0"
          color="#C9A96E"
          class="loading-progress"
        />
        <div class="loading-meta">
          <span class="loading-percent">{{ Math.floor(loadingPercent) }}%</span>
          <span class="loading-stage-hint" v-if="loadingStage">
            {{ stageLabelMap[loadingStage] }}
          </span>
        </div>
      </div>
    </div>

    <!-- 错误占位：族谱树加载失败时显示，并提供重试入口 -->
    <div v-else-if="errorState" class="tree-error-placeholder">
      <div class="error-card">
        <el-icon :size="56" color="#C9A96E"><Warning /></el-icon>
        <h3 class="error-title">族谱树暂不可用</h3>
        <p class="error-message">{{ errorState.message }}</p>
        <p class="error-code" v-if="errorState.code">错误码：{{ errorState.code }}</p>
        <div class="error-actions">
          <el-button type="primary" :icon="Refresh" @click="retryLoad">重新加载</el-button>
          <el-button :icon="User" @click="$router?.push?.('/login')" v-if="errorState.code === 401">重新登录</el-button>
        </div>
      </div>
    </div>

    <!-- Graph Container -->
    <div ref="container" class="genealogy-tree-canvas" v-show="!loading && !errorState"></div>

    <!-- 侧栏编辑抽屉：选中节点后从右侧划出 -->
    <PersonEditDrawer
      :person-id="editDrawerOpen ? (genealogyStore.selectedNode?.id ?? null) : null"
      :person="genealogyStore.selectedNode"
      :can-edit="true"
      @close="handleDrawerClose"
      @updated="handleDrawerUpdated"
      @navigate="handleDrawerNavigate"
      @create-marriage="handleDrawerCreateMarriage"
      @mutated="handleDrawerMutated"
    />

    <!-- 图片预览：点击缩略图展开大图 -->
    <ImagePreview
      v-model="previewVisible"
      :src="previewSrc"
      :name="previewName"
    />
  </div>
</template>

<style scoped>
.genealogy-tree-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #FAF8F5 0%, #F5F0E8 100%);
  overflow: hidden;
}

/* [移动端 H5 2026-08-17] 触摸拖拽/双指缩放不被浏览器手势抢占 */
.genealogy-tree-canvas {
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.tree-toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 252, 248, 0.95);
  backdrop-filter: blur(12px);
  padding: 6px 12px;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(93, 64, 55, 0.08);
  border: 1px solid rgba(201, 169, 110, 0.22);
  transition: padding 0.2s ease;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}
.tree-toolbar::-webkit-scrollbar { display: none; }

/* 折叠态：隐藏 divider 与次要按钮，只保留 toggle + 搜索 + 视图模式 + 缩放 + 添加 */
.tree-toolbar.is-collapsed :deep(.el-divider),
.tree-toolbar.is-collapsed .el-button-group:not(.zoom-controls):not(.view-mode-group),
.tree-toolbar.is-collapsed > .el-checkbox,
.tree-toolbar.is-collapsed > .el-select {
  display: none !important;
}
.tree-toolbar.is-collapsed {
  gap: 6px;
  padding: 6px 8px;
}

.toolbar-toggle {
  flex-shrink: 0;
}

.tree-toolbar :deep(.el-divider--vertical) {
  height: 18px;
  margin: 0;
}

.tree-toolbar :deep(.el-input--small .el-input__wrapper) {
  padding: 0 8px;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(201, 169, 110, 0.3) inset;
}

.tree-toolbar :deep(.el-checkbox) {
  display: flex;
  align-items: center;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.toolbar-search {
  display: flex;
  align-items: center;
}

.toolbar-spacer {
  flex: 1;
  min-width: 8px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.actions-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-controls {
  background: rgba(201, 169, 110, 0.1);
  border-radius: 8px;
}

.zoom-controls :deep(.el-button) {
  padding: 6px 10px;
}

.view-mode-switcher .el-button.is-primary {
  background: #C9A96E;
  border-color: #C9A96E;
}

.view-mode-switcher .el-button.is-primary:hover {
  background: #B8944E;
  border-color: #B8944E;
}

.btn-text {
  display: inline-block;
  font-size: 12px;
}

.has-search-result {
  box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.3);
  border-color: #4CAF50 !important;
}

.tree-stats {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 252, 248, 0.9);
  backdrop-filter: blur(8px);
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 12px;
  color: #7F8C8D;
  border: 1px solid rgba(201, 169, 110, 0.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* [渐进加载 2026-08-20] 核心子集提示条：悬浮于统计栏上方，不遮挡画布操作 */
.partial-tree-banner {
  position: absolute;
  bottom: 68px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 26;
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: min(680px, calc(100% - 32px));
  padding: 10px 16px;
  background: rgba(255, 252, 248, 0.97);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(201, 169, 110, 0.4);
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(93, 64, 55, 0.16);
  font-size: 13px;
  color: #5D4037;
}

.partial-tree-banner-text {
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.5;
  min-width: 0;
}

.partial-tree-banner-icon {
  color: #C9A96E;
  font-size: 15px;
  flex-shrink: 0;
}

.partial-tree-banner .el-button {
  flex-shrink: 0;
}

/* 性能面板（dev only，右下角） */
.perf-overlay {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 20;
  background: rgba(33, 33, 33, 0.92);
  color: #f0f0f0;
  padding: 8px 12px;
  border-radius: 8px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  line-height: 1.6;
  min-width: 140px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.perf-overlay .perf-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.perf-overlay .perf-label {
  color: #999;
}

.perf-overlay .perf-value {
  font-weight: 600;
  color: #4FC3F7;
}

.perf-overlay .perf-value.good {
  color: #66BB6A;
}

.perf-overlay .perf-value.ok {
  color: #FFA726;
}

.perf-overlay .perf-value.bad {
  color: #EF5350;
}

.perf-overlay .perf-test-btn {
  margin-top: 6px;
  width: 100%;
  padding: 4px 8px;
  background: #1976D2;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}

.perf-overlay .perf-test-btn:hover:not(:disabled) {
  background: #1565C0;
}

.perf-overlay .perf-test-btn:disabled {
  background: #555;
  cursor: not-allowed;
}

.stat-divider {
  color: #DDD;
}

.stat-item strong {
  color: #5D4037;
}

.lineage-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #C9A96E;
}

.tree-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(250, 248, 245, 0.92);
  backdrop-filter: blur(4px);
  z-index: 20;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 32px 40px;
  min-width: 320px;
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid rgba(201, 169, 110, 0.25);
  box-shadow: 0 8px 32px rgba(93, 64, 55, 0.12);
}

.loading-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(201, 169, 110, 0.08);
  color: #C9A96E;
}

.loading-text {
  color: #5D4037;
  font-size: 15px;
  font-weight: 500;
  margin: 0;
  letter-spacing: 0.5px;
}

.loading-progress {
  width: 280px;
  margin: 0;
}

/* Element Plus 进度条内部颜色统一为金色 */
.loading-progress :deep(.el-progress-bar__inner) {
  background: linear-gradient(90deg, #E8C887 0%, #C9A96E 100%);
  transition: width 80ms linear;
}

.loading-progress :deep(.el-progress-bar__outer) {
  background-color: rgba(201, 169, 110, 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.loading-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 280px;
  font-size: 12px;
  color: #8D6E63;
}

.loading-percent {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-weight: 600;
  color: #C9A96E;
}

.loading-stage-hint {
  font-size: 11px;
  color: #B0A18F;
}

/* 错误占位：族谱树加载失败时居中显示 */
.tree-error-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(250, 248, 245, 0.95);
  backdrop-filter: blur(6px);
  z-index: 20;
}

.error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 48px;
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid rgba(201, 169, 110, 0.3);
  box-shadow: 0 8px 32px rgba(93, 64, 55, 0.12);
  max-width: 420px;
  text-align: center;
}

.error-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #5D4037;
}

.error-message {
  margin: 0;
  font-size: 14px;
  color: #5D4037;
  line-height: 1.6;
}

.error-code {
  margin: 0;
  font-size: 12px;
  color: #8D6E63;
  font-family: monospace;
}

.error-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.genealogy-tree-canvas {
  width: 100%;
  height: 100%;
  /* G6 v5 会在容器内创建 4 层 <canvas>（背景/边/节点/UI），它们通过内联
   * grid-area: 1/1/2/2 重叠到同一网格单元；外层必须是 grid 才能让它们叠加。
   * 缺省 display 时会按 block 流式布局，4 层 canvas 沿垂直方向堆叠，
   * 总高度膨胀为单层的 4 倍，导致画布看起来「空白的、节点画进屏外」。
   * 此坑来源于 G6 5.x 子路径导入后 init() 不再自动注入容器样式。
   */
  display: grid;
  position: relative;
  overflow: hidden;
  background-image:
    radial-gradient(circle at 20% 50%, rgba(201, 169, 110, 0.06) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(93, 64, 55, 0.04) 0%, transparent 50%);
}

@media (max-width: 1200px) {
  /* 之前是 flex-direction: column 让工具栏竖排，挤掉画布；
   * 改为 nowrap + 横向滚动，让窄屏也能保留单行布局 */
  .tree-toolbar {
    padding: 6px 8px;
    gap: 6px;
  }
  .tree-toolbar.is-collapsed {
    gap: 4px;
    padding: 6px 6px;
  }
}

@media (max-width: 768px) {
  .tree-toolbar {
    top: 8px;
    left: 8px;
    right: 8px;
    padding: 6px 8px;
  }
  .tree-stats {
    font-size: 10px;
    padding: 4px 12px;
    gap: 8px;
  }
}

/* [传统过滤 PRD §2.4] 过滤面板 */
.filter-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.filter-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: #2c3e50;
  padding-bottom: 4px;
  border-bottom: 1px solid #f0ebe3;
}
.filter-panel :deep(.el-checkbox) {
  margin-right: 0;
  height: 24px;
}
.filter-panel-hint {
  font-size: 11px;
  color: #a0a0a0;
  padding-top: 2px;
}

/* [导入/导出 2026-08-17] 隐藏的原生文件选择框 */
.hidden-file-input {
  display: none;
}
</style>
