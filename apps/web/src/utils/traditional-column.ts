/**
 * 垂丝图一列文字：排行、配偶称谓、世代表头、列宽。
 * 绘制层只负责把算好的字位画上去，不在这里碰画布。
 */
import { presentSpouseName } from '@/utils/genealogy-card';

const CLASSIC_RANK = ['', '长', '次', '三', '四', '五', '六', '七', '八', '九', '十'] as const;

/** 古谱楷体。Canvas 和世代表头共用这一串，缺字时退到 serif。 */
export const CLASSIC_FONT_FAMILY = 'KaiTi, STKaiti, "Kaiti SC", KaiTi_GB2312, serif';

/** 导出底色：比屏幕上的纸色略浅一点的宣纸。 */
export const CLASSIC_PAPER = '#F8F5EC';

export const CLASSIC_NAME_FONT_SIZE = 16;

export interface ClassicSpouse {
  full_name?: string | null;
  name?: string | null;
  marriage_order?: number | null;
}

/** 排行用一个字：长、次、三……。没有排行就留空，列顶改画字辈。 */
export function classicRankLabel(order?: number | null): string {
  if (order == null || !(order > 0)) return '';
  if (order <= 10) return CLASSIC_RANK[order];
  return String(order);
}

/**
 * 配偶写在姓名下面。一段时是「配陈氏」。
 * 拼出来超过四个字（「配刘氏/继配王氏」这类）就收成「配刘氏等」，避免把窄列撑穿。
 */
export function classicSpouseCaption(spouses?: ClassicSpouse[] | null): string {
  const list = [...(spouses || [])]
    .filter((spouse) => (spouse.full_name || spouse.name || '').trim())
    .sort((a, b) => (a.marriage_order ?? 99) - (b.marriage_order ?? 99));
  if (list.length === 0) return '';
  const caption = list.slice(0, 2).map((spouse, index) => {
    const presented = presentSpouseName(spouse.full_name || spouse.name).text;
    return `${index === 0 ? '配' : '妾'}${presented}`;
  }).join('');
  if (Array.from(caption).length <= 4) return caption;
  const first = presentSpouseName(list[0].full_name || list[0].name).text;
  const head = Array.from(first).slice(0, 2).join('');
  return `配${head}等`;
}

/**
 * 三字及以上的姓名改成两列竖排。
 * 列宽按字号 × 列数再加一条缝，给「欧阳修」留出横向位置，不再和邻列挤在 22px 里。
 */
export function classicColumnWidth(
  name: string,
  baseWidth = 22,
  fontSize = CLASSIC_NAME_FONT_SIZE,
): number {
  const count = Array.from(String(name || '').trim()).length;
  if (count < 3) return baseWidth;
  return Math.max(baseWidth, Math.ceil(fontSize * 2 + 4));
}

/** 两字以内仍是一列。三字起按列均分，先从上往下读完左列，再读右列。 */
export function classicNameColumns(name: string): string[][] {
  const chars = Array.from(String(name || '').trim()).slice(0, 8);
  if (chars.length === 0) return [];
  if (chars.length < 3) return [chars];
  const perColumn = Math.ceil(chars.length / 2);
  return [chars.slice(0, perColumn), chars.slice(perColumn)].filter((column) => column.length > 0);
}

/**
 * 左侧世代表头。depth 从根算起，0 是第一世。
 * 字辈有则写成「12世 景辈」；字辈本身已带「辈」时不重复。
 */
export function classicGenerationTitle(depth: number, word?: string | null): string {
  return classicGenerationLines(depth, word).join(' ');
}

/**
 * 世代表头按两行排：上行「1世」，下行「熹辈」。
 * 「12世」仍占一行，不把数字和「世」拆开。
 */
/** 字辈写成「熹辈」。没有字辈时返回空串，轴上就只留「N世」。 */
export function classicGenerationBei(word?: string | null): string {
  const character = String(word || '').trim().replace(/辈$/, '');
  return character ? `${character}辈` : '';
}

/** 同一代里取出现最多的字辈。 */
export function majorityGenerationWord(counts: Map<string, number>): string {
  let word = '';
  let best = 0;
  for (const [text, count] of counts) {
    const character = String(text || '').trim();
    if (!character || count <= best) continue;
    word = character;
    best = count;
  }
  return word;
}

export function classicGenerationLines(depth: number, word?: string | null): string[] {
  const generation = Math.max(1, Math.floor(depth) + 1);
  const head = `${generation}世`;
  const bei = classicGenerationBei(word);
  return bei ? [head, bei] : [head];
}

export interface ClassicGlyph {
  text: string;
  /** 相对节点中心的偏移。 */
  x: number;
  y: number;
  fontSize: number;
  weight: number;
  role: 'rank' | 'name' | 'spouse';
}

/**
 * 把一列古谱拆成逐字坐标。三字名占两列，字距按盒子高度缩小，最低到 0.72。
 * 屏幕绘制和导出共用这份坐标，避免两处排版各写一遍。
 */
export function layoutClassicGlyphs(options: {
  name: string;
  rank: string;
  spouse: string;
  width: number;
  height: number;
  minimal?: boolean;
}): ClassicGlyph[] {
  const nameColumns = options.minimal ? [] : classicNameColumns(options.name);
  const nameRows = nameColumns.reduce((max, column) => Math.max(max, column.length), 0);
  const rankChars = options.minimal ? [] : Array.from(options.rank).slice(0, 4);
  const spouseChars = options.minimal ? [] : Array.from(options.spouse).slice(0, 4);
  const singleName = options.minimal ? Array.from(options.name).slice(0, 8) : [];
  const small = 11;
  const nameSize = options.width >= 20 ? CLASSIC_NAME_FONT_SIZE : 14;
  const smallStep = small + 2;
  const nameStep = nameSize + 2;
  const pad = 3;
  const nameCount = options.minimal ? singleName.length : nameRows;
  const need = pad * 2
    + rankChars.length * smallStep
    + nameCount * nameStep
    + spouseChars.length * smallStep
    + (rankChars.length ? 4 : 0)
    + (spouseChars.length ? 6 : 0);
  const scale = need > options.height - 2 ? Math.max(0.72, (options.height - 2) / need) : 1;
  const stepS = smallStep * scale;
  const stepN = nameStep * scale;
  const gapRank = (rankChars.length ? 4 : 0) * scale;
  const gapSpouse = (spouseChars.length ? 6 : 0) * scale;

  let cursor = -options.height / 2 + pad * scale;
  const rankY = cursor;
  cursor += rankChars.length * stepS + gapRank;
  const spouseH = spouseChars.length * stepS;
  const nameH = nameCount * stepN;
  const bottom = options.height / 2 - pad * scale;
  let spouseY = bottom - spouseH;
  let nameY = cursor;
  const room = (spouseChars.length ? spouseY - gapSpouse : bottom) - nameY;
  if (room > nameH) nameY += (room - nameH) / 2;
  if (spouseChars.length && nameY + nameH + gapSpouse > spouseY) {
    nameY = cursor;
    spouseY = nameY + nameH + gapSpouse;
  }

  const glyphs: ClassicGlyph[] = [];
  rankChars.forEach((text, index) => {
    glyphs.push({
      text,
      x: 0,
      y: rankY + index * stepS + (small * scale) / 2,
      fontSize: small * scale,
      weight: 400,
      role: 'rank',
    });
  });

  const columns = options.minimal ? [singleName] : nameColumns;
  const colGap = 2 * scale;
  const colWidth = nameSize * scale;
  const totalW = columns.length * colWidth + Math.max(0, columns.length - 1) * colGap;
  const originX = -totalW / 2 + colWidth / 2;
  columns.forEach((column, columnIndex) => {
    const x = columns.length === 1 ? 0 : originX + columnIndex * (colWidth + colGap);
    column.forEach((text, index) => {
      glyphs.push({
        text,
        x,
        y: nameY + index * stepN + (nameSize * scale) / 2,
        fontSize: nameSize * scale,
        weight: 700,
        role: 'name',
      });
    });
  });

  spouseChars.forEach((text, index) => {
    glyphs.push({
      text,
      x: 0,
      y: spouseY + index * stepS + (small * scale) / 2,
      fontSize: small * scale,
      weight: 400,
      role: 'spouse',
    });
  });
  return glyphs;
}
