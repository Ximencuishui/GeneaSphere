/**
 * layout-cache.ts - 布局结果缓存（hash + LRU）
 *
 * [v6.x 健壮性 B 系列] 性能优化第 1 步：避免相同输入的重复布局计算
 *
 * 价值场景：
 * - dev 模式下 HMR 触发的副作用重渲染
 * - 配置-only 变更但节点/边未变的情况（cache by data hash 而不是 config）
 * - 上层 Vue watch 触发但 source 数据未变的情况
 *
 * 不命中场景（需要调用方主动失效）：
 * - 节点/边真实变化（hash 不同）
 * - 调用方显式调用 clear() 或 engine.clearCache()
 *
 * 设计选择：
 * - **按数据 hash 缓存**，不按 config hash 缓存：
 *   config 仅影响视觉效果（边距、缩放），同一组 (nodes, edges) 多次 layout
 *   结果布局坐标应一致。如果 config 变了，cache 命中但 result 可能不准。
 *   为保险：hash 包含 config 中影响布局的关键字段。
 *
 * - **LRU 淘汰**：maxSize 控制内存上限；超出后删除最久未访问。
 *
 * - **可选 TTL**：ttlMs=0 表示永不过期（仅 LRU 控制）。
 *
 * - **透明 API**：get/set 不抛错；get 不存在返回 null。
 */

import type { LayoutResult } from '@/types/layout';
import type { LayoutNode, LayoutEdge, LayoutConfig } from '@/types/layout';

// ==================== 类型 ====================

/**
 * 缓存条目（包含 hash 命中时所需的所有信息）
 */
export interface LayoutCacheEntry {
  /** hash key */
  key: string;
  /** 布局结果（可能包含 meta 信息） */
  result: LayoutResult;
  /** 缓存时间戳 */
  cachedAt: number;
  /** 命中次数（for debugging） */
  hitCount: number;
}

/**
 * 缓存配置选项
 */
export interface LayoutCacheOptions {
  /** LRU 上限（条目数）。默认 8。 */
  maxSize?: number;
  /** TTL（毫秒）。默认 0（无 TTL）。 */
  ttlMs?: number;
  /**
   * 是否包含 config 进 hash。
   * - true（默认）：相同 (nodes, edges) 不同 config 视为不命中（推荐，视觉布局可能不同）
   * - false：仅按数据 hash（更快但 config 变化时 result 可能视觉偏差）
   */
  hashConfig?: boolean;
}

/**
 * 缓存统计
 */
export interface LayoutCacheStats {
  /** 当前条目数 */
  size: number;
  /** 上限 */
  maxSize: number;
  /** 命中次数 */
  hits: number;
  /** 未命中次数 */
  misses: number;
  /** 命中率（0-1） */
  hitRate: number;
  /** 主动失效次数 */
  invalidations: number;
  /** LRU 淘汰次数 */
  evictions: number;
}

// ==================== Hash 计算 ====================

/**
 * 计算输入数据的 hash key。
 *
 * 算法说明：
 * - 节点：仅 id + generation + parent（来自 edges）；不含 width/height 等可变字段
 *   （这些不影响 layout 拓扑）
 * - 边：仅 source/target/kind，不含 path/coordinates
 * - config：仅影响布局的关键字段（spouseGap/nodeSep/rankSep/edgeInset/...）
 *
 * 性能：O(N+M)，使用 32-bit FNV-1a 哈希（足够快，避免 SHA-256 引入 SubtleCrypto）
 *
 * 注：精确等价"===result"是不可能的（float 浮点），但相同输入应产生相同的 hash。
 */
export function computeLayoutHash(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  config?: Partial<LayoutConfig>,
  hashConfig: boolean = true,
): string {
  // 1. 规范化节点：仅保留布局相关字段
  const normNodes = nodes
    .map(n => ({
      id: n.id,
      g: n.generation ?? 0,
      ml: n.isMainLineage ? 1 : 0,
      vs: n.virtualSpouse ? 1 : 0,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 2. 规范化边
  const normEdges = edges
    .map(e => ({ id: e.id, s: e.source, t: e.target, k: e.kind }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 3. config 字段（影响布局）
  const cfgStr = hashConfig && config
    ? [
        config.spouseGap ?? 'auto',
        config.nodeSep ?? 'auto',
        config.rankSep ?? 'auto',
        config.edgeInset ?? 'auto',
        config.spouseOptimization ? 1 : 0,
        config.mainLineageCenter ? 1 : 0,
        config.resolveSubtreeOverlap ? 1 : 0,
        config.engine ?? 'auto',
      ].join('|')
    : '';

  // 4. FNV-1a 32-bit 哈希
  const parts = JSON.stringify([normNodes, normEdges, cfgStr]);
  return fnv1a32(parts).toString(16).padStart(8, '0');
}

/**
 * FNV-1a 32-bit hash
 * https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function
 */
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32-bit FNV prime = 0x01000193
    hash = Math.imul(hash, 0x01000193);
  }
  // 转 uint32
  return hash >>> 0;
}

// ==================== LayoutCache 类 ====================

/**
 * 简单的 LRU 缓存实现。
 *
 * API 设计：
 * - 同步访问（不阻塞主线程）
 * - get 返回 null 表示未命中
 * - set 自动驱逐超限条目
 * - stats() 提供命中率监控
 */
export class LayoutCache {
  private readonly map = new Map<string, LayoutCacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly hashConfig: boolean;
  // 统计
  private hits = 0;
  private misses = 0;
  private invalidations = 0;
  private evictions = 0;

  constructor(options: LayoutCacheOptions = {}) {
    this.maxSize = Math.max(1, options.maxSize ?? 8);
    this.ttlMs = options.ttlMs ?? 0;
    this.hashConfig = options.hashConfig ?? true;
  }

  /**
   * 查询缓存
   * @returns 命中返回 LayoutResult；未命中或 TTL 过期返回 null
   */
  get(nodes: LayoutNode[], edges: LayoutEdge[], config?: Partial<LayoutConfig>): LayoutResult | null {
    const key = computeLayoutHash(nodes, edges, config, this.hashConfig);
    const entry = this.map.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    // TTL 检查
    if (this.ttlMs > 0 && Date.now() - entry.cachedAt > this.ttlMs) {
      this.map.delete(key);
      this.misses += 1;
      this.invalidations += 1;
      return null;
    }
    // LRU：更新访问顺序（Map 保持插入顺序，删了再插 = 最新）
    this.map.delete(key);
    entry.hitCount += 1;
    this.map.set(key, entry);
    this.hits += 1;
    return entry.result;
  }

  /**
   * 写入缓存（命中后已 LRU 更新，无需再写）
   *
   * 自动驱逐最旧的条目（map iteration 顺序 = 插入顺序）
   */
  set(
    nodes: LayoutNode[],
    edges: LayoutEdge[],
    result: LayoutResult,
    config?: Partial<LayoutConfig>,
  ): void {
    const key = computeLayoutHash(nodes, edges, config, this.hashConfig);
    // 已存在则覆盖（且 LRU 更新）
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // LRU 驱逐最旧
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
        this.evictions += 1;
      }
    }
    this.map.set(key, {
      key,
      result,
      cachedAt: Date.now(),
      hitCount: 0,
    });
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.map.clear();
  }

  /**
   * 当前条目数
   */
  get size(): number {
    return this.map.size;
  }

  /**
   * 获取统计信息（调试 / 监控用）
   */
  getStats(): LayoutCacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      invalidations: this.invalidations,
      evictions: this.evictions,
    };
  }

  /**
   * 重置统计（不清理条目）
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.invalidations = 0;
    this.evictions = 0;
  }
}