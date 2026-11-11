/**
 * 册谱苏谱的印刷 HTML。
 * 版本A横排简体：竖向 A4，长房在左，文字在垂珠线右侧，珠圈圆心在交叉点上。
 * 版本B仿古横版：横向 A4，长房在右，文字竖排，不画兄弟横线。
 * 欧式不走这里。
 */
import type { ShiluEntry } from './cepu.service';
import {
  SU_BLOCKS_PER_PAGE,
  buildSuCharts,
  groupSuCharts,
  nestSuBlocks,
  placeSuChart,
  suFrameWeightPt,
  type SuBeadNode,
  type SuBlock,
  type SuChart,
} from './su-chart';
import { continueNoteMode, formatContinueNote, type ContinueNote, type ContinueNoteMode } from './continue-note';
import { chartPortraitUrl } from './chart-portrait';

export interface SuBookOptions {
  electronic?: boolean;
  script?: 'horizontal' | 'antique';
  titleVertical?: boolean;
  pack?: 'exclusive' | 'share';
  beadLines?: boolean;
  /** 版本A四边等粗的细线版框。仿古版不使用。 */
  showFrame?: boolean;
  /** 版本A版框线宽，四边同一数值。 */
  framePt?: number;
  /** 古式简注 brief，新式详注 full。 */
  continueNote?: ContinueNoteMode;
  /** 版本A人物头像。仿古版忽略。 */
  showAvatars?: boolean;
}

interface Caption {
  courtesyName?: string;
  artName?: string;
  birthYear?: number;
  deathYear?: number;
  isLiving?: boolean;
  burialPlace?: string;
  achievements?: string;
  biography?: string;
  citeBook?: '人物传' | '闺秀录';
  avatarUrl?: string;
}

export function renderSuChartBook(entries: ShiluEntry[], options: SuBookOptions = {}): string {
  const electronic = options.electronic !== false;
  const script = options.script === 'antique' ? 'antique' : 'horizontal';
  const titleVertical = script === 'antique' && options.titleVertical === true;
  const pack = options.pack === 'share' ? 'share' : 'exclusive';
  const beadLines = options.beadLines === true;
  const showFrame = script !== 'antique' && options.showFrame === true;
  const framePt = suFrameWeightPt(options.framePt);
  const noteMode = continueNoteMode(options.continueNote, script);
  const showAvatars = script !== 'antique' && options.showAvatars !== false;
  const { charts, captions } = chartsFromEntries(entries);
  const pages = groupSuCharts(charts, pack);
  if (pages.length === 0) return '<p class="vol-content">（该卷暂无世录条目）</p>';
  const chartPages = new Map<number, number>();
  pages.forEach((group, index) => {
    for (const chart of group) chartPages.set(chart.index + 1, index + 1);
  });
  const bookClass = script === 'antique' ? 'su-book is-antique' : 'su-book';
  return `<div class="${bookClass}">${pages.map((group, index) => renderSheet(group, captions, index + 1, pages.length, electronic, script, titleVertical, beadLines, showFrame, framePt, noteMode, chartPages, showAvatars)).join('')}</div>`;
}

export function suChartCss(): string {
  return `
    @page su-landscape { size: A4 landscape; margin: 0; }
    .su-book { margin: -24mm -20mm 0; background: #fff; }
    .su-sheet {
      position: relative;
      width: 210mm;
      height: 297mm;
      margin: 0;
      padding: 18mm 12mm 16mm 14mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      background: #fff;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
      break-inside: avoid;
      page-break-inside: avoid;
      font-family: 'Songti SC', 'STSong', 'SimSun', serif;
      color: #1a1a1a;
      writing-mode: horizontal-tb;
    }
    .su-sheet.is-even { padding: 18mm 14mm 16mm 12mm; }
    .su-stage { flex: 1 1 auto; min-height: 0; width: 100%; position: relative; }
    .su-branch + .su-branch { margin-top: 8mm; }
    .su-anchor { display: block; width: 0; height: 0; overflow: hidden; }
    .su-title {
      margin: 0 0 4mm; text-align: center; font-size: 16px; font-weight: 600;
      letter-spacing: 0.28em; writing-mode: horizontal-tb;
    }
    .su-plate { position: relative; margin: 0 auto; writing-mode: horizontal-tb; }
    .su-rail { position: absolute; top: 0; bottom: 0; z-index: 1; width: 0.4pt; background: #000; }
    .su-band { position: absolute; left: 0; right: 14mm; z-index: 1; height: 0; border-top: 0.3pt solid #000; }
    .su-gen { position: absolute; z-index: 3; overflow: hidden; color: #5c564c; font-size: 11px; line-height: 1.2; letter-spacing: 0.06em; }
    .su-gen.is-boxed {
      box-sizing: border-box; border: none; background: #000; color: #fff;
      font-size: 12px; line-height: 1.15; letter-spacing: 0.16em; text-align: center;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .su-rule { position: absolute; z-index: 1; background: #000; }
    .su-rule.is-v { width: 0.4pt; transform: translateX(-0.2pt); }
    .su-rule.is-h { height: 0.4pt; transform: translateY(-0.2pt); }
    .su-bead {
      position: absolute; z-index: 2; box-sizing: border-box; width: 2.4mm; height: 2.4mm;
      margin-left: -1.2mm; margin-top: -1.2mm; border: 0.4pt solid #000; border-radius: 50%;
      background: #fff;
    }
    .su-person .su-seam {
      position: static; display: block; margin: 0.4mm 0 0; color: #c0392b;
      font-size: 10px; font-weight: 700; line-height: 1.3; letter-spacing: 0.02em;
      white-space: normal;
    }
    .su-continue { display: block; }
    .su-vrun .su-seam { writing-mode: horizontal-tb; text-orientation: mixed; }
    .su-continue-link, .su-person .su-seam a { color: #c0392b; text-decoration: underline; }
    .su-seam.is-off { letter-spacing: 0; white-space: nowrap; }
    .su-person { position: absolute; z-index: 3; box-sizing: border-box; margin: 0; padding: 0; overflow: hidden; background: transparent; }
    .su-name-row { display: flex; flex-wrap: wrap; align-items: center; gap: 1mm; }
    .su-name { font-size: 15px; font-weight: 700; letter-spacing: 0.08em; line-height: 1.25; }
    .su-avatar {
      flex: 0 0 auto; width: 6.4mm; height: 6.4mm; margin: 0 1.2mm 0 0;
      border-radius: 50%; object-fit: cover; background: transparent;
    }
    .su-courtesy { font-size: 12px; font-weight: 600; line-height: 1.3; }
    .su-meta { font-size: 11px; line-height: 1.2; }
    .su-years, .su-kin, .su-mark, .su-brief, .su-jump, .su-omit { margin: 0; line-height: 1.35; }
    .su-years, .su-kin, .su-mark { font-size: 11px; }
    .su-brief, .su-omit, a.su-jump, .su-jump { font-size: 10px; color: #555; }
    a.su-jump { color: #1a56c4; text-decoration: underline; }
    .su-foot {
      position: absolute; left: 0; right: 0; bottom: 6mm; margin: 0;
      text-align: center; font-size: 12px; letter-spacing: 0.14em; color: #666;
      writing-mode: horizontal-tb;
    }
    .su-sheet.is-modern-frame::before {
      content: '';
      position: absolute;
      z-index: 6;
      top: 10mm;
      right: 8mm;
      bottom: 12mm;
      left: 8mm;
      border-style: solid;
      border-color: #000;
      border-width: var(--su-frame-pt, 4pt);
      pointer-events: none;
    }
    .su-sheet.is-antique {
      width: 297mm; height: 210mm; padding: 8mm 8mm 10mm;
      background: #fff; color: #000;
      font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
      page: su-landscape;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .su-sheet.is-antique .su-frame {
      position: relative; box-sizing: border-box; height: 100%;
      padding: 3mm 16mm 3mm 3mm;
      border-top: 1.2pt solid #000; border-bottom: 1.2pt solid #000;
      border-left: 0.6pt solid #000; border-right: 0.6pt solid #000;
    }
    .su-sheet.is-antique .su-title {
      position: absolute; top: 4mm; right: 3mm; z-index: 5; width: 10mm; max-height: 160mm; margin: 0;
      overflow: hidden; writing-mode: vertical-rl; text-orientation: upright; text-align: start;
      letter-spacing: 0.16em; line-height: 1.15; font-size: 14px; font-weight: 600; color: #000;
    }
    .su-sheet.is-antique .su-name,
    .su-sheet.is-antique .su-meta,
    .su-sheet.is-antique .su-courtesy,
    .su-sheet.is-antique .su-years,
    .su-sheet.is-antique .su-kin,
    .su-sheet.is-antique .su-mark,
    .su-sheet.is-antique .su-brief,
    .su-sheet.is-antique .su-foot { color: #000; }
    .su-sheet.is-antique a.su-jump { color: #000; text-decoration: none; border-bottom: 0.4pt solid #000; }
    .su-plate.is-antique { margin-left: auto; margin-right: 0; border: none; }
  `;
}

function renderSheet(
  charts: SuChart[],
  captions: Record<string, Caption>,
  pageNumber: number,
  pageCount: number,
  electronic: boolean,
  script: 'horizontal' | 'antique',
  titleVertical: boolean,
  beadLines: boolean,
  showFrame: boolean,
  framePt: number,
  noteMode: ContinueNoteMode,
  chartPages: Map<number, number>,
  showAvatars: boolean,
): string {
  const antique = script === 'antique';
  const classes = ['su-sheet', pageNumber % 2 === 0 ? 'is-even' : 'is-odd'];
  if (antique) classes.push('is-antique', 'is-landscape', 'is-title-vertical');
  else if (titleVertical) classes.push('is-title-vertical');
  if (!antique && showFrame) classes.push('is-modern-frame');
  const frameStyle = !antique && showFrame ? ` style="--su-frame-pt:${framePt}pt"` : '';
  const body = charts.map((chart) => renderBranch(chart, captions, electronic, script, beadLines, noteMode, chartPages, showAvatars)).join('');
  const stage = antique ? `<div class="su-stage su-frame">${body}</div>` : `<div class="su-stage">${body}</div>`;
  return `<section class="${classes.join(' ')}"${frameStyle}>${stage}<p class="su-foot">第 ${pageNumber} 页 / 共 ${pageCount} 页</p></section>`;
}

function renderBranch(
  chart: SuChart,
  captions: Record<string, Caption>,
  electronic: boolean,
  script: 'horizontal' | 'antique',
  beadLines: boolean,
  noteMode: ContinueNoteMode,
  chartPages: Map<number, number>,
  showAvatars: boolean,
): string {
  const nodes = nestSuBlocks(chart.blocks);
  const place = placeSuChart(nodes, script);
  const byIndex = indexNodes(nodes);
  const antique = script === 'antique';
  const rail = place.railX == null ? '' : `<span class="su-rail" style="left:${place.railX}mm"></span>`;
  const bands = place.bands.map((y) => `<span class="su-band" style="top:${y}mm"></span>`).join('');
  const gens = place.generations.map((band) => {
    const mode = band.boxed ? 'vertical-rl' : 'horizontal-tb';
    const orient = band.boxed ? 'upright' : 'mixed';
    return `<div class="su-gen${band.boxed ? ' is-boxed' : ''}" style="left:${band.x}mm;top:${band.y}mm;width:${band.w}mm;height:${band.h}mm;writing-mode:${mode};text-orientation:${orient}">${esc(band.label)}</div>`;
  }).join('');
  const rules = beadLines
    ? place.lines.map((rule) => {
      const box = rule.axis === 'h'
        ? `left:${rule.x}mm;top:${rule.y}mm;width:${rule.length}mm`
        : `left:${rule.x}mm;top:${rule.y}mm;height:${rule.length}mm`;
      return `<span class="su-rule is-${rule.axis}" data-parent-id="${esc(rule.parentId)}" style="${box}"></span>`;
    }).join('')
    : '';
  const beads = beadLines
    ? place.beads.map((bead) => `<span class="su-bead" data-person-id="${esc(bead.personId)}" style="left:${bead.x}mm;top:${bead.y}mm"></span>`).join('')
    : '';
  const people = place.people.map((person) => {
    const node = byIndex.get(person.index);
    if (!node) return '';
    return renderPerson(node, person, chart, captions, electronic, antique, noteMode, chartPages, showAvatars);
  }).join('');
  const titleName = antique ? chart.branchName.replace(/支世系$/, '支派') : chart.branchName;
  return `<div class="su-branch"><a id="tree-su-${chart.index + 1}" class="su-anchor"></a><h2 class="su-title">第${chart.index + 1}图 · ${esc(titleName)}</h2><div class="su-plate${antique ? ' is-antique' : ''}" data-reading="${place.reading}" style="width:${place.width}mm;height:${place.height}mm;writing-mode:horizontal-tb">${rail}${bands}${gens}${rules}${beads}${people}</div></div>`;
}

function renderPerson(
  node: SuBeadNode,
  person: { textX: number; textY: number; textW: number; textH: number; col: number; row: number },
  chart: SuChart,
  captions: Record<string, Caption>,
  electronic: boolean,
  antique: boolean,
  noteMode: ContinueNoteMode,
  chartPages: Map<number, number>,
  showAvatars: boolean,
): string {
  const block = node.block;
  const caption = captions[block.personId];
  const courtesy = courtesyText(caption);
  const years = lifeYears(caption);
  const burial = caption?.burialPlace ? `葬${caption.burialPlace}` : '';
  const brief = briefText(caption?.achievements);
  const carriedIn = block.role === 'carried-in' || block.role === 'bridge';
  const anchor = carriedIn ? '' : ` id="shilu-${esc(block.personId)}"`;
  const jump = caption?.biography
    ? renderJump(block.name, chart.index + 1, caption.citeBook || '人物传', electronic)
    : '';
  const note = renderContinue(block, electronic, noteMode, chartPages);
  const mode = antique ? 'vertical-rl' : 'horizontal-tb';
  const orient = antique ? 'upright' : 'mixed';
  const style = `left:${person.textX}mm;top:${person.textY}mm;width:${person.textW}mm;height:${person.textH}mm;writing-mode:${mode};text-orientation:${orient}`;
  const avatar = !antique && showAvatars ? renderAvatar(caption?.avatarUrl) : '';
  const body = antique
    ? `<div class="su-vrun"><span class="su-name">${esc(block.name)}</span>${antiqueFields(node, caption).map((field) => `<span class="su-meta">${esc(field)}</span>`).join('')}${note}</div>${jump}`
    : `<div class="su-body"><div class="su-name-row">${avatar}<span class="su-name">${esc(block.name)}</span>${courtesy ? `<span class="su-courtesy">（${esc(courtesy)}）</span>` : ''}</div>${years ? `<p class="su-years">${esc(years)}</p>` : ''}${block.spouseText ? `<p class="su-kin">${esc(block.spouseText)}</p>` : ''}${burial ? `<p class="su-kin">${esc(burial)}</p>` : ''}${block.mark ? `<p class="su-mark">${esc(block.mark)}</p>` : ''}${brief ? `<p class="su-brief">${esc(brief)}</p>` : ''}${note}</div>${jump}`;
  return `<article class="su-person${person.row === 0 ? ' is-head' : ''}"${anchor} data-person-id="${esc(block.personId)}" data-col="${person.col}" data-row="${person.row}" data-depth="${block.depth}" style="${style}">${body}</article>`;
}

function antiqueFields(node: SuBeadNode, caption: Caption | undefined): string[] {
  const fields: string[] = [];
  if (caption?.courtesyName) fields.push(`字${caption.courtesyName}`);
  if (caption?.artName) fields.push(`号${caption.artName}`);
  const years = lifeYears(caption);
  if (years) fields.push(years);
  if (node.block.spouseText) fields.push(node.block.spouseText);
  const children = node.children.map((child) => child.block.name).filter((name) => name.length > 0);
  if (children.length) fields.push(`子${children.join('、')}`);
  if (caption?.burialPlace) fields.push(`葬${caption.burialPlace}`);
  if (node.block.mark) fields.push(node.block.mark);
  return fields;
}

function indexNodes(roots: readonly SuBeadNode[]): Map<number, SuBeadNode> {
  const map = new Map<number, SuBeadNode>();
  const visit = (node: SuBeadNode) => {
    map.set(node.index, node);
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return map;
}

function renderContinue(
  block: SuBlock,
  electronic: boolean,
  noteMode: ContinueNoteMode,
  chartPages: Map<number, number>,
): string {
  const notes: ContinueNote[] = [];
  for (const chartNo of block.cutChartNos ?? []) {
    notes.push({ kind: 'cut', chartNo, pageNo: chartPages.get(chartNo) ?? null });
  }
  if (block.resumeChartNo) {
    notes.push({
      kind: 'resume',
      chartNo: block.resumeChartNo,
      pageNo: chartPages.get(block.resumeChartNo) ?? null,
      fatherName: block.resumeFatherName || block.parentName || block.name,
    });
  }
  if (!notes.length) return '';
  const lines = notes.map((note) => {
    const parts = formatContinueNote(note, noteMode);
    const href = `#tree-su-${note.chartNo}`;
    const link = electronic
      ? `<a class="su-continue-link" href="${esc(href)}">${esc(parts.linkText)}</a>`
      : esc(parts.linkText);
    return `<span class="su-continue">${esc(parts.lead)}${link}${esc(parts.tail)}</span>`;
  }).join('');
  return `<p class="su-seam">${lines}</p>`;
}

function renderAvatar(value: string | undefined): string {
  const src = chartPortraitUrl(value);
  if (!src) return '';
  return `<img class="su-avatar" src="${esc(src)}" alt="" onerror="this.remove()" />`;
}

function renderJump(name: string, chartNo: number, book: string, electronic: boolean): string {
  const label = '详见人物传';
  if (!electronic) return `<p class="su-jump">${label}</p>`;
  const href = esc(`#bio-su-${name.trim()}-${chartNo}`);
  return `<a class="su-jump" href="${href}" title="${esc(`跳转到${book}：${name}`)}">${label}</a>`;
}

function courtesyText(caption: Caption | undefined): string {
  const parts: string[] = [];
  if (caption?.courtesyName) parts.push(`字${caption.courtesyName}`);
  if (caption?.artName) parts.push(`号${caption.artName}`);
  return parts.join('，');
}

function lifeYears(caption: Caption | undefined): string {
  if (!caption) return '';
  const birth = caption.birthYear ? String(caption.birthYear) : '';
  const death = caption.isLiving ? '' : (caption.deathYear ? String(caption.deathYear) : '');
  if (birth && death) return `${birth}-${death}`;
  if (birth) return `${birth}-`;
  if (death) return `-${death}`;
  return '';
}

function briefText(achievements: string | undefined): string {
  const text = String(achievements || '').trim();
  if (!text) return '';
  return text.length <= 18 ? text : `${text.slice(0, 18)}…`;
}

function chartsFromEntries(entries: ShiluEntry[]): { charts: SuChart[]; captions: Record<string, Caption> } {
  const people = [];
  const links = [];
  const captions: Record<string, Caption> = {};
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
    captions[id] = {
      courtesyName: text(entry.courtesy_name),
      artName: text(entry.art_name),
      birthYear: finite(entry.birth_year),
      deathYear: finite(entry.death_year),
      isLiving: entry.is_living,
      burialPlace: text(entry.burial_place),
      achievements: text(entry.achievements),
      biography: text(entry.biography),
      citeBook: entry.gender === 'female' ? '闺秀录' : '人物传',
      avatarUrl: chartPortraitUrl(entry.avatar_url) || undefined,
    };
  }
  const linked = new Set<string>();
  for (const entry of entries) {
    const id = String(entry.person_id || '').trim();
    const fatherId = String(entry.father_id || '').trim();
    if (!id || !fatherId || !ids.has(id) || !ids.has(fatherId) || fatherId === id || linked.has(id)) continue;
    links.push({
      parentId: fatherId,
      childId: id,
      birthOrder: finite(entry.rank),
      childType: entry.child_type,
    });
    linked.add(id);
  }
  return { charts: buildSuCharts(people, links, { blocksPerPage: SU_BLOCKS_PER_PAGE }), captions };
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
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
