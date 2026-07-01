/**
 * 族谱树自适应布局引擎
 * 
 * 核心功能：
 * 1. 基于代际的层次布局算法
 * 2. 同代节点水平对齐
 * 3. 主脉节点居中排列
 * 4. 智能计算节点间距
 * 5. 配偶节点优化定位
 * 6. 自适应缩放和视口适配
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
  Point,
} from '@/types/layout';
import { DEFAULT_LAYOUT_CONFIG } from '@/types/layout';

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

// ==================== 布局引擎类 ====================

export class LayoutEngine {
  private config: LayoutConfig;
  private canvasSize: { width: number; height: number };

  constructor(options: LayoutOptions) {
    this.canvasSize = options.canvasSize;
    this.config = { ...DEFAULT_LAYOUT_CONFIG, ...options.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<LayoutConfig>) {
    this.config = { ...this.config, ...config };
  }

  /**
   * 更新画布尺寸
   */
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
    
    // 1. 计算代际信息（优先使用节点自带的 generation，回退到从边计算）
    const hasPrecomputedGen = nodes.some(n => n.generation !== undefined && n.generation > 0);
    
    const generationMap = hasPrecomputedGen
      ? new Map(nodes.map(n => [n.id, n.generation ?? 0]))
      : this.computeGenerations(nodes, edges);
    const maxGeneration = Math.max(...generationMap.values(), 0);
    
    // 2. 按代际分组（跳过 generation < 0 的配偶节点）
    const byGeneration = new Map<number, LayoutNode[]>();
    const spouseNodes = nodes.filter(n => (generationMap.get(n.id) ?? 0) < 0);
    
    for (const node of nodes) {
      const gen = generationMap.get(node.id) ?? 0;
      if (gen < 0) continue; // 跳过配偶节点
      if (!byGeneration.has(gen)) byGeneration.set(gen, []);
      byGeneration.get(gen)!.push(node);
    }
    
    // 2.5 预计算每个主节点的配偶总宽度（用于布局时预留空间）
    // 缓存结果供 positionSpouseNodes 复用，避免重复遍历
    const spouseNodeIds = new Set(spouseNodes.map(n => n.id));
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
    // 计算每个主节点的配偶总宽度
    const mainNodeSpouseWidth = new Map<string, number>();
    for (const [mainId, mainSpouseEdges] of spouseByMain) {
      let totalWidth = 0;
      for (let i = 0; i < mainSpouseEdges.length; i++) {
        const edge = mainSpouseEdges[i];
        const spouseId = spouseNodeIds.has(edge.source) ? edge.source : edge.target;
        const spouseNode = spouseNodes.find(n => n.id === spouseId);
        totalWidth += (spouseNode?.width ?? config.nodeWidth) + config.spouseGap;
      }
      mainNodeSpouseWidth.set(mainId, totalWidth);
    }
    
    // 3. 计算间距
    const nodeSep = config.nodeSep === 'auto' 
      ? this.computeAutoNodeSep(nodes.length, maxGeneration) 
      : config.nodeSep;
    const rankSep = config.rankSep === 'auto'
      ? this.computeAutoRankSep(config.nodeHeight)
      : config.rankSep;
    
    // 4. 计算整代总宽度（用于全局居中）
    const genTotalWidths = new Map<number, number>();
    for (const [gen, genNodes] of byGeneration) {
      const mainNodes = genNodes.filter(n => n.isMainLineage);
      const sideNodes = genNodes.filter(n => !n.isMainLineage);
      const mainW = mainNodes.reduce((s, n) => s + n.width, 0) + Math.max(0, mainNodes.length - 1) * nodeSep;
      // 主脉右侧配偶最大延伸
      let maxSpouseExt = 0;
      for (const mn of mainNodes) {
        const sw = mainNodeSpouseWidth.get(mn.id) ?? 0;
        if (sw > maxSpouseExt) maxSpouseExt = sw;
      }
      const mainRightPad = maxSpouseExt + nodeSep;
      const sideW = sideNodes.reduce((s, n) => s + n.width, 0) + Math.max(0, sideNodes.length - 1) * nodeSep;
      genTotalWidths.set(gen, mainW + mainRightPad + sideW);
    }
    
    // 5. 布局计算
    const nodePositions = new Map<string, NodePosition>();
    
    for (const [gen, genNodes] of byGeneration) {
      // 主脉节点放中间，旁系对称分布
      const mainNodes = genNodes.filter(n => n.isMainLineage);
      const sideNodes = genNodes.filter(n => !n.isMainLineage);
      
      // 排序旁系节点（按原始 x 位置）
      sideNodes.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
      
      // 计算主脉节点的总宽度（含配偶预留空间）
      const mainTotalWidth = mainNodes.reduce((sum, n) => sum + n.width, 0);
      const mainGaps = Math.max(0, mainNodes.length - 1) * nodeSep;
      const mainWidth = mainTotalWidth + mainGaps;
      
      // 计算主脉右侧配偶占用的最大延伸宽度（用于旁系节点避让）
      let maxSpouseExtension = 0;
      for (const mainNode of mainNodes) {
        const spouseW = mainNodeSpouseWidth.get(mainNode.id) ?? 0;
        if (spouseW > maxSpouseExtension) maxSpouseExtension = spouseW;
      }
      // 主脉右侧需要额外留出的空间 = 配偶总宽度 + 间距
      const mainRightPadding = maxSpouseExtension + nodeSep;
      
      // 全局居中：以整代总宽度为基准，左右对称
      const totalGenWidth = genTotalWidths.get(gen) ?? mainWidth;
      const globalCenterX = -totalGenWidth / 2;
      
      // 主脉起始位置：全局中心偏左半个主脉宽度
      const mainStartX = globalCenterX - mainWidth / 2;
      
      // 先放置主脉节点
      let mainX = mainStartX;
      for (const node of mainNodes) {
        nodePositions.set(node.id, {
          id: node.id,
          x: mainX + node.width / 2,
          y: gen * rankSep,
          width: node.width,
          height: node.height,
        });
        mainX += node.width + nodeSep;
      }
      
      // 旁系节点：以主脉为界，左右对称分布
      const halfCount = Math.ceil(sideNodes.length / 2);
      const leftNodes = sideNodes.slice(0, halfCount);
      const rightNodes = sideNodes.slice(halfCount);
      
      // 左侧节点：紧贴主脉左侧向左排列
      let leftX = mainStartX - nodeSep;
      for (let i = leftNodes.length - 1; i >= 0; i--) {
        const node = leftNodes[i];
        leftX -= node.width;
        nodePositions.set(node.id, {
          id: node.id,
          x: leftX + node.width / 2,
          y: gen * rankSep,
          width: node.width,
          height: node.height,
        });
        leftX -= nodeSep;
      }
      
      // 右侧节点：跳过主脉配偶占用的空间
      let rightX = mainStartX + mainWidth + mainRightPadding;
      for (const node of rightNodes) {
        nodePositions.set(node.id, {
          id: node.id,
          x: rightX + node.width / 2,
          y: gen * rankSep,
          width: node.width,
          height: node.height,
        });
        rightX += node.width + nodeSep;
      }
    }
    
    // 6. 处理配偶节点（包括外部配偶和已在树中的配偶）
    if (config.spouseOptimization) {
      this.positionSpouseNodes(nodePositions, spouseNodes, spouseByMain);
    }
    
    // 7. 计算正交路由点（父子边：从父节点底部中心垂直向下，再水平分叉到各子节点顶部中心）
    this.computeOrthogonalEdgePaths(nodePositions, edges);
    
    // 8. 计算边界
    const positions = Array.from(nodePositions.values());
    const bounds = getBoundingBox(positions);
    
    return {
      nodes: positions,
      edges,
      bounds,
      generations: maxGeneration + 1,
      totalNodes: nodes.length,
    };
  }

  /**
   * 计算代际 - 优先从树结构计算，回退到边计算
   */
  private computeGenerations(
    nodes: LayoutNode[],
    edges: LayoutEdge[],
  ): Map<string, number> {
    // 方法1: 从边计算（标准方法）
    const childrenMap = new Map<string, string[]>();
    for (const edge of edges) {
      if (edge.kind === 'spouse') continue;
      if (!childrenMap.has(edge.source)) childrenMap.set(edge.source, []);
      childrenMap.get(edge.source)!.push(edge.target);
    }
    
    // 找根节点（没有父节点的节点）
    const parentSet = new Set<string>();
    for (const edge of edges) {
      if (edge.kind !== 'spouse') {
        parentSet.add(edge.target);
      }
    }
    
    const roots = nodes.filter(n => !parentSet.has(n.id));
    if (roots.length === 0) {
      // 回退：如果没有找到根节点，尝试从 childrenMap 找
      const allTargets = new Set<string>();
      for (const children of childrenMap.values()) {
        for (const child of children) {
          allTargets.add(child);
        }
      }
      const fallbackRoots = nodes.filter(n => !allTargets.has(n.id));
      if (fallbackRoots.length === 0) {
        // 最后回退：所有节点设为第0代
        const fallback = new Map<string, number>();
        for (const node of nodes) {
          fallback.set(node.id, 0);
        }
        return fallback;
      }
      roots.push(...fallbackRoots);
    }
    
    // BFS 分配代际
    const generationMap = new Map<string, number>();
    const queue: { id: string; gen: number }[] = [];
    
    for (const root of roots) {
      generationMap.set(root.id, 0);
      queue.push({ id: root.id, gen: 0 });
    }
    
    while (queue.length > 0) {
      const { id, gen } = queue.shift()!;
      for (const childId of childrenMap.get(id) || []) {
        if (!generationMap.has(childId)) {
          generationMap.set(childId, gen + 1);
          queue.push({ id: childId, gen: gen + 1 });
        }
      }
    }
    
    // 检查是否有未分配的节点（通常是孤立节点或数据错误）
    const unassigned = nodes.filter(n => !generationMap.has(n.id));
    if (unassigned.length > 0) {
      console.warn('[LayoutEngine] 未分配代际的节点（可能为孤立节点）:', unassigned.map(n => n.id));
      // 将未分配的节点设为最大代际 + 1
      const maxGen = Math.max(...generationMap.values(), 0);
      for (const node of unassigned) {
        generationMap.set(node.id, maxGen + 1);
      }
    }
    
    return generationMap;
  }

  /**
   * 自动计算节点间距
   * 基于每代平均节点数和节点宽度动态计算，设置合理下限
   */
  private computeAutoNodeSep(totalNodes: number, generations: number): number {
    const avgNodesPerGen = totalNodes / Math.max(generations, 1);
    const nodeW = this.config.nodeWidth;
    // 间距 = 节点宽度 × 密度系数，最低不低于 10px
    if (avgNodesPerGen < 5) return Math.max(16, nodeW * 0.25);
    if (avgNodesPerGen < 20) return Math.max(12, nodeW * 0.19);
    return Math.max(10, nodeW * 0.13);
  }

  /**
   * 自动计算代际间距
   */
  private computeAutoRankSep(nodeHeight: number): number {
    return nodeHeight + 28; // 节点高度 + 2 字符宽度
  }

  /**
   * 配偶节点定位
   * 将配偶节点放在主节点右侧，按婚姻顺序水平排列
   * 同时扩展主节点的占用宽度，避免与旁系节点重叠
   * 
   * @param spouseByMain 预计算的配偶分组缓存，避免重复遍历
   */
  private positionSpouseNodes(
    nodePositions: Map<string, NodePosition>,
    spouseNodes: LayoutNode[],
    spouseByMain: Map<string, LayoutEdge[]>,
  ) {
    const spouseGap = this.config.spouseGap;
    
    // 构建配偶节点 ID 集合（generation < 0 的节点）
    const spouseNodeIds = new Set(spouseNodes.map(n => n.id));
    
    // 记录每个主节点需要扩展的右侧宽度（包含所有配偶）
    const mainNodeExtraWidth = new Map<string, number>();
    
    // 为每个主节点的配偶分配位置（水平排列在主节点右侧）
    for (const [mainId, mainSpouseEdges] of spouseByMain) {
      const mainPos = nodePositions.get(mainId);
      if (!mainPos) continue;
      
      // 按婚姻顺序排序
      mainSpouseEdges.sort((a, b) => (a.marriageOrder ?? 0) - (b.marriageOrder ?? 0));
      
      // 计算起始 X：主节点右边缘
      let currentX = mainPos.x + mainPos.width / 2 + spouseGap;
      let totalSpouseWidth = 0;
      
      for (let i = 0; i < mainSpouseEdges.length; i++) {
        const edge = mainSpouseEdges[i];
        const spouseId = spouseNodeIds.has(edge.source) ? edge.source : edge.target;
        const spouseNode = spouseNodes.find(n => n.id === spouseId);
        const spouseWidth = spouseNode?.width ?? this.config.nodeWidth;
        const spouseHeight = spouseNode?.height ?? this.config.nodeHeight;
        
        // 配偶节点中心 X = 当前 X + 配偶宽度的一半
        const spouseCenterX = currentX + spouseWidth / 2;
        
        nodePositions.set(spouseId, {
          id: spouseId,
          x: spouseCenterX,
          y: mainPos.y, // 与主节点同一水平线
          width: spouseWidth,
          height: spouseHeight,
        });
        
        // 累计配偶占用的宽度
        totalSpouseWidth += spouseWidth + (i < mainSpouseEdges.length - 1 ? spouseGap : 0);
        
        // 下一个配偶的起始位置
        currentX += spouseWidth + spouseGap;
      }
      
      // 记录主节点需要扩展的宽度（配偶总宽度 + 间距）
      mainNodeExtraWidth.set(mainId, totalSpouseWidth + spouseGap);
    }
    
    // 扩展主节点的视觉占用宽度，避免与旁系节点重叠
    // 使用 effectiveWidth 而非修改原始 width，保持数据不可变性
    for (const [mainId, extraWidth] of mainNodeExtraWidth) {
      const mainPos = nodePositions.get(mainId);
      if (mainPos) {
        mainPos.effectiveWidth = mainPos.width + extraWidth;
      }
    }
  }

  /**
   * 计算正交路由点（父子边：从父节点底部中心垂直向下，再水平分叉到各子节点顶部中心）
   * 产生经典的 "T" 形族谱连线
   */
  private computeOrthogonalEdgePaths(
    nodePositions: Map<string, NodePosition>,
    edges: LayoutEdge[],
  ) {
    // 按父节点分组父子边
    const childrenByParent = new Map<string, LayoutEdge[]>();
    for (const edge of edges) {
      if (edge.kind === 'spouse') continue;
      if (!childrenByParent.has(edge.source)) childrenByParent.set(edge.source, []);
      childrenByParent.get(edge.source)!.push(edge);
    }
    
    for (const [parentId, childEdges] of childrenByParent) {
      const parentPos = nodePositions.get(parentId);
      if (!parentPos || childEdges.length === 0) continue;
      
      // 父节点底部中心
      const parentBottomX = parentPos.x;
      const parentBottomY = parentPos.y + parentPos.height / 2;
      
      if (childEdges.length === 1) {
        // 只有一个子节点：直接连线
        const childPos = nodePositions.get(childEdges[0].target);
        if (!childPos) continue;
        const childTopX = childPos.x;
        const childTopY = childPos.y - childPos.height / 2;
        
        // 父子 X 相同时简化为垂直直线，避免多余折点
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
        // 多个子节点：先垂直向下，再水平分叉
        const childPositions = childEdges
          .map(e => ({ edge: e, pos: nodePositions.get(e.target) }))
          .filter(({ pos }) => pos !== undefined)
          .map(({ edge, pos }) => ({ edge, pos: pos! }));
        
        if (childPositions.length === 0) continue;
        
        // 计算水平分叉线的 Y 位置（在父节点底部和第一个子节点顶部中间）
        const firstChildTopY = Math.min(...childPositions.map(c => c.pos.y - c.pos.height / 2));
        const branchY = parentBottomY + (firstChildTopY - parentBottomY) * 0.5;
        
        // 最左和最右子节点的顶部 X
        const leftmostX = Math.min(...childPositions.map(c => c.pos.x));
        const rightmostX = Math.max(...childPositions.map(c => c.pos.x));
        
        for (const { edge, pos } of childPositions) {
          const childTopX = pos.x;
          const childTopY = pos.y - pos.height / 2;
          
          edge.path = {
            points: [
              { x: parentBottomX, y: parentBottomY },          // 父节点底部中心
              { x: parentBottomX, y: branchY },                 // 垂直向下到分叉线
              { x: childTopX, y: branchY },                     // 水平移动到子节点上方
              { x: childTopX, y: childTopY },                   // 垂直向下到子节点顶部
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
    
    // 自动选择布局方向
    let direction: 'TB' | 'LR' = 'TB';
    if (this.config.autoFit.preferDirection === 'auto') {
      direction = contentW > contentH ? 'LR' : 'TB';
    } else {
      direction = this.config.autoFit.preferDirection;
    }
    
    // LR 方向时交换宽高计算缩放
    const fitW = direction === 'LR' ? contentH : contentW;
    const fitH = direction === 'LR' ? contentW : contentH;
    
    const scaleX = (canvasW - padding * 2) / fitW;
    const scaleY = (canvasH - padding * 2) / fitH;
    let zoom = Math.min(scaleX, scaleY);
    
    // 限制缩放范围
    zoom = Math.max(this.config.autoFit.minZoom, Math.min(this.config.autoFit.maxZoom, zoom));
    
    // 计算中心点
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    return { zoom, centerX, centerY, layoutDirection: direction };
  }

}
