/**
 * 树谱对齐探针。DEV 下把布局 / 节点 / 连线的 X 偏差记到 window.__treeAlignDebug。
 * 测试环境与生产环境不输出。控制台只展开 |Δ| ≥ 8px 的样本。
 */

const MISMATCH_PX = 8;
const MAX_ROWS = 60;

export interface AlignRow {
  phase: 'layout' | 'node' | 'edge';
  id: string;
  label?: string;
  generation?: number;
  parentId?: string;
  nodeX?: number;
  nodeW?: number;
  parentX?: number;
  edgeStartX?: number;
  edgeEndX?: number;
  /** 线起点 − 预期起点（夫妻组用中点，否则用父节点中心） */
  deltaStart?: number;
  /** 线终点 − 子节点中心；节点阶段表示 key shape 局部中心相对原点的偏移 */
  deltaEnd?: number;
  note?: string;
}

interface AlignStore {
  layout: AlignRow[];
  nodes: AlignRow[];
  edges: AlignRow[];
  summary: Record<string, unknown>;
  clear: () => void;
}

function debugOn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const env = import.meta.env;
    if (env?.MODE === 'test' || env?.VITEST) return false;
    if ((window as any).__TREE_ALIGN_DEBUG === false) return false;
    if ((window as any).__TREE_ALIGN_DEBUG === true) return true;
    return Boolean(env?.DEV);
  } catch {
    return false;
  }
}

function store(): AlignStore {
  const w = window as any;
  if (!w.__treeAlignDebug) {
    w.__treeAlignDebug = {
      layout: [],
      nodes: [],
      edges: [],
      summary: {},
      clear() {
        this.layout = [];
        this.nodes = [];
        this.edges = [];
        this.summary = {};
      },
    } satisfies AlignStore;
  }
  return w.__treeAlignDebug as AlignStore;
}

function round(n: number | undefined): number | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  return Math.round(n * 10) / 10;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function mismatchOf(row: AlignRow): number {
  if (row.note === 'spouse') return 0;
  return Math.max(Math.abs(row.deltaStart ?? 0), Math.abs(row.deltaEnd ?? 0));
}

function publish(phase: 'layout' | 'node' | 'edge', rows: AlignRow[], summary: Record<string, unknown>) {
  const bag = store();
  const key = phase === 'node' ? 'nodes' : phase === 'edge' ? 'edges' : 'layout';
  bag[key] = rows;
  bag.summary[phase] = summary;
  const bad = rows.filter((r) => mismatchOf(r) >= MISMATCH_PX);
  const shown = (bad.length ? bad : rows).slice(0, 20);
  const endNote = summary.endOver1 != null ? ` 终点偏差>1px=${summary.endOver1}` : '';
  console.groupCollapsed(
    `[tree-align:${phase}] rows=${rows.length} mismatch≥${MISMATCH_PX}px=${bad.length} max=${summary.maxAbs ?? 0}${endNote}`,
  );
  console.table(
    shown.map((r) => ({
      节点: r.label || r.id,
      代: r.generation,
      父: r.parentId,
      节点X: r.nodeX,
      父X: r.parentX,
      线起X: r.edgeStartX,
      线终X: r.edgeEndX,
      Δ起: r.deltaStart,
      Δ终: r.deltaEnd,
      宽: r.nodeW,
      注: r.note,
    })),
  );
  console.log(`完整数据 window.__treeAlignDebug.${phase}`, summary);
  console.groupEnd();
}

const pending: Record<'node' | 'edge', AlignRow[]> = { node: [], edge: [] };
const seen = new Set<string>();
let flushTimer: number | null = null;

function scheduleFlush(phase: 'node' | 'edge') {
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    for (const key of ['node', 'edge'] as const) {
      const rows = pending[key];
      if (!rows.length) continue;
      pending[key] = [];
      rows.sort((a, b) => mismatchOf(b) - mismatchOf(a));
      const kept = rows.slice(0, MAX_ROWS);
      const maxAbs = rows.reduce((m, r) => Math.max(m, mismatchOf(r)), 0);
      const mismatch = rows.filter((r) => mismatchOf(r) >= MISMATCH_PX).length;
      const endOver1 = rows.filter((r) => r.note !== 'spouse' && Math.abs(r.deltaEnd ?? 0) > 1).length;
      publish(key === 'node' ? 'node' : 'edge', kept, {
        sampled: rows.length,
        kept: kept.length,
        mismatch,
        endOver1,
        maxAbs: round(maxAbs),
      });
    }
    void phase;
  }, 120);
}

function remember(phase: 'node' | 'edge', row: AlignRow) {
  const key = `${phase}:${row.id}:${row.edgeStartX}:${row.edgeEndX}:${row.nodeX}:${row.deltaEnd}`;
  if (seen.has(key)) return;
  seen.add(key);
  pending[phase].push(row);
  scheduleFlush(phase);
}

export function logLayoutAlignment(
  positions: Map<string, { x: number; y: number; width: number; height: number }>,
  edges: Array<{
    id: string;
    source: string;
    target: string;
    kind?: string;
    path?: { points?: { x: number; y: number }[] };
  }>,
  nodeMap: Map<string, { label?: string; generation?: number }>,
  coupleUnitByMain?: Map<string, { spouseIds: string[] }>,
) {
  if (!debugOn()) return;
  seen.clear();
  pending.node = [];
  pending.edge = [];

  const rows: AlignRow[] = [];
  let maxAbs = 0;
  let mismatch = 0;
  for (const edge of edges) {
    if (edge.kind === 'spouse') continue;
    const parent = positions.get(edge.source);
    const child = positions.get(edge.target);
    if (!parent || !child) continue;
    const pts = edge.path?.points;
    const startX = pts?.[0]?.x;
    const endX = pts?.length ? pts[pts.length - 1].x : undefined;
    const couple = coupleUnitByMain?.get(edge.source);
    let expected = parent.x;
    if (couple && couple.spouseIds.length > 0) {
      let right = parent.x;
      for (const sid of couple.spouseIds) {
        const spos = positions.get(sid);
        if (spos && spos.x > right) right = spos.x;
      }
      expected = (parent.x + right) / 2;
    }
    const deltaStart = startX != null ? startX - expected : undefined;
    const deltaEnd = endX != null ? endX - child.x : undefined;
    const abs = Math.max(Math.abs(deltaStart ?? 0), Math.abs(deltaEnd ?? 0));
    if (abs > maxAbs) maxAbs = abs;
    if (abs >= MISMATCH_PX) mismatch += 1;
    const meta = nodeMap.get(edge.target);
    const parentMeta = nodeMap.get(edge.source);
    rows.push({
      phase: 'layout',
      id: edge.target,
      label: meta?.label,
      generation: meta?.generation,
      parentId: parentMeta?.label || edge.source,
      nodeX: round(child.x),
      nodeW: round(child.width),
      parentX: round(parent.x),
      edgeStartX: round(startX),
      edgeEndX: round(endX),
      deltaStart: round(deltaStart),
      deltaEnd: round(deltaEnd),
      note: couple?.spouseIds.length ? `coupleShift=${round(expected - parent.x)}` : undefined,
    });
  }
  rows.sort((a, b) => mismatchOf(b) - mismatchOf(a));
  publish('layout', rows.slice(0, MAX_ROWS), {
    sampled: rows.length,
    kept: Math.min(rows.length, MAX_ROWS),
    mismatch,
    maxAbs: round(maxAbs),
  });
}

/**
 * 布局完成后的 dev 断言：父子边终点 X 必须落在子节点中心。
 * 配偶边不检查（夫妻中点偏移是预期行为）。
 */
export function assertParentChildEdgeEndpoints(
  positions: Map<string, { x: number }>,
  edges: Array<{
    source: string;
    target: string;
    kind?: string;
    fromVirtualSpouse?: boolean;
    path?: { points?: { x: number }[] };
  }>,
) {
  if (!debugOn()) return;
  for (const edge of edges) {
    if (edge.kind === 'spouse' || edge.fromVirtualSpouse) continue;
    const child = positions.get(edge.target);
    const pts = edge.path?.points;
    if (!child || !pts?.length) continue;
    const endX = pts[pts.length - 1].x;
    const delta = endX - child.x;
    if (Math.abs(delta) > 1) {
      console.error(
        `[tree-align] 父子边终点偏离子节点 parentId=${edge.source} childId=${edge.target} 偏差=${delta.toFixed(1)}px`,
      );
    }
  }
}

function readLocalCenterX(node: any): number | undefined {
  try {
    const key = node.getShape?.('key');
    const b = key?.getLocalBounds?.() ?? key?.getBounds?.() ?? key?.getBBox?.();
    if (!b) return undefined;
    if (b.min && b.max) return (Number(b.min[0]) + Number(b.max[0])) / 2;
    if (typeof b.x === 'number' && typeof b.width === 'number') return b.x + b.width / 2;
  } catch {
    /* shape 尚未挂上时忽略 */
  }
  return undefined;
}

/** 节点渲染：对比模型坐标与 key shape 局部中心。 */
export function logNodeRenderProbe(node: any, attributes: any, datum: any, width: number) {
  if (!debugOn()) return;
  const data = datum?.data ?? {};
  const modelX = num(datum?.style?.x);
  const attrX = num(attributes?.x);
  const localCenterX = readLocalCenterX(node);
  const pos = node.getPosition?.();
  const elementX = Array.isArray(pos) ? num(pos[0]) : num(pos?.x);
  logSafe(() =>
    remember('node', {
      phase: 'node',
      id: String(node.id ?? ''),
      label: datum?.label || data.full_name || data.name,
      generation: num(data.generation),
      nodeX: round(modelX),
      nodeW: round(width),
      parentX: round(elementX),
      edgeStartX: round(attrX),
      deltaStart: modelX != null && elementX != null ? round(elementX - modelX) : undefined,
      deltaEnd: round(localCenterX),
      note: attrX != null && modelX != null ? `attr-model=${round(attrX - modelX)}` : undefined,
    }),
  );
}

/**
 * 布局结果写回 G6 数据后的交接检查：style.x 应等于布局中心 X。
 * useG6GraphInit 在 setData 前调用。
 */
export function probeLayoutAlignment(
  layoutResult: { nodes?: Array<{ id: string; x: number; width?: number }> },
  graphData: { nodes?: any[] },
) {
  if (!debugOn()) return;
  const byId = new Map((layoutResult.nodes || []).map((n) => [String(n.id), n]));
  const rows: AlignRow[] = [];
  let maxAbs = 0;
  let mismatch = 0;
  for (const node of graphData.nodes || []) {
    const laid = byId.get(String(node.id));
    if (!laid) continue;
    const styleX = num(node.style?.x);
    const delta = styleX != null ? styleX - laid.x : undefined;
    const abs = Math.abs(delta ?? 0);
    if (abs > maxAbs) maxAbs = abs;
    if (abs >= MISMATCH_PX) mismatch += 1;
    if (abs < MISMATCH_PX && rows.length >= 8) continue;
    rows.push({
      phase: 'layout',
      id: String(node.id),
      label: node.label,
      generation: num(node.data?.generation),
      nodeX: round(laid.x),
      nodeW: round(laid.width),
      edgeStartX: round(styleX),
      deltaEnd: round(delta),
      note: 'styleX-layoutX',
    });
  }
  rows.sort((a, b) => mismatchOf(b) - mismatchOf(a));
  const bag = store();
  bag.summary.handoff = {
    sampled: (graphData.nodes || []).length,
    mismatch,
    maxAbs: round(maxAbs),
  };
  console.groupCollapsed(
    `[tree-align:handoff] nodes=${(graphData.nodes || []).length} styleΔ≥${MISMATCH_PX}px=${mismatch} max=${round(maxAbs)}`,
  );
  console.table(rows.slice(0, 20).map((r) => ({
    节点: r.label || r.id,
    代: r.generation,
    布局X: r.nodeX,
    写入X: r.edgeStartX,
    Δ: r.deltaEnd,
  })));
  console.groupEnd();
}

/** 连线绘制：对比 orthPath 端点与源/目标节点 style.x。 */
export function logEdgeDrawProbe(edgeEl: any, points: { x: number; y: number }[] | undefined) {
  if (!debugOn() || !points || points.length < 2) return;
  logSafe(() => {
    const id = String(edgeEl?.id ?? '');
    let sourceX: number | undefined;
    let targetX: number | undefined;
    let label: string | undefined;
    let generation: number | undefined;
    let parentId: string | undefined;
    let kind: string | undefined;
    let nodeW: number | undefined;
    try {
      const model = edgeEl.context?.model;
      const edge = model?.getElementDataById?.(id);
      kind = edge?.data?.kind;
      const src = model?.getElementDataById?.(String(edge?.source ?? ''));
      const tgt = model?.getElementDataById?.(String(edge?.target ?? ''));
      sourceX = num(src?.style?.x);
      targetX = num(tgt?.style?.x);
      label = tgt?.label;
      generation = num(tgt?.data?.generation);
      parentId = src?.label || edge?.source;
      nodeW = num(tgt?.style?.size?.[0]);
    } catch {
      /* model 未就绪 */
    }
    const startX = points[0].x;
    const endX = points[points.length - 1].x;
    remember('edge', {
      phase: 'edge',
      id,
      label,
      generation,
      parentId,
      nodeX: round(targetX),
      nodeW: round(nodeW),
      parentX: round(sourceX),
      edgeStartX: round(startX),
      edgeEndX: round(endX),
      deltaStart: sourceX != null ? round(startX - sourceX) : undefined,
      deltaEnd: targetX != null ? round(endX - targetX) : undefined,
      note: kind === 'spouse' ? 'spouse' : undefined,
    });
  });
}

function logSafe(fn: () => void) {
  try {
    fn();
  } catch {
    /* 探针不能影响渲染 */
  }
}
