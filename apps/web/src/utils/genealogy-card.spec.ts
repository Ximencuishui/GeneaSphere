import { describe, expect, it } from 'vitest';
import type { CoupleUnit, LayoutEdge, LayoutNode, NodePosition } from '@/types/layout';
import { resolveSubtreeOverlap } from '@/utils/tree-overlap';
import {
  cardSizeForDensity,
  collectCornerMarks,
  collectDetailTags,
  estimateTextWidth,
  fitTextLines,
  formatDetailLine,
  formatLifeYears,
  presentSpouseName,
  resolveCardOuterSize,
  spouseSurnameHint,
} from '@/utils/genealogy-card';

function person(id: string, generation: number, width = 84, height = 100): LayoutNode {
  return {
    id,
    label: id,
    gender: 'male',
    isMainLineage: false,
    isLiving: false,
    generation,
    width,
    height,
  };
}

function overlaps(a: NodePosition, b: NodePosition): boolean {
  const ax0 = a.x - a.width / 2;
  const ax1 = a.x + a.width / 2;
  const ay0 = a.y - a.height / 2;
  const ay1 = a.y + a.height / 2;
  const bx0 = b.x - b.width / 2;
  const bx1 = b.x + b.width / 2;
  const by0 = b.y - b.height / 2;
  const by1 = b.y + b.height / 2;
  return ax0 < bx1 - 0.5 && bx0 < ax1 - 0.5 && ay0 < by1 - 0.5 && by0 < ay1 - 0.5;
}

describe('card density', () => {
  it('简洁模式沿用现有外框，LR 传统卡片仍是 160×80', () => {
    expect(cardSizeForDensity({ nodeWidth: 132, nodeHeight: 100 }, 'LR', 'simple')).toEqual({
      nodeWidth: 160,
      nodeHeight: 80,
    });
  });

  it('详情模式把传统卡片加高 20，LR 从 80 到 100', () => {
    expect(cardSizeForDensity({ nodeWidth: 132, nodeHeight: 100 }, 'LR', 'detailed')).toEqual({
      nodeWidth: 160,
      nodeHeight: 100,
    });
    expect(cardSizeForDensity({ nodeWidth: 132, nodeHeight: 100 }, 'TB', 'detailed')).toEqual({
      nodeWidth: 132,
      nodeHeight: 120,
    });
  });

  it('紧凑条不加高，避免误入传统卡片绘制', () => {
    expect(cardSizeForDensity({ nodeWidth: 52, nodeHeight: 36 }, 'TB', 'detailed')).toEqual({
      nodeWidth: 52,
      nodeHeight: 36,
    });
  });
});

describe('card facts', () => {
  it('男子详情行把字辈、排行和生卒接成一行', () => {
    expect(formatDetailLine({
      gender: 'male',
      birthOrder: 2,
      generationWord: '熹',
      years: '1328-1407',
    })).toBe('熹 · 行二｜1328-1407');
  });

  it('没有字辈时只写排行和生卒', () => {
    expect(formatDetailLine({ gender: 'male', birthOrder: 2, years: '1328-1407' })).toBe('行二｜1328-1407');
  });

  it('迁徙和早夭做成小标签', () => {
    expect(collectDetailTags({ migration_to: '婺源', premature: true })).toEqual(['迁婺源', '早夭']);
  });

  it('角标按属性取色，嫡长只给亲生长子', () => {
    const marks = collectCornerMarks({
      gender: 'male',
      birth_order: 1,
      child_type: 'BIOLOGICAL',
      premature: true,
      is_founding_ancestor: true,
    });
    expect(marks.map((mark) => mark.tip)).toEqual(['早夭', '始迁祖', '嫡长']);
    expect(collectCornerMarks({ gender: 'male', birth_order: 1, child_type: 'FOSTER' }).map((mark) => mark.tip))
      .toEqual(['过继']);
  });

  it('全名配偶保持原名，单字姓写成某氏', () => {
    expect(presentSpouseName('陈玉')).toEqual({ text: '陈玉', surnameOnly: false });
    expect(presentSpouseName('陈')).toEqual({ text: '陈氏', surnameOnly: true });
    expect(presentSpouseName('陈氏')).toEqual({ text: '陈氏', surnameOnly: true });
    expect(spouseSurnameHint('陈', '婺源')).toBe('婺源陈氏');
    expect(spouseSurnameHint('陈', '')).toBe('失考');
  });
});

describe('genealogy card text', () => {
  it('1130-1200 在 84px 卡片内宽里放得下，不撑宽外框', () => {
    const years = formatLifeYears(1130, 1200, false);
    expect(years).toBe('1130-1200');
    const size = resolveCardOuterSize({ nodeWidth: 84, nodeHeight: 100 }, years);
    expect(size).toEqual({ width: 84, height: 100 });
    expect(estimateTextWidth(years, 10)).toBeLessThanOrEqual(84 - 16);
  });

  it('超长生卒年会加宽外框，且不超过 1.75 倍', () => {
    const years = '一二三四五六七八九十';
    const size = resolveCardOuterSize({ nodeWidth: 84, nodeHeight: 100 }, years);
    expect(size.width).toBeGreaterThan(84);
    expect(size.width).toBeLessThanOrEqual(Math.round(84 * 1.75));
    expect(size.height).toBe(100);
  });

  it('姓名超出内宽时用省略号，测量宽度不超过 maxWidth', () => {
    const fitted = fitTextLines('朱熹字元晦', 28, 14, 1);
    expect(fitted.endsWith('…')).toBe(true);
    expect(estimateTextWidth(fitted, 14)).toBeLessThanOrEqual(28.01);
  });

  it('两行放得下时不截断', () => {
    const fitted = fitTextLines('朱熹字元晦', 42, 14, 2);
    expect(fitted).not.toContain('…');
    expect(fitted.split('\n').length).toBeGreaterThan(1);
  });
});

describe('resolveSubtreeOverlap AABB', () => {
  it('同代卡片保持 nodeSep，不再叠在一起', () => {
    const nodePositions = new Map<string, NodePosition>([
      ['A', { id: 'A', x: 0, y: 0, width: 80, height: 40 }],
      ['B', { id: 'B', x: 20, y: 0, width: 80, height: 40 }],
    ]);
    const nodeMap = new Map<string, LayoutNode>([
      ['A', person('A', 0, 80, 40)],
      ['B', person('B', 0, 80, 40)],
    ]);
    resolveSubtreeOverlap(
      nodePositions,
      nodeMap,
      new Map(),
      new Map(),
      new Map(),
      16,
    );
    const a = nodePositions.get('A')!;
    const b = nodePositions.get('B')!;
    expect(overlaps(a, b)).toBe(false);
    expect(b.x - b.width / 2).toBeGreaterThanOrEqual(a.x + a.width / 2 + 16 - 0.5);
  });

  it('跨代 AABB 相交时把子树向右推开', () => {
    const nodePositions = new Map<string, NodePosition>([
      ['P', { id: 'P', x: 0, y: 0, width: 80, height: 100 }],
      ['C', { id: 'C', x: 0, y: 70, width: 80, height: 100 }],
    ]);
    const nodeMap = new Map<string, LayoutNode>([
      ['P', person('P', 0)],
      ['C', person('C', 1)],
    ]);
    const childrenByParent = new Map<string, string[]>([['P', ['C']]]);
    resolveSubtreeOverlap(
      nodePositions,
      nodeMap,
      childrenByParent,
      new Map(),
      new Map(),
      16,
    );
    const parent = nodePositions.get('P')!;
    const child = nodePositions.get('C')!;
    expect(overlaps(parent, child)).toBe(false);
    expect(child.x).toBeGreaterThan(parent.x);
  });

  it('相邻两代的旁支卡片相交时分开，夫妻对不被拆开', () => {
    const nodePositions = new Map<string, NodePosition>([
      ['H', { id: 'H', x: 0, y: 0, width: 80, height: 100 }],
      ['W', { id: 'W', x: 96, y: 0, width: 80, height: 100 }],
      ['S', { id: 'S', x: 220, y: 0, width: 80, height: 100 }],
      ['U', { id: 'U', x: 90, y: 70, width: 80, height: 100 }],
    ]);
    const nodeMap = new Map<string, LayoutNode>([
      ['H', person('H', 0)],
      ['W', person('W', -1)],
      ['S', person('S', 0)],
      ['U', person('U', 1)],
    ]);
    const couple: CoupleUnit = {
      mainId: 'H',
      spouseIds: ['W'],
      unitWidth: 176,
      unitRightX: 136,
    };
    const spouseEdges = new Map<string, LayoutEdge[]>([
      ['H', [{ id: 'hw', source: 'H', target: 'W', kind: 'spouse' }]],
    ]);
    resolveSubtreeOverlap(
      nodePositions,
      nodeMap,
      new Map([['S', ['U']]]),
      spouseEdges,
      new Map([['H', couple]]),
      16,
    );
    const husband = nodePositions.get('H')!;
    const wife = nodePositions.get('W')!;
    const uncle = nodePositions.get('U')!;
    expect(wife.x - husband.x).toBeCloseTo(96, 0);
    expect(overlaps(wife, uncle)).toBe(false);
    expect(overlaps(husband, uncle)).toBe(false);
    expect(overlaps(husband, wife)).toBe(false);
  });
});
