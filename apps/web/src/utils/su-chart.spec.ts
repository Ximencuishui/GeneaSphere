import { describe, expect, it } from 'vitest';
import type { EuropeanLinkInput, EuropeanPersonInput } from '@/utils/european-chart';
import { buildSuCharts, groupSuCharts, indexSuAppearances, layoutSuPlates, nestSuBlocks, placeSuChart, suBranchName, suGenerationLabel } from '@/utils/su-chart';

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

  it('先排完长房再排次房，儿子比父亲深一代', () => {
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
    expect(charts[0].blocks.every((block) => block.role === 'origin')).toBe(true);
  });

  it('放得下一整支就留在本页，放不下才整支另起，不在房支中间接下', () => {
    const fitted = buildSuCharts(people, links, { blocksPerPage: 4 });
    expect(fitted.map((chart) => chart.blocks.map((block) => block.personId))).toEqual([
      ['r', 'a', 'a1', 'a2'],
      ['b', 'b1'],
    ]);
    const moved = buildSuCharts(people, links, { blocksPerPage: 3 });
    expect(moved.map((chart) => chart.blocks.map((block) => block.personId))).toEqual([
      ['r'],
      ['a', 'a1', 'a2'],
      ['b', 'b1'],
    ]);
    expect(moved[1].branchName).toBe('朱塾公支世系');
    expect(moved.flatMap((chart) => chart.blocks).every((block) => block.role === 'origin')).toBe(true);
  });

  it('一支长过一页时，同一人接下并在下页接上，已排过的子孙不重复', () => {
    const line = ['根', '甲', '乙', '丙', '丁'].map((name, index) => person(name, name, index + 1));
    const edges = line.slice(1).map((node, index) => link(line[index].id, node.id, 1));
    const charts = buildSuCharts(line, edges, { blocksPerPage: 2 });
    expect(charts.map((chart) => chart.blocks.map((block) => `${block.name}:${block.role}`))).toEqual([
      ['根:origin', '甲:carried-out'],
      ['甲:carried-in', '乙:origin'],
      ['丙:origin', '丁:origin'],
    ]);
    expect(charts[1].branchName).toBe('甲公支世系');
    expect(charts[1].blocks.map((block) => block.depth)).toEqual([0, 1]);
    expect(charts[1].blocks.map((block) => block.name)).not.toContain('根');
    expect(charts[2].blocks.map((block) => block.name)).not.toContain('甲');
  });

  it('页内较浅的一支不跟深支压成同一级', () => {
    const people = [
      person('根', '根', 1),
      person('甲', '甲', 2, 1),
      person('长孙', '长孙', 3, 1),
      person('次孙', '次孙', 3, 2),
      person('乙', '乙', 3, 3),
      person('丙', '丙', 4, 1),
      person('己', '己', 2, 2),
      person('庚', '庚', 3, 1),
    ];
    const links = [
      link('根', '甲', 1),
      link('甲', '长孙', 1),
      link('甲', '次孙', 2),
      link('甲', '乙', 3),
      link('乙', '丙', 1),
      link('根', '己', 2),
      link('己', '庚', 1),
    ];
    const charts = buildSuCharts(people, links, { blocksPerPage: 4 });
    const page = charts.find((chart) => chart.blocks.some((block) => block.name === '己'));
    expect(page?.blocks.map((block) => `${block.name}:${block.depth}`)).toEqual(['乙:2', '丙:3', '己:1', '庚:2']);
    const flat = charts.flatMap((chart) => chart.blocks);
    expect(flat.find((block) => block.name === '甲')?.depth).toBe(flat.find((block) => block.name === '己')?.depth);
    expect(flat.find((block) => block.name === '长孙')?.depth).toBe(flat.find((block) => block.name === '乙')?.depth);
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

  it('先排完长房整支，再排弟弟，同父兄弟深度相同', () => {
    const charts = buildSuCharts(people, links, { blocksPerPage: 20 });
    expect(charts).toHaveLength(1);
    expect(charts[0].blocks.map((block) => block.name)).toEqual(names);
    expect(charts[0].blocks.map((block) => block.depth)).toEqual([0, 1, 2, 3, 4, 5, 5, 3, 1, 2, 3, 1, 2]);
    expect(charts[0].blocks[5].depth).toBe(charts[0].blocks[6].depth);
    expect(charts[0].blocks[3].depth).toBe(charts[0].blocks[7].depth);
  });

  it('换页后仍先排完长房，朱塾、朱埜、朱在深度相同', () => {
    const charts = buildSuCharts(people, links, { blocksPerPage: 4 });
    const flat = charts.flatMap((chart) => chart.blocks);
    const names = flat.map((block) => block.name);
    expect(names.lastIndexOf('朱塾耀')).toBeLessThan(names.indexOf('朱在明'));
    expect(names.indexOf('朱在明')).toBeLessThan(names.indexOf('朱埜'));
    expect(names.indexOf('朱景')).toBeLessThan(names.indexOf('朱在'));
    const depths = ['朱塾', '朱埜', '朱在'].map((name) => flat.find((block) => block.name === name)?.depth);
    expect(depths).toEqual([1, 1, 1]);
    expect(flat.find((block) => block.name === '朱浚')?.depth).toBe(flat.find((block) => block.name === '朱在明')?.depth);
  });

  it('朱熹三子跨度大，只略去他这一组；短支仍保留垂珠', () => {
    const nest = nestSuBlocks(buildSuCharts(people, links, { blocksPerPage: 20 })[0].blocks);
    const root = nest[0];
    expect(root.omitBeads).toBe(true);
    expect(root.children.map((node) => node.block.name)).toEqual(['朱塾', '朱埜', '朱在']);
    expect(root.children[0].omitBeads).toBe(false);
    const jian = root.children[0].children[0];
    expect(jian.block.name).toBe('朱鉴');
    expect(jian.omitBeads).toBe(false);
    expect(jian.children.map((node) => node.block.name)).toEqual(['朱浚', '朱在明']);
  });
});

describe('垂珠板', () => {
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

  it('长子整支先占列，父线落在长子列上，次子排在外侧', () => {
    const layout = layoutSuPlates(nestSuBlocks(buildSuCharts(people, links, { blocksPerPage: 20 })[0].blocks));
    const slot = (id: string) => layout.slots.find((item) => item.personId === id)!;
    expect(slot('r').col).toBe(0);
    expect(slot('a').col).toBe(0);
    expect(slot('a1').col).toBe(0);
    expect(slot('a2').col).toBe(1);
    expect(slot('a').colTo).toBe(1);
    expect(slot('b').col).toBe(2);
    expect(slot('b1').col).toBe(2);
    expect(slot('a').colTo).toBeLessThan(slot('b').col);
  });

  it('独子和父亲同一条竖线，兄弟才拉横线', () => {
    const roots = nestSuBlocks(buildSuCharts(people, links, { blocksPerPage: 20 })[0].blocks);
    const modern = placeSuChart(roots, 'horizontal');
    const antique = placeSuChart(roots, 'antique');
    const at = (place: ReturnType<typeof placeSuChart>, id: string) => place.people.find((item) => item.personId === id)!;
    expect(at(modern, 'a').beadX).toBe(at(modern, 'a1').beadX);
    expect(at(modern, 'a1').beadY).toBeGreaterThan(at(modern, 'a').beadY);
    expect(at(modern, 'a1').textX).toBeGreaterThan(at(modern, 'a1').beadX);
    expect(at(modern, 'a1').beadX).toBeLessThan(at(modern, 'a2').beadX);
    expect(at(antique, 'a1').textX + at(antique, 'a1').textW).toBeLessThan(at(antique, 'a1').beadX);
    expect(at(antique, 'a1').beadX).toBeGreaterThan(at(antique, 'a2').beadX);
    const bars = modern.lines.filter((rule) => rule.axis === 'h' && rule.parentId === 'a');
    expect(bars).toHaveLength(1);
    expect(bars[0].length).toBeGreaterThan(0);
    const straight = modern.lines.filter((rule) => rule.parentId === 'b');
    expect(straight.every((rule) => rule.axis === 'v')).toBe(true);
    expect(modern.beads.map((bead) => bead.personId).sort()).toEqual(['a', 'a1', 'a2', 'b', 'b1', 'r']);
  });

  it('世代栏：简体用数字，仿古用汉字', () => {
    expect(suGenerationLabel(7, 'horizontal')).toBe('7世');
    expect(suGenerationLabel(7, 'antique')).toBe('七世');
    expect(suGenerationLabel(10, 'antique')).toBe('十世');
    expect(suGenerationLabel(23, 'antique')).toBe('二十三世');
    const place = placeSuChart(nestSuBlocks(buildSuCharts(people, links, { blocksPerPage: 20 })[0].blocks), 'antique');
    expect(place.generations.map((band) => band.label)).toEqual(['一世', '二世', '三世']);
    expect(place.generations.every((band) => band.boxed)).toBe(true);
    expect(place.bands.length).toBe(2);
  });
});

describe('垂珠降级与分页', () => {

  it('兄弟纵深差过大时只略去这一组', () => {
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
    const root = nestSuBlocks(buildSuCharts(people, links, { blocksPerPage: 20 })[0].blocks)[0];
    expect(root.omitBeads).toBe(true);
    expect(root.children.map((node) => node.block.name)).toEqual(['长子', '次子']);
    expect(root.children[0].omitBeads).toBe(false);
  });

  it('子息满六人只略去这一父，旁边的短支照常连线', () => {
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
    const root = nestSuBlocks(charts[0].blocks)[0];
    expect(root.block.name).toBe('父');
    expect(root.omitBeads).toBe(true);
    const uncle = root.children.find((node) => node.block.name === '叔');
    expect(uncle?.omitBeads).toBe(false);
    expect(uncle?.children.map((node) => node.block.name)).toEqual(['侄']);
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
  it('同页排布短图时按块数合并，独占一页则一图一页', () => {
    const charts = buildSuCharts(
      [person('r', '根', 1), person('a', '甲', 2, 1), person('b', '乙', 2, 2)],
      [link('r', 'a', 1), link('r', 'b', 2)],
      { blocksPerPage: 2 },
    );
    expect(groupSuCharts(charts, 'exclusive', 2)).toHaveLength(charts.length);
    expect(groupSuCharts(charts, 'share', 3)).toHaveLength(1);
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
