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
} from '@/types/layout';
import { DEFAULT_LAYOUT_CONFIG } from '@/types/layout';

// [v6.x 强壮性 A2/A5 + C2] 错误类型与校验工具（仅编排器层使用）
import { LayoutEngineError } from '@/utils/layout-errors';
import {
  validateLayoutInput,
  validateLayoutConfig,
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
} from '@/utils/layout-logger';
// [v6.x 性能 B 系列] 布局结果缓存（避免相同输入重复计算）
import { LayoutCache, type LayoutCacheStats } from '@/utils/layout-cache';
// [P0-3 2026-09-03 §8.3 拆分] autoFit 算法搬到独立模块
import { computeAutoFit } from '@/utils/layout-engine-auto-fit';
// [§8.3 2026-09-03 拆分] fire* / endPhase 钩子搬到独立模块
import {
  endPhase,
  fireError,
  fireAfterCall,
  type HookContext,
} from '@/utils/layout-engine-hooks';
// [§8.3 2026-09-03 拆分] virtualize + prepare 阶段搬到独立模块
import { prepareLayoutData } from '@/utils/layout-engine-prepare';
// [§8.3 2026-09-03 拆分] 14 阶段流水线搬到独立模块（spacing → birthOrder）
import { runLayoutPipeline } from '@/utils/layout-engine-pipeline';

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
  // [W1.2 2026-09-01 保留] CoupleUnit 跨模块共享状态（见需求文档 §5.3 CoupleUnit 共享模式）。
  private coupleUnitByMain = new Map<string, CoupleUnit>();
  // [v6.x 健壮性 O 系列] 是否启用 metrics 采集。设为 false 后：不再创建 metrics、跳过 beginPhase/finalizeMetrics 调用、result.meta 缺失。
  private metricsEnabled: boolean;
  // [v6.x 健壮性 O 系列] 单实例累计统计。每次 calculateLayout 调用结束更新，无论成功失败。通过 getCumulativeStats() 暴露给上层。
  private cumulativeStats: CumulativeStats = createCumulativeStats();
  // [v6.x 健壮性 O 系列] 最近一次调用的 metrics 快照。仅当 metricsEnabled 时填充。
  private lastMetrics: LayoutMetrics | null = null;
  // [v6.x 健壮性 L 系列] 慢路径阈值（毫秒）。Logger 通过 onSlowPhase 钩子接收慢阶段事件。
  private slowPhaseThreshold: number = DEFAULT_SLOW_PHASE_THRESHOLD_MS;
  // [v6.x 健壮性 L 系列] Logger 实例。为 null 时所有 onXxx 钩子不触发。通过 setLogger() 注入。
  private logger: LayoutLogger | null = null;
  // [v6.x 性能 B 系列] 布局结果缓存（hash + LRU）。为 null 时不启用缓存（默认）。可通过构造 options.cache 启用。
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
    // [v6.x 强壮性 C2] 布局配置校验：默认 mode='prod'（自动 clamp 兜底，避免生产环境崩溃）；
    // 严格 dev 模式由 options.validateConfigMode === 'dev' 开启（dev 严格抛错）。
    // 失败字段写到 console.warn，便于调试但不抛错。
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

  // ============== 累计统计 / metrics 状态管理 ==============
  // [v6.x 健壮性 O 系列] 单实例累计统计、metrics 开关、最近 metrics 引用
  getCumulativeStats(): CumulativeStats {
    return { ...this.cumulativeStats, errorsByCode: { ...this.cumulativeStats.errorsByCode }, enginesUsed: { ...this.cumulativeStats.enginesUsed } };
  }
  setMetricsEnabled(enabled: boolean): void { this.metricsEnabled = enabled; }
  resetCumulativeStats(): void { this.cumulativeStats = createCumulativeStats(); this.lastMetrics = null; }
  getLastMetrics(): LayoutMetrics | null { return this.lastMetrics; }

  // ============== Logger + 阈值（v6.x 健壮性 L 系列）==============
  /** 注入/替换 Logger；传 null 取消订阅。 */
  setLogger(logger: LayoutLogger | null): void { this.logger = logger; }
  /** 设置慢路径阈值（毫秒） */
  setSlowPhaseThreshold(ms: number): void { this.slowPhaseThreshold = Math.max(0, ms); }

  // ============== Cache（v6.x 性能 B 系列）==============
  /** 注入/替换缓存实例；传 null 关闭缓存。 */
  setCache(cache: LayoutCache | null): void { this.cache = cache; }
  clearCache(): void { this.cache?.clear(); }
  /** 缓存统计（size/hits/misses/hitRate/invalidations/evictions）；未启用时返回 null */
  getCacheStats(): LayoutCacheStats | null { return this.cache ? this.cache.getStats() : null; }

  // ============== fire* 内部钩子已迁移到 layout-engine-hooks.ts（§8.3 拆分）==============
  // 这里只保留 hookCtx getter 用于调用方传递上下文（logger/threshold/lastMetrics）。
  private get hookCtx(): HookContext {
    return {
      logger: this.logger,
      slowPhaseThreshold: this.slowPhaseThreshold,
      lastMetrics: this.lastMetrics,
    };
  }

  /**
   * 主入口：计算布局（编排器）
   *
   * 流水线（需求文档 §2.3 数据流）：
   *   0) 缓存命中（命中即返回）+ metrics 初始化 + 边分类填充
   *   1) validate / virtualize / prepare（nodeMap + 父子邻接表 + 根节点 + 节点角色标注）
   *   2) spacing（nodeSep / rankSep / maxGeneration）
   *   3) engine（dagre 同步 / elkjs 异步 worker；compactBox 兜底）
   *   4) spouseMap + 5) spouseAttach + 6) align + 7) subtreeOverlap（位置后处理）
   *   8) center（整体居中）
   *   9) edgePaths + 10) collapse + 11) spouseEdgePaths + 12) separation
   *  13) recenter（主脉再居中）
   *  14) birthOrder（视觉层兜底）
   */
  async calculateLayout(
    nodes: LayoutNode[],
    edges: LayoutEdge[],
  ): Promise<LayoutResult> {
    const config = this.config;

    // ============== 缓存检查（v6.x 性能 B 系列）==============
    // 命中条件：this.cache 启用 + (nodes, edges, config) hash 命中。命中后跳过 14 阶段计算。
    if (this.cache) {
      const cached = this.cache.get(nodes, edges, config);
      if (cached) {
        // 仅累计一次 success call + fireAfterCall，避免污染 metrics
        const durationMs = nowMs();
        accumulateStats(this.cumulativeStats, null, durationMs, false);
        fireAfterCall(this.hookCtx, {
          durationMs,
          success: true,
          hasMetrics: false,
          errorCount: 0,
          wideTree: cached.meta?.wideTree,
        });
        return cached;
      }
    }

    // ============== metrics 初始化（v6.x 健壮性 O 系列）==============
    // 必须在 try 块之外创建，否则 catch 里 recordError 时拿不到 metrics 引用。
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
      endPhase(this.hookCtx, 'validate', endValidate);
    }

    // [A2 2026-08-28] 清理单次布局的瞬态缓存，避免上次结果污染
    this.coupleUnitByMain.clear();
    // computeSubtreeWidth 的记忆化缓存：单次布局运行中有效
    const subtreeWidthCache = new Map<string, number>();

    // ============== [Phase: virtualize] spouse 边虚拟节点化（§8.3 拆分）==============
    const endVirtualize = metrics ? beginPhase(metrics, 'virtualize') : null;
    // ============== [Phase: prepare] 数据结构 + 防御三连（§8.3 拆分）==============
    const endPrepare = metrics ? beginPhase(metrics, 'prepare') : null;
    // [§8.3 拆分] virtualize + prepare 阶段合并到 prepareLayoutData（layout-engine-prepare.ts）
    const prepared = prepareLayoutData(nodes, edges, metrics);
    endPhase(this.hookCtx, 'virtualize', endVirtualize);
    endPhase(this.hookCtx, 'prepare', endPrepare);

    // ============== [Phase: spacing ~ birthOrder] 14 阶段流水线（§8.3 拆分）==============
    //   原内联 ~218 行已抽到 layout-engine-pipeline.ts 的 runLayoutPipeline。
    //   返回 { result, engineUsed, wideTree }，由编排器继续做 meta 填充 + cache 写入。
    //   engineUsed / wideTree 直接写回外层 let（避免 const 遮蔽导致 finally 看不到）。
    const pipelineOut = await runLayoutPipeline(
      prepared, nodes, edges, config, metrics,
      this.hookCtx, this.coupleUnitByMain,
    );
    const result = pipelineOut.result;
    engineUsedForMeta = pipelineOut.engineUsed;
    // wideTreeForMeta 保持 undefined（由 autoFit 阶段回写到 metrics）

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
      fireError(this.hookCtx, errorCode, errorMsg, false);
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
      fireAfterCall(this.hookCtx, {
        durationMs: totalDuration,
        success: !hasError,
        hasMetrics: !!metrics,
        errorCount,
        wideTree: wideTreeForMeta,
      });
    }
  }

  /**
   * 自适应缩放（编排器内联 wrapper：委托给 @/utils/layout-engine-auto-fit）
   *
   * [P0-3 2026-09-03 §8.3 拆分] autoFit 算法搬到独立模块 computeAutoFit，
   * 本方法只做参数传递 + metrics 钩子绑定，保持 LayoutEngine 公共 API 不变。
   */
  autoFit(layout: LayoutResult): ViewportConfig {
    return computeAutoFit(layout, {
      canvasSize: this.canvasSize,
      config: this.config,
      onWideTreeDetected: (wideTree) => {
        if (this.lastMetrics) {
          this.lastMetrics.wideTree = wideTree;
        }
      },
    });
  }
}