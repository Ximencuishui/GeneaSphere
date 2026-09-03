/**
 * 族谱树布局引擎 v6 - 编排器
 *
 * [W1.5 2026-09-01] LayoutEngine v6 重构收尾：本类从 1362 行单体瘦身至约 300 行，
 *   全部算法细节下沉到三个模块：
 *   - tree-layout.ts  节点位置 / CoupleUnit 注册 / 主脉对齐 / 子树扫描线
 *   - edge-router.ts  父子边正交路径 / 水平段错开 / 边路径平移
 *   - spouse-renderer.ts  配偶边梳状视觉
 *
 * [W2.0 2026-09-01] LayoutEngine v6 第二阶段：spouse 边虚拟节点化集成。
 *   calculateLayout 流程在「数据准备」和「边路径」之间新增两个阶段：
 *   - [阶段 0] expandSpouseToVirtualNodes → 把 spouse 边转为 parent-child 链
 *   - [阶段 10] collapseVirtualNodes → 折叠虚拟节点，恢复原始 spouse 边信息
 *   详细契约见 docs/spouse-virtual-node-model.md。
 *
 * 本类只负责：
 * 1. 维护配置 / 画布尺寸 / coupleUnitByMain（§5.3 跨模块共享状态）
 * 2. 编排 calculateLayout 的 13 阶段流水线（W2 引入 expand/collapse 后）
 * 3. 提供公共 API（updateConfig / updateCanvasSize / calculateLayout / autoFit）
 *
 * v3 / v4 / v5 的算法契约保持不变：
 * - 对外签名：LayoutEngine 类、calculateLayout(nodes, edges) → LayoutResult
 * - LayoutResult / EdgePath / CoupleUnit 类型对外可见字段不变
 * - compactBox 仍作为主布局（W3 才替换为 dagre/elkjs 双引擎）
 *
 * 验证：
 * - 38 个 layout-engine.spec.ts 测试全部通过（不收敛、不删改）
 * - 12 个 spouse-virtualizer.spec.ts 边界场景测试通过
 * - 单文件 LOC ≤ 400（需求 §8.3）
 */

// [W3 2026-09-01] @antv/hierarchy compactBox 不再在此文件直接调用，改由
//   layout-engine-adapter.runLayoutEngine 调度（默认 dagre，>1000 节点自动 elkjs，兜底 compactBox）。
//   计算流程中保留 compactBox 作为最终 fallback（adapter 内部使用）。
import type {
  LayoutNode,
  LayoutEdge,
  LayoutResult,
  NodePosition,
  ViewportConfig,
  LayoutConfig,
  LayoutOptions,
  CoupleUnit,
  BoundingBox,
} from '@/types/layout';
import { DEFAULT_LAYOUT_CONFIG } from '@/types/layout';

// 三模块（W1 重构产物）
import {
  buildSpouseMap,
  computeSpouseWidths,
  computeAutoNodeSep,
  computeAutoRankSep,
  computeMaxGeneration,
  positionSpouseNodes,
  alignMainLineage,
  resolveSubtreeOverlap,
  shiftToCenter,
  getBoundingBox,
  reorderSiblingsByBirthOrder, // [2026-09-01 P2 修复] 视觉层 birthOrder 兜底
  detectCycle, // [v6.x 强壮性 A6] 父子边环路检测
} from '@/utils/tree-layout';
import {
  computeOrthogonalEdgePaths,
  resolveEdgeHorizontalOverlaps,
  shiftEdgePathsX,
} from '@/utils/edge-router';
import {
  computeSpouseEdgePaths,
} from '@/utils/spouse-renderer';
import {
  expandSpouseToVirtualNodes,
  collapseVirtualNodes,
  buildSpouseToVirtual,
} from '@/utils/spouse-virtualizer';
import {
  selectLayoutEngine,
  runLayoutEngine,
} from '@/utils/layout-engine-adapter';
// [v6.x 强壮性 A2/A5 + A3 + C2] 错误类型与校验工具
import { LayoutEngineError } from '@/utils/layout-errors';
import {
  validateLayoutInput,
  validateLayoutConfig,
  annotateNodeRoles,
} from '@/utils/layout-validators';
// [v6.x 健壮性 O 系列] 可观测性工具
import {
  createMetrics,
  createCumulativeStats,
  beginPhase,
  recordError,
  finalizeMetrics,
  snapshotMetrics,
  accumulateStats,
  type LayoutMetrics,
  type CumulativeStats,
} from '@/utils/layout-metrics';
// [v6.x 健壮性 L 系列] 日志 + 告警工具
import {
  type LayoutLogger,
  type SlowPhaseEvent,
  type ErrorEvent,
  type AfterCallEvent,
} from '@/utils/layout-logger';
// [v6.x 性能 B 系列] 布局结果缓存（避免相同输入重复计算）
import { LayoutCache, type LayoutCacheStats } from '@/utils/layout-cache';

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * 单阶段慢路径阈值（毫秒），超过后触发 logger.onSlowPhase
 * 默认 200ms：超过此值通常意味着下游引擎或重计算
 */
const DEFAULT_SLOW_PHASE_THRESHOLD_MS = 200;

// ==================== LayoutEngine 类 ====================

/**
 * 族谱树自适应布局引擎
 *
 * 编排器角色：调用三模块完成节点位置 / 边路径 / 居中等步骤，
 * 不再持有任何算法实现细节（除 autoFit 的纯几何计算）。
 */
export class LayoutEngine {
  private config: LayoutConfig;
  private canvasSize: { width: number; height: number };
  /**
   * [W1.2 2026-09-01 保留] CoupleUnit 跨模块共享状态。
   *
   * tree-layout.positionSpouseNodes 写入，
   * tree-layout.alignMainLineage / resolveSubtreeOverlap / shiftSubtree 与
   * edge-router.computeOrthogonalEdgePaths 读取。
   *
   * 见需求文档 §5.3 CoupleUnit 共享模式。
   */
  private coupleUnitByMain = new Map<string, CoupleUnit>();

  /**
   * [v6.x 健壮性 O 系列] 是否启用 metrics 采集。
   *
   * 设为 false 后：不再创建 metrics、跳过 beginPhase/finalizeMetrics 调用、result.meta 缺失。
   * 节省 1-2% 性能开销（阶段计时、对象分配）。
   */
  private metricsEnabled: boolean;

  /**
   * [v6.x 健壮性 O 系列] 累计统计。
   *
   * 每次 calculateLayout 调用结束都会更新一次，无论成功或失败。
   * 通过 getCumulativeStats() 暴露给上层（监控、上报、调试面板）。
   */
  private cumulativeStats: CumulativeStats = createCumulativeStats();

  /**
   * [v6.x 健壮性 O 系列] 最近一次调用的 metrics 快照。
   * 仅当 metricsEnabled 时填充。
   */
  private lastMetrics: LayoutMetrics | null = null;

  /**
   * [v6.x 健壮性 L 系列] 慢路径阈值（毫秒）。Logger 通过 onSlowPhase 钩子接收慢阶段事件。
   */
  private slowPhaseThreshold: number = DEFAULT_SLOW_PHASE_THRESHOLD_MS;

  /**
   * [v6.x 健壮性 L 系列] Logger 实例。
   * 为 null 时所有 onXxx 钩子不触发（不影响主流程）。
   * 通过 setLogger() 注入，或在构造时通过 options.logger 设置。
   */
  private logger: LayoutLogger | null = null;

  /**
   * [v6.x 性能 B 系列] 布局结果缓存（hash + LRU）。
   * 为 null 时不启用缓存（默认）。可通过构造 options.cache 启用。
   *
   * 缓存键 = f(nodes, edges, config) hash。
   * 命中时直接返回缓存的 LayoutResult，跳过 14 个阶段的全部计算。
   */
  private cache: LayoutCache | null = null;

  constructor(
    options: LayoutOptions & {
      logger?: LayoutLogger;
      slowPhaseThreshold?: number;
      cache?: LayoutCache | null;
    },
  ) {
    this.canvasSize = options.canvasSize;
    this.config = { ...DEFAULT_LAYOUT_CONFIG, ...options.config };
    // [v6.x 健壮性 O 系列] metrics 开关（默认开启）
    this.metricsEnabled = options.metricsEnabled ?? true;
    // [v6.x 健壮性 L 系列] Logger + 慢路径阈值
    this.logger = options.logger ?? null;
    if (typeof options.slowPhaseThreshold === 'number') {
      this.slowPhaseThreshold = options.slowPhaseThreshold;
    }
    // [v6.x 性能 B 系列] 缓存注入（默认 null 表示不缓存）
    this.cache = options.cache !== undefined ? options.cache : null;
    // [v6.x 强壮性 C2] 布局配置校验：
    //   - 默认 mode='prod'（自动 clamp 兜底，避免生产环境崩溃）
    //   - 严格 dev 模式可由 options.validateConfigMode === 'dev' 开启（dev 严格抛错）
    //   失败字段写到 console.warn，便于调试但不抛错
    const configCheck = validateLayoutConfig(this.config, {
      mode: options.validateConfigMode ?? 'prod',
    });
    if (configCheck.clampedFields.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[LayoutEngine] LayoutConfig was clamped on ${configCheck.clampedFields.length} field(s):`,
        configCheck.clampedFields.join(', '),
      );
    }
    if (options.validateConfigMode === 'dev' && !configCheck.ok) {
      // dev 模式 + 校验失败：LayoutEngineError 已由 validateLayoutConfig 抛出，
      //   此处仅占位，确保调用方看到错误传播。
    }
  }

  updateConfig(config: Partial<LayoutConfig>) {
    this.config = { ...this.config, ...config };
    // [v6.x 强壮性 C2] updateConfig 同样需要重新校验，避免运行时把合法 config 改成非法
    const configCheck = validateLayoutConfig(this.config, { mode: 'prod' });
    if (configCheck.clampedFields.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[LayoutEngine.updateConfig] Clamped ${configCheck.clampedFields.length} field(s):`,
        configCheck.clampedFields.join(', '),
      );
    }
  }

  updateCanvasSize(size: { width: number; height: number }) {
    this.canvasSize = size;
  }

  /**
   * [v6.x 健壮性 O 系列] 获取本实例累计统计
   *
   * 包含：
   * - totalCalls / successCalls / errorCalls 调用次数
   * - totalDurationMs 总耗时
   * - errorsByCode 错误码分布
   * - nodesProcessed / edgesProcessed 处理规模
   * - enginesUsed 引擎分布（dagre / elkjs / compactBox）
   *
   * 注意：单次调用级别 metrics 见 LayoutResult.meta（每次 calculateLayout 返回值）
   */
  getCumulativeStats(): CumulativeStats {
    return { ...this.cumulativeStats, errorsByCode: { ...this.cumulativeStats.errorsByCode }, enginesUsed: { ...this.cumulativeStats.enginesUsed } };
  }

  /**
   * [v6.x 健壮性 O 系列] 启用 / 关闭 metrics
   *
   * 关闭后：不再创建 metrics 对象、beginPhase 调用空、result.meta 缺失。
   * 累计统计仍然更新（仅时刻记录不依赖 metrics）。
   */
  setMetricsEnabled(enabled: boolean): void {
    this.metricsEnabled = enabled;
  }

  /**
   * [v6.x 健壮性 O 系列] 重置累计统计（一般在切换数据源 / 路由时调用）
   */
  resetCumulativeStats(): void {
    this.cumulativeStats = createCumulativeStats();
    this.lastMetrics = null;
  }

  /**
   * [v6.x 健壮性 O 系列] 获取最近一次调用的 metrics 内部对象（仅供调试）
   */
  getLastMetrics(): LayoutMetrics | null {
    return this.lastMetrics;
  }

  /**
   * [v6.x 健壮性 L 系列] 注入/替换 Logger
   *
   * @param logger 任何 LayoutLogger 兼容实例；传 null 取消订阅
   * @example
   *   engine.setLogger(createConsoleLogger({ slowPhaseThreshold: 100 }))
   *   // 或自定义（订阅到 Sentry / DataDog）
   *   engine.setLogger({ onSlowPhase: e => Sentry.captureMessage(...) })
   */
  setLogger(logger: LayoutLogger | null): void {
    this.logger = logger;
  }

  /**
   * [v6.x 健壮性 L 系列] 设置慢路径阈值
   */
  setSlowPhaseThreshold(ms: number): void {
    this.slowPhaseThreshold = Math.max(0, ms);
  }

  /**
   * [v6.x 性能 B 系列] 注入/替换缓存实例
   *
   * @param cache 任意 LayoutCache 实例；传 null 关闭缓存
   * @example
   *   engine.setCache(new LayoutCache({ maxSize: 16 }))
   */
  setCache(cache: LayoutCache | null): void {
    this.cache = cache;
  }

  /**
   * [v6.x 性能 B 系列] 清空缓存（数据源切换/重大编辑后调用）
   */
  clearCache(): void {
    this.cache?.clear();
  }

  /**
   * [v6.x 性能 B 系列] 获取缓存统计
   *
   * 返回 LayoutCacheStats：size/hits/misses/hitRate/invalidations/evictions
   * 缓存未启用时返回 null。
   */
  getCacheStats(): LayoutCacheStats | null {
    return this.cache ? this.cache.getStats() : null;
  }

  /**
   * [v6.x 健壮性 L 系列] 触发慢路径 hook（内部使用）
   *
   * 仅在 metrics + logger + onSlowPhase 三者齐备时触发。
   * 所有调用包 try/catch 防止 logger 成为 bug 源。
   */
  private fireSlowPhase(phase: string, durationMs: number): void {
    if (!this.logger?.onSlowPhase) return;
    if (durationMs < this.slowPhaseThreshold) return;
    const evt: SlowPhaseEvent = {
      phase,
      durationMs,
      thresholdMs: this.slowPhaseThreshold,
      totalMs: 0, // calculateLayout 内会更新
      engineUsed: this.lastMetrics?.engineUsed,
      input: {
        nodeCount: this.lastMetrics?.input.nodeCount ?? 0,
        edgeCount: this.lastMetrics?.input.edgeCount ?? 0,
      },
      message: `phase "${phase}" took ${durationMs.toFixed(1)}ms (> ${this.slowPhaseThreshold}ms)`,
    };
    try { this.logger.onSlowPhase(evt); } catch { /* silent */ }
  }

  /**
   * [v6.x 健壮性 L 系列] 触发错误 hook
   */
  private fireError(code: string, message: string, hasResult: boolean): void {
    if (!this.logger?.onError) return;
    const evt: ErrorEvent = { code, message, timestamp: Date.now(), hasResult };
    try { this.logger.onError(evt); } catch { /* silent */ }
  }

  /**
   * [v6.x 健壮性 L 系列] 触发 after-call hook（含成功/失败）
   */
  private fireAfterCall(event: AfterCallEvent): void {
    if (!this.logger?.onAfterCall) return;
    try { this.logger.onAfterCall(event); } catch { /* silent */ }
  }

  /**
   * [v6.x 健壮性 L 系列] 阶段结束包装器：调用 endFn 记录耗时，并触发慢路径钩子
   *
   * 用法：
   *   const endEngine = metrics ? beginPhase(metrics, 'engine') : null
   *   // ... phase code ...
   *   this.endPhase('engine', endEngine)
   */
  private endPhase(
    phaseName: string,
    endFn: (() => number) | null | undefined,
  ): void {
    if (!endFn) return;
    const durationMs = endFn();
    this.fireSlowPhase(phaseName, durationMs);
  }

  /**
   * 主入口：计算布局（编排器）
   *
   * 流水线（需求文档 §2.3 数据流）：
   *   1) 准备数据（nodeMap / spouseNodeIds / childrenByParent / parentOf）
   *   2) 计算间距（nodeSep / rankSep / maxGeneration）+ 预计算配偶映射
   *   3) 双引擎主布局（dagre 同步 / elkjs 异步 worker）→ 节点位置（compactBox 作兜底）
   *   4) tree-layout.positionSpouseNodes  → 注册 coupleUnitByMain
   *   5) tree-layout.alignMainLineage
   *   6) tree-layout.resolveSubtreeOverlap
   *   7) 整体居中（tree-layout.shiftToCenter + edge-router.shiftEdgePathsX）
   *   8) edge-router.computeOrthogonalEdgePaths
   *   9) spouse-renderer.computeSpouseEdgePaths
   *  10) edge-router.resolveEdgeHorizontalOverlaps
   *  11) 主脉再居中（强制主脉 x=0 作为视觉锚点）
   */
  async calculateLayout(
    nodes: LayoutNode[],
    edges: LayoutEdge[],
  ): Promise<LayoutResult> {
    const config = this.config;

    // ============== [v6.x 性能 B 系列] 缓存检查（命中则直接返回） ==============
    // 命中条件：this.cache 启用 + (nodes, edges, config) hash 命中已有条目
    // 命中后跳过全部 14 个阶段计算，仅做最少化的统计 + logger 调用
    if (this.cache) {
      const cached = this.cache.get(nodes, edges, config);
      if (cached) {
        // 命中：仅累计一次 success call + fireAfterCall，避免污染 metrics
        const durationMs = nowMs();
        accumulateStats(this.cumulativeStats, null, durationMs, false);
        this.fireAfterCall({
          durationMs,
          success: true,
          hasMetrics: false,
          errorCount: 0,
          wideTree: cached.meta?.wideTree,
        });
        return cached;
      }
    }

    // ============== [v6.x 健壮性 O 系列] metrics 初始化 ==============

    /**
     * 创建本次调用的 metrics 对象。
     * 仅当 LayoutEngine.metricsEnabled=true 时创建；否则 beginPhase 是空操作。
     *
     * 必须在 try 块之外创建，否则 catch 里 recordError 时拿不到 metrics 引用。
     */
    const metrics = this.metricsEnabled
      ? createMetrics(nodes.length, edges.length)
      : null;
    const totalStart = this.metricsEnabled ? nowMs() : 0;
    let hasError = false;
    let engineUsedForMeta: 'dagre' | 'elkjs' | 'compactBox' | undefined;
    let wideTreeForMeta: boolean | undefined;

    if (metrics) {
      // 提前填充边分类（这样即使后面 throw 也能在 result 里看到输入规模）
      for (const e of edges) {
        if (e.kind === 'spouse') metrics.input.spouseEdgeCount += 1;
        else metrics.input.parentChildEdgeCount += 1;
      }
      this.lastMetrics = metrics;
    }

    try {

    // ============== [Phase: validate] 输入校验 ==============
    const endValidate = metrics ? beginPhase(metrics, 'validate') : null;
    try {
      // [v6.x 强壮性 A2/A5] 输入完整性校验（早期捕获结构性问题，避免下游莫名错误）
      //   - 0 节点抛 LAYOUT_EMPTY_GRAPH
      //   - id 缺失 / 重叠抛 INVALID_INPUT
      //   - 边引用不存在节点抛 INVALID_INPUT
      //   - 边 kind 非法抛 INVALID_INPUT
      validateLayoutInput(nodes, edges);
    } finally {
      this.endPhase('validate', endValidate);
    }

    // [A2 2026-08-28] 清理单次布局的瞬态缓存，避免上次结果污染
    this.coupleUnitByMain.clear();
    // computeSubtreeWidth 的记忆化缓存：单次布局运行中有效
    const subtreeWidthCache = new Map<string, number>();

    // ============== [Phase: virtualize] spouse 边虚拟节点化 ==============
    const endVirtualize = metrics ? beginPhase(metrics, 'virtualize') : null;

    /**
     * [W2 2026-09-01] 把 spouse 边转为「main → virt → spouseId」虚拟链，
     * 让 compactBox / dagre / elkjs 等通用 DAG 布局器可直接消费。
     * 详见 docs/spouse-virtual-node-model.md。
     */
    const originalSpouseEdges = edges.filter((e) => e.kind === 'spouse');
    const virtualized = expandSpouseToVirtualNodes(nodes, edges);
    const virtualNodes = virtualized.virtualNodes;
    const virtualEdges = virtualized.virtualEdges;
    const virtualToSpouse = virtualized.virtualToSpouse;
    const spouseToVirtual = buildSpouseToVirtual(virtualToSpouse);

    this.endPhase('virtualize', endVirtualize);

    // ============== [1] 准备数据 ==============
    const endPrepare = metrics ? beginPhase(metrics, 'prepare') : null;

    // 1.1 节点查找表（含虚拟节点）
    const nodeMap = new Map<string, LayoutNode>();
    for (const node of virtualNodes) {
      nodeMap.set(node.id, node);
    }

    // 1.2 识别配偶节点（双重身份场景：Y 可能是 gen>=0 但被 virtualToSpouse 映射为 spouse）
    //   双重身份：X 既是 P 的子又是 Y 的配偶（Y 可能是 gen=0 或其他非负值）。
    //   此时 Y 应被视为 spouse（不进主布局树，由 positionSpouseNodes 定位）。
    //   注：仅靠 generation<0 无法识别双重身份的配偶节点。
    const spouseNodeIds = new Set<string>();
    for (const node of nodes) {
      if ((node.generation ?? 0) < 0) {
        spouseNodeIds.add(node.id);
      }
    }
    for (const spouseId of virtualToSpouse.values()) {
      spouseNodeIds.add(spouseId);
    }

    // 1.3 构建父子邻接表（用虚拟 edges，含 fromVirtualSpouse 边）
    const childrenByParent = new Map<string, string[]>();
    const parentOf = new Map<string, string>();

    for (const edge of virtualEdges) {
      if (edge.kind === 'spouse') continue;
      if (!childrenByParent.has(edge.source)) {
        childrenByParent.set(edge.source, []);
      }
      childrenByParent.get(edge.source)!.push(edge.target);
      parentOf.set(edge.target, edge.source);
    }

    // 1.4 找根节点（无父且非配偶节点）
    const roots = virtualNodes.filter(n => !parentOf.has(n.id) && !spouseNodeIds.has(n.id) && !n.virtualSpouse);
    if (roots.length === 0) {
      const fallback = virtualNodes.find(n => !spouseNodeIds.has(n.id) && !n.virtualSpouse);
      if (fallback) roots.push(fallback);
    }

    // [v6.x 强壮性 A5+A6+A3] 阶段[1] 防御三连：
    //   - A5: 根节点缺失抛 LAYOUT_NO_ROOT_NODE
    //   - A6: 父子边存在环路抛 LAYOUT_CYCLE_DETECTED
    //   - A3: 节点角色标注（fill nodeRole，给下游 infer 用）
    if (roots.length === 0) {
      if (metrics) {
        recordError(metrics, 'LAYOUT_NO_ROOT_NODE',
          `No root node found in graph with ${nodes.length} node(s) and ${edges.length} edge(s).`);
      }
      throw new LayoutEngineError(
        'LAYOUT_NO_ROOT_NODE',
        `No root node found in graph with ${nodes.length} node(s) and ${edges.length} edge(s).`,
        {
          nodeIds: nodes.map((n) => n.id).slice(0, 50),
          virtualNodeIds: virtualNodes.map((n) => n.id).slice(0, 50),
          spouseNodeIds: Array.from(spouseNodeIds).slice(0, 50),
          hint: '检查数据：所有节点都被标记为 spouse / virtualSpouse，或父子关系全部构成环路。',
        },
      );
    }

    // 环路检测：仅对 parent-child 边扫（spouse 边和虚拟 father 边不会构成 cycle）
    const cycleCheck = detectCycle(virtualEdges, nodeMap);
    if (cycleCheck.hasCycle) {
      if (metrics) {
        recordError(metrics, 'LAYOUT_CYCLE_DETECTED',
          `parent-child edges contain a cycle: ${(cycleCheck.cyclePath ?? []).join(' → ')}`);
      }
      throw new LayoutEngineError(
        'LAYOUT_CYCLE_DETECTED',
        `parent-child edges contain a cycle: ${(cycleCheck.cyclePath ?? []).join(' → ')}`,
        {
          cyclePath: cycleCheck.cyclePath,
          edgeCount: virtualEdges.length,
        },
      );
    }

    // 节点角色标注：fill nodeRole 字段，给下游模块隐式条件回退路径用
    annotateNodeRoles(nodeMap, spouseNodeIds, childrenByParent);

    this.endPhase('prepare', endPrepare);

    // ============== [2] 计算间距 ==============
    const endSpacing = metrics ? beginPhase(metrics, 'spacing') : null;
    const maxGeneration = computeMaxGeneration(childrenByParent, roots);
    const nodeSep = config.nodeSep === 'auto'
      ? computeAutoNodeSep(nodes.length, maxGeneration, config.nodeWidth, config.maxNodeSep ?? 80)
      : config.nodeSep;
    const rankSep = config.rankSep === 'auto'
      ? computeAutoRankSep(config.nodeHeight)
      : config.rankSep;
    this.endPhase('spacing', endSpacing);

    // ============== [3] 引擎选择与主布局 ==============
    const endEngine = metrics ? beginPhase(metrics, 'engine') : null;

    /**
     * [W3 2026-09-01] 双引擎调度（dagre 同步 / elkjs 异步 worker / compactBox 兜底）。
     *   - engine='auto'（默认）：totalNodes ≤ engineThreshold → dagre，否则 elkjs
     *   - engine='dagre' / 'elkjs' / 'compactBox'：强制使用指定引擎
     *   - 失败回退链：elkjs → dagre → compactBox
     *   详见 docs/dagre-vs-elkjs-selection.md。
     */
    const engineType = selectLayoutEngine(nodes.length, config);
    engineUsedForMeta = engineType;
    const positionsFromEngine = await runLayoutEngine(
      engineType,
      virtualNodes,
      virtualEdges,
      config,
    );

    const nodePositions = new Map<string, NodePosition>();
    for (const [id, pos] of positionsFromEngine) {
      nodePositions.set(id, pos);
    }
    this.endPhase('engine', endEngine);

    // ============== [4] 预计算配偶映射 ==============
    const endSpouseMap = metrics ? beginPhase(metrics, 'spouseMap') : null;

    // [W2 2026-09-01] buildSpouseMap 用原始 edges（不含虚拟 edges），
    // 保持 spouseByMain 的语义不变（mainId → 原始 spouse edges）。
    const spouseByMain = buildSpouseMap(edges, spouseNodeIds);
    // spouseWidthByMain 保留计算（W3 替换 dagre 后会用作约束条件）
    // 当前未使用，但保持调用链以维持 v5 行为
    computeSpouseWidths(spouseByMain, nodeMap, childrenByParent, config, subtreeWidthCache);

    this.endPhase('spouseMap', endSpouseMap);

    // ============== [5] 配偶贴附定位 ==============
    const endSpouseAttach = metrics ? beginPhase(metrics, 'spouseAttach') : null;
    if (config.spouseOptimization) {
      positionSpouseNodes(
        nodePositions, nodeMap, spouseByMain, virtualEdges,
        childrenByParent, config, rankSep, nodeSep,
        this.coupleUnitByMain,
        spouseToVirtual, // [W2 2026-09-01] 传给 tree-layout 用
      );
    }
    this.endPhase('spouseAttach', endSpouseAttach);

    // ============== [6] 主脉对齐 ==============
    const endAlign = metrics ? beginPhase(metrics, 'align') : null;
    if (config.mainLineageCenter) {
      alignMainLineage(
        nodePositions, nodeMap, spouseByMain,
        childrenByParent, this.coupleUnitByMain,
        nodeMap, // [W2 2026-09-01] 传 nodeMap 让 shiftNonMainSubtree 跳过虚拟节点
      );
    }
    this.endPhase('align', endAlign);

    // ============== [7] 子树扫描线推开 ==============
    const endOverlap = metrics ? beginPhase(metrics, 'subtreeOverlap') : null;
    if (config.resolveSubtreeOverlap) {
      resolveSubtreeOverlap(
        nodePositions, nodeMap, childrenByParent,
        spouseByMain, this.coupleUnitByMain, nodeSep,
        nodeMap, // [W2 2026-09-01] 传 nodeMap 让 computeBounds 跳过虚拟节点 child
      );
    }
    this.endPhase('subtreeOverlap', endOverlap);

    // ============== [8] 整体居中平移 ==============
    const endCenter = metrics ? beginPhase(metrics, 'center') : null;

    // 整体平移使布局居中：补偿之前所有阶段的累积偏移。
    // [W2 2026-09-01] 在虚拟图上平移（含虚拟边 path），collapse 后虚拟边 path 被过滤，
    // 真实 parent-child 边 path 同步平移。
    const offsetX = shiftToCenter(nodePositions);
    shiftEdgePathsX(virtualEdges, offsetX);

    this.endPhase('center', endCenter);

    // ============== [9] 父子边正交路径 ==============
    const endEdge = metrics ? beginPhase(metrics, 'edgePaths') : null;

    // [W2 2026-09-01] edge-router 在虚拟图上算所有 parent-child 边 path，
    // edge-router 内部跳过 fromVirtualSpouse=true 的边（spouse-renderer 接管渲染）。
    computeOrthogonalEdgePaths(
      nodePositions,
      virtualEdges,
      this.coupleUnitByMain,
      // [v6.x X 系列] 端点内缩从 config.edgeInset 读取
      config.edgeInset,
    );

    this.endPhase('edgePaths', endEdge);

    // ============== [10] 折叠虚拟节点（W2 新增） ==============
    const endCollapse = metrics ? beginPhase(metrics, 'collapse') : null;

    /**
     * 把虚拟节点从 layout 结果中过滤：
     * - realNodes：不含虚拟节点
     * - 真实 parent-child 边的 path 保留
     * - virtualToSpousePos：虚拟节点位置映射到真实配偶（X 复制）
     *
     * 注：原始 spouse 边在 collapse 时已不在 virtualEdges 中（已转为虚拟边），
     * spouse 边的 path 渲染由 spouse-renderer 在阶段 [12] 接管。
     */
    const collapsed = collapseVirtualNodes(
      { nodes: Array.from(nodePositions.values()), edges: virtualEdges },
      virtualToSpouse,
    );

    this.endPhase('collapse', endCollapse);

    /**
     * 折叠阶段同时把真实配偶节点位置从虚拟链一并"重算"：
     * - 真实 spouse 节点的 X 来自 positionSpouseNodes 已设置的 cursorX 值（保留）
     * - 虚拟节点 X 已被 positionSpouseNodes 覆盖为 mainPos.x（保持，与 main 同列）
     * - 因此不再需要在 layout-engine 阶段做额外覆盖
     *
     * 之前的实现存在 bug：用虚拟节点 X 覆盖真实 spouse X，导致 A1/P1.x/双重身份
     *   测试中 spouse 节点 X 被错误覆盖为虚拟节点 X（通常 ≠ 真实 spouse X）。
     *
     * collapsed.virtualToSpousePos 保留供配偶边路径参考（如 spouse-renderer），
     *   其内 spousePos.x 优先取真实配偶位置，回退到虚拟节点位置。
     */

    // ============== [11] 配偶边正交路径 ==============
    const endSpouseEdge = metrics ? beginPhase(metrics, 'spouseEdgePaths') : null;

    // [W2 2026-09-01] 在 collapse 后的真实图上跑 spouse-renderer，
    // 输入 originalSpouseEdges（保留 spouse 边 metadata）和真实节点位置
    const realNodePositions = new Map<string, NodePosition>(
      collapsed.nodes.map(n => [n.id, n])
    );
    computeSpouseEdgePaths(realNodePositions, spouseByMain, config);

    // 把 spouse 边 path 从 spouseByMain 中收集，merge 到 result.edges
    const finalEdges: LayoutEdge[] = [...collapsed.edges];
    for (const [mainId, mainSpouseEdges] of spouseByMain) {
      for (const edge of mainSpouseEdges) {
        // 直接 push 原 edge 对象（spouse-renderer 已通过 nodePositions 索引 + 写回 edge.path）
        // spouse-renderer 不修改 edges 数组，只通过 mainId/spouseId 查找位置并写回 edge.path
        if (!finalEdges.find(e => e.id === edge.id)) {
          finalEdges.push(edge);
        }
      }
    }

    this.endPhase('spouseEdgePaths', endSpouseEdge);

    // ============== [12] 同层水平边段错开 ==============
    const endSeparation = metrics ? beginPhase(metrics, 'separation') : null;
    if (config.edgeHorizontalSeparation > 0) {
      resolveEdgeHorizontalOverlaps(finalEdges, config);
    }
    this.endPhase('separation', endSeparation);

    // ============== [13] 主脉再居中 ==============
    const endRecenter = metrics ? beginPhase(metrics, 'recenter') : null;

    // 强制主脉 x=0 作为视觉锚点（即使第 8 步整体平移了，主脉仍可能偏离）
    if (config.mainLineageCenter) {
      const mainXValues: number[] = [];
      for (const [id, node] of nodeMap) {
        if (node.isMainLineage && (node.generation ?? 0) >= 0 && !node.virtualSpouse) {
          const pos = realNodePositions.get(id);
          if (pos) mainXValues.push(pos.x);
        }
      }
      if (mainXValues.length > 0) {
        const mainAvgX = mainXValues.reduce((a, b) => a + b, 0) / mainXValues.length;
        if (Math.abs(mainAvgX) > 1) {
          for (const [, pos] of realNodePositions) {
            pos.x -= mainAvgX;
          }
          shiftEdgePathsX(finalEdges, -mainAvgX);
        }
      }
    }
    this.endPhase('recenter', endRecenter);

    // ============== [14] birthOrder 视觉层兜底（P2 修复） ==============
    const endBirthOrder = metrics ? beginPhase(metrics, 'birthOrder') : null;

    /**
     * [2026-09-01 P2 修复] dagre 内部已调用一次 reorderSiblingsByBirthOrder（紧凑层兜底），
     * 但 mainLineageCenter + resolveSubtreeOverlap + shiftToCenter 三个阶段可能再次
     * 扰动兄弟 X 顺序，导致浏览器实测 3/28 例非严格单调。
     *
     * 在最终输出前再调用一次，对所有指定了 birthOrder 的兄弟组强制按排行升序排列 X。
     * 使用 finalEdges（已 collapse 的真实 parent-child 边）作为分组依据。
     */
    reorderSiblingsByBirthOrder(realNodePositions, finalEdges, config);
    this.endPhase('birthOrder', endBirthOrder);

    const finalBounds = getBoundingBox(collapsed.nodes);

    const result: LayoutResult = {
      nodes: collapsed.nodes,
      edges: finalEdges,
      bounds: finalBounds,
      generations: maxGeneration + 1,
      totalNodes: nodes.length, // 不含虚拟节点的真实节点数
    };

    if (metrics) {
      const snapshot = snapshotMetrics(metrics);
      result.meta = {
        timings: snapshot.timings,
        phaseOrder: snapshot.phaseOrder,
        totalMs: nowMs() - totalStart,
        errors: snapshot.errors,
        engineUsed: engineUsedForMeta,
        wideTree: wideTreeForMeta,
        input: snapshot.input,
      };
    }

    // ============== [v6.x 性能 B 系列] 写入缓存 ==============
    // 成功路径末尾写入：让后续相同输入直接命中跳过全部 14 阶段计算
    // 在 metrics 写入 meta 之后执行——避免缓存的 result.meta 被中途污染
    if (this.cache) {
      this.cache.set(nodes, edges, result, config);
    }

    return result;

    } catch (err) {
      hasError = true;
      if (metrics && !(err instanceof LayoutEngineError)) {
        recordError(metrics, 'LAYOUT_ENGINE_THREW', String((err as Error)?.message ?? err));
      }
      // [v6.x 健壮性 L 系列] 任何错误都触发错误 hook（统一在 catch 块处理，避免双触发）
      const errorCode = err instanceof LayoutEngineError
        ? err.code
        : 'LAYOUT_ENGINE_THREW';
      const errorMsg = err instanceof LayoutEngineError
        ? err.message
        : String((err as Error)?.message ?? err);
      this.fireError(errorCode, errorMsg, false);
      throw err;
    } finally {
      // [v6.x O 系列] 累计统计无论 metricsEnabled 是否开启都应更新
      //   - metrics 启用时：传 snapshot（可获取 input/error 详细）
      //   - metrics 关闭时：传 null，仅 totalCalls + totalDurationMs 更新
      const totalDuration = nowMs() - totalStart;
      let errorCount = 0;
      if (metrics) {
        finalizeMetrics(metrics, {
          engineUsed: engineUsedForMeta,
          wideTree: wideTreeForMeta,
        });
        const snapshot = snapshotMetrics(metrics);
        errorCount = snapshot.errors.length;
        accumulateStats(this.cumulativeStats, snapshot, totalDuration, hasError);
      } else {
        accumulateStats(this.cumulativeStats, null, totalDuration, hasError);
      }
      // [v6.x 健壮性 L 系列] 触发 after-call hook（成功 + 失败都会调用）
      this.fireAfterCall({
        durationMs: totalDuration,
        success: !hasError,
        hasMetrics: !!metrics,
        errorCount,
        wideTree: wideTreeForMeta,
      });
    }
  }

  /**
   * 自适应缩放（编排器内联：不属于三模块范围，是纯几何计算）
   *
   * [2026-09-01 P0 修复] 横向过宽场景（aspectRatio > 3 且原生 scaleX < minZoom）：
   *   旧逻辑 `min(scaleX, scaleY)` 会得到极小值（如 0.018），clamp 到 minZoom=0.25 后
   *   仍然不可用（1280px 画布对应 67Kpx 布局仍需大量横向滚动）。
   *   新逻辑：当 contentW / contentH > 3 时，强制使用 fitByHeight（让 Y 适配画布高度），
   *   同时在返回结果中标记 wideTree=true，调用方据此降低 zoom 下限以保持节点可读。
   */
  autoFit(layout: LayoutResult): ViewportConfig {
    const { bounds } = layout;
    const { width: canvasW, height: canvasH } = this.canvasSize;
    const padding = this.config.autoFit.padding;

    const contentW = Math.max(1, bounds.maxX - bounds.minX);
    const contentH = Math.max(1, bounds.maxY - bounds.minY);
    const aspectRatio = contentW / contentH;

    // 缩放：content 的 X 跨度适配 canvas 宽度，Y 跨度适配 canvas 高度
    const scaleX = (canvasW - padding * 2) / contentW;
    const scaleY = (canvasH - padding * 2) / contentH;

    // [v6.x X 系列] 横向爆炸场景检测 + 强制 fitByHeight
    //   当 aspectRatio > wideTreeAspectRatio（默认 3）且 scaleX 已低于 minZoom 时，
    //   原生 min(scaleX, scaleY) 取到的几乎全是 scaleX 的极小值，对用户无意义。
    //   改用 fitByHeight 让 Y 适配画布高度，横向通过 panning 浏览支系。
    const wideTreeThreshold = this.config.wideTreeAspectRatio ?? 3;
    const wideTree = aspectRatio > wideTreeThreshold && scaleX < this.config.autoFit.minZoom;
    let zoom = wideTree ? scaleY : Math.min(scaleX, scaleY);

    zoom = Math.max(this.config.autoFit.minZoom, Math.min(this.config.autoFit.maxZoom, zoom));

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    // 保留 layoutDirection 供调用方区分 TB/LR
    let direction: 'TB' | 'LR' = 'TB';
    if (this.config.autoFit.preferDirection === 'auto') {
      direction = contentW > contentH ? 'LR' : 'TB';
    } else {
      direction = this.config.autoFit.preferDirection;
    }

    // [v6.x O 系列] 若 metrics 最近一次调用已被 autoFit 拾取，更新 wideTree 标记
    if (this.lastMetrics) {
      this.lastMetrics.wideTree = wideTree;
    }

    return {
      zoom,
      centerX,
      centerY,
      layoutDirection: direction,
      wideTree,
      contentAspectRatio: aspectRatio,
    };
  }
}