import type { PDFOptions } from 'puppeteer-core';
import type { ShiluEntry } from '../cepu/cepu.service';
import { ouChartCss, renderOuChartBook } from '../cepu/ou-chart-html';
import { renderSuChartBook, suChartCss } from '../cepu/su-chart-html';

/**
 * 终审页「生成预览」交给版式函数的显式参数。
 *
 * 已接入（会改变世录条目或分发到的函数）：
 * - layout：su → renderSuChartBook，ou → renderOuChartBook，shixi_table → CepuService.renderShixiPreview
 * - branch：按 person.migration_branch 精确匹配后过滤条目。这是迁徙支系名称，不是 ShiluConfig.branches 的房派根 personId
 * - generation_start / generation_end：按「第 N 世 = ShiluEntry.generation + 1」过滤。父代被滤掉后，苏式/欧式不再连到该父
 * - include_options.spouse_info === false：清空 spouses
 * - include_options.children_list === false：清空 children。苏式图靠父子边，不读子女名单
 * - include_options.bio_text === true：保留 biography / anecdotes / achievements；否则清空
 * - include_options.photo === true：苏式 showAvatars，并保留 avatar_url。欧式与世系表人物块没有照片槽
 * - include_options.basic_info === false：清空字、号、生卒年、籍贯、葬地。姓名仍由版式函数画出
 *
 * 暂未支持但已透传到渲染入口（不参与分发，也不改 HTML）：
 * - style（traditional / modern / simple）
 * - include_options.migration
 * - cover_image_url
 */
export interface GenealogyPreviewParams {
  layout: 'su' | 'ou' | 'shixi_table';
  style: 'traditional' | 'modern' | 'simple';
  branch?: string;
  generation_start?: number;
  generation_end?: number;
  cover_image_url?: string;
  include_options?: {
    basic_info?: boolean;
    spouse_info?: boolean;
    children_list?: boolean;
    bio_text?: boolean;
    photo?: boolean;
    migration?: boolean;
  };
}

export function preparePreviewEntries(
  entries: readonly ShiluEntry[],
  params: GenealogyPreviewParams,
  branchPersonIds?: ReadonlySet<string>,
): ShiluEntry[] {
  const include = params.include_options ?? {};
  const keepBio = include.bio_text === true;
  const keepPhoto = include.photo === true;
  const start = params.generation_start;
  const end = params.generation_end;

  return entries
    .filter((entry) => {
      if (branchPersonIds && !branchPersonIds.has(entry.person_id)) return false;
      const shi = entry.generation + 1;
      if (start != null && shi < start) return false;
      if (end != null && shi > end) return false;
      return true;
    })
    .map((entry) => ({
      ...entry,
      courtesy_name: include.basic_info === false ? undefined : entry.courtesy_name,
      art_name: include.basic_info === false ? undefined : entry.art_name,
      birth_year: include.basic_info === false ? undefined : entry.birth_year,
      death_year: include.basic_info === false ? undefined : entry.death_year,
      native_place: include.basic_info === false ? undefined : entry.native_place,
      burial_place: include.basic_info === false ? undefined : entry.burial_place,
      spouses: include.spouse_info === false ? [] : entry.spouses,
      children: include.children_list === false ? [] : entry.children,
      biography: keepBio ? entry.biography : undefined,
      anecdotes: keepBio ? entry.anecdotes : undefined,
      achievements: keepBio ? entry.achievements : undefined,
      figures: keepPhoto ? entry.figures : [],
      avatar_url: keepPhoto ? entry.avatar_url : undefined,
    }));
}

export function renderGenealogyPreviewDocument(input: {
  clanName: string;
  entries: ShiluEntry[];
  params: GenealogyPreviewParams;
  shixi?: { html: string; css: string };
}): { html: string; pdf: PDFOptions } {
  const { clanName, entries, params } = input;
  const layout = params.layout;
  let body: string;
  let css: string;
  if (layout === 'ou') {
    body = renderOuChartBook(entries, { electronic: true, script: 'horizontal' });
    css = `${ouChartCss()}\n.ou-book{margin:0}`;
  } else if (layout === 'shixi_table') {
    body = input.shixi?.html ?? '<p class="vol-content">（该卷暂无世录条目）</p>';
    css = input.shixi?.css ?? '';
  } else {
    body = renderSuChartBook(entries, {
      electronic: true,
      script: 'horizontal',
      showAvatars: params.include_options?.photo === true,
    });
    css = `${suChartCss()}\n.su-book{margin:0}`;
  }

  const shixi = layout === 'shixi_table';
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/>
    <style>
      body{font-family:'SimSun','KaiTi','Songti SC',serif;color:#333;margin:0;padding:0;}
      h1{text-align:center;font-family:'KaiTi',serif;font-size:22px;margin:0 0 8mm;}
      ${css}
    </style></head><body>
    <div class="genealogy-preview" data-layout="${layout}">
      <h1>${escapeHtml(clanName)}</h1>
      ${body}
    </div>
    </body></html>`;

  const pdf: PDFOptions = shixi
    ? {
        width: '180mm',
        height: '260mm',
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      }
    : {
        format: 'A4',
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      };
  return { html, pdf };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
