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
 * - 取组内最小 X 作为锚点 + 当前兄弟间距（中位数）作平均间距
 *   → 不破坏已对齐的父节点中心 X（anchor 来自子节点组内 minX）
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

  const nodeSep = typeof config.nodeSep === 'number' ? config.nodeSep : 24;

  for (const [, childEdges] of childrenByParent) {
    // 仅处理至少有一条指定了 birthOrder 的组
    const withBO = childEdges.filter((e) => e.birthOrder != null);
    if (withBO.length === 0) continue;

    // 收集有 birthOrder 的子节点当前 X
    const ordered = [...withBO].sort((a, b) => (a.birthOrder ?? 0) - (b.birthOrder ?? 0));
    const xs = ordered.map((e) => positions.get(e.target)?.x).filter((x): x is number => x !== undefined);
    if (xs.length < 2) continue;

    // 计算原顺序的兄弟间距（中位数）
    const gaps: number[] = [];
    for (let i = 1; i < xs.length; i++) {
      gaps.push(Math.abs(xs[i] - xs[i - 1]));
    }
    const avgGap = gaps.length > 0
      ? gaps.reduce((a, b) => a + b, 0) / gaps.length
      : (nodeSep + 64); // 64 = 默认 nodeWidth

    // 取最小 X 作为锚点
    const minX = Math.min(...xs);
    // 按 birthOrder 升序重新分配 X
    for (let i = 0; i < ordered.length; i++) {
      const pos = positions.get(ordered[i].target);
      if (pos) pos.x = minX + i * avgGap;
    }
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

      // 继子女子树：从配偶节点正下方延伸，以配偶卡片中心为轴
      const spouseChildren = childrenByParent.get(spouseId) || [];
      if (spouseChildren.length > 0) {
        layoutSpouseSubtree(
          spouseId,
          spouseCenterX,
          mainPos.y + rankSep,
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

    layoutSpouseSubtree(
      childId,
      currentX + childWidth / 2,
      y + rankSep,
      nodePositions,
      nodeMap,
      childrenByParent,
      config,
      rankSep,
      nodeSep,
    );

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