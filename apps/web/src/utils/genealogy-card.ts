/**
 * 族谱卡片尺寸与文字裁剪。
 *
 * 渲染（GText）和布局（dagre / elkjs / compactBox）必须共用这里的外框宽度，
 * 否则省略号按卡片内宽裁切，布局仍按更窄的盒子排，文字会画出相邻卡片。
 */

/** 卡片左右内边距。文字最大宽度 = 外框宽 - 2 * CARD_PADDING_X。 */
export const CARD_PADDING_X = 8;

/**
 * 方向对应的卡片外框。渲染和布局必须用同一个数。
 * LR 代际沿卡片宽度展开，横排卡片用 160×80，姓名一行放得下。
 * 紧凑横条只加宽，高度不动。
 */
export function cardSizeForDirection(
  base: { nodeWidth: number; nodeHeight: number },
  direction: 'TB' | 'LR',
): { nodeWidth: number; nodeHeight: number } {
  if (direction !== 'LR') {
    return { nodeWidth: base.nodeWidth, nodeHeight: base.nodeHeight };
  }
  if (base.nodeHeight >= 70) {
    return { nodeWidth: 160, nodeHeight: 80 };
  }
  return {
    nodeWidth: Math.max(base.nodeWidth, 120),
    nodeHeight: base.nodeHeight,
  };
}

/** 卡片信息密度。简洁是现在的头像 + 姓名 + 生卒；详情加高并多一行小字。 */
export type CardDensity = 'simple' | 'detailed';

/** 详情模式在传统横排卡片上增加的高度。80 → 100 就是这个差值。 */
export const DETAILED_CARD_EXTRA = 20;

/**
 * 密度对应的外框。布局引擎、正交走线和 G6 style.size 必须用同一个返回值。
 * 紧凑条（高度 < 70）不加高，避免被传统卡片的绘制分支误接管。
 */
export function cardSizeForDensity(
  base: { nodeWidth: number; nodeHeight: number },
  direction: 'TB' | 'LR',
  density: CardDensity = 'simple',
): { nodeWidth: number; nodeHeight: number } {
  const sized = cardSizeForDirection(base, direction);
  if (density !== 'detailed' || sized.nodeHeight < 70) return sized;
  return {
    nodeWidth: sized.nodeWidth,
    nodeHeight: sized.nodeHeight + DETAILED_CARD_EXTRA,
  };
}

const RANK_LABEL = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const;

/** 排行：2 → 行二。超过十的用阿拉伯数字。 */
export function formatRankLabel(order?: number | null): string {
  if (order == null || !(order > 0)) return '';
  if (order <= 10) return `行${RANK_LABEL[order]}`;
  return `行${order}`;
}

/**
 * 详情模式姓名下的一行。男子把字辈、排行和生卒接在一起，例如「熹 · 行二｜1328-1407」。
 * 没有排行时只留生卒，避免空的分隔符。
 */
export function formatDetailLine(input: {
  gender?: string | null;
  birthOrder?: number | null;
  generationWord?: string | null;
  years?: string | null;
}): string {
  const years = (input.years || '').trim();
  if (input.gender !== 'male') return years;
  const head = [(input.generationWord || '').trim(), formatRankLabel(input.birthOrder)]
    .filter(Boolean)
    .join(' · ');
  if (head && years) return `${head}｜${years}`;
  return head || years;
}

/** 详情模式里的小标签：迁某地、早夭。最多两个，卡片上单行放得下。 */
export function collectDetailTags(data: {
  migration_to?: string | null;
  migration_branch?: string | null;
  is_founding_ancestor?: boolean | null;
  premature?: boolean | null;
} | null | undefined): string[] {
  if (!data) return [];
  const tags: string[] = [];
  const moved = String(data.migration_to || '').trim();
  const branch = String(data.migration_branch || '').trim();
  if (moved) tags.push(moved.startsWith('迁') ? moved : `迁${moved}`);
  else if (data.is_founding_ancestor && branch) {
    tags.push(branch.startsWith('迁') ? branch : `迁${branch}`);
  }
  if (data.premature) tags.push('早夭');
  return tags.slice(0, 2);
}

export type CornerMarkKey = 'adopted' | 'uxorilocal' | 'premature' | 'founder' | 'heir';

export interface CornerMark {
  key: CornerMarkKey;
  tip: string;
  color: string;
}

/** 右上角 8×8 色点。顺序固定，最多三个，避免挤进姓名。 */
export function collectCornerMarks(data: {
  gender?: string | null;
  child_type?: string | null;
  birth_order?: number | null;
  premature?: boolean | null;
  uxorilocal?: boolean | null;
  union_type?: string | null;
  is_founding_ancestor?: boolean | null;
} | null | undefined): CornerMark[] {
  if (!data) return [];
  const marks: CornerMark[] = [];
  const childType = data.child_type || '';
  if (childType === 'FOSTER' || childType === 'ADOPTED' || childType === 'ADOPTED_OUT') {
    const tip = childType === 'ADOPTED' ? '收养' : childType === 'ADOPTED_OUT' ? '出继' : '过继';
    marks.push({ key: 'adopted', tip, color: '#8C5A2B' });
  }
  if (data.uxorilocal || data.union_type === 'uxorilocal') {
    marks.push({ key: 'uxorilocal', tip: '入赘', color: '#6B4C9A' });
  }
  if (data.premature) {
    marks.push({ key: 'premature', tip: '早夭', color: '#8A8178' });
  }
  if (data.is_founding_ancestor) {
    marks.push({ key: 'founder', tip: '始迁祖', color: '#8C7344' });
  }
  const order = Number(data.birth_order);
  const biological = !childType || childType === 'BIOLOGICAL';
  if (data.gender === 'male' && order === 1 && biological) {
    marks.push({ key: 'heir', tip: '嫡长', color: '#2F6B4F' });
  }
  return marks.slice(0, 3);
}

/**
 * 配偶卡片上的名字。
 * 两个字及以上的姓名原样显示；只有一个字（或已经写成「陈氏」）视为仅有姓氏。
 */
export function presentSpouseName(raw?: string | null): { text: string; surnameOnly: boolean } {
  const name = (raw || '').trim();
  if (!name) return { text: '失考', surnameOnly: true };
  if (name.endsWith('氏')) {
    const body = name.slice(0, -1);
    if (Array.from(body).length <= 2) return { text: name, surnameOnly: true };
  }
  if (Array.from(name).length <= 1) return { text: `${name}氏`, surnameOnly: true };
  return { text: name, surnameOnly: false };
}

/** 仅有姓氏时的气泡：有籍贯写「婺源陈氏」，没有则「失考」。 */
export function spouseSurnameHint(rawName?: string | null, place?: string | null): string {
  const presented = presentSpouseName(rawName);
  if (!presented.surnameOnly || presented.text === '失考') return '失考';
  const surname = presented.text.replace(/氏$/, '') || '某';
  const where = (place || '').trim();
  if (!where) return '失考';
  return `${where}${surname}氏`;
}

const YEARS_FONT_SIZE = 10;

/** 单行文本宽度：汉字约等于字号，ASCII 约 0.62 倍字号。 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    width += code <= 0xff ? fontSize * 0.62 : fontSize;
  }
  return width;
}

/**
 * 把文本收进 maxWidth。
 * 放得下就原样返回；放不下则按 maxLines 换行，最后一行用 … 截断。
 */
export function fitTextLines(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
): string {
  const glyphs = Array.from(text.trim());
  if (glyphs.length === 0 || maxWidth <= 0 || maxLines <= 0) return '';
  const widthOf = (value: string) => estimateTextWidth(value, fontSize);
  if (widthOf(glyphs.join('')) <= maxWidth) return glyphs.join('');

  const lines: string[] = [];
  let index = 0;
  for (let lineNo = 0; lineNo < maxLines && index < glyphs.length; lineNo++) {
    const last = lineNo === maxLines - 1;
    let line = '';
    while (index < glyphs.length) {
      const candidate = line + glyphs[index];
      if (!last) {
        if (line && widthOf(candidate) > maxWidth) break;
        line = candidate;
        index += 1;
        continue;
      }
      const more = index < glyphs.length - 1;
      const shown = more ? `${candidate}…` : candidate;
      if (line && widthOf(shown) > maxWidth) {
        line += '…';
        index = glyphs.length;
        break;
      }
      line = candidate;
      index += 1;
      if (more && widthOf(line + glyphs[index] + '…') > maxWidth) {
        line += '…';
        index = glyphs.length;
        break;
      }
    }
    if (line) lines.push(line);
  }
  return lines.join('\n');
}

/** 生卒年单行，例如 1130-1200。在世只写出生年。 */
export function formatLifeYears(
  birth?: string | number | null,
  death?: string | number | null,
  living?: boolean,
): string {
  const birthText = birth ? String(birth) : '';
  const deathText = living ? '' : (death ? String(death) : '');
  if (birthText && deathText) return `${birthText}-${deathText}`;
  if (birthText) return `${birthText}-`;
  if (deathText) return `-${deathText}`;
  return '';
}

/**
 * 外框尺寸。姓名换行，不撑宽卡片。
 * 生卒年在 10px 下仍超出内宽时，把外框加宽到刚好容纳，上限为配置宽度的 1.75 倍。
 * 调用方要把返回值和 G6 style.size、布局节点 width/height 写成同一个数。
 */
export function resolveCardOuterSize(
  base: { nodeWidth: number; nodeHeight: number },
  years?: string,
): { width: number; height: number } {
  const inner = Math.max(8, base.nodeWidth - CARD_PADDING_X * 2);
  const needed = years ? estimateTextWidth(years, YEARS_FONT_SIZE) : 0;
  if (!years || needed <= inner) {
    return { width: base.nodeWidth, height: base.nodeHeight };
  }
  const grown = Math.ceil(needed + CARD_PADDING_X * 2);
  const cap = Math.round(base.nodeWidth * 1.75);
  return {
    width: Math.min(Math.max(base.nodeWidth, grown), cap),
    height: base.nodeHeight,
  };
}
