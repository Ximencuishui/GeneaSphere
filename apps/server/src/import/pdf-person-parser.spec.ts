import { extractPersonsFromText, parseChineseGeneration } from './pdf-person-parser';

describe('pdf person parser', () => {
  it('parses three generations with spouses and does not treat 第十三世 as a name', () => {
    const text = [
      '第十三世陈德明，字子正，配王氏，子陈文远',
      '第十四世陈文远，配李氏，子陈明德',
      '第十五世陈明德',
    ].join('\n');

    const people = extractPersonsFromText(text);
    const byName = (name: string) => people.filter((item) => item.fullName === name);

    expect(people.map((item) => item.fullName)).toEqual(['陈德明', '王氏', '陈文远', '李氏', '陈明德']);
    expect(people.some((item) => item.fullName.includes('世'))).toBe(false);

    const grandfather = byName('陈德明')[0];
    const grandmother = byName('王氏')[0];
    const father = byName('陈文远')[0];
    const mother = byName('李氏')[0];
    const son = byName('陈明德')[0];

    expect(grandfather.gender).toBe('M');
    expect(grandfather.generation).toBe(13);
    expect(grandmother.gender).toBe('F');
    expect(grandmother.spouseLocalId).toBe(grandfather.localId);
    expect(father.parentLocalId).toBe(grandfather.localId);
    expect(father.motherLocalId).toBe(grandmother.localId);
    expect(father.generation).toBe(14);
    expect(mother.gender).toBe('F');
    expect(mother.spouseLocalId).toBe(father.localId);
    expect(son.parentLocalId).toBe(father.localId);
    expect(son.motherLocalId).toBe(mother.localId);
    expect(son.generation).toBe(15);
  });

  it('strips 行X and forces 氏 to female', () => {
    const [person] = extractPersonsFromText('第十三世行二王氏');
    expect(person.fullName).toBe('王氏');
    expect(person.gender).toBe('F');
    expect(person.generation).toBe(13);
  });

  it('reads compound generation numbers', () => {
    expect(parseChineseGeneration('十三')).toBe(13);
    expect(parseChineseGeneration('二十')).toBe(20);
    expect(parseChineseGeneration('二十一')).toBe(21);
  });

  it('keeps readable people and marks broken lines as low confidence', () => {
    const people = extractPersonsFromText(
      ['第十三世陈德明，配王氏，子陈文远', '第十六世？？？', '扫描噪声胡乱写'].join('\n'),
    );
    const readable = people.find((item) => item.fullName === '陈德明');
    const broken = people.filter((item) => item.confidenceScore < 70);

    expect(readable?.confidenceScore).toBeGreaterThanOrEqual(70);
    expect(readable?.parseWarning).toBeUndefined();
    expect(broken.map((item) => item.fullName)).toEqual(expect.arrayContaining(['第十六世？？？', '扫描噪声']));
    expect(broken.every((item) => item.parseWarning && item.originalText)).toBe(true);
  });
});
