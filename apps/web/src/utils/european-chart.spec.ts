/**
 * 欧谱排表。只验纯函数：五世切表、行跨累加、配偶不占行。
 */
import { describe, expect, it } from 'vitest';
import {
  buildEuropeanCharts,
  fitEuropeanChartsToPages,
  type EuropeanCell,
  type EuropeanChart,
  type EuropeanLinkInput,
  type EuropeanPersonInput,
} from '@/utils/european-chart';

function cell(chart: EuropeanChart, personId: string): EuropeanCell {
  const found = chart.cells.find((item) => item.personId === personId);
  expect(found, personId).toBeTruthy();
  return found!;
}

/** 同一列里格子的行区间不能叠在一起。 */
function expectNoColumnOverlap(chart: EuropeanChart) {
  const byCol = new Map<number, EuropeanCell[]>();
  for (const item of chart.cells) {
    const list = byCol.get(item.col) ?? [];
    list.push(item);
    byCol.set(item.col, list);
  }
  for (const list of byCol.values()) {
    const sorted = [...list].sort((a, b) => a.row - b.row);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].row).toBeGreaterThanOrEqual(sorted[i - 1].row + sorted[i - 1].rowSpan);
    }
  }
}

function layoutSignature(charts: EuropeanChart[]) {
  return charts.map((chart) => chart.cells.map((item) => ({
    personId: item.personId,
    col: item.col,
    row: item.row,
    rowSpan: item.rowSpan,
    role: item.role,
  })));
}

describe('欧谱排表 buildEuropeanCharts', () => {
  it('单传 7 代切成两张表，第 5 代在第二张表是 carried-in', () => {
    const people: EuropeanPersonInput[] = Array.from({ length: 7 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `第${index + 1}世`,
      generation: index + 1,
    }));
    const links: EuropeanLinkInput[] = Array.from({ length: 6 }, (_, index) => ({
      parentId: `p${index + 1}`,
      childId: `p${index + 2}`,
    }));

    const charts = buildEuropeanCharts(people, links);

    expect(charts).toHaveLength(2);
    expect(charts[0]).toMatchObject({ index: 0, generationFrom: 1, generationTo: 5, rowCount: 1 });
    expect(charts[1]).toMatchObject({ index: 1, generationFrom: 5, generationTo: 7, rowCount: 1 });
    expect(charts[0].cells.map((item) => item.personId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(charts[1].cells.map((item) => item.personId)).toEqual(['p5', 'p6', 'p7']);

    const seamOnFirst = cell(charts[0], 'p5');
    const seamOnSecond = cell(charts[1], 'p5');
    expect(seamOnFirst).toMatchObject({ col: 4, row: 0, rowSpan: 1, role: 'carried-out' });
    expect(seamOnSecond).toMatchObject({ col: 0, row: 0, rowSpan: 1, role: 'carried-in', personId: 'p5' });
    expect(seamOnFirst.personId).toBe(seamOnSecond.personId);
    expect(cell(charts[1], 'p6').role).toBe('origin');
    expect(cell(charts[1], 'p7')).toMatchObject({ col: 2, role: 'origin' });
    expect(charts[0].cells.every((item) => item.rowSpan === 1)).toBe(true);
    charts.forEach(expectNoColumnOverlap);

    const inferred = buildEuropeanCharts(
      people.map(({ generation: _generation, ...person }) => person),
      links,
    );
    expect(inferred.map((chart) => [chart.generationFrom, chart.generationTo])).toEqual([
      [1, 5],
      [5, 7],
    ]);
    expect(inferred[1].cells[0]).toMatchObject({ personId: 'p5', role: 'carried-in' });
  });

  it('三个儿子各有子女时，父亲行跨等于孙子人数', () => {
    const childCounts = [1, 2, 2];
    const people: EuropeanPersonInput[] = [
      { id: 'f', name: '父', generation: 1 },
    ];
    const links: EuropeanLinkInput[] = [];
    childCounts.forEach((count, sonIndex) => {
      const sonId = `s${sonIndex + 1}`;
      people.push({ id: sonId, name: `子${sonIndex + 1}`, generation: 2 });
      links.push({ parentId: 'f', childId: sonId, birthOrder: sonIndex + 1 });
      for (let kid = 0; kid < count; kid += 1) {
        const kidId = `${sonId}-k${kid + 1}`;
        people.push({ id: kidId, name: `孙${sonIndex + 1}-${kid + 1}`, generation: 3 });
        links.push({ parentId: sonId, childId: kidId, birthOrder: kid + 1 });
      }
    });
    links.reverse();

    const charts = buildEuropeanCharts(people, links);
    const grandchildren = childCounts.reduce((sum, count) => sum + count, 0);

    expect(charts).toHaveLength(1);
    expect(charts[0]).toMatchObject({ generationFrom: 1, generationTo: 3 });
    const father = cell(charts[0], 'f');
    expect(father.rowSpan).toBe(grandchildren);
    expect(father.rowSpan).toBeGreaterThanOrEqual(3);

    const sons = [1, 2, 3].map((index) => cell(charts[0], `s${index}`));
    expect(sons.map((son) => son.rowSpan)).toEqual(childCounts);
    expect(sons.reduce((sum, son) => sum + son.rowSpan, 0)).toBe(father.rowSpan);
    expect(sons.map((son) => son.row)).toEqual([0, 1, 3]);
    expect(sons.map((son) => son.col)).toEqual([1, 1, 1]);
    expect(charts[0].cells.filter((item) => item.col === 2)).toHaveLength(grandchildren);
    expectNoColumnOverlap(charts[0]);
  });

  it('配偶和过继写进格子，不增加行跨', () => {
    const people: EuropeanPersonInput[] = [
      {
        id: 'f',
        name: '父',
        generation: 1,
        spouses: [
          { name: '李氏', marriageOrder: 2 },
          { name: '王氏', marriageOrder: 1 },
          { name: '   ', marriageOrder: 3 },
        ],
      },
      { id: 'a', name: '长子', generation: 2 },
      { id: 'b', name: '次子', generation: 2 },
    ];
    const links: EuropeanLinkInput[] = [
      { parentId: 'f', childId: 'a', birthOrder: 1, childType: 'BIOLOGICAL' },
      { parentId: 'f', childId: 'b', birthOrder: 2, childType: 'ADOPTED' },
    ];

    const charts = buildEuropeanCharts(people, links);
    const plain = buildEuropeanCharts(
      people.map(({ spouses: _spouses, ...person }) => person),
      links,
    );

    expect(charts).toHaveLength(1);
    expect(charts[0].cells).toHaveLength(3);
    expect(charts[0].rowCount).toBe(2);
    const father = cell(charts[0], 'f');
    expect(father.spouseText).toBe('配王氏、继配李氏');
    expect(father.rowSpan).toBe(2);
    expect(father.mark).toBe('');
    expect(cell(charts[0], 'a')).toMatchObject({ rowSpan: 1, mark: '', spouseText: '' });
    expect(cell(charts[0], 'b')).toMatchObject({ rowSpan: 1, mark: '过继', spouseText: '' });
    expect(charts[0].cells.some((item) => item.name.includes('王氏') || item.personId === '王氏')).toBe(false);
    expect(layoutSignature(charts)).toEqual(layoutSignature(plain));
    expectNoColumnOverlap(charts[0]);
  });

  it('一百个兄弟行跨累加，不崩溃', () => {
    const people: EuropeanPersonInput[] = [{ id: 'f', name: '父', generation: 1 }];
    const links: EuropeanLinkInput[] = [];
    for (let order = 100; order >= 1; order -= 1) {
      people.push({ id: `b${order}`, name: `兄弟${order}`, generation: 2 });
      links.push({ parentId: 'f', childId: `b${order}`, birthOrder: order });
    }

    const started = performance.now();
    const charts = buildEuropeanCharts(people, links);
    const elapsed = performance.now() - started;

    // eslint-disable-next-line no-console
    console.log(`[european-chart] 100 brothers elapsed=${elapsed.toFixed(1)}ms rows=${charts[0]?.rowCount ?? 0}`);

    expect(elapsed).toBeLessThan(1000);
    expect(charts).toHaveLength(1);
    expect(charts[0].cells).toHaveLength(101);
    expect(charts[0].rowCount).toBe(100);
    const father = cell(charts[0], 'f');
    expect(father).toMatchObject({ col: 0, row: 0, rowSpan: 100 });

    const brothers = charts[0].cells.filter((item) => item.col === 1);
    expect(brothers).toHaveLength(100);
    expect(brothers.map((item) => item.personId)).toEqual(
      Array.from({ length: 100 }, (_, index) => `b${index + 1}`),
    );
    expect(brothers.map((item) => item.row)).toEqual(
      Array.from({ length: 100 }, (_, index) => index),
    );
    expect(brothers.reduce((sum, item) => sum + item.rowSpan, 0)).toBe(father.rowSpan);
    expectNoColumnOverlap(charts[0]);
  });

  it('落到下一图的子女只按 1 计，不把下一图的行跨加回本图', () => {
    const people: EuropeanPersonInput[] = Array.from({ length: 5 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `第${index + 1}世`,
      generation: index + 1,
    }));
    const links: EuropeanLinkInput[] = Array.from({ length: 4 }, (_, index) => ({
      parentId: `p${index + 1}`,
      childId: `p${index + 2}`,
    }));
    for (let son = 1; son <= 3; son += 1) {
      const sonId = `c${son}`;
      people.push({ id: sonId, name: `六世${son}`, generation: 6 });
      links.push({ parentId: 'p5', childId: sonId, birthOrder: son });
      for (const side of ['a', 'b']) {
        const kidId = `${sonId}${side}`;
        people.push({ id: kidId, name: `七世${son}${side}`, generation: 7 });
        links.push({ parentId: sonId, childId: kidId, birthOrder: side === 'a' ? 1 : 2 });
      }
    }

    const charts = buildEuropeanCharts(people, links);

    expect(charts.map((chart) => [chart.generationFrom, chart.generationTo])).toEqual([
      [1, 5],
      [5, 7],
    ]);
    expect(cell(charts[0], 'p5')).toMatchObject({ col: 4, rowSpan: 3, role: 'carried-out' });
    expect(charts[0].cells.some((item) => item.personId.startsWith('c'))).toBe(false);
    const carried = cell(charts[1], 'p5');
    expect(carried).toMatchObject({ role: 'carried-in', col: 0, rowSpan: 6 });
    expect(carried.personId).toBe(cell(charts[0], 'p5').personId);
    expect([1, 2, 3].map((son) => cell(charts[1], `c${son}`).rowSpan)).toEqual([2, 2, 2]);
    expect([1, 2, 3].map((son) => cell(charts[1], `c${son}`).row)).toEqual([0, 2, 4]);
    charts.forEach(expectNoColumnOverlap);
  });

  it('窗口内跳代的子女，父亲只加 1 行', () => {
    const people: EuropeanPersonInput[] = [
      { id: 'p', name: '父', generation: 1 },
      { id: 'c', name: '跳代子', generation: 3 },
      { id: 'k1', name: '甲', generation: 4 },
      { id: 'k2', name: '乙', generation: 4 },
    ];
    const links: EuropeanLinkInput[] = [
      { parentId: 'p', childId: 'c' },
      { parentId: 'c', childId: 'k2', birthOrder: 2 },
      { parentId: 'c', childId: 'k1', birthOrder: 1 },
    ];

    const charts = buildEuropeanCharts(people, links);

    expect(charts).toHaveLength(1);
    expect(charts[0]).toMatchObject({ generationFrom: 1, generationTo: 4 });
    expect(cell(charts[0], 'p')).toMatchObject({ col: 0, row: 0, rowSpan: 1 });
    expect(cell(charts[0], 'c')).toMatchObject({ col: 2, row: 0, rowSpan: 2 });
    expect(cell(charts[0], 'k1')).toMatchObject({ col: 3, row: 0, rowSpan: 1 });
    expect(cell(charts[0], 'k2')).toMatchObject({ col: 3, row: 1, rowSpan: 1 });
    expect(charts[0].cells.some((item) => item.col === 1)).toBe(false);
    expectNoColumnOverlap(charts[0]);
  });
});

describe('fitEuropeanChartsToPages', () => {
  it('行数超出一页时按支系另起新图，父格只盖住本页的儿子', () => {
    const people: EuropeanPersonInput[] = [
      { id: 'f', name: '父', generation: 1 },
      { id: 'a', name: '长', generation: 2, birthOrder: 1 },
      { id: 'b', name: '次', generation: 2, birthOrder: 2 },
      { id: 'c', name: '三', generation: 2, birthOrder: 3 },
    ];
    const links: EuropeanLinkInput[] = [
      { parentId: 'f', childId: 'a', birthOrder: 1 },
      { parentId: 'f', childId: 'b', birthOrder: 2 },
      { parentId: 'f', childId: 'c', birthOrder: 3 },
    ];
    for (const son of ['a', 'b', 'c']) {
      for (let index = 1; index <= 3; index += 1) {
        const id = `${son}${index}`;
        people.push({ id, name: id, generation: 3, birthOrder: index });
        links.push({ parentId: son, childId: id, birthOrder: index });
      }
    }

    const source = buildEuropeanCharts(people, links);
    expect(source).toHaveLength(1);
    expect(cell(source[0], 'f').rowSpan).toBe(9);

    const pages = fitEuropeanChartsToPages(source, 4);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((chart) => chart.rowCount <= 4)).toBe(true);
    expect(pages.map((chart) => chart.index)).toEqual(pages.map((_, index) => index));
    expect(pages.every((chart) => chart.generationFrom === 1 && chart.generationTo === 3)).toBe(true);

    const fatherSpans = pages.map((chart) => cell(chart, 'f').rowSpan);
    expect(fatherSpans.reduce((sum, span) => sum + span, 0)).toBe(9);
    for (const chart of pages) {
      const father = cell(chart, 'f');
      const sons = chart.cells.filter((item) => item.col === 1);
      const sonSpan = sons.reduce((sum, item) => sum + item.rowSpan, 0);
      expect(father.rowSpan).toBe(sonSpan);
      expect(father.row).toBe(0);
      expectNoColumnOverlap(chart);
    }
    expect(pages.flatMap((chart) => chart.cells.filter((item) => item.col === 2)).map((item) => item.personId).sort())
      .toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3']);
  });
});
