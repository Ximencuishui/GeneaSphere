/**
 * 苏式垂珠谱。
 * 一祖为一支。垂珠主线竖直，父子上下相承。
 * 同父诸子各开一块垂珠板，横向并排，每块板再向下垂自己的后裔。
 * 儿子再生多子，就在这块板里面继续横向分出子板。
 * 板太宽、超出 A4，把放不下的支另起一图，本图标「支另见图，见第X图」。
 * 一板向下超出一页，本图标「支另见图」，下页标「接上：【父名】，见第X图」。
 * 版本A：竖向 A4，文字横排，长房在左。父节点下拉竖线，再以横线分给诸子；珠圈圆心落在交叉点上。
 * 版本B：横向 A4，文字竖排，长房在右。珠圈圆心落在各支垂线节点上，不画兄弟横线，也不画斜线。欧式不走这里。
 */
import type { EuropeanLinkInput, EuropeanPersonInput, EuropeanSpouseInput } from '@/utils/european-chart';

/** 一页 A4 垂珠板放得下的世代行数。一行是一代，不是一个人。行高要能放下接续注，故为六世。 */
export const SU_BLOCKS_PER_PAGE = 6;

/** 垂珠板一横行的高度。一代一行。文字留在行内，不压到下一世的圆和姓名。 */
export const SU_ROW_MM = 42;

/** 人物文字距本行上沿、以及文字块高度。横线画在文字下面。要放下姓名、生卒、配葬、简述、两行接续注和详见人物传。 */
export const SU_TEXT_TOP_MM = 1;
export const SU_TEXT_H_MM = 36;

/** 世代标注占的边栏。版本A在左，版本B在右。 */
export const SU_RAIL_MM = 14;

/** 垂珠板内容宽，含世代边栏，放进 A4 版心。 */
export const SU_STAGE_MM = 164;

/** 圆圈中心距本行上沿，挨着姓名。 */
export const SU_BEAD_TOP_MM = 6;

/** 空心珠半径 1.2mm，直径 2.4mm。两版圆心都落在垂线节点上。 */
export const SU_BEAD_RADIUS_MM = 1.2;

/** 版本B版框。上下横边 4pt，左右竖边 2pt，严格 2:1，纯黑，无圆角。 */
export const SU_ANTIQUE_FRAME_TOP_PT = 4;
export const SU_ANTIQUE_FRAME_SIDE_PT = 2;

/** 版本B内部分隔竖线：标题与世代栏、世代栏左右、世代栏与正文。 */
export const SU_ANTIQUE_DIVIDER_PT = 1;
/** 垂珠父子竖线、空心珠圈描边。 */
export const SU_ANTIQUE_BEAD_PT = 1;
/** 人物正文下方的短横线。 */
export const SU_ANTIQUE_PERSON_RULE_PT = 0.5;

/** 版本B世代墨块宽度。一列 8pt 阴文，窄于 9pt 生平小字，左右留出对称空隙。 */
const SU_ANTIQUE_GEN_W_MM = 4.2;
/** 墨块到左右竖线的空隙，两边相同，墨块不压线。 */
const SU_ANTIQUE_GEN_GAP_MM = 1.35;

/** 版本A版框可选线宽。默认 4pt，最宽 10pt，四边同一数值。 */
export const SU_FRAME_WEIGHTS_PT = [0.6, 1, 2, 4, 6, 10] as const;
export type SuFrameWeightPt = (typeof SU_FRAME_WEIGHTS_PT)[number];

export function suFrameWeightPt(value: unknown): SuFrameWeightPt {
  const number = typeof value === 'number' ? value : Number(value);
  return (SU_FRAME_WEIGHTS_PT as readonly number[]).includes(number)
    ? (number as SuFrameWeightPt)
    : 4;
}

/** 珠圈上方的页眉空隙，避免首行圆被裁掉。 */
const SU_HEAD_MM = 4;

/** 仿古横版一行的高度。六世仍落在横向 A4 版框内。 */
const SU_ANTIQUE_ROW_MM = 26;

/** 仿古横版版心宽度。右侧版框内边距另留给竖排图题，版心本身不含图题。 */
const SU_ANTIQUE_STAGE_MM = 244;

/** 版心四周留白。文字、珠圈、世代块都不得越过。 */
const SU_ANTIQUE_INSET_MM = 2;

/** 仿古页眉，让首行珠圈离开版心上沿。 */
const SU_ANTIQUE_HEAD_MM = 3.6;

/** 竖排一个生平小字占的高度。9pt 长仿宋，渲染前用来估算要几列。 */
const SU_ANTIQUE_CHAR_MM = 3.4;

/** 竖排一列的宽度，按 14pt 姓名。 */
const SU_ANTIQUE_COL_MM = 5.6;

/** 仿古世代栏：左右两条竖线，墨块夹在中间，左右边距相同。 */
export function suAntiqueColumn(width = SU_ANTIQUE_STAGE_MM): {
  left: number;
  right: number;
  blockX: number;
  blockW: number;
  leftFromRight: number;
  rightFromRight: number;
} {
  const right = round(width - SU_ANTIQUE_INSET_MM - 1.2);
  const left = round(right - SU_ANTIQUE_GEN_GAP_MM * 2 - SU_ANTIQUE_GEN_W_MM);
  const blockX = round(left + SU_ANTIQUE_GEN_GAP_MM);
  return {
    left,
    right,
    blockX,
    blockW: SU_ANTIQUE_GEN_W_MM,
    leftFromRight: round(width - left),
    rightFromRight: round(width - right),
  };
}

/** 竖线和文字之间的空档，接上、接下写在这里。 */
export const SU_STRIP_MM = 6.8;

/** 人物信息块最宽。窄板再收。 */
export const SU_TEXT_MAX_MM = 46;

/**
 * 一块垂珠板至少要这么宽，姓名和配葬才读得清。
 * 并排板数超过这个宽度，就拆到下一图，不把字挤成一条缝。
 */
export const SU_MIN_COL_MM = 36;

export type SuRole = 'origin' | 'carried-in' | 'carried-out' | 'bridge';

export interface SuBlock {
  personId: string;
  name: string;
  /** 相对本页支头的世代深度。支头是 0，其子是 1。同一深度画在同一横行。 */
  depth: number;
  role: SuRole;
  spouseText: string;
  mark: string;
  /** 父亲 id。父亲不在本页时，这个人就是本页支头，不往页外连线。 */
  parentId: string | null;
  /** 接上时写的父名。没有父亲时为空。 */
  parentName: string;
  /** 家族世代，从 1 起。材料里没有时为空，画世代栏时再按深度推。 */
  generation: number | null;
  /** 还有兄弟或子板没排进本图。 */
  branchOff: boolean;
  /** 本图截断后要去的图号，从 1 起。 */
  cutChartNos: number[];
  /** 本图由哪一张图接上来，从 1 起。 */
  resumeChartNo: number | null;
  /** 接上括号里的父名。 */
  resumeFatherName: string;
}

export interface SuChart {
  index: number;
  branchPersonId: string;
  /** 已含「公支世系」，例如「朱熹公支世系」。 */
  branchName: string;
  blocks: SuBlock[];
}

export interface SuAppearance {
  chartNo: number;
  chartNos: number[];
}

/** 本页里的一支。children 只含本页已排进来的儿子，不跨页。 */
export interface SuBeadNode {
  block: SuBlock;
  index: number;
  children: SuBeadNode[];
}

interface PersonNode {
  id: string;
  name: string;
  generation: number;
  birthOrder: number;
  spouseText: string;
  mark: string;
  childIds: string[];
}

interface TreePerson {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string;
  spouseText: string;
  mark: string;
  generation: number | null;
  children: TreePerson[];
}

interface FitResult {
  node: TreePerson;
  nested: TreePerson[][];
  direct: TreePerson[];
}

interface BuildCtx {
  rows: number;
  cols: number;
  charts: SuChart[];
  guard: number;
}

const VIRTUAL_ID = '\0su-pack';

/** 版心去掉世代栏后，横着最多并排几块板。 */
export function suMaxColumns(): number {
  return Math.max(1, Math.floor((SU_STAGE_MM - SU_RAIL_MM) / SU_MIN_COL_MM));
}

export function suBranchName(name: string): string {
  const text = String(name || '').trim() || '本支';
  const head = text.endsWith('公') ? text : `${text}公`;
  return `${head}支世系`;
}

export function buildSuCharts(
  people: readonly EuropeanPersonInput[],
  links: readonly EuropeanLinkInput[],
  options?: { blocksPerPage?: number; maxColumns?: number },
): SuChart[] {
  const forest = buildForest(people, links);
  if (forest.byId.size === 0) return [];
  const ctx: BuildCtx = {
    rows: clampCapacity(options?.blocksPerPage),
    cols: clampColumns(options?.maxColumns),
    charts: [],
    guard: forest.byId.size * 2 + 4,
  };
  for (const root of forest.roots) emitSiblings([toTree(root, null, '', forest.byId)], ctx);
  linkSuContinuations(ctx.charts);
  return ctx.charts;
}

export function groupSuCharts(
  charts: readonly SuChart[],
  pack: 'exclusive' | 'share',
  maxBlocks = SU_BLOCKS_PER_PAGE,
): SuChart[][] {
  if (pack !== 'share') return charts.map((chart) => [chart]);
  const limit = Math.max(1, Math.floor(maxBlocks) || SU_BLOCKS_PER_PAGE);
  const groups: SuChart[][] = [];
  let bucket: SuChart[] = [];
  let used = 0;
  for (const chart of charts) {
    const need = chartRows(chart);
    if (bucket.length && used + need > limit) {
      groups.push(bucket);
      bucket = [];
      used = 0;
    }
    bucket.push(chart);
    used += need;
  }
  if (bucket.length) groups.push(bucket);
  return groups;
}

/** 接上的重复头人不作为该人的正文图号。 */
export function indexSuAppearances(charts: readonly SuChart[]): Map<string, SuAppearance> {
  const seen = new Map<string, SuAppearance>();
  const ordered = [...charts].sort((a, b) => a.index - b.index);
  for (const chart of ordered) {
    const chartNo = chart.index + 1;
    for (const block of chart.blocks) {
      if (block.role === 'carried-in') continue;
      const found = seen.get(block.personId);
      if (!found) {
        seen.set(block.personId, { chartNo, chartNos: [chartNo] });
        continue;
      }
      if (!found.chartNos.includes(chartNo)) found.chartNos.push(chartNo);
    }
  }
  return seen;
}

/**
 * 按本页块嵌成父子树。
 * 父亲不在本页的人成为本页支头，避免把线画到上一页。
 */
export function nestSuBlocks(blocks: readonly SuBlock[]): SuBeadNode[] {
  const nodes: SuBeadNode[] = blocks.map((block, index) => ({
    block,
    index,
    children: [],
  }));
  const roots: SuBeadNode[] = [];
  const seen = new Map<string, SuBeadNode>();
  for (const node of nodes) {
    const parent = node.block.parentId ? seen.get(node.block.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
    seen.set(node.block.personId, node);
  }
  return roots;
}

/** 一板里的一个人。col 从 0 起，0 永远是长房，不随阅读方向改变。 */
export interface SuPlateSlot {
  index: number;
  personId: string;
  col: number;
  colFrom: number;
  colTo: number;
  row: number;
  depth: number;
  generation: number | null;
}

export interface SuPlateLayout {
  columns: number;
  rows: number;
  minDepth: number;
  slots: SuPlateSlot[];
}

export interface SuRule {
  parentId: string;
  axis: 'v' | 'h';
  x: number;
  y: number;
  length: number;
}

export interface SuBeadMark {
  personId: string;
  index: number;
  x: number;
  y: number;
}

export interface SuMarkBox {
  personId: string;
  index: number;
  kind: 'in' | 'out' | 'off';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SuPlacedPerson {
  index: number;
  personId: string;
  col: number;
  row: number;
  generation: number | null;
  beadX: number;
  beadY: number;
  textX: number;
  textY: number;
  textW: number;
  textH: number;
  /** 仿古竖排塞进版心时的字号比例。版本A恒为 1。 */
  textScale: number;
}

export interface SuGenerationBand {
  row: number;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  boxed: boolean;
}

export interface SuColumnRails {
  /** 世代栏左竖线，版心坐标。 */
  left: number;
  /** 世代栏右竖线，版心坐标。 */
  right: number;
}

export interface SuTextUnderline {
  index: number;
  x: number;
  y: number;
  w: number;
}

export interface SuChartPlace {
  reading: 'ltr' | 'rtl';
  columns: number;
  rows: number;
  width: number;
  height: number;
  people: SuPlacedPerson[];
  generations: SuGenerationBand[];
  lines: SuRule[];
  beads: SuBeadMark[];
  seams: SuMarkBox[];
  /** 世代栏左竖线。仿古才有，和 rails.left 相同。 */
  railX: number | null;
  /** 世代栏左右两条通天竖线。仿古才有。 */
  rails: SuColumnRails | null;
  /** 每个人物正文下方的短横线。仿古才有，不穿过文字。 */
  underlines: SuTextUnderline[];
  /** 版本A不使用。仿古的人物分隔改走 underlines。 */
  bands: number[];
}

/** 仿古竖排在落笔前量过的字数。index 对应 SuBeadNode.index。 */
export interface SuAntiqueMeasure {
  index: number;
  chars: number;
}

const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 版本A用阿拉伯数字，版本B用汉字，和古籍世代栏一致。 */
export function suGenerationLabel(generation: number | null, script: 'horizontal' | 'antique'): string {
  if (generation == null || !Number.isFinite(generation) || generation <= 0) return '';
  const value = Math.floor(generation);
  if (script !== 'antique') return `${value}世`;
  return `${chineseNumber(value)}世`;
}

/**
 * 给本页的人排板。
 * 长子的整支先占连续的列，次子排在长子支外侧。父节点的垂珠落在长子那一列，竖线才能上下直串。
 */
export function layoutSuPlates(roots: readonly SuBeadNode[]): SuPlateLayout {
  const slots: SuPlateSlot[] = [];
  let minDepth = Number.POSITIVE_INFINITY;
  const scan = (node: SuBeadNode) => {
    minDepth = Math.min(minDepth, node.block.depth);
    node.children.forEach(scan);
  };
  roots.forEach(scan);
  if (!Number.isFinite(minDepth)) minDepth = 0;

  let cursor = 0;
  const assign = (node: SuBeadNode) => {
    if (node.children.length === 0) {
      const col = cursor;
      cursor += 1;
      slots.push(slotFrom(node, col, col, col, minDepth));
      return;
    }
    node.children.forEach(assign);
    const kids = node.children.map((child) => slots.find((slot) => slot.index === child.index)!);
    const eldest = kids[0];
    slots.push(slotFrom(
      node,
      eldest.col,
      Math.min(...kids.map((kid) => kid.colFrom)),
      Math.max(...kids.map((kid) => kid.colTo)),
      minDepth,
    ));
  };
  roots.forEach(assign);
  slots.sort((a, b) => a.index - b.index);
  const rows = slots.reduce((max, slot) => Math.max(max, slot.row + 1), 0);
  return {
    columns: Math.max(1, cursor),
    rows: Math.max(1, rows),
    minDepth,
    slots,
  };
}

/**
 * 把一页排成垂珠坐标。
 * horizontal：长房在左，文字在竖线右侧、横线下面。兄弟横线贴着诸子圆圈的下沿。圆心在交叉点上。
 * antique：长房在右，文字竖排在竖线左侧。同父诸子各自向下垂线，不画兄弟横线，也不画斜线。
 * 版本B的珠圈圆心落在该支垂线节点上。落笔前按字数收文字列，并校验版心边界。
 */
export function placeSuChart(
  roots: readonly SuBeadNode[],
  script: 'horizontal' | 'antique',
  measures?: readonly SuAntiqueMeasure[],
): SuChartPlace {
  const antique = script === 'antique';
  const reading = antique ? 'rtl' : 'ltr';
  const layout = layoutSuPlates(roots);
  const rowPitch = antique ? SU_ANTIQUE_ROW_MM : SU_ROW_MM;
  const width = antique ? SU_ANTIQUE_STAGE_MM : SU_STAGE_MM;
  const byIndex = new Map(layout.slots.map((slot) => [slot.index, slot]));
  if (layout.slots.length === 0) {
    return {
      reading,
      columns: 1,
      rows: 0,
      width,
      height: 0,
      people: [],
      generations: [],
      lines: [],
      beads: [],
      seams: [],
      railX: null,
      rails: null,
      underlines: [],
      bands: [],
    };
  }

  const head = antique ? SU_ANTIQUE_HEAD_MM : SU_HEAD_MM;
  const height = round(head + layout.rows * rowPitch + (antique ? 2.4 : 1.2));
  const colWidth = (width - SU_RAIL_MM) / layout.columns;
  const textW = round(Math.min(SU_TEXT_MAX_MM, Math.max(12, colWidth - SU_STRIP_MM - 2)));
  const textH = SU_TEXT_H_MM;
  const rowLineY = (row: number) => head + row * rowPitch;
  const beadYOf = (row: number) => (antique ? rowLineY(row) + 3.4 : rowLineY(row));
  const textYOf = (row: number) => beadYOf(row) + SU_BEAD_RADIUS_MM + 1.6;
  const beadXOf = (col: number) => (
    reading === 'ltr'
      ? SU_RAIL_MM + col * colWidth + 3.2
      : width - SU_RAIL_MM - col * colWidth - SU_BEAD_RADIUS_MM - 1.6
  );
  const textXOf = (beadX: number) => beadX + SU_STRIP_MM;
  const charsOf = new Map<number, number>();
  for (const item of measures ?? []) {
    if (Number.isFinite(item.chars)) charsOf.set(item.index, Math.max(1, Math.round(item.chars)));
  }
  const fallbackChars = new Map<number, number>();
  for (const node of walkNodes(roots)) {
    fallbackChars.set(node.index, Math.max(2, node.block.name.length + node.block.spouseText.length + node.block.mark.length + 8));
  }

  const people: SuPlacedPerson[] = layout.slots.map((slot) => {
    const bead = clampBead(beadXOf(slot.col), beadYOf(slot.row), antique, width, height);
    if (!antique) {
      return {
        index: slot.index,
        personId: slot.personId,
        col: slot.col,
        row: slot.row,
        generation: slot.generation,
        beadX: bead.x,
        beadY: bead.y,
        textX: round(textXOf(bead.x)),
        textY: round(textYOf(slot.row)),
        textW,
        textH,
        textScale: 1,
      };
    }
    const fitted = fitAntiqueText(slot.index, bead.x, bead.y, colWidth, height, rowPitch, charsOf, fallbackChars);
    return {
      index: slot.index,
      personId: slot.personId,
      col: slot.col,
      row: slot.row,
      generation: slot.generation,
      beadX: bead.x,
      beadY: bead.y,
      textX: fitted.textX,
      textY: fitted.textY,
      textW: fitted.textW,
      textH: fitted.textH,
      textScale: fitted.textScale,
    };
  });
  const placed = new Map(people.map((person) => [person.index, person]));

  const lines: SuRule[] = [];
  const pushV = (parentId: string, x: number, y0: number, y1: number) => {
    if (y1 - y0 < 0.2) return;
    lines.push({
      parentId,
      axis: 'v',
      x: round(x),
      y: round(y0),
      length: round(y1 - y0),
    });
  };
  const pushH = (parentId: string, x0: number, x1: number, y: number) => {
    if (x1 - x0 < 0.2) return;
    lines.push({
      parentId,
      axis: 'h',
      x: round(Math.min(x0, x1)),
      y: round(y),
      length: round(Math.abs(x1 - x0)),
    });
  };
  const walk = (node: SuBeadNode) => {
    const slot = byIndex.get(node.index);
    if (slot && node.children.length > 0) {
      const kids = node.children
        .map((child) => byIndex.get(child.index))
        .filter((child): child is SuPlateSlot => !!child && child.row > slot.row);
      if (kids.length > 0) {
        const from = placed.get(slot.index)!;
        const first = placed.get(kids[0].index)!;
        if (antique) {
          for (const kid of kids) {
            if (kid.col !== slot.col) continue;
            const to = placed.get(kid.index)!;
            pushV(node.block.personId, to.beadX, from.beadY, to.beadY);
          }
        } else {
          pushV(node.block.personId, from.beadX, from.beadY, first.beadY);
          if (kids.length > 1 || kids[0].col !== slot.col) {
            const xs = kids.map((kid) => placed.get(kid.index)!.beadX);
            pushH(node.block.personId, Math.min(...xs), Math.max(...xs), first.beadY);
          }
        }
      }
    }
    node.children.forEach(walk);
  };
  roots.forEach(walk);
  if (antique) {
    for (const person of people) {
      const onLine = lines.some((rule) => rule.axis === 'v' && beadSitsOn(rule, person.beadX, person.beadY));
      if (onLine) continue;
      const stem = Math.min(7.5, rowPitch * 0.36);
      const y1 = Math.min(person.beadY + stem, height - SU_ANTIQUE_INSET_MM);
      pushV(person.personId, person.beadX, person.beadY, y1);
    }
  }

  const seams: SuMarkBox[] = [];
  const upright = antique;
  for (const node of walkNodes(roots)) {
    const slot = byIndex.get(node.index);
    const person = slot ? placed.get(slot.index) : undefined;
    if (!slot || !person) continue;
    const boxW = upright ? 4.2 : 4.6;
    const boxH = upright ? 6.4 : 3.2;
    const x = person.beadX + SU_BEAD_RADIUS_MM + 0.45;
    const push = (kind: 'in' | 'out', y: number) => {
      seams.push({
        personId: slot.personId,
        index: slot.index,
        kind,
        x: round(x),
        y: round(Math.max(0.2, y)),
        w: boxW,
        h: boxH,
      });
    };
    if (node.block.role === 'carried-in' || node.block.role === 'bridge') {
      push('in', person.beadY - (upright ? 0.6 : 3.4));
    }
    if (node.block.role === 'carried-out' || node.block.role === 'bridge') {
      push('out', person.beadY + (upright ? 0.8 : 0.2));
    }
    if (node.block.branchOff) {
      const markW = 30;
      seams.push({
        personId: slot.personId,
        index: slot.index,
        kind: 'off',
        x: round(Math.max(0, Math.min(person.textX, width - markW))),
        y: round(person.textY + person.textH + 0.4),
        w: markW,
        h: 3.8,
      });
    }
  }

  const generations: SuGenerationBand[] = [];
  const column = antique ? suAntiqueColumn(width) : null;
  for (let row = 0; row < layout.rows; row += 1) {
    const label = suGenerationLabel(generationAt(layout, row), script);
    if (!label) continue;
    if (!antique) {
      generations.push({
        row,
        label,
        x: 0.4,
        y: round(textYOf(row)),
        w: SU_RAIL_MM - 1.2,
        h: 6,
        boxed: false,
      });
      continue;
    }
    const genY = round(rowLineY(row) + 1.8);
    const genH = round(Math.min(rowPitch - 4.2, height - SU_ANTIQUE_INSET_MM - genY));
    generations.push({
      row,
      label,
      x: column!.blockX,
      y: genY,
      w: column!.blockW,
      h: round(Math.max(8, genH)),
      boxed: true,
    });
  }

  const underlines: SuTextUnderline[] = antique
    ? people.map((person) => ({
      index: person.index,
      x: person.textX,
      y: round(person.textY + person.textH + 0.35),
      w: person.textW,
    }))
    : [];

  return {
    reading,
    columns: layout.columns,
    rows: layout.rows,
    width,
    height,
    people,
    generations,
    lines,
    beads: people.map((person) => ({
      personId: person.personId,
      index: person.index,
      x: person.beadX,
      y: person.beadY,
    })),
    seams,
    railX: column ? column.left : null,
    rails: column ? { left: column.left, right: column.right } : null,
    underlines,
    bands: [],
  };
}

/** 仿古一页有没有字、珠圈或世代块跑出版心。空数组表示收得住。 */
export function suAntiqueOverflows(place: SuChartPlace): string[] {
  if (place.reading !== 'rtl') return [];
  const issues: string[] = [];
  const inset = SU_ANTIQUE_INSET_MM;
  const radius = SU_BEAD_RADIUS_MM;
  const outside = (x: number, y: number, w: number, h: number) => (
    x < inset - 0.05
    || y < inset - 0.05
    || x + w > place.width - inset + 0.05
    || y + h > place.height - inset + 0.05
  );
  for (const person of place.people) {
    if (outside(person.textX, person.textY, person.textW, person.textH)) issues.push(`text:${person.personId}`);
    if (person.beadX - radius < inset - 0.05 || person.beadX + radius > place.width - inset + 0.05) issues.push(`bead-x:${person.personId}`);
    if (person.beadY - radius < inset - 0.05 || person.beadY + radius > place.height - inset + 0.05) issues.push(`bead-y:${person.personId}`);
    if (person.textX + person.textW > person.beadX - radius + 0.05) issues.push(`text-over-bead:${person.personId}`);
  }
  if (place.rails) {
    for (const band of place.generations) {
      if (band.x < place.rails.left + 0.2 || band.x + band.w > place.rails.right - 0.2) {
        issues.push(`gen-rail:${band.label}`);
      }
    }
  }
  for (const line of place.underlines) {
    const person = place.people.find((item) => item.index === line.index);
    if (outside(line.x, line.y - 0.2, line.w, 0.8)) issues.push(`underline:${line.index}`);
    if (person && line.x + line.w > person.beadX - radius - 0.05) issues.push(`underline-bead:${line.index}`);
    if (person && line.y < person.textY + person.textH - 0.05) issues.push(`underline-text:${line.index}`);
  }
  for (const band of place.generations) {
    if (outside(band.x, band.y, band.w, band.h)) issues.push(`gen:${band.label}`);
    for (const person of place.people) {
      const overlap = band.x < person.textX + person.textW - 0.2
        && band.x + band.w > person.textX + 0.2
        && band.y < person.textY + person.textH - 0.2
        && band.y + band.h > person.textY + 0.2;
      if (overlap) issues.push(`gen-over-text:${band.label}:${person.personId}`);
    }
  }
  if (place.lines.some((rule) => rule.axis === 'h')) issues.push('horizontal-line');
  for (const bead of place.beads) {
    const onLine = place.lines.some((rule) => rule.axis === 'v' && beadSitsOn(rule, bead.x, bead.y));
    if (!onLine) issues.push(`bead-off-line:${bead.personId}`);
  }
  for (const rule of place.lines) {
    const bottom = rule.y + (rule.axis === 'v' ? rule.length : 0);
    const right = rule.x + (rule.axis === 'h' ? rule.length : 0);
    if (rule.x < -0.05 || rule.y < -0.05 || right > place.width + 0.05 || bottom > place.height + 0.05) issues.push('line-out');
  }
  return issues;
}

function clampBead(x: number, y: number, antique: boolean, width: number, height: number): { x: number; y: number } {
  if (!antique) return { x: round(x), y: round(y) };
  const radius = SU_BEAD_RADIUS_MM;
  return {
    x: round(Math.min(width - SU_ANTIQUE_INSET_MM - radius, Math.max(SU_ANTIQUE_INSET_MM + radius, x))),
    y: round(Math.min(height - SU_ANTIQUE_INSET_MM - radius, Math.max(SU_ANTIQUE_INSET_MM + radius, y))),
  };
}

function fitAntiqueText(
  index: number,
  beadX: number,
  beadY: number,
  colWidth: number,
  height: number,
  rowPitch: number,
  charsOf: ReadonlyMap<number, number>,
  fallbackChars: ReadonlyMap<number, number>,
): { textX: number; textY: number; textW: number; textH: number; textScale: number } {
  const inset = SU_ANTIQUE_INSET_MM;
  const radius = SU_BEAD_RADIUS_MM;
  let textH = round(Math.max(10, rowPitch - 6.4));
  let textY = round(beadY - 1.8);
  if (textY < inset) textY = inset;
  if (textY + textH > height - inset - 1.8) textH = round(Math.max(8, height - inset - 1.8 - textY));
  const chars = charsOf.get(index) ?? fallbackChars.get(index) ?? 2;
  const perCol = Math.max(1, Math.floor((textH - 1) / SU_ANTIQUE_CHAR_MM));
  const cols = Math.max(1, Math.ceil(chars / perCol));
  const need = cols * SU_ANTIQUE_COL_MM;
  const right = beadX - radius - 0.7;
  const left = Math.max(inset, beadX - colWidth + radius + 1.5);
  const room = Math.max(SU_ANTIQUE_COL_MM, right - left);
  let textW = Math.min(need, room);
  let textScale = 1;
  if (need > room + 0.05) {
    textScale = room / need;
    textW = room;
  }
  let textX = right - textW;
  if (textX < inset) {
    textW = Math.max(SU_ANTIQUE_COL_MM, textW - (inset - textX));
    textX = inset;
  }
  if (textX + textW > right) textW = Math.max(3.4, right - textX);
  return {
    textX: round(textX),
    textY: round(textY),
    textW: round(textW),
    textH: round(textH),
    textScale: round(textScale),
  };
}

function beadSitsOn(rule: SuRule, x: number, y: number): boolean {
  return Math.abs(rule.x - x) < 0.02 && y >= rule.y - 0.02 && y <= rule.y + rule.length + 0.02;
}

function slotFrom(node: SuBeadNode, col: number, colFrom: number, colTo: number, minDepth: number): SuPlateSlot {
  return {
    index: node.index,
    personId: node.block.personId,
    col,
    colFrom,
    colTo,
    row: node.block.depth - minDepth,
    depth: node.block.depth,
    generation: node.block.generation,
  };
}

function generationAt(layout: SuPlateLayout, row: number): number | null {
  const onRow = layout.slots.filter((slot) => slot.row === row && slot.generation != null);
  if (onRow.length) return Math.min(...onRow.map((slot) => slot.generation!));
  const known = layout.slots.find((slot) => slot.generation != null);
  if (!known || known.generation == null) return row + 1;
  return known.generation + (layout.minDepth + row - known.depth);
}

function walkNodes(roots: readonly SuBeadNode[]): SuBeadNode[] {
  const list: SuBeadNode[] = [];
  const visit = (node: SuBeadNode) => {
    list.push(node);
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return list;
}

function chineseNumber(value: number): string {
  if (value <= 0) return String(value);
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampCapacity(value: number | undefined): number {
  const size = value == null || !Number.isFinite(value) ? SU_BLOCKS_PER_PAGE : Math.floor(value);
  if (size < 2) return 2;
  return size;
}

function clampColumns(value: number | undefined): number {
  const size = value == null || !Number.isFinite(value) ? suMaxColumns() : Math.floor(value);
  if (size < 1) return 1;
  return size;
}

function chartRows(chart: SuChart): number {
  if (!chart.blocks.length) return 1;
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const block of chart.blocks) {
    min = Math.min(min, block.depth);
    max = Math.max(max, block.depth);
  }
  return Math.max(1, max - min + 1);
}

/**
 * 同父的几块板尽量排进同一图。
 * 给后面的兄弟各留一列，当前这块不够宽时，多出来的子板另见图。
 */
function emitSiblings(siblings: readonly TreePerson[], ctx: BuildCtx) {
  if (!siblings.length || ctx.charts.length > ctx.guard) return;
  const off = new Set<string>();
  const fitted = fit(virtualParent(siblings), ctx.cols, off);
  off.delete(VIRTUAL_ID);
  if (fitted.node.children.length) pushPages(fitted.node.children, off, ctx);
  for (const group of fitted.nested) emitSiblings(group, ctx);
  if (fitted.direct.length) emitSiblings(fitted.direct, ctx);
}

function pushPages(roots: readonly TreePerson[], off: Set<string>, ctx: BuildCtx) {
  if (!roots.length || ctx.charts.length > ctx.guard) return;
  const maxDepth = roots.reduce((max, root) => Math.max(max, depthOf(root)), 0);
  let start = 0;
  while (start <= maxDepth && ctx.charts.length <= ctx.guard) {
    const end = start + ctx.rows - 1;
    const blocks: SuBlock[] = [];
    for (const root of roots) collect(root, 0, start, end, blocks, off);
    if (!blocks.length) break;
    const head = blocks[0];
    ctx.charts.push({
      index: ctx.charts.length,
      branchPersonId: head.personId,
      branchName: suBranchName(head.name),
      blocks,
    });
    if (!blocks.some((block) => block.role === 'carried-out' || block.role === 'bridge')) break;
    start = end;
  }
}

function collect(
  node: TreePerson,
  depth: number,
  start: number,
  end: number,
  blocks: SuBlock[],
  off: Set<string>,
) {
  if (depth > end) return;
  if (depth >= start) {
    const carriedIn = start > 0 && depth === start;
    const carriedOut = depth === end && node.children.length > 0;
    let role: SuRole = 'origin';
    if (carriedIn && carriedOut) role = 'bridge';
    else if (carriedIn) role = 'carried-in';
    else if (carriedOut) role = 'carried-out';
    blocks.push({
      personId: node.id,
      name: node.name,
      depth: depth - start,
      role,
      spouseText: node.spouseText,
      mark: node.mark,
      parentId: node.parentId,
      parentName: node.parentName,
      generation: node.generation,
      branchOff: off.has(node.id) && !carriedIn,
      cutChartNos: [],
      resumeChartNo: null,
      resumeFatherName: '',
    });
  }
  if (depth >= end) return;
  for (const child of node.children) collect(child, depth + 1, start, end, blocks, off);
}

function fit(node: TreePerson, maxCols: number, off: Set<string>): FitResult {
  const kept: TreePerson[] = [];
  const nested: TreePerson[][] = [];
  const direct: TreePerson[] = [];
  let used = 0;
  const budget = Math.max(1, maxCols);
  node.children.forEach((child, index) => {
    const remaining = budget - used;
    if (remaining <= 0) {
      direct.push(child);
      return;
    }
    const later = node.children.length - index - 1;
    const reserve = Math.min(later, remaining - 1);
    const room = remaining - reserve;
    const inner = fit(child, room, off);
    kept.push(inner.node);
    nested.push(...inner.nested);
    if (inner.direct.length) nested.push(inner.direct);
    used += columnNeed(inner.node);
  });
  if (direct.length) off.add(node.id);
  return {
    node: { ...node, children: kept },
    nested,
    direct,
  };
}

function virtualParent(children: readonly TreePerson[]): TreePerson {
  return {
    id: VIRTUAL_ID,
    name: '',
    parentId: null,
    parentName: '',
    spouseText: '',
    mark: '',
    generation: null,
    children: [...children],
  };
}

function columnNeed(node: TreePerson): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, child) => sum + columnNeed(child), 0);
}

function depthOf(node: TreePerson): number {
  let depth = 0;
  for (const child of node.children) depth = Math.max(depth, 1 + depthOf(child));
  return depth;
}

function toTree(node: PersonNode, parentId: string | null, parentName: string, byId: Map<string, PersonNode>): TreePerson {
  return {
    id: node.id,
    name: node.name,
    parentId,
    parentName,
    spouseText: node.spouseText,
    mark: node.mark,
    generation: Number.isFinite(node.generation) ? node.generation : null,
    children: node.childIds.map((id) => toTree(byId.get(id)!, node.id, node.name, byId)),
  };
}

/** 截断和接上成对。图号从 1 起。接上写父亲的名字。 */
function linkSuContinuations(charts: SuChart[]) {
  const laterCut = (chart: SuChart, personId: string, roles: SuRole[]) => charts.find((item) => (
    item.index > chart.index && item.blocks.some((block) => block.personId === personId && roles.includes(block.role))
  ));
  const earlierCut = (chart: SuChart, personId: string, roles: SuRole[]) => [...charts].reverse().find((item) => (
    item.index < chart.index && item.blocks.some((block) => block.personId === personId && roles.includes(block.role))
  ));
  for (const chart of charts) {
    for (const block of chart.blocks) {
      if (block.role === 'carried-out' || block.role === 'bridge') {
        const next = laterCut(chart, block.personId, ['carried-in', 'bridge']);
        if (next) block.cutChartNos.push(next.index + 1);
      }
      if (block.role === 'carried-in' || block.role === 'bridge') {
        const prev = earlierCut(chart, block.personId, ['carried-out', 'bridge']);
        if (prev) {
          block.resumeChartNo = prev.index + 1;
          block.resumeFatherName = block.parentName || block.name;
        }
      }
    }
  }
  for (const chart of charts) {
    for (const block of chart.blocks) {
      if (!block.branchOff) continue;
      const targets = charts.filter((item) => {
        if (item.index <= chart.index) return false;
        const head = item.blocks[0];
        return !!head && head.personId !== block.personId && head.parentId === block.personId;
      });
      for (const target of targets) {
        const chartNo = target.index + 1;
        if (!block.cutChartNos.includes(chartNo)) block.cutChartNos.push(chartNo);
        const head = target.blocks[0];
        if (head.resumeChartNo == null) {
          head.resumeChartNo = chart.index + 1;
          head.resumeFatherName = block.name;
        }
      }
    }
  }
}

function buildForest(
  people: readonly EuropeanPersonInput[],
  links: readonly EuropeanLinkInput[],
): { byId: Map<string, PersonNode>; roots: PersonNode[] } {
  const byId = new Map<string, PersonNode>();
  for (const person of people) {
    const id = String(person.id ?? '').trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      name: String(person.name ?? '').trim() || id,
      generation: finiteGeneration(person.generation),
      birthOrder: finiteOrder(person.birthOrder),
      spouseText: formatSpouseText(person.spouses),
      mark: formatMark(person.childType),
      childIds: [],
    });
  }

  const parentOf = new Map<string, string>();
  const parentGen = new Map<string, number>();
  for (const link of links) {
    const parentId = String(link.parentId ?? '').trim();
    const childId = String(link.childId ?? '').trim();
    if (!parentId || !childId || parentId === childId) continue;
    if (!byId.has(parentId) || !byId.has(childId)) continue;
    const generation = byId.get(parentId)!.generation;
    const current = parentGen.get(childId);
    if (current == null || generation > current) {
      parentOf.set(childId, parentId);
      parentGen.set(childId, generation);
    }
  }

  for (const link of links) {
    const parentId = String(link.parentId ?? '').trim();
    const childId = String(link.childId ?? '').trim();
    if (parentOf.get(childId) !== parentId) continue;
    const child = byId.get(childId);
    if (!child) continue;
    const order = finiteOrder(link.birthOrder);
    if (order !== Number.POSITIVE_INFINITY) child.birthOrder = order;
    const mark = formatMark(link.childType);
    if (mark) child.mark = mark;
  }

  for (const [childId, parentId] of parentOf) {
    byId.get(parentId)!.childIds.push(childId);
  }
  for (const node of byId.values()) {
    node.childIds.sort((a, b) => compareNodes(byId.get(a)!, byId.get(b)!));
  }
  const roots = [...byId.values()].filter((node) => !parentOf.has(node.id)).sort(compareNodes);
  return { byId, roots };
}

function compareNodes(a: PersonNode, b: PersonNode): number {
  if (a.generation !== b.generation) return a.generation - b.generation;
  if (a.birthOrder !== b.birthOrder) return a.birthOrder - b.birthOrder;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function finiteGeneration(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return Math.floor(value);
}

function finiteOrder(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return value;
}

function formatSpouseText(spouses: readonly EuropeanSpouseInput[] | undefined): string {
  const list = (spouses ?? [])
    .map((spouse) => ({
      name: String(spouse.name ?? '').trim(),
      order: finiteOrder(spouse.marriageOrder),
    }))
    .filter((spouse) => spouse.name.length > 0)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh'));
  if (list.length === 0) return '';
  return list.map((spouse, index) => `${index === 0 ? '配' : '继配'}${spouse.name}`).join('、');
}

function formatMark(childType: string | undefined): string {
  switch (childType) {
    case 'ADOPTED':
      return '过继';
    case 'ADOPTED_OUT':
      return '出继';
    case 'STEP':
      return '继';
    case 'FOSTER':
      return '抚';
    default:
      return '';
  }
}
