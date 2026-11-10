/**
 * 册谱欧谱的印刷 HTML。五世一表，一图一页，格子里带字号、生卒、妻室、墓葬。
 */
import {
  EUROPEAN_GENERATIONS_PER_CHART,
  EUROPEAN_ROWS_PER_PAGE,
  buildEuropeanCharts,
  fitEuropeanChartsToPages,
  type EuropeanCell,
  type EuropeanChart,
} from './european-chart';
import { biographyAnchorId, treeAnchorId } from './biography-index';
import type { ShiluEntry } from './cepu.service';

interface ChartCaption {
  courtesyName?: string;
  artName?: string;
  birthYear?: number;
  deathYear?: number;
  isLiving?: boolean;
  burialPlace?: string;
  nativePlace?: string;
  offspring?: string;
  achievements?: string;
  anecdotes?: string;
  biography?: string;
  adoptionNote?: string;
  biographyChartNo?: number;
  citeBook?: '人物传' | '闺秀录';
}

export interface OuBookOptions {
  electronic?: boolean;
  script?: 'horizontal' | 'antique';
  titleVertical?: boolean;
  pack?: 'exclusive' | 'share';
}

export function renderOuChartBook(entries: ShiluEntry[], options: OuBookOptions = {}): string {
  const electronic = options.electronic !== false;
  const script = options.script === 'antique' ? 'antique' : 'horizontal';
  const titleVertical = script === 'antique' && options.titleVertical === true;
  const pack = options.pack === 'share' ? 'share' : 'exclusive';
  const { charts, captions } = chartsFromEntries(entries);
  const pages = groupCharts(fitEuropeanChartsToPages(charts), pack);
  if (pages.length === 0) return '<p class="vol-content">（该卷暂无世录条目）</p>';
  return `<div class="ou-book">${pages.map((group, index) => renderSheet(group, captions, index + 1, pages.length, electronic, script, titleVertical)).join('')}</div>`;
}

function groupCharts(charts: EuropeanChart[], pack: 'exclusive' | 'share'): EuropeanChart[][] {
  if (pack !== 'share') return charts.map((chart) => [chart]);
  const groups: EuropeanChart[][] = [];
  let bucket: EuropeanChart[] = [];
  let rows = 0;
  for (const chart of charts) {
    const need = Math.max(1, chart.rowCount);
    if (bucket.length && rows + need > EUROPEAN_ROWS_PER_PAGE) {
      groups.push(bucket);
      bucket = [];
      rows = 0;
    }
    bucket.push(chart);
    rows += need;
  }
  if (bucket.length) groups.push(bucket);
  return groups;
}

export function ouChartCss(): string {
  return `
    .ou-book { margin: -24mm -20mm 0; background: #fff; }
    .ou-sheet {
      position: relative;
      width: 210mm;
      height: 297mm;
      margin: 0;
      padding: 30mm 15mm 25mm 20mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      background: #fff;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .ou-sheet.is-even { padding: 30mm 20mm 25mm 15mm; }
    .ou-sheet-foot {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 8mm;
      margin: 0;
      text-align: center;
      font-size: 12px;
      letter-spacing: 0.12em;
      color: #666;
    }
    .ou-stage {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
      width: 100%;
    }
    .ou-block {
      flex: 0 0 auto;
      width: 100%;
      padding: 4mm 0;
      box-sizing: border-box;
    }
    .ou-sheet.is-centered .ou-block {
      margin-top: auto;
      margin-bottom: auto;
    }
    .ou-tree-anchor { display: block; width: 0; height: 0; overflow: hidden; }
    .ou-sheet-title {
      margin: 0;
      text-align: center;
      font-family: 'Songti SC', 'STSong', 'Source Han Serif SC', 'Noto Serif SC', serif;
      font-size: 16pt;
      letter-spacing: 0.28em;
      white-space: nowrap;
      color: #2a241c;
    }
    .ou-frame { flex: 0 0 auto; border: 2px solid #111; background: #fff; }
    .ou-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      font-family: 'Songti SC', 'STSong', 'Source Han Serif SC', 'Noto Serif SC', serif;
      color: #111;
    }
    .ou-table th, .ou-table td {
      border: 1px solid #222;
      text-align: center;
      vertical-align: top;
      background: #fff;
    }
    .ou-table th {
      padding: 4px 6px;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-align: center;
      background: #f4f1e8;
      white-space: nowrap;
    }
    .ou-table td { padding: 0; }
    .ou-table td.is-root-gen,
    .ou-table td.is-root-gen .ou-person { background: #f6efd8; }
    .ou-person {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 10px 4px 6px;
      box-sizing: border-box;
    }
    .ou-flow {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      gap: 2px;
      width: 100%;
      min-width: 0;
    }
    .ou-name, .ou-courtesy, .ou-years, .ou-kin, .ou-bio, .ou-xref {
      writing-mode: horizontal-tb;
      direction: ltr;
      text-align: right;
      width: 100%;
      max-width: 100%;
      white-space: normal;
      word-break: break-all;
    }
    .ou-name { font-size: 18px; font-weight: 700; letter-spacing: 0.08em; color: #111; white-space: nowrap; word-break: keep-all; }
    .ou-years { font-size: 12px; color: #333; }
    .ou-kin { font-size: 11px; color: #444; }
    .ou-courtesy { font-size: 13px; font-weight: 600; color: #222; }
    .ou-bio { font-size: 10px; line-height: 1.4; color: #555; }
    .ou-xref { font-size: 10px; line-height: 1.4; color: #888; }
    a.book-jump { color: #1a56c4; font-size: 10px; line-height: 1.4; text-decoration: underline; }
    .ou-meta { margin-inline: 0.08em; }
    .ou-num, .ou-dash {
      writing-mode: horizontal-tb;
      display: inline-block;
      letter-spacing: 0;
      line-height: 1;
      white-space: nowrap;
    }
    .ou-seam {
      position: absolute;
      top: 2px;
      left: 3px;
      writing-mode: horizontal-tb;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #c0392b;
      line-height: 1;
    }
    .ou-sheet.is-antique,
    .ou-sheet.is-antique .ou-table,
    .ou-sheet.is-antique .ou-sheet-title,
    .ou-sheet.is-antique .ou-sheet-foot {
      font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
    }
    .ou-sheet.is-antique .ou-sheet-title { font-size: 18px; }
    .ou-sheet.is-antique.is-title-vertical .ou-sheet-title {
      writing-mode: vertical-rl;
      text-orientation: upright;
      width: max-content;
      margin-left: auto;
      margin-right: 0;
      text-align: start;
      letter-spacing: 0.22em;
    }
    .ou-sheet.is-antique .ou-table th {
      writing-mode: vertical-rl;
      text-orientation: upright;
      height: 64px;
      letter-spacing: 0.18em;
    }
    .ou-sheet.is-antique .ou-flow {
      flex-direction: row-reverse;
      align-items: flex-start;
      justify-content: flex-start;
      gap: 3px;
      width: auto;
      max-width: 100%;
      height: 100%;
    }
    .ou-sheet.is-antique .ou-name,
    .ou-sheet.is-antique .ou-courtesy,
    .ou-sheet.is-antique .ou-years,
    .ou-sheet.is-antique .ou-kin,
    .ou-sheet.is-antique .ou-bio,
    .ou-sheet.is-antique .ou-xref,
    .ou-sheet.is-antique a.book-jump {
      writing-mode: vertical-rl;
      text-orientation: upright;
      width: auto;
      max-width: none;
      text-align: start;
      word-break: keep-all;
    }
    .ou-sheet.is-antique .ou-name { font-size: 18px; white-space: nowrap; }
    .ou-sheet.is-antique .ou-courtesy { font-size: 13px; }
    .ou-sheet.is-antique .ou-years { font-size: 12px; }
    .ou-sheet.is-antique .ou-kin { font-size: 11px; }
    .ou-sheet.is-antique .ou-courtesy,
    .ou-sheet.is-antique .ou-years,
    .ou-sheet.is-antique .ou-kin,
    .ou-sheet.is-antique .ou-bio,
    .ou-sheet.is-antique .ou-xref,
    .ou-sheet.is-antique a.book-jump {
      white-space: normal;
      max-height: 100%;
    }
    .ou-sheet.is-antique .ou-bio,
    .ou-sheet.is-antique .ou-xref,
    .ou-sheet.is-antique a.book-jump { font-size: 10px; }
    .ou-sheet.is-antique .ou-seam {
      writing-mode: vertical-rl;
      text-orientation: upright;
      top: 1px;
      left: 1px;
    }
    .ou-sheet.is-antique .ou-sheet-foot { writing-mode: horizontal-tb; }
    .book-prose.is-antique {
      writing-mode: vertical-rl;
      text-orientation: upright;
      font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
    }
    .book-prose.is-antique .vol-title,
    .book-prose.is-antique .vol-content,
    .book-prose.is-antique .entry,
    .book-prose.is-antique .entry-head,
    .book-prose.is-antique .bio {
      writing-mode: vertical-rl;
      text-orientation: upright;
    }
  `;
}

function chartsFromEntries(entries: ShiluEntry[]): {
  charts: EuropeanChart[];
  captions: Record<string, ChartCaption>;
} {
  const people = [];
  const links = [];
  const captions: Record<string, ChartCaption> = {};
  const ids = new Set<string>();
  for (const entry of entries) {
    const id = String(entry.person_id || '').trim();
    if (!id || ids.has(id)) continue;
    ids.add(id);
    people.push({
      id,
      name: entry.full_name || id,
      generation: Math.max(1, Math.floor(entry.generation) + 1),
      birthOrder: finite(entry.rank),
      childType: entry.child_type,
      spouses: (entry.spouses || [])
        .map((spouse) => ({ name: String(spouse.name || '').trim(), marriageOrder: finite(spouse.marriage_order) }))
        .filter((spouse) => spouse.name),
    });
    const offspring = (entry.children || [])
      .map((child) => text(child.name))
      .filter((name): name is string => Boolean(name))
      .join('、');
    captions[id] = {
      courtesyName: text(entry.courtesy_name),
      artName: text(entry.art_name),
      birthYear: finite(entry.birth_year),
      deathYear: finite(entry.death_year),
      isLiving: entry.is_living,
      burialPlace: text(entry.burial_place),
      nativePlace: text(entry.native_place),
      offspring: offspring || undefined,
      achievements: text(entry.achievements),
      anecdotes: text(entry.anecdotes),
      biography: text(entry.biography),
      adoptionNote: text(entry.adoption_note),
      citeBook: entry.gender === 'female' ? '闺秀录' : '人物传',
    };
  }
  for (const entry of entries) {
    const id = String(entry.person_id || '').trim();
    const fatherId = String(entry.father_id || '').trim();
    if (!id || !fatherId || !ids.has(id) || !ids.has(fatherId) || fatherId === id) continue;
    links.push({
      parentId: fatherId,
      childId: id,
      birthOrder: finite(entry.rank),
      childType: entry.child_type,
    });
  }
  return { charts: buildEuropeanCharts(people, links), captions };
}

function renderSheet(
  charts: EuropeanChart[],
  captions: Record<string, ChartCaption>,
  pageNumber: number,
  pageCount: number,
  electronic: boolean,
  script: 'horizontal' | 'antique',
  titleVertical: boolean,
): string {
  const side = pageNumber % 2 === 0 ? 'is-even' : 'is-odd';
  const antique = script === 'antique' ? ' is-antique' : '';
  const titled = titleVertical ? ' is-title-vertical' : '';
  const blocks = charts.map((chart) => {
    const table = renderTable(chart, captions, electronic, script);
    const heading = `<a id="${treeAnchorId(chart.index + 1)}" class="ou-tree-anchor"></a><h2 class="ou-sheet-title">${chartHeading(chart)}</h2>`;
    return { heading, table };
  });
  const foot = `<p class="ou-sheet-foot">第 ${pageNumber} 页 / 共 ${pageCount} 页</p>`;
  if (blocks.length === 1) {
    const block = blocks[0];
    return `<section class="ou-sheet ${side} is-centered${antique}${titled}">${block.heading}<div class="ou-stage"><div class="ou-block"><div class="ou-frame">${block.table}</div></div></div>${foot}</section>`;
  }
  const inner = blocks.map((block) => `<div class="ou-block">${block.heading}<div class="ou-frame">${block.table}</div></div>`).join('');
  return `<section class="ou-sheet ${side} is-centered${antique}${titled}"><div class="ou-stage">${inner}</div>${foot}</section>`;
}

function renderTable(
  chart: EuropeanChart,
  captions: Record<string, ChartCaption>,
  electronic: boolean,
  script: 'horizontal' | 'antique',
): string {
  const colCount = EUROPEAN_GENERATIONS_PER_CHART;
  const displayCols = Array.from({ length: colCount }, (_, index) => colCount - 1 - index);
  const headers = displayCols.map((col) => `<th>${esc(generationTitle(chart.generationFrom + col))}</th>`).join('');
  const byStart = new Map<string, EuropeanCell>();
  for (const cell of chart.cells) byStart.set(`${cell.col}:${cell.row}`, cell);
  const rows: string[] = [];
  for (let row = 0; row < chart.rowCount; row += 1) {
    const cells: string[] = [];
    for (const col of displayCols) {
      const cell = byStart.get(`${col}:${row}`);
      if (cell) cells.push(renderCell(cell, captions, chart, electronic, script));
      else if (!covered(chart, col, row)) cells.push('<td class="ou-blank"></td>');
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table class="ou-table"><thead><tr>${headers}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function chartHeading(chart: EuropeanChart): string {
  const from = generationTitle(chart.generationFrom);
  const to = generationTitle(chart.generationFrom + EUROPEAN_GENERATIONS_PER_CHART - 1);
  return `第${chart.index + 1}图 · ${from}至${to}`;
}

function renderCell(
  cell: EuropeanCell,
  captions: Record<string, ChartCaption>,
  chart: EuropeanChart,
  electronic: boolean,
  script: 'horizontal' | 'antique',
): string {
  const seam = cell.role === 'carried-in' ? '接上' : cell.role === 'carried-out' ? '接下' : '';
  const caption = captions[cell.personId];
  const years = lifeYears(caption);
  const record = recordText(caption);
  const xref = crossReference(cell, caption, chart.index + 1, electronic);
  const root = cell.col === 0 ? ' is-root-gen' : '';
  const seamHtml = seam ? `<span class="ou-seam">${seam}</span>` : '';
  if (script === 'antique') {
    const courtesy = antiqueCourtesy(cell, caption);
    const kin = [cell.spouseText, caption?.burialPlace ? `葬${caption.burialPlace}` : ''].filter(Boolean).join('');
    return `<td class="${root.trim()}" rowspan="${cell.rowSpan}"><div class="ou-person">${seamHtml}<span class="ou-flow"><span class="ou-name">${esc(cell.name)}</span>${courtesy ? `<span class="ou-courtesy">${esc(courtesy)}</span>` : ''}${years ? `<span class="ou-years">${esc(years)}</span>` : ''}${kin ? `<span class="ou-kin">${esc(kin)}</span>` : ''}${record ? `<span class="ou-bio">${esc(record)}</span>` : ''}${xref}</span></div></td>`;
  }
  const courtesy = courtesyText(cell, caption);
  const spouse = cell.spouseText ? `<span class="ou-kin">${esc(cell.spouseText)}</span>` : '';
  const burial = caption?.burialPlace ? `<span class="ou-kin">${esc(`葬${caption.burialPlace}`)}</span>` : '';
  return `<td class="${root.trim()}" rowspan="${cell.rowSpan}"><div class="ou-person">${seamHtml}<span class="ou-flow"><span class="ou-name">${esc(cell.name)}</span>${years ? `<span class="ou-years">${renderPieces(years)}</span>` : ''}${spouse}${burial}${courtesy ? `<span class="ou-courtesy">${esc(courtesy)}</span>` : ''}${record ? `<span class="ou-bio">${esc(record)}</span>` : ''}${xref}</span></div></td>`;
}

function antiqueCourtesy(cell: EuropeanCell, caption?: ChartCaption): string {
  const lines: string[] = [];
  if (cell.mark) lines.push(cell.mark);
  if (caption?.courtesyName) lines.push(`字${caption.courtesyName}`);
  if (caption?.artName) lines.push(`号${caption.artName}`);
  return lines.join('');
}

function crossReference(cell: EuropeanCell, caption: ChartCaption | undefined, chartNo: number, electronic: boolean): string {
  if (!caption?.biography?.trim()) return '';
  const book = caption?.citeBook === '闺秀录' ? '闺秀录' : '人物传';
  const label = `详见${book}·第${chartNo}图｜${cell.name}`;
  if (!electronic) return `<span class="ou-xref">${esc(`【${label}】`)}</span>`;
  const href = esc(`#${biographyAnchorId(cell.name, chartNo)}`);
  const title = esc(`跳转到${book}：${cell.name}，第${chartNo}图`);
  return `<a class="book-jump" href="${href}" title="${title}">${esc(label)}</a>`;
}

function courtesyText(cell: EuropeanCell, caption?: ChartCaption): string {
  const lines: string[] = [];
  if (cell.mark) lines.push(cell.mark);
  if (caption?.courtesyName) lines.push(`字${caption.courtesyName}`);
  return lines.join('');
}

const RECORD_LIMIT = 16;

function recordText(caption?: ChartCaption): string {
  if (!caption) return '';
  const parts: string[] = [];
  if (caption.nativePlace) parts.push(`籍${caption.nativePlace}`);
  if (caption.offspring) parts.push(`子${caption.offspring}`);
  if (caption.achievements) parts.push(caption.achievements);
  if (caption.biography) parts.push(caption.biography);
  if (caption.anecdotes) parts.push(caption.anecdotes);
  if (caption.adoptionNote) parts.push(caption.adoptionNote);
  const text = parts.join('。').replace(/。{2,}/g, '。');
  if (text.length <= RECORD_LIMIT) return text;
  return `${text.slice(0, RECORD_LIMIT)}…`;
}

function renderPieces(line: string): string {
  const matcher = /(\d+|-)/g;
  let cursor = 0;
  let html = '';
  for (const match of line.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > cursor) html += esc(line.slice(cursor, index));
    const token = match[1] || '';
    const kind = token.includes('-') ? 'ou-dash' : 'ou-num';
    html += `<span class="${kind}">${esc(token)}</span>`;
    cursor = index + token.length;
  }
  if (cursor < line.length) html += esc(line.slice(cursor));
  return html || esc(line);
}

function lifeYears(caption?: ChartCaption): string {
  if (!caption) return '';
  const birth = caption.birthYear ? String(caption.birthYear) : '';
  const death = caption.isLiving ? '' : caption.deathYear ? String(caption.deathYear) : '';
  if (birth && death) return `${birth}-${death}`;
  if (birth) return `${birth}-`;
  if (death) return `-${death}`;
  return '';
}

function covered(chart: EuropeanChart, col: number, row: number): boolean {
  return chart.cells.some((cell) => cell.col === col && cell.row < row && row < cell.row + cell.rowSpan);
}

const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

function generationTitle(generation: number): string {
  return `第${chineseGeneration(generation)}世`;
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

function finite(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function text(value: unknown): string | undefined {
  const raw = String(value ?? '').trim();
  return raw || undefined;
}

function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
