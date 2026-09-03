/**
 * layout-logger.ts - 布局引擎日志 + 告警工具
 *
 * [v6.x 健壮性 L 系列] 把 metrics 数据转化为可操作输出
 *
 * 三大能力：
 * 1. 钩子订阅（hook subscription）：错误 / 慢路径 / 调用结束 三个事件，全部走回调
 *    - 易于接入 Sentry / Datadog / LogRocket 等外部 APM
 *    - 易于写自定义 sink（开发期面板、生产期上报）
 * 2. 格式化输出（format output）：phase timings 转人类可读表格
 *    - console.table 友好
 *    - 适合直接复制贴到工单 / Issue
 * 3. 慢路径采样（slow-path detection）：
 *    - 慢阶段默认阈值 200ms（可调）
 *    - 超阈值时调用 onSlowPhase 钩子，便于实控
 *
 * 与 layout-metrics.ts 的关系：
 *   - layout-metrics：纯数据（收集 / 计时 / 累计）
 *   - layout-logger：纯行为（消费 metrics 数据、产生输出）
 *   两者完全解耦：metrics 系统关闭时 logger 仍可独立工作
 */

import type { LayoutErrorCode } from '@/utils/layout-errors';
import type { LayoutResult } from '@/types/layout';

// ==================== 类型定义 ====================

/**
 * 慢路径事件载荷
 */
export interface SlowPhaseEvent {
  /** 阶段名 */
  phase: string;
  /** 本次耗时毫秒 */
  durationMs: number;
  /** 阈值毫秒 */
  thresholdMs: number;
  /** 调用总耗时 */
  totalMs: number;
  /** 实际引擎 */
  engineUsed?: string;
  /** 输入规模 */
  input: {
    nodeCount: number;
    edgeCount: number;
  };
  /** 警告信息（人类可读） */
  message: string;
}

/**
 * 错误事件载荷
 */
export interface ErrorEvent {
  code: LayoutErrorCode | string;
  message: string;
  timestamp: number;
  hasResult: boolean;
}

/**
 * 调用结束事件载荷
 */
export interface AfterCallEvent {
  durationMs: number;
  success: boolean;
  hasMetrics: boolean;
  errorCount: number;
  wideTree?: boolean;
}

/**
 * 布局引擎日志器接口
 *
 * 实现可替换：开发面板、Sentry、自研 sink 都能接入。
 * 必须保证：所有方法同步调用且不抛错（防止 logger 自身成为 bug 源）。
 */
export interface LayoutLogger {
  /** 单阶段耗时超阈值时触发（每次超阈都触发，未做采样） */
  onSlowPhase?: (event: SlowPhaseEvent) => void;
  /** 防御三连触发错误时调用（即使后续阶段不抛错） */
  onError?: (event: ErrorEvent) => void;
  /** 每次 calculateLayout 结束（含异常路径）调用 */
  onAfterCall?: (event: AfterCallEvent) => void;
  /** 可选：把 metrics snapshot 写盘 / 上报完整对象 */
  flush?: (snapshot: ReturnType<typeof import('./layout-metrics').snapshotMetrics>) => void;
}

/**
 * Logger 配置选项
 */
export interface LoggerOptions {
  /** 单阶段耗时阈值（毫秒），默认 200ms */
  slowPhaseThreshold?: number;
  /** 总调用耗时阈值（毫秒），默认 1000ms */
  slowCallThreshold?: number;
  /** 是否自动 group console 输出（默认 true） */
  groupConsole?: boolean;
  /** 静默模式：logger 完全不写 console（仅走 onXxx 钩子） */
  silent?: boolean;
}

// ==================== 默认 Logger 实现 ====================

/**
 * 创建基于 console 的默认 Logger
 *
 * 输出格式：
 * - 超阈值：console.warn("[LayoutEngine SLOW] ...")
 * - 错误：console.error("[LayoutEngine ERROR] ...")
 * - 调用结束：console.debug（group）
 *
 * 不抛错：所有 console 调用都包 try/catch 兜底。
 */
export function createConsoleLogger(
  options: LoggerOptions = {},
): LayoutLogger {
  const slowPhaseThreshold = options.slowPhaseThreshold ?? 200;
  const slowCallThreshold = options.slowCallThreshold ?? 1000;
  const groupConsole = options.groupConsole ?? true;
  const silent = options.silent ?? false;

  const safeCall = <T extends unknown[]>(
    fn: (...args: T) => void,
    ...args: T
  ) => {
    if (silent) return;
    try {
      fn(...args);
    } catch {
      // 兜底：logger 不能成为 bug 源
    }
  };

  return {
    onSlowPhase: (event) => {
      safeCall(console.warn,
        `[LayoutEngine SLOW] phase="${event.phase}" ${event.durationMs.toFixed(1)}ms ` +
        `(threshold=${event.thresholdMs}ms) — ${event.message}`,
      );
    },
    onError: (event) => {
      safeCall(console.error,
        `[LayoutEngine ERROR] code=${event.code} message="${event.message}" ` +
        `(hasResult=${event.hasResult})`,
      );
    },
    onAfterCall: (event) => {
      if (silent) return;
      try {
        if (groupConsole && typeof console.groupCollapsed === 'function') {
          console.groupCollapsed(
            `[LayoutEngine] call ${event.success ? 'OK' : 'FAIL'} ` +
            `${event.durationMs.toFixed(1)}ms (errors=${event.errorCount})`,
          );
          if (event.durationMs >= slowCallThreshold) {
            console.warn(`slow call > ${slowCallThreshold}ms`);
          }
          if (event.wideTree) console.warn('wideTree=true');
          console.groupEnd();
        } else {
          safeCall(console.debug,
            `[LayoutEngine] call ${event.success ? 'OK' : 'FAIL'} ${event.durationMs.toFixed(1)}ms`,
          );
        }
      } catch {
        // 兜底
      }
    },
    // 默认 Logger 不写盘；如需写盘请自定义 flush
    flush: undefined,
  };
}

/**
 * 创建组合 Logger（多个 Logger 同时触发）
 *
 * 典型用法：
 *   const combined = createCombinedLogger([
 *     createConsoleLogger(),
 *     createSentryLogger(sentryClient),  // 用户自定义
 *   ])
 */
export function createCombinedLogger(loggers: LayoutLogger[]): LayoutLogger {
  const wrap = <K extends keyof LayoutLogger>(key: K) =>
    (...args: Parameters<NonNullable<LayoutLogger[K]>>) => {
      for (const lg of loggers) {
        const fn = lg[key] as ((...a: Parameters<NonNullable<LayoutLogger[K]>>) => void) | undefined;
        if (fn) {
          try { fn(...args); } catch { /* silent */ }
        }
      }
    };
  return {
    onSlowPhase: loggers.some(l => l.onSlowPhase) ? wrap('onSlowPhase') : undefined,
    onError: loggers.some(l => l.onError) ? wrap('onError') : undefined,
    onAfterCall: loggers.some(l => l.onAfterCall) ? wrap('onAfterCall') : undefined,
    flush: loggers.some(l => l.flush) ? wrap('flush') : undefined,
  };
}

// ==================== 格式化工具 ====================

/**
 * 把 LayoutResult.meta 转成多行可读字符串（适合 console.log / 复制粘贴）
 *
 * 输出示例：
 *   [LayoutEngine] call OK total=420.5ms errors=0 wideTree=false engine=dagre
 *   [LayoutEngine] input: nodes=100 edges=80 (pc=70, sp=10)
 *   [LayoutEngine] timings:
 *     validate       0.3ms (0.07%)
 *     engine       320.0ms (76.07%)
 *     edgePaths      5.0ms (1.19%)
 *     ...
 */
export function formatMetricsAsText(meta: NonNullable<LayoutResult['meta']>): string {
  const lines: string[] = [];
  lines.push(`[LayoutEngine] call total=${meta.totalMs.toFixed(1)}ms errors=${meta.errors.length}` +
    ` wideTree=${meta.wideTree ?? false} engine=${meta.engineUsed ?? 'unknown'}`);
  lines.push(`[LayoutEngine] input: nodes=${meta.input.nodeCount} edges=${meta.input.edgeCount}` +
    ` (pc=${meta.input.parentChildEdgeCount}, sp=${meta.input.spouseEdgeCount})`);

  // 计算耗时百分比
  const total = meta.totalMs || 1;
  const phaseLines: string[] = [];
  for (const ph of meta.phaseOrder) {
    const t = meta.timings[ph] ?? 0;
    const pct = (t / total) * 100;
    phaseLines.push(`  ${ph.padEnd(16)} ${t.toFixed(1).padStart(8)}ms (${pct.toFixed(2).padStart(5)}%)`);
  }
  if (phaseLines.length > 0) {
    lines.push('[LayoutEngine] timings:');
    lines.push(...phaseLines);
  }
  if (meta.errors.length > 0) {
    lines.push('[LayoutEngine] errors:');
    for (const err of meta.errors) {
      lines.push(`  [${err.code}] ${err.message}`);
    }
  }
  return lines.join('\n');
}

/**
 * 把 LayoutResult.meta 转成 console.table 友好的对象数组
 *
 * 用法：
 *   console.table(formatTimingsTable(result.meta!))
 *
 * 输出列：phase / durationMs / percentOfTotal
 */
export function formatTimingsTable(
  meta: NonNullable<LayoutResult['meta']>,
): Array<{ phase: string; durationMs: number; percentOfTotal: number }> {
  const total = meta.totalMs || 1;
  return meta.phaseOrder.map(ph => ({
    phase: ph,
    durationMs: Math.round(meta.timings[ph] ?? 0),
    percentOfTotal: Math.round(((meta.timings[ph] ?? 0) / total) * 1000) / 10,
  }));
}

/**
 * 把累计统计转成单行摘要（适合状态栏 / 调试面包屑）
 *
 * 示例：
 *   "LayoutEngine: 12 calls, 11 OK, 1 FAIL, 1234.5ms total, 0.1% error"
 */
export function formatCumulativeStatsAsLine(stats: {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  totalDurationMs: number;
  errorsByCode: Record<string, number>;
}): string {
  const errRate = stats.totalCalls > 0 ? ((stats.errorCalls / stats.totalCalls) * 100).toFixed(1) : '0';
  return `LayoutEngine: ${stats.totalCalls} calls, ${stats.successCalls} OK, ${stats.errorCalls} FAIL, ` +
    `${stats.totalDurationMs.toFixed(1)}ms total, ${errRate}% error`;
}
