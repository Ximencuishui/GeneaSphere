/**
 * 册谱总目录。与网页版同一套卷号，PDF 和预览不要各排一套。
 */
export type BookProfile = 'compact' | 'standard';
export type CatalogTag = '卷首' | '文档' | '世录' | '传志';
export type CatalogKind = 'index' | 'generation' | 'volume' | 'placeholder' | 'group';

export interface CatalogVolume {
  id: string;
  title: string;
  type: string;
  config?: { layout?: string; gender_filter?: string } | null;
}

export interface CatalogEntry {
  key: string;
  text: string;
  tag?: CatalogTag;
  depth: 0 | 1;
  marker?: 'mid' | 'last';
  kind: CatalogKind;
  volumeId?: string;
  anchor: string;
}

const RULE_SLOTS: { key: string; label: string; test: (title: string) => boolean }[] = [
  { key: 'rules-fanli', label: '凡例', test: (title) => title.includes('凡例') },
  { key: 'rules-jiaxun', label: '家训', test: (title) => title.includes('家训') },
  { key: 'rules-xiangzan', label: '像赞', test: (title) => title.includes('像赞') },
  { key: 'rules-citang', label: '祠堂坟图', test: (title) => title.includes('祠堂') || title.includes('坟') },
];

const APPENDIX_SLOTS: { key: string; label: string; test: (title: string) => boolean }[] = [
  { key: 'appendix-verse', label: '诗文碑记', test: (title) => title.includes('诗文') || title.includes('碑') },
  { key: 'appendix-chronicle', label: '修谱纪事', test: (title) => title.includes('纪事') },
  { key: 'appendix-notes', label: '附录考据', test: (title) => title.includes('附录') || title.includes('考据') || title.includes('墓志') || title.includes('艺文') },
];

export function isLadiesVolume(volume: CatalogVolume): boolean {
  return volume.config?.gender_filter === 'female' || volume.title.includes('闺秀');
}

export function isBiographyVolume(volume: CatalogVolume): boolean {
  if (isLadiesVolume(volume)) return false;
  return volume.config?.layout === 'biography' || volume.title.includes('人物传');
}

export function isLineageVolume(volume: CatalogVolume): boolean {
  if (volume.type !== 'shilu' || isLadiesVolume(volume) || isBiographyVolume(volume)) return false;
  return volume.title.includes('世系') || volume.config?.gender_filter === 'male' || !volume.config?.gender_filter;
}

export function buildBookCatalog(volumes: readonly CatalogVolume[], profile: BookProfile): CatalogEntry[] {
  const used = new Set<string>();
  const take = (match: (volume: CatalogVolume) => boolean) => {
    const found = volumes.find((volume) => !used.has(volume.id) && match(volume));
    if (found) used.add(found.id);
    return found;
  };
  const preface = take((volume) => volume.type === 'document' && (volume.title.includes('谱序') || volume.title.includes('源流')));
  const lineage = take((volume) => isLineageVolume(volume));
  const biography = take((volume) => isBiographyVolume(volume));
  const ladies = take((volume) => isLadiesVolume(volume));
  const child = (
    key: string,
    text: string,
    marker: 'mid' | 'last',
    volume: CatalogVolume | undefined,
  ): CatalogEntry => ({
    key,
    text,
    depth: 1,
    marker,
    kind: volume ? 'volume' : 'placeholder',
    volumeId: volume?.id,
    anchor: volume ? `vol-${volume.id}` : `book-slot-${key}`,
  });

  if (profile === 'standard') {
    const rules = RULE_SLOTS.map((slot) => take((volume) => volume.type === 'document' && slot.test(volume.title)));
    const appendix = APPENDIX_SLOTS.map((slot) => take((volume) => volume.type === 'document' && slot.test(volume.title)));
    return [
      group('front', '卷首｜人名索引、字辈索引', '卷首', 'book-front'),
      { key: 'index', text: '人名索引', depth: 1, marker: 'mid', kind: 'index', anchor: 'book-index' },
      { key: 'generation', text: '字辈索引', depth: 1, marker: 'last', kind: 'generation', anchor: 'book-generation' },
      volumeEntry('preface', '卷一｜谱序源流', '文档', preface, 'book-slot-preface'),
      group('rules', '卷二｜谱规图志', '文档', 'book-rules'),
      ...RULE_SLOTS.map((slot, index) => child(slot.key, slot.label, index === RULE_SLOTS.length - 1 ? 'last' : 'mid', rules[index])),
      volumeEntry('lineage', '卷三｜世系录（欧式五世世系表）', '世录', lineage, 'book-slot-lineage'),
      group('zhuan', '卷四｜传志篇', '传志', 'book-zhuan'),
      child('biography', '人物传', 'mid', biography),
      child('ladies', '闺秀录', 'last', ladies),
      group('appendix', '卷五｜艺文附录', '文档', 'book-appendix'),
      ...APPENDIX_SLOTS.map((slot, index) => child(slot.key, slot.label, index === APPENDIX_SLOTS.length - 1 ? 'last' : 'mid', appendix[index])),
    ];
  }

  return [
    { key: 'index', text: '卷首｜人名索引', tag: '卷首', depth: 0, kind: 'index', anchor: 'book-index' },
    volumeEntry('preface', '卷一｜谱序源流', '文档', preface, 'book-slot-preface'),
    volumeEntry('lineage', '卷二｜世系录', '世录', lineage, 'book-slot-lineage'),
    group('zhuan', '卷三｜传志篇', '传志', 'book-zhuan'),
    child('biography', '人物传', 'mid', biography),
    child('ladies', '闺秀录', 'last', ladies),
  ];
}

function group(key: string, text: string, tag: CatalogTag, anchor: string): CatalogEntry {
  return { key, text, tag, depth: 0, kind: 'group', anchor };
}

function volumeEntry(
  key: string,
  text: string,
  tag: CatalogTag,
  volume: CatalogVolume | undefined,
  fallbackAnchor: string,
): CatalogEntry {
  return {
    key,
    text,
    tag,
    depth: 0,
    kind: volume ? 'volume' : 'placeholder',
    volumeId: volume?.id,
    anchor: volume ? `vol-${volume.id}` : fallbackAnchor,
  };
}
