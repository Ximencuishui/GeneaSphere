/**
 * useGenealogyFilter.ts — 节点谓词 / 搜索 / 过滤 composable
 *
 * 抽取 GenealogyTree.vue 中与「节点匹配 + 缓存 + 过滤 + 搜索」相关的全部逻辑：
 *  - searchKeyword / filterGender / showOnlyWithPhotos ref
 *  - filters reactive（hideWife / hideDaughter / hideSonInLaw）
 *  - anyFilterActive computed
 *  - matchesSearch / matchesGenderFilter / matchesPhotoFilter 谓词
 *  - nodeFilterCache + rebuildNodeFilterCache + getFilterMatch
 *    （P0-1 性能优化：style 回调 24N 次/帧 → N 次预计算 + 8N 次 Map 读）
 *  - applyTraditionalFilters：传统过滤深拷贝
 *  - handleSearch / handleSearchDebounced / handleGenderFilterChange / handlePhotoFilterChange
 *    / clearSearch / setHighlight：UI 入口
 *
 * 设计要点：
 *  - 工厂 useGenealogyFilter(opts) 接收外部 graph；
 *    graph 是 setup 中创建的 ref<any>，避免 composable 内部创建导致与主文件 graph 不一致。
 *  - nodeFilterCache 是模块顶层 Map（不是 setup 内闭包）：
 *    保证多次调用 useGenealogyFilter 时（理论上 Vue 不该这样用，但单测会）共享同一缓存。
 *  - rebuildNodeFilterCache/getFilterMatch 也用模块顶层函数，与 G6 style 回调路径耦合最紧。
 *  - applyTraditionalFilters 引用 genealogyStore（在外部用 filters 调用）。
 */
import { ref, reactive, computed, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { GenealogyNode } from '@/types';

/** 三谓词匹配结果，用于 nodeFilterCache 的 value 类型 */
export interface FilterMatch {
  search: boolean;
  gender: boolean;
  photo: boolean;
}

/**
 * 模块顶层缓存：所有 useGenealogyFilter 实例共享同一张表。
 * 实际使用中 GenealogyTree.vue 只调用一次（单例 setup），
 * 模块顶层缓存避免把状态泄漏到 setup 的 ref 闭包里（ref.value 在卸载时会被 GC，丢失数据）。
 */
const nodeFilterCache = new Map<string, FilterMatch>();

/** 三谓词核心谓词（缓存填充源） */
function matchesSearch(node: any, searchKeyword: string): boolean {
  if (!searchKeyword) return true;
  const keyword = searchKeyword.toLowerCase();
  const label = (node.label || '').toLowerCase();
  const name = (node.data?.original?.full_name || '').toLowerCase();
  return label.includes(keyword) || name.includes(keyword);
}

function matchesGenderFilter(node: any, filterGender: 'all' | 'male' | 'female'): boolean {
  if (filterGender === 'all') return true;
  return node.data?.gender === filterGender;
}

function matchesPhotoFilter(node: any, showOnlyWithPhotos: boolean): boolean {
  if (!showOnlyWithPhotos) return true;
  return node.data?.has_photo === true;
}

/**
 * 重置并填充 cache。
 * 在 G6 setData 之前（runInitGraphBody）、handleSearch / handleGenderFilterChange
 * / handlePhotoFilterChange 入口被调用。
 */
function rebuildNodeFilterCacheImpl(
  allNodes: any[],
  searchKeyword: string,
  filterGender: 'all' | 'male' | 'female',
  showOnlyWithPhotos: boolean,
): void {
  nodeFilterCache.clear();
  if (!Array.isArray(allNodes) || allNodes.length === 0) return;
  for (let i = 0; i < allNodes.length; i++) {
    const n = allNodes[i];
    if (!n || n.id === undefined || n.id === null) continue;
    const id = String(n.id);
    nodeFilterCache.set(id, {
      search: matchesSearch(n, searchKeyword),
      gender: matchesGenderFilter(n, filterGender),
      photo: matchesPhotoFilter(n, showOnlyWithPhotos),
    });
  }
}

/**
 * G6 style 回调路径使用：O(1) 查 cache，未命中 fallback 全部 true（不会误淡）。
 */
function getFilterMatch(d: any): FilterMatch {
  if (!d || d.id === undefined || d.id === null) {
    return { search: true, gender: true, photo: true };
  }
  return nodeFilterCache.get(String(d.id)) || { search: true, gender: true, photo: true };
}

/**
 * 工厂：暴露 filter / search 全部状态与函数。
 *
 * @param graph 主文件 setup 中创建的 G6 graph ref<any>，用于 handler 触发 draw() 与读取 getNodeData()
 */
export function useGenealogyFilter(opts: { graph: Ref<any> }) {
  const { graph } = opts;

  // ==================== Search & Filter 状态 ====================
  const searchKeyword = ref('');
  const filterGender = ref<'all' | 'male' | 'female'>('all');
  const showOnlyWithPhotos = ref(false);
  const highlightNodeIds = ref<Set<string>>(new Set());
  const searchResultCount = ref(0);

  // ==================== 传统族谱过滤开关（PRD §2.4）====================
  // 三个独立开关，自由组合，实时生效；纯渲染过滤（不改底层数据），切换后重绘画布。
  const filters = reactive({
    hideWife: false, // 隐藏所有男性的配偶节点（妻子）
    hideDaughter: false, // 隐藏本族女性后代（女儿，含其整支子树）
    hideSonInLaw: false, // 隐藏女儿的配偶（女婿）
  });
  const anyFilterActive = computed(
    () => filters.hideWife || filters.hideDaughter || filters.hideSonInLaw,
  );

  // ==================== 内部 cache 操作 ====================
  function rebuildNodeFilterCache(allNodes: any[]): void {
    rebuildNodeFilterCacheImpl(allNodes, searchKeyword.value, filterGender.value, showOnlyWithPhotos.value);
  }

  // ==================== applyTraditionalFilters ====================
  /**
   * 过滤拷贝（返回新树对象，不修改原数据）
   * - hideDaughter：女性"子女"节点整支剔除（含其子树）；
   * - hideWife：男性主节点的配偶全部移除（女性主节点的"丈夫"不受此开关影响）；
   * - hideSonInLaw：女性"子女"节点（女儿）的配偶移除。
   * 已知边界：作为"妻子"出现在他人家庭里的女儿，其妻子节点仍受 hideWife 控制（v1 简化）。
   *
   * 注意：isChild=true 时才参与判定；入口调用 isChild 默认 false。
   */
  function applyTraditionalFilters(
    node: GenealogyNode | null,
    isChild = false,
  ): GenealogyNode | null {
    if (!node) return null;

    if (isChild && filters.hideDaughter && node.gender === 'female') return null;

    let spouses = node.spouses;
    if (filters.hideWife && node.gender === 'male') spouses = undefined;
    if (filters.hideSonInLaw && isChild && node.gender === 'female') spouses = undefined;

    const children = (node.children || [])
      .map((c) => applyTraditionalFilters(c, true))
      .filter((c): c is GenealogyNode => c !== null);

    return {
      ...node,
      spouses: spouses && spouses.length > 0 ? spouses : undefined,
      children: children.length > 0 ? children : undefined,
    };
  }

  // ==================== Handlers ====================
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** 搜索防抖计时器（每次输入 250ms 后执行搜索） */
  function handleSearchDebounced(): void {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => handleSearch(), 250);
  }

  function handleSearch(): void {
    if (!graph.value || !graph.value) return;
    highlightNodeIds.value.clear();

    // [P0-1 2026-09-03] 搜索/筛选谓词变化：重建缓存（用 G6 已加载的图数据遍历，避免再次 transform）
    const allNodesForCache = graph.value.getNodeData?.() || [];
    rebuildNodeFilterCache(allNodesForCache);

    if (searchKeyword.value) {
      let count = 0;
      // [P0-1 2026-09-03 审计] 复用已构建的 nodeFilterCache，避免 O(N) 的 matchesSearch 重算。
      for (const node of allNodesForCache) {
        if (getFilterMatch(node).search) {
          highlightNodeIds.value.add(String(node.id));
          count++;
        }
      }
      searchResultCount.value = count;

      if (count > 0) {
        ElMessage.info(`找到 ${count} 个匹配结果`);
        const firstMatchId = highlightNodeIds.value.values().next().value;
        if (firstMatchId) {
          setTimeout(() => {
            try {
              graph.value.focusElement(firstMatchId, { duration: 500 });
            } catch {
              if (import.meta.env.DEV) console.log('Focus element failed');
            }
          }, 300);
        }
      } else {
        ElMessage.warning('未找到匹配结果');
      }
    } else {
      searchResultCount.value = 0;
    }
    // 增量更新 G6 渲染（不再全量重建）
    if (graph.value && typeof graph.value.draw === 'function') {
      graph.value.draw();
    }
  }

  function clearSearch(): void {
    searchKeyword.value = '';
    highlightNodeIds.value.clear();
    if (graph.value && typeof graph.value.draw === 'function') {
      graph.value.draw();
    }
  }

  /**
   * 供外部组件（如 TreePage 三代亲属高亮）调用，传入高亮节点 id 数组。
   * - 清空旧高亮后写入新集合，触发 G6 增量重绘
   * - 传入空数组表示清空高亮
   */
  function setHighlight(ids: Array<string | number>): void {
    highlightNodeIds.value.clear();
    for (const id of ids ?? []) {
      highlightNodeIds.value.add(String(id));
    }
    searchResultCount.value = highlightNodeIds.value.size;
    if (graph.value && typeof graph.value.draw === 'function') {
      graph.value.draw();
    }
  }

  function handleGenderFilterChange(): void {
    // [P0-1 2026-09-03] 过滤谓词变化：重建缓存，确保 style 回调读到的三谓词匹配是最新的
    rebuildNodeFilterCache(graph.value?.getNodeData?.() || []);
    if (graph.value && typeof graph.value.draw === 'function') {
      graph.value.draw();
    }
  }

  function handlePhotoFilterChange(): void {
    // [P0-1 2026-09-03] 过滤谓词变化：重建缓存，确保 style 回调读到的三谓词匹配是最新的
    rebuildNodeFilterCache(graph.value?.getNodeData?.() || []);
    if (graph.value && typeof graph.value.draw === 'function') {
      graph.value.draw();
    }
  }

  // 注意：filterPopoverVisible 由主文件模板 v-model 控制，这里不导出。
  return {
    // 状态
    searchKeyword,
    filterGender,
    showOnlyWithPhotos,
    highlightNodeIds,
    searchResultCount,
    filters,
    anyFilterActive,
    // 谓词 + cache（暴露给主文件中 G6 style 回调使用）
    matchesSearch: (n: any) => matchesSearch(n, searchKeyword.value),
    matchesGenderFilter: (n: any) => matchesGenderFilter(n, filterGender.value),
    matchesPhotoFilter: (n: any) => matchesPhotoFilter(n, showOnlyWithPhotos.value),
    rebuildNodeFilterCache,
    getFilterMatch,
    // 传统过滤
    applyTraditionalFilters,
    // 搜索 handlers
    handleSearchDebounced,
    handleSearch,
    clearSearch,
    setHighlight,
    handleGenderFilterChange,
    handlePhotoFilterChange,
  };
}