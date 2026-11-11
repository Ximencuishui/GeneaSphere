import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import BookCover from '@/components/BookCover.vue';

const props = {
  name: '朱氏族谱',
  hall: '紫阳堂',
  volume: '卷二',
  year: '公元2026年重修',
  place: '福建尤溪',
};

describe('册谱封面', () => {
  it('默认横版正式仿古，外框 2pt，只有谱名堂号卷次和年份地点', () => {
    const wrapper = mount(BookCover, { props: { ...props, template: 'land-formal' } });
    const sheet = wrapper.get('.cover-sheet');
    expect(sheet.attributes('data-template')).toBe('land-formal');
    expect(sheet.classes()).toContain('is-land');
    expect(wrapper.get('.frame').attributes('style')).toContain('border-width: 2pt');
    expect(wrapper.text()).toContain('朱氏族谱');
    expect(wrapper.text()).toContain('紫阳堂');
    expect(wrapper.text()).toContain('卷二');
    expect(wrapper.text()).toContain('公元2026年重修 福建尤溪');
    expect(wrapper.find('.su-bead').exists()).toBe(false);
    expect(wrapper.find('.su-gen').exists()).toBe(false);
  });

  it('简约款和扉页不画外框', () => {
    const plain = mount(BookCover, { props: { ...props, template: 'land-plain' } });
    expect(plain.find('.frame').exists()).toBe(false);
    expect(plain.get('.cover-sheet').classes()).toContain('is-land');
    expect(plain.text()).not.toContain('福建尤溪');

    const blank = mount(BookCover, { props: { ...props, template: 'port-blank' } });
    expect(blank.find('.frame').exists()).toBe(false);
    expect(blank.get('.cover-sheet').classes()).toContain('is-port');
  });

  it('栏线款用 1pt 横线，双栏款用 1pt 中缝', () => {
    const ruled = mount(BookCover, { props: { ...props, template: 'land-ruled' } });
    const bars = ruled.findAll('.hbar');
    expect(bars).toHaveLength(2);
    expect(bars[0].attributes('style')).toContain('border-top-width: 1pt');

    const split = mount(BookCover, { props: { ...props, template: 'port-split' } });
    expect(split.get('.cover-sheet').classes()).toContain('is-port');
    expect(split.get('.split-rule').attributes('style')).toContain('width: 1pt');
    expect(split.get('.frame').attributes('style')).toContain('border-width: 2pt');
  });
});
