/**
 * 人物传和欧式五世表共用图号。
 * 图号取分页之后的第 N 图；同一人只记最先出现的那一格。
 */
import { fitEuropeanChartsToPages, type EuropeanChart } from '@/utils/european-chart';
import { europeanChartsFromShilu } from '@/utils/european-chart-shilu';
import { formatLifeYears } from '@/utils/genealogy-card';

export interface BiographyFigure {
  url: string;
  caption: string;
}

export interface ChartAppearance {
  chartNo: number;
  sequence: number;
  /** 这个人在哪些图里出现过。第一张是正文「见世系」的图号。 */
  chartNos: number[];
}

export interface BiographySource {
  person_id: string;
  full_name: string;
  generation: number;
  courtesy_name?: string;
  art_name?: string;
  birth_year?: number;
  death_year?: number;
  is_living?: boolean;
  native_place?: string;
  father_name?: string;
  biography?: string;
  achievements?: string;
  anecdotes?: string;
  epitaph?: string;
  source_note?: string;
  spouses?: { name?: string }[];
  figures?: BiographyFigure[];
  father_id?: string;
  rank?: number;
  child_type?: string;
  children?: { person_id?: string; name: string; rank?: number; child_type?: string }[];
}

export interface BiographyEntry {
  personId: string;
  name: string;
  chartNo: number;
  sequence: number;
  generationLabel: string;
  courtesy?: string;
  artName?: string;
  years: string;
  spouses: string;
  father?: string;
  nativePlace?: string;
  paragraphs: string[];
  note?: string;
  chartNos: number[];
  figures: BiographyFigure[];
}

export function biographyAnchorId(name: string, chartNo: number): string {
  return `bio-${String(name).trim()}-${chartNo}`;
}

export function treeAnchorId(chartNo: number): string {
  return `tree-${chartNo}`;
}

/** 条目前后的分隔只算外边距。内边距已经含在测得的高度里。 */
export const BIO_ENTRY_GAP_PX = 8;

const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

export function hasFullBiography(biography?: string): boolean {
  return Boolean(biography && biography.trim());
}

export function indexChartAppearances(charts: readonly EuropeanChart[]): Map<string, ChartAppearance> {
  const seen = new Map<string, ChartAppearance>();
  let sequence = 0;
  const ordered = [...charts].sort((a, b) => a.index - b.index);
  for (const chart of ordered) {
    const cells = [...chart.cells].sort((a, b) => a.row - b.row || a.col - b.col);
    for (const cell of cells) {
      const chartNo = chart.index + 1;
      const found = seen.get(cell.personId);
      if (!found) {
        sequence += 1;
        seen.set(cell.personId, { chartNo, sequence, chartNos: [chartNo] });
        continue;
      }
      if (!found.chartNos.includes(chartNo)) found.chartNos.push(chartNo);
    }
  }
  return seen;
}

export function buildBiographyEntries(
  entries: readonly BiographySource[],
  lineage?: readonly BiographySource[],
): BiographyEntry[] {
  if (!lineage) return entriesFromOwnCharts(entries);
  const chartSource = lineage.length ? lineage : entries;
  const appearances = indexChartAppearances(fitEuropeanChartsToPages(europeanChartsFromShilu(chartSource).charts));
  const list: BiographyEntry[] = [];
  let extra = appearances.size + 1;
  for (const entry of entries) {
    if (!hasFullBiography(entry.biography)) continue;
    const own = appearances.get(String(entry.person_id));
    const father = entry.father_id ? appearances.get(String(entry.father_id)) : undefined;
    const appearance = own
      ?? (father ? { chartNo: father.chartNo, sequence: extra, chartNos: [father.chartNo] } : { chartNo: 0, sequence: extra, chartNos: [] });
    if (!own) extra += 1;
    list.push(toBiographyEntry(entry, appearance));
  }
  list.sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name, 'zh'));
  return list;
}

function entriesFromOwnCharts(entries: readonly BiographySource[]): BiographyEntry[] {
  const appearances = indexChartAppearances(fitEuropeanChartsToPages(europeanChartsFromShilu(entries).charts));
  const byId = new Map(entries.map((entry) => [String(entry.person_id), entry]));
  const list: BiographyEntry[] = [];
  for (const [id, appearance] of appearances) {
    const entry = byId.get(id);
    if (!entry || !hasFullBiography(entry.biography)) continue;
    list.push(toBiographyEntry(entry, appearance));
  }
  list.sort((a, b) => a.sequence - b.sequence);
  return list;
}

export function packBiographyPages(heights: readonly number[], firstBudget: number, budget: number): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  let limit = Math.max(1, firstBudget);
  for (const [index, height] of heights.entries()) {
    const extra = page.length > 0 ? BIO_ENTRY_GAP_PX : 0;
    if (page.length > 0 && used + height + extra > limit) {
      pages.push(page);
      page = [];
      used = 0;
      limit = Math.max(1, budget);
    }
    page.push(index);
    used += height + (page.length > 1 ? BIO_ENTRY_GAP_PX : 0);
  }
  if (page.length) pages.push(page);
  return pages;
}

export function generationLabel(generation: number): string {
  return `第${chineseGeneration(generation)}世`;
}

function toBiographyEntry(entry: BiographySource, appearance: ChartAppearance): BiographyEntry {
  const spouses = (entry.spouses || [])
    .map((spouse) => String(spouse.name || '').trim())
    .filter(Boolean)
    .join('、');
  const notes = [entry.epitaph, entry.source_note]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return {
    personId: String(entry.person_id),
    name: entry.full_name,
    chartNo: appearance.chartNo,
    sequence: appearance.sequence,
    generationLabel: generationLabel(Math.max(1, Math.floor(entry.generation) + 1)),
    courtesy: text(entry.courtesy_name),
    artName: text(entry.art_name),
    years: formatLifeYears(entry.birth_year, entry.death_year, entry.is_living),
    spouses,
    father: text(entry.father_name),
    nativePlace: text(entry.native_place),
    paragraphs: storyParagraphs(entry),
    note: notes.length ? notes.join('；') : undefined,
    chartNos: appearance.chartNos,
    figures: (entry.figures || []).filter((figure) => figure.url),
  };
}

function storyParagraphs(entry: BiographySource): string[] {
  const paragraphs: string[] = [];
  for (const block of [entry.biography, entry.achievements, entry.anecdotes]) {
    const raw = String(block || '').trim();
    if (!raw) continue;
    for (const part of raw.split(/\n+/)) {
      const line = part.trim();
      if (line) paragraphs.push(line);
    }
  }
  return paragraphs;
}

function text(value: unknown): string | undefined {
  const raw = String(value ?? '').trim();
  return raw || undefined;
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
