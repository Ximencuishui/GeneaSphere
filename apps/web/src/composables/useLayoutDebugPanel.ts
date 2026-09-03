/**
 * useLayoutDebugPanel - 布局引擎调试面板 composable（ref 化版）
 *
 * [v6.x 健壮性 L+D 系列] 把 LayoutEngine 的可观测数据包装为 Vue 响应式状态，
 * 供 GenealogyTree.vue 的 dev-only perf-overlay 面板直接渲染。
 *
 * 设计原则：
 * 1. **零开销**：未启用 dev 模式时不订阅（isDev=false 时 composable 仍可调用，但面板不渲染）
 * 2. **手动刷新**：每次 calculateLayout 完成后调用一次 refresh()，避免订阅副作用
 * 3. **结构稳定**：返回 ref 结构保持稳定，模板 v-for / v-if 可放心使用
 * 4. **动态 engine 支持**：接受 MaybeRefOrGetter 形式的 engine 引用，方便顶层组件在 engine 实例异步创建后绑定：
 *
 * 使用示例（顶层订阅 ref）：
 * ```ts
 * const layoutEngineRef = shallowRef<LayoutEngine | null>(null)
 * const panel = useLayoutDebugPanel(layoutEngineRef)
 * // 在 initGraph() 内：
 * layoutEngineRef.value = new LayoutEngine({ ... })
 * ```
 *
 * 使用示例（直接传实例，向后兼容）：
 * ```ts
 * const { timings, cumulative, slowPhases, errors, refresh } = useLayoutDebugPanel(engine)
 * watch(() => engine.lastResult, () => refresh())
 * ```
 *
 * 注意：本 composable 不持有任何持久化状态，纯函数式包装，调用方负责生命周期。
 */

import { ref, shallowRef, computed, onUnmounted, watchEffect, toValue, type MaybeRefOrGetter } from 'vue';
import type { LayoutEngine } from '@/utils/layout-engine';
import type { CumulativeStats } from '@/utils/layout-metrics';
import type { LayoutResultMeta } from '@/types/layout';
import { formatTimingsTable } from '@/utils/layout-logger';
import type { LayoutLogger, SlowPhaseEvent, ErrorEvent } from '@/utils/layout-logger';

/**
 * 面板所需的可观测数据（read-only 结构）
 */
export interface LayoutDebugState {
  /** 累计统计（含调用次数、引擎分布、错误分布） */
  cumulative: CumulativeStats;
  /** 最近一次调用的 meta 信息 */
  lastMeta: LayoutResultMeta | null;
  /** 最近一次调用是否成功 */
  lastSuccess: boolean;
  /** 最近一次调用总耗时（毫秒） */
  lastTotalMs: number;
  /** 最近一次调用的阶段耗时表（适合 v-for 渲染） */
  timings: Array<{ phase: string; durationMs: number; percentOfTotal: number }>;
  /** 累计的慢阶段事件（每次 onSlowPhase 触发时入栈） */
  slowPhases: Array<{
    phase: string;
    durationMs: number;
    thresholdMs: number;
    timestamp: number;
    engineUsed?: string;
    message: string;
  }>;
  /** 累计的错误事件 */
  errors: Array<{
    code: string;
    message: string;
    timestamp: number;
  }>;
  /** 累计成功率（0-1） */
  errorRate: number;
}

/**
 * 慢阶段事件缓存上限
 */
const MAX_SLOW_PHASE_HISTORY = 50;
/**
 * 错误事件缓存上限
 */
const MAX_ERROR_HISTORY = 50;

const EMPTY_CUMULATIVE: CumulativeStats = {
  totalCalls: 0,
  successCalls: 0,
  errorCalls: 0,
  totalDurationMs: 0,
  errorsByCode: {},
  nodesProcessed: 0,
  edgesProcessed: 0,
  enginesUsed: {},
};

/**
 * 创建布局调试面板状态。
 *
 * 自动绑定传入的 engine 实例（兼容 ref / getter / 直接实例），
 * 调用 refresh() 把 LayoutEngine 的状态快照到 Vue 响应式 ref 中。
 */
export function useLayoutDebugPanel(
  engineSource: MaybeRefOrGetter<LayoutEngine | null>,
) {
  /** 累计统计（深拷贝避免外部修改） */
  const cumulative = ref<CumulativeStats>({ ...EMPTY_CUMULATIVE });
  /** 最近一次调用的 meta */
  const lastMeta = ref<LayoutResultMeta | null>(null);
  /** 最近一次调用是否成功 */
  const lastSuccess = ref<boolean>(true);
  /** 最近一次调用总耗时 */
  const lastTotalMs = ref<number>(0);
  /** 慢阶段事件历史 */
  const slowPhases = shallowRef<LayoutDebugState['slowPhases']>([]);
  /** 错误事件历史 */
  const errors = shallowRef<LayoutDebugState['errors']>([]);

  /** 当前激活的 engine 实例（动态绑定） */
  let currentEngine: LayoutEngine | null = null;
  /** 当前 attach 的清理函数（detach() 时调用） */
  let detach: (() => void) | null = null;

  /**
   * 绑定到指定 engine 实例，叠加内部 subscription logger。
   *
   * 不替换 engine 主 logger；改为叠加一个内部订阅 logger：
   *   - 保存 previousLogger（可能是 null）
   *   - 叠加 composableLogger，把事件转给 recordXxx
   *   - detach 时还原 previousLogger
   */
  function bindEngine(next: LayoutEngine | null): void {
    // 1. 先解除旧绑定
    try { detach?.(); } catch { /* silent */ }
    detach = null;
    currentEngine = next;
    if (!next) return;

    const previousLogger: LayoutLogger | null =
      (next as unknown as { logger?: LayoutLogger | null }).logger ?? null;
    const composableLogger: LayoutLogger = {
      onSlowPhase: (e: SlowPhaseEvent) => {
        try {
          recordSlowPhase(e);
          previousLogger?.onSlowPhase?.(e);
        } catch { /* silent */ }
      },
      onError: (e: ErrorEvent) => {
        try {
          recordError(e);
          previousLogger?.onError?.(e);
        } catch { /* silent */ }
      },
      onAfterCall: previousLogger?.onAfterCall
        ? (e) => { try { previousLogger.onAfterCall?.(e); } catch { /* silent */ } }
        : undefined,
    };
    next.setLogger(composableLogger);
    detach = () => {
      try { next.setLogger(previousLogger); } catch { /* silent */ }
    };
  }

  /**
   * watchEffect 同步追踪 engineSource 变化：
   * - 直接传实例：toValue() 立即拿到实例，setup 阶段同步绑定
   * - 传 ref：toValue() 读 ref.value，setup 阶段绑定初值；后续 ref 变化自动重新绑定
   * - 传 getter：toValue() 调用 getter；getter 内部 ref 变化自动重新绑定
   */
  watchEffect(() => {
    const next = toValue(engineSource);
    bindEngine(next);
  });

  /** 计算属性：最近一次调用的 timings 表 */
  const timings = computed(() => {
    if (!lastMeta.value) return [];
    try {
      return formatTimingsTable(lastMeta.value);
    } catch {
      return [];
    }
  });
  /** 计算属性：错误率 */
  const errorRate = computed(() => {
    const c = cumulative.value;
    if (c.totalCalls <= 0) return 0;
    return c.errorCalls / c.totalCalls;
  });

  /**
   * 从 engine 拉取最新数据，刷新所有 ref。
   * 调用方在 calculateLayout 完成后主动调用。
   */
  function refresh(): void {
    if (!currentEngine) return;
    cumulative.value = { ...currentEngine.getCumulativeStats() };
    const lm = currentEngine.getLastMetrics();
    lastMeta.value = lm ? snapshotToMeta(lm) : null;
    lastSuccess.value = (cumulative.value.errorCalls === 0)
      || (cumulative.value.successCalls >= cumulative.value.errorCalls);
    lastTotalMs.value = lm
      ? Object.values(lm.phaseTimings).reduce((a, b) => a + b, 0)
      : 0;
  }

  /**
   * 把慢阶段事件 push 进历史（外部直接调用场景：测试/手动注入）
   */
  function recordSlowPhase(event: {
    phase: string;
    durationMs: number;
    thresholdMs: number;
    engineUsed?: string;
    message: string;
  }) {
    const arr = [...slowPhases.value];
    arr.push({ ...event, timestamp: Date.now() });
    if (arr.length > MAX_SLOW_PHASE_HISTORY) {
      arr.splice(0, arr.length - MAX_SLOW_PHASE_HISTORY);
    }
    slowPhases.value = arr;
  }

  function recordError(event: {
    code: string;
    message: string;
    timestamp?: number;
  }) {
    const arr = [...errors.value];
    arr.push({ code: event.code, message: event.message, timestamp: event.timestamp ?? Date.now() });
    if (arr.length > MAX_ERROR_HISTORY) {
      arr.splice(0, arr.length - MAX_ERROR_HISTORY);
    }
    errors.value = arr;
  }

  /** onUnmounted 时自动释放订阅 */
  onUnmounted(() => {
    try { detach?.(); } catch { /* silent */ }
    detach = null;
    currentEngine = null;
  });

  return {
    // 状态（read-only 通过 readonly 不强制，模板约定只读）
    cumulative,
    lastMeta,
    lastSuccess,
    lastTotalMs,
    timings,
    slowPhases,
    errors,
    errorRate,
    // 当前激活的 engine（getter —— 模板中可直接调用）
    currentEngine: () => currentEngine,
    // 方法
    refresh,
    recordSlowPhase,
    recordError,
  };
}

/**
 * 把 LayoutMetrics 转换为 LayoutResultMeta（仅快照必要字段）
 */
function snapshotToMeta(metrics: ReturnType<LayoutEngine['getLastMetrics']>): LayoutResultMeta | null {
  if (!metrics) return null;
  return {
    timings: { ...metrics.phaseTimings },
    phaseOrder: [...metrics.phaseOrder],
    totalMs: Object.values(metrics.phaseTimings).reduce((a, b) => a + b, 0),
    errors: metrics.errors.map(e => ({
      code: String(e.code),
      message: e.message,
      timestamp: e.timestamp,
    })),
    engineUsed: metrics.engineUsed,
    wideTree: metrics.wideTree,
    input: { ...metrics.input },
  };
}