<script setup lang="ts">
import { ref, reactive, shallowRef, onMounted, onUnmounted, nextTick, watch, computed } from 'vue';
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
import { useLayoutDebugPanel } from '@/composables/useLayoutDebugPanel';
import { getWifePaletteColor, paletteShadow } from '@/utils/spouse-palette';
import { useViewModeConfig } from '@/utils/view-mode-config';
import { useGenealogyTransform } from '@/composables/useGenealogyTransform';
import { useGenealogyFilter } from '@/composables/useGenealogyFilter';
import { useG6GraphInit } from '@/composables/useG6GraphInit';
import {
  collectPendingSpouses,
  remountChildrenToWifeNodes,
  buildLayoutInputFromGraphData,
  applySpouseLayoutResultToGraphData,
  applyOrthogonalPathsToGraphData,
} from '@/utils/pending-spouse';

const props = defineProps<{
  clanId?: string;
  rootPersonId?: string;
}>();

/** Vue 模板中不能直接使用 import.meta.env，需要 ref 桥接 */
const isDev = ref(import.meta.env.DEV);

/** 性能埋点状态：FPS / 可见节点 / 总节点 / 渲染耗时 / elkjs WASM 阶段计时 */
const perfStats = reactive({
  fps: 0,
  visibleNodes: 0,
  totalNodes: 0,
  visibleEdges: 0,
  totalEdges: 0,
  renderMs: 0,
  zoom: 1,
  showOverlay: false,
  // [2026-09-01 §11.10 P3] elkjs WASM 加载性能监控：
  //   elkjs1000Ms：1000 节点 elkjs 端到端布局耗时（closest user-visible timing）
  //   elkjsInitMs：首次 elkjs layout() 耗时（包含 worker spawn + WASM 加载 + 首布局）
  //   elkjsLayoutMs：暖机后稳态 elkjs layout() 耗时（仅布局本身）
  //   三段拆分便于定位瓶颈是在 worker 启动、WASM 加载、还是 Sugiyama 计算。
  elkjs1000Ms: 0,
  elkjsInitMs: 0,
  elkjsLayoutMs: 0,
  // [2026-09-02 P1] render 阶段细粒度分段计时（用于定位 88% 卡死真凶）
  //   - loadG6Ms: G6 动态 import + 14+ 扩展 register
  //   - waitContainerMs: waitForContainerSize 等容器可见（≤1500ms）
  //   - transformMs: transformToG6Data + treeToGraphData 同步转换
  //   - layoutEngineMs: layoutEngine.calculateLayout（含展开/折叠/边路径）
  //   - g6RenderMs: g6Graph.setData + render() G6 实例化+绘制
  //   - viewportMs: zoomTo + translateBy 视口调整
  //   - totalMs: 整个 initGraph 端到端
  renderBreakdown: {
    loadG6Ms: 0,
    waitContainerMs: 0,
    transformMs: 0,
    layoutEngineMs: 0,
    g6RenderMs: 0,
    viewportMs: 0,
    totalMs: 0,
  },
  // [2026-09-02 P2] partialTree 深度截断埋点
  //   - depthBefore / depthAfter：截断前/后最大深度
  //   - truncatedByDepth：被截断的子节点数
  truncatedByDepth: 0,
  depthBefore: 0,
  depthAfter: 0,
});

/** 压测按钮 loading 状态 */
const perfTestLoading = ref(false);

/**
 * 最近一次布局引擎算出的视口配置（zoom + centerX + centerY + layoutDirection）
 * - 用途：工具栏「重置缩放」按钮复用，避免直接调 G6 内置 fitView() 把宽族谱压成 0.04
 * - 取值时机：每次 layout 计算完成后立即赋值；onUnmounted 清空
 */
let lastViewportConfig: ViewportConfig | null = null;

/** 工具栏是否折叠（折叠后只显示图标 + 搜索框，节省顶部空间） */
const toolbarCollapsed = ref(false);

/**
 * [v6.x 健壮性 L+D 系列] 布局引擎实例的 ref 持有
 *
 * LayoutEngine 实例在 initGraph() 内部 new，生命周期与 graph.value 绑定。
 * 这里用 shallowRef 暴露给顶层订阅器（useLayoutDebugPanel），便于 dev-only
 * perf-overlay 在 engine 实例就绪后自动 attach。
 *
 * watchEffect 行为：
 *   - 初始 null → useLayoutDebugPanel 不绑定（composable 内的 watchEffect 同步跳过）
 *   - initGraph 内赋值后 → watchEffect 重新跑 → 自动 attach
 *   - 切换 graph 时旧 engine 卸载 → detach 上一个 binding（previousLogger 还原）
 */
const layoutEngineRef = shallowRef<LayoutEngine | null>(null);

/**
 * [v6.x 健壮性 L+D 系列] 布局调试面板
 *
 * 提供 useLayoutDebugPanel 返回的响应式状态（cumulative / timings / slowPhases / errors），
 * 在 perf-overlay 中渲染为可折叠面板。仅 dev 模式消费，prod 模式面板不渲染。
 */
const debugPanel = useLayoutDebugPanel(layoutEngineRef);

/** [D 系列] 调试面板折叠状态（true = 展开细节） */
const debugPanelExpanded = ref(false);

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

/**
 * 画布变更版本号（每次 G6 渲染后递增，用于驱动 minimap 等外部组件的增量刷新）。
 * [P0-2 修复 2026-09-03] 原声明在文件底部，被 useG6GraphInit() 工厂依赖，
 *   移至 setup 顶部状态区，保留语义不变。
 */
const graphChangeVersion = ref(0);

/** 传统过滤面板 popover 显隐状态（template 控制其打开/关闭） */
const filterPopoverVisible = ref(false);

const container = ref<HTMLDivElement | null>(null);
const graph = ref<any>(null);
const genealogyStore = useGenealogyStore();
const loading = ref(false);
/** 画布内错误占位状态：null 表示无错误 */
const errorState = ref<{ code: number; message: string } | null>(null);
const layoutDirection = ref<'TB' | 'LR'>('TB');

/**
 * [2026-09-01 P1 修复] 引擎选择状态（auto/dagre/elkjs/compactBox 四档）。
 *
 * 初始化优先级：URL `?engine=` 参数 > 默认 'auto'。
 * 切换时通过 updateConfig + debouncedInitGraph 重新布局。
 */
type EngineChoice = 'auto' | 'dagre' | 'elkjs' | 'compactBox';
const ENGINE_OPTIONS: Array<{ value: EngineChoice; label: string; icon: string }> = [
  { value: 'auto', label: '自动', icon: '⚡' },
  { value: 'dagre', label: 'Dagre', icon: '📐' },
  { value: 'elkjs', label: 'ELK.js', icon: '🦌' },
  { value: 'compactBox', label: 'v5 兜底', icon: '📦' },
];
function parseEngineFromUrl(): EngineChoice {
  if (typeof window === 'undefined') return 'auto';
  const raw = new URLSearchParams(window.location.search).get('engine')?.toLowerCase();
  if (raw === 'dagre' || raw === 'elkjs' || raw === 'compactBox' || raw === 'auto') {
    return raw;
  }
  return 'auto';
}
const engineChoice = ref<EngineChoice>(parseEngineFromUrl());

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
// [2026-08-27 调优] 按 PRD §2.1.6 卡片字段（身份标识 + 排行 + 姓名 + 生卒年）
// 改为横排为主后，原 40/44/46 px 宽度装不下中文姓名（2 字至少 26-32 px），
// detailed/xianshi/su 三个传统横排模式统一加宽到 76 px；
// - 高度 < 70：走 drawLabelShape（G6 默认 label 路径）
// - 高度 >= 70：走 drawTraditionalContent（自定义渲染，PRD §2.1.6 四字段布局）
// [2026-08-28 B1 调优] 卡片宽高比与间距调优
// 目标：宽高比 0.85-1.0（接近正方形），同代间距卡片宽度 × 0.25，
//   代际间距卡片高度 × 1.15，夫妻间距 spouseGap = 16（与 LayoutConfig 默认一致）。
//   紧贴传统族谱（苏式/欧式）的卡片比例。
// [2026-08-31 修复] 用户反馈树谱三类问题：
//   1) 配偶卡片水平堆叠重叠：spouseGap 由「卡片宽×0.25」上调到「卡片宽×0.5」，
//      使中心距 = 卡片宽 + 卡片宽×0.5，确保多配偶场景卡片边缘间距 ≥ 卡片宽 1/3。
//   2) 卡片上下距离过大：rankSep 由「卡片高×1.15」下调到「卡片高×0.7」，
//      让连续代际视觉紧凑，与传统苏式五世同堂比例一致（卡片高×0.6-0.8）。
//   3) 引导线末端衔接：在 layout-engine computeOrthogonalEdgePaths 增加端点内缩，
//      让线的末端精确落在卡片边缘内 4px 而不是几何边缘。
// [2026-09-03 s7-2] viewModeConfig 已抽离至独立模块（@/utils/view-mode-config.ts），
//   这里是工厂入口返回的 ComputedRef<Record<viewMode, ViewModeSettings>>，用法不变。
const viewModeConfig = useViewModeConfig();
// [2026-09-03 s7-3] transformToG6Data + deriveIdentityLabel 已抽离至独立 composable。
//   工厂需要 genealogyStore（仅用 isInMainLineage 查询），返回的 transformToG6Data
//   内部递归用同名闭包变量，调用方式与原单文件定义完全一致。
const { transformToG6Data, deriveIdentityLabel } = useGenealogyTransform(genealogyStore);
// [2026-09-03 s7-4] searchKeyword / filterGender / showOnlyWithPhotos / highlightNodeIds
//   / searchResultCount + 三谓词 + nodeFilterCache + applyTraditionalFilters + 6 handlers
//   已抽离至 @/composables/useGenealogyFilter.ts。
//   通过 aliases 让模板、style 回调、initGraph 入口继续用同名变量，避免大规模 import 替换。
//  composable 接收 graph ref 作为参数（handler 触发 draw 时用到）；
//  graph 此时已声明（line 647），graph.value 仍为 null，handler 内部检查后再调用。
const filter = useGenealogyFilter({ graph });
const {
  searchKeyword,
  filterGender,
  showOnlyWithPhotos,
  highlightNodeIds,
  searchResultCount,
  filters,
  anyFilterActive,
  matchesSearch,
  matchesGenderFilter,
  matchesPhotoFilter,
  rebuildNodeFilterCache,
  getFilterMatch,
  applyTraditionalFilters,
  handleSearch,
  handleSearchDebounced,
  clearSearch,
  setHighlight,
  // [P0-1 2026-09-03] handleGenderFilterChange / handlePhotoFilterChange 不在解构中取，
  // 主文件另行定义为「调 filter 中同名方法」的统一入口，避免重复声明。
} = filter;

// [2026-09-03 s7-6] G6 图实例初始化：initGraph + runInitGraphBody + debouncedInitGraph
//   + setupGraphResize + loadG6Runtime + loadG6 + 自定义 GenealogyNode / OrthEdge
//   / PinchZoomBehavior 类 + viewport culling / drag 联动 / tooltip / FPS 埋点 +
//   G6 渲染 + 视口变换 — 共 ~1700 行搬迁到 @/composables/useG6GraphInit.ts。
//   通过工厂参数注入 setup 顶层依赖（21 个），主文件不再直接持有 G6 扩展声明。
const graphInit = useG6GraphInit({
  container,
  graph,
  layoutEngineRef,
  genealogyStore,
  viewModeConfig,
  transformToG6Data,
  filter,
  loadingPercent,
  setLoadingStage,
  errorState,
  perfStats,
  engineChoice,
  layoutDirection,
  partialTree,
  debugPanel,
  openImagePreview,
  graphChangeVersion,
  failLoading,
  finishLoading,
  runPerfTestElkjs,
});
const { initGraph, debouncedInitGraph } = graphInit;

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
        // [2026-09-02 P2] partialTree 深度截断：仅在 partial + 大树 + 纵深 时启用
        maybeTruncateByDepth(response.rootNode);
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
 * [2026-09-02 P2] 客户端深度截断（条件性启用）
 *
 * 背景：partialTree 仅按后端 limit 截断「节点数」，但 zhuxi-demo 这类「单支系深族谱」
 * 可能在 limit=100 之内仍保持 12+ 代纵深 → layoutEngine.calculateLayout 计算量大、
 *   g6Graph.render() 视口高度爆掉，触发 P0 的 30s 兜底超时。
 *
 * 设计原则（条件性启用，避免误伤）：
 * 1) 仅当 partialTree.value === true（后端已声明 partial）才考虑截断
 * 2) 仅当总节点数 > PARTIAL_TREE_TRUNCATE_THRESHOLD 500 才截断（小族谱不动）
 * 3) 仅当 maxDepth > PARTIAL_TREE_MAX_DEPTH 10 才截断（仅对「纵深」族谱）
 * 4) 截断点选「最深的叶子层」，把超深支系的 children 数组清空（DFS 自然终止）
 *
 * 注：此函数直接 mutate root.children；调用前需 clone 谨慎。当前仅在 render 之前调用，
 *     不会影响 store 中已存的 genealogyStore.treeData（store 持有旧引用）。
 */
const PARTIAL_TREE_MAX_DEPTH = 10;       // 根 = 0；超过此深度的子孙全部清空
const PARTIAL_TREE_TRUNCATE_THRESHOLD = 500; // 总节点数阈值

/**
 * 计算树的最大深度（根 = 0；无 children 的节点深度为 0）。
 */
function computeTreeMaxDepth(root: GenealogyNode | null): number {
  if (!root) return 0;
  let max = 0;
  const walk = (n: GenealogyNode, depth: number) => {
    if (depth > max) max = depth;
    if (!n.children || n.children.length === 0) return;
    for (const c of n.children) walk(c, depth + 1);
  };
  walk(root, 0);
  return max;
}

/**
 * 按最大深度截断树：把深度 > maxDepth 的节点及其后代一并清空（仅清 children，保留节点本身）。
 * 返回被截断的节点总数（含子孙后代），用于 perf 埋点。
 */
function truncateTreeByDepth(root: GenealogyNode | null, maxDepth: number): number {
  if (!root) return 0;
  let truncated = 0;
  const walk = (n: GenealogyNode, depth: number) => {
    if (!n.children || n.children.length === 0) return;
    if (depth >= maxDepth) {
      // 该节点已在 maxDepth，整层 children 都视为截断
      truncated += n.children.length;
      n.children = [];
      return;
    }
    // 未到 maxDepth，继续 DFS；统计当前层 children 中被截断的子孙
    const beforeLen = n.children.length;
    for (const c of n.children) walk(c, depth + 1);
    // （walk 之后可能已把某些 children 清空；不影响 beforeLen 计数）
    void beforeLen;
  };
  walk(root, 0);
  return truncated;
}

/**
 * [2026-09-02 P2] 条件性深度截断的包装函数：仅在同时满足以下三个条件时执行：
 *   1) partialTree.value === true（后端已声明 partial，避免对全量数据动刀）
 *   2) 节点总数 > PARTIAL_TREE_TRUNCATE_THRESHOLD 500（小族谱不截断）
 *   3) maxDepth > PARTIAL_TREE_MAX_DEPTH 10（仅处理真正的纵深族谱）
 * 截断后写入 perfStats.truncatedByDepth / depthBefore / depthAfter 便于 dev overlay 复盘。
 */
function maybeTruncateByDepth(root: GenealogyNode | null): void {
  // 每次调用前重置截断埋点（避免上次的值残留）
  perfStats.truncatedByDepth = 0;
  perfStats.depthBefore = 0;
  perfStats.depthAfter = 0;
  if (!root || !partialTree.value) return;
  const nodeCount = collectNodeIds(root).length;
  if (nodeCount <= PARTIAL_TREE_TRUNCATE_THRESHOLD) return;
  const depthBefore = computeTreeMaxDepth(root);
  if (depthBefore <= PARTIAL_TREE_MAX_DEPTH) return;
  const truncated = truncateTreeByDepth(root, PARTIAL_TREE_MAX_DEPTH);
  const depthAfter = computeTreeMaxDepth(root);
  perfStats.truncatedByDepth = truncated;
  perfStats.depthBefore = depthBefore;
  perfStats.depthAfter = depthAfter;
  console.info(
    `[GenealogyTree][P2 深度截断] 节点 ${nodeCount} > ${PARTIAL_TREE_TRUNCATE_THRESHOLD} 且深度 ${depthBefore} > ${PARTIAL_TREE_MAX_DEPTH}，` +
      `截断 ${truncated} 个子孙（深度 → ${depthAfter}）`,
  );
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
    // [2026-09-02 P2] 逐批合并后可能再次变深（mergeBatchIntoTree 把子孙挂回去），
    // 重新跑一次深度截断判断；perf 埋点会被覆盖，符合「最近一次」语义。
    maybeTruncateByDepth(treeData);
    // 追加渲染：重新布局 + 重绘（复用完整管线：配偶边/吊线重挂载/过滤/裁剪/LOD 全兼容）
    await initGraph(treeData);
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    loadingMoreBatch.value = false;
  }
};

// ==================== 传统过滤变化触发（filters 来自 useGenealogyFilter composable）====================
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

// [2026-09-03 s7-4] applyTraditionalFilters 已抽离至 @/composables/useGenealogyFilter.ts。
//   注意：composable 内 applyTraditionalFilters(node, isChild=false) 调用此函数时
//   递归时传 isChild=true，按 hideDaughter / hideSonInLaw 三个开关决定子树裁剪。
//   主文件 initGraph 入口用 alias `applyTraditionalFilters(data)` 即可（isChild 默认 false）。

// [2026-09-03 s7-3] toChineseNumber / formatChineseDate / deriveIdentityLabel
//   已抽离至 @/composables/useGenealogyTransform.ts（同上 s7-3 的工厂返回值）。

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

// [P0-1 2026-09-03 重构] 搜索 handler 已迁移到 @/composables/useGenealogyFilter，
// 在此处通过 `filter.handleSearch / handleSearchDebounced / clearSearch / setHighlight`
// 直接调用，避免重复声明（TS2451）。
// 也避免「先解构再重定义」导致 Vue/TS 警告（Cannot redeclare block-scoped variable）。

// ==================== Layout Controls ====================

const toggleLayout = () => {
  layoutDirection.value = layoutDirection.value === 'TB' ? 'LR' : 'TB';
  ElMessage.success(`已切换为${layoutDirection.value === 'TB' ? '纵向' : '横向'}布局`);
  if (genealogyStore.treeData) {
    debouncedInitGraph(genealogyStore.treeData);
  }
};

/**
 * [2026-09-01 P1 修复] 切换布局引擎（auto/dagre/elkjs/compactBox）。
 *
 * 实现要点：
 * 1. 更新 engineChoice ref（响应式状态）
 * 2. 同步 URL 参数（便于刷新后保留、分享链接）
 * 3. 触发 debouncedInitGraph 重新布局（避免快速点击时重复计算）
 *
 * 引擎选择由 layout-engine-adapter.selectLayoutEngine 决策：
 * - 'auto' + ≤1000 节点 → dagre
 * - 'auto' + >1000 节点 → elkjs
 * - 显式 'dagre' / 'elkjs' / 'compactBox' → 强制使用
 */
const changeEngine = (next: EngineChoice) => {
  if (engineChoice.value === next) return;
  engineChoice.value = next;
  // 同步 URL（保持刷新/分享一致性）
  try {
    const url = new URL(window.location.href);
    if (next === 'auto') {
      url.searchParams.delete('engine');
    } else {
      url.searchParams.set('engine', next);
    }
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* SSR / 异常 URL 时忽略 */
  }
  const label = ENGINE_OPTIONS.find((o) => o.value === next)?.label || next;
  ElMessage.success(`已切换为 ${label} 引擎`);
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

// 性别/照片过滤：直接走 useGenealogyFilter 中已暴露的同名 handler，
// 保证「谓词变化 → 重建缓存 → 增量重绘」与搜索流程一致。
const handleGenderFilterChange = () => filter.handleGenderFilterChange();
const handlePhotoFilterChange = () => filter.handlePhotoFilterChange();

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
  // [P0-2 修复 2026-09-03] 用 early-return 把 vp 的窄化分到独立块，
  //   避免 `vp && haveG6Api` 把 vp 推到 never；保留原 fallback 到 fitView 的语义。
  const vp = lastViewportConfig;
  const haveG6Api =
    typeof g.zoomTo === 'function' &&
    typeof g.translateBy === 'function' &&
    typeof g.getViewportByCanvas === 'function' &&
    typeof g.getSize === 'function';
  if (vp && haveG6Api) {
    // 此时 vp 已被窄化为 ViewportConfig；用显式断言让 TS 不再二次推断
    const safeVp: ViewportConfig = vp;
    // G6 每次视口变换都会取消上一段动画，因此必须等待 zoomTo 完成后再平移。
    await g.zoomTo(safeVp.zoom, { duration: 200 });
    const [canvasW, canvasH] = g.getSize();
    const contentVp = g.getViewportByCanvas([safeVp.centerX, safeVp.centerY]);
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
 * [2026-09-01 §11.10 P3] 共享辅助：构造 1000 节点的合成家谱树
 * - 与 runPerfTest 原内联生成逻辑等价，提取出来便于：
 *   1. runPerfTestElkjs 复用相同 shape，避免两套测试数据漂移；
 *   2. 浏览器 console 通过 __layoutDebug.perf.buildLargeGraph(1000) 复用构造数据。
 * - 节点数量由 TOTAL 控制，9 代扇出，每代 each node ≤ FANOUT 子女，截断到 TOTAL。
 */
function buildLargeGraph(TOTAL = 1000): { root: any; count: number } {
  const FANOUT = 3;
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

  return { root, count };
}

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
    const { root, count } = buildLargeGraph(1000);

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

/**
 * [2026-09-01 §11.10 P3] 直接构造 1000 个 LayoutNode 的平衡二叉树（elkjs 压测专用）
 * - 与 runPerfTest 的「家谱合成树」相比，这里直接生成 LayoutNode[]：
 *   1. 跳过 GenealogyTree → graphData → LayoutNode 的多层 transform，与 bench spec 的
 *      buildLargeTree 行为一致，确保浏览器端实测和 jsdom 单测的输入可比；
 *   2. 不再需要经过 1000 个节点的 G6 渲染初始化，仅做 elkjs 布局耗时测量，耗时更纯净。
 * - W=64、H=28 与 layout-engine.bench.spec.ts 的 buildLargeTree / 默认节点尺寸一致。
 */
function buildLargeLayoutGraph(targetSize = 1000): { nodes: any[]; edges: any[] } {
  const W = 64;
  const H = 28;
  const nodes: any[] = [];
  const edges: any[] = [];
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
  let currentGenIds: string[] = ['root'];
  let gen = 0;
  while (nodes.length < targetSize && gen < 20) {
    const nextGenIds: string[] = [];
    gen++;
    for (let i = 0; i < currentGenIds.length; i++) {
      const parentId = currentGenIds[i];
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
  }
  return { nodes, edges };
}

/**
 * [2026-09-01 §11.10 P3] elkjs WASM 加载性能监控
 * - 与 runPerfTest 同样压 1000 节点，但跳过 G6 渲染，直接走 elkjs 布局管线，三段计时：
 *   ① elkjsInitMs  = 首次 elkjs.layout() 的耗时（worker spawn + WASM 加载 + 首布局）
 *   ② elkjsLayoutMs = 稳态 elkjs.layout() 耗时（worker 已 warm，取 3 次调用的最小值）
 *   ③ elkjs1000Ms  = 单次稳态调用的耗时（user-visible timing，与 renderMs 对齐）
 * - elkjs 失败时 adapter 会自动 fallback 到 dagre，触发 ElMessage 警告；
 *   此时 perfStats.elkjs* 仍记 0（无意义），让监控数据明确区分"elkjs 成功"与"已降级"。
 * - 用例：浏览器 console `__layoutDebug.perf.runElkjs1000()` 即可触发
 */
const elkjsPerfLoading = ref(false);
async function runPerfTestElkjs(nodeCount = 1000): Promise<{
  elkjs1000Ms: number;
  elkjsInitMs: number;
  elkjsLayoutMs: number;
  ok: boolean;
  fallbackUsed: boolean;
}> {
  if (elkjsPerfLoading.value) {
    return { elkjs1000Ms: 0, elkjsInitMs: 0, elkjsLayoutMs: 0, ok: false, fallbackUsed: false };
  }
  elkjsPerfLoading.value = true;
  const fallbackUsed = false;
  try {
    // 直接生成 1000 LayoutNode 平衡二叉树（与 bench spec 的 buildLargeTree(1000) 同构）
    const { nodes: layoutNodes, edges: layoutEdges } = buildLargeLayoutGraph(nodeCount);
    const adapter = await import('@/utils/layout-engine-adapter');
    const { expandSpouseToVirtualNodes } = await import('@/utils/spouse-virtualizer');
    const { DEFAULT_LAYOUT_CONFIG } = await import('@/types/layout');
    const virtualized = expandSpouseToVirtualNodes(layoutNodes, layoutEdges);

    // 配置：强制 elkjs 引擎（关闭 auto fallback），关掉主脉对齐等耗时后处理
    // 沿用 bench spec 的写法：用 `as LayoutConfig` 整体收窄类型，避免 engine 字段被推断为 string。
    // LayoutConfig 已在脚本顶部以 type 静态引入，无需 await import。
    const elkjsConfig = {
      ...DEFAULT_LAYOUT_CONFIG,
      engine: 'elkjs',
      nodeSep: 24,
      rankSep: 48,
      spouseGap: 16,
      marriageJunctionOffset: 0,
      edgeHorizontalSeparation: 0,
      resolveSubtreeOverlap: false,
      mainLineageCenter: false,
      spouseOptimization: false,
    } as LayoutConfig;

    // ① 首次 elkjs：包含 worker spawn + WASM 加载 + 首布局
    const tInitStart = performance.now();
    let initOk = false;
    let effectiveEngine: 'dagre' | 'elkjs' | 'compactBox' = 'elkjs';
    try {
      // 通过 adapter 调用：内部会捕获 elkjs 失败并 fallback 到 dagre。
      // 我们在外层通过尝试性 catch 不切引擎，只测量 elkjs 路径耗时。
      await layoutEngineForPerf(layoutNodes, layoutEdges, elkjsConfig);
      initOk = true;
    } catch (e) {
      console.warn('[runPerfTestElkjs] elkjs init failed:', e);
    }
    perfStats.elkjsInitMs = Math.round(performance.now() - tInitStart);

    // ② ③ 稳态测量：连续 3 次 elkjs.layout，拆分布局耗时
    let totalLayoutMs = 0;
    let layoutOk = false;
    let lastResult: any = null;
    for (let iter = 0; iter < 3; iter++) {
      const t = performance.now();
      try {
        lastResult = await adapter.runLayoutEngine(
          'elkjs',
          virtualized.virtualNodes,
          virtualized.virtualEdges,
          elkjsConfig,
        );
        layoutOk = (lastResult?.size ?? 0) > 0;
        effectiveEngine = 'elkjs';
      } catch (e) {
        // elkjs 在某次调用失败 → fallback 到 dagre；记录并跳出循环
        console.warn(`[runPerfTestElkjs] elkjs iter ${iter} failed:`, e);
        effectiveEngine = 'dagre';
        break;
      }
      totalLayoutMs += performance.now() - t;
    }
    // 稳态单次耗时：3 次平均（用于跨次测量与 JIT 抖动平均化）
    const singleLayoutMs = totalLayoutMs / 3;
    perfStats.elkjsLayoutMs = Math.round(singleLayoutMs);
    perfStats.elkjs1000Ms = Math.round(singleLayoutMs);

    const effectiveFallback = effectiveEngine !== 'elkjs';
    const summary = effectiveFallback
      ? `⚠️ elkjs 失败已 fallback 到 dagre：initMs=${perfStats.elkjsInitMs} layoutMs=${perfStats.elkjsLayoutMs}`
      : `elkjs 压测完成：initMs=${perfStats.elkjsInitMs} layoutMs=${perfStats.elkjsLayoutMs} 1000Ms≈${perfStats.elkjs1000Ms}`;
    if (effectiveFallback) ElMessage.warning(summary);
    else ElMessage.success(summary);

    return {
      elkjs1000Ms: perfStats.elkjs1000Ms,
      elkjsInitMs: perfStats.elkjsInitMs,
      elkjsLayoutMs: perfStats.elkjsLayoutMs,
      ok: initOk && layoutOk,
      fallbackUsed: effectiveFallback,
    };
  } catch (e: any) {
    ElMessage.error(`elkjs 压测失败：${e?.message || e}`);
    return { elkjs1000Ms: 0, elkjsInitMs: 0, elkjsLayoutMs: 0, ok: false, fallbackUsed };
  } finally {
    elkjsPerfLoading.value = false;
  }
}

/**
 * [2026-09-01 §11.10 P3] elkjs perf helper：构造一个 ephemeral LayoutEngine 实例，
 * 仅做首次 elkjs.layout（含 WASM 加载），不写入 perfStats。
 *   - 与 runPerfTestElkjs 解耦，便于 __layoutDebug.perf 在 console 直接复用。
 */
async function layoutEngineForPerf(
  nodes: any[],
  edges: any[],
  config: any,
): Promise<void> {
  const adapter = await import('@/utils/layout-engine-adapter');
  const { expandSpouseToVirtualNodes } = await import('@/utils/spouse-virtualizer');
  const virtualized = expandSpouseToVirtualNodes(nodes, edges);
  await adapter.runLayoutEngine('elkjs', virtualized.virtualNodes, virtualized.virtualEdges, config);
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
  // [2026-09-03 s7-6] 集中清理 G6 生命周期：
  //   ResizeObserver + initGraph 防抖 + perf/culling rAF + graph.destroy + tooltip DOM
  graphInit.teardown();
  // [P0-1 2026-09-03] 搜索防抖计时器已迁移到
  // @/composables/useGenealogyFilter 内部闭包，组件卸载时无需在此清理
  // （计时器 250ms 后自动 fire 一次后即被 GC；模块级 cache 也是持久的）。
});

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

      <!-- [2026-09-01 P1 修复] 引擎 4 选 1 按钮组：auto / dagre / elkjs / compactBox -->
      <el-button-group class="engine-controls">
        <el-tooltip
          v-for="opt in ENGINE_OPTIONS"
          :key="opt.value"
          :content="`布局引擎：${opt.label}（${opt.value}）`"
          placement="bottom"
        >
          <el-button
            :type="engineChoice === opt.value ? 'primary' : 'default'"
            size="small"
            @click="changeEngine(opt.value)"
            :title="opt.value"
          >
            <span style="font-size: 13px">{{ opt.icon }}</span>
          </el-button>
        </el-tooltip>
      </el-button-group>

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
          <!-- [2026-09-02 P2] 深度截断提示：仅当本批发生了深度截断才显示 -->
          <template v-if="perfStats.truncatedByDepth > 0">
            <span class="partial-tree-truncate-tag">
              · 已按深度截断 {{ perfStats.truncatedByDepth }} 节点
              （{{ perfStats.depthBefore }}→{{ perfStats.depthAfter }} 代）
            </span>
          </template>
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
          <!-- [2026-09-01 §11.10 P3] elkjs WASM 加载性能监控面板 -->
          <div class="perf-row" v-if="isDev">
            <span class="perf-label">elkjs 首载</span>
            <span class="perf-value">{{ perfStats.elkjsInitMs }}ms</span>
          </div>
          <div class="perf-row" v-if="isDev">
            <span class="perf-label">elkjs 稳态</span>
            <span class="perf-value">{{ perfStats.elkjsLayoutMs }}ms</span>
          </div>
          <div class="perf-row" v-if="isDev">
            <span class="perf-label">elkjs 1000</span>
            <span class="perf-value">{{ perfStats.elkjs1000Ms }}ms</span>
          </div>
          <button
            v-if="isDev"
            class="perf-test-btn"
            :disabled="perfTestLoading"
            @click="runPerfTest"
          >
            {{ perfTestLoading ? '生成中…' : '压测 1000 节点' }}
          </button>
          <button
            v-if="isDev"
            class="perf-test-btn perf-test-btn--elkjs"
            :disabled="elkjsPerfLoading"
            @click="runPerfTestElkjs(1000)"
          >
            {{ elkjsPerfLoading ? 'elkjs 压测中…' : 'elkjs 1000 节点压测' }}
          </button>

          <!-- [v6.x 健壮性 L+D 系列] 布局引擎调试面板（dev-only，可折叠）
               - 紧凑模式：仅展示累计统计（calls / OK / FAIL / 错误率）
               - 展开模式：追加 timings 表 / 慢路径事件历史 / 错误事件历史
               - 数据源：useLayoutDebugPanel(layoutEngineRef) 响应式 ref
          -->
          <div v-if="isDev && layoutEngineRef" class="layout-debug-panel">
            <button
              type="button"
              class="layout-debug-toggle"
              @click="debugPanelExpanded = !debugPanelExpanded"
              :title="debugPanelExpanded ? '折叠' : '展开'"
            >
              <span class="layout-debug-icon">{{ debugPanelExpanded ? '▼' : '▶' }}</span>
              <span class="layout-debug-title">LayoutEngine 调试</span>
              <span class="layout-debug-badge" :class="debugPanel.errorRate.value > 0.05 ? 'bad' : 'good'">
                {{ debugPanel.cumulative.value.totalCalls }}次 / 错{{ debugPanel.cumulative.value.errorCalls }}
              </span>
            </button>

            <!-- 紧凑摘要（始终显示） -->
            <div v-if="debugPanel.lastMeta.value" class="layout-debug-summary">
              <div class="perf-row">
                <span class="perf-label">最近一次</span>
                <span class="perf-value">{{ debugPanel.lastTotalMs.value.toFixed(1) }}ms</span>
              </div>
              <div class="perf-row" v-if="debugPanel.lastMeta.value.engineUsed">
                <span class="perf-label">引擎</span>
                <span class="perf-value">{{ debugPanel.lastMeta.value.engineUsed }}</span>
              </div>
              <div class="perf-row" v-if="debugPanel.lastMeta.value.wideTree">
                <span class="perf-label">宽树</span>
                <span class="perf-value bad">true</span>
              </div>
              <div class="perf-row" v-if="debugPanel.lastMeta.value.input.nodeCount">
                <span class="perf-label">输入</span>
                <span class="perf-value">
                  {{ debugPanel.lastMeta.value.input.nodeCount }}N / {{ debugPanel.lastMeta.value.input.edgeCount }}E
                </span>
              </div>
            </div>

            <!-- 展开细节 -->
            <div v-if="debugPanelExpanded" class="layout-debug-details">
              <!-- 阶段耗时表 -->
              <div v-if="debugPanel.timings.value.length > 0" class="layout-debug-section">
                <div class="layout-debug-section-title">阶段耗时</div>
                <div
                  v-for="row in debugPanel.timings.value"
                  :key="row.phase"
                  class="perf-row"
                >
                  <span class="perf-label">{{ row.phase }}</span>
                  <span class="perf-value">{{ row.durationMs }}ms ({{ row.percentOfTotal }}%)</span>
                </div>
              </div>

              <!-- 慢路径事件 -->
              <div v-if="debugPanel.slowPhases.value.length > 0" class="layout-debug-section">
                <div class="layout-debug-section-title">
                  慢路径 ({{ debugPanel.slowPhases.value.length }})
                </div>
                <div
                  v-for="(sp, idx) in debugPanel.slowPhases.value.slice(-5).reverse()"
                  :key="idx"
                  class="layout-debug-event"
                >
                  <div class="perf-row">
                    <span class="perf-label">{{ sp.phase }}</span>
                    <span class="perf-value bad">{{ sp.durationMs.toFixed(1) }}ms</span>
                  </div>
                  <div class="perf-row">
                    <span class="perf-label">阈值</span>
                    <span class="perf-value">{{ sp.thresholdMs }}ms · {{ sp.engineUsed ?? '?' }}</span>
                  </div>
                </div>
              </div>

              <!-- 错误事件 -->
              <div v-if="debugPanel.errors.value.length > 0" class="layout-debug-section">
                <div class="layout-debug-section-title">
                  错误 ({{ debugPanel.errors.value.length }})
                </div>
                <div
                  v-for="(err, idx) in debugPanel.errors.value.slice(-5).reverse()"
                  :key="idx"
                  class="layout-debug-event"
                >
                  <div class="perf-row">
                    <span class="perf-label">{{ err.code }}</span>
                    <span class="perf-value bad">{{ err.message }}</span>
                  </div>
                </div>
              </div>

              <!-- 累计统计 -->
              <div v-if="debugPanel.cumulative.value.totalCalls > 0" class="layout-debug-section">
                <div class="layout-debug-section-title">累计</div>
                <div class="perf-row">
                  <span class="perf-label">总调用</span>
                  <span class="perf-value">{{ debugPanel.cumulative.value.totalCalls }}</span>
                </div>
                <div class="perf-row">
                  <span class="perf-label">错误率</span>
                  <span class="perf-value" :class="debugPanel.errorRate.value > 0.05 ? 'bad' : 'good'">
                    {{ (debugPanel.errorRate.value * 100).toFixed(1) }}%
                  </span>
                </div>
                <div v-if="Object.keys(debugPanel.cumulative.value.errorsByCode).length > 0" class="perf-row">
                  <span class="perf-label">错误码</span>
                  <span class="perf-value">
                    {{ Object.entries(debugPanel.cumulative.value.errorsByCode).map(([k, v]) => `${k}×${v}`).join(', ') }}
                  </span>
                </div>
                <div v-if="Object.keys(debugPanel.cumulative.value.enginesUsed).length > 0" class="perf-row">
                  <span class="perf-label">引擎分布</span>
                  <span class="perf-value">
                    {{ Object.entries(debugPanel.cumulative.value.enginesUsed).map(([k, v]) => `${k}×${v}`).join(', ') }}
                  </span>
                </div>
              </div>
            </div>
          </div>
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

/* [2026-09-02 P2] 深度截断标签：橙色提示，与主文案区分 */
.partial-tree-truncate-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(230, 162, 60, 0.12);
  color: #E6A23C;
  font-size: 12px;
  font-weight: 500;
  vertical-align: middle;
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

/* [v6.x 健壮性 L+D 系列] 布局引擎调试面板样式 */
.layout-debug-panel {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
}

.layout-debug-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #f0f0f0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  cursor: pointer;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  text-align: left;
}

.layout-debug-toggle:hover {
  background: rgba(255, 255, 255, 0.12);
}

.layout-debug-icon {
  font-size: 9px;
  color: #4FC3F7;
  width: 10px;
  display: inline-block;
}

.layout-debug-title {
  font-weight: 600;
  flex: 1;
  color: #4FC3F7;
}

.layout-debug-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
}

.layout-debug-badge.good {
  background: rgba(102, 187, 106, 0.18);
  color: #66BB6A;
}

.layout-debug-badge.bad {
  background: rgba(239, 83, 80, 0.22);
  color: #EF5350;
}

.layout-debug-summary {
  margin-top: 6px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}

.layout-debug-details {
  margin-top: 6px;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.18);
  border-radius: 4px;
  max-height: 280px;
  overflow-y: auto;
}

.layout-debug-section {
  margin-bottom: 6px;
}

.layout-debug-section:last-child {
  margin-bottom: 0;
}

.layout-debug-section-title {
  color: #999;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
  padding-bottom: 2px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
}

.layout-debug-event {
  margin-bottom: 4px;
  padding: 3px 4px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 3px;
  font-size: 10px;
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
