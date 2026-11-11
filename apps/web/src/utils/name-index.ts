/**
 * 卷首人名索引。只收录有完整行传的族人，一条图号一行。
 * 一图一页，所以世系录页脚上的页码就是图号。
 */
import { buildEuropeanCharts, fitEuropeanChartsToPages } from '@/utils/european-chart';
import { europeanViewFromShilu } from '@/utils/european-chart-shilu';
import { hasFullBiography, indexChartAppearances, lineageChartEntries, type BiographySource } from '@/utils/biography-index';
import { buildSuCharts, indexSuAppearances } from '@/utils/su-chart';
import { HANZI_BASE, HANZI_PINYIN_B64, HANZI_STROKE_B64, HANZI_SYLLABLES } from '@/utils/hanzi-index-data';

export interface NameIndexCandidate {
  personId: string;
  name: string;
  /** 世录里的辈分，根是 0。 */
  generation: number;
  chartNos: number[];
  /** 苏式正文图号。不传时索引行里记 0。 */
  suChartNo?: number;
  /** 欧式正文图号。不传时沿用本行的 chartNo。 */
  ouChartNo?: number;
  /** 页码。不传时沿用图号。 */
  pageNo?: number;
}

export interface NameIndexRow {
  personId: string;
  name: string;
  pinyin: string;
  generation: number;
  generationLabel: string;
  chartNo: number;
  pageNo: number;
  suChartNo: number;
  ouChartNo: number;
}

export interface NameIndexGroup {
  letter: string;
  rows: NameIndexRow[];
}

/** 两栏，并留出一行的余量，避免栏末被挤到下一页。 */
export const NAME_INDEX_COLUMNS = 2;
export const NAME_INDEX_PACK_SAFETY = 24;

const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

const COMPOUND_SURNAMES = new Set([
  '欧阳', '太史', '端木', '上官', '司马', '东方', '独孤', '南宫', '万俟', '闻人',
  '夏侯', '诸葛', '尉迟', '公羊', '赫连', '澹台', '皇甫', '宗政', '濮阳', '公冶',
  '太叔', '申屠', '公孙', '慕容', '仲孙', '钟离', '长孙', '宇文', '司徒', '鲜于',
  '司空', '闾丘', '子车', '亓官', '司寇', '巫马', '公西', '颛孙', '壤驷', '公良',
  '漆雕', '乐正', '宰父', '谷梁', '拓跋', '夹谷', '轩辕', '令狐', '段干', '百里',
  '呼延', '东郭', '南门', '羊舌', '微生', '梁丘', '公仲', '公上', '公门', '公山',
  '左丘', '公伯', '西门', '公祖', '第五', '公乘', '南荣', '东里', '东宫', '仲长',
  '子书', '子桑', '即墨', '达奚', '褚师',
]);

/** 字典首读和姓氏读音不一致时，按姓氏。 */
const SURNAME_PINYIN: Record<string, string> = {
  曾: 'zeng',
  单: 'shan',
  解: 'xie',
  仇: 'qiu',
  朴: 'piao',
  查: 'zha',
  区: 'ou',
  乐: 'yue',
  召: 'shao',
  覃: 'qin',
  翟: 'zhai',
  繁: 'po',
  折: 'she',
  盖: 'ge',
  种: 'chong',
  秘: 'bi',
  冼: 'xian',
  谌: 'chen',
  过: 'guo',
  纪: 'ji',
  任: 'ren',
  燕: 'yan',
  缪: 'miao',
  员: 'yun',
  能: 'nai',
  乜: 'nie',
  柏: 'bai',
  薄: 'bo',
  卜: 'bu',
  贾: 'jia',
  句: 'gou',
  阚: 'kan',
  牟: 'mou',
  粘: 'nian',
  宁: 'ning',
  曲: 'qu',
  华: 'hua',
  重: 'chong',
  祭: 'zhai',
};

const COMPOUND_PINYIN: Record<string, string> = {
  万俟: 'mo qi',
  尉迟: 'yu chi',
  澹台: 'tan tai',
};

let pinyinIndex: Uint16Array | null = null;
let strokeTable: Uint8Array | null = null;

function tables(): { pinyinIndex: Uint16Array; strokeTable: Uint8Array } {
  if (!pinyinIndex || !strokeTable) {
    const pinyinBytes = Uint8Array.from(atob(HANZI_PINYIN_B64), (char) => char.charCodeAt(0));
    pinyinIndex = new Uint16Array(pinyinBytes.buffer, pinyinBytes.byteOffset, pinyinBytes.byteLength / 2);
    strokeTable = Uint8Array.from(atob(HANZI_STROKE_B64), (char) => char.charCodeAt(0));
  }
  return { pinyinIndex, strokeTable };
}

function lookup(char: string): { syllable: string; strokes: number } {
  const code = char.codePointAt(0) ?? 0;
  const index = code - HANZI_BASE;
  const loaded = tables();
  if (index < 0 || index >= loaded.strokeTable.length) return { syllable: '', strokes: 0 };
  return {
    syllable: HANZI_SYLLABLES[loaded.pinyinIndex[index] || 0] || '',
    strokes: loaded.strokeTable[index] || 0,
  };
}

function surnameLength(chars: string[]): number {
  if (chars.length < 2) return Math.min(1, chars.length);
  const pair = chars[0] + chars[1];
  return COMPOUND_SURNAMES.has(pair) || COMPOUND_PINYIN[pair] ? 2 : 1;
}

export function namePinyin(name: string): string {
  const chars = Array.from(String(name || '').trim());
  if (!chars.length) return '';
  const pair = chars.length >= 2 ? chars[0] + chars[1] : '';
  const syllables: string[] = [];
  if (pair && COMPOUND_PINYIN[pair]) syllables.push(...COMPOUND_PINYIN[pair].split(' '));
  for (let index = syllables.length; index < chars.length; index += 1) {
    const reading = index === 0 ? SURNAME_PINYIN[chars[0]] : '';
    syllables.push(reading || lookup(chars[index]).syllable || chars[index]);
  }
  return syllables.join(' ');
}

export function pinyinInitial(name: string): string {
  const letter = namePinyin(name).match(/[a-z]/i)?.[0]?.toUpperCase() || '';
  return letter >= 'A' && letter <= 'Z' ? letter : '';
}

export function surnameStrokes(name: string): number {
  const chars = Array.from(String(name || '').trim());
  const surname = chars.slice(0, surnameLength(chars));
  if (!surname.length) return 99;
  return surname.reduce((sum, char) => sum + (lookup(char).strokes || 99), 0);
}

export function buildNameIndex(candidates: readonly NameIndexCandidate[]): NameIndexGroup[] {
  const sortable: Array<NameIndexRow & { pinyin: string; strokes: number }> = [];
  for (const candidate of candidates) {
    const name = String(candidate.name || '').trim();
    if (!name) continue;
    const generation = Math.max(1, Math.floor(candidate.generation) + 1);
    const seen = new Set<number>();
    for (const chartNo of candidate.chartNos) {
      if (!Number.isFinite(chartNo) || seen.has(chartNo)) continue;
      seen.add(chartNo);
      sortable.push({
        personId: candidate.personId,
        name,
        generation,
        generationLabel: `${chineseGeneration(generation)}世`,
        chartNo,
        pageNo: candidate.pageNo ?? chartNo,
        suChartNo: candidate.suChartNo ?? 0,
        ouChartNo: candidate.ouChartNo ?? chartNo,
        pinyin: namePinyin(name),
        strokes: surnameStrokes(name),
      });
    }
  }
  sortable.sort((a, b) => {
    if (a.pinyin !== b.pinyin) return a.pinyin < b.pinyin ? -1 : 1;
    if (a.strokes !== b.strokes) return a.strokes - b.strokes;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.generation !== b.generation) return a.generation - b.generation;
    if (a.chartNo !== b.chartNo) return a.chartNo - b.chartNo;
    return a.personId < b.personId ? -1 : 1;
  });

  const groups = new Map<string, NameIndexRow[]>();
  for (const row of sortable) {
    const letter = pinyinInitial(row.name) || '#';
    const list = groups.get(letter) || [];
    list.push({
      personId: row.personId,
      name: row.name,
      pinyin: row.pinyin,
      generation: row.generation,
      generationLabel: row.generationLabel,
      chartNo: row.chartNo,
      pageNo: row.pageNo,
      suChartNo: row.suChartNo,
      ouChartNo: row.ouChartNo,
    });
    groups.set(letter, list);
  }
  return [...groups.keys()]
    .sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a < b ? -1 : 1))
    .filter((letter) => (groups.get(letter) || []).length > 0)
    .map((letter) => ({ letter, rows: groups.get(letter) || [] }));
}

export function nameIndexFromEntries(entries: readonly BiographySource[]): NameIndexGroup[] {
  const model = europeanViewFromShilu(lineageChartEntries(entries));
  const pages = fitEuropeanChartsToPages(buildEuropeanCharts(model.people, model.links));
  const appearances = indexChartAppearances(pages);
  const suAppearances = indexSuAppearances(buildSuCharts(model.people, model.links));
  const byId = new Map(entries.map((entry) => [String(entry.person_id), entry]));
  const candidates: NameIndexCandidate[] = [];
  for (const [id, appearance] of appearances) {
    const entry = byId.get(id);
    if (!entry || !hasFullBiography(entry.biography)) continue;
    const suChartNo = suAppearances.get(id)?.chartNo ?? 0;
    candidates.push({
      personId: id,
      name: entry.full_name,
      generation: entry.generation,
      chartNos: [appearance.chartNo],
      suChartNo,
      ouChartNo: appearance.chartNo,
      pageNo: suChartNo || appearance.chartNo,
    });
  }
  return buildNameIndex(candidates);
}

/** 字母组可以在同一页的两栏之间接上，但不能拆到下一页。 */
export function packIndexGroups(heights: readonly number[], firstBudget: number, budget: number): number[][] {
  const roomFor = (limit: number) => Math.max(1, limit * NAME_INDEX_COLUMNS - NAME_INDEX_PACK_SAFETY);
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  let room = roomFor(firstBudget);
  for (let index = 0; index < heights.length; index += 1) {
    const height = heights[index];
    if (page.length > 0 && used + height > room) {
      pages.push(page);
      page = [];
      used = 0;
      room = roomFor(budget);
    }
    page.push(index);
    used += height;
    if (height > room) {
      pages.push(page);
      page = [];
      used = 0;
      room = roomFor(budget);
    }
  }
  if (page.length) pages.push(page);
  return pages;
}

function chineseGeneration(generation: number): string {
  const value = Math.floor(generation);
  if (value <= 0) return String(generation);
  if (value < 10) return CN_DIGIT[value];
  if (value === 10) return '十';
  if (value < 20) return `十${CN_DIGIT[value - 10]}`;
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return `${CN_DIGIT[tens]}十${ones ? CN_DIGIT[ones] : ''}`;
  }
  return String(value);
}
