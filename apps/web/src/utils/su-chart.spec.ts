import { describe, expect, it } from 'vitest';
import type { EuropeanLinkInput, EuropeanPersonInput } from '@/utils/european-chart';
import {
  buildSuCharts,
  groupSuCharts,
  indexSuAppearances,
  layoutSuPlates,
  nestSuBlocks,
  placeSuChart,
  suAntiqueOverflows,
  SU_ANTIQUE_BEAD_PT,
  SU_ANTIQUE_DIVIDER_PT,
  SU_ANTIQUE_FRAME_SIDE_PT,
  SU_ANTIQUE_FRAME_TOP_PT,
  SU_ANTIQUE_PERSON_RULE_PT,
  suBranchName,
  suFrameWeightPt,
  suGenerationLabel,
  suMaxColumns,
} from '@/utils/su-chart';

function person(id: string, name: string, generation: number, birthOrder?: number): EuropeanPersonInput {
  return { id, name, generation, birthOrder };
}

function link(parentId: string, childId: string, birthOrder: number): EuropeanLinkInput {
  return { parentId, childId, birthOrder };
}

describe('buildSuCharts', () => {
  const people = [
    person('r', '朱熹', 1),
    person('a', '朱塾', 2, 1),
    person('a1', '朱鉴', 3, 1),
    person('a2', '朱钜', 3, 2),
    person('b', '朱埜', 2, 2),
    person('b1', '朱某', 3, 1),
  ];
  const links = [
    link('r', 'a', 1),
    link('r', 'b', 2),
    link('a', 'a1', 1),
    link('a', 'a2', 2),
    link('b', 'b1', 1),
  ];

  it('同父诸子留在同一图，先长房后次房，儿子比父亲深一代', () => {
    const charts = buildSuCharts(people, links, { blocksPerPage: 8 });
    expect(charts).toHaveLength(1);
    expect(charts[0].branchName).toBe('朱熹公支世系');
    expect(charts[0].blocks.map((block) => `${block.name}:${block.depth}`)).toEqual([
      '朱熹:0',
      '朱塾:1',
      '朱鉴:2',
      '朱钜:2',
      '朱埜:1',
      '朱某:2',
    ]);
    expect(charts[0].blocks.every((block) => block.role === 'origin' && !block.branchOff)).toBe(true);
    const nest = nestSuBlocks(charts[0].blocks);
    expect(nest[0].children.map((node) => node.block.name)).toEqual(['朱塾', '朱埜']);
  });

  it('行数放得下就和弟弟并排，不把次房拆成下一图', () => {
    const charts = buildSuCharts(people, links, { blocksPerPage: 3 });
    expect(charts).toHaveLength(1);
    expect(charts[0].blocks.map((block) => block.name)).toEqual(['朱熹', '朱塾', '朱鉴', '朱钜', '朱埜', '朱某']);
  });

  it('一板超出页高时，兄弟仍在本页并排，断点的人接下、下页接上', () => {
    const charts = buildSuCharts(people, links, { blocksPerPage: 2 });
    expect(charts.map((chart) => chart.blocks.map((block) => `${block.name}:${block.role}`))).toEqual([
      ['朱熹:origin', '朱塾:carried-out', '朱埜:carried-out'],
      ['朱塾:carried-in', '朱鉴:origin', '朱钜:origin', '朱埜:carried-in', '朱某:origin'],
    ]);
    expect(charts[1].branchName).toBe('朱塾公支世系');
    expect(charts[1].blocks.filter((block) => block.name === '朱塾' || block.name === '朱埜').map((block) => block.depth)).toEqual([0, 0]);
  });

  it('一支长过一页时，同一人接下并在下页接上', () => {
    const line = ['根', '甲', '乙', '丙', '丁'].map((name, index) => person(name, name, index + 1));
    const edges = line.slice(1).map((node, index) => link(line[index].id, node.id, 1));
    const charts = buildSuCharts(line, edges, { blocksPerPage: 2 });
    expect(charts.map((chart) => chart.blocks.map((block) => `${block.name}:${block.role}`))).toEqual([
      ['根:origin', '甲:carried-out'],
      ['甲:carried-in', '乙:carried-out'],
      ['乙:carried-in', '丙:carried-out'],
      ['丙:carried-in', '丁:origin'],
    ]);
    expect(charts[1].branchName).toBe('甲公支世系');
    expect(charts[1].blocks.map((block) => block.depth)).toEqual([0, 1]);
  });

  it('同父兄弟深度相同，长幼不穿插', () => {
    const charts = buildSuCharts(
      [
        person('根', '根', 1),
        person('甲', '甲', 2, 1),
        person('长孙', '长孙', 3, 1),
        person('次孙', '次孙', 3, 2),
        person('乙', '乙', 3, 3),
        person('丙', '丙', 4, 1),
        person('己', '己', 2, 2),
        person('庚', '庚', 3, 1),
      ],
      [
        link('根', '甲', 1),
        link('甲', '长孙', 1),
        link('甲', '次孙', 2),
        link('甲', '乙', 3),
        link('乙', '丙', 1),
        link('根', '己', 2),
        link('己', '庚', 1),
      ],
      { blocksPerPage: 4 },
    );
    expect(charts).toHaveLength(1);
    const flat = charts[0].blocks;
    expect(flat.find((block) => block.name === '甲')?.depth).toBe(flat.find((block) => block.name === '己')?.depth);
    expect(flat.find((block) => block.name === '长孙')?.depth).toBe(flat.find((block) => block.name === '乙')?.depth);
    const layout = layoutSuPlates(nestSuBlocks(flat));
    const col = (name: string) => layout.slots.find((slot) => slot.personId === name)!.col;
    expect(col('甲')).toBeLessThan(col('己'));
    expect(col('长孙')).not.toBe(col('次孙'));
  });

  it('兄弟深度相同，长幼不穿插', () => {
    const charts = buildSuCharts(
      [person('f', '父', 1), person('c', '次子', 2, 2), person('e', '长子', 2, 1), person('e1', '长孙', 3, 1)],
      [link('f', 'c', 2), link('f', 'e', 1), link('e', 'e1', 1)],
      { blocksPerPage: 8 },
    );
    expect(charts[0].blocks.map((block) => block.name)).toEqual(['父', '长子', '长孙', '次子']);
    expect(charts[0].blocks[1].depth).toBe(charts[0].blocks[3].depth);
  });
});

describe('苏式垂珠样例', () => {
  const names = ['朱熹', '朱塾', '朱鉴', '朱浚', '朱桂', '朱桐宁', '朱塾耀', '朱在明', '朱埜', '朱潜', '朱景', '朱在', '朱鋆'];
  const parentOf = ['', '朱熹', '朱塾', '朱鉴', '朱浚', '朱桂', '朱桂', '朱鉴', '朱熹', '朱埜', '朱潜', '朱熹', '朱在'];
  const people = names.map((name, index) => person(name, name, parentOf[index] ? 2 : 1, index + 1));
  const links = names.slice(1).map((name) => link(parentOf[names.indexOf(name)], name, names.filter((item, index) => parentOf[index] === parentOf[names.indexOf(name)]).indexOf(name) + 1));

  it('宽得下时三子和后裔都在同一图，长房整支先排', () => {
    const charts = buildSuCharts(people, links, { blocksPerPage: 20, maxColumns: 8 });
    expect(charts).toHaveLength(1);
    expect(charts[0].blocks.map((block) => block.name)).toEqual(names);
    expect(charts[0].blocks.map((block) => block.depth)).toEqual([0, 1, 2, 3, 4, 5, 5, 3, 1, 2, 3, 1, 2]);
    const nest = nestSuBlocks(charts[0].blocks);
    expect(nest[0].children.map((node) => node.block.name)).toEqual(['朱塾', '朱埜', '朱在']);
    const layout = layoutSuPlates(nest);
    const slot = (name: string) => layout.slots.find((item) => item.personId === name)!;
    expect(slot('朱塾').row).toBe(slot('朱埜').row);
    expect(slot('朱埜').row).toBe(slot('朱在').row);
    expect(slot('朱塾').col).toBeLessThan(slot('朱埜').col);
    expect(slot('朱埜').col).toBeLessThan(slot('朱在').col);
    expect(slot('朱桐宁').col).not.toBe(slot('朱塾耀').col);
    expect(slot('朱桂').col).toBe(slot('朱桐宁').col);
  });

  it('子板太宽时仍保住同父诸子并排，多出来的支另见图', () => {
    const charts = buildSuCharts(people, links, { blocksPerPage: 20 });
    expect(suMaxColumns()).toBe(4);
    expect(charts[0].blocks.map((block) => block.name)).toEqual([
      '朱熹', '朱塾', '朱鉴', '朱浚', '朱桂', '朱桐宁', '朱在明', '朱埜', '朱潜', '朱景', '朱在', '朱鋆',
    ]);
    expect(charts[0].blocks.find((block) => block.name === '朱桂')?.branchOff).toBe(true);
    expect(charts[1].blocks.map((block) => block.name)).toEqual(['朱塾耀']);
    expect(charts[1].branchName).toBe('朱塾耀公支世系');
    const layout = layoutSuPlates(nestSuBlocks(charts[0].blocks));
    const slot = (name: string) => layout.slots.find((item) => item.personId === name)!;
    expect(slot('朱塾').col).toBeLessThan(slot('朱埜').col);
    expect(slot('朱埜').col).toBeLessThan(slot('朱在').col);
    expect(slot('朱塾').row).toBe(slot('朱在').row);
  });
});

describe('垂珠板', () => {
  const people = [
    person('r', '朱熹', 1),
    person('a', '朱塾', 2, 1),
    person('a1', '朱鉴', 3, 1),
    person('d', '朱浚', 4, 1),
    person('b', '朱埜', 2, 2),
    person('b1', '朱钜', 3, 1),
    person('c', '朱在', 2, 3),
    person('c1', '朱铉', 3, 1),
  ];
  const links = [
    link('r', 'a', 1),
    link('a', 'a1', 1),
    link('a1', 'd', 1),
    link('r', 'b', 2),
    link('b', 'b1', 1),
    link('r', 'c', 3),
    link('c', 'c1', 1),
  ];

  it('朱熹三子各占一板，长子在最前，父线落在长子板上', () => {
    const layout = layoutSuPlates(nestSuBlocks(buildSuCharts(people, links, { blocksPerPage: 20 })[0].blocks));
    const slot = (id: string) => layout.slots.find((item) => item.personId === id)!;
    expect(layout.columns).toBe(3);
    expect(slot('r').col).toBe(0);
    expect(slot('a').col).toBe(0);
    expect(slot('a1').col).toBe(0);
    expect(slot('d').col).toBe(0);
    expect(slot('b').col).toBe(1);
    expect(slot('b1').col).toBe(1);
    expect(slot('c').col).toBe(2);
    expect(slot('c1').col).toBe(2);
    expect(slot('a').row).toBe(slot('b').row);
    expect(slot('b').row).toBe(slot('c').row);
    expect(slot('a1').row).toBe(slot('b1').row);
  });

  it('独子和父亲同一条竖线，兄弟才拉横线，长房左右随版本对调', () => {
    const roots = nestSuBlocks(buildSuCharts(people, links, { blocksPerPage: 20 })[0].blocks);
    const modern = placeSuChart(roots, 'horizontal');
    const antique = placeSuChart(roots, 'antique');
    const at = (place: ReturnType<typeof placeSuChart>, id: string) => place.people.find((item) => item.personId === id)!;
    expect(at(modern, 'a').beadX).toBe(at(modern, 'a1').beadX);
    expect(at(modern, 'a1').beadY).toBeGreaterThan(at(modern, 'a').beadY);
    expect(at(modern, 'a').textX).toBeGreaterThan(at(modern, 'a').beadX);
    expect(at(modern, 'a').beadX).toBeLessThan(at(modern, 'b').beadX);
    expect(at(modern, 'b').beadX).toBeLessThan(at(modern, 'c').beadX);
    expect(at(antique, 'a').textX + at(antique, 'a').textW).toBeLessThan(at(antique, 'a').beadX);
    expect(at(antique, 'a').beadX).toBeGreaterThan(at(antique, 'b').beadX);
    expect(at(antique, 'b').beadX).toBeGreaterThan(at(antique, 'c').beadX);
    const bars = modern.lines.filter((rule) => rule.axis === 'h' && rule.parentId === 'r');
    expect(bars).toHaveLength(1);
    expect(bars[0].length).toBeGreaterThan(0);
    expect(at(modern, 'a').beadY).toBe(bars[0].y);
    expect(at(modern, 'b').beadY).toBe(bars[0].y);
    expect(at(modern, 'c').beadY).toBe(bars[0].y);
    expect(at(modern, 'a').beadX).toBe(bars[0].x);
    expect(at(modern, 'c').beadX).toBeCloseTo(bars[0].x + bars[0].length, 5);
    const trunk = modern.lines.find((rule) => rule.axis === 'v' && rule.parentId === 'r');
    expect(trunk?.x).toBe(at(modern, 'r').beadX);
    expect(trunk?.y).toBe(at(modern, 'r').beadY);
    expect(trunk && Math.round((trunk.y + trunk.length) * 100) / 100).toBe(at(modern, 'a').beadY);
    expect(at(modern, 'a').textY).toBeGreaterThan(at(modern, 'a').beadY + 1.2);
    expect(at(modern, 'a').textX).toBeGreaterThan(at(modern, 'a').beadX + 1.2);
    const eldest = modern.lines.filter((rule) => rule.parentId === 'a');
    expect(eldest.every((rule) => rule.axis === 'v')).toBe(true);
    expect(modern.reading).toBe('ltr');
    expect(antique.reading).toBe('rtl');
    expect(antique.lines.every((rule) => rule.axis === 'v')).toBe(true);
    expect(antique.railX).not.toBeNull();
    const antiqueBar = antique.lines.find((rule) => rule.parentId === 'r');
    expect(antiqueBar).toBeTruthy();
    expect(antiqueBar?.x).toBe(at(antique, 'r').beadX);
    expect(antiqueBar?.x).toBe(at(antique, 'a').beadX);
    expect(antiqueBar?.y).toBe(at(antique, 'r').beadY);
    expect(Math.round(((antiqueBar?.y ?? 0) + (antiqueBar?.length ?? 0)) * 100) / 100).toBe(at(antique, 'a').beadY);
    expect(at(antique, 'b').beadX).not.toBe(at(antique, 'r').beadX);
    expect(suAntiqueOverflows(antique)).toEqual([]);
  });

  it('版本A每个珠心都落在父子连线上，文字让开珠圈', () => {
    const place = placeSuChart(nestSuBlocks(buildSuCharts(people, links, { blocksPerPage: 20 })[0].blocks), 'horizontal');
    const onLine = (x: number, y: number) => place.lines.some((rule) => (
      rule.axis === 'v'
        ? x === rule.x && y >= rule.y - 0.01 && y <= rule.y + rule.length + 0.01
        : y === rule.y && x >= rule.x - 0.01 && x <= rule.x + rule.length + 0.01
    ));
    for (const person of place.people) {
      expect(onLine(person.beadX, person.beadY), person.personId).toBe(true);
      expect(person.textY).toBeGreaterThan(person.beadY + 1.2);
      expect(person.textX).toBeGreaterThan(person.beadX + 1.2);
    }
    expect(place.beads).toHaveLength(place.people.length);
  });

  it('版框线宽只接受规定档位', () => {
    expect(suFrameWeightPt(undefined)).toBe(4);
    expect(suFrameWeightPt('4')).toBe(4);
    expect(suFrameWeightPt(10)).toBe(10);
    expect(suFrameWeightPt(0.8)).toBe(4);
    expect(suFrameWeightPt(3)).toBe(4);
  });

  it('世代栏：简体用数字，仿古用汉字，珠心落在垂线上且收在版心内', () => {
    expect(suGenerationLabel(7, 'horizontal')).toBe('7世');
    expect(suGenerationLabel(7, 'antique')).toBe('七世');
    expect(suGenerationLabel(10, 'antique')).toBe('十世');
    expect(suGenerationLabel(23, 'antique')).toBe('二十三世');
    expect(SU_ANTIQUE_FRAME_TOP_PT / SU_ANTIQUE_FRAME_SIDE_PT).toBe(2);
    const roots = nestSuBlocks(buildSuCharts(people, links, { blocksPerPage: 20 })[0].blocks);
    const place = placeSuChart(roots, 'antique');
    expect(place.generations.map((band) => band.label)).toEqual(['一世', '二世', '三世', '四世']);
    expect(place.generations.every((band) => band.boxed && band.w === 4.2)).toBe(true);
    expect(place.rails && place.generations.every((band) => band.x > place.rails!.left && band.x + band.w < place.rails!.right)).toBe(true);
    expect(place.underlines).toHaveLength(place.people.length);
    expect(place.bands).toHaveLength(0);
    expect(SU_ANTIQUE_FRAME_TOP_PT).toBe(4);
    expect(SU_ANTIQUE_FRAME_SIDE_PT).toBe(2);
    expect(SU_ANTIQUE_DIVIDER_PT).toBe(1);
    expect(SU_ANTIQUE_BEAD_PT).toBe(1);
    expect(SU_ANTIQUE_PERSON_RULE_PT).toBe(0.5);
    expect(place.bands).toHaveLength(0);
    expect(place.lines.every((rule) => rule.axis === 'v')).toBe(true);
    const head = place.people.find((item) => item.personId === 'r');
    const band = place.generations.find((item) => item.row === 0);
    expect(head && band && head.beadY).toBeGreaterThanOrEqual(band.y);
    expect(head && band && head.beadY).toBeLessThanOrEqual(band.y + band.h);
    for (const bead of place.beads) {
      const onLine = place.lines.some((rule) => (
        rule.axis === 'v'
        && Math.abs(rule.x - bead.x) < 0.02
        && bead.y >= rule.y - 0.02
        && bead.y <= rule.y + rule.length + 0.02
      ));
      expect(onLine, bead.personId).toBe(true);
    }
    const long = placeSuChart(roots, 'antique', roots.flatMap(function walk(node): { index: number; chars: number }[] {
      return [{ index: node.index, chars: 96 }, ...node.children.flatMap(walk)];
    }));
    expect(long.people.every((person) => person.textScale < 1)).toBe(true);
    expect(suAntiqueOverflows(place)).toEqual([]);
    expect(suAntiqueOverflows(long)).toEqual([]);
  });
});

describe('垂珠分页', () => {
  it('长房再长，弟弟也和长子同一横行', () => {
    const chain = ['长子', '孙', '曾孙', '玄孙', '来孙'];
    const people = [
      person('f', '父', 1),
      ...chain.map((name, index) => person(name, name, index + 2)),
      person('次子', '次子', 2, 2),
    ];
    const links = [
      link('f', '长子', 1),
      link('长子', '孙', 1),
      link('孙', '曾孙', 1),
      link('曾孙', '玄孙', 1),
      link('玄孙', '来孙', 1),
      link('f', '次子', 2),
    ];
    const charts = buildSuCharts(people, links, { blocksPerPage: 4 });
    const first = charts[0];
    expect(first.blocks.some((block) => block.name === '长子')).toBe(true);
    expect(first.blocks.some((block) => block.name === '次子')).toBe(true);
    expect(first.blocks.find((block) => block.name === '长子')?.depth).toBe(first.blocks.find((block) => block.name === '次子')?.depth);
    const layout = layoutSuPlates(nestSuBlocks(first.blocks));
    const slot = (name: string) => layout.slots.find((item) => item.personId === name)!;
    expect(slot('长子').col).not.toBe(slot('次子').col);
    expect(slot('长子').row).toBe(slot('次子').row);
    const place = placeSuChart(nestSuBlocks(first.blocks), 'horizontal');
    expect(place.lines.some((rule) => rule.parentId === 'f' && rule.axis === 'h')).toBe(true);
  });

  it('子息超过板宽时，先并排放得下的，其余另见图', () => {
    const sons = Array.from({ length: 6 }, (_, index) => person(`s${index}`, `子${index + 1}`, 2, index + 1));
    const charts = buildSuCharts(
      [person('f', '父', 1), ...sons, person('u', '叔', 2, 7), person('c', '侄', 3, 1)],
      [
        ...sons.map((son, index) => link('f', son.id, index + 1)),
        link('f', 'u', 7),
        link('u', 'c', 1),
      ],
      { blocksPerPage: 20 },
    );
    expect(charts[0].blocks.map((block) => block.name)).toEqual(['父', '子1', '子2', '子3', '子4']);
    expect(charts[0].blocks[0].branchOff).toBe(true);
    expect(charts[1].blocks.map((block) => block.name)).toEqual(['子5', '子6', '叔', '侄']);
    const second = layoutSuPlates(nestSuBlocks(charts[1].blocks));
    const slot = (id: string) => second.slots.find((item) => item.personId === id)!;
    expect(slot('s4').col).not.toBe(slot('s5').col);
    expect(slot('s5').col).not.toBe(slot('u').col);
    expect(slot('s4').row).toBe(slot('u').row);
    expect(slot('u').col).toBe(slot('c').col);
    const mark = placeSuChart(nestSuBlocks(charts[0].blocks), 'horizontal').seams.find((seam) => seam.kind === 'off');
    expect(mark?.personId).toBe('f');
    expect(charts[0].blocks[0].cutChartNos).toEqual([2]);
    expect(charts[1].blocks[0].resumeChartNo).toBe(1);
    expect(charts[1].blocks[0].resumeFatherName).toBe('父');
  });

  it('分页断开后只连本页父子，不把线伸到下一页', () => {
    const line = ['根', '甲', '乙', '丙', '丁'].map((name, index) => person(name, name, index + 1));
    const edges = line.slice(1).map((node, index) => link(line[index].id, node.id, 1));
    const charts = buildSuCharts(line, edges, { blocksPerPage: 2 });
    const first = nestSuBlocks(charts[0].blocks);
    expect(first.map((node) => node.block.name)).toEqual(['根']);
    expect(first[0].children.map((node) => node.block.name)).toEqual(['甲']);
    expect(first[0].children[0].children).toEqual([]);
    const second = nestSuBlocks(charts[1].blocks);
    expect(second.map((node) => node.block.name)).toEqual(['甲']);
    expect(second[0].children.map((node) => node.block.name)).toEqual(['乙']);
    expect(second[0].block.role).toBe('carried-in');
  });
});

describe('groupSuCharts', () => {
  it('同页排布短图时按世代行数合并，独占一页则一图一页', () => {
    const line = ['根', '甲', '乙'].map((name, index) => person(name, name, index + 1));
    const charts = buildSuCharts(
      line,
      [link('根', '甲', 1), link('甲', '乙', 1)],
      { blocksPerPage: 2 },
    );
    expect(charts).toHaveLength(2);
    expect(groupSuCharts(charts, 'exclusive', 2)).toHaveLength(charts.length);
    expect(groupSuCharts(charts, 'share', 4)).toHaveLength(1);
    expect(groupSuCharts(charts, 'share', 2)).toHaveLength(2);
  });
});

describe('indexSuAppearances', () => {
  it('正文图号取第一次出现，接上的重复头人不另起', () => {
    const line = ['根', '甲', '乙', '丙', '丁'].map((name, index) => person(name, name, index + 1));
    const edges = line.slice(1).map((node, index) => link(line[index].id, node.id, 1));
    const charts = buildSuCharts(line, edges, { blocksPerPage: 2 });
    const map = indexSuAppearances(charts);
    expect(map.get('甲')).toEqual({ chartNo: 1, chartNos: [1] });
    expect(map.get('乙')?.chartNo).toBe(2);
  });
});

describe('suBranchName', () => {
  it('名字末尾已有公时不重复', () => {
    expect(suBranchName('朱熹')).toBe('朱熹公支世系');
    expect(suBranchName('乐善公')).toBe('乐善公支世系');
  });
});
