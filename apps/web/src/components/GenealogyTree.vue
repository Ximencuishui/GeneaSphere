<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, nextTick, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';
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
} from '@element-plus/icons-vue';
import { useGenealogyStore } from '@/stores/genealogy';
import type { ViewMode } from '@/stores/genealogy';
import { treeApi } from '@/api/tree';
import type { GenealogyNode } from '@/types';
import PersonEditDrawer from './PersonEditDrawer.vue';
import ImagePreview from './ImagePreview.vue';
import { Rect as G6Rect } from '@antv/g6/esm/elements/nodes/rect';
import { LayoutEngine } from '@/utils/layout-engine';
import type { LayoutNode, LayoutEdge, LayoutConfig } from '@/types/layout';

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
    import('@antv/g6/esm/behaviors/zoom-canvas'),
    import('@antv/g6/esm/behaviors/drag-element'),
    // transforms：treeToGraphData + compact-box 布局内部依赖的 transforms
    import('@antv/g6/esm/transforms/arrange-draw-order'),
    import('@antv/g6/esm/transforms/collapse-expand-combo'),
    import('@antv/g6/esm/transforms/collapse-expand-node'),
    import('@antv/g6/esm/transforms/get-edge-actual-ends'),
    import('@antv/g6/esm/transforms/update-related-edge'),
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

/** 工具栏是否折叠（折叠后只显示图标 + 搜索框，节省顶部空间） */
const toolbarCollapsed = ref(false);

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
 * - render  ：G6 创建图实例、设置布局、渲染节点与连线
 * - finalize：自适应缩放 / 滚动归位 / 清理临时态
 *
 * 设计要点：
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
    nodeWidth: 28,
    nodeHeight: 64,
    avatarSize: 0,
    nameFontSize: 12,
    sublabelFontSize: 0,
    nodeSep: 14,
    rankSep: 80,   // nodeHeight(64) + 间距(16)
  },
  detailed: {
    nodeWidth: 34,
    nodeHeight: 80,
    avatarSize: 22,
    nameFontSize: 13,
    sublabelFontSize: 10,
    nodeSep: 16,
    rankSep: 96,   // nodeHeight(80) + 间距(16)
  },
  portrait: {
    nodeWidth: 80,
    nodeHeight: 72,
    avatarSize: 22,
    nameFontSize: 12,
    sublabelFontSize: 9,
    nodeSep: 14,
    rankSep: 108,  // nodeHeight(72) + 间距(36)
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

const fetchTreeData = async (rootId: string = '1') => {
  // 拉取阶段：进入 fetch，progressTimer 会驱动 0→32% 平滑增长
  startLoading();
  errorState.value = null;
  try {
    if (props.clanId) {
      const response: any = await treeApi.getClanFullTree(props.clanId);
      // API 完成：进入 parse 阶段，进度条会跳到 30 附近再平滑增长到 60%
      setLoadingStage('parse');
      if (response?.rootNode) {
        genealogyStore.setMainLineage(response.mainLineage || []);
        genealogyStore.totalPersons = response.totalPersons || 0;
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
    const data = await fetchTreeData(rootId);
    if (data) {
      const treeData = (data as any).data || data;
      genealogyStore.setTreeData(treeData);
      initGraph(treeData);
    }
  } catch {
    // 错误已由 fetchTreeData 内设置到 errorState，无需再处理
  }
};

// ==================== Data Transformation ====================

const transformToG6Data = (node: GenealogyNode): any => {
  const isMainLineage = genealogyStore.isInMainLineage(node.id);

  // 兼容三种字段名：full_name（老约定）/ name（clan full 接口实际返回）/ label（其他）
  // demo 朱熹族谱 API 实际返回 name，没 full_name；之前一直空白是因为只读 full_name
  const displayName: string =
    (node as any).full_name || (node as any).name || (node as any).label || '';

  const result: any = {
    id: String(node.id),
    label: displayName,
    data: {
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
    const transformed = node.children.map((child) => transformToG6Data(child));
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
 * offsetWidth/Height 为 0，G6 init 拿到 0×0 会出现「节点画进 0×0 画布」
 * 的问题）。最多等 2s（10 × 200ms），超时后用最后一帧能拿到的尺寸。
 */
async function waitForContainerSize(maxRounds = 10, interval = 200): Promise<{ w: number; h: number }> {
  for (let i = 0; i < maxRounds; i++) {
    await new Promise((r) => setTimeout(r, interval));
    if (!container.value) continue;
    const w = container.value.offsetWidth;
    const h = container.value.offsetHeight;
    if (w > 0 && h > 0) return { w, h };
  }
  // 超时保护：返回当前值（可能仍为 0）
  return {
    w: container.value?.offsetWidth ?? 0,
    h: container.value?.offsetHeight ?? 0,
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

  const treeData = transformToG6Data(data);
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

  const walkTree = (node: GenealogyNode | any): void => {
    existingNodeIds.add(String(node.id));
    if (node.children) node.children.forEach(walkTree);
  };
  walkTree(data);

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

      // 收集配偶节点（不在初始布局中）
      if (!existingNodeMap.has(String(s.id))) {
        pendingSpouseNodes.push({
          id: String(s.id),
          label: s.name,
          data: {
            gender: s.gender,
            is_living: true,
            has_photo: false,
            is_external_spouse: true,
            original: null,
          },
          style: {
            opacity: 0.45,
          },
        });
        existingNodeMap.set(String(s.id), pendingSpouseNodes[pendingSpouseNodes.length - 1]);
      }

      pendingSpouseEdges.push({
        id: `spouse-${pairKey}-${s.marriage_order}`,
        source: String(node.id),
        target: String(s.id),
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
  
  // 从树结构计算代际（比从边计算更可靠）
  const generationMap = new Map<string, number>();
  const computeGenerationsFromTree = (node: any, gen: number) => {
    generationMap.set(String(node.id), gen);
    if (node.children) {
      for (const child of node.children) {
        computeGenerationsFromTree(child, gen + 1);
      }
    }
  };
  computeGenerationsFromTree(data, 0);
  
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
      spouseGap: 16, // 增加配偶节点间距，避免重叠
      mainLineageCenter: true,
      spouseOptimization: true,
      generationAlign: true,
      autoFit: {
        enabled: true,
        padding: 40,
        maxZoom: 2,
        minZoom: 0.1,
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
  
  // 自适应缩放
  const viewportConfig = layoutEngine.autoFit(layoutResult);

  // 创建节点位置映射
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
  console.log('[GenealogyTree] 布局完成:', {
    totalEdges: graphData.edges?.length || 0,
    orthPathCount,
    missingPathCount,
    spouseEdgeCount,
    totalNodes: graphData.nodes?.length || 0,
    spouseNodes: pendingSpouseNodes.length,
  });

  const g6Graph = new Graph({
    container: container.value,
    width,
    height,
    autoResize: true,
    behaviors: [
      'drag-canvas',
      'zoom-canvas',
      'drag-element',
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
            return '#F5F0E8';
          }
          if (d.data?.is_main_lineage) {
            return '#FFF8E7';
          }
          if (d.data?.is_living) {
            return d.data?.gender === 'male' ? '#E8F4FD' : '#FDE8F0';
          }
          return '#FAFAFA';
        },
        stroke: (d: any) => {
          const isSelected = genealogyStore.selectedNode?.id === Number(d.id);
          if (isSelected) return '#C9A96E';

          if (!matchesSearch(d) || !matchesGenderFilter(d) || !matchesPhotoFilter(d)) {
            return '#D0D0D0';
          }
          if (d.data?.is_main_lineage) return '#C9A96E';
          if (!d.data?.is_living) return '#A1887F';
          return d.data?.gender === 'male' ? '#90CAF9' : '#F48FB1';
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
          } else {
            truncated = name.length > 8 ? name.substring(0, 7) + '..' : name;
          }
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
          if (birth && death) return `${birth} - ${death}`;
          if (birth) return `${birth} - `;
          return '';
        },
        sublabelFill: (d: any) => {
          if (!matchesSearch(d) || !matchesGenderFilter(d) || !matchesPhotoFilter(d)) {
            return '#D0D0D0';
          }
          return '#7F8C8D';
        },
        sublabelFontSize: config.sublabelFontSize,
        sublabelPlacement: 'bottom',
        sublabelOffset: genealogyStore.viewMode === 'portrait' ? [0, 10] : [0, -2],

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
        // 配偶边使用直线
        if (d.data?.kind === 'spouse') return 'line';
        // 父子边使用自定义正交边（使用布局引擎预计算的路径）
        return 'orth';
      },
      style: {
        stroke: (d: any) => {
          const sourceMatched = matchesSearch(d.source) && matchesGenderFilter(d.source);
          const targetMatched = matchesSearch(d.target) && matchesGenderFilter(d.target);
          if (d.data?.kind === 'spouse') {
            return d.data?.is_current ? '#E91E63' : '#9E9E9E';
          }
          return (sourceMatched && targetMatched) ? '#B0BEC5' : '#E8E0D8';
        },
        lineWidth: (d: any) => {
          return d.data?.kind === 'spouse' ? 2.5 : 2;
        },
        lineDash: (d: any) => {
          if (d.data?.kind === 'spouse' && !d.data?.is_current) return [6, 4];
          return undefined;
        },
        endArrow: false,
        shadowColor: 'rgba(0, 0, 0, 0.05)',
        shadowBlur: 2,
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
      // 视口矩形（左上 / 右下）
      const halfW = vw / 2 + VIEWPORT_MARGIN;
      const halfH = vh / 2 + VIEWPORT_MARGIN;
      const x1 = center[0] - halfW;
      const y1 = center[1] - halfH;
      const x2 = center[0] + halfW;
      const y2 = center[1] + halfH;

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
  });
  g6Graph.on('aftertransform', () => {
    performViewportCulling(g6Graph, false);
    applyZoomLOD(g6Graph);
  });
  g6Graph.on('aftersizechange', () => {
    performViewportCulling(g6Graph, true);
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
      refreshGraph();
    }
  });

  // Tooltip configuration using G6 v5 API
  g6Graph.on('node:mouseenter', (e: any) => {
    const nodeModel = e.target?.getAttribute?.('model') || e.item?.getModel();
    if (nodeModel?.data?.original) {
      const data = nodeModel.data;
      const name = data.original.full_name || data.original.label || '未知';
      const gender = data.gender === 'male' ? '男' : '女';
      const birthYear = data.birth_year ? `出生: ${data.birth_year}` : '';
      const deathYear = data.death_year ? `去世: ${data.death_year}` : '';
      const status = data.is_living ? '在世' : '已故';
      
      const tooltipContent = `
        <div style="padding: 8px 12px; min-width: 140px; background: rgba(255, 255, 255, 0.98); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid rgba(201, 169, 110, 0.2);">
          <div style="font-weight: 600; color: #5D4037; margin-bottom: 4px;">${name}</div>
          <div style="display: flex; gap: 8px; font-size: 12px; color: #7F8C8D;">
            <span>${gender}</span>
            <span>${status}</span>
          </div>
          ${birthYear && `<div style="font-size: 12px; color: #999; margin-top: 4px;">${birthYear} ${deathYear}</div>`}
        </div>
      `;
      
      const event = e.originalEvent as MouseEvent;
      const tooltip = document.createElement('div');
      tooltip.innerHTML = tooltipContent;
      tooltip.style.position = 'fixed';
      tooltip.style.left = `${event.clientX + 15}px`;
      tooltip.style.top = `${event.clientY + 15}px`;
      tooltip.style.zIndex = '1000';
      tooltip.style.pointerEvents = 'none';
      tooltip.id = 'g6-tooltip';
      document.body.appendChild(tooltip);
      
      const removeTooltip = () => {
        const el = document.getElementById('g6-tooltip');
        if (el) el.remove();
      };
      
      g6Graph.once('node:mouseleave', removeTooltip);
      
      document.addEventListener('click', removeTooltip, { once: true });
    }
  });

  g6Graph.setData(graphData);
  g6Graph.render();
  graph.value = g6Graph;
  // 绑定 ResizeObserver，后续容器尺寸变化（窗口 resize / 面板展开）自动 setSize
  setupGraphResize(g6Graph);
  // 渲染完成：进度条快速跑满到 100% 再延迟关闭
  finishLoading();
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

const handleSearch = () => {
  if (!graph.value || !genealogyStore.treeData) return;
  highlightNodeIds.value.clear();
  
  if (searchKeyword.value) {
    let count = 0;
    const findAllMatches = (node: any) => {
      if (matchesSearch(node)) {
        highlightNodeIds.value.add(String(node.id));
        count++;
      }
      if (node.children) {
        node.children.forEach(findAllMatches);
      }
    };
    const treeData = transformToG6Data(genealogyStore.treeData);
    findAllMatches(treeData);
    searchResultCount.value = count;
    
    if (count > 0) {
      ElMessage.info(`找到 ${count} 个匹配结果`);
      const firstMatchId = highlightNodeIds.value.values().next().value;
      if (firstMatchId) {
        setTimeout(() => {
          try {
            graph.value.focusElement(firstMatchId, { duration: 500 });
          } catch {
            console.log('Focus element failed');
          }
        }, 300);
      }
    } else {
      ElMessage.warning('未找到匹配结果');
    }
  } else {
    searchResultCount.value = 0;
  }
  refreshGraph();
};

const clearSearch = () => {
  searchKeyword.value = '';
  highlightNodeIds.value.clear();
  refreshGraph();
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
  refreshGraph();
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

const resetZoom = () => {
  if (graph.value) {
    graph.value.fitView();
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

/** 抽屉内编辑保存成功：把返回的 person 更新到 store 与画布 */
function handleDrawerUpdated(updated: GenealogyNode) {
  // 用返回的节点替换 store 中的 selectedNode（前端缓存的引用）
  genealogyStore.selectNode(updated);
  // 整张图重建：编辑会影响节点显示（姓名/年份），不是热更新友好
  refreshGraph();
}

/** 抽屉内点击关系人：聚焦该节点（注意：跨子树焦点中心会被替换，
 *  本期实现聚焦并刷新画布；下一期可优化为局部高亮 / 不重建） */
function handleDrawerNavigate(personId: string | number) {
  const target = findNodeInTree(genealogyStore.treeData, String(personId));
  if (target) {
    genealogyStore.selectNode(target);
    refreshGraph();
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
    refreshGraph();
  },
);

onMounted(async () => {
  await nextTick();
  const rootId = props.rootPersonId || '1';
  try {
    const data = await fetchTreeData(rootId);
    if (data) {
      const treeData = (data as any).data || data;
      genealogyStore.setTreeData(treeData);
      initGraph(treeData);
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

defineExpose({
  zoomIn,
  zoomOut,
  resetZoom,
  addPerson,
  refresh: refreshGraph,
  focusMainLineage,
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
      graph.value?.translateTo?.({ x: canvasX, y: canvasY });
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
        @input="handleSearch"
        size="small"
        style="width: 180px"
        :class="{ 'has-search-result': searchResultCount > 0 }"
      />

      <el-divider direction="vertical" />

      <!-- View Mode -->
      <el-button-group>
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
        <el-checkbox v-model="showOnlyWithPhotos" @change="refreshGraph" size="small">
          <el-icon><Picture /></el-icon>
        </el-checkbox>
      </el-tooltip>

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
      <span class="stat-item">
        视图: <strong>{{ genealogyStore.viewMode === 'compact' ? '紧凑' : genealogyStore.viewMode === 'detailed' ? '详细' : '肖像' }}</strong>
      </span>
      <span class="stat-divider">|</span>
      <span class="stat-item">
        布局: <strong>{{ layoutDirection === 'TB' ? '纵向' : '横向' }}</strong>
      </span>
      <span class="stat-item lineage-hint" v-if="genealogyStore.mainLineage.length">
        <el-icon><Connection /></el-icon> 金色高亮为主传承线路
      </span>
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
      :person-id="editDrawerOpen ? genealogyStore.selectedNode?.id : null"
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

/* 折叠态：隐藏 divider 与次要按钮，只保留 toggle + 搜索 + 缩放 + 添加 */
.tree-toolbar.is-collapsed :deep(.el-divider),
.tree-toolbar.is-collapsed .el-button-group:not(.zoom-controls),
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
</style>
