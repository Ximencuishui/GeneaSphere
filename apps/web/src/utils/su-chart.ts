/**
 * 苏式垂珠谱。
 * 一祖为一支。垂珠主线竖直，父子上下相承；同父兄弟横向分板，先排完长房整支再排次房。
 * 一支能放进一页就整支挪到下一页；只有一支比一页还长，才在该人处接下、下页接上。
 * 版面坐标由 placeSuChart 算出：版本A长房在左，版本B长房在右。人物文字始终横排。
 */
import type { EuropeanLinkInput, EuropeanPersonInput, EuropeanSpouseInput } from '@/utils/european-chart';

/** 一页 A4 在姓名、生卒、配葬这几行下大约放得下的人数。 */
export const SU_BLOCKS_PER_PAGE = 7;

/**
 * 换页后弟弟沿用长兄的世代深度，但最多从这一级起算。
 * 这只决定横行落在第几世，不做成向右缩进。
 */
export const SU_INDENT_LEVEL_INHERIT = 6;

/** 垂珠板一横行的高度。一代一行。文字留在行的上半，横线走在行缝。 */
export const SU_ROW_MM = 34;

/** 人物文字距本行上沿、以及文字块高度。横线画在文字下面。 */
export const SU_TEXT_TOP_MM = 1;
export const SU_TEXT_H_MM = 22;

/** 世代标注占的边栏。版本A在左，版本B在右。 */
export const SU_RAIL_MM = 14;

/** 垂珠板内容宽，含世代边栏，放进 A4 版心。 */
export const SU_STAGE_MM = 164;

/** 圆圈中心距本行上沿，挨着姓名。 */
export const SU_BEAD_TOP_MM = 6;

/** 竖线和文字之间的空档，接上、接下写在这里。 */
export const SU_STRIP_MM = 6.8;

/** 人物信息块最宽。窄板再收。 */
export const SU_TEXT_MAX_MM = 46;

/** 同父子息达到这个人数，继续画全套垂珠会挤在一起，只略去这一组。 */
export const SU_BEAD_CROWD_CHILDREN = 6;

/**
 * 同父诸子从长房到幼房、连同夹在中间的后裔，所占块数达到这个跨度。
 * 兄弟之间的连线会拉得很长，只略去这一组。
 */
export const SU_BEAD_CROWD_SPAN = 8;

/** 同父兄弟的后裔纵深相差达到这么多代，垂珠会一边很长一边很短，只略去这一组。 */
export const SU_BEAD_CROWD_DEPTH = 4;

export type SuRole = 'origin' | 'carried-in' | 'carried-out' | 'bridge';

export interface SuBlock {
  personId: string;
  name: string;
  /** 相对本图所从出之祖的世代深度。头人是 0，其子是 1。同一深度画在同一横行。 */
  depth: number;
  role: SuRole;
  spouseText: string;
  mark: string;
  /** 父亲 id。父亲不在本页时，嵌套对不上，这个人就是本页支头，不往页外连线。 */
  parentId: string | null;
  /** 家族世代，从 1 起。材料里没有时为空，画世代栏时再按深度推。 */
  generation: number | null;
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
  /** 这一组人太多或拉得太长，打开垂珠时也不画，改在父卡片上标「支繁，略垂珠线」。 */
  omitBeads: boolean;
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

interface FlatNode {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
  span: number;
  spouseText: string;
  mark: string;
  generation: number | null;
}

export function suBranchName(name: string): string {
  const text = String(name || '').trim() || '本支';
  const head = text.endsWith('公') ? text : `${text}公`;
  return `${head}支世系`;
}

export function buildSuCharts(
  people: readonly EuropeanPersonInput[],
  links: readonly EuropeanLinkInput[],
  options?: { blocksPerPage?: number },
): SuChart[] {
  const cap = clampCapacity(options?.blocksPerPage);
  const flat = flatten(people, links);
  if (flat.length === 0) return [];
  const byId = new Map(flat.map((node) => [node.id, node]));
  const charts: SuChart[] = [];
  let cursor = 0;
  let carry: FlatNode | null = null;
  // 同一父亲的儿子共用第一次排到父亲身边时的那一级，换页后的弟弟不再被压回最左边。
  const siblingDepth = new Map<string, number>();

  while (cursor < flat.length && charts.length <= flat.length) {
    const started = cursor;
    const blocks: SuBlock[] = [];
    const placed = new Map<string, number>();
    const push = (node: FlatNode, role: SuRole) => {
      const parentDepth = node.parentId != null ? placed.get(node.parentId) : undefined;
      let depth = 0;
      if (role !== 'carried-in' && parentDepth != null) depth = parentDepth + 1;
      else if (role !== 'carried-in' && node.parentId != null && siblingDepth.has(node.parentId)) {
        depth = Math.min(siblingDepth.get(node.parentId)!, SU_INDENT_LEVEL_INHERIT);
      }
      blocks.push(blockFrom(node, depth, role));
      placed.set(node.id, depth);
      if (node.parentId != null && parentDepth != null && !siblingDepth.has(node.parentId)) {
        siblingDepth.set(node.parentId, depth);
      }
    };
    if (carry) push(carry, 'carried-in');
    while (cursor < flat.length && blocks.length < cap) {
      const node = flat[cursor];
      const room = cap - blocks.length;
      if (blocks.length > 0 && node.span > room && node.span <= cap) break;
      push(node, 'origin');
      cursor += 1;
    }
    if (cursor === started && !carry) {
      push(flat[cursor], 'origin');
      cursor += 1;
    }
    const next = cursor < flat.length ? flat[cursor] : undefined;
    const continued = next && next.span > cap ? ancestorOnChart(next, blocks, byId, cap) : null;
    if (continued) {
      const seam = blocks.find((block) => block.personId === continued.id);
      if (seam) seam.role = seam.role === 'carried-in' ? 'bridge' : 'carried-out';
    }
    const head = blocks[0];
    charts.push({
      index: charts.length,
      branchPersonId: head?.personId || '',
      branchName: suBranchName(head?.name || ''),
      blocks,
    });
    carry = continued;
    if (cursor === started && !continued) break;
  }
  return charts;
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
    const need = Math.max(1, chart.blocks.length);
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

function clampCapacity(value: number | undefined): number {
  const size = value == null || !Number.isFinite(value) ? SU_BLOCKS_PER_PAGE : Math.floor(value);
  if (size < 2) return 2;
  return size;
}

function blockFrom(node: FlatNode, depth: number, role: SuRole): SuBlock {
  return {
    personId: node.id,
    name: node.name,
    depth,
    role,
    spouseText: node.spouseText,
    mark: node.mark,
    parentId: node.parentId,
    generation: node.generation,
  };
}

/**
 * 按本页块嵌成父子树，并标出哪一组该略去垂珠。
 * 长幼和缩进都不改。父亲不在本页的人成为本页支头，避免把线画到上一页。
 */
export function nestSuBlocks(blocks: readonly SuBlock[]): SuBeadNode[] {
  const nodes: SuBeadNode[] = blocks.map((block, index) => ({
    block,
    index,
    children: [],
    omitBeads: false,
  }));
  const roots: SuBeadNode[] = [];
  const seen = new Map<string, SuBeadNode>();
  for (const node of nodes) {
    const parent = node.block.parentId ? seen.get(node.block.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
    seen.set(node.block.personId, node);
  }
  for (const node of nodes) node.omitBeads = beadCrowd(node);
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
  omitBeads: boolean;
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
  kind: 'in' | 'out';
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
  /** 仿古板的横栏线，单位毫米，相对板顶。 */
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
 * horizontal：长房在左，文字在竖线右侧。
 * antique：长房在右，文字在竖线左侧。线只走横竖，圆圈落在竖线上。
 */
export function placeSuChart(roots: readonly SuBeadNode[], script: 'horizontal' | 'antique'): SuChartPlace {
  const reading = script === 'antique' ? 'rtl' : 'ltr';
  const layout = layoutSuPlates(roots);
  const width = SU_STAGE_MM;
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
      bands: [],
    };
  }

  const colWidth = (width - SU_RAIL_MM) / layout.columns;
  const textW = round(Math.min(SU_TEXT_MAX_MM, Math.max(10, colWidth - 3.2 - SU_STRIP_MM - 1.2)));
  const beadXOf = (col: number) => (
    reading === 'ltr'
      ? SU_RAIL_MM + col * colWidth + 3.2
      : width - SU_RAIL_MM - col * colWidth - 3.2
  );
  const beadYOf = (row: number) => row * SU_ROW_MM + SU_BEAD_TOP_MM;
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
      textY: round(slot.row * SU_ROW_MM + SU_TEXT_TOP_MM),
      textW,
      textH: SU_TEXT_H_MM,
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
  const walk = (node: SuBeadNode) => {
    const slot = byIndex.get(node.index);
    if (slot && !node.omitBeads && node.children.length > 0) {
      const kids = node.children
        .map((child) => byIndex.get(child.index))
        .filter((child): child is SuPlateSlot => !!child && child.row > slot.row);
      if (kids.length === 1 && kids[0].col === slot.col) {
        addBead(slot);
        addBead(kids[0]);
        lines.push({
          parentId: node.block.personId,
          axis: 'v',
          x: round(beadXOf(slot.col)),
          y: round(beadYOf(slot.row)),
          length: round(beadYOf(kids[0].row) - beadYOf(slot.row)),
        });
      } else if (kids.length > 0) {
        const parentY = beadYOf(slot.row);
        const childY = beadYOf(kids[0].row);
        const parentTextBottom = slot.row * SU_ROW_MM + SU_TEXT_TOP_MM + SU_TEXT_H_MM + 1.2;
        const aboveChild = kids[0].row * SU_ROW_MM - 2.2;
        const barY = Math.min(childY - 3, Math.max(parentTextBottom, aboveChild));
        const xs = kids.map((kid) => beadXOf(kid.col));
        addBead(slot);
        lines.push({
          parentId: node.block.personId,
          axis: 'v',
          x: round(beadXOf(slot.col)),
          y: round(parentY),
          length: round(barY - parentY),
        });
        lines.push({
          parentId: node.block.personId,
          axis: 'h',
          x: round(Math.min(...xs)),
          y: round(barY),
          length: round(Math.max(...xs) - Math.min(...xs)),
        });
        for (const kid of kids) {
          addBead(kid);
          lines.push({
            parentId: node.block.personId,
            axis: 'v',
            x: round(beadXOf(kid.col)),
            y: round(barY),
            length: round(beadYOf(kid.row) - barY),
          });
        }
      }
    }
    node.children.forEach(walk);
  };
  roots.forEach(walk);

  const seams: SuMarkBox[] = [];
  const upright = reading === 'rtl';
  for (const node of walkNodes(roots)) {
    const slot = byIndex.get(node.index);
    if (!slot) continue;
    const beadX = beadXOf(slot.col);
    const boxW = upright ? 4.2 : SU_STRIP_MM - 1;
    const boxH = upright ? 7.2 : 4;
    const x = reading === 'ltr' ? beadX + 0.5 : beadX - SU_STRIP_MM + 0.6;
    const push = (kind: 'in' | 'out', y: number) => {
      seams.push({
        personId: slot.personId,
        index: slot.index,
        kind,
        x: round(x),
        y: round(y),
        w: boxW,
        h: boxH,
      });
    };
    if (node.block.role === 'carried-in' || node.block.role === 'bridge') {
      push('in', slot.row * SU_ROW_MM + 0.4);
    }
    if (node.block.role === 'carried-out' || node.block.role === 'bridge') {
      push('out', beadYOf(slot.row) + (upright ? 2.4 : 3));
    }
  }

  const generations: SuGenerationBand[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    const label = suGenerationLabel(generationAt(layout, row), script);
    if (!label) continue;
    generations.push({
      row,
      label,
      x: reading === 'ltr' ? 0.4 : round(width - SU_RAIL_MM + 0.8),
      y: round(row * SU_ROW_MM + (reading === 'ltr' ? 1.4 : 0.8)),
      w: reading === 'ltr' ? SU_RAIL_MM - 1.2 : SU_RAIL_MM - 1.8,
      h: reading === 'ltr' ? 6 : round(SU_ROW_MM - 1.6),
      boxed: reading === 'rtl',
    });
  }

  const bands = reading === 'rtl'
    ? Array.from({ length: Math.max(0, layout.rows - 1) }, (_, index) => round((index + 1) * SU_ROW_MM))
    : [];

  return {
    reading,
    columns: layout.columns,
    rows: layout.rows,
    width,
    height: round(layout.rows * SU_ROW_MM),
    people,
    generations,
    lines,
    beads: [...beadMap.values()],
    seams,
    bands,
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
    omitBeads: node.omitBeads,
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

function beadCrowd(node: SuBeadNode): boolean {
  const kids = node.children;
  if (kids.length >= SU_BEAD_CROWD_CHILDREN) return true;
  if (kids.length < 2) return false;
  const first = kids[0].index;
  const end = subtreeLastIndex(kids[kids.length - 1]);
  if (end - first + 1 >= SU_BEAD_CROWD_SPAN) return true;
  const depths = kids.map(subtreeDepth);
  return Math.max(...depths) - Math.min(...depths) >= SU_BEAD_CROWD_DEPTH;
}

function subtreeDepth(node: SuBeadNode): number {
  let depth = 0;
  for (const child of node.children) depth = Math.max(depth, 1 + subtreeDepth(child));
  return depth;
}

function subtreeLastIndex(node: SuBeadNode): number {
  let last = node.index;
  for (const child of node.children) last = Math.max(last, subtreeLastIndex(child));
  return last;
}

function ancestorOnChart(
  next: FlatNode,
  blocks: readonly SuBlock[],
  byId: Map<string, FlatNode>,
  cap: number,
): FlatNode | null {
  const placed = new Set(blocks.map((block) => block.personId));
  let parentId = next.parentId;
  while (parentId) {
    if (placed.has(parentId)) {
      const node = byId.get(parentId);
      return node && node.span > cap ? node : null;
    }
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return null;
}

function flatten(
  people: readonly EuropeanPersonInput[],
  links: readonly EuropeanLinkInput[],
): FlatNode[] {
  const forest = buildForest(people, links);
  const flat: FlatNode[] = [];
  const walk = (id: string, depth: number, parentId: string | null, stack: Set<string>) => {
    if (stack.has(id)) return;
    const node = forest.byId.get(id);
    if (!node) return;
    stack.add(id);
    const start = flat.length;
    flat.push({
      id: node.id,
      name: node.name,
      depth,
      parentId,
      span: 1,
      spouseText: node.spouseText,
      mark: node.mark,
      generation: Number.isFinite(node.generation) ? node.generation : null,
    });
    for (const childId of node.childIds) walk(childId, depth + 1, id, stack);
    flat[start].span = flat.length - start;
    stack.delete(id);
  };
  for (const root of forest.roots) walk(root.id, 0, null, new Set());
  return flat;
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
