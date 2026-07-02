/**
 * 族谱树布局引擎 v3 - Reingold-Tilford 轮廓算法
 *
 * 核心算法：经典 RT 树形布局，通过子树轮廓逐层比较保证无重叠且最紧凑。
 *
 * 改进点：
 * 1. RT 轮廓合并：后序遍历计算子树左右轮廓，合并时逐层比较推离距离
 * 2. 边交叉最小化：同父子节点按子树重心（median X）排序
 * 3. 继子女支持：配偶节点可作为 parent，其子树从配偶向下延伸
 * 4. 主脉后处理对齐：RT 布局后将主脉节点向垂直中线平移
 * 5. 性能优化：O(n) 时间复杂度，Map 缓存节点查找
 */

import type {
  LayoutNode,
  LayoutEdge,
  LayoutResult,
  NodePosition,
  ViewportConfig,
  LayoutConfig,
  LayoutOptions,
  BoundingBox,
} from '@/types/layout';
import { DEFAULT_LAYOUT_CONFIG } from '@/types/layout';

// ==================== 轮廓数据结构 ====================

/**
 * 子树轮廓：相对于子树根节点中心
 * key: 深度（根节点为 0）
 * value: 该层最左/最右 X 坐标
 */
interface SubtreeContour {
  left: Map<number, number>;
  right: Map<number, number>;
}

// ==================== 工具函数 ====================

function getBoundingBox(nodes: NodePosition[]): BoundingBox {
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

/**
 * 计算两个相邻子树之间的最小推离距离
 * 比较"左侧子树的右轮廓"与"右侧子树的左轮廓"
 * 返回右侧子树根节点的最小 X 偏移（相对于左侧子树根节点）
 */
function computeShift(
  leftRightContour: Map<number, number>,
  rightLeftContour: Map<number, number>,
  minSep: number,
): number {
  let maxShift = 0;
  for (const [depth, rightX] of leftRightContour) {
    const leftX = rightLeftContour.get(depth);
    if (leftX !== undefined) {
      const shift = rightX + minSep - leftX;
      if (shift > maxShift) maxShift = shift;
    }
  }
  return maxShift;
}

/**
 * 合并轮廓：将新轮廓并入累积轮廓
 * leftContour 取最小值，rightContour 取最大值
 */
function mergeContour(
  accumulated: Map<number, number>,
  incoming: Map<number, number>,
  offset: number,
  takeMax: boolean,
): void {
  for (const [depth, x] of incoming) {
    const newVal = x + offset;
    const existing = accumulated.get(depth);
    if (existing === undefined) {
      accumulated.set(depth, newVal);
    } else if (takeMax) {
      if (newVal > existing) accumulated.set(depth, newVal);
    } else {
      if (newVal < existing) accumulated.set(depth, newVal);
    }
  }
}

// ==================== 布局引擎类 ====================

export class LayoutEngine {
  private config: LayoutConfig;
  private canvasSize: { width: number; height: number };
  /** computeSubtreeWidth 记忆化缓存（单次布局运行中有效） */
  private _subtreeWidthCache = new Map<string, number>();

  constructor(options: LayoutOptions) {
    this.canvasSize = options.canvasSize;
    this.config = { ...DEFAULT_LAYOUT_CONFIG, ...options.config };
  }

  updateConfig(config: Partial<LayoutConfig>) {
    this.config = { ...this.config, ...config };
  }

  updateCanvasSize(size: { width: number; height: number }) {
    this.canvasSize = size;
  }

  /**
   * 主入口：计算布局
   */
  calculateLayout(
    nodes: LayoutNode[],
    edges: LayoutEdge[],
  ): LayoutResult {
    const config = this.config;

    // 1. 构建节点查找表
    const nodeMap = new Map<string, LayoutNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    // 2. 识别配偶节点
    const spouseNodeIds = new Set<string>();
    for (const node of nodes) {
      if ((node.generation ?? 0) < 0) {
        spouseNodeIds.add(node.id);
      }
    }

    // 3. 构建父子邻接表（配偶节点也可作为 parent，支持继子女）
    const childrenByParent = new Map<string, string[]>();
    const parentOf = new Map<string, string>();

    for (const edge of edges) {
      if (edge.kind === 'spouse') continue;
      if (!childrenByParent.has(edge.source)) {
        childrenByParent.set(edge.source, []);
      }
      childrenByParent.get(edge.source)!.push(edge.target);
      parentOf.set(edge.target, edge.source);
    }

    // 4. 找根节点
    const roots = nodes.filter(n => !parentOf.has(n.id) && !spouseNodeIds.has(n.id));
    if (roots.length === 0) {
      const fallback = nodes.find(n => !spouseNodeIds.has(n.id));
      if (fallback) roots.push(fallback);
    }

    // 5. 计算间距
    const maxGeneration = this.computeMaxGeneration(childrenByParent, roots);
    const nodeSep = config.nodeSep === 'auto'
      ? this.computeAutoNodeSep(nodes.length, maxGeneration)
      : config.nodeSep;
    const rankSep = config.rankSep === 'auto'
      ? this.computeAutoRankSep(config.nodeHeight)
      : config.rankSep;

    // 6. 预计算配偶映射和宽度
    const spouseByMain = this.buildSpouseMap(edges, spouseNodeIds);
    const spouseWidthByMain = this.computeSpouseWidths(spouseByMain, nodeMap, childrenByParent);

    // 7. RT 核心算法：后序遍历计算子树轮廓和子节点偏移
    const childOffsets = new Map<string, Map<string, number>>(); // parentId -> (childId -> offset)
    const subtreeContours = new Map<string, SubtreeContour>();
    const subtreeCentroids = new Map<string, number>(); // 子树重心（用于排序）

    const layoutSubtree = (nodeId: string): SubtreeContour => {
      if (subtreeContours.has(nodeId)) return subtreeContours.get(nodeId)!;

      const node = nodeMap.get(nodeId);
      if (!node) {
        return { left: new Map(), right: new Map() };
      }

      const children = childrenByParent.get(nodeId) || [];
      const spouseExt = spouseWidthByMain.get(nodeId) ?? 0;

      if (children.length === 0) {
        // 叶子节点轮廓（含配偶延伸宽度）
        const contour: SubtreeContour = {
          left: new Map([[0, -node.width / 2]]),
          right: new Map([[0, node.width / 2 + spouseExt]]),
        };
        subtreeContours.set(nodeId, contour);
        subtreeCentroids.set(nodeId, 0);
        return contour;
      }

      // 递归处理子节点
      for (const child of children) {
        layoutSubtree(child);
      }

      // 按子树重心排序（边交叉最小化）
      const sortedChildren = [...children].sort((a, b) => {
        const ca = subtreeCentroids.get(a) ?? 0;
        const cb = subtreeCentroids.get(b) ?? 0;
        return ca - cb;
      });

      // 从左到右合并子树
      const offsets = new Map<string, number>();
      const mergedLeft = new Map<number, number>();
      const mergedRight = new Map<number, number>();

      for (let i = 0; i < sortedChildren.length; i++) {
        const childId = sortedChildren[i];
        const childContour = subtreeContours.get(childId)!;

        if (i === 0) {
          offsets.set(childId, 0);
          for (const [d, x] of childContour.left) mergedLeft.set(d, x);
          for (const [d, x] of childContour.right) mergedRight.set(d, x);
        } else {
          // 计算推离距离（绝对位置相对于 x=0）
          const shift = computeShift(mergedRight, childContour.left, nodeSep);
          offsets.set(childId, shift);

          // 合并轮廓
          mergeContour(mergedLeft, childContour.left, shift, false);
          mergeContour(mergedRight, childContour.right, shift, true);
        }
      }

      // 计算子节点区域中心，使父节点居中
      // 基于子节点自身宽度（不含配偶延伸），避免配偶宽度不对称导致父节点偏移
      let minCenter = Infinity, maxCenter = -Infinity;
      for (const childId of sortedChildren) {
        const childNode = nodeMap.get(childId);
        const center = offsets.get(childId)!;
        const halfW = (childNode?.width ?? this.config.nodeWidth) / 2;
        minCenter = Math.min(minCenter, center - halfW);
        maxCenter = Math.max(maxCenter, center + halfW);
      }
      const childrenCenter = minCenter < Infinity ? (minCenter + maxCenter) / 2 : 0;

      // 调整偏移使父节点在 x=0
      const adjustedOffsets = new Map<string, number>();
      for (const [childId, offset] of offsets) {
        adjustedOffsets.set(childId, offset - childrenCenter);
      }
      childOffsets.set(nodeId, adjustedOffsets);

      // 构建当前节点的轮廓（相对于当前节点中心 x=0）
      const contour: SubtreeContour = {
        left: new Map([[0, -node.width / 2]]),
        right: new Map([[0, node.width / 2 + spouseExt]]),
      };

      // 向下延伸的子树轮廓
      for (const [d, x] of mergedLeft) {
        const depth = d + 1;
        const newVal = x - childrenCenter;
        const existing = contour.left.get(depth);
        if (existing === undefined || newVal < existing) {
          contour.left.set(depth, newVal);
        }
      }
      for (const [d, x] of mergedRight) {
        const depth = d + 1;
        const newVal = x - childrenCenter;
        const existing = contour.right.get(depth);
        if (existing === undefined || newVal > existing) {
          contour.right.set(depth, newVal);
        }
      }

      subtreeContours.set(nodeId, contour);
      // 子树重心 = 子节点区域中心（相对于当前节点）
      subtreeCentroids.set(nodeId, childrenCenter);
      return contour;
    };

    // 后序遍历所有根节点
    for (const root of roots) {
      layoutSubtree(root.id);
    }

    // 8. 前序遍历分配绝对坐标
    const nodePositions = new Map<string, NodePosition>();

    const assignCoordinates = (nodeId: string, x: number, y: number) => {
      const node = nodeMap.get(nodeId);
      if (!node) return;

      nodePositions.set(nodeId, {
        id: nodeId,
        x,
        y,
        width: node.width,
        height: node.height,
      });

      const offsets = childOffsets.get(nodeId);
      if (!offsets) return;

      for (const [childId, offset] of offsets) {
        assignCoordinates(childId, x + offset, y + rankSep);
      }
    };

    // 从根节点开始分配坐标
    let currentRootX = 0;
    for (const root of roots) {
      const rootContour = subtreeContours.get(root.id);
      let rootWidth = root.width;
      if (rootContour) {
        let minL = Infinity, maxR = -Infinity;
        for (const x of rootContour.left.values()) minL = Math.min(minL, x);
        for (const x of rootContour.right.values()) maxR = Math.max(maxR, x);
        rootWidth = maxR - minL;
      }
      assignCoordinates(root.id, currentRootX + rootWidth / 2, 0);
      currentRootX += rootWidth + nodeSep * 5;
    }

    // 9. 处理配偶节点（含继子女子树）
    if (config.spouseOptimization) {
      this.positionSpouseNodes(nodePositions, nodeMap, spouseByMain, edges, childrenByParent, rankSep, nodeSep);
    }

    // 10. 主脉后处理对齐
    if (config.mainLineageCenter) {
      this.alignMainLineage(nodePositions, nodeMap, spouseByMain, childrenByParent);
    }

    // 11. 计算正交路由点
    this.computeOrthogonalEdgePaths(nodePositions, edges);

    // 12. 整体平移使布局居中
    const positions = Array.from(nodePositions.values());
    const bounds = getBoundingBox(positions);
    const contentWidth = bounds.maxX - bounds.minX;
    const offsetX = -bounds.minX - contentWidth / 2;

    for (const [, pos] of nodePositions) {
      pos.x += offsetX;
    }

    const finalPositions = Array.from(nodePositions.values());
    const finalBounds = getBoundingBox(finalPositions);

    return {
      nodes: finalPositions,
      edges,
      bounds: finalBounds,
      generations: maxGeneration + 1,
      totalNodes: nodes.length,
    };
  }

  /**
   * 构建配偶映射
   */
  private buildSpouseMap(
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
   */
  private computeSpouseWidths(
    spouseByMain: Map<string, LayoutEdge[]>,
    nodeMap: Map<string, LayoutNode>,
    childrenByParent: Map<string, string[]>,
  ): Map<string, number> {
    const result = new Map<string, number>();
    for (const [mainId, mainSpouseEdges] of spouseByMain) {
      let totalWidth = 0;
      for (const edge of mainSpouseEdges) {
        const spouseId = edge.source === mainId ? edge.target : edge.source;
        const spouseNode = nodeMap.get(spouseId);
        const spouseW = spouseNode?.width ?? this.config.nodeWidth;
        const subtreeW = this.computeSubtreeWidth(spouseId, nodeMap, childrenByParent);
        totalWidth += Math.max(spouseW, subtreeW) + this.config.spouseGap;
      }
      result.set(mainId, totalWidth);
    }
    return result;
  }

  /**
   * 递归计算子树宽度（用于继子女避让）
   */
  private computeSubtreeWidth(
    nodeId: string,
    nodeMap: Map<string, LayoutNode>,
    childrenByParent: Map<string, string[]>,
    depth = 0,
  ): number {
    if (depth > 20) return 0;

    // 记忆化：相同 nodeId 的结果在单次布局中不变
    const cached = this._subtreeWidthCache.get(nodeId);
    if (cached !== undefined) return cached;

    const children = childrenByParent.get(nodeId) || [];
    if (children.length === 0) return 0;
    let totalWidth = 0;
    for (let i = 0; i < children.length; i++) {
      const childNode = nodeMap.get(children[i]);
      const childW = Number(childNode?.width ?? this.config.nodeWidth);
      const subW = Number(this.computeSubtreeWidth(children[i], nodeMap, childrenByParent, depth + 1));
      totalWidth += Math.max(childW, subW);
      if (i < children.length - 1) totalWidth += Number(this.config.nodeSep);
    }
    this._subtreeWidthCache.set(nodeId, totalWidth);
    return totalWidth;
  }

  /**
   * 配偶节点定位（含继子女子树）
   */
  private positionSpouseNodes(
    nodePositions: Map<string, NodePosition>,
    nodeMap: Map<string, LayoutNode>,
    spouseByMain: Map<string, LayoutEdge[]>,
    edges: LayoutEdge[],
    childrenByParent: Map<string, string[]>,
    rankSep: number,
    nodeSep: number,
  ) {
    const spouseGap = this.config.spouseGap;

    for (const [mainId, mainSpouseEdges] of spouseByMain) {
      const mainPos = nodePositions.get(mainId);
      if (!mainPos) continue;

      mainSpouseEdges.sort((a, b) => (a.marriageOrder ?? 0) - (b.marriageOrder ?? 0));

      let currentX = mainPos.x + mainPos.width / 2 + spouseGap;
      let totalSpouseWidth = 0;

      for (let i = 0; i < mainSpouseEdges.length; i++) {
        const edge = mainSpouseEdges[i];
        const spouseId = edge.source === mainId ? edge.target : edge.source;
        const spouseNode = nodeMap.get(spouseId);
        const spouseWidth = spouseNode?.width ?? this.config.nodeWidth;
        const spouseHeight = spouseNode?.height ?? this.config.nodeHeight;

        const spouseCenterX = currentX + spouseWidth / 2;

        nodePositions.set(spouseId, {
          id: spouseId,
          x: spouseCenterX,
          y: mainPos.y,
          width: spouseWidth,
          height: spouseHeight,
        });

        // 配偶边路径
        const mainRightEdge = mainPos.x + mainPos.width / 2;
        const spouseLeftEdge = spouseCenterX - spouseWidth / 2;
        const sourceIsMain = edge.source === mainId;
        edge.path = {
          points: sourceIsMain
            ? [
                { x: mainRightEdge, y: mainPos.y },
                { x: spouseLeftEdge, y: mainPos.y },
              ]
            : [
                { x: spouseLeftEdge, y: mainPos.y },
                { x: mainRightEdge, y: mainPos.y },
              ],
          type: 'orth',
        };

        // 继子女子树：从配偶节点向下延伸
        const spouseChildren = childrenByParent.get(spouseId) || [];
        if (spouseChildren.length > 0) {
          this.layoutSpouseSubtree(spouseId, spouseCenterX, mainPos.y + rankSep, nodePositions, nodeMap, childrenByParent, rankSep, nodeSep);
        }

        totalSpouseWidth += spouseWidth + (i < mainSpouseEdges.length - 1 ? spouseGap : 0);
        currentX += spouseWidth + spouseGap;
      }

      // 更新主节点有效宽度
      const mainPos2 = nodePositions.get(mainId);
      if (mainPos2) {
        mainPos2.effectiveWidth = mainPos2.width + totalSpouseWidth + spouseGap;
      }
    }
  }

  /**
   * 布局配偶的子树（继子女）
   * 使用简单的居中布局，子节点在配偶节点下方
   */
  private layoutSpouseSubtree(
    spouseId: string,
    centerX: number,
    y: number,
    nodePositions: Map<string, NodePosition>,
    nodeMap: Map<string, LayoutNode>,
    childrenByParent: Map<string, string[]>,
    rankSep: number,
    nodeSep: number,
  ) {
    const children = childrenByParent.get(spouseId) || [];
    if (children.length === 0) return;

    // 计算子节点总宽度
    let totalWidth = 0;
    for (let i = 0; i < children.length; i++) {
      const childNode = nodeMap.get(children[i]);
      totalWidth += childNode?.width ?? this.config.nodeWidth;
      if (i < children.length - 1) totalWidth += nodeSep;
    }

    // 居中排列
    let currentX = centerX - totalWidth / 2;
    for (const childId of children) {
      const childNode = nodeMap.get(childId);
      const childWidth = childNode?.width ?? this.config.nodeWidth;
      const childHeight = childNode?.height ?? this.config.nodeHeight;

      nodePositions.set(childId, {
        id: childId,
        x: currentX + childWidth / 2,
        y,
        width: childWidth,
        height: childHeight,
      });

      // 递归布局继子女的子树
      this.layoutSpouseSubtree(childId, currentX + childWidth / 2, y + rankSep, nodePositions, nodeMap, childrenByParent, rankSep, nodeSep);

      currentX += childWidth + nodeSep;
    }
  }

  /**
   * 主脉后处理对齐
   * 将主脉节点向垂直中线平移，同步平移配偶、继子女和非主脉子树
   */
  private alignMainLineage(
    nodePositions: Map<string, NodePosition>,
    nodeMap: Map<string, LayoutNode>,
    spouseByMain: Map<string, LayoutEdge[]>,
    childrenByParent: Map<string, string[]>,
  ) {
    // 收集所有主脉节点，按代际排序（父先于子，避免双重平移）
    const mainLineageNodes: { id: string; gen: number }[] = [];
    for (const [id, node] of nodeMap) {
      if (node.isMainLineage && (node.generation ?? 0) >= 0) {
        mainLineageNodes.push({ id, gen: node.generation ?? 0 });
      }
    }

    if (mainLineageNodes.length === 0) return;

    mainLineageNodes.sort((a, b) => a.gen - b.gen);

    // 计算主脉节点的平均 X
    let sumX = 0;
    for (const { id } of mainLineageNodes) {
      const pos = nodePositions.get(id);
      if (pos) sumX += pos.x;
    }
    const avgX = sumX / mainLineageNodes.length;

    // 收集主脉节点 ID 集合，用于跳过非主脉子树遍历
    const mainNodeIds = new Set(mainLineageNodes.map(n => n.id));

    // 对每个主脉节点：平移自身 + 配偶 + 继子女 + 非主脉子树
    for (const { id } of mainLineageNodes) {
      const pos = nodePositions.get(id);
      if (!pos) continue;

      const dx = avgX - pos.x;
      if (Math.abs(dx) < 1) continue;

      // 平移主脉节点本身
      pos.x += dx;

      // 平移配偶及继子女子树
      const spouseEdges = spouseByMain.get(id) || [];
      for (const edge of spouseEdges) {
        const spouseId = edge.source === id ? edge.target : edge.source;
        const spousePos = nodePositions.get(spouseId);
        if (spousePos) spousePos.x += dx;

        // 平移继子女子树（配偶作为 parent 的子代）
        this.shiftNonMainSubtree(spouseId, dx, nodePositions, childrenByParent, spouseByMain, mainNodeIds);
      }

      // 平移非主脉子树（主脉子节点由后续迭代单独处理）
      this.shiftNonMainSubtree(id, dx, nodePositions, childrenByParent, spouseByMain, mainNodeIds);
    }
  }

  /**
   * 平移非主脉子树（跳过主脉后代，避免重复平移）
   * 同时同步平移子树中每个节点的配偶及继子女子树
   */
  private shiftNonMainSubtree(
    parentId: string,
    dx: number,
    nodePositions: Map<string, NodePosition>,
    childrenByParent: Map<string, string[]>,
    spouseByMain: Map<string, LayoutEdge[]>,
    mainNodeIds: Set<string>,
  ) {
    const children = childrenByParent.get(parentId) || [];
    for (const childId of children) {
      // 主脉子节点跳过（有自己的平移）
      if (mainNodeIds.has(childId)) continue;

      const childPos = nodePositions.get(childId);
      if (childPos) childPos.x += dx;

      // 同步平移该子节点的配偶及继子女子树
      const childSpouseEdges = spouseByMain.get(childId) || [];
      for (const edge of childSpouseEdges) {
        const spouseId = edge.source === childId ? edge.target : edge.source;
        const spousePos = nodePositions.get(spouseId);
        if (spousePos) spousePos.x += dx;
        this.shiftNonMainSubtree(spouseId, dx, nodePositions, childrenByParent, spouseByMain, mainNodeIds);
      }

      // 递归平移子节点的子树
      this.shiftNonMainSubtree(childId, dx, nodePositions, childrenByParent, spouseByMain, mainNodeIds);
    }
  }

  /**
   * 计算最大代际
   */
  private computeMaxGeneration(
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

  /**
   * 自动计算节点间距
   */
  private computeAutoNodeSep(totalNodes: number, generations: number): number {
    const avgNodesPerGen = totalNodes / Math.max(generations, 1);
    const nodeW = this.config.nodeWidth;
    if (avgNodesPerGen < 5) return Math.max(16, nodeW * 0.25);
    if (avgNodesPerGen < 20) return Math.max(12, nodeW * 0.19);
    return Math.max(10, nodeW * 0.13);
  }

  /**
   * 自动计算代际间距
   */
  private computeAutoRankSep(nodeHeight: number): number {
    return nodeHeight + 100;
  }

  /**
   * 计算正交路由点（T 形连线）
   */
  private computeOrthogonalEdgePaths(
    nodePositions: Map<string, NodePosition>,
    edges: LayoutEdge[],
  ) {
    const childrenByParent = new Map<string, LayoutEdge[]>();
    for (const edge of edges) {
      if (edge.kind === 'spouse') continue;
      if (!childrenByParent.has(edge.source)) childrenByParent.set(edge.source, []);
      childrenByParent.get(edge.source)!.push(edge);
    }

    for (const [parentId, childEdges] of childrenByParent) {
      const parentPos = nodePositions.get(parentId);
      if (!parentPos || childEdges.length === 0) continue;

      const parentBottomX = parentPos.x;
      const parentBottomY = parentPos.y + parentPos.height / 2;

      if (childEdges.length === 1) {
        const childPos = nodePositions.get(childEdges[0].target);
        if (!childPos) continue;
        const childTopX = childPos.x;
        const childTopY = childPos.y - childPos.height / 2;

        if (parentBottomX === childTopX) {
          childEdges[0].path = {
            points: [
              { x: parentBottomX, y: parentBottomY },
              { x: childTopX, y: childTopY },
            ],
            type: 'orth',
          };
        } else {
          childEdges[0].path = {
            points: [
              { x: parentBottomX, y: parentBottomY },
              { x: parentBottomX, y: childTopY },
              { x: childTopX, y: childTopY },
            ],
            type: 'orth',
          };
        }
      } else {
        const childPositions = childEdges
          .map(e => ({ edge: e, pos: nodePositions.get(e.target) }))
          .filter(({ pos }) => pos !== undefined)
          .map(({ edge, pos }) => ({ edge, pos: pos! }));

        if (childPositions.length === 0) continue;

        const firstChildTopY = Math.min(...childPositions.map(c => c.pos.y - c.pos.height / 2));
        const branchY = parentBottomY + (firstChildTopY - parentBottomY) * 0.5;

        for (const { edge, pos } of childPositions) {
          const childTopX = pos.x;
          const childTopY = pos.y - pos.height / 2;

          edge.path = {
            points: [
              { x: parentBottomX, y: parentBottomY },
              { x: parentBottomX, y: branchY },
              { x: childTopX, y: branchY },
              { x: childTopX, y: childTopY },
            ],
            type: 'orth',
          };
        }
      }
    }
  }

  /**
   * 自适应缩放
   */
  autoFit(layout: LayoutResult): ViewportConfig {
    const { bounds } = layout;
    const { width: canvasW, height: canvasH } = this.canvasSize;
    const padding = this.config.autoFit.padding;

    const contentW = bounds.maxX - bounds.minX;
    const contentH = bounds.maxY - bounds.minY;

    // 计算缩放：无论 TB/LR 方向，content 的 X 跨度适配 canvas 宽度，Y 跨度适配 canvas 高度
    const scaleX = (canvasW - padding * 2) / contentW;
    const scaleY = (canvasH - padding * 2) / contentH;
    let zoom = Math.min(scaleX, scaleY);

    zoom = Math.max(this.config.autoFit.minZoom, Math.min(this.config.autoFit.maxZoom, zoom));

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    // 保留 layoutDirection 供调用方区分 TB/LR（不再用于缩放计算）
    let direction: 'TB' | 'LR' = 'TB';
    if (this.config.autoFit.preferDirection === 'auto') {
      direction = contentW > contentH ? 'LR' : 'TB';
    } else {
      direction = this.config.autoFit.preferDirection;
    }

    return { zoom, centerX, centerY, layoutDirection: direction };
  }
}
