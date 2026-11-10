import { describe, expect, it } from 'vitest';
import { europeanChartsFromShilu } from '@/utils/european-chart-shilu';

describe('europeanChartsFromShilu', () => {
  it('世录辈分排成五世一表，配偶和墓葬不另起一行', () => {
    const { charts, captions } = europeanChartsFromShilu([
      {
        person_id: 'f',
        generation: 0,
        full_name: '朱熹',
        courtesy_name: '元晦',
        birth_year: 1130,
        death_year: 1200,
        is_living: false,
        burial_place: '建阳',
        native_place: '婺源',
        biography: '少颖悟，授徒白鹿洞。',
        spouses: [{ name: '刘氏', marriage_order: 1 }],
        children: [{ name: '朱塾' }, { name: '朱埜' }],
      },
      {
        person_id: 'a',
        generation: 1,
        rank: 1,
        full_name: '朱塾',
        father_id: 'f',
        is_living: false,
      },
      {
        person_id: 'b',
        generation: 1,
        rank: 2,
        full_name: '朱埜',
        father_id: 'f',
        child_type: 'ADOPTED',
        is_living: false,
      },
    ]);

    expect(charts).toHaveLength(1);
    expect(charts[0].generationFrom).toBe(1);
    expect(charts[0].generationTo).toBe(2);
    expect(charts[0].cells.find((cell) => cell.personId === 'f')).toMatchObject({
      rowSpan: 2,
      spouseText: '配刘氏',
    });
    expect(charts[0].cells.find((cell) => cell.personId === 'b')?.mark).toBe('过继');
    expect(charts[0].cells.some((cell) => cell.name === '刘氏')).toBe(false);
    expect(captions.f).toMatchObject({
      courtesyName: '元晦',
      burialPlace: '建阳',
      birthYear: 1130,
      nativePlace: '婺源',
      offspring: '朱塾、朱埜',
      biography: '少颖悟，授徒白鹿洞。',
    });
  });
});
