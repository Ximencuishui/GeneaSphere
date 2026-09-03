/**
 * layout-validators.ts - 布局引擎校验与推断工具
 *
 * [v6.x 强壮性 A3 + C2 + A6] 校验与推断模块
 *
 * 本模块是纯函数集合，提供三类能力：
 * 1. `inferNodeRole` — 节点角色推断（A3 显式化 nodeRole）
 * 2. `validateLayoutConfig` — LayoutConfig 数值参数校验（C2）
 * 3. `validateLayoutInput` — calculateLayout 输入完整性校验（早期捕获）
 *
 * 所有函数为纯函数，无副作用，便于单测；不引用任何全局状态。
 *
 * 调用方契约：
 * - dev 模式：抛 LayoutEngineError 强制快速失败
 * - prod 模式：自动 clamp 到合法区间，不抛错（避免生产环境崩溃）
 */

import type {
  LayoutNode,
  LayoutConfig,
  LayoutEdge,
  NodeRole,
} from '@/types/layout';
import { LayoutEngineError } from '@/utils/layout-errors';

// ============================================================================
// A3：节点角色推断
// ============================================================================

/**
 * 推断节点角色（v6.x A3 显式化）
 *
 * 判定优先级（从高到低）：
 * 1. 上游已显式指定 `nodeRole` → 信任，**校验合法性后返回**
 * 2. `virtualSpouse === true` → 'other'（虚拟节点不参与任何渲染/走线判定）
 * 3. 在 spouseNodeIds 集合中 → spouseMale / spouseFemale（按 gender 区分）
 * 4. `generation < 0` → 'spouseFemale'（旧式：generation 是配偶标志）
 * 5. `gender === 'male'` → 'anchorMale'
 * 6. `gender === 'female'` 且有子代 → 'anchorMale'（双重身份）
 * 7. `gender === 'female'` 且无子代 → 'spouseFemale'
 *
 * @param node              当前节点
 * @param spouseNodeIds     spouse 节点 id 集合（来自 LayoutEngine 阶段[1].2）
 * @param hasChildrenLookup 子节点存在性查找表（id → boolean）
 * @returns 推断出的 NodeRole
 *
 * @throws LayoutEngineError('INVALID_NODE_ROLE') 当显式 nodeRole 不在白名单
 *
 * 设计依据：
 * - 优先级 1 让上游（数据迁移脚本、GenealogyTree.vue）可显式控制角色
 * - 优先级 2 防止虚拟节点被误判为锚点
 * - 优先级 3 处理 v6.0.8 W2 引入的"双重身份"（女性 + 有子代 但同时是某人配偶）
 * - 优先级 4 向后兼容 v5 时期的 `generation < 0` 判定
 * - 优先级 5-7 处理 Chain-Spouse-Tree 规范的 anchorMale/spouseFemale 分类
 */
export function inferNodeRole(
  node: LayoutNode,
  spouseNodeIds: Set<string>,
  hasChildrenLookup: Map<string, boolean>,
): NodeRole {
  // 优先级 1：显式指定
  if (node.nodeRole !== undefined) {
    if (!isValidNodeRole(node.nodeRole)) {
      throw new LayoutEngineError(
        'INVALID_NODE_ROLE',
        `Node "${node.id}" has invalid nodeRole: ${node.nodeRole}`,
        { nodeId: node.id, nodeRole: node.nodeRole },
      );
    }
    return node.nodeRole;
  }
  // 优先级 2：虚拟节点
  if (node.virtualSpouse === true) return 'other';
  // 优先级 3：在 spouse map 中
  if (spouseNodeIds.has(node.id)) {
    return node.gender === 'male' ? 'spouseMale' : 'spouseFemale';
  }
  // 优先级 4：旧式 generation < 0 判定（向后兼容）
  if ((node.generation ?? 0) < 0) {
    return 'spouseFemale';
  }
  // 优先级 5：男性锚点
  if (node.gender === 'male') return 'anchorMale';
  // 优先级 6-7：女性看子代
  const hasChildren = hasChildrenLookup.get(node.id) ?? false;
  return hasChildren ? 'anchorMale' : 'spouseFemale';
}

/**
 * 批量推断 nodeMap 中所有节点的 nodeRole
 *
 * 副作用：把推断结果写入 `node.nodeRole`（保持上游传入的显式值不被覆盖）
 */
export function annotateNodeRoles(
  nodeMap: Map<string, LayoutNode>,
  spouseNodeIds: Set<string>,
  childrenByParent: Map<string, string[]>,
): void {
  // 构建 hasChildrenLookup
  const hasChildrenLookup = new Map<string, boolean>();
  for (const [parentId, children] of childrenByParent) {
    hasChildrenLookup.set(parentId, children.length > 0);
  }
  for (const [id, node] of nodeMap) {
    if (node.nodeRole !== undefined) continue;  // 已显式指定，跳过
    node.nodeRole = inferNodeRole(node, spouseNodeIds, hasChildrenLookup);
  }
}

/**
 * 校验 nodeRole 值是否在白名单
 */
function isValidNodeRole(value: unknown): value is NodeRole {
  return value === 'anchorMale'
      || value === 'spouseFemale'
      || value === 'spouseMale'
      || value === 'other';
}

// ============================================================================
// C2：LayoutConfig 数值参数校验
// ============================================================================

export interface ValidationResult {
  /** 是否通过校验（dev 模式 = 严格抛错；prod 模式 = 自动 clamp 后返回 true） */
  ok: boolean;
  /** 被 clamp 调整过的字段（仅 prod 模式有意义） */
  clampedFields: string[];
  /** 校验过程中抛出的错误（仅 dev 模式会填充） */
  errors: LayoutEngineError[];
}

/**
 * 校验 LayoutConfig 数值参数
 *
 * 校验规则：
 * - nodeWidth 必须 > 0（dev 抛错，prod clamp 到 max(1, value)）
 * - nodeHeight 必须 > 0（同上）
 * - nodeSep 必须 > 0 或 'auto'（prod clamp 到 16）
 * - rankSep 必须 > 0 或 'auto'（prod clamp 到 100）
 * - spouseGap 必须 ≥ 0（prod clamp 到 max(0, value)）
 * - marriageJunctionOffset 必须 ≥ 0（prod clamp）
 * - edgeHorizontalSeparation 必须 ≥ 0（prod clamp）
 * - engine 必须在 ['auto','dagre','elkjs','compactBox'] 内（dev 抛错）
 * - engineThreshold 若 number 必须 ≥ 1（prod clamp 到 10）
 * - autoFit.minZoom 必须 > 0 且 ≤ maxZoom
 * - autoFit.maxZoom 必须 > 0
 * - autoFit.padding 必须 ≥ 0（prod clamp）
 *
 * @param config  待校验的 LayoutConfig
 * @param options.mode  'dev' 抛错 / 'prod' clamp 兜底，默认 'prod'
 * @returns ValidationResult
 */
export function validateLayoutConfig(
  config: LayoutConfig,
  options: { mode?: 'dev' | 'prod' } = {},
): ValidationResult {
  const mode = options.mode ?? 'prod';
  const clampedFields: string[] = [];
  const errors: LayoutEngineError[] = [];
  let ok = true;

  function require(field: string, ok: boolean, value: unknown, reason: string): boolean {
    if (!ok) {
      const msg = `${field} = ${JSON.stringify(value)} (${reason})`;
      if (mode === 'dev') {
        errors.push(new LayoutEngineError('INVALID_CONFIG', msg, { field, value, reason }));
      } else {
        clampedFields.push(field);
      }
      return false;
    }
    return true;
  }

  // 节点尺寸
  if (!(config.nodeWidth > 0)) {
    require('nodeWidth', false, config.nodeWidth, 'must be > 0');
    if (mode === 'prod') (config as any).nodeWidth = Math.max(1, config.nodeWidth || 64);
    ok = false;
  }
  if (!(config.nodeHeight > 0)) {
    require('nodeHeight', false, config.nodeHeight, 'must be > 0');
    if (mode === 'prod') (config as any).nodeHeight = Math.max(1, config.nodeHeight || 28);
    ok = false;
  }

  // 间距
  if (typeof config.nodeSep === 'number' && !(config.nodeSep > 0)) {
    require('nodeSep', false, config.nodeSep, 'must be > 0 when number');
    if (mode === 'prod') (config as any).nodeSep = 16;
    ok = false;
  }
  if (typeof config.rankSep === 'number' && !(config.rankSep > 0)) {
    require('rankSep', false, config.rankSep, 'must be > 0 when number');
    if (mode === 'prod') (config as any).rankSep = 100;
    ok = false;
  }
  if (!(config.spouseGap >= 0)) {
    require('spouseGap', false, config.spouseGap, 'must be ≥ 0');
    if (mode === 'prod') (config as any).spouseGap = Math.max(0, config.spouseGap || 0);
    ok = false;
  }
  if (config.marriageJunctionOffset < 0) {
    require('marriageJunctionOffset', false, config.marriageJunctionOffset, 'must be ≥ 0');
    if (mode === 'prod') (config as any).marriageJunctionOffset = 0;
    ok = false;
  }
  if (config.edgeHorizontalSeparation < 0) {
    require('edgeHorizontalSeparation', false, config.edgeHorizontalSeparation, 'must be ≥ 0');
    if (mode === 'prod') (config as any).edgeHorizontalSeparation = 0;
    ok = false;
  }

  // 引擎选择
  const validEngines = ['auto', 'dagre', 'elkjs', 'compactBox'];
  if (!validEngines.includes(config.engine ?? 'auto')) {
    require('engine', false, config.engine, `must be one of ${validEngines.join(', ')}`);
    if (mode === 'prod') (config as any).engine = 'auto';
    ok = false;
  }

  // 引擎阈值
  if (config.engineThreshold !== undefined && config.engineThreshold < 1) {
    require('engineThreshold', false, config.engineThreshold, 'must be ≥ 1');
    if (mode === 'prod') (config as any).engineThreshold = 10;
    ok = false;
  }

  // autoFit
  if (config.autoFit.minZoom <= 0) {
    require('autoFit.minZoom', false, config.autoFit.minZoom, 'must be > 0');
    if (mode === 'prod') (config as any).autoFit.minZoom = 0.1;
    ok = false;
  }
  if (config.autoFit.maxZoom <= 0) {
    require('autoFit.maxZoom', false, config.autoFit.maxZoom, 'must be > 0');
    if (mode === 'prod') (config as any).autoFit.maxZoom = 2;
    ok = false;
  }
  if (config.autoFit.minZoom > config.autoFit.maxZoom) {
    require('autoFit.minZoom', false, config.autoFit.minZoom,
      `minZoom > maxZoom (${config.autoFit.maxZoom})`);
    if (mode === 'prod') {
      (config as any).autoFit.minZoom = Math.min(config.autoFit.minZoom, config.autoFit.maxZoom);
    }
    ok = false;
  }
  if (config.autoFit.padding < 0) {
    require('autoFit.padding', false, config.autoFit.padding, 'must be ≥ 0');
    if (mode === 'prod') (config as any).autoFit.padding = 0;
    ok = false;
  }

  // dev 模式：如有错误，合并抛出一个 LayoutEngineError
  if (mode === 'dev' && errors.length > 0) {
    const combined = errors.map(e => e.message).join('; ');
    throw new LayoutEngineError(
      'INVALID_CONFIG',
      `LayoutConfig validation failed (${errors.length} errors): ${combined}`,
      { errors: errors.map(e => e.toJSON()) },
    );
  }

  return { ok, clampedFields, errors };
}

// ============================================================================
// 输入完整性校验
// ============================================================================

/**
 * 校验 calculateLayout 输入（节点 / 边）
 *
 * 早期捕获结构性问题（id 缺失、宽高非数等），避免下游 dagre/elkjs 报莫名错误。
 *
 * @throws LayoutEngineError('INVALID_INPUT') / ('LAYOUT_EMPTY_GRAPH')
 */
export function validateLayoutInput(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
): void {
  if (nodes.length === 0) {
    throw new LayoutEngineError(
      'LAYOUT_EMPTY_GRAPH',
      'nodes array is empty',
      { nodeCount: 0, edgeCount: edges.length },
    );
  }

  const seenIds = new Set<string>();
  for (const node of nodes) {
    if (!node.id || typeof node.id !== 'string') {
      throw new LayoutEngineError(
        'INVALID_INPUT',
        `node missing string id: ${JSON.stringify(node).slice(0, 100)}`,
        { node },
      );
    }
    if (seenIds.has(node.id)) {
      throw new LayoutEngineError(
        'INVALID_INPUT',
        `duplicate node id: ${node.id}`,
        { nodeId: node.id },
      );
    }
    seenIds.add(node.id);
    if (typeof node.width !== 'number' || !Number.isFinite(node.width) || node.width <= 0) {
      throw new LayoutEngineError(
        'INVALID_INPUT',
        `node "${node.id}" has invalid width: ${node.width}`,
        { nodeId: node.id, width: node.width },
      );
    }
    if (typeof node.height !== 'number' || !Number.isFinite(node.height) || node.height <= 0) {
      throw new LayoutEngineError(
        'INVALID_INPUT',
        `node "${node.id}" has invalid height: ${node.height}`,
        { nodeId: node.id, height: node.height },
      );
    }
  }

  // 边引用校验
  for (const edge of edges) {
    if (!edge.source || !edge.target) {
      throw new LayoutEngineError(
        'INVALID_INPUT',
        `edge missing source/target: ${JSON.stringify(edge).slice(0, 100)}`,
        { edge },
      );
    }
    if (!seenIds.has(edge.source)) {
      throw new LayoutEngineError(
        'INVALID_INPUT',
        `edge "${edge.id ?? edge.source + '→' + edge.target}" references unknown source: ${edge.source}`,
        { edge },
      );
    }
    if (!seenIds.has(edge.target)) {
      throw new LayoutEngineError(
        'INVALID_INPUT',
        `edge "${edge.id ?? edge.source + '→' + edge.target}" references unknown target: ${edge.target}`,
        { edge },
      );
    }
    if (edge.kind !== 'spouse' && edge.kind !== 'parent-child') {
      throw new LayoutEngineError(
        'INVALID_INPUT',
        `edge "${edge.id ?? edge.source + '→' + edge.target}" has invalid kind: ${edge.kind}`,
        { edge },
      );
    }
  }
}
