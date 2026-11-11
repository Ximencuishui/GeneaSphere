import { describe, expect, it } from 'vitest';
import { buildBookCatalog, type CatalogVolume } from '@/utils/book-catalog';

const volumes: CatalogVolume[] = [
  { id: '1', title: '卷一 谱序源流', type: 'document' },
  { id: '2', title: '卷二 世系录', type: 'shilu', config: { gender_filter: 'male' } },
  { id: '3', title: '卷三 人物传', type: 'shilu', config: { layout: 'biography', gender_filter: 'male' } },
  { id: '4', title: '卷三 闺秀录', type: 'shilu', config: { gender_filter: 'female' } },
  { id: '5', title: '卷五 艺文墓志', type: 'document' },
];

function volumeNumbers(texts: string[]): string[] {
  return texts.map((text) => text.split('｜')[0]).filter((text) => text.startsWith('卷'));
}

describe('册谱总目录', () => {
  it('精简谱把人物传和闺秀录收进卷三传志篇，卷号不重复', () => {
    const catalog = buildBookCatalog(volumes, 'compact');
    expect(catalog.map((entry) => entry.text)).toEqual([
      '卷首｜人名索引',
      '卷一｜谱序源流',
      '卷二｜世系录',
      '卷三｜传志篇',
      '人物传',
      '闺秀录',
    ]);
    expect(new Set(volumeNumbers(catalog.filter((entry) => entry.depth === 0).map((entry) => entry.text))).size).toBe(4);
    expect(catalog.find((entry) => entry.text === '人物传')).toMatchObject({ depth: 1, marker: 'mid', volumeId: '3', anchor: 'vol-3' });
    expect(catalog.find((entry) => entry.text === '闺秀录')).toMatchObject({ depth: 1, marker: 'last', volumeId: '4' });
    expect(catalog.some((entry) => entry.text.includes('谱规') || entry.text.includes('艺文'))).toBe(false);
    expect(catalog.map((entry) => entry.tag).filter(Boolean)).toEqual(['卷首', '文档', '世录', '传志']);
  });

  it('标准宗谱按卷一到卷五展开，缺内容的子目仍在目录里', () => {
    const catalog = buildBookCatalog(volumes, 'standard');
    const heads = catalog.filter((entry) => entry.depth === 0).map((entry) => entry.text);
    expect(heads).toEqual([
      '卷首｜人名索引、字辈索引',
      '卷一｜谱序源流',
      '卷二｜谱规图志',
      '卷三｜世系录',
      '卷四｜传志篇',
      '卷五｜艺文附录',
    ]);
    expect(new Set(volumeNumbers(heads)).size).toBe(heads.length);
    expect(catalog.find((entry) => entry.text === '凡例')?.kind).toBe('placeholder');
    expect(catalog.find((entry) => entry.text === '附录考据')).toMatchObject({ volumeId: '5', kind: 'volume' });
    expect(catalog.find((entry) => entry.text === '字辈索引')?.kind).toBe('generation');
    expect(catalog.find((entry) => entry.key === 'index')?.anchor).toBe('book-index');
  });
});
