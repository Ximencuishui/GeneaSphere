/**
 * view-mode-config.ts — 6 种视图模式的卡片/间距参数表
 *
 * [2026-08-27 调优] 按 PRD §2.1.6 卡片字段（身份标识 + 排行 + 姓名 + 生卒年）
 * 改为横排为主后，原 40/44/46 px 宽度装不下中文姓名（2 字至少 26-32 px），
 * detailed/xianshi/su 三个传统横排模式统一加宽到 76 px；
 * - 高度 < 70：走 drawLabelShape（G6 默认 label 路径）
 * - 高度 >= 70：走 drawTraditionalContent（自定义渲染，PRD §2.1.6 四字段布局）
 * [2026-08-28 B1 调优] 卡片宽高比与间距调优
 * 目标：宽高比 0.85-1.0（接近正方形），同代间距卡片宽度 × 0.25，
 *   代际间距卡片高度 × 1.15，夫妻间距 spouseGap = 16（与 LayoutConfig 默认一致）。
 *   紧贴传统族谱（苏式/欧式）的卡片比例。
 * [2026-08-31 修复] 用户反馈树谱三类问题：
 *   1) 配偶卡片水平堆叠重叠：spouseGap 由「卡片宽×0.25」上调到「卡片宽×0.5」，
 *      使中心距 = 卡片宽 + 卡片宽×0.5，确保多配偶场景卡片边缘间距 ≥ 卡片宽 1/3。
 *   2) 卡片上下距离过大：rankSep 由「卡片高×1.15」下调到「卡片高×0.7」，
 *      让连续代际视觉紧凑，与传统苏式五世同堂比例一致（卡片高×0.6-0.8）。
 *   3) 引导线末端衔接：在 layout-engine computeOrthogonalEdgePaths 增加端点内缩，
 *      让线的末端精确落在卡片边缘内 4px 而不是几何边缘。
 *
 * 设计要点：
 * - 导出为工厂 useViewModeConfig()，返回 ComputedRef（必须在 setup 中调用以激活 effect）。
 * - 类型使用 ViewMode 字符串字面量（不直接 import @/stores/genealogy 以保持低耦合），
 *   下游消费者通过 const 断言兼容。
 */
import { computed } from 'vue';
import type { ComputedRef } from 'vue';

/** 视图模式参数：每种视图对应的节点尺寸 / 字号 / 间距 */
export interface ViewModeSettings {
  nodeWidth: number;
  nodeHeight: number;
  avatarSize: number;
  nameFontSize: number;
  sublabelFontSize: number;
  nodeSep: number;
  rankSep: number;
}

/**
 * 六种视图模式对应的配置表。
 * 键名与 genealogyStore.viewMode 的字面量值一致。
 */
export const VIEW_MODE_SETTINGS: Record<string, ViewModeSettings> = {
  compact: {
    nodeWidth: 52,
    nodeHeight: 36,
    avatarSize: 0,
    nameFontSize: 12,
    sublabelFontSize: 9,
    nodeSep: 16,           // 52 × 0.31
    rankSep: 26,           // 36 × 0.72（卡片上下紧凑，留给导览线空间）
  },
  // 详细模式：传统横排卡片，84×100 使宽高比 ≈ 0.84 更接近正方形
  detailed: {
    nodeWidth: 84,
    nodeHeight: 100,
    avatarSize: 0,
    nameFontSize: 13,
    sublabelFontSize: 0,  // 由 drawTraditionalContent 自渲染生卒年，不走 sublabel
    nodeSep: 28,           // 84 × 0.33（同代宽松 间距，避免多兄弟重叠）
    rankSep: 70,           // 100 × 0.7（紧凑代际，上下代卡片边缘间距 20px）
  },
  portrait: {
    nodeWidth: 94,
    nodeHeight: 100,
    avatarSize: 22,
    nameFontSize: 13,
    sublabelFontSize: 0,
    nodeSep: 30,           // 94 × 0.32
    rankSep: 70,           // 100 × 0.7
  },
  // 吊线图传统世系：84×90，宽高比 ≈ 0.93，与 detailed 统一宽度
  xianshi: {
    nodeWidth: 84,
    nodeHeight: 90,
    avatarSize: 0,
    nameFontSize: 12,
    sublabelFontSize: 0,
    nodeSep: 28,
    rankSep: 64,           // 90 × 0.71
  },
  // 苏式：传统横排，与 detailed/xianshi 同宽
  su: {
    nodeWidth: 84,
    nodeHeight: 100,
    avatarSize: 0,
    nameFontSize: 13,
    sublabelFontSize: 0,
    nodeSep: 28,
    rankSep: 70,
  },
  // 浙式：世代格保持横排 120×56（横长卡），走 drawLabelShape
  zhe: {
    nodeWidth: 120,
    nodeHeight: 56,
    avatarSize: 22,
    nameFontSize: 13,
    sublabelFontSize: 9,
    nodeSep: 36,           // 120 × 0.3
    rankSep: 40,           // 56 × 0.71
  },
};

/**
 * 工厂：返回视图模式参数 computed ref。
 * 必须在 Vue setup 中调用以激活 effect。
 *
 * 为什么不直接 export 一个 const computed？
 * - .ts 模块顶层调用 computed() 没有当前 effect 上下文，
 *   Vue 会警告并创建游离 effect（在 SSR / 测试环境尤其危险）。
 * - 用工厂把 effect 创建推迟到 setup 阶段。
 */
export function useViewModeConfig(): ComputedRef<Record<string, ViewModeSettings>> {
  return computed(() => VIEW_MODE_SETTINGS);
}