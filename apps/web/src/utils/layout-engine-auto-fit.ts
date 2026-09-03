/**
 * layout-engine-auto-fit.ts — 自适应缩放（autoFit）独立模块
 *
 * [P0-3 2026-09-03] §8.3 拆分产物：从 layout-engine.ts 抽出 autoFit 方法。
 *
 * 抽出动机：
 * - layout-engine.ts 单文件 922 行（目标 ≤400）；autoFit 是「纯几何计算」，
 *   与编排器主流程（calculateLayout 14 阶段）耦合度低，单独成文件更易维护。
 * - autoFit 的回归测试在 layout-engine.autofit.spec.ts，与拆分后一一对应，
 *   未来若再扩展（如多画布 / 不同 viewport 适配策略）可在不碰主流程的情况下迭代。
 *
 * [2026-09-01 P0 修复] 横向过宽场景（aspectRatio > 3 且原生 scaleX < minZoom）：
 *   旧逻辑 `min(scaleX, scaleY)` 会得到极小值（如 0.018），clamp 到 minZoom=0.25 后
 *   仍然不可用（1280px 画布对应 67Kpx 布局仍需大量横向滚动）。
 *   新逻辑：当 contentW / contentH > 3 时，强制使用 fitByHeight（让 Y 适配画布高度），
 *   同时在返回结果中标记 wideTree=true，调用方据此降低 zoom 下限以保持节点可读。
 */
import type { LayoutResult, ViewportConfig, LayoutConfig } from '@/types/layout';

export interface AutoFitContext {
  /** 画布尺寸（css px） */
  canvasSize: { width: number; height: number };
  /** 当前 LayoutConfig（含 autoFit 子配置） */
  config: LayoutConfig;
  /**
   * 回调：把 wideTree 标志写回最近一次 metrics（用于 result.meta 关联）。
   * 由 LayoutEngine 在调用 autoFit 后通过此钩子同步 metrics 状态。
   */
  onWideTreeDetected?: (wideTree: boolean) => void;
}

/**
 * 自适应缩放：根据 layout.bounds 与 canvas 尺寸算出 zoom + center，
 * 并在 contentW/contentH > 3 + scaleX < minZoom 时强制使用 fitByHeight。
 *
 * 设计要点：
 * 1. 防御性 `Math.max(1, contentW/H)` 避免 contentW=H=0 时除零
 * 2. `wideTree` 标志同时回写到 metrics（via onWideTreeDetected 钩子）
 * 3. `layoutDirection` 推断逻辑：用户显式 preferDirection 时保留用户选择
 */
export function computeAutoFit(
  layout: LayoutResult,
  ctx: AutoFitContext,
): ViewportConfig {
  const { bounds } = layout;
  const { width: canvasW, height: canvasH } = ctx.canvasSize;
  const padding = ctx.config.autoFit.padding;

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
  const wideTreeThreshold = ctx.config.wideTreeAspectRatio ?? 3;
  const wideTree = aspectRatio > wideTreeThreshold && scaleX < ctx.config.autoFit.minZoom;
  let zoom = wideTree ? scaleY : Math.min(scaleX, scaleY);

  zoom = Math.max(ctx.config.autoFit.minZoom, Math.min(ctx.config.autoFit.maxZoom, zoom));

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  // 保留 layoutDirection 供调用方区分 TB/LR
  let direction: 'TB' | 'LR' = 'TB';
  if (ctx.config.autoFit.preferDirection === 'auto') {
    direction = contentW > contentH ? 'LR' : 'TB';
  } else {
    direction = ctx.config.autoFit.preferDirection;
  }

  // 回调：把 wideTree 标志写回 metrics（v6.x O 系列）
  ctx.onWideTreeDetected?.(wideTree);

  return {
    zoom,
    centerX,
    centerY,
    layoutDirection: direction,
    wideTree,
    contentAspectRatio: aspectRatio,
  };
}