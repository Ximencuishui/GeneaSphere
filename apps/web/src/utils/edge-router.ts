/**
 * edge-router.ts - 父子边正交路径模块
 *
 * [W1.3 2026-09-01] LayoutEngine v6 重构第三阶段：从 layout-engine.ts 抽取
 *   父子边相关的路径计算与水平段错开逻辑为模块级纯函数，让 LayoutEngine 类
 *   变成编排器。
 *
 * 本模块负责：
 * - computeOrthogonalEdgePaths：父子边正交路径（T 形 / L 形）
 *   - 单子 → 2 点直线 / 3 点 L 形
 *   - 多子 → 4 点 T 形（共享 drop line + junctionGroup）
 *   - 父-多妻妾组共享 drop line（虚拟起点 = 父 + 最右妻妾 中点）
 * - resolveEdgeHorizontalOverlaps：同层水平边段按 edgeHorizontalSeparation 错开
 *   - 共享总线（同一 junctionGroup）豁免，整组一起平移
 * - 竖线若穿过别的卡片，或和别组竖线重合，会在 X 上让开
 * - markOrthogonalBridges：仍然交叉的位置记在 path.bridges，渲染时拱桥
 * - shiftEdgePathsX：节点整体平移后同步平移所有边路径（响应居中）
 *
 * 不在本模块范围：
 * - 节点位置计算（→ tree-layout.ts）
 * - 配偶边正交路径（→ spouse-renderer.ts）
 *
 * v6 设计要点（见 docs/族谱树布局引擎 v6）：
 * - 所有函数为纯函数，无 this 引用，无隐藏状态
 * - coupleUnitByMain 作为参数显式传入（§5.3 CoupleUnit 共享模式）
 * - config 作为参数显式传入，避免读取引擎实例字段
 */

import type {
  LayoutEdge,
  NodePosition,
  LayoutConfig,
  CoupleUnit,
  Point,
} from '@/types/layout';

// ==================== 模块常量 ====================

/**
 * 锚点停在卡片外缘，不向内缩。
 * 向内缩会让线段穿进圆角卡片。调用方传入的 edgeInset 只用来在父子之间留出总线空隙。
 */
const EDGE_INSET = 0;

// ==================== 父子边正交路径 ====================

/**
 * 计算父子边正交路径（T 形 / L 形）
 *
 * 核心规则：
 * 1. 单 child：起点 → 垂线 → 水平 → 子女顶中点（3 点）或退化为 2 点直线
 * 2. 多 child：起点 → 垂线到 busY → 水平到各 child 顶 X → 各 child 顶中点（4 点 T 形）
 *
 * 工作坐标是 TB：父节点底部出，向下折，接入子节点顶部。
 * LR 由流水线转置坐标：屏幕上变成父节点右侧出，向右折，接入子节点左侧。
 * resolveEdgeHorizontalOverlaps 错开的是工作坐标里的水平段，转置后就是垂直段错开。
 *
 * 起点 X 的解析规则（v6.0.8 走线解耦母亲归属）：
 *   a) 父在 CoupleUnit 内（有 ≥1 妻妾）→ coupleUnitMidX = (父.x + 最右配偶.x) / 2
 *   b) 否则 → 父节点中心 X
 *
 * [v6.0.8 2026-09-02] 走线几何与母亲归属完全解耦：
 *   - 所有兄弟（无论 motherId 指向妻 / 妾 / 外部 / 未设）统一从 coupleUnitMidX 出发
 *   - 母亲归属仅通过 `isConcubineChild + palette` 样式区分（G6 渲染层处理）
 *   - 替代 v6.0.7 的「motherId 优先 per-edge 分流」语义
 *   - 详见 docs/族谱树布局引擎 v6 §3.5 / §8.1 / §8.1 P4.1-P4.3
 *
 * [v6.0.7 历史] 旧行为保留说明：
 *   旧版 resolveStartX 在「存在 motherId」时 per-edge 走母亲中心 X，导致：
 *   - 同父多子的走线起点 X 不同（违反"共享 drop line"视觉）
 *   - 子树避让扫描线推开逻辑复杂化（每组独立 T 形）
 *   - 多母亲调色板着色需要叠加到边路径，难以实现
 *   v6.0.8 起移除 motherId 分流逻辑，所有兄弟走同一组 T 形总线。
 *
 * [P3 2026-08-28] birthOrder 排序：
 *   layout-engine 在传给 dagre/elkjs 前已按 birthOrder 升序排序兄弟。
 *   本函数无需关心兄弟 X 顺序。
 *
 * [2026-08-31 修复] 端点内缩：
 *   「父边起点」「子边终点」从几何边缘向内缩 edgeInset = 4px，
 *   确保末端点落在卡片可见区域内部。
 */
function dedupePoints(points: { x: number; y: number }[]) {
  const out: { x: number; y: number }[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - point.x) < 0.5 && Math.abs(prev.y - point.y) < 0.5) continue;
    out.push(point);
  }
  return out;
}

export interface OrthogonalPathOptions {
  /**
   * modern：同代分车道、躲开卡片、稍后可以拱桥。
   * traditional：每户一条居中横担，交叉留着，不避让。
   */
  mode?: 'modern' | 'traditional';
}

export function computeOrthogonalEdgePaths(
  nodePositions: Map<string, NodePosition>,
  edges: LayoutEdge[],
  coupleUnitByMain: Map<string, CoupleUnit>,
  /**
   * 父子之间留给分发总线的最小空隙。端点本身停在卡片外缘，不再向卡片内部缩。
   */
  edgeInset: number = EDGE_INSET,
  options: OrthogonalPathOptions = {},
) {
  // 妻子名下的子女改挂到丈夫。数据里 parent-child 的 source 可以仍是妻子，
  // 画出来的线必须从父亲底部（工作坐标）出发。
  const spouseToMain = new Map<string, string>();
  for (const [mainId, unit] of coupleUnitByMain) {
    for (const spouseId of unit.spouseIds) spouseToMain.set(spouseId, mainId);
  }
  for (const edge of edges) {
    if (edge.kind !== 'spouse' || edge.fromVirtualSpouse) continue;
    if (!spouseToMain.has(edge.target)) spouseToMain.set(edge.target, edge.source);
  }

  const childrenByFather = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    if (edge.kind === 'spouse' || edge.fromVirtualSpouse) continue;
    const fatherId = spouseToMain.get(edge.source) ?? edge.source;
    if (!childrenByFather.has(fatherId)) childrenByFather.set(fatherId, []);
    childrenByFather.get(fatherId)!.push(edge);
  }

  const traditional = options.mode === 'traditional';
  const gap = Math.max(8, edgeInset);
  /** 车道间距低于这个值就不再错开，避免总线被挤出父子之间的空隙。 */
  const MIN_LANE_GAP = 2;

  interface ChildAnchor {
    edge: LayoutEdge;
    x: number;
    y: number;
  }
  interface BusPlan {
    fatherId: string;
    startX: number;
    startY: number;
    minX: number;
    maxX: number;
    limitY: number;
    anchors: ChildAnchor[];
    lane: number;
    busY: number;
    collapsed: boolean;
  }

  const plans: BusPlan[] = [];
  for (const [fatherId, childEdges] of childrenByFather) {
    const father = nodePositions.get(fatherId);
    if (!father || childEdges.length === 0) continue;
    const anchors = childEdges
      .map((edge) => {
        const pos = nodePositions.get(edge.target);
        return pos && pos.height > 0
          ? { edge, x: pos.x, y: pos.y - pos.height / 2 }
          : null;
      })
      .filter((item): item is ChildAnchor => !!item);
    if (anchors.length === 0) continue;
    const xs = [father.x, ...anchors.map((anchor) => anchor.x)];
    plans.push({
      fatherId,
      startX: father.x,
      startY: father.y + father.height / 2,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      limitY: Math.min(...anchors.map((anchor) => anchor.y)),
      anchors,
      lane: 0,
      busY: 0,
      collapsed: false,
    });
  }

  // 古谱：父节点底边中点垂直下行，到子女组正中画一条横担，再垂直落入每个子女顶边中点。
  // 不分车道、不躲卡片，交叉保持垂丝图原来的样子。
  if (traditional) {
    for (const plan of plans) {
      const mid = (plan.startY + plan.limitY) / 2;
      const top = plan.startY + 4;
      const bottom = plan.limitY - 4;
      plan.lane = 0;
      plan.collapsed = true;
      plan.busY = bottom > top ? Math.min(bottom, Math.max(top, mid)) : mid;
    }
  }

  // 同一代的父亲底部几乎在同一条 Y 上。若每家总线都取间隙的 45%，
  // 水平总线会叠成一条，别家的垂直下落正好从这条线上穿过去。
  // 水平跨度有重叠的家庭分到不同车道，车道在父子间隙里均匀错开。
  const boxes = collectBoxes(nodePositions);
  if (!traditional) {
  plans.sort((a, b) => a.startY - b.startY || a.minX - b.minX);
  const bands: BusPlan[][] = [];
  for (const plan of plans) {
    const band = bands.find((group) => Math.abs(group[0].startY - plan.startY) < 30);
    if (band) band.push(plan);
    else bands.push([plan]);
  }
  for (const [depth, band] of bands.entries()) {
    band.sort((a, b) => a.minX - b.minX);
    const laneEnds: number[] = [];
    for (const plan of band) {
      let lane = 0;
      while (lane < laneEnds.length && plan.minX < laneEnds[lane] + gap) lane += 1;
      if (lane === laneEnds.length) laneEnds.push(plan.maxX);
      else laneEnds[lane] = Math.max(laneEnds[lane], plan.maxX);
      plan.lane = lane;
    }
    const lanesNeeded = laneEnds.length;
    const maxLane = Math.max(0, lanesNeeded - 1);
    const room = Math.min(
      ...band.map((plan) => {
        const top = plan.startY + gap;
        const bottom = Math.max(top, plan.limitY - gap);
        return bottom - top;
      }),
    );
    const step = maxLane === 0 ? 0 : room / maxLane;
    const collapsed = maxLane > 0 && step < MIN_LANE_GAP;
    if (collapsed) {
      for (const plan of band) {
        const top = plan.startY + gap;
        const bottom = Math.max(top, plan.limitY - gap);
        plan.lane = 0;
        plan.collapsed = true;
        plan.busY = top + (bottom - top) / 2;
      }
    } else {
      const laneStep = maxLane === 0 ? 0 : Math.min(16, step);
      for (const plan of band) {
        const top = plan.startY + gap;
        const bottom = Math.max(top, plan.limitY - gap);
        plan.busY = Math.min(bottom, Math.max(top, top + plan.lane * laneStep));
      }
    }

    if (import.meta.env?.DEV && import.meta.env?.MODE !== 'test') {
      const laneCount = collapsed ? 1 : lanesNeeded;
      const busYs: number[] = [];
      for (let lane = 0; lane < laneCount; lane++) {
        const sample = band.find((plan) => plan.lane === lane);
        if (sample) busYs.push(Math.round(sample.busY * 10) / 10);
      }
      console.log('[edge-router] 总线车道', {
        depth,
        familyCount: band.length,
        laneCount,
        busYs,
      });
    }
  }

  // 总线若横穿别的卡片，在父子空隙里换一条 Y。换不开就保持原车道。
  for (const plan of plans) {
    const ignore = new Set<string>([plan.fatherId, ...plan.anchors.map((anchor) => anchor.edge.target)]);
    if (!segmentHitsBox(plan.minX, plan.busY, plan.maxX, plan.busY, boxes, ignore)) continue;
    const top = plan.startY + gap;
    const bottom = Math.max(top, plan.limitY - gap);
    for (const delta of [8, -8, 16, -16, 24, -24]) {
      const y = plan.busY + delta;
      if (y < top - 0.5 || y > bottom + 0.5) continue;
      const crowded = plans.some((other) => other !== plan
        && Math.abs(other.startY - plan.startY) < 30
        && Math.abs(other.busY - y) < MIN_LANE_GAP
        && rangesOverlap(plan.minX, plan.maxX, other.minX, other.maxX, 0));
      if (crowded) continue;
      if (segmentHitsBox(plan.minX, y, plan.maxX, y, boxes, ignore)) continue;
      plan.busY = y;
      break;
    }
  }
  }

  for (const plan of plans) {
    const junctionGroup = `parent-${plan.fatherId}-shared`;
    const spread = plan.anchors.some((anchor) => Math.abs(anchor.x - plan.startX) > 0.5);
    for (const child of plan.anchors) {
      const points = [{ x: plan.startX, y: plan.startY }];
      if (spread) {
        points.push({ x: plan.startX, y: plan.busY });
        points.push({ x: child.x, y: plan.busY });
      }
      points.push({ x: child.x, y: child.y });
      child.edge.path = {
        points: dedupePoints(points),
        type: 'orthogonal',
        junctionGroup,
        laneCollapsed: plan.collapsed || undefined,
        classic: traditional || undefined,
      };
    }
  }

  if (!traditional) dodgeBlockedVerticals(edges, boxes);
}

// ==================== 交叉避让与桥接 ====================

interface Box {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface AxisSeg {
  edge: LayoutEdge;
  group: string;
  index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const DODGE_STEPS = [10, -10, 18, -18, 28, -28, 40, -40];
const DODGE_STUB = 8;

function collectBoxes(nodePositions: Map<string, NodePosition>): Box[] {
  const boxes: Box[] = [];
  for (const [id, pos] of nodePositions) {
    if (!(pos.width > 0) || !(pos.height > 0)) continue;
    boxes.push({
      id,
      x1: pos.x - pos.width / 2,
      y1: pos.y - pos.height / 2,
      x2: pos.x + pos.width / 2,
      y2: pos.y + pos.height / 2,
    });
  }
  return boxes;
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number, pad: number) {
  const lo = Math.max(Math.min(a1, a2), Math.min(b1, b2));
  const hi = Math.min(Math.max(a1, a2), Math.max(b1, b2));
  return hi - lo > pad;
}

function segmentHitsBox(
  x1: number, y1: number, x2: number, y2: number,
  boxes: Box[],
  ignore: Set<string>,
) {
  const vertical = Math.abs(x1 - x2) < 0.5;
  const horizontal = Math.abs(y1 - y2) < 0.5;
  if (!vertical && !horizontal) return false;
  for (const box of boxes) {
    if (ignore.has(box.id)) continue;
    if (vertical) {
      const x = x1;
      if (x <= box.x1 + 0.5 || x >= box.x2 - 0.5) continue;
      if (rangesOverlap(y1, y2, box.y1, box.y2, 1)) return true;
    } else {
      const y = y1;
      if (y <= box.y1 + 0.5 || y >= box.y2 - 0.5) continue;
      if (rangesOverlap(x1, x2, box.x1, box.x2, 1)) return true;
    }
  }
  return false;
}

function listAxisSegments(edges: LayoutEdge[]): AxisSeg[] {
  const segs: AxisSeg[] = [];
  for (const edge of edges) {
    const pts = edge.path?.points;
    if (!pts || pts.length < 2 || edge.kind === 'spouse') continue;
    const group = edge.path?.junctionGroup ?? edge.id;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const vertical = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 0.5;
      const horizontal = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5;
      if (!vertical && !horizontal) continue;
      segs.push({ edge, group, index: i, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return segs;
}

function strictCross(a: AxisSeg, b: AxisSeg): boolean {
  const aH = Math.abs(a.y1 - a.y2) < 0.5;
  const bH = Math.abs(b.y1 - b.y2) < 0.5;
  if (aH === bH) return false;
  const h = aH ? a : b;
  const v = aH ? b : a;
  const x = v.x1;
  const y = h.y1;
  const xMin = Math.min(h.x1, h.x2);
  const xMax = Math.max(h.x1, h.x2);
  const yMin = Math.min(v.y1, v.y2);
  const yMax = Math.max(v.y1, v.y2);
  return x > xMin + 0.5 && x < xMax - 0.5 && y > yMin + 0.5 && y < yMax - 0.5;
}

function sameSegment(a: AxisSeg, b: AxisSeg) {
  return a.edge === b.edge && a.index === b.index;
}

/** 竖线穿过卡片、和别组竖线重合，或横穿别家总线时，把中段挪到旁边的 X。 */
function dodgeBlockedVerticals(edges: LayoutEdge[], boxes: Box[]) {
  for (const edge of edges) {
    const pts = edge.path?.points;
    if (!pts || edge.kind === 'spouse') continue;
    const group = edge.path?.junctionGroup ?? edge.id;
    for (let i = pts.length - 2; i >= 0; i--) {
      const a = pts[i];
      const b = pts[i + 1];
      if (Math.abs(a.x - b.x) > 0.5) continue;
      const span = Math.abs(b.y - a.y);
      if (span < DODGE_STUB * 2 + 8) continue;
      const dx = pickDodgeX(edges, boxes, edge, group, i, a.x, a.y, b.y);
      if (dx === 0) continue;
      const dir = Math.sign(b.y - a.y) || 1;
      const yA = a.y + dir * DODGE_STUB;
      const yB = b.y - dir * DODGE_STUB;
      pts.splice(i + 1, 0,
        { x: a.x, y: yA },
        { x: a.x + dx, y: yA },
        { x: a.x + dx, y: yB },
        { x: a.x, y: yB },
      );
    }
  }
}

function pickDodgeX(
  edges: LayoutEdge[],
  boxes: Box[],
  edge: LayoutEdge,
  group: string,
  index: number,
  x: number,
  yFrom: number,
  yTo: number,
) {
  const base = scoreChannel(edges, boxes, edge, group, index, x, yFrom, yTo, 0);
  if (base.nodeHits === 0 && base.coincidences === 0 && base.crosses === 0) return 0;
  let bestDx = 0;
  let bestScore = channelScore(base);
  for (const dx of DODGE_STEPS) {
    const next = scoreChannel(edges, boxes, edge, group, index, x, yFrom, yTo, dx);
    if (next.nodeHits > 0) continue;
    const score = channelScore(next);
    if (score + 0.5 < bestScore) {
      bestScore = score;
      bestDx = dx;
    }
  }
  return bestDx;
}

function channelScore(cost: { nodeHits: number; coincidences: number; crosses: number; travel: number }) {
  return cost.nodeHits * 100 + cost.coincidences * 40 + cost.crosses * 5 + cost.travel;
}

function scoreChannel(
  edges: LayoutEdge[],
  boxes: Box[],
  edge: LayoutEdge,
  group: string,
  index: number,
  x: number,
  yFrom: number,
  yTo: number,
  dx: number,
) {
  const dir = Math.sign(yTo - yFrom) || 1;
  const yA = yFrom + dir * DODGE_STUB;
  const yB = yTo - dir * DODGE_STUB;
  const pieces: Array<[number, number, number, number]> = dx === 0
    ? [[x, yFrom, x, yTo]]
    : [
        [x, yFrom, x, yA],
        [x, yA, x + dx, yA],
        [x + dx, yA, x + dx, yB],
        [x + dx, yB, x, yB],
        [x, yB, x, yTo],
      ];
  let nodeHits = 0;
  for (const [x1, y1, x2, y2] of pieces) {
    if (segmentHitsBox(x1, y1, x2, y2, boxes, new Set())) nodeHits += 1;
  }
  const segs = listAxisSegments(edges);
  let crosses = 0;
  let coincidences = 0;
  for (const piece of pieces) {
    const query: AxisSeg = {
      edge, group, index: -1,
      x1: piece[0], y1: piece[1], x2: piece[2], y2: piece[3],
    };
    const queryVertical = Math.abs(query.x1 - query.x2) < 0.5;
    for (const seg of segs) {
      if (seg.edge === edge && seg.index === index) continue;
      if (strictCross(query, seg)) crosses += 1;
      if (!queryVertical || Math.abs(seg.x1 - seg.x2) > 0.5) continue;
      if (seg.group === group) continue;
      if (Math.abs(seg.x1 - query.x1) >= 1.5) continue;
      if (rangesOverlap(query.y1, query.y2, seg.y1, seg.y2, 12)) coincidences += 1;
    }
  }
  return { nodeHits, coincidences, crosses, travel: Math.abs(dx) * 0.05 };
}

/**
 * 把仍然穿过别组水平线的竖线交叉点记下来。
 * 同一 junctionGroup 的 T 形接头不算交叉。
 * 必须在水平段错开和居中平移之后调用，桥的 Y 才跟最终总线对齐。
 */
export function markOrthogonalBridges(edges: LayoutEdge[]) {
  for (const edge of edges) {
    if (edge.path?.bridges) edge.path.bridges = undefined;
  }
  const segs = listAxisSegments(edges);
  const byEdge = new Map<LayoutEdge, Point[]>();
  for (const vertical of segs) {
    if (Math.abs(vertical.x1 - vertical.x2) > 0.5) continue;
    const x = vertical.x1;
    const yTop = Math.min(vertical.y1, vertical.y2);
    const yBot = Math.max(vertical.y1, vertical.y2);
    for (const horizontal of segs) {
      if (Math.abs(horizontal.y1 - horizontal.y2) > 0.5) continue;
      if (horizontal.group === vertical.group) continue;
      if (sameSegment(horizontal, vertical)) continue;
      const y = horizontal.y1;
      if (y <= yTop + 12 || y >= yBot - 12) continue;
      const xMin = Math.min(horizontal.x1, horizontal.x2);
      const xMax = Math.max(horizontal.x1, horizontal.x2);
      if (x <= xMin + 0.5 || x >= xMax - 0.5) continue;
      const list = byEdge.get(vertical.edge) ?? [];
      if (!list.some((point) => Math.abs(point.x - x) < 0.5 && Math.abs(point.y - y) < 0.5)) {
        list.push({ x, y });
      }
      byEdge.set(vertical.edge, list);
    }
  }
  for (const [edge, list] of byEdge) {
    edge.path!.bridges = list;
  }
}

// ==================== 总线钳制在卡片外侧 ====================

/**
 * 水平段的 Y 必须落在「父亲底边 + 间隙」和「子女顶边 - 间隙」之间。
 * 同层错开会把总线向上推进父亲卡片，正交桥拱（半径 8）还会再往上拱，
 * 生卒年就正好被线穿过。这里在错开之后把总线推回两代之间的空隙。
 * 路径首尾是卡片边缘锚点，不动。
 */
export function clampOrthogonalPathsOutsideCards(
  nodes: Array<Pick<NodePosition, 'id' | 'x' | 'y' | 'width' | 'height'>>,
  edges: LayoutEdge[],
  clearance = 14,
): void {
  const boxes = nodes
    .filter((node) => node.width > 0 && node.height > 0)
    .map((node) => ({
      id: node.id,
      x1: node.x - node.width / 2,
      x2: node.x + node.width / 2,
      y1: node.y - node.height / 2,
      y2: node.y + node.height / 2,
    }));
  const hitsBox = (y: number, x1: number, x2: number) => boxes.some((box) => {
    if (y <= box.y1 + 0.5 || y >= box.y2 - 0.5) return false;
    return Math.min(x2, box.x2) - Math.max(x1, box.x1) > 2;
  });

  for (const edge of edges) {
    const pts = edge.path?.points;
    if (edge.kind === 'spouse' || edge.path?.doubleLine || !pts || pts.length < 4) continue;
    const parentBottom = pts[0].y;
    const childTop = pts[pts.length - 1].y;
    if (!(childTop > parentBottom)) continue;
    let safeTop = parentBottom + clearance;
    let safeBottom = childTop - clearance;
    if (safeTop > safeBottom) {
      const tight = 6;
      safeTop = parentBottom + tight;
      safeBottom = childTop - tight;
    }
    if (safeTop > safeBottom) {
      safeTop = (parentBottom + childTop) / 2;
      safeBottom = safeTop;
    }
    for (let i = 1; i < pts.length - 2; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (Math.abs(a.y - b.y) > 0.5 || Math.abs(a.x - b.x) < 2) continue;
      const x1 = Math.min(a.x, b.x);
      const x2 = Math.max(a.x, b.x);
      let next = Math.min(safeBottom, Math.max(safeTop, a.y));
      if (hitsBox(next, x1, x2)) {
        const candidates = [safeTop, safeBottom, (safeTop + safeBottom) / 2];
        const free = candidates.find((y) => !hitsBox(y, x1, x2));
        if (free !== undefined) next = free;
      }
      if (Math.abs(next - a.y) < 0.5) continue;
      a.y = next;
      b.y = next;
    }
  }
}

// ==================== 同层水平边段错开 ====================

/**
 * 同层水平边段错开
 *
 * 扫描所有边中的水平线段，若同一 Y 坐标的水平段 X 范围重叠，
 * 则交替向上 / 向下微调 Y 坐标，避免多条连线重合。
 *
 * [2026-09-01 修复] 共享总线豁免：
 *   同一 junctionGroup 的多条边（如同一父-多妻妾组的多个 child edges）
 *   在 busY 上的水平段是设计上有意重合的（共享总线），
 *   错开反而会破坏"父-多妻妾组共享 drop line"的视觉语义。
 *   此处跳过同 junctionGroup 的水平段，让它们的 Y 保持一致。
 *
 * 行为：当 config.edgeHorizontalSeparation <= 0 时直接返回（不强制错开）。
 */
export function resolveEdgeHorizontalOverlaps(
  edges: LayoutEdge[],
  config: LayoutConfig,
) {
  const sep = config.edgeHorizontalSeparation;
  if (sep <= 0) return;

  interface Segment {
    edge: LayoutEdge;
    index: number;
    y: number;
    x1: number;
    x2: number;
    junctionGroup?: string;
  }

  const segments: Segment[] = [];
  for (const edge of edges) {
    // 配偶总线必须贴着卡片中线，错开会把它推进卡片。
    if (edge.kind === 'spouse' || edge.path?.doubleLine || edge.path?.laneCollapsed) continue;
    if (!edge.path?.points || edge.path.points.length < 2) continue;
    const pts = edge.path.points;
    const junctionGroup = edge.path.junctionGroup;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      if (p1.y === p2.y) {
        segments.push({
          edge,
          index: i,
          y: p1.y,
          x1: Math.min(p1.x, p2.x),
          x2: Math.max(p1.x, p2.x),
          junctionGroup,
        });
      }
    }
  }

  const byY = new Map<number, Segment[]>();
  for (const seg of segments) {
    if (!byY.has(seg.y)) byY.set(seg.y, []);
    byY.get(seg.y)!.push(seg);
  }

  for (const [, ySegments] of byY) {
    if (ySegments.length <= 1) continue;

    // [2026-09-01 修复] 共享总线豁免：同一 junctionGroup 的多条边视为一组
    // 在组内计算重叠，组间独立错开。这样保证同组的 drop line busY 一致。
    const groups = new Map<string, Segment[]>();
    for (const seg of ySegments) {
      const key = seg.junctionGroup ?? '__ungrouped__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(seg);
    }

    // 把每组当作一个"复合段"：X 范围 = 组内所有段的并集
    interface CompoundSegment {
      segs: Segment[];
      y: number;
      x1: number;
      x2: number;
      junctionGroup: string;
    }
    const compounds: CompoundSegment[] = [];
    for (const [key, segs] of groups) {
      if (segs.length === 0) continue;
      let x1 = Infinity, x2 = -Infinity;
      for (const s of segs) {
        if (s.x1 < x1) x1 = s.x1;
        if (s.x2 > x2) x2 = s.x2;
      }
      compounds.push({ segs, y: segs[0].y, x1, x2, junctionGroup: key });
    }

    // 只有一组总线时不平移。单独上移会把总线推进父亲卡片。
    if (compounds.length < 2) continue;

    // 按 X 起点排序复合段，在复合段之间错开
    compounds.sort((a, b) => a.x1 - b.x1);

    let upperUntil = -Infinity;
    let lowerUntil = -Infinity;
    let sign = 1; // 1 = 往上偏, -1 = 往下偏
    for (const compound of compounds) {
      let useUpper: boolean;
      if (sign === 1 && compound.x1 >= upperUntil + sep) {
        useUpper = true;
      } else if (sign === -1 && compound.x1 >= lowerUntil + sep) {
        useUpper = false;
      } else if (compound.x1 >= upperUntil + sep) {
        useUpper = true;
        sign = 1;
      } else if (compound.x1 >= lowerUntil + sep) {
        useUpper = false;
        sign = -1;
      } else {
        useUpper = sign === 1;
        sign *= -1;
      }

      const delta = useUpper ? -sep : sep;
      // [2026-09-01 修复] 整组一起平移：组内所有水平段的 pts[idx] 和 pts[idx+1] 都加 delta
      //   这样共享总线的多条边始终保持同一 Y（重合）。
      for (const seg of compound.segs) {
        const pts = seg.edge.path!.points;
        // 只移动这条水平段本身。两端的竖线会变长或变短，
        // 路径首尾是卡片边缘锚点，不能跟着平移，否则线会穿进卡片。
        pts[seg.index].y += delta;
        pts[seg.index + 1].y += delta;
      }

      if (useUpper) {
        upperUntil = compound.x2;
      } else {
        lowerUntil = compound.x2;
      }
    }
  }
}

// ==================== 边路径 X 平移 ====================

/**
 * 整体平移所有边的路径 X 坐标
 *
 * 节点位置在整体居中 / 主脉再居中时被平移，边 path 必须同步平移，
 * 否则牵引线会偏离节点。
 *
 * 联动平移 path.points 与 path.junction（spouse 边 junction）。
 */
export function shiftEdgePathsX(edges: LayoutEdge[], dx: number) {
  for (const edge of edges) {
    if (!edge.path?.points) continue;
    for (const p of edge.path.points) {
      p.x += dx;
    }
    if (edge.path.junction) {
      edge.path.junction.x += dx;
    }
    if (edge.path.bridges) {
      for (const point of edge.path.bridges) point.x += dx;
    }
  }
}