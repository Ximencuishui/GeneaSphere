/**
 * useGraphInit — G6 图实例初始化 composable
 *
 * [2026-09-03 拆分 P1] 从 useG6GraphInit.ts (1889 行) 拆出 4 个模块：
 *   - useG6Runtime.ts：G6 Graph + 扩展 register
 *   - useGenealogyNode.ts：自定义 GenealogyNode 类
 *   - useOrthEdge.ts：自定义 OrthEdge 类
 *   - useGraphInit.ts（本文件）：主入口 composable，编排 initGraph + runInitGraphBody +
 *     debouncedInitGraph + teardown + ResizeObserver + 视口裁剪/LOD
 *
 * 设计目标：
 *   - 拆分后本文件 ~750 行（原 1889 行减少约 60%），定位 initGraph 失败段更快
 *   - 对 GenealogyTree.vue 的契约零变更：仍返回 { initGraph, debouncedInitGraph, teardown }
 *   - 通过"工厂参数化注入 setup 顶层依赖（genealogyStore / graph / viewModeConfig / ...）"
 *     保持原调用方式不变
 *
 * 与 useG6Runtime 的协作：
 *   - 本文件持有 `g6RuntimePromise` 闭包缓存（per-factory-instance，与原行为一致）
 *   - 通过 loadG6Runtime({ genealogyStore, viewModeConfig }) 把业务 deps 传给 G6 runtime
 *   - GenealogyNode 类在 useG6Runtime 内创建，捕获本组件实例的 deps
 *
 * 不破坏既有契约：
 *   - initGraph(data) / debouncedInitGraph(data) 签名不变
 *   - 行为完整保留：双指缩放、viewport culling、debug panel、spouse edge 重算等
 *   - 所有 24+ 内部 ref/reactive 状态都从 deps 传入，保持响应式更新
 */
import type { Ref, ComputedRef, ShallowRef } from 'vue';
import type { GenealogyNode } from '@/types';
import { LayoutEngine } from '@/utils/layout-engine';
import type { ViewportConfig } from '@/types/layout';
import type { ViewMode } from '@/stores/genealogy';
import {
  collectPendingSpouses,
  remountChildrenToWifeNodes,
  buildLayoutInputFromGraphData,
  applySpouseLayoutResultToGraphData,
  applyOrthogonalPathsToGraphData,
} from '@/utils/pending-spouse';
import { paletteShadow } from '@/utils/spouse-palette';
import { loadG6Runtime } from './useG6Runtime';
import type { G6Runtime } from './useG6Runtime';

// ==================== 类型：composable 依赖 ====================

type LoadingStage = 'fetch' | 'parse' | 'render' | 'finalize';
type EngineChoice = 'auto' | 'dagre' | 'elkjs' | 'compactBox';

/** useGenealogyFilter 暴露的、initGraph 必需的 4 个成员 */
interface InitGraphFilterSlice {
  anyFilterActive: ComputedRef<boolean>;
  applyTraditionalFilters: (data: GenealogyNode | null) => GenealogyNode | null;
  rebuildNodeFilterCache: (nodes: any[]) => void;
  getFilterMatch: (node: any) => { search: boolean; gender: boolean; photo: boolean };
}

/** perfStats reactive 对象（initGraph 写入内部字段） */
interface PerfStatsSlice {
  fps: number;
  visibleNodes: number;
  totalNodes: number;
  renderMs: number;
  zoom: number;
  showOverlay: boolean;
  totalEdges: number;
  visibleEdges: number;
  elkjsInitMs: number;
  elkjsLayoutMs: number;
  elkjs1000Ms: number;
  renderBreakdown: {
    loadG6Ms: number;
    // [P0-B 修复 2026-09-03] g6Graph.setData() 单独计时。
    //   实测发现 dev 模式下 g6Graph.render() 陷入同步死循环(67s 内 rAF 仅触发 2 次)。
    //   拆出 setData 计时便于下次定位 setData 本身是否就是死循环源头,
    //   还是死循环真正发生在 setData 之后的 render 阶段。
    setDataMs: number;
    transformMs: number;
    layoutEngineMs: number;
    g6RenderMs: number;
    totalMs: number;
  };
}

/** useLayoutDebugPanel 返回的、initGraph 需要用到的 .refresh() 方法 */
interface DebugPanelSlice {
  refresh: () => void;
}

export interface G6GraphInitDeps {
  container: Ref<HTMLDivElement | null>;
  graph: Ref<any>;
  layoutEngineRef: ShallowRef<LayoutEngine | null>;
  genealogyStore: {
    viewMode: ViewMode;
    treeData: GenealogyNode | null;
    mainLineage: Array<string | number>;
    selectedNode: GenealogyNode | null;
  };
  viewModeConfig: ComputedRef<Record<ViewMode, any>>;
  transformToG6Data: (data: GenealogyNode, genMap: Map<string, number>) => any;
  filter: InitGraphFilterSlice;
  loadingPercent: Ref<number>;
  setLoadingStage: (stage: LoadingStage) => void;
  errorState: Ref<{ code: number; message: string } | null>;
  perfStats: PerfStatsSlice;
  engineChoice: Ref<EngineChoice>;
  layoutDirection: Ref<'TB' | 'LR'>;
  partialTree: Ref<boolean>;
  debugPanel: DebugPanelSlice;
  openImagePreview: (src: string, name: string) => void;
  graphChangeVersion: Ref<number>;
  failLoading: () => void;
  finishLoading: () => void;
  runPerfTestElkjs: (nodeCount?: number) => Promise<{
    elkjs1000Ms: number;
    elkjsInitMs: number;
    elkjsLayoutMs: number;
    ok: boolean;
    fallbackUsed: boolean;
  }>;
}

export interface G6GraphInitReturn {
  initGraph: (data: GenealogyNode) => Promise<void>;
  debouncedInitGraph: (data: GenealogyNode) => void;
  /** 组件卸载时清理 ResizeObserver + 防抖 timer */
  teardown: () => void;
}

// ==================== composable factory ====================

export function useG6GraphInit(deps: G6GraphInitDeps): G6GraphInitReturn {
  // ---- 工厂闭包缓存（per-factory-instance，与原 useG6GraphInit 行为一致）----
  // 每个组件实例的 useG6GraphInit 调用有自己独立的 g6RuntimePromise。
  // 保证 GenealogyNode 类捕获的 deps 与本组件实例一致。
  let g6RuntimePromise: Promise<G6Runtime> | null = null;
  let graphResizeObserver: ResizeObserver | null = null;
  let initGraphDebounceTimer: number | null = null;
  let lastViewportConfig: ViewportConfig | null = null;

  /**
   * 加载 G6 runtime（per-factory cache）。
   * 委托给 useG6Runtime.loadG6Runtime 处理 dynamic import + 17+ register。
   */
  function loadG6(): Promise<G6Runtime> {
    if (!g6RuntimePromise) {
      g6RuntimePromise = loadG6Runtime({
        genealogyStore: deps.genealogyStore,
        viewModeConfig: deps.viewModeConfig,
      });
    }
    return g6RuntimePromise;
  }

  function teardownGraphResize() {
    if (graphResizeObserver) {
      graphResizeObserver.disconnect();
      graphResizeObserver = null;
    }
  }

  /** 加载失败：停在当前进度，由错误占位 UI 接管（保留 progressTimer 已停止） */
  function setupGraphResize(g: any) {
    teardownGraphResize();
    if (!deps.container.value) return;
    graphResizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0 && g && typeof g.setSize === 'function') {
        g.setSize(width, height);
      }
    });
    graphResizeObserver.observe(deps.container.value);
  }

  // ==================== initGraph + runInitGraphBody ====================
  const initGraph = async (data: GenealogyNode) => {
    if (!deps.container.value) return;

    // [传统过滤 2026-08-17] 入口处先做过滤拷贝（PRD §2.4：隐藏妻子/女儿/女婿，纯渲染）
    // [P1-2 2026-09-03] 仅在过滤开关任一开启时才深拷贝全树。
    //   日常使用（三个开关全关）省掉 applyTraditionalFilters 的递归 + map 拷贝：
    //   1000 节点族谱实测省 10-30ms + 一份全树内存。
    // applyTraditionalFilters 返回 GenealogyNode | null（递归时可裁掉女儿节点），
    // 但入口处的 data 已是 GenealogyNode，函数对非 null 输入永远返回非 null，
    // 用非空断言维持原契约。
    if (deps.filter.anyFilterActive.value) {
      // applyTraditionalFilters 在入口处 (isChild=false) 调用时不会返回 null：
      //   - 第一道 if (!node) return null 已因 data 类型非 null 排除
      //   - 第二道 if (isChild && ...) 因 isChild=false 排除
      // 用类型断言保持原契约，避免逐次 null check。
      const filtered = deps.filter.applyTraditionalFilters(data) as GenealogyNode;
      data = filtered;
    }

    // 加载 G6 运行时（Graph + 必要扩展的注册）。
    // 动态 import 走子路径，绕开主入口的 preset 依赖链，
    // vendor-antv 体积会从 1.2MB 缩减到 400-600KB。
    //
    // [2026-09-02 P0 修复] 渲染阶段超时 + 子阶段进度
    //   历史问题：1325 节点首次 initGraph 卡在 render 阶段（进度 88%）永不 resolve。
    //   根因：render 阶段包含多个 await（loadG6 / waitContainer / calculateLayout / g6.render），
    //         任何一个慢/挂都会导致 finishLoading 永远不调用。
    //   解决方案：
    //     1) 整个 initGraph 包 30s 兜底超时（Promise.race），超时强制 finishLoading + 错误占位
    //     2) 子阶段进度细分 88→92→96→99→100，便于定位卡点
    //     3) perfStats.renderBreakdown 记录每段耗时（dev 模式可在 perf-overlay 查看）
    deps.setLoadingStage('render');
    const initGraphStart = performance.now();
    let renderTimer: number | null = null;
    let timedOut = false;
    const RENDER_TIMEOUT_MS = 30000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      renderTimer = window.setTimeout(() => {
        timedOut = true;
        reject(new Error(
          `[GenealogyTree] initGraph 渲染超时（${RENDER_TIMEOUT_MS / 1000}s），` +
          `请刷新重试或减小数据规模（partial 模式下仅渲染首屏核心子集）`,
        ));
      }, RENDER_TIMEOUT_MS);
    });

    try {
      await Promise.race([runInitGraphBody(data), timeoutPromise]);
    } catch (e: any) {
      if (timedOut) {
        // [2026-09-02 P0] 超时兜底：强制 finishLoading + 错误占位
        //   进度条不再卡 88%，用户体验闭环；错误占位提示用户刷新。
        console.error('[GenealogyTree] render 超时:', e?.message || e);
        try {
          const { ElMessage } = await import('element-plus');
          ElMessage?.error?.('族谱树渲染超时（>30s），请刷新页面重试');
        } catch (_) { /* element-plus 未加载时静默 */ }
        deps.errorState.value = {
          code: 504,
          message: '渲染超时（30s）',
        };
        deps.failLoading();
        // 性能埋点：记录超时（便于 dev overlay 复盘）
        deps.perfStats.renderBreakdown.totalMs = RENDER_TIMEOUT_MS;
      } else {
        console.error('[GenealogyTree] G6 渲染失败:', e);
        try {
          const { ElMessage } = await import('element-plus');
          ElMessage?.error?.(`渲染失败：${e?.message || '未知错误'}`);
        } catch (_) { /* element-plus 未加载时静默 */ }
        deps.failLoading();
      }
    } finally {
      if (renderTimer !== null) clearTimeout(renderTimer);
      deps.perfStats.renderBreakdown.totalMs = performance.now() - initGraphStart;
    }
  };

  /**
   * [2026-09-02 P0] initGraph 主体（被 Promise.race 超时包装）
   *   拆出来便于：
   *   - 子阶段进度细分（88→92→96→99→100）
   *   - renderBreakdown 计时
   *   - 超时取消清理（在 finally 中统一处理 timer）
   */
  const runInitGraphBody = async (data: GenealogyNode) => {
    // ---- 子阶段 1：loadG6 (88→92%) ----
    const tLoadG6Start = performance.now();
    const { Graph, treeToGraphData } = await loadG6();
    deps.perfStats.renderBreakdown.loadG6Ms = performance.now() - tLoadG6Start;
    deps.loadingPercent.value = 92;

    // [P0-2 2026-09-03] 移除 runInitGraphBody 内部的 waitForContainerSize 等待。
    // 理由：
    //   1) 调用栈：debouncedInitGraph (150ms 防抖) → initGraph (30s 超时包装) → runInitGraphBody。
    //      用户触发后才进入这里，container.value 在 v-show=true 后必定可见；
    //   2) 此处解构出的 width/height 未被下游使用（setupGraphResize 的 ResizeObserver 会接管实际尺寸）；
    //   3) 原 maxRounds=25 × 200ms 的兜底在最坏情况下会浪费 5s。
    // 函数 waitForContainerSize 本身保留，供 handleResize / 未来可能的复用。

    if (deps.graph.value) {
      deps.graph.value.destroy();
    }

    const config = deps.viewModeConfig.value[deps.genealogyStore.viewMode];

    // ---- 子阶段 2：transformToG6Data + treeToGraphData (92→96%) ----
    const tTransformStart = performance.now();
    const generationMap = new Map<string, number>();
    const treeData = deps.transformToG6Data(data, generationMap);
    const graphData = treeToGraphData(treeData);
    deps.perfStats.renderBreakdown.transformMs = performance.now() - tTransformStart;
    deps.loadingPercent.value = 96;

    // ==================== 补齐 spouse 边（延迟添加策略）====================
    /**
     * treeToGraphData 仅生成父子边，再婚/多段婚姻需要从 node.spouses 手动补边。
     *
     * 关键设计：配偶节点不参与初始布局，而是在布局完成后通过布局引擎定位到伴侣旁边。
     */
    const existingNodeIds = new Set((graphData.nodes || []).map((n: any) => String(n.id)));
    const existingNodeMap = new Map<string, any>();
    for (const n of graphData.nodes || []) existingNodeMap.set(String(n.id), n);

    // [2026-09-03 s7-5] 收集 spouse 节点/边：委托给 @/utils/pending-spouse.ts
    //   collectPendingSpouses 会把外部配偶挂在 existingNodeMap 里（外部配偶 id=sid）
    //   或为族内配偶生成副本节点（避免多源共享），并按 seenSpousePairs 去重。
    const {
      nodes: pendingSpouseNodes,
      edges: pendingSpouseEdges,
    } = collectPendingSpouses(data, existingNodeMap);

    // ==================== [吊线图 2026-08-17] 子女重挂载到妻子节点 ====================
    // [2026-09-03 s7-5] remountChildrenToWifeNodes 委托给 @/utils/pending-spouse.ts。
    //   仅 xianshi 模式启用：把"父 → 子"边替换为"妻子节点 → 子"边，引擎自动把子女子树排到妻子下方。
    if (deps.genealogyStore.viewMode === 'xianshi') {
      const { removeEdges, addedEdges } = remountChildrenToWifeNodes(
        data,
        graphData,
        pendingSpouseNodes,
      );
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

    // [2026-09-03 s7-5] 把 graphData + pendingSpouse 转为 layout-engine 输入
    //   委托给 @/utils/pending-spouse.ts：
    //   - buildLayoutNodes / buildLayoutEdges
    //   - 把 isConcubineChild / palette / birthOrder 写回 graphData.edges.data
    //   - 把 spouse 节点 push 到 layoutNodes（标记 generation=-1，不参与主布局）
    const { layoutNodes, layoutEdges } = buildLayoutInputFromGraphData(
      graphData,
      pendingSpouseNodes,
      pendingSpouseEdges,
      {
        config: { nodeWidth: config.nodeWidth, nodeHeight: config.nodeHeight },
        generationMap,
        treeData,
      },
    );

    // 创建布局引擎
    // [P0-2 2026-09-03] 之前由 waitForContainerSize 解构出 width/height；
    //   移除等待后改用容器实测 + 兜底（container 在 v-show=true 后必然可见）。
    const _containerRect = deps.container.value?.getBoundingClientRect?.();
    const _canvasWidth = _containerRect?.width || deps.container.value?.clientWidth || 1024;
    const _canvasHeight = _containerRect?.height || deps.container.value?.clientHeight || 768;
    const layoutEngine = new LayoutEngine({
      canvasSize: { width: _canvasWidth, height: _canvasHeight },
      config: {
        nodeWidth: config.nodeWidth,
        nodeHeight: config.nodeHeight,
        nodeSep: config.nodeSep,
        rankSep: config.rankSep,
        // [2026-08-31 修复] 卡片堆叠重叠：spouseGap 从 32 上调到 48
        //   多配偶场景下，配偶卡片中心距 = 节点宽 + 48，确保边缘间距 ≥ 48px，
        //   避免多妻妾堆叠在一起。
        spouseGap: 48,
        mainLineageCenter: true,
        spouseOptimization: true,
        generationAlign: true,
        autoFit: {
          enabled: true,
          padding: 40,
          maxZoom: 2,
          minZoom: 0.25,
          preferDirection: deps.layoutDirection.value as 'TB' | 'LR',
        },
        performance: {
          maxNodesForFullLayout: 2000,
          viewportCulling: true,
          lodEnabled: true,
        },
        // [2026-09-01 P1 修复] 引擎选择由工具栏 4 选 1 按钮组控制
        //   - 'auto'（默认）：≤1000 节点走 dagre；>1000 节点走 elkjs；失败 → compactBox
        //   - 显式 'dagre' / 'elkjs' / 'compactBox' 用于调试与对比
        //   - 也可通过 URL `?engine=` 参数初始化（见 engineChoice ref）
        engine: deps.engineChoice.value,
        engineThreshold: 1000,
      },
    });

    // [v6.x 健壮性 L+D 系列] 把刚创建的 engine 暴露给顶层订阅器（useLayoutDebugPanel）
    // watchEffect 触发 → 自动 attach 内部 subscription logger；
    // 当 graph 重建时旧 engine 会被替换，watchEffect 会自动 detach 旧 binding。
    deps.layoutEngineRef.value = layoutEngine;

    // [W3 2026-09-01] LayoutEngine v6 双引擎：calculateLayout 改为 async
    //   - 默认走 dagre 同步路径（≤1000 节点）
    //   - >1000 节点自动走 elkjs worker 异步路径
    //   - 失败回退到 compactBox
    // 详见 docs/dagre-vs-elkjs-selection.md。
    //
    // [2026-09-02 P0 修复] calculateLayout 15s 超时
    //   历史问题：1325 节点 elkjs worker 通信偶尔超时（Network 列表为空、Console 无错误），
    //             dagre 在 5000 节点退化时也可能卡死。
    //   解决方案：race 15s 超时，超时抛错由 runLayoutEngine 内部 fallback 链捕获，
    //             若全部失败则上抛到 initGraph 外层 → render 阶段总超时兜底。
    const tLayoutStart = performance.now();
    const LAYOUT_TIMEOUT_MS = 15000;
    let layoutTimer: number | null = null;
    const layoutTimeoutPromise = new Promise<never>((_, reject) => {
      layoutTimer = window.setTimeout(() => {
        reject(new Error(
          `[GenealogyTree] layoutEngine.calculateLayout 超时（${LAYOUT_TIMEOUT_MS / 1000}s），` +
          `节点数=${layoutNodes.length}`,
        ));
      }, LAYOUT_TIMEOUT_MS);
    });
    let layoutResult;
    try {
      layoutResult = await Promise.race([
        layoutEngine.calculateLayout(layoutNodes, layoutEdges),
        layoutTimeoutPromise,
      ]);
    } finally {
      if (layoutTimer !== null) clearTimeout(layoutTimer);
      deps.perfStats.renderBreakdown.layoutEngineMs = performance.now() - tLayoutStart;
    }

    // [v6.x 健壮性 L+D 系列] 把最新一次调用的 meta 同步到 debugPanel（用于 perf-overlay）
    // 慢路径事件 / 错误事件由 useLayoutDebugPanel 内置的 attach() 在 logger 链路中实时捕获。
    deps.debugPanel.refresh();

    // 自适应缩放策略：让金字塔形结构正确显示：
    // - zoom 优先适配画布高度（让实际分层可见）
    // - X 方向允许溢出（横向滚动条浏览支系），但不缩得太小（节点需可读）
    // - 中心固定主枝条（centerX=0），主枝在画布中央，支系在两侧扇形展开
    //
    // [2026-09-01 P0 修复] 利用 autoFit 新增的 wideTree 字段：
    //   - 极端宽树（aspectRatio > 3 且 scaleX < minZoom）下，baseViewport.zoom 已被
    //     autoFit 强制改为 fitByHeight（合理值如 0.5-0.7），不再需要 ×1.5 提升
    //   - 此时下限可放宽到 0.5（卡片仍清晰），让主枝 8-10 代完整可见
    //   - 普通树维持原 [0.4, 1.0] 下限，保证窄长树也不缩太小
    const mainLineageIds = new Set(deps.genealogyStore.mainLineage.map(String));
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
    const zoomByNodeCount = deps.partialTree.value ? 1.0 : totalNodeCount > 600 ? 0.45 : totalNodeCount > 300 ? 0.6 : 0.85;
    // [2026-09-01 P0 修复] 极端宽树下 autoFit.zoom 已是 fitByHeight，无需 ×1.5；上限放宽到 0.8
    const isWideTree = baseViewport.wideTree === true;
    const zoomCap = isWideTree ? Math.max(baseViewport.zoom, fitByHeight) : baseViewport.zoom * 1.5;
    let desiredZoom = Math.min(fitByHeight, zoomByNodeCount, zoomCap);
    // [2026-09-01 P0 修复] 极端宽树保 0.5，普通树保 0.4；核心子集模式额外提至 0.6
    const zoomFloor = isWideTree ? 0.5 : (deps.partialTree.value ? 0.6 : 0.4);
    desiredZoom = Math.max(zoomFloor, Math.min(1.0, desiredZoom));

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

    // [2026-09-03 s7-5] 把 layoutResult 中的 spouse 节点位置/边写回 graphData
    applySpouseLayoutResultToGraphData(graphData, pendingSpouseNodes, pendingSpouseEdges, layoutResult);

    // [2026-09-03 s7-5] 把布局引擎计算的正交路径附加到 G6 边 style.orthPath
    const {
      orthPathCount,
      spouseEdgeCount,
      missingPathCount,
    } = applyOrthogonalPathsToGraphData(graphData, layoutResult);
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
      container: deps.container.value,
      width: _canvasWidth,
      height: _canvasHeight,
      // [P0-C 修复 2026-09-04] 关闭全局 element-level 动画(节点/边 fade-in)。
      //   精确根因:G6 v5 dev mode 下 @antv/g-lite AnimationTimeline 冻结,
      //   124 个 shape.animate() 入场动画 currentTime=0、playState='running' 但永无 frame 推进,
      //   runtime/animation.js 第 30/46 行 await animation.finished.then(...) 永不 resolve,
      //   最终挂死在 graph.render() 内部 yield Promise.all([animation.finished, autoFit()]).
      //   修复链路:getElementAnimationOptions(options, ...) 在 animation=false 时返回 [],
      //   executor 不创建 animation 实例,animation.animate() 同步返回 null,after() 直接调用,
      //   render 不再 await 任何 animation.finished,直接进入下一阶段。
      //   不影响 viewport.transform(独立动画通道,见 runtime/viewport.js)和 layout 动画。
      //   详见 docs/testing/2026-09-04-layout-v6-p0-reverify/REPORT.md §0 根因表。
      animation: false,
      // [P0-B 修复 2026-09-03] 关闭 autoResize。
      //   实测根因:G6 v5 的 autoResize:true 在 dev 模式 + 容器尺寸不稳定时,
      //   内部 ResizeObserver 与 setupGraphResize 形成同步死循环,
      //   g6Graph.render() 进入永不返回的死循环(67s 内 rAF 仅触发 2 次)。
      //   改为由我们自己的 setupGraphResize(ResizeObserver) 主动调用 g.setSize 接管。
      //   详见 docs/testing/2026-09-03-layout-v6-reverify/REPORT.md §6.1。
      autoResize: false,
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
            if (!deps.filter.getFilterMatch(d).search || !deps.filter.getFilterMatch(d).gender || !deps.filter.getFilterMatch(d).photo) {
              return '#EDE7DD';
            }
            // [树谱卡片 2026-08-26] 主脉节点保留金色背景
            if (d.data?.is_main_lineage) {
              return '#FFF3C4';
            }
            const gender = d.data?.gender;
            const isLiving = d.data?.is_living;
            // [树谱卡片 2026-08-26] 男蓝女红；已故颜色略深，以贴近图中样式
            if (gender === 'male') {
              return isLiving ? '#E3F2FD' : '#BBDEFB';
            }
            return isLiving ? '#FCE4EC' : '#F8BBD0';
          },
          stroke: (d: any) => {
            const isSelected = deps.genealogyStore.selectedNode?.id === Number(d.id);
            if (isSelected) return '#C9A96E';

            if (!deps.filter.getFilterMatch(d).search || !deps.filter.getFilterMatch(d).gender || !deps.filter.getFilterMatch(d).photo) {
              return '#D0D0D0';
            }
            // [吊线图调色板 2026-08-19] 妻子节点描边用 palette，与子女分支边同色
            // （仅 xianshi 模式会写入 data.palette，其余视图此分支不触发）
            if (d.data?.palette) return d.data.palette;
            // [树谱卡片 2026-08-26] 主脉金边，其余男蓝女红
            if (d.data?.is_main_lineage) return '#C9A96E';
            const gender = d.data?.gender;
            return gender === 'male' ? '#1976D2' : '#C2185B';
          },
          lineWidth: (d: any) => {
            const isSelected = deps.genealogyStore.selectedNode?.id === Number(d.id);
            if (isSelected) return 4;
            if (!d.data?.is_living) return 3;
            if (d.data?.is_main_lineage) return 2.5;
            return 1.5;
          },
          shadowColor: (d: any) => {
            if (deps.genealogyStore.selectedNode?.id === Number(d.id)) return 'rgba(201, 169, 110, 0.4)';
            if (d.data?.is_main_lineage) return 'rgba(201, 169, 110, 0.2)';
            return 'transparent';
          },
          shadowBlur: (d: any) => {
            if (deps.genealogyStore.selectedNode?.id === Number(d.id)) return 16;
            if (d.data?.is_main_lineage) return 8;
            return 0;
          },
          shadowOffsetX: 0,
          shadowOffsetY: 4,
          cursor: 'pointer',
          opacity: (d: any) => {
            if (!deps.filter.getFilterMatch(d).search || !deps.filter.getFilterMatch(d).gender || !deps.filter.getFilterMatch(d).photo) {
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
            const halfW = config.nodeWidth / 2;
            const halfH = config.nodeHeight / 2;
            const pad = 4;
            // [树谱卡片 2026-08-26] portrait 模式头像放右上角，避免遮挡身份标签
            if (deps.genealogyStore.viewMode === 'portrait') {
              return [halfW - config.avatarSize / 2 - pad, -halfH + config.avatarSize / 2 + pad];
            }
            // 其他模式默认左上角
            return [-halfW + config.avatarSize / 2 + pad, -halfH + config.avatarSize / 2 + pad];
          },
          iconRadius: 4,

          // Name label — 关闭 G6 默认 label 渲染的条件：详细/肖像/吊线/苏式（height >= 70）走 drawTraditionalContent 自渲染 4 字段
          // [树谱卡片 2026-08-27 P0 修复] detailed/portrait/xianshi/su 这 4 种模式：
          //   - label: false 让 G6 完全跳过 label shape 创建（base-node.js getLabelStyle）；
          //   - labelText: '' 兜底，万一 label 没被关掉也不会让 G6 拿非字符串去算 bounding box；
          //   - 旧实现把姓名按字拆成 "朱\n熹" 传给 @antv/g-lite v2.7.0 的 measureText，
          //     在 wordWrap=true 路径下 outputText.split 抛 "is not a function"，导致 4 种视图模式白屏。
          // compact（height < 70）+ zhe 仍走 G6 默认 label 路径。
          label: (d: any) => {
            if (['detailed', 'portrait', 'xianshi', 'su'].includes(deps.genealogyStore.viewMode)) {
              return false;
            }
            return true;
          },
          labelText: (d: any) => {
            if (deps.genealogyStore.viewMode === 'zhe') {
              const name = d.label || '';
              return name.length > 6 ? name.substring(0, 5) + '..' : name;
            }
            if (deps.genealogyStore.viewMode === 'compact') {
              const name = d.label || '';
              return name.length > 8 ? name.substring(0, 7) + '..' : name;
            }
            return '';
          },
          labelFill: (d: any) => {
            if (!deps.filter.getFilterMatch(d).search || !deps.filter.getFilterMatch(d).gender || !deps.filter.getFilterMatch(d).photo) {
              return '#B0B0B0';
            }
            return '#2C3E50';
          },
          labelFontSize: config.nameFontSize,
          labelFontWeight: 600,
          labelPlacement: 'center',
          labelOffset: [0, 0],

          // Sublabel (years) — G6 不支持 sublabel: false（这是 Node 的独立 label 属性）
          //   detailed/portrait/xianshi/su 的 sublabelFontSize === 0 已经返回 ''，text 内容
          //   始终是字符串，不会触发 wordWrap.split 崩溃；这里只走默认 G6 sublabel 路径。
          sublabelText: (d: any) => {
            if (deps.genealogyStore.viewMode === 'compact' || config.sublabelFontSize === 0) {
              return '';
            }
            const birth = d.data?.birth_year;
            const death = d.data?.death_year;
            const years = birth && death ? `${birth} - ${death}` : birth ? `${birth} - ` : '';
            // [吊线图 2026-08-17] 排行 + 生卒年：如「第2 · 1900 - 1985」
            if (deps.genealogyStore.viewMode === 'xianshi' && d.data?.birth_order) {
              return years ? `第${d.data.birth_order} · ${years}` : `第${d.data.birth_order}`;
            }
            // [苏式 2026-08-19] 世系条：生卒年竖排在姓名下方（窄卡，字号小）
            if (deps.genealogyStore.viewMode === 'su') {
              return years;
            }
            // [浙式 2026-08-19] 世代格：排行 + 生卒年横排
            if (deps.genealogyStore.viewMode === 'zhe') {
              const rank = d.data?.birth_order ? `第${d.data.birth_order}` : '';
              return [rank, years].filter(Boolean).join(' · ');
            }
            return years;
          },
          sublabelFill: (d: any) => {
            if (!deps.filter.getFilterMatch(d).search || !deps.filter.getFilterMatch(d).gender || !deps.filter.getFilterMatch(d).photo) {
              return '#D0D0D0';
            }
            return '#7F8C8D';
          },
          sublabelFontSize: config.sublabelFontSize,
          sublabelPlacement: 'bottom',
          sublabelOffset: deps.genealogyStore.viewMode === 'portrait' ? [0, 10] : deps.genealogyStore.viewMode === 'su' ? [0, 4] : [0, -2],

          // Gender dot for compact mode
          ...(deps.genealogyStore.viewMode === 'compact' && {
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
            // [P0-1 2026-09-03 审计修复] 边样式回调需要与节点谓词缓存保持同步，
            //   否则会出现「节点变淡但边保持实色」的不一致视觉（记忆 c048640b）。
            //   d.source / d.target 在 G6 v5 边回调中是节点对象，不是 ID 字符串，
            //   因此 getFilterMatch(d.source) 会从 cache 中查 source 节点的匹配结果。
            const sourceMatch = deps.filter.getFilterMatch(d.source);
            const targetMatch = deps.filter.getFilterMatch(d.target);
            const sourceMatched = sourceMatch.search && sourceMatch.gender && sourceMatch.photo;
            const targetMatched = targetMatch.search && targetMatch.gender && targetMatch.photo;
            // 配偶边：一夫多妻场景按妻子 palette 上色；无 palette 时现任=粉红实线，历史=灰色虚线
            if (d.data?.kind === 'spouse') {
              const palette = d.target?.data?.palette || d.source?.data?.palette;
              if (palette) return palette;
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
            // [2026-08-28 P4 一妻多妾优化] 妾之子用点线（区别于过继的 [5,4] 虚线），
            // 传统苏式谱牒"另枝"语义。与 palette 叠加：颜色变母亲色，样式点线。
            // 优先级：is_concubine_child 优先于 childType（非 BIOLOGICAL）。
            // 设计考量：1个 "妾之子同时是过继/收养" 的极端场景，妾之子的"另枝"语义更强，
            // 母亲色+点线 传递的信息量大于 普通色+虚线；故先 return 点线，舍弃后续过继虚线判定。
            if (d.data?.is_concubine_child) return [3, 3];
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

    // [2026-09-03 审计] 原 force 参数从未在函数体内消费，调用处都传 true/false，
    //   但逻辑上 culling 必然扫描并按 viewport 矩形裁剪，无需强制分支。
    //   简化为无参；外层调用点相应去掉冗余参数。
    function performViewportCulling(g: any) {
      if (!g || typeof g.getSize !== 'function') return;
      if (cullingRafId) cancelAnimationFrame(cullingRafId);
      cullingRafId = requestAnimationFrame(() => {
        const [vw, vh] = g.getSize() as [number, number];
        // [2026-09-03 审计] 原代码用 g.getViewportCenter() 但其返回值在 G6 v5 不可靠
        // （记忆 3af7ad86：zoomTo + translateBy 后返回 [-30821] 等异常值），
        // 后续改用 g.getCanvasByViewport([0,0]) + g.getCanvasByViewport([vw,vh]) 算视口矩形，
        // 故 center 变量未被消费，移除以免误导未来读者。
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
      performViewportCulling(g6Graph);
      applyZoomLOD(g6Graph);
    });
    g6Graph.on('afterrender', () => {
      performViewportCulling(g6Graph);
      deps.graphChangeVersion.value++;
    });
    g6Graph.on('aftertransform', () => {
      performViewportCulling(g6Graph);
      applyZoomLOD(g6Graph);
      deps.graphChangeVersion.value++;
    });
    g6Graph.on('aftersizechange', () => {
      performViewportCulling(g6Graph);
    });

    // ==================== 拖拽节点时更新关联边 ====================
    /**
     * 节点拖拽后，重新计算与该节点相连的所有边的正交路径
     * 因为边使用预计算的绝对坐标，拖拽后需要实时更新
     *
     * [2026-08-28 C2] 主节点拖拽时联动配偶及继子女子树
     *   传统习惯中"拖夫随妻"——拖动夫时，同一 CoupleUnit 内的所有妻、继子女
     *   及非主脉子树都应跟随联动，避免布局在拖拽后崩裂。
     *   实现要点：
     *   1) dragstart 记录原位 (x, y)
     *   2) dragend 计算位移 dx/dy
     *   3) BFS 求配偶及其继子女子树 → 集体平移
     *   4) 同步更新所有受影响的边（包括父子边、配偶边）
     */
    const dragOriginMap = new Map<string, { x: number; y: number }>()
    g6Graph.on('node:dragstart', (evt: any) => {
      const id = evt.target?.id || evt.id
      if (!id) return
      const d = g6Graph.getNodeData(id)
      if (!d) return
      dragOriginMap.set(String(id), {
        x: Number(d.style?.x ?? 0),
        y: Number(d.style?.y ?? 0),
      })
    })

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

        // [2026-08-28 C2] 计算拖拽位移；走全量重布局路线只适用于产模式，
        //   拖拽场景下重布局会闪一下。这里采用「平移式联动」：直接平移配偶及继子女子树。
        const origin = dragOriginMap.get(String(nodeId))
        const dx = origin ? Number(newX) - origin.x : 0
        const dy = origin ? Number(newY) - origin.y : 0
        dragOriginMap.delete(String(nodeId))
        // 阈值过滤：未产生位移不联动
        const hasMovement = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5

        // [2026-08-28 C2] 联动配偶及继子女子树：
        //   收集配偶 id 集合，BFS 遍历继子女（以配偶为根的子树），生成平移列表。
        //   [2026-08-28 P1 修复] moveSet 提升到外层作用域复用，避免后续 relatedEdges BFS 重复，
        //     且保证「兄弟共妻」场景下另一兄弟也被收集，使 另一兄弟→共妻 边正确进入 relatedEdges。
        let moveSet: Set<string> | null = null
        if (hasMovement) {
          const allEdges = g6Graph.getEdgeData() || []
          moveSet = new Set<string>([String(nodeId)])
          const queue: string[] = []
          // 种子：被拖拽节点的直接配偶
          for (const e of allEdges) {
            if (e.data?.kind !== 'spouse') continue
            if (e.source === nodeId) queue.push(String(e.target))
            else if (e.target === nodeId) queue.push(String(e.source))
          }
          // BFS：继子女 + 兄弟共妻扩展（均沿 parent-child 与 spouse 边遍历）
          while (queue.length > 0) {
            const cur = queue.shift()!
            if (moveSet.has(cur)) continue
            moveSet.add(cur)
            // cur 的所有子女（以 cur 为源的 parent-child 边）
            for (const e of allEdges) {
              if (e.data?.kind !== 'parent-child') continue
              if (e.source === cur && !moveSet.has(String(e.target))) {
                queue.push(String(e.target))
              }
            }
            // cur 的配偶（兄弟共妻/双重身份场景），也纳入联动
            for (const e of allEdges) {
              if (e.data?.kind !== 'spouse') continue
              if (e.source === cur) queue.push(String(e.target))
              else if (e.target === cur) queue.push(String(e.source))
            }
          }

          const moveUpdates: any[] = []
          for (const id of moveSet) {
            const d = g6Graph.getNodeData(id)
            if (!d) continue
            const cx = Number(d.style?.x ?? 0)
            const cy = Number(d.style?.y ?? 0)
            moveUpdates.push({
              id,
              style: {
                ...d.style,
                x: cx + dx,
                y: cy + dy,
              },
            })
          }
          if (moveUpdates.length > 0) {
            g6Graph.updateNodeData(moveUpdates)
          }
        }

        // 查找所有与「被联动节点」相连的边
        // [2026-08-28 C2] 联动后仍需重算：原节点相关的边 + 配偶相关边 + 继子女相关边
        // [2026-08-28 P1 修复] 直接复用 moveSet（包含 主节点 + 配偶 + 继子女子树 + 兄弟共妻扩展），
        //   避免重跑 BFS 遗漏「另一兄弟→共妻」边。hasMovement=false 时退化为只含 nodeId。
        const allEdges = g6Graph.getEdgeData() || []
        const allRelatedIds = moveSet ?? new Set<string>([String(nodeId)])
        const relatedEdges = allEdges.filter((e: any) =>
          allRelatedIds.has(String(e.source)) || allRelatedIds.has(String(e.target))
        )

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
      deps.perfStats.showOverlay = true;
      let frameCount = 0;
      let lastFpsTs = performance.now();
      // [P0-3 2026-09-03] 上次用户交互时间戳（用于 fpsLoop O(N) 扫描的跳过判定）
      let lastInteractionAt = performance.now();
      const FPS_POLL_INTERVAL_MS = 2000; // 1s → 2s：dev overlay 刷新频率减半
      const IDLE_SKIP_THRESHOLD_MS = 2000; // 空闲超过 2s 跳过 O(N) 扫描
      const fpsLoop = () => {
        frameCount++;
        const now = performance.now();
        if (now - lastFpsTs >= FPS_POLL_INTERVAL_MS) {
          deps.perfStats.fps = Math.round((frameCount * 1000) / (now - lastFpsTs));
          frameCount = 0;
          lastFpsTs = now;
          // 空闲阈值：dev overlay 的 O(N) visible 扫描在没有交互时直接跳过
          //   保留 fps 字段本身的 2s 一次刷新（成本 = 1 个 timestamp 计算，可忽略）
          //   1325 节点下每秒节省 ~1325 次 getElementVisibility() + 1325 次 getEdgeData 遍历
          const idleMs = now - lastInteractionAt;
          if (idleMs > IDLE_SKIP_THRESHOLD_MS) {
            perfRafId = requestAnimationFrame(fpsLoop);
            return;
          }
          try {
            const allNodes = g6Graph.getNodeData?.() || [];
            deps.perfStats.totalNodes = allNodes.length;
            let v = 0;
            for (const n of allNodes) {
              if (g6Graph.getElementVisibility?.(String(n.id)) !== 'hidden') v++;
            }
            deps.perfStats.visibleNodes = v;
            const allEdges = g6Graph.getEdgeData?.() || [];
            deps.perfStats.totalEdges = allEdges.length;
            let ve = 0;
            for (const e of allEdges) {
              if (g6Graph.getElementVisibility?.(String(e.id)) !== 'hidden') ve++;
            }
            deps.perfStats.visibleEdges = ve;
            deps.perfStats.zoom = g6Graph.getZoom?.() ?? 1;
          } catch {
            /* graph may be destroyed */
          }
        }
        perfRafId = requestAnimationFrame(fpsLoop);
      };
      perfRafId = requestAnimationFrame(fpsLoop);

      // [P0-3 2026-09-03] 把 lastInteractionAt 与 G6 生命周期事件挂钩，
      //   让 aftertransform / afterrender / afterlayout / aftersizechange 等事件触发时
      //   标记「最近一次交互」，供 fpsLoop 在空闲时跳过 O(N) 扫描。
      //   注意：此处不会重复触发 performViewportCulling，原有事件钩子继续工作。
      g6Graph.on('afterlayout', () => { lastInteractionAt = performance.now(); });
      g6Graph.on('afterrender', () => { lastInteractionAt = performance.now(); });
      g6Graph.on('aftertransform', () => { lastInteractionAt = performance.now(); });
      g6Graph.on('aftersizechange', () => { lastInteractionAt = performance.now(); });
      g6Graph.on('wheel', () => { lastInteractionAt = performance.now(); });
      g6Graph.on('drag', () => { lastInteractionAt = performance.now(); });
    }

    // Node click event — check if click is on the icon (thumbnail)
    g6Graph.on('node:click', (e: any) => {
      const targetId = e.target?.id;
      const isIconClick = targetId && String(targetId).includes('icon');
      const nodeModel = e.target?.getAttribute?.('model') || e.item?.getModel();

      if (isIconClick && nodeModel?.data?.thumbnail_url) {
        // Click on thumbnail → open image preview
        const name = nodeModel.data.original?.full_name || nodeModel.label || '';
        deps.openImagePreview(nodeModel.data.thumbnail_url, name);
        return;
      }

      if (nodeModel?.data?.original) {
        // [s7-6] 通过 store action 选中节点（保持 setup 层 genealogyStore 引用）
        (deps.genealogyStore as any).selectNode?.(nodeModel.data.original);
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
        const name = data.original.full_name || data.original.label || '未知';
        const gender = data.gender === 'male' ? '男' : '女';
        const birthYear = data.birth_year ? `出生: ${data.birth_year}` : '';
        const deathYear = data.death_date ? `去世: ${data.death_date}` : '';
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
      // [P0-1 2026-09-03] 在 G6 setData + render 之前预计算所有节点的三谓词匹配，
      // 把后续 8 个 style 回调里的 24N 次谓词调用降到 N 次预计算 + Map 读。
      deps.filter.rebuildNodeFilterCache(graphData?.nodes || []);
      // [P1-5 2026-09-03] 让 Vue 进度条先刷新一帧（96% → "正在绘制…"）。
      //   1325 节点下 setData+render 是 3-10s 同步重活，
      //   不让出主线程会让用户感觉进度条卡死在 96%。
      //   一个 microtask 后再进入 G6 重活，Vue 有机会 commit loadingPercent=99 的更新。
      await Promise.resolve();
      // [P0-B 修复 2026-09-03] setData 与 render 拆开计时。
      //   实测根因:g6Graph.render() 进入同步死循环(67s 内 rAF 仅触发 2 次)。
      //   把 setData 单独计时便于下次定位 setData 本身是否就是死循环源头。
      const tSetDataStart = performance.now();
      g6Graph.setData(graphData);
      deps.perfStats.renderBreakdown.setDataMs = performance.now() - tSetDataStart;
      // [P0-B 修复 2026-09-03] dev 探针挂载移到 setData 之后、render 之前。
      //   原挂在 deps.graph.value = g6Graph 之后,意味着 G6 render 失败时永远不挂载。
      //   这里把 layoutEngine / graphData / lastViewport 立即挂到 window,
      //   即使后续 render 超时,console 也能直接 inspect 中间状态。
      if (import.meta.env.DEV) {
        (window as any).__g6_graph__ = g6Graph;
        (window as any).__layoutDebug = {
          engine: layoutEngine,
          config: (layoutEngine as any).config,
          canvasSize: (layoutEngine as any).canvasSize,
          coupleUnitByMain: (layoutEngine as any).coupleUnitByMain,
          lastViewport: lastViewportConfig,
          perf: {
            runElkjs1000: (nodeCount = 1000) => deps.runPerfTestElkjs(nodeCount),
            getStats: () => ({
              elkjs1000Ms: deps.perfStats.elkjs1000Ms,
              elkjsInitMs: deps.perfStats.elkjsInitMs,
              elkjsLayoutMs: deps.perfStats.elkjsLayoutMs,
              renderMs: deps.perfStats.renderMs,
            }),
          },
        };
        // adapter 与各引擎函数按需 import（避免生产环境打入）
        Promise.all([
          import('@/utils/layout-engine-adapter'),
          import('@/utils/dagre-layout'),
          import('@/utils/elkjs-layout'),
        ]).then(([adapter, dagre, elkjs]) => {
          (window as any).__adapter = adapter;
          (window as any).__layoutWithDagre = dagre.layoutWithDagre;
          (window as any).__layoutWithElkjs = elkjs.layoutWithElkjs;
        });
      }
      // [2026-09-02 P0 修复] g6Graph.render() 20s 超时 + 进度 96→99%
      //   G6 v5 内部 setData + draw() 是同步重活（1325 节点下可能 3-10s），
      //   dev mode 下首次 register 14+ 扩展可能更慢。包超时避免无限卡死。
      const tRenderStart = performance.now();
      const G6_RENDER_TIMEOUT_MS = 20000;
      let g6RenderTimer: number | null = null;
      const g6RenderTimeout = new Promise<never>((_, reject) => {
        g6RenderTimer = window.setTimeout(() => {
          reject(new Error(
            `[GenealogyTree] g6Graph.render() 超时（${G6_RENDER_TIMEOUT_MS / 1000}s），` +
            `节点数=${graphData?.nodes?.length || 0}`,
          ));
        }, G6_RENDER_TIMEOUT_MS);
      });
      try {
        await Promise.race([g6Graph.render(), g6RenderTimeout]);
      } finally {
        if (g6RenderTimer !== null) clearTimeout(g6RenderTimer);
        deps.perfStats.renderBreakdown.g6RenderMs = performance.now() - tRenderStart;
      }
      deps.loadingPercent.value = 99;
      deps.graph.value = g6Graph;
      // 调试用：把 G6 实例暴露到全局，方便控制台检查节点/边坐标
      if (import.meta.env.DEV) {
        (window as any).__g6_graph__ = g6Graph;
        // [2026-09-01 P1 修复] 暴露布局引擎实例与方法库，方便浏览器 console 调试
        //   使用方法：
        //   - window.__layoutDebug.engine.autoFit(layoutResult) → 重算 viewport
        //   - window.__layoutDebug.config.autoFit.minZoom = 0.4 → 调参后下次布局生效
        //   - window.__adapter.runLayoutEngine('elkjs', nodes, edges, config) → 强制引擎
        //   - window.__layoutDebug.lastViewport → 当前视口 zoom/center
        (window as any).__layoutDebug = {
          engine: layoutEngine,
          config: (layoutEngine as any).config,
          canvasSize: (layoutEngine as any).canvasSize,
          coupleUnitByMain: (layoutEngine as any).coupleUnitByMain,
          lastViewport: lastViewportConfig,
          // [2026-09-01 §11.10 P3] elkjs WASM perf hook：
          //   浏览器 console 可通过 `__layoutDebug.perf.runElkjs1000()` 触发三段计时压测，
          //   返回值直接打印 initMs / layoutMs / 1000Ms / ok / fallbackUsed 5 个字段。
          //   监控数据同步写入 perfStats.elkjsInitMs / elkjsLayoutMs / elkjs1000Ms。
          perf: {
            runElkjs1000: (nodeCount = 1000) => deps.runPerfTestElkjs(nodeCount),
            getStats: () => ({
              elkjs1000Ms: deps.perfStats.elkjs1000Ms,
              elkjsInitMs: deps.perfStats.elkjsInitMs,
              elkjsLayoutMs: deps.perfStats.elkjsLayoutMs,
              renderMs: deps.perfStats.renderMs,
            }),
          },
        };
        // adapter 与各引擎函数按需 import（避免生产环境打入）
        Promise.all([
          import('@/utils/layout-engine-adapter'),
          import('@/utils/dagre-layout'),
          import('@/utils/elkjs-layout'),
        ]).then(([adapter, dagre, elkjs]) => {
          (window as any).__adapter = adapter;
          (window as any).__layoutWithDagre = dagre.layoutWithDagre;
          (window as any).__layoutWithElkjs = elkjs.layoutWithElkjs;
        });
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
      const totalNodeCount2 = graphData.nodes?.length || 0;
      const rootId = (deps.genealogyStore as any).mainLineage?.[0];
      if (rootId && totalNodeCount2 <= 800 && typeof g6Graph.focusElement === 'function') {
        try {
          g6Graph.focusElement(rootId, { duration: 0 });
        } catch (err) {
          console.warn('[GenealogyTree] focusElement 失败:', err);
        }
      }
      // 渲染完成：进度条快速跑满到 100% 再延时关闭
      deps.finishLoading();
    } catch (e: any) {
      console.error('[GenealogyTree] G6 渲染失败:', e);
      try {
        const { ElMessage } = await import('element-plus');
        ElMessage?.error?.(`渲染失败：${e?.message || '未知错误'}`);
      } catch (_) { /* element-plus 未加载时静默 */ }
      deps.failLoading();
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
      void initGraph(data);
    }, 150);
  }

  /**
   * 组件卸载时清理：
   *   - ResizeObserver（避免容器销毁后还触发 setSize）
   *   - 防抖定时器（避免组件卸载后还触发重建）
   *   - FPS / culling rAF（避免帧循环泄漏）
   */
  function teardown() {
    teardownGraphResize();
    if (initGraphDebounceTimer !== null) {
      clearTimeout(initGraphDebounceTimer);
      initGraphDebounceTimer = null;
    }
    if (perfRafId) {
      cancelAnimationFrame(perfRafId);
      perfRafId = 0;
    }
    if (cullingRafId) {
      cancelAnimationFrame(cullingRafId);
      cullingRafId = 0;
    }
    if (deps.graph.value) {
      deps.graph.value.destroy();
      deps.graph.value = null;
    }
    // 清理 tooltip DOM（避免组件卸载后还残留）
    const tip = document.getElementById('g6-tooltip');
    if (tip) tip.remove();
  }

  // ---- 工厂闭包级 rAF 状态（每个 composable 实例一份） ----
  let perfRafId = 0;
  let cullingRafId = 0;

  return {
    initGraph,
    debouncedInitGraph,
    teardown,
  };
}