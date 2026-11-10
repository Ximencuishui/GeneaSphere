import { describe, expect, it } from 'vitest';
import { buildNameIndex, nameIndexFromEntries, namePinyin, packIndexGroups, pinyinInitial, surnameStrokes } from '@/utils/name-index';

describe('人名索引排序', () => {
  it('按拼音分组，同音按姓氏笔画，同名按世代和图号分行', () => {
    const groups = buildNameIndex([
      { personId: 'zhu', name: '朱熹', generation: 34, chartNos: [46, 47] },
      { personId: 'zhang', name: '张三', generation: 20, chartNos: [10] },
      { personId: 'zhang2', name: '章三', generation: 21, chartNos: [11] },
      { personId: 'wang', name: '王安石', generation: 19, chartNos: [8] },
      { personId: 'zeng', name: '曾巩', generation: 18, chartNos: [7] },
      { personId: 'blank', name: '   ', generation: 1, chartNos: [1] },
    ]);

    expect(groups.map((group) => group.letter)).toEqual(['W', 'Z']);
    const zed = groups[1].rows.map((row) => `${row.name}/${row.generationLabel}/第${row.chartNo}图/第${row.pageNo}页`);
    expect(zed).toEqual([
      '曾巩/十九世/第7图/第7页',
      '张三/二十一世/第10图/第10页',
      '章三/二十二世/第11图/第11页',
      '朱熹/三十五世/第46图/第46页',
      '朱熹/三十五世/第47图/第47页',
    ]);
    expect(pinyinInitial('曾巩')).toBe('Z');
    expect(namePinyin('乐善公').startsWith('yue')).toBe(true);
    expect(surnameStrokes('朱')).toBe(6);
    expect(surnameStrokes('张')).toBeLessThan(surnameStrokes('章'));
  });
});

describe('nameIndexFromEntries', () => {
  it('没有完整行传的人不进索引，同一个人每张图各占一行', () => {
    const groups = nameIndexFromEntries([
      {
        person_id: 'f',
        full_name: '乐善公',
        generation: 0,
        biography: '少颖悟。',
        children: [{ person_id: 'a', name: '信四', rank: 1 }],
      },
      {
        person_id: 'a',
        full_name: '信四',
        generation: 1,
        father_id: 'f',
        biography: '   ',
      },
    ]);
    const rows = groups.flatMap((group) => group.rows);
    expect(rows.map((row) => row.name)).toEqual(['乐善公']);
    expect(rows[0]).toMatchObject({ generationLabel: '一世', chartNo: 1, pageNo: 1 });
    expect(groups.some((group) => group.letter === 'L')).toBe(false);
  });
});

describe('packIndexGroups', () => {
  it('放不下的字母组整组换到下一页', () => {
    expect(packIndexGroups([50, 50, 50, 50], 100, 100)).toEqual([[0, 1, 2], [3]]);
    expect(packIndexGroups([300, 40], 100, 100)).toEqual([[0], [1]]);
  });
});
