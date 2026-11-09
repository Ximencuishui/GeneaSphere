/**
 * tree-positioning.ts - 节点定位模块
 *
 * [Phase C 2026-09-02] LayoutEngine v6 重构收尾：从 tree-layout.ts 抽取节点定位
 *   相关纯函数，让原 806 行单体拆为三模块。
 *
 * 本模块负责（纯函数）：
 * - 配偶邻接表构建（buildSpouseMap）
 * - 配偶子树宽度计算（computeSpouseWidths / computeSubtreeWidth）
 * - 自动间距（computeAutoNodeSep / computeAutoRankSep）
 * - 最大代际探测（computeMaxGeneration）
 * - 配偶贴附 + 继子女子树（positionSpouseNodes + layoutSpouseSubtree）
 * - birthOrder 兜底重排（reorderSiblingsByBirthOrder）
 * - 父子边环路检测（detectCycle）
 * - 通用 boundingBox 工具（getBoundingBox）
 *
 * 不在本模块范围：
 * - 主脉对齐（→ tree-main-line.ts）
 * - 子树避让（→ tree-overlap.ts）
 * - 父子边正交路径（→ edge-router.ts）
 * - 配偶边正交路径（→ spouse-renderer.ts）
 */

import type {
  LayoutNode,
  LayoutEdge,
  NodePosition,
  LayoutConfig,
  BoundingBox,
  CoupleUnit,
} from '@/types/layout';
import { shiftSubtree } from '@/utils/tree-overlap';

// ==================== 工具函数 ====================

/**
 * 通用 boundingBox 计算
 *
 * 计算一组节点的外接矩形（minX/minY/maxX/maxY）。
 * 尊重 effectiveWidth（用于主脉节点的 spouse 链宽度补偿）。
 */
export function getBoundingBox(nodes: NodePosition[]): BoundingBox {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const effectiveW = n.effectiveWidth ?? n.width;
    const halfW = effectiveW / 2;
    const halfH = n.height / 2;
    minX = Math.min(minX, n.x - halfW);
    minY = Math.min(minY, n.y - halfH);
    maxX = Math.max(maxX, n.x + halfW);
    maxY = Math.max(maxY, n.y + halfH);
  }
  return { minX, minY, maxX, maxY };
}

// ==================== 配偶映射 ====================

/**
 * 构建配偶映射：mainId → spouseEdges
 *
 * 跳过两端都是配偶的边（实际数据中不应存在），跳过两端都是主节点的边（非配偶）。
 */
export function buildSpouseMap(
    edges: LayoutEdge[],
    spouseNodeIds: Set<string>,
): Map<string, LayoutEdge[]> {
  const spouseByMain = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    if (edge.kind !== 'spouse') continue;
    const sourceIsSpouse = spouseNodeIds.has(edge.source);
    const targetIsSpouse = spouseNodeIds.has(edge.target);
    let mainId: string;
    if (sourceIsSpouse && !targetIsSpouse) mainId = edge.target;
    else if (targetIsSpouse && !sourceIsSpouse) mainId = edge.source;
    else continue;
    if (!spouseByMain.has(mainId)) spouseByMain.set(mainId, []);
    spouseByMain.get(mainId)!.push(edge);
  }
  return spouseByMain;
}

/**
 * 计算每个主节点的配偶总宽度（含配偶子树宽度）
 *
 * 供 positionSpouseNodes 阶段使用：算出每个主节点的 spouseGap 起点 cursorX。
 */
export function computeSpouseWidths(
    spouseByMain: Map<string, LayoutEdge[]>,
    nodeMap: Map<string, LayoutNode>,
    childrenByParent: Map<string, string[]>,
    config: LayoutConfig,
    subtreeWidthCache: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const [mainId, mainSpouseEdges] of spouseByMain) {
    let totalWidth = 0;
    for (const edge of mainSpouseEdges) {
      const spouseId = edge.source === mainId ? edge.target : edge.source;
      const spouseNode = nodeMap.get(spouseId);
      const spouseW = spouseNode?.width ?? config.nodeWidth;
      const subtreeW = computeSubtreeWidth(
        spouseId, nodeMap, childrenByParent, config, subtreeWidthCache,
      );
      totalWidth += Math.max(spouseW, subtreeW) + config.spouseGap;
    }
    result.set(mainId, totalWidth);
  }
  return result;
}

/**
 * 递归计算子树宽度（用于继子女避让）
 *
 * 记忆化：相同 nodeId 的结果在单次布局中不变。
 * W1 保留此函数；W3 引入 dagre 时可删除（dagre 自带子图测量）。
 *
 * [v6.x X 系列] 深度上限从 `config.subtreeWidthMaxDepth ?? 20` 读取：
 *   - 默认 20：与 v5 / 原始代码完全一致
 *   - 调小（如 10）可在极深数据下加速（牺牲精度）
 *   - 调大（如 30）支持极深家谱
 */
export function computeSubtreeWidth(
    nodeId: string,
    nodeMap: Map<string, LayoutNode>,
    childrenByParent: Map<string, string[]>,
    config: LayoutConfig,
    cache: Map<string, number>,
    depth = 0,
): number {
  const maxDepth = config.subtreeWidthMaxDepth ?? 20;
  if (depth > maxDepth) return 0;

  const cached = cache.get(nodeId);
  if (cached !== undefined) return cached;

  const children = childrenByParent.get(nodeId) || [];
  if (children.length === 0) return 0;
  let totalWidth = 0;
  for (let i = 0; i < children.length; i++) {
    const childNode = nodeMap.get(children[i]);
    const childW = Number(childNode?.width ?? config.nodeWidth);
    const subW = Number(computeSubtreeWidth(
      children[i], nodeMap, childrenByParent, config, cache, depth + 1,
    ));
    totalWidth += Math.max(childW, subW);
    if (i < children.length - 1) totalWidth += Number(config.nodeSep);
  }
  cache.set(nodeId, totalWidth);
  return totalWidth;
}

// ==================== 间距计算 ====================

/**
 * 自动计算节点间距（基于节点数 + 代际数）
 *
 * [2026-09-01 P0 修复] 增加 maxNodeSep 上限约束（默认 80）：
 *   当 avgNodesPerGen 极大时（30+），单纯缩小 nodeSep 不能阻止 dagre tight-tree
 *   在不平衡子图下产生极端 X 跨度（实测 86 节点可达 67K px）。此处加 maxNodeSep
 *   兜底，让 computeAutoNodeSep 返回值不超过 80 px，避免传入 dagre 后失控。
 *   真正的修复在 LayoutEngine.autoFit（P0 修复 2：aspectRatio > 3 时强制 fitByHeight）。
 */
export function computeAutoNodeSep(
    totalNodes: number,
    generations: number,
    nodeWidth: number,
    maxNodeSep: number = 80,
): number {
  const avgNodesPerGen = totalNodes / Math.max(generations, 1);
  let sep: number;
  if (avgNodesPerGen < 5) sep = Math.max(16, nodeWidth * 0.25);
  else if (avgNodesPerGen < 20) sep = Math.max(12, nodeWidth * 0.19);
  else sep = Math.max(10, nodeWidth * 0.13);
  // 上限约束：避免极端不平衡子图让单代 X 跨度失控
  return Math.min(sep, maxNodeSep);
}

/**
 * 自动计算代际间距
 *
 * Y 跨度应至少 80% 适配画布高度，让金字塔结构在垂直方向有足够呼吸空间。
 * 此处仅计算 rankSep 基线（= nodeHeight × 2.5，下限 nodeHeight + 40）。
 */
export function computeAutoRankSep(nodeHeight: number): number {
  const baseline = Math.round(nodeHeight * 2.5);
  return Math.max(nodeHeight + 40, baseline);
}

/**
 * [P3 2026-08-28] + [2026-09-01 P2 修复] 按 birthOrder 兜底重排兄弟节点 X
 *
 * dagre / elkjs / alignMainLineage / resolveSubtreeOverlap 后的兄弟 X 顺序可能与
 * 输入 birthOrder 不严格一致（特别是子树宽度差异大时，或主脉对齐微调后）。
 * 此函数在最终输出前强制按 birthOrder 升序排列同父兄弟的 X。
 *
 * - 未指定 birthOrder 的兄弟保持在原 X 不动（向后兼容）
 * - 仅对至少一条边指定了 birthOrder 的兄弟组生效
 * - 取组内最小 X 作为锚点，间距 = (maxX - minX) / (兄弟数 - 1)
 * - 兄弟中心距不得小于「左侧夫妻单元宽度 + nodeSep」。原跨度不够时向右撑开。
 * - 这里的 X 是工作坐标的兄弟轴。LR 在进入本函数前已经把屏幕坐标转置过来，
 *   代际跨度在 Y 上，不会被算进兄弟均分。
 * - avgGap 大于夫妻组最小中心距的 1.5 倍，或大于 500 时，收回到紧凑间距，
 *   避免避让把兄弟轴拉爆之后，均分把空洞原样保留下来。
 * - 改兄弟的 x 时整棵子树一起走，子孙留在原列会和次子交叉。
 * - 重排后若父节点 x 与子节点组中心相差超过 1px，把父节点（及其配偶）改到该中心。
 *   不搬子女，避免中心跟着跑。单子女的父亲在 packSubtreesByBirthOrder 里对齐。
 */
export function reorderSiblingsByBirthOrder(
    positions: Map<string, NodePosition>,
    sortedEdges: LayoutEdge[],
    config: LayoutConfig,
): void {
  const childrenByParent = new Map<string, LayoutEdge[]>();
  for (const e of sortedEdges) {
    if (!childrenByParent.has(e.source)) childrenByParent.set(e.source, []);
    childrenByParent.get(e.source)!.push(e);
  }

  const shiftIndex = buildBirthOrderShiftIndex(positions, sortedEdges);

  const nodeSep = typeof config.nodeSep === 'number' ? config.nodeSep : 24;
  const reorderedParents: string[] = [];

  for (const [parentId, childEdges] of childrenByParent) {
    // 仅处理至少有一条指定了 birthOrder 的组
    const withBO = childEdges.filter((e) => e.birthOrder != null);
    if (withBO.length === 0) continue;

    // 收集有 birthOrder 的子节点当前 X
    const ordered = [...withBO].sort((a, b) => (a.birthOrder ?? 0) - (b.birthOrder ?? 0));
    const xs = ordered.map((e) => positions.get(e.target)?.x).filter((x): x is number => x !== undefined);
    if (xs.length < 2) continue;

    // 按整组跨度均分。不用出生序相邻 |Δx| 的平均值：顺序和左右位置不一致时，折线长度会大于整体跨度。
    // X 是工作坐标兄弟轴（LR 已转置），跨度里没有代际间隔。
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    let avgGap = ordered.length > 1 ? (maxX - minX) / (ordered.length - 1) : 0;
    let minCenterGap = 0;
    for (let i = 0; i < ordered.length - 1; i++) {
      const pos = positions.get(ordered[i].target);
      if (!pos) continue;
      const unitWidth = shiftIndex.unitWidthOf(ordered[i].target);
      minCenterGap = Math.max(minCenterGap, unitWidth + nodeSep);
    }
    const compactGap = Math.max(minCenterGap, nodeSep + 64);
    if (avgGap > 500 || (minCenterGap > 0 && avgGap > minCenterGap * 1.5)) avgGap = compactGap;
    if (avgGap < minCenterGap) avgGap = minCenterGap;

    const targets: { id: string; x: number }[] = [];
    for (let i = 0; i < ordered.length; i++) {
      targets.push({ id: ordered[i].target, x: minX + i * avgGap });
    }
    for (const target of targets) {
      const pos = positions.get(target.id);
      if (!pos) continue;
      const dx = target.x - pos.x;
      if (Math.abs(dx) < 0.01) continue;
      // 兄弟换位必须带走整棵子树。只改本人的 x，子孙会留在原处，
      // 长子卡片在左、长孙却还压在次子下面。
      shiftSubtree(
        target.id,
        dx,
        positions,
        shiftIndex.childrenByParent,
        shiftIndex.spouseByMain,
        shiftIndex.coupleUnitByMain,
        new Set(),
        shiftIndex.nodeMap,
      );
    }
    reorderedParents.push(parentId);
  }

  // 子节点组中心依赖更深层父节点的最终 x，所以从深到浅同步。
  const parentOf = new Map<string, string>();
  for (const [parentId, childEdges] of childrenByParent) {
    for (const edge of childEdges) {
      if (edge.kind === 'spouse' || edge.fromVirtualSpouse) continue;
      if (!parentOf.has(edge.target)) parentOf.set(edge.target, parentId);
    }
  }
  const depthCache = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depthCache.get(id);
    if (cached != null) return cached;
    let depth = 0;
    let cur = id;
    const seen = new Set<string>();
    while (parentOf.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = parentOf.get(cur)!;
      depth += 1;
    }
    depthCache.set(id, depth);
    return depth;
  };

  for (const parentId of [...new Set(reorderedParents)].sort((a, b) => depthOf(b) - depthOf(a))) {
    const xs: number[] = [];
    for (const edge of childrenByParent.get(parentId) || []) {
      if (edge.kind === 'spouse' || edge.fromVirtualSpouse) continue;
      const x = positions.get(edge.target)?.x;
      if (x != null) xs.push(x);
    }
    if (xs.length === 0) continue;
    const center = (Math.min(...xs) + Math.max(...xs)) / 2;
    const parent = positions.get(parentId);
    if (parent && Math.abs(parent.x - center) > 1) {
      const dx = center - parent.x;
      const unit = shiftIndex.coupleUnitByMain.get(parentId);
      if (unit) {
        // 只带走配偶，不搬子女。子女的 x 就是刚刚算出来的中心依据。
        parent.x += dx;
        for (const spouseId of unit.spouseIds) {
          const spouse = positions.get(spouseId);
          if (spouse) spouse.x += dx;
        }
      } else {
        parent.x = center;
      }
    }
  }
}

/**
 * 从虚拟配偶链还原「谁有贴在身边的配偶」，供出生序重排平移。
 * 配偶还没贴附（不在同一行）时不建 CoupleUnit，避免第一次 dagre 重排把人拖走。
 */
function buildBirthOrderShiftIndex(
  positions: Map<string, NodePosition>,
  edges: LayoutEdge[],
) {
  const virtualIds = new Set<string>();
  const mainByVirtual = new Map<string, string>();
  for (const edge of edges) {
    if (!edge.fromVirtualSpouse) continue;
    virtualIds.add(edge.target);
    mainByVirtual.set(edge.target, edge.source);
  }

  const spousesByMain = new Map<string, string[]>();
  for (const edge of edges) {
    const mainId = mainByVirtual.get(edge.source);
    if (!mainId) continue;
    const list = spousesByMain.get(mainId) ?? [];
    if (!list.includes(edge.target)) list.push(edge.target);
    spousesByMain.set(mainId, list);
  }

  const coupleUnitByMain = new Map<string, CoupleUnit>();
  const spouseByMain = new Map<string, LayoutEdge[]>();
  for (const [mainId, spouseIds] of spousesByMain) {
    const main = positions.get(mainId);
    if (!main) continue;
    const attached = spouseIds.filter((sid) => {
      const spouse = positions.get(sid);
      return !!spouse && Math.abs(spouse.y - main.y) <= 1 && spouse.x >= main.x;
    });
    if (attached.length === 0) continue;
    let right = main.x + main.width / 2;
    for (const sid of attached) {
      const spouse = positions.get(sid)!;
      right = Math.max(right, spouse.x + spouse.width / 2);
    }
    coupleUnitByMain.set(mainId, {
      mainId,
      spouseIds: attached,
      unitWidth: right - (main.x - main.width / 2),
      unitRightX: right,
    });
    spouseByMain.set(mainId, attached.map((sid) => ({
      id: `${mainId}__${sid}`,
      source: mainId,
      target: sid,
      kind: 'spouse' as const,
    })));
  }

  const childrenByParent = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind === 'spouse' || edge.fromVirtualSpouse) continue;
    if (virtualIds.has(edge.source) || virtualIds.has(edge.target)) continue;
    const list = childrenByParent.get(edge.source) ?? [];
    list.push(edge.target);
    childrenByParent.set(edge.source, list);
  }

  const nodeMap = new Map<string, LayoutNode>();
  for (const virtualId of virtualIds) {
    nodeMap.set(virtualId, { virtualSpouse: true } as LayoutNode);
  }

  const unitWidthOf = (id: string): number => {
    const pos = positions.get(id);
    if (!pos) return 0;
    if (typeof pos.effectiveWidth === 'number' && pos.effectiveWidth > pos.width) {
      return pos.effectiveWidth;
    }
    return coupleUnitByMain.get(id)?.unitWidth ?? pos.width;
  };

  return { coupleUnitByMain, spouseByMain, childrenByParent, nodeMap, unitWidthOf };
}

/**
 * 按排行把每一家的子树收成从左到右的连续横带，再把父节点挪到子女中心。
 *
 * dagre / elkjs 即使兄弟顺序对了，也可能把长孙留在次子那一列（配偶虚拟链占过槽，
 * 或后续避让只推了子孙没推父亲）。这里自底向上：
 * 1. 先把每个子女的子树收拢到他自己脚下；
 * 2. 再按 birthOrder 从左到右铺开这些子树，长子的整棵子树占左边；
 * 3. 最后把父节点（连同贴在身边的配偶）平移到直接子女 X 的中点。
 *    单子的父亲会落在这个孩子的正上方。
 *
 * 配偶卡片不参与兄弟排序。已贴在丈夫身边的妻子不再单独被拉去对齐子女，
 * 避免把夫妻拆开；她的子女在上一步已经铺在她下方。
 */
export function packSubtreesByBirthOrder(
  positions: Map<string, NodePosition>,
  edges: LayoutEdge[],
  nodeMap: Map<string, LayoutNode>,
  spouseByMain: Map<string, LayoutEdge[]>,
  coupleUnitByMain: Map<string, CoupleUnit>,
  childrenByParent: Map<string, string[]>,
  nodeSep: number,
): void {
  const gap = Number.isFinite(nodeSep) ? nodeSep : 24;
  const kidsOf = new Map<string, string[]>();
  const edgeByChild = new Map<string, LayoutEdge>();

  for (const edge of edges) {
    if (edge.kind !== 'parent-child' || edge.fromVirtualSpouse) continue;
    if (edge.source.startsWith('__virt_') || edge.target.startsWith('__virt_')) continue;
    if (nodeMap.get(edge.source)?.virtualSpouse || nodeMap.get(edge.target)?.virtualSpouse) continue;
    const list = kidsOf.get(edge.source) ?? [];
    if (!list.includes(edge.target)) list.push(edge.target);
    kidsOf.set(edge.source, list);
    const prev = edgeByChild.get(`${edge.source}\0${edge.target}`);
    if (!prev || (prev.birthOrder == null && edge.birthOrder != null)) {
      edgeByChild.set(`${edge.source}\0${edge.target}`, edge);
    }
  }

  const rankOf = (parentId: string, childId: string): number => {
    const order = edgeByChild.get(`${parentId}\0${childId}`)?.birthOrder;
    return order == null || Number.isNaN(Number(order)) ? Number.POSITIVE_INFINITY : Number(order);
  };
  for (const [parentId, kids] of kidsOf) {
    kids.sort((a, b) => {
      const ra = rankOf(parentId, a);
      const rb = rankOf(parentId, b);
      if (ra === rb) return 0;
      return ra < rb ? -1 : 1;
    });
  }

  const parentOf = new Map<string, string>();
  for (const [parentId, kids] of kidsOf) {
    for (const kid of kids) {
      if (!parentOf.has(kid)) parentOf.set(kid, parentId);
    }
  }
  const depthCache = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depthCache.get(id);
    if (cached != null) return cached;
    let depth = 0;
    let cur = id;
    const seen = new Set<string>();
    while (parentOf.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = parentOf.get(cur)!;
      depth += 1;
    }
    depthCache.set(id, depth);
    return depth;
  };

  const attachedSpouses = new Set<string>();
  for (const unit of coupleUnitByMain.values()) {
    for (const spouseId of unit.spouseIds) attachedSpouses.add(spouseId);
  }

  const spanOf = (id: string): { minX: number; maxX: number } | null => {
    let minX = Infinity;
    let maxX = -Infinity;
    const seen = new Set<string>();
    const visit = (nodeId: string) => {
      if (seen.has(nodeId)) return;
      seen.add(nodeId);
      if (nodeMap.get(nodeId)?.virtualSpouse) return;
      const pos = positions.get(nodeId);
      if (pos && pos.width > 0) {
        minX = Math.min(minX, pos.x - pos.width / 2);
        maxX = Math.max(maxX, pos.x + pos.width / 2);
      }
      const unit = coupleUnitByMain.get(nodeId);
      const spouseIds = unit
        ? unit.spouseIds
        : (spouseByMain.get(nodeId) || []).map((edge) =>
          edge.source === nodeId ? edge.target : edge.source,
        );
      for (const spouseId of spouseIds) visit(spouseId);
      for (const childId of childrenByParent.get(nodeId) || []) {
        if (nodeMap.get(childId)?.virtualSpouse) continue;
        visit(childId);
      }
    };
    visit(id);
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX) return null;
    return { minX, maxX };
  };

  const moveCouple = (id: string, dx: number) => {
    if (Math.abs(dx) < 0.01) return;
    const pos = positions.get(id);
    if (pos) pos.x += dx;
    const unit = coupleUnitByMain.get(id);
    if (unit) {
      unit.unitRightX += dx;
      for (const spouseId of unit.spouseIds) {
        const spouse = positions.get(spouseId);
        if (spouse) spouse.x += dx;
      }
    } else {
      for (const edge of spouseByMain.get(id) || []) {
        const spouseId = edge.source === id ? edge.target : edge.source;
        const spouse = positions.get(spouseId);
        if (spouse) spouse.x += dx;
      }
    }
    for (const childId of childrenByParent.get(id) || []) {
      if (!nodeMap.get(childId)?.virtualSpouse) continue;
      const virtual = positions.get(childId);
      if (virtual) virtual.x += dx;
    }
  };

  const parents = [...kidsOf.keys()].sort((a, b) => depthOf(b) - depthOf(a));
  for (const parentId of parents) {
    const parent = positions.get(parentId);
    const kids = kidsOf.get(parentId) || [];
    if (!parent || kids.length === 0) continue;

    const boxes: { id: string; minX: number; maxX: number }[] = [];
    for (const kid of kids) {
      const box = spanOf(kid);
      if (box) boxes.push({ id: kid, ...box });
    }
    if (boxes.length === 0) continue;

    let total = 0;
    for (const box of boxes) total += box.maxX - box.minX;
    total += gap * (boxes.length - 1);
    let cursor = parent.x - total / 2;
    for (const box of boxes) {
      const width = box.maxX - box.minX;
      const dx = cursor - box.minX;
      if (Math.abs(dx) >= 0.01) {
        shiftSubtree(
          box.id,
          dx,
          positions,
          childrenByParent,
          spouseByMain,
          coupleUnitByMain,
          new Set(),
          nodeMap,
        );
        const unit = coupleUnitByMain.get(box.id);
        if (unit) unit.unitRightX += dx;
      }
      cursor += width + gap;
    }

    if (attachedSpouses.has(parentId)) continue;
    const xs: number[] = [];
    for (const kid of kids) {
      const x = positions.get(kid)?.x;
      if (x != null) xs.push(x);
    }
    if (xs.length === 0) continue;
    const center = (Math.min(...xs) + Math.max(...xs)) / 2;
    moveCouple(parentId, center - parent.x);
  }

  for (const edge of edges) {
    if (!edge.fromVirtualSpouse) continue;
    const main = positions.get(edge.source);
    const virtual = positions.get(edge.target);
    if (!main || !virtual) continue;
    virtual.x = main.x;
    virtual.y = main.y;
  }
}

/**
 * 计算最大代际
 */
export function computeMaxGeneration(
    childrenByParent: Map<string, string[]>,
    roots: LayoutNode[],
): number {
  if (roots.length === 0) return 0;

  const generationMap = new Map<string, number>();
  const queue: { id: string; gen: number }[] = [];

  for (const root of roots) {
    generationMap.set(root.id, 0);
    queue.push({ id: root.id, gen: 0 });
  }

  let maxGen = 0;
  while (queue.length > 0) {
    const { id, gen } = queue.shift()!;
    maxGen = Math.max(maxGen, gen);
    for (const childId of childrenByParent.get(id) || []) {
      if (!generationMap.has(childId)) {
        generationMap.set(childId, gen + 1);
        queue.push({ id: childId, gen: gen + 1 });
      }
    }
  }

  return maxGen;
}

// ==================== 配偶定位 + CoupleUnit 注册 ====================

/**
 * 配偶节点定位（含继子女子树）
 *
 * v5 优化（2026-08-28）：
 * 1. [A1] 移除 effectiveWidth 累加：每个配偶卡片紧贴前一个配偶 + 固定 spouseGap。
 * 2. [A2] 引入 CoupleUnit 概念：把"主节点 + 全部配偶 + 配偶继子女子树"视为绑定单元。
 * 3. spouse 边 path 将在节点位置最终确定后由 spouse-renderer 模块统一计算。
 *
 * [W2 2026-09-01] 虚拟节点适配：
 *   spouse 边在 expand 阶段转为「mainId → virtualSpouseId → spouseId」链，
 *   此函数在虚拟图上跑，需要把虚拟节点和真实配偶都贴附到 main 节点上：
 *   - 虚拟节点 X = mainPos.x（与 main 同 X，让 dagre/elkjs 把夫妻看作同层）
 *   - 虚拟节点 Y = mainPos.y（与 main 同 Y）
 *   - 真实配偶节点 X = mainPos.x + mainPos.width/2 + spouseGap + spouseWidth/2
 *   - 真实配偶节点 Y = mainPos.y
 * LR 屏幕上配偶要贴在主节点下方（Y+）。本函数仍贴在工作坐标的 X+，
 * 流水线在 LR 时先把屏幕坐标转置进来，出去再转置回去，X+ 就变成 Y+。
 *   同时注册 CoupleUnit（mainId 为单位）和 CoupleUnitByMain。
 *
 * 副作用：把每个 mainId 的 CoupleUnit 注册到 coupleUnitByMain。
 */
export function positionSpouseNodes(
    nodePositions: Map<string, NodePosition>,
    nodeMap: Map<string, LayoutNode>,
    spouseByMain: Map<string, LayoutEdge[]>,
    edges: LayoutEdge[],
    childrenByParent: Map<string, string[]>,
    config: LayoutConfig,
    rankSep: number,
    nodeSep: number,
    coupleUnitByMain: Map<string, CoupleUnit>,
    spouseToVirtual?: Map<string, string>,
) {
  const spouseGap = config.spouseGap;

  for (const [mainId, mainSpouseEdges] of spouseByMain) {
    const mainPos = nodePositions.get(mainId);
    if (!mainPos) continue;

    const sorted = [...mainSpouseEdges].sort(
      (a, b) => (a.marriageOrder ?? 0) - (b.marriageOrder ?? 0),
    );

    let cursorX = mainPos.x + mainPos.width / 2 + spouseGap;
    let totalSpouseWidth = 0;

    for (let i = 0; i < sorted.length; i++) {
      const edge = sorted[i];
      const spouseId = edge.source === mainId ? edge.target : edge.source;
      const spouseNode = nodeMap.get(spouseId);
      const spouseWidth = spouseNode?.width ?? config.nodeWidth;
      const spouseHeight = spouseNode?.height ?? config.nodeHeight;

      const spouseCenterX = cursorX + spouseWidth / 2;

      nodePositions.set(spouseId, {
        id: spouseId,
        x: spouseCenterX,
        y: mainPos.y,
        width: spouseWidth,
        height: spouseHeight,
      });

      // [W2 2026-09-01] 把虚拟节点也贴附到 main 同位置（覆盖 compactBox 给出的初始位置）
      // 虚拟节点 X/Y 与 main 同 → 让夫妻看起来同代、同 X 起点
      const virtualId = spouseToVirtual?.get(spouseId);
      if (virtualId) {
        nodePositions.set(virtualId, {
          id: virtualId,
          x: mainPos.x,
          y: mainPos.y,
          width: 0,
          height: 0,
        });
      }

      // 继子女子树：工作坐标里从配偶正下方延伸。
      // rankSep 在这里是中心距。LR 转置后卡片在代际轴上的尺寸是屏幕宽度，
      // 可能大于配置的 rankSep，中心距至少要让两张卡片边框分开。
      const spouseChildren = childrenByParent.get(spouseId) || [];
      if (spouseChildren.length > 0) {
        const childRowHeight = maxNodeHeight(spouseChildren, nodeMap, config.nodeHeight);
        layoutSpouseSubtree(
          spouseId,
          spouseCenterX,
          mainPos.y + generationCenterGap(spouseHeight, childRowHeight, rankSep),
          nodePositions,
          nodeMap,
          childrenByParent,
          config,
          rankSep,
          nodeSep,
        );
      }

      totalSpouseWidth += spouseWidth + (i < sorted.length - 1 ? spouseGap : 0);
      cursorX += spouseWidth + spouseGap;
    }

    // 注册 CoupleUnit
    const mainPos2 = nodePositions.get(mainId);
    if (mainPos2) {
      mainPos2.effectiveWidth = mainPos2.width + totalSpouseWidth + spouseGap;
      const unit: CoupleUnit = {
        mainId,
        spouseIds: sorted.map((e) => (e.source === mainId ? e.target : e.source)),
        unitWidth: mainPos2.width + totalSpouseWidth + spouseGap,
        unitRightX: mainPos2.x + mainPos2.width / 2 + totalSpouseWidth + spouseGap,
      };
      coupleUnitByMain.set(mainId, unit);
    }
  }
}

/** 配偶子树的代际中心距。配置的 rankSep 不够放下两张卡片时，按卡片高度撑开。 */
function generationCenterGap(parentHeight: number, childHeight: number, rankSep: number): number {
  return Math.max(rankSep, parentHeight / 2 + childHeight / 2 + 8);
}

function maxNodeHeight(
  ids: string[],
  nodeMap: Map<string, LayoutNode>,
  fallback: number,
): number {
  let height = 0;
  for (const id of ids) height = Math.max(height, nodeMap.get(id)?.height ?? fallback);
  return height || fallback;
}

/**
 * 布局配偶的子树（继子女）
 *
 * 使用简单的居中布局，子节点在配偶节点下方。
 * 子树的子树递归处理。
 */
function layoutSpouseSubtree(
    spouseId: string,
    centerX: number,
    y: number,
    nodePositions: Map<string, NodePosition>,
    nodeMap: Map<string, LayoutNode>,
    childrenByParent: Map<string, string[]>,
    config: LayoutConfig,
    rankSep: number,
    nodeSep: number,
) {
  const children = childrenByParent.get(spouseId) || [];
  if (children.length === 0) return;

  let totalWidth = 0;
  for (let i = 0; i < children.length; i++) {
    const childNode = nodeMap.get(children[i]);
    totalWidth += childNode?.width ?? config.nodeWidth;
    if (i < children.length - 1) totalWidth += nodeSep;
  }

  let currentX = centerX - totalWidth / 2;
  for (const childId of children) {
    const childNode = nodeMap.get(childId);
    const childWidth = childNode?.width ?? config.nodeWidth;
    const childHeight = childNode?.height ?? config.nodeHeight;

    nodePositions.set(childId, {
      id: childId,
      x: currentX + childWidth / 2,
      y,
      width: childWidth,
      height: childHeight,
    });

    const grandChildren = childrenByParent.get(childId) || [];
    if (grandChildren.length > 0) {
      const nextHeight = maxNodeHeight(grandChildren, nodeMap, config.nodeHeight);
      layoutSpouseSubtree(
        childId,
        currentX + childWidth / 2,
        y + generationCenterGap(childHeight, nextHeight, rankSep),
        nodePositions,
        nodeMap,
        childrenByParent,
        config,
        rankSep,
        nodeSep,
      );
    }

    currentX += childWidth + nodeSep;
  }
}

// ==================== 环路检测 (v6.x 强壮性 A6) ====================

/**
 * 检测父-子边中的环路
 *
 * 背景：当前数据模型理论上 parent-child 边可以构成环路：
 *   A → B（父子边，B 是 A 的儿子）
 *   B → A（父子边，A 是 B 的儿子）
 * 此时 dagre / elkjs / compactBox 都会因找不到根节点而挂掉或退化为错乱布局。
 *
 * 算法：DFS 颜色标记
 * - 0（WHITE）：未访问
 * - 1（GRAY） ：正在访问（在当前 DFS 栈上）
 * - 2（BLACK）：访问完毕（已离开）
 * 遇到 GRAY 点 = 找到回边 = 存在环路。
 *
 * 复杂度：O(V + E)
 *
 * @param edges      所有 parent-child 边
 * @param nodeMap    节点查找表（用于：1) 跳过 spouse 边 / 虚拟节点；2) 节点存在性校验）
 * @returns          { hasCycle, cyclePath? } - cyclePath 是环路节点 id 序列（含头尾重复）
 *
 * 注意：本函数不区分虚拟节点 / 真实节点，因为：
 * - 虚拟节点（virtualSpouse=true）不参与父子关系，无 parent-child 边出入
 * - 边经过 expandSpouseToVirtualNodes 后新增的 fromVirtualSpouse 边同样不会形成环路
 *   （main → virt → spouseId，virt 是叶子）
 * 因此直接对真实 parent-child 边做检测即可。
 */
export function detectCycle(
    edges: LayoutEdge[],
    nodeMap: Map<string, LayoutNode>,
): { hasCycle: boolean; cyclePath?: string[] } {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parentInChain = new Map<string, string | null>();

  // 初始化颜色：所有已知节点为 WHITE
  for (const id of nodeMap.keys()) {
    color.set(id, WHITE);
    parentInChain.set(id, null);
  }

  // 邻接表：仅 parent-child 边
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== 'parent-child') continue;
    if (!children.has(edge.source)) children.set(edge.source, []);
    children.get(edge.source)!.push(edge.target);
  }

  /**
   * DFS：在环路上定位路径
   * 返回 true 表示找到环路（此时 cyclePath 已被赋值）
   */
  const dfs = (u: string): boolean => {
    color.set(u, GRAY);
    const kids = children.get(u) || [];
    for (const v of kids) {
      // 防御性：跳过未在 nodeMap 中的目标（如上游数据漏报）
      if (!color.has(v)) continue;
      if (color.get(v) === GRAY) {
        // 找到回边：回溯 parentInChain 重建环路路径
        const path = [v, u];
        let cur: string | null = u;
        while (cur !== null && cur !== v) {
          cur = parentInChain.get(cur) ?? null;
          if (cur !== null) path.push(cur);
        }
        // path 此时为 [v, u, ..., cur]，还需要加入 v 形成闭环
        path.reverse();
        path.push(v);
        foundCyclePath = path;
        return true;
      }
      if (color.get(v) === WHITE) {
        parentInChain.set(v, u);
        if (dfs(v)) return true;
      }
    }
    color.set(u, BLACK);
    return false;
  };

  let foundCyclePath: string[] | undefined;

  for (const id of nodeMap.keys()) {
    if (color.get(id) === WHITE) {
      if (dfs(id)) {
        return { hasCycle: true, cyclePath: foundCyclePath };
      }
    }
  }

  return { hasCycle: false };
}