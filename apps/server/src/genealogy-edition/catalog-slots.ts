/** 标准宗谱目录槽。空槽按这个键落卷，不再靠标题碰关键词才能写。 */
export const CATALOG_SLOTS = [
  { key: 'preface', label: '谱序源流', type: 'document' as const, title: '卷一 谱序源流' },
  { key: 'rules-fanli', label: '凡例', type: 'document' as const, title: '凡例' },
  { key: 'rules-jiaxun', label: '家训', type: 'document' as const, title: '家训' },
  { key: 'rules-xiangzan', label: '像赞', type: 'document' as const, title: '像赞' },
  { key: 'rules-citang', label: '祠堂坟图', type: 'document' as const, title: '祠堂坟图' },
  { key: 'lineage', label: '世系录', type: 'shilu' as const, title: '卷三 世系录', config: { gender_filter: 'male' } },
  { key: 'biography', label: '人物传', type: 'shilu' as const, title: '卷四 人物传', config: { layout: 'biography', gender_filter: 'male' } },
  { key: 'ladies', label: '闺秀录', type: 'shilu' as const, title: '卷四 闺秀录', config: { gender_filter: 'female' } },
  { key: 'appendix-verse', label: '诗文碑记', type: 'document' as const, title: '诗文碑记' },
  { key: 'appendix-chronicle', label: '修谱纪事', type: 'document' as const, title: '修谱纪事' },
  { key: 'appendix-notes', label: '附录考据', type: 'document' as const, title: '附录考据' },
];

export type CatalogSlotKey = (typeof CATALOG_SLOTS)[number]['key'];

const SLOT_KEYS = new Set(CATALOG_SLOTS.map((slot) => slot.key));

export function isCatalogSlot(value: string): value is CatalogSlotKey {
  return SLOT_KEYS.has(value as CatalogSlotKey);
}

export function slotDef(key: string) {
  return CATALOG_SLOTS.find((slot) => slot.key === key);
}

/** 旧卷没有槽位时，按标题归入。只用于补 catalog_slot，不改标题和正文。 */
export function inferCatalogSlot(title: string, type: string, config?: { layout?: string; gender_filter?: string } | null): string | null {
  if (type === 'shilu') {
    if (config?.gender_filter === 'female' || title.includes('闺秀')) return 'ladies';
    if (config?.layout === 'biography' || title.includes('人物传')) return 'biography';
    if (title.includes('世系') || config?.gender_filter === 'male' || !config?.gender_filter) return 'lineage';
    return null;
  }
  if (title.includes('谱序') || title.includes('源流')) return 'preface';
  if (title.includes('凡例')) return 'rules-fanli';
  if (title.includes('家训')) return 'rules-jiaxun';
  if (title.includes('像赞')) return 'rules-xiangzan';
  if (title.includes('祠堂') || title.includes('坟')) return 'rules-citang';
  if (title.includes('诗文') || title.includes('碑')) return 'appendix-verse';
  if (title.includes('纪事')) return 'appendix-chronicle';
  if (title.includes('附录') || title.includes('考据') || title.includes('墓志') || title.includes('艺文')) return 'appendix-notes';
  return null;
}
