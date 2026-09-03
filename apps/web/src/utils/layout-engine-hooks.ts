/**
 * layout-engine-hooks.ts — LayoutEngine 钩子函数（独立模块）
 *
 * [§8.3 2026-09-03 拆分产物] 把 LayoutEngine 内部的 fire* / endPhase 钩子搬到独立文件。
 *
 * 抽出动机：
 * - layout-engine.ts 单文件 751 行（目标 ≤400）；fire* + endPhase 是「事件触发」纯函数，
 *   与编排器主流程耦合度低，单独成文件更易维护。
 * - 这些钩子只在 LayoutEngine.calculateLayout 内部使用，外部无需访问。
 * - 钩子之间有共享上下文（logger / threshold / lastMetrics），打包成 HookContext 接口。
 *
 * 设计要点：
 * - 所有 fire* 都用 try/catch 包裹，防止 logger / 回调成为 bug 源
 * - logger 缺失或对应 onXxx 未定义时静默 skip
 * - fireAfterCall 接收完整事件对象，由调用方在 catch / finally 块构造
 */
import type { LayoutLogger, SlowPhaseEvent, ErrorEvent, AfterCallEvent } from '@/utils/layout-logger';
import type { LayoutMetrics } from '@/utils/layout-metrics';

export interface HookContext {
  logger: LayoutLogger | null;
  slowPhaseThreshold: number;
  lastMetrics: LayoutMetrics | null;
}

/** 慢路径事件：phase 耗时超过阈值时触发 logger.onSlowPhase */
export function fireSlowPhase(
  ctx: HookContext,
  phase: string,
  durationMs: number,
): void {
  if (!ctx.logger?.onSlowPhase) return;
  if (durationMs < ctx.slowPhaseThreshold) return;
  const evt: SlowPhaseEvent = {
    phase,
    durationMs,
    thresholdMs: ctx.slowPhaseThreshold,
    totalMs: 0,
    engineUsed: ctx.lastMetrics?.engineUsed,
    input: {
      nodeCount: ctx.lastMetrics?.input.nodeCount ?? 0,
      edgeCount: ctx.lastMetrics?.input.edgeCount ?? 0,
    },
    message: `phase "${phase}" took ${durationMs.toFixed(1)}ms (> ${ctx.slowPhaseThreshold}ms)`,
  };
  try { ctx.logger.onSlowPhase(evt); } catch { /* silent */ }
}

/** 错误事件：throw 时触发 logger.onError */
export function fireError(
  ctx: HookContext,
  code: string,
  message: string,
  hasResult: boolean,
): void {
  if (!ctx.logger?.onError) return;
  const evt: ErrorEvent = { code, message, timestamp: Date.now(), hasResult };
  try { ctx.logger.onError(evt); } catch { /* silent */ }
}

/** 后置调用事件：成功 + 失败都会触发 logger.onAfterCall */
export function fireAfterCall(
  ctx: HookContext,
  event: AfterCallEvent,
): void {
  if (!ctx.logger?.onAfterCall) return;
  try { ctx.logger.onAfterCall(event); } catch { /* silent */ }
}

/** 阶段结束包装器：调用 endFn 记录耗时，并触发慢路径钩子 */
export function endPhase(
  ctx: HookContext,
  phaseName: string,
  endFn: (() => number) | null | undefined,
): void {
  if (!endFn) return;
  const durationMs = endFn();
  fireSlowPhase(ctx, phaseName, durationMs);
}