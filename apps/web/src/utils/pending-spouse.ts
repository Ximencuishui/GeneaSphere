/**
 * pending-spouse.ts — 配偶节点/边的收集、合并与重挂载
 *
 * [2026-08-17 拆解] 把 GenealogyTree.vue 中 runInitGraphBody 的 spouse 相关逻辑抽离：
 *  - collectPendingSpouses：DFS 遍历树，收集所有 spouse 节点/边
 *    （spouse 不参与初始 G6 布局，延迟到 layout 完成后定位）
 *  - remountChildrenToWifeNodes：[xianshi] 把父→子边替换为妻子→子边
 *  - buildLayoutInputFromGraphData：把 graphData + pendingSpouse 转为 layout-engine 输入，
 *    同时把 isConcubineChild / palette / birthOrder 写回 graphData.edges.data
 *    （供 G6 渲染时的边样式回调读取）
 *  - applySpouseLayoutResultToGraphData：把 layoutResult 的正交路径、spouse 节点位置/边写回 graphData
 *
 * 设计要点：
 *  - 纯函数式，无 Vue 依赖、无单例状态，可独立单测
 *  - 不直接 import GenealogyTree.vue 的内部状态；
 *    viewMode / deriveIdentityLabel 等通过参数或显式 import 传入。
 *  - 返回值最小化对外部数据的修改（用 .filter / spread 返回新数组，避免调用方意外的副作用）。
 */
import type { GenealogyNode } from '@/types';
import { getWifePaletteColor } from './spouse-palette';
import { deriveIdentityLabel } from '@/composables/useGenealogyTransform';

/** 配偶节点（与 G6 节点结构兼容的最小子集） */
export interface PendingSpouseNode {
  id: string;
  label: string;
  data: Record<string, any>;
  style?: Record<string, any>;
}

/** 配偶边（kind='spouse'，与 G6 边结构兼容的最小子集） */
export interface PendingSpouseEdge {
  id: string;
  source: string;
  target: string;
  data: Record<string, any>;
}

/** collectPendingSpouses 返回值 */
export interface PendingSpousesResult {
  nodes: PendingSpouseNode[];
  edges: PendingSpouseEdge[];
}

/**
 * DFS 遍历树，收集所有 spouse 节点/边。
 *
 * 设计：
 *  - 同一 person_id 已存在 existingNodeMap（即族内配偶）→ 生成副本节点 `sid-spouse-N`，
 *    避免被多个 source 共享导致 spouse 边无法对齐。
 *  - 外部配偶（不在 existingNodeMap）→ 直接用 sid 作为节点 id，
 *    style.opacity = 0.45 视觉降级，data.is_external_spouse = true。
 *  - 女性配偶挂 palette（djb2 哈希稳定取色），与边样式回调一致。
 *  - 同一对 (personId, spouseId) 只生成一次（seenSpousePairs 去重）。
 *
 * @param data 已转换的 GenealogyNode 树（即 runInitGraphBody 传入的 filtered data）
 * @param existingNodeMap 已存在的树节点 id → G6 节点引用
 *                      （用于判断 spouse 是否已在族谱中）
 */
export function collectPendingSpouses(
  data: GenealogyNode,
  existingNodeMap: Map<string, any>,
): PendingSpousesResult {
  const nodes: PendingSpouseNode[] = [];
  const edges: PendingSpouseEdge[] = [];
  const seenSpousePairs = new Set<string>();

  const visit = (node: GenealogyNode): void => {
    const spouses = node.spouses as any[] | undefined;
    if (spouses) {
      for (const s of spouses) {
        const pairKey = [String(node.id), String(s.id)].sort().join('|');
        if (seenSpousePairs.has(pairKey)) continue;
        seenSpousePairs.add(pairKey);

        const sid = String(s.id);
        let spouseNodeId = sid;

        // 女性配偶挂 palette；男性配偶无子女分支，挂在 data 上不影响渲染
        const wifePalette =
          s.gender === 'female' ? getWifePaletteColor(s.id) : undefined;

        // 配偶身份标签：妻/妾/夫
        const spouseIdentity = deriveIdentityLabel(
          { gender: s.gender } as GenealogyNode,
          { isSpouse: true, spouseOrder: s.marriage_order },
        );

        if (!existingNodeMap.has(sid)) {
          // 外部配偶：用 sid 作为节点 id
          const newNode: PendingSpouseNode = {
            id: sid,
            label: s.name,
            data: {
              // generation: -1 → TreePage 浮窗忽略（不参与按 gen 聚合）
              generation: -1,
              gender: s.gender,
              is_living: true,
              has_photo: false,
              is_external_spouse: true,
              spouse_order: s.marriage_order,
              identity_label: spouseIdentity,
              original: null,
              ...(wifePalette ? { palette: wifePalette } : {}),
            },
            style: { opacity: 0.45 },
          };
          nodes.push(newNode);
          existingNodeMap.set(sid, newNode);
        } else {
          // 族内配偶：生成副本节点，避免同一副本被多个 source 共享
          spouseNodeId = `${sid}-spouse-${edges.length}`;
          const newNode: PendingSpouseNode = {
            id: spouseNodeId,
            label: s.name,
            data: {
              generation: -1,
              gender: s.gender,
              is_living: true,
              has_photo: false,
              is_external_spouse: true,
              is_duplicate_spouse: true,
              spouse_order: s.marriage_order,
              identity_label: spouseIdentity,
              originalId: sid,
              original: null,
              ...(wifePalette ? { palette: wifePalette } : {}),
            },
            style: { opacity: 0.45 },
          };
          nodes.push(newNode);
          existingNodeMap.set(spouseNodeId, newNode);
        }

        edges.push({
          id: `spouse-${pairKey}-${s.marriage_order}`,
          source: String(node.id),
          target: spouseNodeId,
          data: {
            kind: 'spouse',
            order: s.marriage_order,
            is_current: s.is_current,
            end_reason: s.end_reason,
          },
        });
      }
    }
    if (node.children) node.children.forEach(visit);
  };
  visit(data);

  return { nodes, edges };
}

/**
 * [xianshi 模式] 把"父→子"边替换为"妻子节点→子"边。
 *
 * 传统世系吊线图：子女按"各妻子分别分支"。
 * 布局引擎已原生支持"配偶节点带子树"（positionSpouseNodes → layoutSpouseSubtree），
 * 因此只需把父→子边的 source 从父节点改为妻子节点，引擎会自动把子女子树排到妻子下方。
 *
 * 匹配规则（child_links，后端已透出）：
 *  - link.mother_id 存在且是该人物的配偶 → 挂到对应妻子节点下
 *  - 其余（无母/母不在配偶列表）保持挂在父节点下（不返回 remove）
 *
 * 调用方需要把返回的 removeEdges / addedEdges 应用到 graphData.edges。
 *
 * @returns removeEdges / addedEdges（addedEdges 包含 palette 调色板色）
 */
export function remountChildrenToWifeNodes(
  data: GenealogyNode,
  graphData: { nodes?: any[]; edges?: any[] },
  pendingSpouseNodes: PendingSpouseNode[],
): {
  removeEdges: Set<any>;
  addedEdges: PendingSpouseEdge[];
} {
  // 配偶原始 personId → 实际 G6 节点 id（外部配偶 id=sid；族内配偶为副本节点）
  const spouseNodeIdBySpouseId = new Map<string, string>();
  for (const n of pendingSpouseNodes) {
    const originalId = n.data?.originalId ? String(n.data.originalId) : String(n.id);
    if (!spouseNodeIdBySpouseId.has(originalId)) {
      spouseNodeIdBySpouseId.set(originalId, String(n.id));
    }
  }

  const edgesBySource = new Map<string, any[]>();
  for (const e of graphData.edges || []) {
    const s = String(e.source);
    if (!edgesBySource.has(s)) edgesBySource.set(s, []);
    edgesBySource.get(s)!.push(e);
  }

  const removeEdges = new Set<any>();
  const addedEdges: PendingSpouseEdge[] = [];

  const visit = (node: any): void => {
    const original = node.data?.original as GenealogyNode | undefined;
    const links = original?.child_links || [];
    if (links.length > 0 && original?.spouses) {
      const spouseIdSet = new Set(original.spouses.map((s: any) => String(s.id)));
      const edgesOfNode = edgesBySource.get(String(node.id)) || [];
      const edgeByTarget = new Map(edgesOfNode.map((e: any) => [String(e.target), e]));
      for (const link of links) {
        const motherId = link.mother_id ? String(link.mother_id) : undefined;
        if (!motherId || !spouseIdSet.has(motherId)) continue;
        const childId = String(link.child_id);
        const fatherEdge = edgeByTarget.get(childId);
        const wifeNodeId = spouseNodeIdBySpouseId.get(motherId);
        if (!fatherEdge || !wifeNodeId) continue;
        // 妻子 → 子女边按妻子 person_id 取色（与妻子节点 data.palette 完全一致）
        const palette = getWifePaletteColor(motherId);
        removeEdges.add(fatherEdge);
        addedEdges.push({
          id: `mother-child-${wifeNodeId}-${childId}`,
          source: wifeNodeId,
          target: childId,
          data: {
            kind: 'parent-child',
            child_type: link.child_type,
            birth_order: link.birth_order,
            palette,
          },
        });
      }
    }
    if (node.children) node.children.forEach(visit);
  };
  visit(data);

  return { removeEdges, addedEdges };
}

/** 布局引擎输入节点（与 LayoutNode 结构对齐） */
export interface LayoutInputNode {
  id: string;
  label: string;
  // [P0-3 2026-09-03] gender 改为与 LayoutNode.gender 对齐的字面量联合类型，
  // 避免 calculateLayout 入参 LayoutNode[] 类型校验失败（TS2345）。
  gender: 'male' | 'female';
  isMainLineage: boolean;
  isLiving: boolean;
  generation: number;
  data: any;
  width: number;
  height: number;
}

/** 布局引擎输入边（与 LayoutEdge 结构对齐） */
export interface LayoutInputEdge {
  id: string;
  source: string;
  target: string;
  kind: 'spouse' | 'parent-child';
  isCurrent?: boolean;
  marriageOrder?: number;
  motherId?: string;
  birthOrder?: number;
  isConcubineChild?: boolean;
  palette?: string;
}

/** buildLayoutInputFromGraphData 选项 */
export interface BuildLayoutInputOptions {
  /** 视图模式参数（决定卡片宽高） */
  config: { nodeWidth: number; nodeHeight: number };
  /** 节点 id → 世代深度（来自 transformToG6Data 的 generationMap） */
  generationMap: Map<string, number>;
  /** 转换后的 GenealogyNode 树，含 data.birth_order / data.mother_id */
  treeData: any;
}

/**
 * 把 graphData + pendingSpouse 转换为 layout-engine 输入（layoutNodes / layoutEdges）。
 *
 * 同时把以下字段同步回 graphData.edges.data（供 G6 边样式回调读取）：
 *  - is_concubine_child（母亲是妾，不是父自己）
 *  - palette（妾之子的边调色板色）
 *  - birth_order（出生顺序）
 *
 * @returns layoutNodes / layoutEdges（不要修改 graphData.edges，直接用返回值）
 */
export function buildLayoutInputFromGraphData(
  graphData: { nodes?: any[]; edges?: any[] },
  pendingSpouseNodes: PendingSpouseNode[],
  pendingSpouseEdges: PendingSpouseEdge[],
  opts: BuildLayoutInputOptions,
): {
  layoutNodes: LayoutInputNode[];
  layoutEdges: LayoutInputEdge[];
} {
  const { config, generationMap, treeData } = opts;

  // 主节点
  const layoutNodes: LayoutInputNode[] = (graphData.nodes || []).map((n: any) => {
    // [P0-3 2026-09-03] 显式窄化为字面量联合，避免宽 string 与 LayoutNode 不兼容。
    const rawGender = n.data?.gender;
    const gender: 'male' | 'female' = rawGender === 'female' ? 'female' : 'male';
    return {
      id: String(n.id),
      label: n.label || '',
      gender,
      isMainLineage: n.data?.is_main_lineage || false,
      isLiving: n.data?.is_living || false,
      generation: generationMap.get(String(n.id)) ?? 0,
      data: n.data,
      width: config.nodeWidth,
      height: config.nodeHeight,
    };
  });

  // personId → spouse node id（用于 layout-engine 查找妾节点位置）
  const spouseNodeIdByPersonId = new Map<string, string>();
  for (const node of pendingSpouseNodes) {
    const personId = node.data?.originalId ? String(node.data.originalId) : String(node.id);
    if (!spouseNodeIdByPersonId.has(personId)) {
      spouseNodeIdByPersonId.set(personId, String(node.id));
    }
  }

  // 递归收集 birth_order / mother_id 索引
  const birthOrderByChildId = new Map<string, number>();
  const motherIdByChildId = new Map<string, string>();
  const collectChildMeta = (n: any): void => {
    if (n?.data?.birth_order != null) {
      birthOrderByChildId.set(String(n.id), Number(n.data.birth_order));
    }
    if (n?.data?.mother_id) {
      motherIdByChildId.set(String(n.id), String(n.data.mother_id));
    }
    if (n?.children) n.children.forEach(collectChildMeta);
  };
  collectChildMeta(treeData);

  // 主节点之间的边
  const layoutEdges: LayoutInputEdge[] = (graphData.edges || []).map((e: any) => {
    const targetId = String(e.target);
    const motherPersonId = e.data?.mother_id
      ? String(e.data.mother_id)
      : motherIdByChildId.get(targetId);
    const motherNodeId = motherPersonId
      ? (spouseNodeIdByPersonId.get(motherPersonId) ?? motherPersonId)
      : undefined;
    const isConcubineChild = !!motherPersonId && motherPersonId !== String(e.source);
    const palette = isConcubineChild && motherPersonId ? getWifePaletteColor(motherPersonId) : undefined;
    const birthOrder = e.data?.birth_order ?? birthOrderByChildId.get(targetId);
    return {
      id: String(e.id),
      source: String(e.source),
      target: targetId,
      kind: e.data?.kind === 'spouse' ? 'spouse' : 'parent-child',
      isCurrent: e.data?.is_current,
      marriageOrder: e.data?.order,
      motherId: motherNodeId,
      birthOrder: birthOrder != null ? Number(birthOrder) : undefined,
      isConcubineChild,
      palette,
    };
  });

  // 添加配偶边
  for (const edge of pendingSpouseEdges) {
    layoutEdges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: 'spouse',
      isCurrent: edge.data?.is_current,
      marriageOrder: edge.data?.order,
    });
  }

  // 同步 isConcubineChild / palette / birth_order 回 graphData.edges.data
  if (graphData.edges) {
    const layoutEdgeByPair = new Map<string, LayoutInputEdge>();
    for (const le of layoutEdges) {
      layoutEdgeByPair.set(`${le.source}-${le.target}`, le);
    }
    for (const g6Edge of graphData.edges) {
      const layoutEdge = layoutEdgeByPair.get(`${g6Edge.source}-${g6Edge.target}`);
      if (!layoutEdge) continue;
      if (!g6Edge.data) g6Edge.data = {};
      if (layoutEdge.isConcubineChild) {
        g6Edge.data.is_concubine_child = true;
        if (layoutEdge.palette) g6Edge.data.palette = layoutEdge.palette;
      }
      if (layoutEdge.birthOrder != null) {
        g6Edge.data.birth_order = layoutEdge.birthOrder;
      }
    }
  }

  // 添加配偶节点（标记为外部节点，不参与主布局）
  for (const node of pendingSpouseNodes) {
    // [P0-3 2026-09-03] 显式窄化 gender，与 LayoutNode 字面量联合对齐。
    const spouseGender: 'male' | 'female' =
      node.data?.gender === 'female' ? 'female' : 'male';
    layoutNodes.push({
      id: String(node.id),
      label: node.label || '',
      gender: spouseGender,
      isMainLineage: false,
      isLiving: node.data?.is_living || false,
      generation: -1,
      data: node.data,
      width: config.nodeWidth,
      height: config.nodeHeight,
    });
  }

  return { layoutNodes, layoutEdges };
}

/**
 * 布局完成后，把 layoutResult 中的 spouse 节点位置和配偶边写回 graphData。
 *
 *  - 配偶节点位置来自 layoutResult.nodes（按 G6 id 匹配）
 *  - 配偶边直接 push 到 graphData.edges
 *  - 主节点的位置由调用方单独处理（这里不处理）
 *
 * @returns orthPathCount / spouseEdgeCount（用于 perf/debug 日志）
 */
export function applySpouseLayoutResultToGraphData(
  graphData: { nodes?: any[]; edges?: any[] },
  pendingSpouseNodes: PendingSpouseNode[],
  pendingSpouseEdges: PendingSpouseEdge[],
  layoutResult: { nodes: Array<{ id: string; x: number; y: number }> },
): {
  orthPathCount: number;
  spouseEdgeCount: number;
  missingPathCount: number;
} {
  // 节点位置映射
  const nodePositionMap = new Map<string, { x: number; y: number }>();
  for (const pos of layoutResult.nodes) {
    nodePositionMap.set(pos.id, { x: pos.x, y: pos.y });
  }

  // 把配偶节点位置写入 graphData.nodes
  for (const node of pendingSpouseNodes) {
    const pos = nodePositionMap.get(String(node.id));
    if (pos) {
      node.style = { ...node.style, x: pos.x, y: pos.y };
    }
    if (!graphData.nodes) graphData.nodes = [];
    graphData.nodes.push(node);
  }

  // 把配偶边写入 graphData.edges
  for (const edge of pendingSpouseEdges) {
    if (!graphData.edges) graphData.edges = [];
    graphData.edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      data: edge.data,
    });
  }

  // 这两个计数由调用方处理正交路径时填充
  // 这里仅返回配偶边计数（orthPathCount 由 applyOrthogonalPathsToGraphData 处理）
  const spouseEdgeCount = pendingSpouseEdges.length;
  return {
    orthPathCount: 0,
    spouseEdgeCount,
    missingPathCount: 0,
  };
}

/**
 * 把 layoutResult 中的正交路径附加到 G6 边 style.orthPath。
 *
 *  - 按 source-target 匹配（layout 和 G6 的 edge id 可能不同）
 *  - spouse 边不检查正交路径（kind='spouse'，已在 pendingSpouseEdges 中）
 *  - 缺少路径的非 spouse 边会 console.warn，便于调试
 *
 * @returns orthPathCount / spouseEdgeCount / missingPathCount
 */
export function applyOrthogonalPathsToGraphData(
  graphData: { edges?: any[] },
  layoutResult: { edges: Array<{ source: string; target: string; path?: any }> },
): {
  orthPathCount: number;
  spouseEdgeCount: number;
  missingPathCount: number;
} {
  const layoutEdgeByPair = new Map<string, { path?: any }>();
  for (const le of layoutResult.edges) {
    layoutEdgeByPair.set(`${le.source}-${le.target}`, le);
  }

  let orthPathCount = 0;
  let spouseEdgeCount = 0;
  let missingPathCount = 0;
  for (const edge of graphData.edges || []) {
    const layoutEdge = layoutEdgeByPair.get(`${edge.source}-${edge.target}`);
    if (layoutEdge?.path) {
      edge.style = { ...edge.style, orthPath: layoutEdge.path };
      orthPathCount++;
    } else if (edge.data?.kind !== 'spouse') {
      missingPathCount++;
      console.warn('[pending-spouse] 边缺少正交路径:', edge.id, edge.source, '->', edge.target);
    }
    if (edge.data?.kind === 'spouse') {
      spouseEdgeCount++;
    }
  }
  return { orthPathCount, spouseEdgeCount, missingPathCount };
}