/**
 * 卷首人名索引的印刷页。单独成页，不和世系表、人物传混在一起。
 */
import { buildEuropeanCharts, fitEuropeanChartsToPages } from './european-chart';
import { biographyAnchorId, indexChartAppearances } from './biography-index';
import { buildNameIndex, type NameIndexGroup, type NameIndexRow } from './name-index';
import type { ShiluEntry } from './cepu.service';

const LEAD = '本索引按姓名拼音排序，标注对应欧式世系图号、所在页码，方便检索查阅。';

export function renderNameIndexBook(entries: ShiluEntry[], options: { electronic?: boolean; script?: 'horizontal' | 'antique' } = {}): string {
  const electronic = options.electronic !== false;
  const antique = options.script === 'antique';
  const mark = antique ? ' is-antique' : '';
  const groups = indexGroups(entries);
  if (!groups.length) {
    return `<div id="book-index" class="idx-book${mark}"><section class="idx-sheet is-odd${mark}"><div class="idx-stage"><header class="idx-head"><h2 class="idx-title">卷首 · 人名索引</h2><p class="idx-lead">${LEAD}</p></header><p class="idx-empty">本索引暂无已录入完整行传的族人。</p></div><p class="idx-foot">第 1 页 / 共 1 页</p></section></div>`;
  }
  return `<div class="idx-source${mark}">${groups.map((group) => renderGroup(group, electronic)).join('')}</div><script>${packScript(antique)}</script>`;
}

export function nameIndexCss(): string {
  return `
    .idx-book { margin: -24mm -20mm 0; background: #fff; }
    .idx-sheet {
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
      font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
      color: #1a1a1a;
    }
    .idx-sheet.is-even { padding: 30mm 20mm 25mm 15mm; }
    .idx-sheet.is-open { height: auto; min-height: 297mm; overflow: visible; }
    .idx-stage { flex: 1 1 auto; min-height: 0; width: 100%; display: flex; flex-direction: column; }
    .idx-title { margin: 0; text-align: center; font-size: 18px; font-weight: 600; letter-spacing: 0.28em; }
    .idx-lead { margin: 6px 0 0; text-align: center; font-size: 12px; line-height: 1.6; color: #666; }
    .idx-empty { margin: 12px 0; text-align: center; font-size: 12px; color: #888; }
    .idx-columns { column-count: 2; column-gap: 8mm; column-fill: balance; flex: 1 1 auto; min-height: 0; height: 100%; }
    .idx-sheet.is-open .idx-columns { height: auto; column-count: 1; }
    .idx-group { break-inside: auto; }
    .idx-letter { margin: 0; padding-top: 12px; font-size: 12px; font-weight: 700; line-height: 1.4; }
    .idx-row { margin: 0; font-size: 12px; line-height: 1.45; break-inside: avoid; page-break-inside: avoid; }
    a.book-jump { color: #1a56c4; text-decoration: underline; }
    .idx-foot {
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
    .idx-book.is-antique .idx-sheet,
    .idx-sheet.is-antique { font-family: 'SimSun', 'NSimSun', 'Songti SC', serif; }
    .idx-book.is-antique .idx-stage,
    .idx-sheet.is-antique .idx-stage {
      flex-direction: column;
      align-items: stretch;
      height: 100%;
      writing-mode: horizontal-tb;
    }
    .idx-book.is-antique .idx-head,
    .idx-sheet.is-antique .idx-head {
      align-self: flex-end;
      display: flex;
      flex-direction: row-reverse;
      align-items: flex-start;
      gap: 3mm;
      height: auto;
      flex: 0 0 auto;
      margin: 0 0 3mm auto;
      writing-mode: horizontal-tb;
    }
    .idx-book.is-antique .idx-title,
    .idx-book.is-antique .idx-lead,
    .idx-book.is-antique .idx-empty,
    .idx-sheet.is-antique .idx-title,
    .idx-sheet.is-antique .idx-lead,
    .idx-sheet.is-antique .idx-empty {
      writing-mode: vertical-rl;
      text-orientation: upright;
      height: auto;
      max-height: 52mm;
      margin: 0;
      text-align: start;
    }
    .idx-book.is-antique .idx-columns,
    .idx-sheet.is-antique .idx-columns {
      column-count: auto;
      display: flex;
      flex-direction: row-reverse;
      align-items: flex-start;
      justify-content: flex-start;
      gap: 5mm;
      flex: 1 1 auto;
      height: 0;
      min-height: 0;
      width: 100%;
    }
    .idx-book.is-antique .idx-group,
    .idx-book.is-antique .idx-letter,
    .idx-book.is-antique .idx-row,
    .idx-sheet.is-antique .idx-group,
    .idx-sheet.is-antique .idx-letter,
    .idx-sheet.is-antique .idx-row {
      writing-mode: vertical-rl;
      text-orientation: upright;
    }
    .idx-book.is-antique .idx-group,
    .idx-sheet.is-antique .idx-group {
      height: 100%;
      max-height: 100%;
      width: max-content;
      flex: 0 0 auto;
    }
    .idx-book.is-antique .idx-foot,
    .idx-sheet.is-antique .idx-foot { writing-mode: horizontal-tb; }
  `;
}

function indexGroups(entries: ShiluEntry[]): NameIndexGroup[] {
  const pages = fitEuropeanChartsToPages(buildEuropeanCharts(peopleOf(entries), linksOf(entries)));
  const appearances = indexChartAppearances(pages);
  const byId = new Map(entries.map((entry) => [String(entry.person_id), entry]));
  const candidates = [];
  for (const [id, appearance] of appearances) {
    const entry = byId.get(id);
    if (!entry?.biography?.trim()) continue;
    candidates.push({
      personId: id,
      name: entry.full_name,
      generation: entry.generation,
      chartNos: appearance.chartNos,
    });
  }
  return buildNameIndex(candidates);
}

function renderGroup(group: NameIndexGroup, electronic: boolean): string {
  const rows = group.rows.map((row) => `<p class="idx-row">${renderName(row, electronic)}｜${esc(row.generationLabel)}｜世系图号：第${row.chartNo}图｜页码：第${row.pageNo}页</p>`).join('');
  return `<section class="idx-group"><h3 class="idx-letter">【${esc(group.letter)}】</h3>${rows}</section>`;
}

function renderName(row: NameIndexRow, electronic: boolean): string {
  if (!electronic) return esc(row.name);
  const href = esc(`#${biographyAnchorId(row.name, row.chartNo)}`);
  const title = esc(`跳转到人物传：${row.name}，第${row.chartNo}图`);
  return `<a class="book-jump" href="${href}" title="${title}">${esc(row.name)}</a>`;
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
    links.push({ parentId: fatherId, childId: id, birthOrder: finite(entry.rank), childType: entry.child_type });
  }
  return links;
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

function packScript(antique = false): string {
  return `
(function () {
  var source = document.querySelector('.idx-source');
  if (!source || source.getAttribute('data-packed') === '1') return;
  var groups = [].slice.call(source.querySelectorAll('.idx-group'));
  var probe = document.createElement('section');
  var antique = ${antique ? 'true' : 'false'};
  probe.className = 'idx-sheet is-odd' + (antique ? ' is-antique' : '');
  probe.innerHTML = '<div class="idx-stage"><header class="idx-head"><h2 class="idx-title">卷首 · 人名索引</h2><p class="idx-lead">${LEAD}</p></header></div>';
  probe.style.position = 'absolute';
  probe.style.left = '-12000px';
  probe.style.top = '0';
  document.body.appendChild(probe);
  var stage = probe.querySelector('.idx-stage');
  var head = probe.querySelector('.idx-head');
  var columnHeight = Math.max(40, stage.clientHeight - (antique ? head.offsetHeight : 0));
  if (antique) {
    groups.forEach(function (group) {
      group.style.writingMode = 'vertical-rl';
      group.style.textOrientation = 'upright';
      group.style.height = columnHeight + 'px';
      group.style.maxHeight = columnHeight + 'px';
      group.style.width = 'max-content';
    });
  }
  var budget = antique ? stage.clientWidth : stage.clientHeight;
  var firstBudget = antique ? stage.clientWidth : Math.max(1, budget - head.offsetHeight);
  var holder = document.createElement('div');
  holder.style.position = 'absolute';
  holder.style.left = '-12000px';
  holder.style.top = '0';
  holder.style.width = antique ? 'auto' : (stage.clientWidth + 'px');
  var measure = document.createElement('div');
  measure.style.width = antique ? 'auto' : 'calc((100% - 8mm) / 2)';
  holder.appendChild(measure);
  document.body.appendChild(holder);
  groups.forEach(function (group) { measure.appendChild(group); });
  var heights = groups.map(function (group) { return antique ? group.offsetWidth : group.offsetHeight; });
  if (antique) {
    groups.forEach(function (group) {
      group.style.writingMode = '';
      group.style.textOrientation = '';
      group.style.height = '';
      group.style.maxHeight = '';
      group.style.width = '';
    });
  }
  holder.remove();
  var safety = 24;
  function roomFor(limit) { return antique ? Math.max(1, limit) : Math.max(1, limit * 2 - safety); }
  var pages = [];
  var page = [];
  var used = 0;
  var room = roomFor(firstBudget);
  heights.forEach(function (height, index) {
    if (page.length && used + height > room) {
      pages.push(page);
      page = [];
      used = 0;
      room = roomFor(Math.max(1, budget));
    }
    page.push(index);
    used += height;
    if (height > room) {
      pages.push(page);
      page = [];
      used = 0;
      room = roomFor(Math.max(1, budget));
    }
  });
  if (page.length) pages.push(page);
  var book = document.createElement('div');
  book.id = 'book-index';
  book.className = 'idx-book' + (antique ? ' is-antique' : '');
  pages.forEach(function (indexes, pageIndex) {
    var limit = pageIndex === 0 ? firstBudget : Math.max(1, budget);
    var tall = indexes.some(function (index) { return heights[index] > roomFor(limit); });
    var sheet = document.createElement('section');
    sheet.className = 'idx-sheet ' + (pageIndex % 2 === 0 ? 'is-odd' : 'is-even') + (tall ? ' is-open' : '') + (antique ? ' is-antique' : '');
    var box = document.createElement('div');
    box.className = 'idx-stage';
    if (pageIndex === 0) box.appendChild(head);
    var columns = document.createElement('div');
    columns.className = 'idx-columns';
    indexes.forEach(function (index) { columns.appendChild(groups[index]); });
    box.appendChild(columns);
    var foot = document.createElement('p');
    foot.className = 'idx-foot';
    foot.textContent = '第 ' + (pageIndex + 1) + ' 页 / 共 ' + pages.length + ' 页';
    sheet.appendChild(box);
    sheet.appendChild(foot);
    book.appendChild(sheet);
  });
  probe.remove();
  source.setAttribute('data-packed', '1');
  source.replaceWith(book);
})();
`;
}
