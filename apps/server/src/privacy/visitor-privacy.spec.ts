import {
  mapRelativeQuestionTypes,
  mediaVisibleToVisitor,
  redactCepuEntries,
  redactDocumentHtml,
  visitorKinshipResult,
  redactClanTree,
  redactPersonDetail,
  redactTreeNode,
  relativeMaxAttempts,
  visitorMaySeePerson,
} from './visitor-privacy';

const rules = {
  allow_visitor_deceased: false,
  max_generations_visible: 2,
  hide_living_photos: true,
  hide_living_spouses: true,
  enable_relative_verify: true,
  verify_questions: [],
  verify_max_attempts: 3,
};

describe('visitor privacy', () => {
  const generations = new Map([['1', 1], ['2', 2], ['3', 3]]);

  it('hides generations beyond the limit and strips deceased details', () => {
    const tree = redactTreeNode({
      id: '1',
      name: '始祖',
      gender: 'male',
      is_living: false,
      birth_date: '1900-01-01',
      has_photo: true,
      avatar_url: '/a.jpg',
      spouses: [{ id: '9', name: '配偶', is_living: true }],
      children: [
        {
          id: '2',
          name: '二代',
          is_living: true,
          has_photo: true,
          avatar_url: '/b.jpg',
          spouses: [{ id: '8', name: '在世配偶', is_living: true }],
          children: [{ id: '3', name: '三代', is_living: true, children: [] }],
        },
      ],
    }, rules, generations);

    expect(tree.name).toBe('');
    expect(tree.birth_date).toBeUndefined();
    expect(tree.avatar_url).toBeUndefined();
    expect(tree.spouses).toBeUndefined();
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].avatar_url).toBeUndefined();
    expect(tree.children[0].has_photo).toBe(false);
    expect(tree.children[0].spouses).toEqual([]);
    expect(tree.children[0].children).toEqual([]);
  });

  it('keeps a logged-in member path by not calling the redactor when unrestricted', () => {
    expect(visitorMaySeePerson(false, 6, rules)).toBe(false);
    expect(visitorMaySeePerson(true, 2, { ...rules, hide_living_photos: true })).toBe(true);
  });

  it('hides living photos and keeps unlinked scenery', () => {
    expect(mediaVisibleToVisitor([{ is_living: true, generation: 1 }], rules)).toBe(false);
    expect(mediaVisibleToVisitor([], rules)).toBe(true);
    expect(mediaVisibleToVisitor([{ is_living: false, generation: 1 }], { ...rules, allow_visitor_deceased: true, hide_living_photos: true })).toBe(true);
  });

  it('redacts person detail and cepu entries', () => {
    const detail = redactPersonDetail({
      person: { id: '2', full_name: '在世', is_living: true, avatar_url: '/p.jpg' },
      profile: { biography: '生平', marital_notes: '配偶家世' },
      spouses: [{ id: '8', name: '配偶', is_living: true }],
      media: [{ id: '1', url: '/p.jpg' }],
      father: { id: '1', full_name: '已故父' },
    }, rules, 2);
    expect(detail.person.avatar_url).toBeNull();
    expect(detail.media).toEqual([]);
    expect(detail.spouses).toEqual([]);
    expect(detail.profile.marital_notes).toBeNull();
    expect(detail.father).toBeNull();
    expect(detail.profile.biography).toBe('生平');

    const entries = redactCepuEntries([
      { person_id: '1', generation: 0, is_living: false, full_name: '始祖', biography: '传', spouses: [{ name: '配' }] },
      { person_id: '2', generation: 1, is_living: true, full_name: '二代', avatar_url: '/a.jpg', figures: [{ url: '/a.jpg' }], spouses: [{ name: '配' }], children: [{ person_id: '1', name: '始祖' }] },
    ], rules);
    expect(entries[0]).toMatchObject({ hidden: true, full_name: '' });
    expect(entries[0].biography).toBeUndefined();
    expect(entries[1].figures).toEqual([]);
    expect(entries[1].spouses).toEqual([]);
    expect(entries[1].children).toEqual([]);
  });

  it('drops spouse edges that no longer have a visible spouse', () => {
    const tree = redactClanTree({
      rootNode: {
        id: '2',
        name: '在世',
        is_living: true,
        has_photo: false,
        spouses: [{ id: '8', name: '配', is_living: true }],
        children: [],
      },
      spouseEdges: [{ from: '2', to: '8', order: 1, is_current: true }],
      mainLineage: ['2', '3'],
      totalPersons: 9,
      shownPersons: 9,
      isPartial: true,
    }, rules, generations);
    expect(tree.spouseEdges).toEqual([]);
    expect(tree.totalPersons).toBe(1);
    expect(tree.isPartial).toBe(false);
  });

  it('strips hidden names and living photos from document html', () => {
    const html = redactDocumentHtml(
      '<p>始祖张三与在世李四</p><img src="/a.jpg">',
      rules,
      [
        { full_name: '张三', is_living: false, generation: 1 },
        { full_name: '李四', is_living: true, generation: 2 },
      ],
    );
    expect(html).not.toContain('张三');
    expect(html).toContain('李四');
    expect(html).not.toContain('<img');
  });

  it('removes courtesy names, aliases and former names, and skips one-character names', () => {
    const html = redactDocumentHtml(
      '<p>朱熹字元晦，号晦庵，曾用名沈郎，别名紫阳。在世李四。字朱。</p><img src="/a.jpg">',
      rules,
      [
        {
          full_name: '朱熹',
          courtesy_name: '元晦、仲晦',
          art_name: '晦庵',
          former_name: '沈郎',
          alias_name: '紫阳',
          nickname: '朱',
          is_living: false,
          generation: 1,
        },
        { full_name: '李四', is_living: true, generation: 2 },
      ],
    );
    expect(html).not.toContain('朱熹');
    expect(html).not.toContain('元晦');
    expect(html).not.toContain('仲晦');
    expect(html).not.toContain('晦庵');
    expect(html).not.toContain('沈郎');
    expect(html).not.toContain('紫阳');
    expect(html).toContain('李四');
    expect(html).toContain('字朱');
    expect(html).not.toContain('<img');
  });

  it('replaces a longer hidden name before a shorter one and keeps images when photos stay visible', () => {
    const replaced = redactDocumentHtml(
      '<p>张三丰</p>',
      rules,
      [
        { full_name: '张三丰', is_living: false, generation: 1 },
        { full_name: '张三', is_living: false, generation: 1 },
      ],
    );
    expect(replaced).not.toContain('张三');
    expect(replaced).not.toContain('丰');

    const withPhoto = redactDocumentHtml(
      '<p>张三</p><img src="/a.jpg">',
      { ...rules, hide_living_photos: false },
      [{ full_name: '张三', is_living: false, generation: 1 }],
    );
    expect(withPhoto).not.toContain('张三');
    expect(withPhoto).toContain('<img');
  });

  it('does not strip a name that a visible person still uses', () => {
    const html = redactDocumentHtml(
      '<p>在世李四</p>',
      rules,
      [
        { full_name: '李四', is_living: true, generation: 2 },
        { full_name: '旧名', alias_name: '李四', is_living: false, generation: 1 },
      ],
    );
    expect(html).toContain('李四');
    expect(html).not.toContain('旧名');
  });

  it('hides ancestor ids from visitors on kinship checks', () => {
    const full = { isConsanguineous: true, commonAncestors: [{ ancestor_id: '1' }], relationship: 'sibling' as const };
    expect(visitorKinshipResult(full, false)).toEqual({ isConsanguineous: true });
    expect(visitorKinshipResult(full, true)).toBe(full);
  });

  it('maps relative question types and clamps attempts', () => {
    expect(mapRelativeQuestionTypes([
      '请输入您父亲的姓名',
      '请输入您祖父的出生年份',
      '请输入您曾祖父的配偶姓氏',
      'father_name',
    ])).toEqual(['father_name', 'grandfather_birth_year', 'great_grandfather_spouse_surname']);
    expect(relativeMaxAttempts(0)).toBe(3);
    expect(relativeMaxAttempts(12)).toBe(10);
    expect(relativeMaxAttempts(2)).toBe(2);
  });
});
