import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SuChartView from '@/components/SuChartView.vue';
import type { EuropeanLinkInput, EuropeanPersonInput } from '@/utils/european-chart';

const people: EuropeanPersonInput[] = [
  { id: 'r', name: '朱熹', generation: 1, spouses: [{ name: '刘氏', marriageOrder: 1 }] },
  { id: 'a', name: '朱塾', generation: 2, birthOrder: 1 },
  { id: 'b', name: '朱埜', generation: 2, birthOrder: 2 },
];
const links: EuropeanLinkInput[] = [
  { parentId: 'r', childId: 'a', birthOrder: 1 },
  { parentId: 'r', childId: 'b', birthOrder: 2 },
];

function personOf(wrapper: ReturnType<typeof mount>, personId: string) {
  return wrapper.get(`.su-person[data-person-id="${personId}"]`);
}

function leftOf(wrapper: ReturnType<typeof mount>, personId: string): number {
  const raw = personOf(wrapper, personId).attributes('style') || '';
  const match = raw.match(/left:\s*([0-9.]+)mm/);
  return match ? Number(match[1]) : Number.NaN;
}

describe('SuChartView', () => {
  it('版本A长房在左，文字横排在垂珠右侧，标题和页码是苏式', () => {
    const wrapper = mount(SuChartView, {
      props: {
        people,
        links,
        captions: {
          r: {
            courtesyName: '元晦',
            birthYear: 1130,
            deathYear: 1200,
            burialPlace: '建阳',
            biography: '这是一段不该印进世系的长行传，只应留在人物传。',
            achievements: '授徒考亭',
          },
        },
        script: 'horizontal',
        continuous: false,
      },
    });

    const text = wrapper.text();
    expect(text).toContain('第1图 · 朱熹公支世系');
    expect(text).toContain('第 1 页 / 共 1 页');
    expect(text).toContain('1世');
    expect(text).toContain('2世');
    expect(text.indexOf('朱塾')).toBeLessThan(text.indexOf('朱埜'));
    expect(text).toContain('字元晦');
    expect(text).toContain('1130-1200');
    expect(text).toContain('配刘氏');
    expect(text).toContain('葬建阳');
    expect(text).toContain('授徒考亭');
    expect(text).toContain('详见人物传');
    expect(text).not.toContain('不该印进世系');
    expect(wrapper.get('a.su-jump').attributes('href')).toBe('#bio-su-朱熹-1');
    expect(wrapper.get('#tree-su-1').exists()).toBe(true);
    expect(personOf(wrapper, 'a').attributes('data-col')).toBe('0');
    expect(personOf(wrapper, 'b').attributes('data-col')).toBe('1');
    expect(personOf(wrapper, 'a').attributes('data-row')).toBe(personOf(wrapper, 'b').attributes('data-row'));
    expect(leftOf(wrapper, 'a')).toBeLessThan(leftOf(wrapper, 'b'));
    expect(personOf(wrapper, 'r').attributes('style')).toContain('writing-mode: horizontal-tb');
    expect(wrapper.get('.su-gen').attributes('style')).toContain('horizontal-tb');
    expect(wrapper.get('.su-sheet').classes()).not.toContain('is-antique');
    expect(wrapper.get('.su-sheet').classes()).toContain('is-modern-frame');
    expect(text).not.toContain('支繁，略垂珠线');
    expect(wrapper.findAll('.su-bead').length).toBeGreaterThan(0);
    expect(wrapper.findAll('.su-rule').length).toBeGreaterThan(0);
  });

  it('默认画出垂珠，关掉再打开，板位还在', async () => {
    const wrapper = mount(SuChartView, {
      props: { people, links, continuous: false },
    });
    expect(wrapper.text()).toContain('隐藏垂珠连线');
    expect(wrapper.findAll('.su-bead')).toHaveLength(3);
    expect(wrapper.findAll('.su-rule.is-v').length).toBeGreaterThan(0);
    expect(wrapper.findAll('.su-rule.is-h')).toHaveLength(1);
    expect(wrapper.find('.su-rule').attributes('data-parent-id')).toBe('r');
    const before = leftOf(wrapper, 'b');
    await wrapper.get('button.su-bead-toggle').trigger('click');
    expect(wrapper.text()).toContain('显示垂珠连线');
    expect(wrapper.findAll('.su-bead')).toHaveLength(0);
    expect(wrapper.findAll('.su-rule')).toHaveLength(0);
    await wrapper.get('button.su-bead-toggle').trigger('click');
    expect(wrapper.findAll('.su-bead')).toHaveLength(3);
    expect(leftOf(wrapper, 'b')).toBe(before);
    expect(leftOf(wrapper, 'a')).toBeLessThan(leftOf(wrapper, 'b'));
  });

  it('六子排不下时先并排前几子，其余支另见图，关掉垂珠后标记还在', async () => {
    const sons = Array.from({ length: 6 }, (_, index) => ({
      id: `s${index}`,
      name: `子${index + 1}`,
      generation: 2,
      birthOrder: index + 1,
    }));
    const wrapper = mount(SuChartView, {
      props: {
        people: [
          { id: 'f', name: '父', generation: 1 },
          ...sons,
          { id: 'u', name: '叔', generation: 2, birthOrder: 7 },
          { id: 'c', name: '侄', generation: 3, birthOrder: 1 },
        ],
        links: [
          ...sons.map((son, index) => ({ parentId: 'f', childId: son.id, birthOrder: index + 1 })),
          { parentId: 'f', childId: 'u', birthOrder: 7 },
          { parentId: 'u', childId: 'c', birthOrder: 1 },
        ],
        beadLines: true,
        continuous: true,
      },
    });
    expect(wrapper.text()).toContain('支另见图，见第2图（第2页）');
    expect(wrapper.text()).toContain('接上：【父】，见第1图（第1页）');
    expect(wrapper.text()).not.toContain('支繁，略垂珠线');
    const beaded = wrapper.findAll('.su-rule').map((node) => node.attributes('data-parent-id'));
    expect(beaded).toContain('f');
    expect(beaded).toContain('u');
    expect(personOf(wrapper, 's0').attributes('data-col')).toBe('0');
    expect(personOf(wrapper, 's0').attributes('data-row')).toBe('1');
    expect(Number(personOf(wrapper, 's3').attributes('data-col'))).toBeGreaterThan(0);
    expect(personOf(wrapper, 's0').attributes('data-row')).toBe(personOf(wrapper, 's3').attributes('data-row'));
    expect(wrapper.find('.su-seam').exists()).toBe(true);
    await wrapper.setProps({ beadLines: false });
    expect(wrapper.text()).toContain('支另见图，见第2图（第2页）');
    expect(wrapper.text()).toContain('接上：【父】，见第1图（第1页）');
    expect(wrapper.findAll('.su-rule')).toHaveLength(0);
    expect(wrapper.findAll('.su-bead')).toHaveLength(0);
    expect(personOf(wrapper, 's0').attributes('data-col')).toBe('0');
    expect(personOf(wrapper, 's0').attributes('style')).toContain('writing-mode: horizontal-tb');
  });

  it('仿古版长房靠右，文字竖排，世代黑块，不画兄弟横线', () => {
    const wrapper = mount(SuChartView, {
      props: {
        people,
        links,
        script: 'antique',
        titleVertical: true,
        beadLines: true,
        continuous: false,
        showToolbar: false,
      },
    });
    const sheet = wrapper.get('.su-sheet');
    expect(sheet.classes()).toContain('is-antique');
    expect(sheet.classes()).toContain('is-landscape');
    expect(sheet.classes()).toContain('is-title-vertical');
    expect(personOf(wrapper, 'a').attributes('data-col')).toBe('0');
    expect(personOf(wrapper, 'b').attributes('data-col')).toBe('1');
    expect(leftOf(wrapper, 'a')).toBeGreaterThan(leftOf(wrapper, 'b'));
    expect(personOf(wrapper, 'a').attributes('style')).toContain('writing-mode: vertical-rl');
    expect(wrapper.get('.su-gen').attributes('style')).toContain('vertical-rl');
    expect(wrapper.get('.su-gen').classes()).toContain('is-boxed');
    const genStyle = wrapper.get('.su-gen').attributes('style') || '';
    expect(genStyle).toContain('background: rgb(0, 0, 0)');
    expect(genStyle).toContain('color: rgb(255, 255, 255)');
    expect(genStyle).toContain('border: 0');
    const personStyle = personOf(wrapper, 'a').attributes('style') || '';
    expect(personStyle).toContain('background: transparent');
    expect(personStyle).toContain('color: rgb(0, 0, 0)');
    expect(personStyle).not.toContain('background: rgb(0, 0, 0)');
    expect(sheet.attributes('style')).toContain('--su-antique-top: 4pt');
    expect(sheet.attributes('style')).toContain('--su-antique-side: 2pt');
    expect(sheet.attributes('style')).toContain('--su-divider-pt: 1pt');
    expect(sheet.attributes('style')).toContain('--su-bead-pt: 1pt');
    expect(sheet.attributes('style')).toContain('--su-person-rule-pt: 0.5pt');
    expect(wrapper.text()).toContain('一世');
    expect(wrapper.text()).toContain('二世');
    expect(wrapper.text()).toContain('第1图 · 朱熹公支派');
    expect(wrapper.findAll('.su-bead').length).toBeGreaterThan(0);
    expect(wrapper.find('.su-rule.is-h').exists()).toBe(false);
    expect(wrapper.find('.su-rail').exists()).toBe(true);
    expect(sheet.find('.su-person').attributes('style') || '').not.toContain('margin-left');
  });

  it('仿古版接上接下在垂珠端点竖排', () => {
    const chain = Array.from({ length: 16 }, (_, index) => ({
      id: `p${index}`,
      name: `人${index}`,
      generation: index + 1,
      birthOrder: 1,
    }));
    const wrapper = mount(SuChartView, {
      props: {
        people: chain,
        links: chain.slice(1).map((person, index) => ({
          parentId: chain[index].id,
          childId: person.id,
          birthOrder: 1,
        })),
        script: 'antique',
        beadLines: false,
        continuous: false,
        showToolbar: false,
      },
    });
    expect(wrapper.text()).toContain('支另见图，见第');
    expect(wrapper.text()).toContain('接上：【');
    expect(wrapper.text()).not.toContain('接下');
    expect(wrapper.get('.su-person').attributes('style')).toContain('vertical-rl');
  });

  it('版本A版框默认打开，线宽可调到 10pt，关掉后外框消失', async () => {
    const wrapper = mount(SuChartView, {
      props: { people, links, script: 'horizontal', continuous: false, showToolbar: true },
    });
    expect(wrapper.get('.su-sheet').classes()).toContain('is-modern-frame');
    expect(wrapper.get('.su-sheet').attributes('style')).toContain('--su-frame-pt: 4pt');
    expect(wrapper.get('.su-stage').classes()).not.toContain('su-frame');
    expect(wrapper.text()).toContain('隐藏版框');
    await wrapper.get('select[aria-label="版框线宽"]').setValue('10');
    expect(wrapper.get('.su-sheet').attributes('style')).toContain('--su-frame-pt: 10pt');
    await wrapper.get('button.su-frame-toggle').trigger('click');
    expect(wrapper.text()).toContain('显示版框');
    expect(wrapper.get('.su-sheet').classes()).not.toContain('is-modern-frame');
    expect(wrapper.findAll('.su-bead').length).toBeGreaterThan(0);
  });

  it('版本A显示真实头像，仿古版、关闭开关和占位图都不显示', () => {
    const captions = { r: { avatarUrl: '/portraits/zhu-xi.jpg' }, a: { avatarUrl: 'https://picsum.photos/seed/geneasphere-male-1/200/200' } };
    const shown = mount(SuChartView, {
      props: { people, links, captions, showAvatars: true, showToolbar: false },
    });
    expect(shown.get('.su-person[data-person-id="r"] .su-avatar').attributes('src')).toBe('/portraits/zhu-xi.jpg');
    expect(shown.find('.su-person[data-person-id="a"] .su-avatar').exists()).toBe(false);
    expect(shown.find('.su-person[data-person-id="b"] .su-avatar').exists()).toBe(false);

    const hidden = mount(SuChartView, {
      props: { people, links, captions, showAvatars: false, showToolbar: false },
    });
    expect(hidden.find('.su-avatar').exists()).toBe(false);

    const antique = mount(SuChartView, {
      props: { people, links, captions, script: 'antique', showAvatars: true, showToolbar: false },
    });
    expect(antique.find('.su-avatar').exists()).toBe(false);
  });

  it('仿古版不使用版本A的均匀版框', () => {
    const wrapper = mount(SuChartView, {
      props: {
        people,
        links,
        script: 'antique',
        showFrame: true,
        continuous: false,
        showToolbar: false,
      },
    });
    expect(wrapper.get('.su-sheet').classes()).not.toContain('is-modern-frame');
    expect(wrapper.get('.su-stage').classes()).toContain('su-frame');
  });

  it('连续显示时不再按页隔离', () => {
    const wrapper = mount(SuChartView, {
      props: { people, links, continuous: true },
    });
    expect(wrapper.get('.su-sheet').classes()).toContain('is-flow');
    expect(wrapper.text()).not.toContain('第 1 页 / 共 1 页');
  });
});
