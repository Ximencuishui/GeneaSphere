/**
 * layout-metrics.ts - 布局引擎可观测性工具
 *
 * [v6.x 健壮性 O 系列] 统一布局引擎运行指标
 *
 * 三类指标：
 * 1. 阶段计时 (phaseTimings)：每个流水阶段耗时，便于性能分析
 * 2. 错误记录 (errors)：防御三连触发的错误 + 结构化错误码
 * 3. 累计统计 (totals)：跨调用的成功率 / 节点数 / 引擎分布
 *
 * 使用模式：
 * ```ts
 * const metrics = createMetrics()
 * const endPhase = beginPhase(metrics, 'spouseAttach')
 * // ... 阶段代码
 * endPhase()  // 自动填入 phaseTimings['spouseAttach']
 *
 * // 最终组装
 * result.meta = finalizeMetrics(metrics)
 * ```
 *
 * 设计原则：
 * - 纯函数工具 + 共享对象，不引入类继承
 * - 不依赖任何全局状态（Date.now 除外）
 * - 静默失败：写入异常不抛错，避免 metrics 本身成为 bug 源
 */

import type { LayoutErrorCode } from '@/utils/layout-errors';

/**
 * 布局引擎运行指标
 */
export interface LayoutMetrics {
  /** 阶段名 → 耗时毫秒 */
  phaseTimings: Record<string, number>;
  /** 阶段开始顺序（便于稳定展示） */
  phaseOrder: string[];
  /** 触发的错误码 + 消息 */
  errors: { code: LayoutErrorCode; message: string; timestamp: number }[];
  /** 实际使用的引擎类型（finalize 时由 LayoutEngine 补） */
  engineUsed?: 'dagre' | 'elkjs' | 'compactBox';
  /** 是否为"宽树"（finalize 时由 LayoutEngine 补） */
  wideTree?: boolean;
  /** 输入规模统计 */
  input: {
    nodeCount: number;
    edgeCount: number;
    parentChildEdgeCount: number;
    spouseEdgeCount: number;
  };
}

/**
 * 创建一份初始 metrics（每次 calculateLayout 调用前调用一次）
 */
export function createMetrics(
  nodeCount: number,
  edgeCount: number,
): LayoutMetrics {
  return {
    phaseTimings: Object.create(null),
    phaseOrder: [],
    errors: [],
    input: {
      nodeCount,
      edgeCount,
      parentChildEdgeCount: 0,
      spouseEdgeCount: 0,
    },
  };
}

/**
 * 开始一个阶段的计时，返回结束函数
 *
 * 调用方式（推荐）：
 * ```ts
 * const end = beginPhase(metrics, 'phaseName')
 * try { /* ...phase body... *\/ }
 * finally { end() }   // 确保异常路径也记录耗时
 * ```
 *
 * 返回值：endPhase() 调用后返回该阶段耗时毫秒（number），便于日志层做慢路径检测
 */
export function beginPhase(
  metrics: LayoutMetrics,
  phaseName: string,
): () => number {
  const start = nowMs();
  if (!Object.prototype.hasOwnProperty.call(metrics.phaseTimings, phaseName)) {
    metrics.phaseOrder.push(phaseName);
  }
  return () => {
    const elapsed = nowMs() - start;
    // 同一阶段多次进入（如循环中）取最大值（保守估计）
    const prev = metrics.phaseTimings[phaseName] ?? 0;
    metrics.phaseTimings[phaseName] = Math.max(prev, elapsed);
    return elapsed;
  };
}

/**
 * 记录一次错误到 metrics
 */
export function recordError(
  metrics: LayoutMetrics,
  code: LayoutErrorCode,
  message: string,
): void {
  try {
    metrics.errors.push({
      code,
      message,
      timestamp: nowMs(),
    });
  } catch {
    // 静默：metrics 写失败不应该被抛出（防御性）
  }
}

/**
 * 在 finalize 时填入引擎类型与宽树标记
 */
export function finalizeMetrics(
  metrics: LayoutMetrics,
  extras: { engineUsed?: 'dagre' | 'elkjs' | 'compactBox'; wideTree?: boolean },
): void {
  metrics.engineUsed = extras.engineUsed;
  metrics.wideTree = extras.wideTree;
}

/**
 * 把 metrics 转成稳定的浅对象（用于 LayoutResult.meta）
 */
export function snapshotMetrics(metrics: LayoutMetrics): {
  timings: Record<string, number>;
  phaseOrder: string[];
  totalMs: number;
  errors: LayoutMetrics['errors'];
  engineUsed?: string;
  wideTree?: boolean;
  input: LayoutMetrics['input'];
} {
  const totalMs = metrics.phaseOrder.reduce(
    (sum, name) => sum + (metrics.phaseTimings[name] ?? 0),
    0,
  );
  return {
    timings: { ...metrics.phaseTimings },
    phaseOrder: [...metrics.phaseOrder],
    totalMs,
    errors: metrics.errors.map((e) => ({ ...e })),
    engineUsed: metrics.engineUsed,
    wideTree: metrics.wideTree,
    input: { ...metrics.input },
  };
}

/**
 * 累计类指标：跨多次 calculateLayout 调用的统计
 *
 * LayoutEngine 实例级维护；调用者可通过 getCumulativeStats() 取出。
 */
export interface CumulativeStats {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  totalDurationMs: number;
  errorsByCode: Record<string, number>;
  nodesProcessed: number;
  edgesProcessed: number;
  enginesUsed: Record<string, number>;
}

/**
 * 创建累计统计
 */
export function createCumulativeStats(): CumulativeStats {
  return {
    totalCalls: 0,
    successCalls: 0,
    errorCalls: 0,
    totalDurationMs: 0,
    errorsByCode: Object.create(null),
    nodesProcessed: 0,
    edgesProcessed: 0,
    enginesUsed: Object.create(null),
  };
}

/**
 * 把一次调用合并到累计统计里
 *
 * @param stats      累计统计对象
 * @param metrics    本次调用的 metrics snapshot
 * @param durationMs 本次调用总耗时（LayoutEngine 自己用 Date.now 测）
 * @param hasError   本次调用是否抛错
 */
export function accumulateStats(
  stats: CumulativeStats,
  metrics: ReturnType<typeof snapshotMetrics> | null,
  durationMs: number,
  hasError: boolean,
): void {
  stats.totalCalls += 1;
  stats.totalDurationMs += durationMs;
  if (hasError) {
    stats.errorCalls += 1;
    if (metrics) {
      for (const err of metrics.errors) {
        stats.errorsByCode[err.code] = (stats.errorsByCode[err.code] ?? 0) + 1;
      }
    }
  } else {
    stats.successCalls += 1;
    if (metrics) {
      stats.nodesProcessed += metrics.input.nodeCount;
      stats.edgesProcessed += metrics.input.edgeCount;
      if (metrics.engineUsed) {
        stats.enginesUsed[metrics.engineUsed] =
          (stats.enginesUsed[metrics.engineUsed] ?? 0) + 1;
      }
    }
  }
}

/**
 * 默认使用 Date.now（生产环境）
 * 留 this hook 便于在测试中 mock 时间
 */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
