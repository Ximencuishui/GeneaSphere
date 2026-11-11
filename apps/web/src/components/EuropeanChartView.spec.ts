import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import EuropeanChartView from '@/components/EuropeanChartView.vue';
import { buildEuropeanCharts } from '@/utils/european-chart';
import { europeanViewModel } from '@/utils/european-chart-source';
import type { EuropeanChart } from '@/utils/european-chart';
import type { GenealogyNode } from '@/types';

function chartFixture(): EuropeanChart[] {
  return [{
    index: 0,
    generationFrom: 1,
    generationTo: 2,
    rowCount: 2,
    cells: [
      {
        personId: 'f',
        name: '乐善公',
        col: 0,
        row: 0,
        rowSpan: 2,
        role: 'origin',
        spouseText: '配王氏',
        mark: '',
      },
      {
        personId: 'a',
        name: '信四',
        col: 1,
        row: 0,
        rowSpan: 1,
        role: 'origin',
        spouseText: '',
        mark: '',
      },
      {
        personId: 'b',
        name: '庸一',
        col: 1,
        row: 1,
        rowSpan: 1,
        role: 'carried-out',
        spouseText: '',
        mark: '过继',
        cutChartNos: [2],
      },
    ],
  }];
}

describe('EuropeanChartView', () => {
  it('五世表头、合并单元格和竖排文字', () => {
    const wrapper = mount(EuropeanChartView, {
      props: {
        charts: chartFixture(),
        captions: {
          f: { courtesyName: '元吉', birthYear: 1480, deathYear: 1542, isLiving: false },
        },
      },
    });

    const headers = wrapper.findAll('th').map((node) => node.text());
    expect(headers).toEqual(['第一世', '第二世']);
    expect(wrapper.get('td[rowspan="2"]').text()).toContain('乐善公');
    expect(wrapper.get('td[rowspan="2"]').text()).toContain('字元吉');
    expect(wrapper.get('td[rowspan="2"]').text()).toContain('1480-1542');
    expect(wrapper.get('td[rowspan="2"]').text()).toContain('配王氏');
    expect(wrapper.text()).toContain('过继');
    expect(wrapper.text()).toContain('支另见图，见第2图');
    expect(wrapper.text()).not.toContain('接下');
    expect(wrapper.get('.ou-name').classes()).toContain('ou-name');
    expect(wrapper.get('.ou-meta').classes()).toContain('ou-meta');
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    expect(wrapper.findAll('tbody td')).toHaveLength(3);
  });

  it('册谱一图一页，行传是简述，没有续页和翻页按钮', async () => {
    const wrapper = mount(EuropeanChartView, {
      props: {
        variant: 'book',
        charts: chartFixture(),
        captions: {
          f: {
            courtesyName: '元吉',
            nativePlace: '庐陵',
            biography: '少颖悟，授徒乡里。这是一段不该整段印进格子的长行传。',
            offspring: '信四、庸一',
          },
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain('第1图 · 第一世至第五世');
    expect(wrapper.findAll('th').map((node) => node.text())).toEqual(['第五世', '第四世', '第三世', '第二世', '第一世']);
    expect(text).not.toContain('续页');
    expect(text).not.toContain('· 续');
    expect(text).not.toContain('上一页');
    expect(text).toContain('放大');
    expect(text).toContain('缩小');
    expect(text).toContain('连续显示');
    expect(wrapper.get('.ou-sheet').classes()).toContain('is-centered');
    await wrapper.get('button[aria-pressed="true"]').trigger('click');
    expect(wrapper.get('.ou-sheet').classes()).not.toContain('is-centered');
    expect(text).toContain('第 1 页 / 共 1 页');
    expect(text).toContain('字元吉');
    expect(text).toContain('籍庐陵');
    expect(text).not.toContain('不该整段印进格子');
    expect(text.indexOf('乐善公')).toBeLessThan(text.indexOf('配王氏'));
    expect(text.indexOf('配王氏')).toBeLessThan(text.indexOf('字元吉'));
    expect(text.indexOf('字元吉')).toBeLessThan(text.indexOf('籍庐陵'));
    expect(text.indexOf('籍庐陵')).toBeLessThan(text.indexOf('详见人物传·第1图｜乐善公'));
    expect(text).not.toContain('详见人物传·第1图｜信四');
    expect(wrapper.get('a.ou-jump').attributes('href')).toBe('#bio-乐善公-1');
    expect(wrapper.get('a.ou-tree-anchor').attributes('id')).toBe('tree-1');
    expect(wrapper.find('.ou-page-input').exists()).toBe(false);
    expect(wrapper.findAll('.ou-sheet')).toHaveLength(1);
  });

  it('仿古竖排只改文字方向，五世栏、锚点和互见不变', () => {
    const wrapper = mount(EuropeanChartView, {
      props: {
        variant: 'book',
        script: 'antique',
        titleVertical: true,
        charts: chartFixture(),
        captions: {
          f: {
            courtesyName: '元吉',
            artName: '乐山',
            nativePlace: '庐陵',
            biography: '少颖悟，授徒乡里。这是一段不该整段印进格子的长行传。',
          },
        },
      },
    });

    expect(wrapper.get('.ou-sheet').classes()).toContain('is-antique');
    expect(wrapper.get('.ou-sheet').classes()).toContain('is-title-vertical');
    expect(wrapper.findAll('th').map((node) => node.text())).toEqual(['第五世', '第四世', '第三世', '第二世', '第一世']);
    expect(wrapper.text()).toContain('第1图 · 第一世至第五世');
    expect(wrapper.text()).not.toContain('接下');
    expect(wrapper.text()).not.toContain('不该整段印进格子');
    const flow = wrapper.get('td.is-root-gen .ou-flow');
    const text = flow.text();
    expect(text.indexOf('乐善公')).toBeLessThan(text.indexOf('字元吉'));
    expect(text.indexOf('字元吉')).toBeLessThan(text.indexOf('号乐山'));
    expect(text.indexOf('号乐山')).toBeLessThan(text.indexOf('配王氏'));
    expect(text.indexOf('配王氏')).toBeLessThan(text.indexOf('籍庐陵'));
    expect(text).toContain('详见人物传·第1图｜乐善公');
    expect(wrapper.get('a.ou-jump').attributes('href')).toBe('#bio-乐善公-1');
    expect(wrapper.get('a.ou-tree-anchor').attributes('id')).toBe('tree-1');
    expect(wrapper.findAll('.ou-blank').length).toBeGreaterThan(0);
  });

  it('短图同页由上层开关控制，默认仍一图一页', () => {
    const second = {
      ...chartFixture()[0],
      index: 1,
      cells: chartFixture()[0].cells.map((cell) => ({ ...cell, personId: `${cell.personId}-2` })),
    };
    const charts = [chartFixture()[0], second];
    const exclusive = mount(EuropeanChartView, { props: { variant: 'book', charts } });
    expect(exclusive.findAll('.ou-sheet')).toHaveLength(2);
    const share = mount(EuropeanChartView, { props: { variant: 'book', pack: 'share', charts } });
    expect(share.findAll('.ou-sheet')).toHaveLength(1);
    expect(share.findAll('a.ou-tree-anchor')).toHaveLength(2);
    expect(share.text()).toContain('第 1 页 / 共 1 页');
  });

  it('点击人物抛出 personId', async () => {
    const wrapper = mount(EuropeanChartView, { props: { charts: chartFixture() } });
    await wrapper.get('[data-person-id="a"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['a']);
  });

  it('实际代数作表头，短表不补空世', () => {
    const wrapper = mount(EuropeanChartView, {
      props: {
        charts: [{
          index: 1,
          generationFrom: 5,
          generationTo: 7,
          rowCount: 1,
          cells: [{
            personId: 'p5',
            name: '第五世',
            col: 0,
            row: 0,
            rowSpan: 1,
            role: 'carried-in',
            spouseText: '',
            mark: '',
            resumeChartNo: 1,
            resumeFatherName: '第五世',
          }],
        }],
      },
    });
    expect(wrapper.findAll('th').map((node) => node.text())).toEqual(['第五世', '第六世', '第七世']);
    expect(wrapper.text()).toContain('接上');
    expect(wrapper.findAll('.ou-blank')).toHaveLength(2);
  });
});

describe('europeanViewModel', () => {
  it('配偶进格子，过继不另起一行', () => {
    const root = {
      id: 'f',
      full_name: '父',
      gender: 'male',
      is_living: false,
      has_photo: false,
      birth_date: '1500-01-01',
      courtesy_name: '元吉',
      spouses: [{ id: 'w', name: '王氏', gender: 'female', family_id: '1', marriage_order: 1, is_current: true }],
      child_links: [
        { child_id: 'a', birth_order: 1, child_type: 'BIOLOGICAL' },
        { child_id: 'b', birth_order: 2, child_type: 'ADOPTED' },
      ],
      children: [
        { id: 'a', full_name: '长子', gender: 'male', is_living: true, has_photo: false, children: [] },
        { id: 'b', full_name: '次子', gender: 'male', is_living: true, has_photo: false, children: [] },
      ],
    } as GenealogyNode;

    const model = europeanViewModel(root);
    const charts = buildEuropeanCharts(model.people, model.links);
    expect(charts).toHaveLength(1);
    expect(charts[0].cells.find((cell) => cell.personId === 'f')).toMatchObject({
      rowSpan: 2,
      spouseText: '配王氏',
    });
    expect(charts[0].cells.find((cell) => cell.personId === 'b')?.mark).toBe('过继');
    expect(charts[0].cells.some((cell) => cell.name === '王氏')).toBe(false);
    expect(model.captions.f).toMatchObject({ courtesyName: '元吉', birthYear: 1500 });
  });
});
