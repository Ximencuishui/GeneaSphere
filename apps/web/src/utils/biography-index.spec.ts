import { describe, expect, it } from 'vitest';
import type { EuropeanChart } from '@/utils/european-chart';
import {
  buildBiographyEntries,
  indexChartAppearances,
  packBiographyPages,
} from '@/utils/biography-index';

function cell(personId: string, name: string, col: 0 | 1 | 2 | 3 | 4, row: number, role: 'origin' | 'carried-in' | 'carried-out' = 'origin') {
  return { personId, name, col, row, rowSpan: 1, role, spouseText: '', mark: '' };
}

describe('indexChartAppearances', () => {
  it('按图号、从上到下记第一次出现，承接格不另起图号', () => {
    const charts = [
      {
        index: 0,
        generationFrom: 1,
        generationTo: 5,
        rowCount: 2,
        cells: [
          cell('a', '甲', 0, 0),
          cell('b', '乙', 1, 0),
          cell('c', '丙', 1, 1, 'carried-out'),
        ],
      },
      {
        index: 1,
        generationFrom: 5,
        generationTo: 9,
        rowCount: 1,
        cells: [
          cell('c', '丙', 0, 0, 'carried-in'),
          cell('d', '丁', 1, 0),
        ],
      },
    ] as EuropeanChart[];

    const map = indexChartAppearances(charts);
    expect(map.get('a')).toEqual({ chartNo: 1, sequence: 1, chartNos: [1] });
    expect(map.get('b')).toEqual({ chartNo: 1, sequence: 2, chartNos: [1] });
    expect(map.get('c')).toEqual({ chartNo: 1, sequence: 3, chartNos: [1, 2] });
    expect(map.get('d')).toEqual({ chartNo: 2, sequence: 4, chartNos: [2] });
  });
});

describe('buildBiographyEntries', () => {
  it('没有行传的人不入卷，其余按世系图从上到下', () => {
    const entries = buildBiographyEntries([
      {
        person_id: 'f',
        full_name: '乐善公',
        generation: 0,
        courtesy_name: '元吉',
        art_name: '紫阳',
        birth_year: 1480,
        death_year: 1542,
        is_living: false,
        native_place: '庐陵',
        biography: '少颖悟。\n授徒乡里。',
        epitaph: '墓前有碑',
        spouses: [{ name: '王氏' }],
        figures: [{ url: 'https://example.com/portrait.jpg', caption: '画像' }],
        children: [
          { name: '信四', rank: 1 },
          { name: '庸一', rank: 2 },
        ],
      },
      {
        person_id: 'a',
        full_name: '信四',
        generation: 1,
        father_id: 'f',
        father_name: '乐善公',
        rank: 1,
        biography: '   ',
      },
      {
        person_id: 'b',
        full_name: '庸一',
        generation: 1,
        father_id: 'f',
        father_name: '乐善公',
        rank: 2,
        biography: '出继后归宗。',
      },
    ]);

    expect(entries.map((entry) => entry.name)).toEqual(['乐善公', '庸一']);
    expect(entries[0]).toMatchObject({
      chartNo: 1,
      generationLabel: '第一世',
      courtesy: '元吉',
      artName: '紫阳',
      years: '1480-1542',
      spouses: '王氏',
      nativePlace: '庐陵',
      paragraphs: ['少颖悟。', '授徒乡里。'],
      note: '墓前有碑',
      chartNos: [1],
      figures: [{ url: 'https://example.com/portrait.jpg', caption: '画像' }],
    });
    expect(entries[1].chartNo).toBe(1);
    expect(entries[1].generationLabel).toBe('第二世');
    expect(entries[0].sequence).toBeLessThan(entries[1].sequence);
  });
});

describe('packBiographyPages', () => {
  it('放不下整条就换页，单条高于一页时仍整条留下', () => {
    expect(packBiographyPages([100, 100, 80], 220, 250)).toEqual([[0, 1], [2]]);
    expect(packBiographyPages([400, 40], 200, 200)).toEqual([[0], [1]]);
  });
});
