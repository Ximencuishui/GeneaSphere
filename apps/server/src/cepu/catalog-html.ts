/**
 * 整本谱最前面的总目录。电子版条目带锚点，纸质版只留文字。
 */
import type { CatalogEntry } from './book-catalog';

export interface GenerationRow {
  generation: number;
  character: string;
  note?: string | null;
}

export function renderCatalogBook(
  entries: CatalogEntry[],
  options: { electronic?: boolean; script?: 'horizontal' | 'antique' } = {},
): string {
  const electronic = options.electronic !== false;
  const antique = options.script === 'antique';
  const mark = antique ? ' is-antique' : '';
  const items = entries.map((entry) => renderItem(entry, electronic)).join('');
  return `<div id="book-catalog" class="toc-book${mark}"><section class="toc-sheet is-odd${mark}"><div class="toc-stage"><header class="toc-head"><h2 class="toc-title">总目录</h2></header><ol class="toc-list">${items}</ol></div><p class="toc-foot">目录</p></section></div>`;
}

export function renderGenerationIndex(
  rows: GenerationRow[],
  options: { script?: 'horizontal' | 'antique' } = {},
): string {
  const antique = options.script === 'antique';
  const mark = antique ? ' is-antique' : '';
  const body = rows.length
    ? rows.map((row) => `<p class="gen-row">第${row.generation}世｜${esc(row.character)}${row.note ? `｜${esc(row.note)}` : ''}</p>`).join('')
    : '<p class="gen-empty">字辈尚未录入。</p>';
  return `<div id="book-generation" class="gen-book${mark}"><section class="gen-sheet is-odd${mark}"><div class="gen-stage"><header class="gen-head"><h2 class="gen-title">字辈索引</h2></header>${body}</div><p class="gen-foot">字辈</p></section></div>`;
}

export function renderPlaceholder(entry: CatalogEntry, script?: 'horizontal' | 'antique'): string {
  const antique = script === 'antique';
  const mark = antique ? ' is-antique' : '';
  return `<div id="${esc(entry.anchor)}" class="slot-book${mark}"><section class="slot-sheet${mark}"><h2 class="slot-title">${esc(entry.text)}</h2><p class="slot-empty">本篇尚未录入。目录里保留这一目，写好内容后会出现在这里。</p></section></div>`;
}

export function catalogCss(): string {
  return `
    .toc-book, .gen-book, .slot-book { margin: -24mm -20mm 0; background: #fff; }
    .toc-sheet, .gen-sheet, .slot-sheet {
      position: relative;
      width: 210mm;
      height: 297mm;
      margin: 0;
      padding: 30mm 15mm 25mm 20mm;
      box-sizing: border-box;
      background: #fff;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
      font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
      color: #1a1a1a;
    }
    .toc-sheet.is-even, .gen-sheet.is-even { padding: 30mm 20mm 25mm 15mm; }
    .toc-title, .gen-title, .slot-title { margin: 0 0 8mm; text-align: left; font-size: 22px; font-weight: 600; letter-spacing: 0.2em; }
    .toc-list { list-style: none; margin: 0; padding: 0; text-align: left; }
    .toc-item { display: flex; align-items: baseline; gap: 8px; margin: 0 0 3.2mm; font-size: 16px; line-height: 1.6; }
    .toc-item.is-child { padding-left: 1.8em; font-size: 15px; }
    .toc-tag {
      flex: 0 0 auto;
      min-width: 2.6em;
      padding: 0 4px;
      border: 1px solid #c4bba8;
      font-size: 12px;
      line-height: 1.4;
      text-align: center;
      color: #6d6458;
    }
    a.toc-jump { color: #1a56c4; text-decoration: underline; }
    .toc-label { color: inherit; }
    .gen-row { margin: 0 0 2mm; font-size: 16px; line-height: 1.7; text-align: left; }
    .gen-empty, .slot-empty { margin: 4mm 0; font-size: 14px; line-height: 1.8; color: #666; text-align: left; }
    .toc-foot, .gen-foot {
      position: absolute; left: 0; right: 0; bottom: 8mm; margin: 0;
      text-align: center; font-size: 12px; letter-spacing: 0.14em; color: #6d6458;
      writing-mode: horizontal-tb;
    }
    .toc-book.is-antique .toc-sheet,
    .gen-book.is-antique .gen-sheet,
    .slot-book.is-antique .slot-sheet { font-family: 'SimSun', 'NSimSun', 'Songti SC', serif; }
    .toc-book.is-antique .toc-stage,
    .gen-book.is-antique .gen-stage { display: flex; flex-direction: column; height: 100%; }
    .toc-book.is-antique .toc-head,
    .gen-book.is-antique .gen-head {
      align-self: flex-end; margin: 0 0 4mm auto; writing-mode: horizontal-tb;
    }
    .toc-book.is-antique .toc-title,
    .gen-book.is-antique .gen-title,
    .slot-book.is-antique .slot-title {
      writing-mode: vertical-rl; text-orientation: upright; text-align: start;
      height: auto; max-height: 46mm; margin: 0;
    }
    .toc-book.is-antique .toc-list {
      display: flex; flex-direction: row-reverse; align-items: flex-start;
      flex: 1 1 auto; height: 0; min-height: 0; width: 100%; gap: 4mm;
    }
    .toc-book.is-antique .toc-item {
      writing-mode: vertical-rl; text-orientation: upright;
      display: block; height: 100%; width: max-content; margin: 0; padding: 0; font-size: 16px;
    }
    .toc-book.is-antique .toc-item.is-child { padding: 0; }
    .toc-book.is-antique .toc-tag { writing-mode: vertical-rl; display: inline; border: 0; padding: 0 0 2mm; }
    .gen-book.is-antique .gen-row,
    .gen-book.is-antique .gen-empty,
    .slot-book.is-antique .slot-empty { writing-mode: vertical-rl; text-orientation: upright; text-align: start; }
    @media print {
      a.toc-jump { color: inherit; text-decoration: none; }
    }
  `;
}

function renderItem(entry: CatalogEntry, electronic: boolean): string {
  const child = entry.depth > 0 ? ' is-child' : '';
  const prefix = entry.marker === 'last' ? '└ ' : entry.marker === 'mid' ? '├ ' : '';
  const tag = entry.tag ? `<span class="toc-tag">${esc(entry.tag)}</span>` : '';
  const label = `${prefix}${entry.text}`;
  const body = entry.kind === 'group' || !electronic
    ? `<span class="toc-label">${esc(label)}</span>`
    : `<a class="toc-jump book-jump" href="#${esc(entry.anchor)}">${esc(label)}</a>`;
  return `<li class="toc-item${child}" id="toc-${esc(entry.key)}">${tag}${body}</li>`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
