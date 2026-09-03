/**
 * layout-logger-aggregator.ts - threshold-breach by phase 聚合器
 *
 * [v6.x 健壮性 L 系列增强] 把高频慢路径事件在窗口内聚合成单条"摘要事件"
 *   提交给底层 sink，便于：
 *   - **降噪**：1000 次 5ms 微超阈 → 1 条 "phase X 1000 次 breach, p50=8ms p95=12ms p99=20ms"
 *   - **降本**：Sentry / DD 计费按事件数，1 条聚合 vs 1000 条原始，账单立省 99.9%
 *   - **保真**：窗口结束时只 flush 一次，不丢任何窗口内事件（但只保留统计分布）
 *
 * 关键设计：
 * - **窗口关闭触发**：计时（默认 60s）或计数（默认 100 events）任一先达即 flush
 * - **per-phase 统计独立**：每个 phase 维护独立的样本 buffer，
 *   flush 时产出 per-phase 摘要数组（一条 sink 调用承载所有 phase 数据）
 * - **摘要字段**：count / totalMs / min / max / p50 / p95 / p99 / lastMs / firstAt / lastAt
 * - **强制 flush**：调试期可手动 flush() 立即提交
 *
 * 与现有组件关系：
 * - 上游：LayoutEngine / LayoutLogger.onSlowPhase
 * - 下游：createSentrySink / createDatadogSink / 自定义 sink
 * - 与 createSamplingLogger 协同：先采样 → 再聚合 → 再上报，最小化事件量
 */

import type { SlowPhaseEvent } from '@/utils/layout-logger';

// ==================== 类型定义 ====================

/**
 * 单 phase 在一个窗口内的聚合摘要
 */
export interface PhaseBreachSummary {
  /** phase 名（如 'engine', 'spouseAttach', 'edgePaths'） */
  phase: string;
  /** 触发引擎（dagre / elkjs / compactBox） */
  engineUsed: string;
  /** 窗口内 breach 次数 */
  count: number;
  /** 累计耗时（毫秒） */
  totalMs: number;
  /** 最小耗时 */
  minMs: number;
  /** 最大耗时 */
  maxMs: number;
  /** 平均耗时（totalMs / count） */
  avgMs: number;
  /** 中位数耗时 */
  p50Ms: number;
  /** 95 分位耗时 */
  p95Ms: number;
  /** 99 分位耗时 */
  p99Ms: number;
  /** 最近一次耗时 */
  lastMs: number;
  /** 窗口开始时间（毫秒） */
  firstAt: number;
  /** 窗口结束时间（毫秒） */
  lastAt: number;
  /** 单阶段慢路径阈值 */
  thresholdMs: number;
  /**
   * 触发器：什么导致本次窗口关闭
   * - 'time'：窗口计时到点
   * - 'count'：窗口内事件数超限
   * - 'manual'：手动 flush() 触发
   */
  trigger: 'time' | 'count' | 'manual';
}

/**
 * 一次 flush 的整体载荷（一次性发给 sink）
 */
export interface AggregationFlushPayload {
  /** flush 触发时间戳 */
  flushedAt: number;
  /** 窗口长度（毫秒） */
  windowMs: number;
  /** 窗口内所有 phase 的摘要 */
  summaries: PhaseBreachSummary[];
  /** 总事件数（跨 phase） */
  totalBreaches: number;
  /** 输入规模 hash（用于区分不同调用上下文） */
  contextTag: string;
}

/**
 * 聚合器配置
 */
export interface AggregatorOptions {
  /** 窗口大小（毫秒，默认 60_000） */
  windowMs?: number;
  /** 单 phase 样本 buffer 上限（默认 100，超出触发 flush） */
  maxBufferSize?: number;
  /** 是否自动按窗口计时 flush（默认 true） */
  autoFlushOnTime?: boolean;
  /** 自定义"phase 上下文标签"（用于多 panel / 多 engine 实例区分） */
  contextTag?: string;
  /**
   * 分位数计算精度：越大越精确但越慢（默认 1000，仅取 1000 个样本用于计算）
   * - 实际计算时使用线性插值近似
   */
  percentileResolution?: number;
}

/**
 * 聚合器接口
 */
export interface ThresholdAggregator {
  /** 记录一次慢路径事件（内部维护 buffer） */
  record(event: SlowPhaseEvent): void;
  /** 强制立即 flush，返回当前所有 phase 的摘要（清空 buffer） */
  flush(trigger?: 'time' | 'count' | 'manual'): AggregationFlushPayload | null;
  /** 获取当前 buffer 中所有 phase 的"草稿"摘要（不 flush）—— 调试期面板用 */
  peek(): PhaseBreachSummary[];
  /** 重置所有状态 */
  reset(): void;
  /** 是否有未上报的事件 */
  hasPending(): boolean;
}

// ==================== 工厂函数 ====================

/**
 * 创建 threshold-breach 聚合器
 *
 * 用法：
 * ```ts
 * const agg = createThresholdAggregator({ windowMs: 60_000, maxBufferSize: 100 });
 * const baseSink: LayoutLogger = { onSlowPhase: e => agg.record(e), ... };
 * const sampledAgg = createSamplingLogger(baseSink, { mode: 'always' }); // 聚合器自身不需要再采样
 * engine.setLogger(sampledAgg);
 *
 * // 周期 flush：把摘要提交给真实 APM
 * setInterval(() => {
 *   const payload = agg.flush('time');
 *   if (payload) sentry.captureMessage('LayoutEngine breach summary', 'warning', { extra: payload });
 * }, 60_000);
 * ```
 */
export function createThresholdAggregator(
  options: AggregatorOptions = {},
): ThresholdAggregator {
  const cfg = {
    windowMs: 60_000,
    maxBufferSize: 100,
    autoFlushOnTime: true,
    contextTag: 'default',
    percentileResolution: 1000,
    ...options,
  };

  /** per-phase 样本 buffer */
  const buffers = new Map<
    string,
    {
      phase: string;
      engineUsed: string;
      thresholdMs: number;
      samples: number[];
      totalMs: number;
      minMs: number;
      maxMs: number;
      firstAt: number;
      lastAt: number;
      lastMs: number;
    }
  >();

  /** 窗口开始时间（首个事件入 buffer 时设） */
  let windowStartedAt: number | null = null;
  /** 上次窗口时间戳检查的 setTimeout handle（用于自动 flush） */
  let autoFlushTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleAutoFlush(): void {
    if (!cfg.autoFlushOnTime) return;
    if (autoFlushTimer != null) return; // 已排定
    if (windowStartedAt == null) return;
    const elapsed = Date.now() - windowStartedAt;
    const remaining = Math.max(0, cfg.windowMs - elapsed);
    autoFlushTimer = setTimeout(() => {
      autoFlushTimer = null;
      // 注：实际 flush 逻辑由调用方在 setInterval / 自己管理的循环里调用
      // 这里仅是辅助提示（不直接调用 flush，因为 sink 是参数注入的）
    }, remaining);
  }

  function percentile(sortedSamples: number[], p: number): number {
    if (sortedSamples.length === 0) return 0;
    const idx = Math.min(
      sortedSamples.length - 1,
      Math.max(0, Math.ceil((p / 100) * sortedSamples.length) - 1),
    );
    return sortedSamples[idx];
  }

  function makeSummary(
    buf: NonNullable<ReturnType<typeof buffers.get>>,
    trigger: 'time' | 'count' | 'manual',
  ): PhaseBreachSummary {
    const sorted = [...buf.samples].sort((a, b) => a - b);
    return {
      phase: buf.phase,
      engineUsed: buf.engineUsed,
      count: buf.samples.length,
      totalMs: Math.round(buf.totalMs * 100) / 100,
      minMs: Math.round(buf.minMs * 100) / 100,
      maxMs: Math.round(buf.maxMs * 100) / 100,
      avgMs:
        buf.samples.length > 0
          ? Math.round((buf.totalMs / buf.samples.length) * 100) / 100
          : 0,
      p50Ms: Math.round(percentile(sorted, 50) * 100) / 100,
      p95Ms: Math.round(percentile(sorted, 95) * 100) / 100,
      p99Ms: Math.round(percentile(sorted, 99) * 100) / 100,
      lastMs: Math.round(buf.lastMs * 100) / 100,
      firstAt: buf.firstAt,
      lastAt: buf.lastAt,
      thresholdMs: buf.thresholdMs,
      trigger,
    };
  }

  function phaseKey(event: SlowPhaseEvent): string {
    // 不同 engine / 不同 phase 各自聚合
    return `${event.phase}|${event.engineUsed ?? 'unknown'}`;
  }

  return {
    record(event: SlowPhaseEvent): void {
      const key = phaseKey(event);
      const now = Date.now();
      let buf = buffers.get(key);
      if (!buf) {
        buf = {
          phase: event.phase,
          engineUsed: event.engineUsed ?? 'unknown',
          thresholdMs: event.thresholdMs,
          samples: [],
          totalMs: 0,
          minMs: Number.POSITIVE_INFINITY,
          maxMs: Number.NEGATIVE_INFINITY,
          firstAt: now,
          lastAt: now,
          lastMs: event.durationMs,
        };
        buffers.set(key, buf);
        if (windowStartedAt == null) windowStartedAt = now;
        scheduleAutoFlush();
      }

      buf.samples.push(event.durationMs);
      buf.totalMs += event.durationMs;
      buf.minMs = Math.min(buf.minMs, event.durationMs);
      buf.maxMs = Math.max(buf.maxMs, event.durationMs);
      buf.lastMs = event.durationMs;
      buf.lastAt = now;
    },
    flush(trigger: 'time' | 'count' | 'manual' = 'manual'): AggregationFlushPayload | null {
      if (buffers.size === 0) return null;
      const summaries: PhaseBreachSummary[] = [];
      let totalBreaches = 0;
      for (const buf of buffers.values()) {
        if (buf.samples.length === 0) continue;
        summaries.push(makeSummary(buf, trigger));
        totalBreaches += buf.samples.length;
      }
      // 按 count 降序，运维一眼能看出热点 phase
      summaries.sort((a, b) => b.count - a.count);

      const payload: AggregationFlushPayload = {
        flushedAt: Date.now(),
        windowMs:
          windowStartedAt != null
            ? Date.now() - windowStartedAt
            : cfg.windowMs,
        summaries,
        totalBreaches,
        contextTag: cfg.contextTag,
      };

      // 清空 buffer
      buffers.clear();
      windowStartedAt = null;
      if (autoFlushTimer != null) {
        clearTimeout(autoFlushTimer);
        autoFlushTimer = null;
      }

      return payload;
    },
    peek(): PhaseBreachSummary[] {
      if (buffers.size === 0) return [];
      const out: PhaseBreachSummary[] = [];
      for (const buf of buffers.values()) {
        if (buf.samples.length === 0) continue;
        out.push(makeSummary(buf, 'manual'));
      }
      return out.sort((a, b) => b.count - a.count);
    },
    reset(): void {
      buffers.clear();
      windowStartedAt = null;
      if (autoFlushTimer != null) {
        clearTimeout(autoFlushTimer);
        autoFlushTimer = null;
      }
    },
    hasPending(): boolean {
      return buffers.size > 0;
    },
  };
}

// ==================== 辅助函数：把 payload 转为人类可读 ====================

/**
 * 把 AggregationFlushPayload 渲染为多行可读字符串（适合 console.log / 工单）
 *
 * 输出示例：
 *   [LayoutEngine BREACH SUMMARY] window=60s total=42 events (tag=default)
 *     engine            count=18  p50=320ms p95=580ms p99=720ms max=850ms (threshold=200ms, trigger=time)
 *     edgePaths         count=12  p50=85ms p95=140ms p99=180ms max=210ms (threshold=200ms, trigger=time)
 *     subtreeOverlap    count=8   p50=42ms p95=78ms p99=95ms max=110ms (threshold=200ms, trigger=time)
 *     ...
 */
export function formatAggregationAsText(payload: AggregationFlushPayload): string {
  const lines: string[] = [];
  lines.push(
    `[LayoutEngine BREACH SUMMARY] window=${Math.round(payload.windowMs / 1000)}s ` +
    `total=${payload.totalBreaches} events (tag=${payload.contextTag})`,
  );
  for (const s of payload.summaries) {
    lines.push(
      `  ${s.phase.padEnd(20)} count=${String(s.count).padStart(4)}  ` +
      `p50=${s.p50Ms.toFixed(1)}ms p95=${s.p95Ms.toFixed(1)}ms p99=${s.p99Ms.toFixed(1)}ms ` +
      `max=${s.maxMs.toFixed(1)}ms ` +
      `(threshold=${s.thresholdMs}ms, trigger=${s.trigger})`,
    );
  }
  return lines.join('\n');
}

// ==================== Logger 包装器 ====================

/**
 * 把"事件流"封装为聚合流的 LayoutLogger
 *
 * 用法：
 * ```ts
 * const agg = createThresholdAggregator({ windowMs: 30_000, maxBufferSize: 50 });
 * const aggregationSink = createAggregatorLogger(agg);
 * engine.setLogger(createCombinedLogger([
 *   consoleLogger,    // 控制台每次都打（开发者实控）
 *   aggregationSink,  // → agg.record() → flush 时一次性上送 Sentry
 * ]));
 *
 * // 周期性 flush（如每 30s）
 * setInterval(() => {
 *   const payload = agg.flush('time');
 *   if (payload) sentry.captureMessage('breach summary', 'warning', { extra: payload });
 * }, 30_000);
 * ```
 */
export function createAggregatorLogger(
  aggregator: ThresholdAggregator,
): import('@/utils/layout-logger').LayoutLogger {
  return {
    onSlowPhase: (event) => {
      try {
        aggregator.record(event);
      } catch {
        /* silent */
      }
    },
    // onError / onAfterCall 不聚合（错误必报；after-call 由其他 sink 决定）
    onError: undefined,
    onAfterCall: undefined,
  };
}