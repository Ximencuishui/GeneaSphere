/**
 * layout-logger-sinks.ts - 外部 APM / Sentry / DataDog 集成适配器
 *
 * [v6.x 健壮性 L 系列] 把 LayoutLogger 事件桥接到第三方可观测性平台。
 *
 * 设计目标：
 * 1. **零依赖**：不引入 @sentry/* / @datadog/* 包，避免 frontend bundle 体积膨胀；
 *    通过 duck-typing 接受任意兼容客户端（含用户在 main.ts 自行初始化的实例）。
 * 2. **零失败传播**：所有 sink 调用包 try/catch + setTimeout 兜底，
 *    防止 APM 客户端自身故障导致 layout logger 成为 bug 源。
 * 3. **结构化输出**：与 createConsoleLogger / createCombinedLogger 互通，
 *    可直接组合使用：`createCombinedLogger([console, sentry, datadog])`。
 *
 * 集成示例（main.ts）：
 * ```ts
 * import * as Sentry from '@sentry/vue'
 * import { datadogRum } from '@datadog/browser-rum'
 * import { LayoutEngine } from '@/utils/layout-engine'
 * import {
 *   createSentrySink,
 *   createDatadogSink,
 *   createCombinedLogger,
 * } from '@/utils/layout-logger-sinks'
 *
 * Sentry.init({ dsn: '...', integrations: [...] })
 * datadogRum.init({ applicationId: '...', clientToken: '...', site: '...' })
 *
 * const engine = new LayoutEngine({
 *   canvasSize: ...,
 *   logger: createCombinedLogger([
 *     // 0. 生产环境 console 静默
 *     createConsoleLogger({ silent: !import.meta.env.DEV }),
 *     // 1. Sentry 上报：慢路径 → message（warning），错误 → exception，调用 → breadcrumb
 *     createSentrySink(Sentry, {
 *       slowPhaseAsWarning: true,
 *       errorAsException: true,
 *       afterCallAsBreadcrumb: true,
 *     }),
 *     // 2. DataDog RUM：同事件双写，便于 Sentry / DD 双栈监控
 *     createDatadogSink(datadogRum, {
 *       sampleRate: 0.1, // 只采样 10% 调用结束事件，避免 RUM 配额爆炸
 *     }),
 *   ]),
 * })
 * ```
 *
 * 与 createConsoleLogger 的语义差异：
 * - createConsoleLogger：默认必输出（除非 silent）
 * - createSentrySink：默认"补全式"——所有事件都桥接过去，由 Sentry 自身的 sampleRate 决定是否上报
 * - createDatadogSink：默认"显式采样"——只把符合 sampleRate 的事件转 addError/addAction
 */

import type {
  LayoutLogger,
  SlowPhaseEvent,
  ErrorEvent,
  AfterCallEvent,
} from '@/utils/layout-logger';

// ==================== 类型契约（duck typing） ====================

/**
 * Sentry 客户端最小契约（duck-typed）。
 *
 * 实际上兼容：
 * - @sentry/vue 的 getCurrentHub() / 直接 import * as Sentry
 * - @sentry/browser
 * - @sentry/react
 * - 用户自实现的对象（mock / 调试）
 *
 * 不引入 @sentry/types 是为了零依赖；如需更强类型，可改写为：
 *   import type { Hub } from '@sentry/types'
 *   createSentrySink<SentryClient, Hub>(...)
 */
export interface SentryLikeClient {
  /** 捕获异常 */
  captureException?(err: unknown, ctx?: Record<string, unknown>): void;
  /** 捕获消息（warning / info / log） */
  captureMessage?(
    msg: string,
    level?: 'fatal' | 'error' | 'warning' | 'info' | 'log' | 'debug',
    ctx?: Record<string, unknown>,
  ): void;
  /** 添加面包屑 */
  addBreadcrumb?(crumb: {
    category?: string;
    message?: string;
    level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
    data?: Record<string, unknown>;
    timestamp?: number;
  }): void;
  /** 客户端是否可用（用户集成检查，例如 beforeSend 等） */
  getCurrentHub?(): unknown;
}

/**
 * DataDog RUM 客户端最小契约（duck-typed）。
 *
 * 兼容：
 * - @datadog/browser-rum 的 default export
 * - @datadog/browser-logs
 * - 用户自定义 RUM 客户端
 */
export interface DatadogLikeClient {
  /** 记录错误（与 Sentry captureException 类似，但走 RUM 通道） */
  addError?(err: unknown, ctx?: Record<string, unknown>): void;
  /** 记录用户操作 / 自定义事件 */
  addAction?(name: string, ctx?: Record<string, unknown>): void;
  /** 记录日志（warning / info / error） */
  logger?:
    | {
        warn?(msg: string, ctx?: Record<string, unknown>): void;
        error?(msg: string, ctx?: Record<string, unknown>): void;
        info?(msg: string, ctx?: Record<string, unknown>): void;
      }
    | undefined;
}

// ==================== Sentry Sink ====================

/**
 * Sentry 适配选项
 */
export interface SentrySinkOptions {
  /** 慢路径 → captureMessage('warning')（默认 true） */
  slowPhaseAsWarning?: boolean;
  /** 错误 → captureException（默认 true） */
  errorAsException?: boolean;
  /** 调用结束 → addBreadcrumb('info')（默认 true） */
  afterCallAsBreadcrumb?: boolean;
  /** Sentry 不可用时是否静默（默认 true：避免 layout logger 自己崩） */
  silentIfUnavailable?: boolean;
  /** 自定义 tag 前缀（默认 'layout'） */
  tagPrefix?: string;
  /**
   * 是否把 layoutEngine meta 也作为 Sentry context 附加（默认 true）。
   * - true：addBreadcrumb 时附 phase timings
   * - false：只附 error code/message，更省 bytes
   */
  attachMetaContext?: boolean;
}

/**
 * 创建 Sentry 适配 Sink
 *
 * 事件映射：
 * - onSlowPhase  → Sentry.captureMessage('LayoutEngine slow phase', 'warning', {tags, extra})
 * - onError      → Sentry.captureException(new Error(msg), {tags, extra})
 * - onAfterCall  → Sentry.addBreadcrumb({category: 'layout', message, data})
 *
 * 所有 Sentry 调用包 try/catch + swallow，防止 Sentry SDK 故障污染主流程。
 *
 * @param sentry Sentry 客户端（@sentry/vue 或兼容实例）
 * @param options 配置
 */
export function createSentrySink(
  sentry: SentryLikeClient,
  options: SentrySinkOptions = {},
): LayoutLogger {
  const cfg = {
    slowPhaseAsWarning: true,
    errorAsException: true,
    afterCallAsBreadcrumb: true,
    silentIfUnavailable: true,
    tagPrefix: 'layout',
    attachMetaContext: true,
    ...options,
  };

  /** 安全执行：捕获 Sentry 抛错，避免污染 layout logger 主流程 */
  const safe = <T extends unknown[]>(
    fn: (...args: T) => void,
    ...args: T
  ): void => {
    try {
      fn(...args);
    } catch {
      // silent — APM 客户端自身故障不应影响 layout logger
      if (!cfg.silentIfUnavailable) {
        // eslint-disable-next-line no-console
        console.warn('[layout-logger-sinks] Sentry sink failed (swallowed)');
      }
    }
  };

  const available =
    typeof sentry === 'object' &&
    sentry !== null &&
    (typeof (sentry as SentryLikeClient).captureException === 'function' ||
      typeof (sentry as SentryLikeClient).captureMessage === 'function' ||
      typeof (sentry as SentryLikeClient).addBreadcrumb === 'function');

  return {
    onSlowPhase: (event: SlowPhaseEvent) => {
      if (!available) return;
      if (!cfg.slowPhaseAsWarning) return;
      const ctx = {
        tags: {
          [`${cfg.tagPrefix}.phase`]: event.phase,
          [`${cfg.tagPrefix}.engine`]: event.engineUsed ?? 'unknown',
          [`${cfg.tagPrefix}.threshold_breach`]: 'true',
        },
        extra: {
          durationMs: event.durationMs,
          thresholdMs: event.thresholdMs,
          totalMs: event.totalMs,
          nodeCount: event.input.nodeCount,
          edgeCount: event.input.edgeCount,
          message: event.message,
        },
      };
      safe(sentry.captureMessage!, `LayoutEngine slow phase: ${event.phase}`, 'warning', ctx);
    },
    onError: (event: ErrorEvent) => {
      if (!available) return;
      if (!cfg.errorAsException) return;
      // 构造 Error 对象，让 Sentry 拿到 stack（虽然这里 message 是定值）
      const err = new Error(event.message);
      err.name = String(event.code);
      safe(sentry.captureException!, err, {
        tags: {
          [`${cfg.tagPrefix}.error_code`]: event.code,
        },
        extra: {
          hasResult: event.hasResult,
          timestamp: event.timestamp,
        },
      });
    },
    onAfterCall: (event: AfterCallEvent) => {
      if (!available) return;
      if (!cfg.afterCallAsBreadcrumb) return;
      const data: Record<string, unknown> = {
        durationMs: event.durationMs,
        success: event.success,
        errorCount: event.errorCount,
        wideTree: event.wideTree ?? false,
      };
      if (cfg.attachMetaContext) {
        data.hasMetrics = event.hasMetrics;
      }
      safe(sentry.addBreadcrumb!, {
        category: 'layout',
        message: `LayoutEngine call ${event.success ? 'OK' : 'FAIL'} ${event.durationMs.toFixed(1)}ms`,
        level: event.success ? 'info' : 'error',
        data,
        timestamp: Date.now(),
      });
    },
  };
}

// ==================== DataDog Sink ====================

/**
 * DataDog 适配选项
 */
export interface DatadogSinkOptions {
  /** 慢路径 → logger.warn（默认 true） */
  slowPhaseAsWarn?: boolean;
  /** 错误 → addError（默认 true） */
  errorAsAddError?: boolean;
  /** 调用结束 → addAction('layout_call')（默认 false：高频，会爆 RUM 配额） */
  afterCallAsAction?: boolean;
  /** 调用结束事件的采样率（0..1，默认 0.1）—— 仅当 afterCallAsAction=true 生效 */
  afterCallSampleRate?: number;
  /** Sentry 不可用时是否静默 */
  silentIfUnavailable?: boolean;
  /** 自定义 action 前缀 */
  actionPrefix?: string;
}

/**
 * 创建 DataDog RUM 适配 Sink
 *
 * 事件映射：
 * - onSlowPhase  → datadog.logger?.warn(msg, ctx)
 * - onError      → datadog.addError(new Error(msg), ctx)
 * - onAfterCall  → datadog.addAction('layout_call', ctx) [可选 + 采样]
 *
 * @param datadog DataDog RUM 客户端（@datadog/browser-rum 或兼容实例）
 * @param options 配置
 */
export function createDatadogSink(
  datadog: DatadogLikeClient,
  options: DatadogSinkOptions = {},
): LayoutLogger {
  const cfg = {
    slowPhaseAsWarn: true,
    errorAsAddError: true,
    afterCallAsAction: false,
    afterCallSampleRate: 0.1,
    silentIfUnavailable: true,
    actionPrefix: 'layout',
    ...options,
  };

  const safe = <T extends unknown[]>(
    fn: (...args: T) => void,
    ...args: T
  ): void => {
    try {
      fn(...args);
    } catch {
      if (!cfg.silentIfUnavailable) {
        // eslint-disable-next-line no-console
        console.warn('[layout-logger-sinks] DataDog sink failed (swallowed)');
      }
    }
  };

  const available =
    typeof datadog === 'object' &&
    datadog !== null &&
    (typeof datadog.addError === 'function' ||
      typeof datadog.addAction === 'function' ||
      typeof datadog.logger?.warn === 'function');

  return {
    onSlowPhase: (event: SlowPhaseEvent) => {
      if (!available) return;
      if (!cfg.slowPhaseAsWarn) return;
      const ctx = {
        phase: event.phase,
        engine: event.engineUsed ?? 'unknown',
        durationMs: event.durationMs,
        thresholdMs: event.thresholdMs,
        totalMs: event.totalMs,
        nodeCount: event.input.nodeCount,
        edgeCount: event.input.edgeCount,
      };
      const lg = datadog.logger;
      if (lg?.warn) safe(lg.warn.bind(lg), `[Layout] slow phase: ${event.phase}`, ctx);
    },
    onError: (event: ErrorEvent) => {
      if (!available) return;
      if (!cfg.errorAsAddError) return;
      const err = new Error(event.message);
      err.name = String(event.code);
      safe(datadog.addError!, err, {
        code: event.code,
        hasResult: event.hasResult,
        timestamp: event.timestamp,
      });
    },
    onAfterCall: (event: AfterCallEvent) => {
      if (!available) return;
      if (!cfg.afterCallAsAction) return;
      if (Math.random() > cfg.afterCallSampleRate) return; // 客户端二次采样
      safe(datadog.addAction!, `${cfg.actionPrefix}_call`, {
        durationMs: event.durationMs,
        success: event.success,
        errorCount: event.errorCount,
        wideTree: event.wideTree ?? false,
      });
    },
  };
}

// ==================== 便捷工厂 ====================

/**
 * 创建"开发期占位" Sentry 客户端
 *
 * 当用户未集成 Sentry 时，可临时注入此对象代替真实 SDK。
 * 内部仅 console 输出，便于开发环境调试但不污染生产。
 *
 * @example
 *   const sentry = import.meta.env.PROD
 *     ? realSentryInstance
 *     : createDevSentryStub();
 *   engine.setLogger(createSentrySink(sentry));
 */
export function createDevSentryStub(): SentryLikeClient {
  return {
    captureException: (err, ctx) =>
      // eslint-disable-next-line no-console
      console.error('[Sentry:stub] captureException', err, ctx),
    captureMessage: (msg, level, ctx) =>
      // eslint-disable-next-line no-console
      console.warn(`[Sentry:stub] captureMessage [${level}]`, msg, ctx),
    addBreadcrumb: (crumb) =>
      // eslint-disable-next-line no-console
      console.debug('[Sentry:stub] addBreadcrumb', crumb),
  };
}

/**
 * 创建"开发期占位" DataDog 客户端
 */
export function createDevDatadogStub(): DatadogLikeClient {
  return {
    addError: (err, ctx) =>
      // eslint-disable-next-line no-console
      console.error('[Datadog:stub] addError', err, ctx),
    addAction: (name, ctx) =>
      // eslint-disable-next-line no-console
      console.debug(`[Datadog:stub] addAction ${name}`, ctx),
    logger: {
      warn: (msg, ctx) =>
        // eslint-disable-next-line no-console
        console.warn(`[Datadog:stub] logger.warn`, msg, ctx),
      error: (msg, ctx) =>
        // eslint-disable-next-line no-console
        console.error(`[Datadog:stub] logger.error`, msg, ctx),
    },
  };
}