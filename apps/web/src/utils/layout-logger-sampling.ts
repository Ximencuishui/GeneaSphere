/**
 * layout-logger-sampling.ts - 慢路径采样策略
 *
 * [v6.x 健壮性 L 系列增强] 当上游触发慢路径事件时，不是每次都透传给底层 sink，
 *   而是按策略抽样，避免以下问题：
 *   - 日志风暴：高频调试（如拖动 / 缩放反复触发 layout）下，elkjs engine 阶段
 *     几百毫秒慢是常态，每帧都上送 Sentry 会导致事件配额爆炸 + 计费翻倍
 *   - 数据噪音：运维 / 开发者注意力分散，难定位"真问题"
 *   - 重复 pattern：同一 phase 在短窗口内多次 breach，运维需要的是"摘要"，不是"流水"
 *
 * 三种采样策略：
 *   - 'always'    ：全量透传（向后兼容，createConsoleLogger 默认行为）
 *   - 'probabilistic'：按概率抽样（0..1）
 *   - 'rate-limited'  ：滑动时间窗内最多 N 条/秒（默认 60s/10 条）
 *   - 'adaptive' ：基于 phase + 输入规模 hash 去重，仅上报"首次"和"最慢"，
 *                  类似于 DataDog Ingested Spans 的 span aggregation 思想
 *
 * 与 createCombinedLogger 配合：
 *   createCombinedLogger([
 *     createConsoleLogger(),
 *     createSamplingLogger(realSentrySink, { mode: 'rate-limited', maxPerMinute: 5 }),
 *   ])
 *
 * 注意：采样仅作用于 onSlowPhase；onError / onAfterCall 不采样
 *   - onError 必须每次都上报（错误不能丢）
 *   - onAfterCall 是高频低价值事件，由调用方在 sink 层面单独决定是否采样
 */

import type { LayoutLogger, SlowPhaseEvent } from '@/utils/layout-logger';

// ==================== 策略定义 ====================

/** 采样模式 */
export type SamplingMode = 'always' | 'probabilistic' | 'rate-limited' | 'adaptive';

/**
 * 采样器配置
 */
export interface SamplingOptions {
  /** 采样模式（默认 'always'） */
  mode?: SamplingMode;
  /** 'probabilistic' 模式下的采样率（0..1，默认 0.1 = 10%） */
  sampleRate?: number;
  /** 'rate-limited' 模式下，滑动窗口大小（毫秒，默认 60_000） */
  windowMs?: number;
  /** 'rate-limited' 模式下，窗口内最大事件数（默认 10） */
  maxPerWindow?: number;
  /** 'adaptive' 模式下，phase + input 签名相同是否合并（默认 true） */
  dedupBySignature?: boolean;
  /** 自定义"是否采样"判定函数——优先级最高，会覆盖 mode 配置 */
  predicate?: (event: SlowPhaseEvent) => boolean;
}

/**
 * 采样器接口
 */
export interface SlowPathSampler {
  /** 给定一个事件，判断是否采样（透传到底层 sink） */
  shouldSample(event: SlowPhaseEvent): boolean;
  /** 重置内部状态（典型场景：resetCumulativeStats 时同步清理） */
  reset(): void;
}

// ==================== 工厂函数 ====================

/**
 * 创建慢路径采样器
 *
 * @example
 *   const sampler = createSlowPathSampler({ mode: 'rate-limited', maxPerWindow: 5 });
 *   engine.setLogger({
 *     onSlowPhase: (e) => sampler.shouldSample(e) && realSink.onSlowPhase?.(e),
 *     onError: realSink.onError,
 *     onAfterCall: realSink.onAfterCall,
 *   });
 */
export function createSlowPathSampler(options: SamplingOptions = {}): SlowPathSampler {
  const cfg = {
    mode: 'always' as SamplingMode,
    sampleRate: 0.1,
    windowMs: 60_000,
    maxPerWindow: 10,
    dedupBySignature: true,
    ...options,
  };

  // 'rate-limited' 内部状态：滑动窗口内的样本时间戳
  let recentTimestamps: number[] = [];
  // 'adaptive' 内部状态：phase|signature → 最近一次触发时间
  const adaptiveState = new Map<string, { lastAt: number; peak: number }>();

  function pruneWindow(now: number): void {
    const cutoff = now - cfg.windowMs;
    let i = 0;
    while (i < recentTimestamps.length && recentTimestamps[i] < cutoff) i += 1;
    if (i > 0) recentTimestamps = recentTimestamps.slice(i);
  }

  function adaptiveKey(event: SlowPhaseEvent): string {
    // 签名：phase + engineUsed + nodeCount 量级（百位粒度）+ edgeCount 量级（百位粒度）
    //   - 量级粒度避免「节点数 999 vs 1000」被识别为不同事件
    //   - engineUsed 维度让「elkjs vs dagre」分别聚合
    const nodeBucket = Math.floor((event.input.nodeCount ?? 0) / 100) * 100;
    const edgeBucket = Math.floor((event.input.edgeCount ?? 0) / 100) * 100;
    return [
      event.phase,
      event.engineUsed ?? 'unknown',
      `n${nodeBucket}`,
      `e${edgeBucket}`,
    ].join('|');
  }

  return {
    shouldSample(event: SlowPhaseEvent): boolean {
      // 0. 自定义 predicate 最高优先
      if (cfg.predicate) {
        try {
          return cfg.predicate(event);
        } catch {
          return false; // predicate 抛错 → 默认丢（fail-safe）
        }
      }

      const now = Date.now();

      switch (cfg.mode) {
        case 'always':
          return true;

        case 'probabilistic':
          // Math.random < sampleRate
          return Math.random() < cfg.sampleRate;

        case 'rate-limited': {
          pruneWindow(now);
          if (recentTimestamps.length < cfg.maxPerWindow) {
            recentTimestamps.push(now);
            return true;
          }
          return false;
        }

        case 'adaptive': {
          const key = cfg.dedupBySignature ? adaptiveKey(event) : event.phase;
          const prev = adaptiveState.get(key);
          if (!prev) {
            adaptiveState.set(key, { lastAt: now, peak: event.durationMs });
            return true; // 首次
          }
          // 距离上次 >= windowMs → 视为新窗口，放行
          if (now - prev.lastAt >= cfg.windowMs) {
            adaptiveState.set(key, { lastAt: now, peak: event.durationMs });
            return true;
          }
          // 同窗口内：只有当本次比记录的 peak 更高才放行（保留峰值）
          if (event.durationMs > prev.peak) {
            adaptiveState.set(key, { lastAt: now, peak: event.durationMs });
            return true;
          }
          return false;
        }

        default:
          return true;
      }
    },
    reset(): void {
      recentTimestamps = [];
      adaptiveState.clear();
    },
  };
}

// ==================== 包装器：直接把 onSlowPhase 包一层） ====================

/**
 * 创建采样 Logger（在 base 之上包一层 onSlowPhase 过滤器）
 *
 * 用法（推荐 — 与 combined logger 协同）：
 * ```ts
 * const sampled = createSamplingLogger(realSentrySink, { mode: 'rate-limited', maxPerWindow: 5 });
 * engine.setLogger(createCombinedLogger([
 *   createConsoleLogger({ silent: true }),  // 控制台也走采样，避免无意义刷屏
 *   sampled,
 * ]));
 * ```
 *
 * 实现细节：
 * - onError / onAfterCall 永远透传（错误不能丢；after-call 由 sink 决定采样）
 * - onSlowPhase 通过 sampler.shouldSample() 决定
 *
 * @param base 底层 sink（如 createSentrySink 返回的对象）
 * @param sampler 采样器（可独立创建或共享）
 */
export function createSamplingLogger(
  base: LayoutLogger,
  samplerOrOptions: SlowPathSampler | SamplingOptions = {},
): LayoutLogger {
  const sampler: SlowPathSampler =
    typeof (samplerOrOptions as SlowPathSampler).shouldSample === 'function'
      ? (samplerOrOptions as SlowPathSampler)
      : createSlowPathSampler(samplerOrOptions as SamplingOptions);

  return {
    onSlowPhase: (event: SlowPhaseEvent) => {
      if (!sampler.shouldSample(event)) return;
      try {
        base.onSlowPhase?.(event);
      } catch {
        /* silent */
      }
    },
    onError: (event) => {
      try {
        base.onError?.(event);
      } catch {
        /* silent */
      }
    },
    onAfterCall: (event) => {
      try {
        base.onAfterCall?.(event);
      } catch {
        /* silent */
      }
    },
    flush: base.flush
      ? (snapshot) => {
          try {
            base.flush?.(snapshot);
          } catch {
            /* silent */
          }
        }
      : undefined,
  };
}

// ==================== 预设 ====================

/**
 * 预设：开发期（local dev）— 全量透传，便于调试
 */
export const DEV_SAMPLING: SamplingOptions = { mode: 'always' };

/**
 * 预设：生产期（staging / prod）— 60s 窗口最多 5 条慢路径
 *
 * 经验值：常规浏览 60s 内布局引擎一般 0-2 次慢路径，
 *   上限 5 条给"真问题"留足带宽且不会爆配额
 */
export const PROD_SAMPLING: SamplingOptions = {
  mode: 'rate-limited',
  windowMs: 60_000,
  maxPerWindow: 5,
};

/**
 * 预设：极简（健康监测模式）— 10% 概率采样，省配额到极致
 */
export const LIGHT_SAMPLING: SamplingOptions = {
  mode: 'probabilistic',
  sampleRate: 0.1,
};