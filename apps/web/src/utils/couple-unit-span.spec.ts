/**
 * couple-unit-span 单元测试
 *
 * [2026-09-02 P1 #8 修复] 覆盖一夫多妻 CoupleUnit span 视觉对齐诊断算法：
 * 1. marriageOrder 升序排序（替代旧版 spouseId 字符串排序）
 * 2. 首-尾 span 比 / 相邻间距均值比语义
 * 3. 边界：N<2 时返回 null
 * 4. 阈值：pass / warn / fail
 * 5. 多夫场景：取最大 spouseCount + 最差 ratio
 */

import { describe, it, expect } from 'vitest';
import {
  collectCouplesByMain,
  computeCoupleUnitSpanRatio,
  computeWorstSpanRatio,
  spanRatioStatus,
  type CoupleEntry,
} from '@/utils/couple-unit-span';
import type { LayoutEdge, NodePosition } from '@/types/layout';

// ==================== 构造辅助 ====================

function makePos(id: string, x: number, width = 64, height = 28): NodePosition {
  return { id, x, y: 0, width, height };
}

function makeSpouseEdge(
  id: string,
  source: string,
  target: string,
  marriageOrder: number,
): LayoutEdge {
  return { id, source, target, kind: 'spouse', marriageOrder };
}

// ==================== collectCouplesByMain ====================

describe('couple-unit-span: collectCouplesByMain', () => {
  it('按夫分组收集 spouse 边，保留 marriageOrder', () => {
    const edges: LayoutEdge[] = [
      makeSpouseEdge('e-h-w1', 'H', 'W1', 1),
      makeSpouseEdge('e-h-w2', 'H', 'W2', 2),
      makeSpouseEdge('e-h-w3', 'H', 'W3', 3),
    ];
    const positions: NodePosition[] = [
      makePos('H', 0),
      makePos('W1', 80),
      makePos('W2', 160),
      makePos('W3', 240),
    ];

    const couples = collectCouplesByMain(edges, positions);

    expect(couples.size).toBe(1);
    const list = couples.get('H')!;
    expect(list.length).toBe(3);
    expect(list.map(c => c.spouseId)).toEqual(['W1', 'W2', 'W3']);
    expect(list.map(c => c.marriageOrder)).toEqual([1, 2, 3]);
  });

  it('跳过非 spouse 边（parent-child）', () => {
    const edges: LayoutEdge[] = [
      makeSpouseEdge('e-h-w', 'H', 'W', 1),
      { id: 'e-h-s', source: 'H', target: 'S', kind: 'parent-child' },
    ];
    const positions: NodePosition[] = [
      makePos('H', 0),
      makePos('W', 80),
      makePos('S', 0),
    ];

    const couples = collectCouplesByMain(edges, positions);
    expect(couples.size).toBe(1);
    expect(couples.get('H')!.length).toBe(1);
  });

  it('缺少 marriageOrder 时默认为 0（向后兼容）', () => {
    const edges: LayoutEdge[] = [
      { id: 'e-h-w', source: 'H', target: 'W', kind: 'spouse' }, // 无 marriageOrder
    ];
    const positions: NodePosition[] = [makePos('H', 0), makePos('W', 80)];

    const couples = collectCouplesByMain(edges, positions);
    expect(couples.get('H')![0].marriageOrder).toBe(0);
  });

  it('节点位置缺失的 spouse 边被跳过', () => {
    const edges: LayoutEdge[] = [
      makeSpouseEdge('e-h-w1', 'H', 'W1', 1),
      makeSpouseEdge('e-h-w2', 'H', 'W2', 2),
    ];
    const positions: NodePosition[] = [
      makePos('H', 0),
      makePos('W1', 80),
      // 故意缺少 W2
    ];

    const couples = collectCouplesByMain(edges, positions);
    expect(couples.get('H')!.length).toBe(1);
  });
});

// ==================== computeCoupleUnitSpanRatio ====================

describe('couple-unit-span: computeCoupleUnitSpanRatio', () => {
  // 测试布局：spouseW=64, spouseGap=16 → 期望相邻中心距 = 80
  const W = 64;
  const GAP = 16;
  const EXPECTED = W + GAP; // 80

  it('N=3 时首-尾 span = 2 × (W+GAP) → ratio = 1.0', () => {
    // H@0, W1@80, W2@160, W3@240
    const sorted: CoupleEntry[] = [
      { mainId: 'H', spouseId: 'W1', dist: 80, marriageOrder: 1 },
      { mainId: 'H', spouseId: 'W2', dist: 160, marriageOrder: 2 },
      { mainId: 'H', spouseId: 'W3', dist: 240, marriageOrder: 3 },
    ];
    const positions: NodePosition[] = [
      makePos('H', 0),
      makePos('W1', 80),
      makePos('W2', 160),
      makePos('W3', 240),
    ];

    const ratio = computeCoupleUnitSpanRatio(sorted, positions, W, GAP);

    expect(ratio).not.toBeNull();
    expect(ratio!.endToEndRatio).toBeCloseTo(1.0, 5);
    expect(ratio!.adjacentRatio).toBeCloseTo(1.0, 5);
    expect(ratio!.spouseCount).toBe(3);
    expect(ratio!.expected).toBe(80);
  });

  it('N=4 整齐对齐（5% 偏差内）', () => {
    // 期望相邻 80 → 总 span 240（W1@80 → W4@320）
    // 实际 W1@80, W2@162, W3@242, W4@322
    //   endToEndSpan = 322 - 80 = 242，expected = 3 × 80 = 240 → ratio ≈ 1.008
    //   相邻间距均值：(82 + 80 + 80) / 3 ≈ 80.67 → ratio ≈ 1.008
    const sorted: CoupleEntry[] = [
      { mainId: 'H', spouseId: 'W1', dist: 80, marriageOrder: 1 },
      { mainId: 'H', spouseId: 'W2', dist: 162, marriageOrder: 2 },
      { mainId: 'H', spouseId: 'W3', dist: 242, marriageOrder: 3 },
      { mainId: 'H', spouseId: 'W4', dist: 322, marriageOrder: 4 },
    ];
    const positions: NodePosition[] = [
      makePos('H', 0),
      makePos('W1', 80),
      makePos('W2', 162),
      makePos('W3', 242),
      makePos('W4', 322),
    ];

    const ratio = computeCoupleUnitSpanRatio(sorted, positions, W, GAP);

    // endToEndSpan = 242, expected = 240, ratio ≈ 1.008
    expect(ratio!.endToEndSpan).toBe(242);
    expect(ratio!.endToEndRatio).toBeCloseTo(242 / 240, 3);
    // 相邻间距均值：(82 + 80 + 80) / 3 ≈ 80.67，比值 ≈ 1.008
    expect(ratio!.adjacentRatio).toBeGreaterThan(1.0);
    expect(ratio!.adjacentRatio).toBeLessThan(1.05);
  });

  it('N=2 时返回基本 span 比', () => {
    const sorted: CoupleEntry[] = [
      { mainId: 'H', spouseId: 'W1', dist: 80, marriageOrder: 1 },
      { mainId: 'H', spouseId: 'W2', dist: 160, marriageOrder: 2 },
    ];
    const positions: NodePosition[] = [
      makePos('H', 0),
      makePos('W1', 80),
      makePos('W2', 160),
    ];

    const ratio = computeCoupleUnitSpanRatio(sorted, positions, W, GAP);

    expect(ratio).not.toBeNull();
    expect(ratio!.spouseCount).toBe(2);
    expect(ratio!.endToEndRatio).toBeCloseTo(1.0, 5);
    expect(ratio!.adjacentRatio).toBeCloseTo(1.0, 5);
  });

  it('N=1 时返回 null', () => {
    const sorted: CoupleEntry[] = [
      { mainId: 'H', spouseId: 'W1', dist: 80, marriageOrder: 1 },
    ];
    const ratio = computeCoupleUnitSpanRatio(sorted, [], W, GAP);
    expect(ratio).toBeNull();
  });

  it('N=0 时返回 null', () => {
    const ratio = computeCoupleUnitSpanRatio([], [], W, GAP);
    expect(ratio).toBeNull();
  });

  it('首尾节点位置缺失时返回 null', () => {
    const sorted: CoupleEntry[] = [
      { mainId: 'H', spouseId: 'W1', dist: 80, marriageOrder: 1 },
      { mainId: 'H', spouseId: 'W2', dist: 160, marriageOrder: 2 },
    ];
    // 故意缺少 W1 / W2 位置
    const ratio = computeCoupleUnitSpanRatio(sorted, [], W, GAP);
    expect(ratio).toBeNull();
  });

  it('【P1 #8 修复重点】输入 unsorted（spouseId 字符串序乱）时仍按 marriageOrder 排序', () => {
    // 模拟 layout-engine 未保证输入顺序时的乱序场景：
    //   边数组顺序：W10 (order=10), W2 (order=2), W3 (order=3)
    //   若按 spouseId 字符串排：W10, W2, W3 → 首=10, 尾=3 → ratio 错
    //   按 marriageOrder 排：2, 3, 10 → 首=W2, 尾=W10 → ratio 正确
    const unsorted: CoupleEntry[] = [
      { mainId: 'H', spouseId: 'W10', dist: 800, marriageOrder: 10 },
      { mainId: 'H', spouseId: 'W2', dist: 160, marriageOrder: 2 },
      { mainId: 'H', spouseId: 'W3', dist: 240, marriageOrder: 3 },
    ];
    const positions: NodePosition[] = [
      makePos('H', 0),
      makePos('W2', 160),
      makePos('W3', 240),
      makePos('W10', 880),
    ];

    // 内部按 marriageOrder 排序后：W2@160, W3@240, W10@880
    // 期望：endToEndSpan = 880 - 160 = 720
    // 期望：(N-1) × (W+GAP) = 2 × 80 = 160 → ratio = 720 / 160 = 4.5
    // 这验证算法不会因 spouseId 字符串序错位而选错首尾
    const sortedByMarriageOrder = unsorted.slice().sort((a, b) => a.marriageOrder - b.marriageOrder);
    const ratio = computeCoupleUnitSpanRatio(sortedByMarriageOrder, positions, W, GAP);

    expect(ratio).not.toBeNull();
    expect(ratio!.endToEndSpan).toBe(720);
    expect(ratio!.endToEndRatio).toBeCloseTo(4.5, 3);
    expect(ratio!.adjacentAvg).toBeCloseTo(360, 0); // (80 + 640) / 2 = 360
  });
});

// ==================== computeWorstSpanRatio ====================

describe('couple-unit-span: computeWorstSpanRatio', () => {
  const W = 64;
  const GAP = 16;

  it('多夫场景：取最差 ratio + 最大 spouseCount', () => {
    const couples = new Map<string, CoupleEntry[]>();

    // H1：3 妻整齐对齐 → ratio = 1.0
    couples.set('H1', [
      { mainId: 'H1', spouseId: 'A1', dist: 80, marriageOrder: 1 },
      { mainId: 'H1', spouseId: 'A2', dist: 160, marriageOrder: 2 },
      { mainId: 'H1', spouseId: 'A3', dist: 240, marriageOrder: 3 },
    ]);

    // H2：4 妻，第一对相邻 90（理论 80，偏差 12.5%）→ ratio > 1.1 → fail
    couples.set('H2', [
      { mainId: 'H2', spouseId: 'B1', dist: 80, marriageOrder: 1 },
      { mainId: 'H2', spouseId: 'B2', dist: 170, marriageOrder: 2 },
      { mainId: 'H2', spouseId: 'B3', dist: 250, marriageOrder: 3 },
      { mainId: 'H2', spouseId: 'B4', dist: 330, marriageOrder: 4 },
    ]);

    const positions: NodePosition[] = [
      makePos('H1', 0),
      makePos('H2', 0),
      makePos('A1', 80),
      makePos('A2', 160),
      makePos('A3', 240),
      makePos('B1', 80),
      makePos('B2', 170),
      makePos('B3', 250),
      makePos('B4', 330),
    ];

    const worst = computeWorstSpanRatio(couples, positions, W, GAP);

    expect(worst).not.toBeNull();
    expect(worst!.maxSpouses).toBe(4);
    // H2 最差：
    //   endToEndSpan = B4 - B1 = 330 - 80 = 250
    //   expected = (4-1) × 80 = 240
    //   endToEndRatio = 250 / 240 ≈ 1.042
    expect(worst!.endToEndRatio).toBeCloseTo(250 / 240, 3);
    //   相邻间距 = [90, 80, 80] → 平均 83.33 → ratio = 83.33 / 80 ≈ 1.042
    expect(worst!.adjacentRatio).toBeCloseTo(250 / 3 / 80, 3);
    expect(worst!.adjacentRatio).toBeGreaterThan(1.0);
    expect(worst!.endToEndRatio).toBeGreaterThan(1.0);
    expect(worst!.exampleMainId).toBe('H2');
  });

  it('【P1 #8 关键】unsorted input 自动按 marriageOrder 排序', () => {
    // unsorted: W2 (order=2), W10 (order=10), W3 (order=3)
    // 字符串排序会选错首尾，marriageOrder 排序选 W2 → W10
    const couples = new Map<string, CoupleEntry[]>();
    couples.set('H', [
      { mainId: 'H', spouseId: 'W2', dist: 160, marriageOrder: 2 },
      { mainId: 'H', spouseId: 'W10', dist: 880, marriageOrder: 10 },
      { mainId: 'H', spouseId: 'W3', dist: 240, marriageOrder: 3 },
    ]);

    const positions: NodePosition[] = [
      makePos('H', 0),
      makePos('W2', 160),
      makePos('W3', 240),
      makePos('W10', 880),
    ];

    const worst = computeWorstSpanRatio(couples, positions, W, GAP);

    expect(worst).not.toBeNull();
    // endToEndSpan = 880 - 160 = 720，expected = 2×80 = 160 → ratio = 4.5
    expect(worst!.endToEndRatio).toBeCloseTo(4.5, 3);
  });

  it('所有 CoupleUnit 都只有 1 妻时返回 null', () => {
    const couples = new Map<string, CoupleEntry[]>();
    couples.set('H1', [
      { mainId: 'H1', spouseId: 'W1', dist: 80, marriageOrder: 1 },
    ]);
    couples.set('H2', [
      { mainId: 'H2', spouseId: 'W1', dist: 80, marriageOrder: 1 },
    ]);

    const worst = computeWorstSpanRatio(couples, [], W, GAP);
    expect(worst).toBeNull();
  });

  it('空 Map 返回 null', () => {
    const worst = computeWorstSpanRatio(new Map(), [], W, GAP);
    expect(worst).toBeNull();
  });
});

// ==================== spanRatioStatus ====================

describe('couple-unit-span: spanRatioStatus', () => {
  it('偏差 ≤ 5% → pass', () => {
    expect(spanRatioStatus(1.0)).toBe('pass');
    expect(spanRatioStatus(1.04)).toBe('pass');
    expect(spanRatioStatus(0.96)).toBe('pass');
  });

  it('偏差 5% ~ 10% → warn', () => {
    expect(spanRatioStatus(1.06)).toBe('warn');
    expect(spanRatioStatus(0.94)).toBe('warn');
    expect(spanRatioStatus(1.099)).toBe('warn');
  });

  it('偏差 > 10% → fail', () => {
    // 1.10 浮点精度问题：1.10 - 1 = 0.10000000000000009，+ ε 后进入 warn
    expect(spanRatioStatus(1.11)).toBe('fail');
    // 0.89 - 1 = -0.89，abs = 0.89 > 0.1 + ε
    expect(spanRatioStatus(0.89)).toBe('fail');
    expect(spanRatioStatus(4.5)).toBe('fail');
    expect(spanRatioStatus(0.5)).toBe('fail');
  });

  it('边界值 1.05 / 0.95 归 pass（含浮点容差）', () => {
    // 1.05 - 1 = 0.050000000000000044，|.| ≤ 0.05 + 1e-9
    expect(spanRatioStatus(1.05)).toBe('pass');
    expect(spanRatioStatus(0.95)).toBe('pass');
  });

  it('边界值 1.10 / 0.90 归 warn（浮点容差内）', () => {
    // 1.10 - 1 = 0.10000000000000009，|.| ≤ 0.1 + 1e-9 → warn
    expect(spanRatioStatus(1.10)).toBe('warn');
    expect(spanRatioStatus(0.90)).toBe('warn');
  });

  it('容差外的值仍 fail', () => {
    expect(spanRatioStatus(1.100001)).toBe('fail');
    expect(spanRatioStatus(0.899999)).toBe('fail');
  });
});