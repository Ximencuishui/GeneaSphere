/**
 * couple-unit-span.ts - 一夫多妻 CoupleUnit span 视觉对齐诊断算法
 *
 * [2026-09-02 P1 #8 修复] 从 TreeMultiWifeDemoPage.vue 抽出来的纯函数，
 *   便于在 vitest 中独立单测覆盖。
 *
 * 背景：v6.0.8 走线解耦后，CoupleUnit 内多个配偶节点应整齐对齐，
 *   相邻配偶卡片中心距 = (spouseWidth + spouseGap)。
 *   本模块计算两个互补指标：
 *   - endToEndRatio：首尾配偶中心距 / ((N-1) × (spouseW + spouseGap))
 *     → 衡量 CoupleUnit 总宽度是否正确（消除子树累加偏差）
 *   - adjacentRatio：相邻配偶中心距均值 / (spouseW + spouseGap)
 *     → 细粒度检测某一对相邻配偶是否错位
 *
 * 算法契约（与 tree-positioning.ts positionSpouseNodes 一致）：
 *   配偶节点按 marriageOrder 升序排布，spouse 边 metadata.marriageOrder 是单一来源。
 *   修复前 bug：旧实现按 spouseId 字符串排序（"W10" < "W2"），
 *   与 layout-engine 内部契约不一致，导致 span 计算错误。
 */

import type { LayoutEdge, NodePosition } from '@/types/layout';

export interface CoupleEntry {
  /** 主节点 id */
  mainId: string;
  /** 配偶节点 id */
  spouseId: string;
  /** 主-配中心距（从 layout 输出读） */
  dist: number;
  /** 婚姻顺序（spouse edge 上 metadata） */
  marriageOrder: number;
}

export interface CoupleUnitSpanRatio {
  /** 首-尾 span / (N-1) × (spouseW + spouseGap)，越接近 1.0 越整齐 */
  endToEndRatio: number;
  /** 相邻间距均值 / (spouseW + spouseGap)，越接近 1.0 越整齐 */
  adjacentRatio: number;
  /** CoupleUnit 内配偶节点数 */
  spouseCount: number;
  /** 实际首-尾 span（中心距） */
  endToEndSpan: number;
  /** 相邻配偶中心距均值 */
  adjacentAvg: number;
  /** 理论相邻配偶中心距 = spouseW + spouseGap */
  expected: number;
}

/**
 * 按夫分组收集 spouse 边（保留 marriageOrder）
 *
 * 输入：layout 输出的 edges + nodes + 节点位置索引。
 * 输出：按 mainId 分组的 CoupleEntry[]，未做排序。
 *
 * 契约：spouse edge 的 `source = mainId, target = spouseId`（与 demo seed 数据
 *   生成约定一致；与 `tree-positioning.ts:positionSpouseNodes` 的输入契约一致）。
 *   注意：layout-engine 内部 `buildSpouseMap` 会双向解析 source/target，但
 *   `LayoutResult.edges` 保留原始 direction，本函数不二次归一化。
 *   如果上游传入反向 spouse edge（GEDCOM 等异源数据），请先用 `buildSpouseMap`
 *   把方向归一化后再调用本函数，避免 mainId/spouseId 静默错配。
 */
export function collectCouplesByMain(
  edges: LayoutEdge[],
  nodePositions: NodePosition[],
): Map<string, CoupleEntry[]> {
  const posById = new Map<string, NodePosition>();
  for (const n of nodePositions) posById.set(n.id, n);

  const couplesByMain = new Map<string, CoupleEntry[]>();
  for (const e of edges) {
    if (e.kind !== 'spouse') continue;
    const mainId = e.source;
    const spouseId = e.target;
    const mainPos = posById.get(mainId);
    const spousePos = posById.get(spouseId);
    if (!mainPos || !spousePos) continue;
    const dist = Math.abs(spousePos.x - mainPos.x);
    if (!couplesByMain.has(mainId)) couplesByMain.set(mainId, []);
    couplesByMain.get(mainId)!.push({
      mainId,
      spouseId,
      dist,
      marriageOrder: e.marriageOrder ?? 0,
    });
  }
  return couplesByMain;
}

/**
 * 计算单个 CoupleUnit 的 span 比
 *
 * @param sortedEntries 必须按 marriageOrder 升序排序后的配偶列表（调用方负责排序）
 * @param nodePositions 节点位置索引
 * @param spouseW 单张配偶卡片宽度
 * @param spouseGap 配偶卡片间距
 * @returns CoupleUnitSpanRatio；N<2 时返回 null
 */
export function computeCoupleUnitSpanRatio(
  sortedEntries: CoupleEntry[],
  nodePositions: NodePosition[],
  spouseW: number,
  spouseGap: number,
): CoupleUnitSpanRatio | null {
  if (sortedEntries.length < 2) return null;
  const posById = new Map<string, NodePosition>();
  for (const n of nodePositions) posById.set(n.id, n);

  const first = posById.get(sortedEntries[0].spouseId);
  const last = posById.get(sortedEntries[sortedEntries.length - 1].spouseId);
  if (!first || !last) return null;

  const endToEndSpan = last.x - first.x;
  const expected = (sortedEntries.length - 1) * (spouseW + spouseGap);
  const endToEndRatio = expected > 0 ? endToEndSpan / expected : 1;

  let adjacentSum = 0;
  let adjacentValid = 0;
  for (let i = 1; i < sortedEntries.length; i++) {
    const prev = posById.get(sortedEntries[i - 1].spouseId);
    const curr = posById.get(sortedEntries[i].spouseId);
    if (!prev || !curr) continue;
    adjacentSum += curr.x - prev.x;
    adjacentValid += 1;
  }
  const adjacentAvg = adjacentValid > 0 ? adjacentSum / adjacentValid : spouseW + spouseGap;
  const adjacentRatio = (spouseW + spouseGap) > 0 ? adjacentAvg / (spouseW + spouseGap) : 1;

  return {
    endToEndRatio,
    adjacentRatio,
    spouseCount: sortedEntries.length,
    endToEndSpan,
    adjacentAvg,
    expected: spouseW + spouseGap,
  };
}

/**
 * 计算全部 CoupleUnit 的最大 span 偏离度
 *
 * 用于诊断面板：返回 endToEndRatio / adjacentRatio 的"最差值"，
 * 调用方据此判定 pass / warn / fail。
 *
 * @param couplesByMain 已经按夫分组的配偶列表（未排序，函数内按 marriageOrder 排）
 * @param nodePositions 节点位置
 * @param spouseW / spouseGap 期望配偶卡片尺寸 + 间距
 * @returns 最差 span 比对象；无有效 CoupleUnit 时返回 null
 *
 * 实现细节：worstEndToEnd / worstAdjacent 初始化为 1（即"完美匹配基准"），
 *   这样首次遍历时 ratio 与 1 的偏差可与历史最大偏差比较。
 *   若初始化为 0，|0-1|=1 会比任何真实 ratio 偏离度都大，永远不会更新。
 */
export function computeWorstSpanRatio(
  couplesByMain: Map<string, CoupleEntry[]>,
  nodePositions: NodePosition[],
  spouseW: number,
  spouseGap: number,
): {
  endToEndRatio: number;
  adjacentRatio: number;
  maxSpouses: number;
  exampleMainId: string | null;
  exampleRatio: number;
} | null {
  // 初始化为 1（完美匹配基准），确保 |1 - 1| = 0 能被任何真实 ratio 超越
  let worstEndToEnd = 1;
  let worstAdjacent = 1;
  let maxSpouses = 0;
  let exampleMainId: string | null = null;
  let exampleRatio = 1;

  for (const [mainId, list] of couplesByMain) {
    // [P1 #8 修复] 按 marriageOrder 升序排序（替代旧版 spouseId 字符串排序）
    const sorted = list.slice().sort((a, b) => a.marriageOrder - b.marriageOrder);
    const ratio = computeCoupleUnitSpanRatio(sorted, nodePositions, spouseW, spouseGap);
    if (!ratio) continue;
    if (Math.abs(ratio.endToEndRatio - 1) > Math.abs(worstEndToEnd - 1)) {
      worstEndToEnd = ratio.endToEndRatio;
      exampleMainId = mainId;
      exampleRatio = ratio.endToEndRatio;
    }
    if (Math.abs(ratio.adjacentRatio - 1) > Math.abs(worstAdjacent - 1)) {
      worstAdjacent = ratio.adjacentRatio;
    }
    if (ratio.spouseCount > maxSpouses) maxSpouses = ratio.spouseCount;
  }

  if (maxSpouses < 2) return null;
  return {
    endToEndRatio: worstEndToEnd,
    adjacentRatio: worstAdjacent,
    maxSpouses,
    exampleMainId,
    exampleRatio,
  };
}

/**
 * 把 span 比换算为诊断状态（pass / warn / fail）
 *
 * 阈值（含浮点容差）：
 * - pass：偏差 ≤ 5%（ratio ≈ 1.0，|ratio-1| ≤ 0.05 + ε）
 * - warn：偏差 5% ~ 10%（|ratio-1| ∈ (0.05+ε, 0.10+ε]）
 * - fail：偏差 > 10%（|ratio-1| > 0.10 + ε）
 *
 * 浮点容差：JavaScript 中 0.95 - 1 可能 = -0.04999999999999993，
 * 1.05 - 1 可能 = 0.050000000000000044，这里用 1e-9 兜底容差，
 * 保证 `1.05` 与 `0.95` 边界值进入 pass 分支而不是 warn。
 */
const SPAN_RATIO_EPSILON = 1e-9;
export function spanRatioStatus(ratio: number): 'pass' | 'warn' | 'fail' {
  const abs = Math.abs(ratio - 1);
  if (abs <= 0.05 + SPAN_RATIO_EPSILON) return 'pass';
  if (abs <= 0.1 + SPAN_RATIO_EPSILON) return 'warn';
  return 'fail';
}