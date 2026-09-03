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
} from '@/types/layout';

// ==================== 模块常量 ====================

/**
 * 端点内缩常量：让牵引线末端落在卡片可见区域内
 *
 * 背景：G6 矩形节点带 border-radius（默认 8px），几何边缘与可见边缘存在偏差。
 * 线段如果刚好停在几何边缘上，渲染时会因为圆角看起来"没接上"卡片。
 * 这里统一把「父边起点」「子边终点」从几何边缘向内缩 EDGE_INSET px。
 */
const EDGE_INSET = 4;

// ==================== 父子边正交路径 ====================

/**
 * 计算父子边正交路径（T 形 / L 形）
 *
 * 核心规则：
 * 1. 单 child：起点 → 垂线 → 水平 → 子女顶中点（3 点）或退化为 2 点直线
 * 2. 多 child：起点 → 垂线到 busY → 水平到各 child 顶 X → 各 child 顶中点（4 点 T 形）
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
export function computeOrthogonalEdgePaths(
  nodePositions: Map<string, NodePosition>,
  edges: LayoutEdge[],
  coupleUnitByMain: Map<string, CoupleUnit>,
  /**
   * [v6.x X 系列] 端点向节点内缩距离（默认 edgeInset = 4）
   * 由调用方从 LayoutConfig.edgeInset 读取后传入。
   */
  edgeInset: number = EDGE_INSET,
) {
  // 按 source 分组父子边
  const childrenByParent = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    if (edge.kind === 'spouse') continue;
    // [W2 2026-09-01] 跳过 spouse 边展开而来的虚拟边：它们的 path 由 spouse-renderer 接管。
    if (edge.fromVirtualSpouse) continue;
    if (!childrenByParent.has(edge.source)) childrenByParent.set(edge.source, []);
    childrenByParent.get(edge.source)!.push(edge);
  }

  for (const [parentId, childEdges] of childrenByParent) {
    const parentPos = nodePositions.get(parentId);
    if (!parentPos || childEdges.length === 0) continue;

    const parentBottomY = parentPos.y + parentPos.height / 2 - edgeInset;

    // [v6.0.8 2026-09-02] 走线解耦：所有兄弟共享 drop line，不再按 motherId 分流。
    //   coupleUnitMidX = (父.x + 最右配偶.x) / 2
    //   无配偶时退化为父节点中心 X（保持原行为）。
    const coupleUnit = coupleUnitByMain.get(parentId);
    let coupleUnitMidX: number | null = null;
    if (coupleUnit && coupleUnit.spouseIds.length > 0) {
      let rightmostSpouseX = parentPos.x;
      for (const sid of coupleUnit.spouseIds) {
        const spos = nodePositions.get(sid);
        if (spos && spos.x > rightmostSpouseX) rightmostSpouseX = spos.x;
      }
      coupleUnitMidX = (parentPos.x + rightmostSpouseX) / 2;
    }

    /**
     * [v6.0.8] 起点 X 解析：
     *   - 有 coupleUnit（父-多妻妾组）→ coupleUnitMidX（共享 drop line）
     *   - 无 coupleUnit → 父节点中心 X
     *
     * 不再读取 edge.motherId，v6.0.7 的 per-edge motherId 分流已废弃。
     */
    const resolveStartX = (_edge: LayoutEdge): number => {
      return coupleUnitMidX ?? parentPos.x;
    };

    const childPositions = childEdges
      .map(e => ({ edge: e, pos: nodePositions.get(e.target) }))
      .filter(({ pos }) => pos !== undefined)
      .map(({ edge, pos }) => ({ edge, pos: pos! }));

    if (childPositions.length === 0) continue;

    if (childPositions.length === 1) {
      const childPos = childPositions[0].pos;
      const childTopX = childPos.x;
      // 子边终点向子节点内缩 edgeInset px（向下移动 Y+4），
      // 确保终点落在卡片可见区内，避免 border-radius=8 导致终点看起来「悬空」。
      const childTopY = childPos.y - childPos.height / 2 + edgeInset;
      const startX = resolveStartX(childPositions[0].edge);

      if (startX === childTopX) {
        childPositions[0].edge.path = {
          points: [
            { x: startX, y: parentBottomY },
            { x: childTopX, y: childTopY },
          ],
          type: 'orthogonal',
        };
      } else {
        childPositions[0].edge.path = {
          points: [
            { x: startX, y: parentBottomY },
            { x: startX, y: childTopY },
            { x: childTopX, y: childTopY },
          ],
          type: 'orthogonal',
        };
      }
    } else {
      // [v6.0.8 2026-09-02] 走线解耦母亲归属：
      //   - 所有兄弟统一归入同一 'shared' 组（不再按 motherId 分组）
      //   - 起点 X 统一 = coupleUnitMidX ?? parentPos.x
      //   - 一组共享一条 T 形总线（junctionGroup 仍区分同父不同兄弟组）
      type MotherGroup = {
        groupKey: string;
        startX: number;
        children: { edge: LayoutEdge; pos: NodePosition }[];
      };
      const groups = new Map<string, MotherGroup>();
      // [v6.0.8] 同父的所有兄弟归入同一 'shared' 组
      const sharedStartX = coupleUnitMidX ?? parentPos.x;
      const sharedGroup: MotherGroup = {
        groupKey: 'shared',
        startX: sharedStartX,
        children: [],
      };
      groups.set('shared', sharedGroup);
      for (const cp of childPositions) {
        sharedGroup.children.push(cp);
      }

      // [2026-09-01 修复] 共享总线组标识：同一 parentId 下的多条 child edges 在 busY 上的
      //   水平段属于同一"父-多妻妾组 drop line"，应保持 Y 一致（重合）。
      //   resolveEdgeHorizontalOverlaps 会跳过同 junctionGroup 的水平段。
      for (const group of groups.values()) {
        const firstChildTopY = Math.min(...group.children.map(c => c.pos.y - c.pos.height / 2 + edgeInset));
        const branchY = parentBottomY + (firstChildTopY - parentBottomY) * 0.5;
        const junctionGroup = `parent-${parentId}-${group.groupKey}`;

        for (const { edge, pos } of group.children) {
          const childTopX = pos.x;
          const childTopY = pos.y - pos.height / 2 + edgeInset;

          edge.path = {
            points: [
              { x: group.startX, y: parentBottomY },
              { x: group.startX, y: branchY },
              { x: childTopX, y: branchY },
              { x: childTopX, y: childTopY },
            ],
            type: 'orthogonal',
            junctionGroup,
          };
        }
      }
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
        const a = pts[seg.index];
        const b = pts[seg.index + 1];
        a.y += delta;
        b.y += delta;

        // 联动调整相邻垂直段端点 Y，保证正交连接不被破坏
        if (seg.index - 1 >= 0) {
          pts[seg.index - 1].y += delta;
        }
        if (seg.index + 2 < pts.length) {
          pts[seg.index + 2].y += delta;
        }
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
  }
}