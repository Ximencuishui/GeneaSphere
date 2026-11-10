/**
 * 卷三人物传的印刷 HTML。版心和欧式表相同，一条传记不拆到两页。
 */
import { buildEuropeanCharts, fitEuropeanChartsToPages } from './european-chart';
import { biographyAnchorId, indexChartAppearances, treeAnchorId } from './biography-index';
import type { ShiluEntry } from './cepu.service';

const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

const BIO_TITLE = '人物传';
const BIO_LEAD = '本卷收录族人完整行传；世系表内标注【详见人物传】者，在此查阅全文。';

export function renderBiographyBook(
  entries: ShiluEntry[],
  options: {
    electronic?: boolean;
    script?: 'horizontal' | 'antique';
    title?: string;
    lead?: string;
    anchor?: string;
    lineage?: ShiluEntry[];
  } = {},
): string {
  const electronic = options.electronic !== false;
  const antique = options.script === 'antique';
  const title = options.title || BIO_TITLE;
  const lead = options.lead || BIO_LEAD;
  const anchor = options.anchor || 'book-biography';
  const mark = antique ? ' is-antique' : '';
  const articles = biographyArticles(entries, electronic, options.lineage);
  if (articles.length === 0) {
    return `<div id="${esc(anchor)}" class="bio-book${mark}"><section class="bio-sheet is-odd${mark}"><div class="bio-stage"><header class="bio-head"><h2 class="bio-volume">${esc(title)}</h2><p class="bio-lead">${esc(lead)}</p></header><p class="bio-empty">本卷暂无已录入完整行传的族人。</p></div><p class="bio-foot">第 1 页 / 共 1 页</p></section></div>`;
  }
  return `<div class="bio-source${mark}">${articles.join('')}</div><script>${packScript(antique, title, lead, anchor)}</script>`;
}

export function biographyCss(): string {
  return `
    .bio-book { margin: -24mm -20mm 0; background: #fff; }
    .bio-sheet {
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
      font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
      color: #1a1a1a;
    }
    .bio-sheet.is-even { padding: 30mm 20mm 25mm 15mm; }
    .bio-sheet.is-open { height: auto; min-height: 297mm; overflow: visible; }
    .bio-stage { flex: 1 1 auto; min-height: 0; width: 100%; }
    .bio-volume { margin: 0; text-align: center; font-size: 18px; font-weight: 600; letter-spacing: 0.28em; }
    .bio-lead { margin: 6px 0 8px; text-align: center; font-size: 12px; line-height: 1.6; color: #666; }
    .bio-empty { margin: 12px 0; text-align: center; font-size: 12px; color: #888; }
    .bio-entry { overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
    .bio-entry + .bio-entry { border-top: 1px solid #ccc; margin-top: 8px; padding-top: 8px; }
    .bio-anchor { display: block; height: 0; overflow: hidden; }
    .bio-figures { float: right; width: calc(35mm + 4mm); margin: 0 0 2mm 3mm; }
    .bio-figure { margin: 0 0 2mm; padding: 1.5mm; }
    .bio-figure img { display: block; width: auto; height: auto; max-width: 35mm; max-height: 50mm; margin: 0 auto; object-fit: contain; }
    .bio-figure figcaption { margin-top: 1mm; font-size: 10px; line-height: 1.4; color: #888; text-align: center; }
    a.book-jump { color: #1a56c4; text-decoration: underline; }
    .bio-title { margin: 0 0 4px; font-size: 16px; font-weight: 700; line-height: 1.5; }
    .bio-name { cursor: pointer; }
    .bio-info, .bio-native { margin: 0; font-size: 12px; line-height: 1.6; }
    .bio-body { margin: 6px 0 0; font-size: 11px; line-height: 1.6; font-weight: 400; }
    .bio-body p { margin: 0 0 4px; }
    .bio-note { margin: 4px 0 0; font-size: 10px; line-height: 1.5; color: #888; }
    .bio-foot {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 8mm;
      margin: 0;
      text-align: center;
      font-size: 12px;
      letter-spacing: 0.12em;
      color: #666;
      writing-mode: horizontal-tb;
    }
    .bio-book.is-antique .bio-sheet,
    .bio-sheet.is-antique { font-family: 'SimSun', 'NSimSun', 'Songti SC', serif; }
    .bio-book.is-antique .bio-stage,
    .bio-sheet.is-antique .bio-stage {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      height: 100%;
      writing-mode: horizontal-tb;
    }
    .bio-book.is-antique .bio-head,
    .bio-sheet.is-antique .bio-head {
      display: flex;
      flex-direction: row-reverse;
      align-items: flex-start;
      align-self: flex-end;
      gap: 3mm;
      width: auto;
      height: auto;
      margin: 0 0 4mm auto;
      writing-mode: horizontal-tb;
    }
    .bio-book.is-antique .bio-volume,
    .bio-book.is-antique .bio-lead,
    .bio-book.is-antique .bio-empty,
    .bio-sheet.is-antique .bio-volume,
    .bio-sheet.is-antique .bio-lead,
    .bio-sheet.is-antique .bio-empty {
      writing-mode: vertical-rl;
      text-orientation: upright;
      height: auto;
      max-height: 46mm;
      margin: 0;
      text-align: start;
    }
    .bio-book.is-antique .bio-entry,
    .bio-sheet.is-antique .bio-entry {
      position: relative;
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      width: 100%;
      height: auto;
      max-height: none;
      border: 0;
      margin: 0;
      padding: 0;
    }
    .bio-book.is-antique .bio-entry + .bio-entry,
    .bio-sheet.is-antique .bio-entry + .bio-entry {
      border-top: 1px solid #c4bba8;
      border-right: 0;
      margin-top: 3.5mm;
      padding-top: 3.5mm;
    }
    .bio-book.is-antique .bio-main,
    .bio-sheet.is-antique .bio-main {
      writing-mode: vertical-rl;
      text-orientation: upright;
      flex: 1 1 auto;
      min-width: 0;
      max-height: 168mm;
    }
    .bio-book.is-antique .bio-title,
    .bio-book.is-antique .bio-info,
    .bio-book.is-antique .bio-native,
    .bio-book.is-antique .bio-body,
    .bio-book.is-antique .bio-note,
    .bio-sheet.is-antique .bio-title,
    .bio-sheet.is-antique .bio-info,
    .bio-sheet.is-antique .bio-native,
    .bio-sheet.is-antique .bio-body,
    .bio-sheet.is-antique .bio-note {
      writing-mode: vertical-rl;
      text-orientation: upright;
    }
    .bio-book.is-antique .bio-figures,
    .bio-sheet.is-antique .bio-figures {
      float: none;
      order: -1;
      flex: 0 0 39mm;
      width: 39mm;
      margin: 0 3mm 0 0;
      writing-mode: horizontal-tb;
    }
    .bio-book.is-antique .bio-figure,
    .bio-sheet.is-antique .bio-figure { writing-mode: horizontal-tb; }
    .bio-book.is-antique .bio-figure img,
    .bio-sheet.is-antique .bio-figure img { max-width: 35mm; max-height: 50mm; }
    .bio-book.is-antique .bio-figure figcaption,
    .bio-sheet.is-antique .bio-figure figcaption {
      writing-mode: vertical-rl;
      text-orientation: upright;
      text-align: start;
      max-height: 36mm;
      margin-top: 1mm;
    }
    .bio-book.is-antique .bio-foot,
    .bio-sheet.is-antique .bio-foot { writing-mode: horizontal-tb; }
  `;
}

function biographyArticles(entries: ShiluEntry[], electronic: boolean, lineage?: ShiluEntry[]): string[] {
  if (!lineage) {
    const pages = fitEuropeanChartsToPages(buildEuropeanCharts(peopleOf(entries), linksOf(entries)));
    const appearances = indexChartAppearances(pages);
    const byId = new Map(entries.map((entry) => [String(entry.person_id), entry]));
    return [...appearances.entries()]
      .map(([id, appearance]) => ({ entry: byId.get(id), appearance }))
      .filter((item): item is { entry: ShiluEntry; appearance: { chartNo: number; sequence: number; chartNos: number[] } } => Boolean(item.entry?.biography?.trim()))
      .sort((a, b) => a.appearance.sequence - b.appearance.sequence)
      .map(({ entry, appearance }) => renderArticle(entry, appearance, electronic));
  }
  const source = lineage.length ? lineage : entries;
  const appearances = indexChartAppearances(fitEuropeanChartsToPages(buildEuropeanCharts(peopleOf(source), linksOf(source))));
  let extra = appearances.size + 1;
  const ordered = entries
    .filter((entry) => entry.biography?.trim())
    .map((entry) => {
      const own = appearances.get(String(entry.person_id));
      const father = entry.father_id ? appearances.get(String(entry.father_id)) : undefined;
      const appearance = own
        ?? (father
          ? { chartNo: father.chartNo, sequence: extra, chartNos: [father.chartNo] }
          : { chartNo: 0, sequence: extra, chartNos: [] as number[] });
      if (!own) extra += 1;
      return { entry, appearance };
    })
    .sort((a, b) => a.appearance.sequence - b.appearance.sequence);
  return ordered.map(({ entry, appearance }) => renderArticle(entry, appearance, electronic));
}

function peopleOf(entries: ShiluEntry[]) {
  const people = [];
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
  }
  return people;
}

function linksOf(entries: ShiluEntry[]) {
  const ids = new Set(entries.map((entry) => String(entry.person_id || '').trim()).filter(Boolean));
  const links = [];
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
  return links;
}

function renderArticle(
  entry: ShiluEntry,
  appearance: { chartNo: number; chartNos: number[] },
  electronic: boolean,
): string {
  const generation = `第${chineseGeneration(Math.max(1, Math.floor(entry.generation) + 1))}世`;
  const years = lifeYears(entry);
  const spouses = (entry.spouses || []).map((spouse) => String(spouse.name || '').trim()).filter(Boolean).join('、');
  const bits = [
    entry.courtesy_name ? `字：${entry.courtesy_name}` : '',
    entry.art_name ? `号：${entry.art_name}` : '',
    years ? `生卒：${years}` : '',
    spouses ? `配偶：${spouses}` : '',
    entry.father_name ? `父：${entry.father_name}` : '',
    `世代：${generation}`,
  ].filter(Boolean);
  const paragraphs = [entry.biography, entry.achievements, entry.anecdotes]
    .flatMap((block) => String(block || '').split(/\n+/))
    .map((line) => line.trim())
    .filter(Boolean);
  const notes = [entry.epitaph, entry.source_note].map((item) => String(item || '').trim()).filter(Boolean);
  const chartNo = appearance.chartNo;
  const extraAnchors = appearance.chartNos
    .filter((item) => item !== chartNo)
    .map((item) => `<span id="${esc(biographyAnchorId(entry.full_name, item))}" class="bio-anchor"></span>`)
    .join('');
  const seeChart = chartNo
    ? (electronic
      ? `<a class="book-jump" href="#${treeAnchorId(chartNo)}" title="${esc(`跳转到世系第${chartNo}图`)}">见世系第${chartNo}图</a>`
      : `见世系第${chartNo}图`)
    : '';
  const figures = (entry.figures || []).filter((figure) => figure.url);
  const figureHtml = figures.length
    ? `<aside class="bio-figures">${figures.map((figure) => `<figure class="bio-figure"><img src="${esc(figure.url)}" alt="${esc(figure.caption)}" /><figcaption>${esc(`图：${figure.caption}`)}</figcaption></figure>`).join('')}</aside>`
    : '';
  const native = entry.native_place ? `<p class="bio-native">${esc(`籍贯/迁居：${entry.native_place}`)}</p>` : '';
  const note = notes.length ? `<p class="bio-note">${esc(`附：${notes.join('；')}`)}</p>` : '';
  const articleId = chartNo ? biographyAnchorId(entry.full_name, chartNo) : `lady-${entry.person_id}`;
  const title = seeChart ? `${esc(entry.full_name)}｜${seeChart}` : esc(entry.full_name);
  return `<article class="bio-entry" id="${esc(articleId)}" data-person-id="${esc(String(entry.person_id))}">${extraAnchors}${figureHtml}<div class="bio-main"><h3 class="bio-title"><span class="bio-name">${title}</span></h3><p class="bio-info">${esc(bits.join('｜'))}</p>${native}<div class="bio-body">${paragraphs.map((line) => `<p>${esc(line)}</p>`).join('')}</div>${note}</div></article>`;
}

function packScript(antique = false, title = BIO_TITLE, lead = BIO_LEAD, anchor = 'book-biography'): string {
  const titleJs = JSON.stringify(title);
  const leadJs = JSON.stringify(lead);
  const anchorJs = JSON.stringify(anchor);
  return `
(function () {
  var source = document.querySelector('.bio-source:not([data-packed="1"])');
  if (!source) return;
  var entries = [].slice.call(source.querySelectorAll('.bio-entry'));
  var probe = document.createElement('section');
  var antique = ${antique ? 'true' : 'false'};
  probe.className = 'bio-sheet is-odd' + (antique ? ' is-antique' : '');
  probe.innerHTML = '<div class="bio-stage"><header class="bio-head"><h2 class="bio-volume">' + ${titleJs} + '</h2><p class="bio-lead">' + ${leadJs} + '</p></header></div>';
  probe.style.position = 'absolute';
  probe.style.left = '-12000px';
  probe.style.top = '0';
  document.body.appendChild(probe);
  var stage = probe.querySelector('.bio-stage');
  var head = probe.querySelector('.bio-head');
  var budget = stage.clientHeight;
  var firstBudget = Math.max(1, budget - head.offsetHeight);
  var holder = document.createElement('div');
  holder.className = antique ? 'bio-book is-antique' : '';
  holder.style.position = 'absolute';
  holder.style.left = '-12000px';
  holder.style.top = '0';
  holder.style.width = stage.clientWidth + 'px';
  var measure = document.createElement('div');
  measure.className = 'bio-stage';
  measure.style.width = '100%';
  holder.appendChild(measure);
  document.body.appendChild(holder);
  entries.forEach(function (entry) { measure.appendChild(entry); });
  var pending = 0;
  [].slice.call(measure.querySelectorAll('img')).forEach(function (img) {
    if (img.complete) return;
    pending += 1;
    var done = function () { pending -= 1; if (pending <= 0) packNow(); };
    img.addEventListener('load', done);
    img.addEventListener('error', done);
  });
  if (pending === 0) packNow();
  function packNow() {
  var heights = entries.map(function (entry) { return entry.offsetHeight; });
  holder.remove();
  var gap = 8;
  var pages = [];
  var page = [];
  var used = 0;
  var limit = firstBudget;
  heights.forEach(function (height, index) {
    var extra = page.length ? gap : 0;
    if (page.length && used + height + extra > limit) {
      pages.push(page);
      page = [];
      used = 0;
      limit = Math.max(1, budget);
    }
    page.push(index);
    used += height + (page.length > 1 ? gap : 0);
  });
  if (page.length) pages.push(page);
  var book = document.createElement('div');
  book.id = ${anchorJs};
  book.className = 'bio-book' + (antique ? ' is-antique' : '');
  pages.forEach(function (indexes, pageIndex) {
    var sheet = document.createElement('section');
    var tall = false;
    var sum = 0;
    indexes.forEach(function (index, place) { sum += heights[index] + (place ? gap : 0); });
    var room = pageIndex === 0 ? firstBudget : budget;
    if (sum > room + 1) tall = true;
    sheet.className = 'bio-sheet ' + (pageIndex % 2 === 0 ? 'is-odd' : 'is-even') + (tall ? ' is-open' : '') + (antique ? ' is-antique' : '');
    var box = document.createElement('div');
    box.className = 'bio-stage';
    if (pageIndex === 0) box.appendChild(head);
    indexes.forEach(function (index) { box.appendChild(entries[index]); });
    var foot = document.createElement('p');
    foot.className = 'bio-foot';
    foot.textContent = '第 ' + (pageIndex + 1) + ' 页 / 共 ' + pages.length + ' 页';
    sheet.appendChild(box);
    sheet.appendChild(foot);
    book.appendChild(sheet);
  });
  probe.remove();
  source.setAttribute('data-packed', '1');
  source.replaceWith(book);
  }
})();
`;
}

function lifeYears(entry: ShiluEntry): string {
  const birth = entry.birth_year ? String(entry.birth_year) : '';
  const death = entry.is_living ? '' : (entry.death_year ? String(entry.death_year) : '');
  if (birth && death) return `${birth}-${death}`;
  if (birth) return `${birth}-`;
  if (death) return `-${death}`;
  return '';
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

function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
