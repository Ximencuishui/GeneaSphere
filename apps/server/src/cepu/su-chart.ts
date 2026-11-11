/**
 * 苏式垂珠谱。
 * 一祖为一支。垂珠主线竖直，父子上下相承。
 * 同父诸子各开一块垂珠板，横向并排，每块板再向下垂自己的后裔。
 * 儿子再生多子，就在这块板里面继续横向分出子板。
 * 板太宽、超出 A4，把放不下的支另起一图，本图标「支另见图，见第X图」。
 * 一板向下超出一页，本图标「支另见图」，下页标「接上：【父名】，见第X图」。
 * 版本A：竖向 A4，文字横排，长房在左。父节点下拉竖线，再以横线分给诸子；珠圈圆心落在交叉点上。
 * 版本B：横向 A4，文字竖排，长房在右。只画各支向下的垂线，不画兄弟横线。欧式不走这里。
 */
import type { EuropeanLinkInput, EuropeanPersonInput, EuropeanSpouseInput } from './european-chart';

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

/** 空心珠半径 1.2mm，直径 2.4mm。版本A圆心在节点交叉点，版本B圆在世代线上方。 */
export const SU_BEAD_RADIUS_MM = 1.2;

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

/** 仿古横版一行的高度。七行仍放得进横向 A4。 */
const SU_ANTIQUE_ROW_MM = 24;

/** 仿古横版版心宽度，右侧留给竖排图题。 */
const SU_ANTIQUE_STAGE_MM = 250;

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
  /** 世代栏与正文之间的细竖线。仿古才有。 */
  railX: number | null;
  /** 保留字段。仿古不再画通栏横线，避免圆落在线下面。 */
  bands: number[];
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
 * horizontal：长房在左，文字在竖线右侧、横线下面。兄弟横线贴着诸子圆圈的下沿。
 * antique：长房在右，文字竖排在竖线左侧。同父诸子各自向下垂线，不画兄弟横线。
 * 圆圈始终在它那条世代线的上方，线从圆的下沿起笔。
 */
export function placeSuChart(roots: readonly SuBeadNode[], script: 'horizontal' | 'antique'): SuChartPlace {
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
      bands: [],
    };
  }

  const colWidth = (width - SU_RAIL_MM) / layout.columns;
  const textW = round(Math.min(SU_TEXT_MAX_MM, Math.max(12, colWidth - SU_STRIP_MM - 2)));
  const textH = antique ? Math.max(10, rowPitch - 5) : SU_TEXT_H_MM;
  const rowLineY = (row: number) => SU_HEAD_MM + row * rowPitch;
  // 版本A：圆心就是父子竖线与兄弟横线的交叉点。版本B：圆仍在世代线上方。
  const beadYOf = (row: number) => (
    antique ? rowLineY(row) - SU_BEAD_RADIUS_MM - 0.35 : rowLineY(row)
  );
  const textYOf = (row: number) => (
    antique ? beadYOf(row) - 0.2 : beadYOf(row) + SU_BEAD_RADIUS_MM + 1.6
  );
  const beadXOf = (col: number) => (
    reading === 'ltr'
      ? SU_RAIL_MM + col * colWidth + 3.2
      : width - SU_RAIL_MM - col * colWidth - 3.2
  );
  const textXOf = (beadX: number) => (
    reading === 'ltr' ? beadX + SU_STRIP_MM : beadX - SU_STRIP_MM - textW
  );

  const people: SuPlacedPerson[] = layout.slots.map((slot) => {
    const beadX = beadXOf(slot.col);
    const beadY = beadYOf(slot.row);
    return {
      index: slot.index,
      personId: slot.personId,
      col: slot.col,
      row: slot.row,
      generation: slot.generation,
      beadX: round(beadX),
      beadY: round(beadY),
      textX: round(textXOf(beadX)),
      textY: round(textYOf(slot.row)),
      textW,
      textH,
    };
  });

  const lines: SuRule[] = [];
  const beadMap = new Map<number, SuBeadMark>();
  const addBead = (slot: SuPlateSlot) => {
    if (beadMap.has(slot.index)) return;
    beadMap.set(slot.index, {
      personId: slot.personId,
      index: slot.index,
      x: round(beadXOf(slot.col)),
      y: round(beadYOf(slot.row)),
    });
  };
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
  for (const slot of layout.slots) addBead(slot);
  const walk = (node: SuBeadNode) => {
    const slot = byIndex.get(node.index);
    if (slot && node.children.length > 0) {
      const kids = node.children
        .map((child) => byIndex.get(child.index))
        .filter((child): child is SuPlateSlot => !!child && child.row > slot.row);
      if (kids.length > 0) {
        const y0 = antique ? rowLineY(slot.row) : beadYOf(slot.row);
        const y1 = antique ? rowLineY(kids[0].row) : beadYOf(kids[0].row);
        const sameCol = kids.filter((kid) => kid.col === slot.col);
        if (antique) {
          for (const kid of sameCol) pushV(node.block.personId, beadXOf(kid.col), y0, y1);
        } else {
          pushV(node.block.personId, beadXOf(slot.col), y0, y1);
          if (kids.length > 1 || kids[0].col !== slot.col) {
            const xs = kids.map((kid) => beadXOf(kid.col));
            pushH(node.block.personId, Math.min(...xs), Math.max(...xs), y1);
          }
        }
      }
    }
    node.children.forEach(walk);
  };
  roots.forEach(walk);

  const seams: SuMarkBox[] = [];
  const upright = antique;
  for (const node of walkNodes(roots)) {
    const slot = byIndex.get(node.index);
    if (!slot) continue;
    const beadX = beadXOf(slot.col);
    const beadY = beadYOf(slot.row);
    const boxW = upright ? 4.2 : 4.6;
    const boxH = upright ? 6.4 : 3.2;
    const x = beadX + SU_BEAD_RADIUS_MM + 0.45;
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
      push('in', beadY - (upright ? 0.6 : 3.4));
    }
    if (node.block.role === 'carried-out' || node.block.role === 'bridge') {
      push('out', beadY + (upright ? 0.8 : 0.2));
    }
    if (node.block.branchOff) {
      const textX = textXOf(beadX);
      const markW = 30;
      seams.push({
        personId: slot.personId,
        index: slot.index,
        kind: 'off',
        x: round(Math.max(0, Math.min(textX, width - markW))),
        y: round(textYOf(slot.row) + textH + 0.4),
        w: markW,
        h: 3.8,
      });
    }
  }

  const generations: SuGenerationBand[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    const label = suGenerationLabel(generationAt(layout, row), script);
    if (!label) continue;
    generations.push({
      row,
      label,
      x: reading === 'ltr' ? 0.4 : round(width - SU_RAIL_MM + 0.9),
      y: round(antique ? rowLineY(row) : textYOf(row)),
      w: reading === 'ltr' ? SU_RAIL_MM - 1.2 : SU_RAIL_MM - 1.8,
      h: reading === 'ltr' ? 6 : round(rowPitch - 1.2),
      boxed: antique,
    });
  }

  return {
    reading,
    columns: layout.columns,
    rows: layout.rows,
    width,
    height: round(SU_HEAD_MM + layout.rows * rowPitch + 1.2),
    people,
    generations,
    lines,
    beads: [...beadMap.values()],
    seams,
    railX: antique ? round(width - SU_RAIL_MM) : null,
    bands: [],
  };
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
