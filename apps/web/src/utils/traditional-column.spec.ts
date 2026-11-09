import { describe, expect, it } from 'vitest';
import { classicExportScale } from '@/utils/traditional-export';
import {
  classicColumnWidth,
  classicGenerationBei,
  classicGenerationLines,
  classicGenerationTitle,
  majorityGenerationWord,
  classicNameColumns,
  classicRankLabel,
  classicSpouseCaption,
  layoutClassicGlyphs,
} from '@/utils/traditional-column';

describe('垂丝图列文案', () => {
  it('排行写成一个字', () => {
    expect(classicRankLabel(1)).toBe('长');
    expect(classicRankLabel(2)).toBe('次');
    expect(classicRankLabel(undefined)).toBe('');
  });

  it('配偶不超过四字；再长就收成配某氏等', () => {
    expect(classicSpouseCaption([{ name: '陈', marriage_order: 1 }])).toBe('配陈氏');
    expect(classicSpouseCaption([{ name: '欧阳氏', marriage_order: 1 }])).toBe('配欧阳氏');
    expect(classicSpouseCaption([
      { name: '刘', marriage_order: 1 },
      { full_name: '王氏', marriage_order: 2 },
    ])).toBe('配刘氏等');
  });

  it('世代表头两行，数字和世不拆开', () => {
    expect(classicGenerationTitle(10, '大')).toBe('11世 大辈');
    expect(classicGenerationLines(0, '熹')).toEqual(['1世', '熹辈']);
    expect(classicGenerationLines(0, '')).toEqual(['1世']);
    expect(classicGenerationLines(11, '景')).toEqual(['12世', '景辈']);
    expect(classicGenerationBei('熹')).toBe('熹辈');
    expect(classicGenerationBei('')).toBe('');
    expect(majorityGenerationWord(new Map([['熹', 2], ['塾', 5]]))).toBe('塾');
  });

  it('三字名加宽成两列，两字名维持原列宽', () => {
    expect(classicColumnWidth('朱熹')).toBe(22);
    expect(classicColumnWidth('欧阳修')).toBe(36);
    expect(classicNameColumns('欧阳修')).toEqual([['欧', '阳'], ['修']]);
    const glyphs = layoutClassicGlyphs({
      name: '欧阳修',
      rank: '长',
      spouse: '配刘氏等',
      width: 36,
      height: 120,
    });
    const nameXs = glyphs.filter((glyph) => glyph.role === 'name').map((glyph) => glyph.x);
    expect(new Set(nameXs).size).toBe(2);
    expect(glyphs.filter((glyph) => glyph.role === 'spouse').map((glyph) => glyph.text).join('')).toBe('配刘氏等');
  });

  it('导出按整图尺寸取 2 倍，超宽时降到画布上限以内', () => {
    expect(classicExportScale(900, 800)).toBe(2);
    expect(classicExportScale(26000, 3000)).toBeLessThan(1);
  });
});