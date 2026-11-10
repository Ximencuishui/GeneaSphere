/**
 * 与 apps/web/src/utils/european-chart.ts 同一份排表。
 * 册谱 PDF 在服务端组 HTML，不能直接引网页包，所以放一份在这里。
 *
 * 欧谱排表：五世一图，末世回接到下一图的首列。
 *
 * 只产表格数据，不画 DOM、不进 G6。父子是行跨，配偶和过继是格子里的字。
 *
 * 行跨自窗口底部向上累加，父亲的行跨是直系子女行跨之和：
 * - 没有子女的人占 1 行。
 * - 子女就在本图的下一世：加上该子女自己的 rowSpan。
 * - 子女已经落到下一图，或在本图里跳过了世代：这一支只加 1。
 *   下一图里再展开的孙子行，不回加到本图。
 * 兄弟按 birthOrder 占连续的行。同一人可以出现在相邻两张表里，id 不变。
 */
export const EUROPEAN_GENERATIONS_PER_CHART = 5;

export type EuropeanCellRole = 'origin' | 'carried-in' | 'carried-out';

/** 满图五列。较短的末图只用到前面的列。 */
export type EuropeanColumn = 0 | 1 | 2 | 3 | 4;

export interface EuropeanSpouseInput {
  name: string;
  marriageOrder?: number;
}

export interface EuropeanPersonInput {
  id: string;
  name: string;
  /** 从 1 起。缺省时从没有父亲的人开始，按父子边逐世加 1。 */
  generation?: number;
  birthOrder?: number;
  spouses?: EuropeanSpouseInput[];
  /** 相对其父的过继、出继。BIOLOGICAL 不写进格子。 */
  childType?: string;
}

export interface EuropeanLinkInput {
  parentId: string;
  childId: string;
  birthOrder?: number;
  childType?: string;
}

export interface BuildEuropeanChartsOptions {
  /**
   * 一图最多几世，默认 5。
   * 小于 2 无法让末世独占一列再回接，会抬到 2。
   * 大于 5 仍按 5 切，列号才落在 0..4。
   */
  generationsPerChart?: number;
}

export interface EuropeanCell {
  personId: string;
  name: string;
  col: EuropeanColumn;
  row: number;
  rowSpan: number;
  role: EuropeanCellRole;
  /** 配偶称谓，按婚姻次序。没有配偶是空串。不占行。 */
  spouseText: string;
  /** 过继、出继等。亲子是空串。不占行。 */
  mark: string;
}

export interface EuropeanChart {
  index: number;
  /** 本图第一世，含。下一图从上一图的最后一世再起。 */
  generationFrom: number;
  /** 本图最后一世，含。满图时等于 from + 4；树的末梢可以更短。 */
  generationTo: number;
  rowCount: number;
  cells: EuropeanCell[];
}

interface PreparedPerson {
  id: string;
  name: string;
  generation: number;
  birthOrder: number;
  spouseText: string;
  mark: string;
}

interface PreparedLink {
  parentId: string;
  childId: string;
  birthOrder?: number;
  childType?: string;
}

const COLUMN_BY_OFFSET: EuropeanColumn[] = [0, 1, 2, 3, 4];

export function buildEuropeanCharts(
  people: readonly EuropeanPersonInput[],
  links: readonly EuropeanLinkInput[],
  options?: BuildEuropeanChartsOptions,
): EuropeanChart[] {
  const pageSize = clampPageSize(options?.generationsPerChart);
  const prepared = prepare(people, links);
  if (prepared.order.length === 0) return [];

  let minGen = Infinity;
  let maxGen = -Infinity;
  for (const id of prepared.order) {
    const generation = prepared.byId.get(id)!.generation;
    if (generation < minGen) minGen = generation;
    if (generation > maxGen) maxGen = generation;
  }

  const charts: EuropeanChart[] = [];
  let start = minGen;
  while (charts.length < prepared.order.length + 1) {
    const end = Math.min(start + pageSize - 1, maxGen);
    const chart = buildChart(prepared, start, end, charts.length);
    if (chart.cells.length > 0) charts.push(chart);
    if (end >= maxGen) break;
    start = end;
  }
  return charts;
}

function clampPageSize(value: number | undefined): number {
  const size = value == null || !Number.isFinite(value) ? EUROPEAN_GENERATIONS_PER_CHART : Math.floor(value);
  if (size < 2) return 2;
  if (size > EUROPEAN_GENERATIONS_PER_CHART) return EUROPEAN_GENERATIONS_PER_CHART;
  return size;
}

function prepare(
  people: readonly EuropeanPersonInput[],
  links: readonly EuropeanLinkInput[],
): {
  byId: Map<string, PreparedPerson>;
  order: string[];
  childrenOf: Map<string, string[]>;
  primaryParent: Map<string, string>;
} {
  const byId = new Map<string, PreparedPerson>();
  const order: string[] = [];
  for (const person of people) {
    const id = String(person.id ?? '').trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      name: String(person.name ?? ''),
      generation: explicitGeneration(person.generation),
      birthOrder: finiteOrder(person.birthOrder),
      spouseText: formatSpouseText(person.spouses),
      mark: formatMark(person.childType),
    });
    order.push(id);
  }

  const rawLinks: PreparedLink[] = [];
  const seenPairs = new Set<string>();
  for (const link of links) {
    const parentId = String(link.parentId ?? '').trim();
    const childId = String(link.childId ?? '').trim();
    if (!parentId || !childId || parentId === childId) continue;
    if (!byId.has(parentId) || !byId.has(childId)) continue;
    const pair = `${parentId}\0${childId}`;
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    rawLinks.push({
      parentId,
      childId,
      birthOrder: link.birthOrder,
      childType: link.childType,
    });
  }

  const parentsOf = new Map<string, string[]>();
  for (const link of rawLinks) {
    const list = parentsOf.get(link.childId);
    if (list) list.push(link.parentId);
    else parentsOf.set(link.childId, [link.parentId]);
  }

  const generationOf = inferGenerations(order, byId, parentsOf);
  for (const id of order) {
    byId.get(id)!.generation = generationOf.get(id)!;
  }

  const primaryParent = new Map<string, string>();
  const primaryLink = new Map<string, PreparedLink>();
  for (const link of rawLinks) {
    const childGen = generationOf.get(link.childId)!;
    const parentGen = generationOf.get(link.parentId)!;
    if (parentGen >= childGen) continue;
    const current = primaryParent.get(link.childId);
    if (current == null || parentGen > generationOf.get(current)!) {
      primaryParent.set(link.childId, link.parentId);
      primaryLink.set(link.childId, link);
    }
  }

  for (const id of order) {
    const person = byId.get(id)!;
    const link = primaryLink.get(id);
    const orderValue = finiteOrder(link?.birthOrder);
    if (orderValue !== Number.POSITIVE_INFINITY) person.birthOrder = orderValue;
    const mark = formatMark(link?.childType);
    if (mark) person.mark = mark;
  }

  const childrenOf = new Map<string, string[]>();
  for (const [childId, parentId] of primaryParent) {
    const list = childrenOf.get(parentId);
    if (list) list.push(childId);
    else childrenOf.set(parentId, [childId]);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => comparePeople(byId, a, b));
  }

  return { byId, order, childrenOf, primaryParent };
}

function explicitGeneration(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return Number.NaN;
  return Math.floor(value);
}

function finiteOrder(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return value;
}

function inferGenerations(
  order: string[],
  byId: Map<string, PreparedPerson>,
  parentsOf: Map<string, string[]>,
): Map<string, number> {
  const resolved = new Map<string, number>();
  for (const id of order) {
    const generation = byId.get(id)!.generation;
    if (!Number.isNaN(generation)) resolved.set(id, generation);
  }

  const visiting = new Set<string>();
  const walk = (id: string): number => {
    const known = resolved.get(id);
    if (known != null) return known;
    if (visiting.has(id)) return 1;
    visiting.add(id);
    const parents = parentsOf.get(id) ?? [];
    let generation = 1;
    if (parents.length > 0) {
      generation = Math.min(...parents.map((parentId) => walk(parentId) + 1));
    }
    visiting.delete(id);
    resolved.set(id, generation);
    return generation;
  };

  for (const id of order) walk(id);
  return resolved;
}

function comparePeople(byId: Map<string, PreparedPerson>, a: string, b: string): number {
  const pa = byId.get(a)!;
  const pb = byId.get(b)!;
  if (pa.generation !== pb.generation) return pa.generation - pb.generation;
  if (pa.birthOrder !== pb.birthOrder) return pa.birthOrder - pb.birthOrder;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
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
  return list
    .map((spouse, index) => `${index === 0 ? '配' : '继配'}${spouse.name}`)
    .join('、');
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

function buildChart(
  prepared: {
    byId: Map<string, PreparedPerson>;
    order: string[];
    childrenOf: Map<string, string[]>;
    primaryParent: Map<string, string>;
  },
  windowFrom: number,
  windowTo: number,
  index: number,
): EuropeanChart {
  const spanMemo = new Map<string, number>();
  const continueMemo = new Map<string, boolean>();
  const cells: EuropeanCell[] = [];
  const placed = new Set<string>();

  const inWindow = (id: string): boolean => {
    const generation = prepared.byId.get(id)!.generation;
    return generation >= windowFrom && generation <= windowTo;
  };

  const spanOf = (id: string, stack: Set<string>): number => {
    const cached = spanMemo.get(id);
    if (cached != null) return cached;
    if (stack.has(id)) return 1;
    const generation = prepared.byId.get(id)!.generation;
    const kids = (prepared.childrenOf.get(id) ?? []).filter((childId) => {
      return prepared.byId.get(childId)!.generation > generation;
    });
    if (kids.length === 0) {
      spanMemo.set(id, 1);
      return 1;
    }
    stack.add(id);
    let span = 0;
    for (const childId of kids) {
      const childGen = prepared.byId.get(childId)!.generation;
      const crossed = childGen > windowTo || childGen > generation + 1;
      span += crossed ? 1 : spanOf(childId, stack);
    }
    stack.delete(id);
    const result = Math.max(1, span);
    spanMemo.set(id, result);
    return result;
  };

  const continuesPast = (id: string): boolean => {
    const cached = continueMemo.get(id);
    if (cached != null) return cached;
    continueMemo.set(id, false);
    const generation = prepared.byId.get(id)!.generation;
    for (const childId of prepared.childrenOf.get(id) ?? []) {
      const childGen = prepared.byId.get(childId)!.generation;
      if (childGen > windowTo || (childGen > generation && continuesPast(childId))) {
        continueMemo.set(id, true);
        return true;
      }
    }
    return false;
  };

  const place = (id: string, row: number, stack: Set<string>): number => {
    if (placed.has(id)) return spanOf(id, stack);
    const person = prepared.byId.get(id)!;
    if (person.generation < windowFrom || person.generation > windowTo) return 0;
    if (stack.has(id)) return 1;
    placed.add(id);
    stack.add(id);
    const span = spanOf(id, new Set());
    const col = COLUMN_BY_OFFSET[person.generation - windowFrom] ?? 0;
    let role: EuropeanCellRole = 'origin';
    if (index > 0 && person.generation === windowFrom) role = 'carried-in';
    else if (person.generation === windowTo && continuesPast(id)) role = 'carried-out';
    cells.push({
      personId: person.id,
      name: person.name,
      col,
      row,
      rowSpan: span,
      role,
      spouseText: person.spouseText,
      mark: person.mark,
    });

    let cursor = row;
    let used = 0;
    const kids = (prepared.childrenOf.get(id) ?? []).filter((childId) => {
      const childGen = prepared.byId.get(childId)!.generation;
      return childGen > person.generation && childGen <= windowTo;
    });
    for (const childId of kids) {
      const childGen = prepared.byId.get(childId)!.generation;
      const consumed = place(childId, cursor, stack);
      const advance = childGen > person.generation + 1
        ? Math.max(1, consumed)
        : Math.max(spanOf(childId, new Set()), consumed);
      cursor += advance;
      used += advance;
    }
    stack.delete(id);
    return Math.max(span, used, 1);
  };

  const roots = localRoots(prepared, inWindow);
  let cursor = 0;
  for (const id of roots) {
    cursor += place(id, cursor, new Set());
  }

  cells.sort((a, b) => a.col - b.col || a.row - b.row || (a.personId < b.personId ? -1 : 1));
  const rowCount = cells.reduce((max, cell) => Math.max(max, cell.row + cell.rowSpan), 0);
  return {
    index,
    generationFrom: windowFrom,
    generationTo: windowTo,
    rowCount,
    cells,
  };
}

function localRoots(
  prepared: {
    byId: Map<string, PreparedPerson>;
    order: string[];
    childrenOf: Map<string, string[]>;
    primaryParent: Map<string, string>;
  },
  inWindow: (id: string) => boolean,
): string[] {
  const roots: string[] = [];
  const rooted = new Set<string>();
  const visited = new Set<string>();

  const consider = (id: string) => {
    if (!inWindow(id) || rooted.has(id)) return;
    const parentId = prepared.primaryParent.get(id);
    const parentInWindow = parentId != null && inWindow(parentId);
    if (!parentInWindow) {
      rooted.add(id);
      roots.push(id);
    }
  };

  const walk = (id: string, stack: Set<string>) => {
    if (visited.has(id) || stack.has(id)) return;
    visited.add(id);
    stack.add(id);
    consider(id);
    for (const childId of prepared.childrenOf.get(id) ?? []) walk(childId, stack);
    stack.delete(id);
  };

  const globals = prepared.order
    .filter((id) => !prepared.primaryParent.has(id))
    .sort((a, b) => comparePeople(prepared.byId, a, b));
  for (const id of globals) walk(id, new Set());
  for (const id of prepared.order) {
    if (!visited.has(id)) walk(id, new Set());
  }
  return roots;
}

/** 一页 A4 在简述行传下大约放得下的行数。超出就另起一图，不把同一图拆成续页。 */
export const EUROPEAN_ROWS_PER_PAGE = 6;

/**
 * 同一图必须落在一页里。行数超过一页时，按支系边界把行切开，
 * 跨过切口的父格在每一张新图里各留一份，高度只盖住这一页上的儿子。
 * 世代窗口不变，所以【接下】【接上】仍然成对。
 */
export function fitEuropeanChartsToPages(
  charts: readonly EuropeanChart[],
  maxRows = EUROPEAN_ROWS_PER_PAGE,
): EuropeanChart[] {
  const limit = Math.max(1, Math.floor(maxRows) || EUROPEAN_ROWS_PER_PAGE);
  const pieces: EuropeanChart[] = [];
  for (const chart of charts) {
    for (const piece of splitChartToRows(chart, limit)) pieces.push(piece);
  }
  return pieces.map((chart, index) => ({ ...chart, index }));
}

function splitChartToRows(chart: EuropeanChart, maxRows: number): EuropeanChart[] {
  if (chart.rowCount <= maxRows) return [{ ...chart, cells: chart.cells.map((cell) => ({ ...cell })) }];
  const ranges = rowRanges(chart, maxRows);
  if (ranges.length <= 1) return [{ ...chart, cells: chart.cells.map((cell) => ({ ...cell })) }];
  return ranges.map(([start, end]) => sliceChartRows(chart, start, end));
}

function rowRanges(chart: EuropeanChart, maxRows: number): Array<[number, number]> {
  const anchors = new Set<number>([0, chart.rowCount]);
  for (let col = 1; col <= 4; col += 1) {
    const column = chart.cells.filter((cell) => cell.col === col);
    if (column.length > 1 && column.every((cell) => cell.rowSpan <= maxRows)) {
      for (const cell of column) anchors.add(cell.row);
      break;
    }
  }
  if (anchors.size <= 2) {
    for (let row = maxRows; row < chart.rowCount; row += maxRows) anchors.add(row);
  }
  const points = [...anchors].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  let start = 0;
  while (start < chart.rowCount) {
    let end = start;
    for (const point of points) {
      if (point <= start) continue;
      if (point - start <= maxRows) end = point;
      else break;
    }
    if (end === start) end = Math.min(chart.rowCount, start + maxRows);
    ranges.push([start, end]);
    start = end;
  }
  return ranges;
}

function sliceChartRows(chart: EuropeanChart, start: number, end: number): EuropeanChart {
  const cells: EuropeanCell[] = [];
  for (const cell of chart.cells) {
    const cellEnd = cell.row + cell.rowSpan;
    const from = Math.max(cell.row, start);
    const to = Math.min(cellEnd, end);
    if (to <= from) continue;
    cells.push({
      ...cell,
      row: from - start,
      rowSpan: to - from,
    });
  }
  return {
    ...chart,
    rowCount: end - start,
    cells,
  };
}
