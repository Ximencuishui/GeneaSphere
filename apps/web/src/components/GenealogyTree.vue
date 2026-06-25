<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue';
import { Graph, treeToGraphData } from '@antv/g6';
import { ElMessage } from 'element-plus';
import {
  ZoomIn,
  ZoomOut,
  ScaleToOriginal,
  Plus,
  Loading,
  Search,
  Refresh,
  Grid,
  Rank,
  Male,
  Female,
  User,
  Connection,
  List,
  Warning,
  CircleClose,
} from '@element-plus/icons-vue';
import { useGenealogyStore } from '@/stores/genealogy';
import type { ViewMode } from '@/stores/genealogy';
import { treeApi } from '@/api/tree';
import type { GenealogyNode } from '@/types';

const props = defineProps<{
  clanId?: string;
  rootPersonId?: string;
}>();

const container = ref<HTMLDivElement | null>(null);
const graph = ref<any>(null);
const genealogyStore = useGenealogyStore();
const loading = ref(false);
/** 画布内错误占位状态：null 表示无错误 */
const errorState = ref<{ code: number; message: string } | null>(null);
const searchKeyword = ref('');
const layoutDirection = ref<'TB' | 'LR'>('TB');
const filterGender = ref<'all' | 'male' | 'female'>('all');
const highlightNodeIds = ref<Set<string>>(new Set());
const showOnlyWithPhotos = ref(false);
const searchResultCount = ref(0);

// ==================== Loading Stage Progress ====================
/**
 * 加载阶段：
 * - fetch   ：向后端拉取家族数据（最重的一步，可能因为大族谱而耗时较长）
 * - parse   ：将原始数据转换为 G6 节点格式
 * - render  ：G6 创建图实例、设置布局、渲染节点与连线
 * - finalize：自适应缩放 / 滚动归位 / 清理临时态
 *
 * 设计要点：
 * 1. 每个阶段都有目标百分比，定时器以 30ms 步长平滑增长，给人「有进度」的感觉
 * 2. 进入下一阶段时百分比会跳到该阶段起点附近，再平滑增长，避免视觉上「回退」
 * 3. 完成后进度条快速到 100% 并延迟 220ms 关闭，给用户一个「完成」的视觉确认
 * 4. 报错时进度条直接停在该阶段，由错误占位 UI 接管
 */
type LoadingStage = 'fetch' | 'parse' | 'render' | 'finalize';
const loadingStage = ref<LoadingStage | null>(null);
const loadingPercent = ref(0);
/** 阶段对应百分比上限（含平滑缓冲），避免阶段切换时进度倒退 */
const STAGE_TARGETS: Record<LoadingStage, number> = {
  fetch: 32,
  parse: 60,
  render: 88,
  finalize: 100,
};
/** 阶段起点：进入该阶段时进度条先跳到这里的最小值，再向上增长 */
const STAGE_STARTS: Record<LoadingStage, number> = {
  fetch: 0,
  parse: 30,
  render: 58,
  finalize: 86,
};
let progressTimer: number | null = null;
let hideTimer: number | null = null;

const stageLabelMap: Record<LoadingStage, string> = {
  fetch: '正在拉取家族数据…',
  parse: '正在解析谱系结构…',
  render: '正在渲染族谱树…',
  finalize: '正在适配画布…',
};
const loadingMessage = computed(() =>
  loadingStage.value ? stageLabelMap[loadingStage.value] : '正在加载族谱树…',
);

function clearProgressTimer() {
  if (progressTimer !== null) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function clearHideTimer() {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

/**
 * 切换加载阶段，并平滑增长进度到该阶段目标值
 * - 同阶段重复调用：忽略（避免重复启动定时器）
 * - 跨阶段调用：先跳到该阶段起点附近，再平滑增长
 */
function setLoadingStage(stage: LoadingStage) {
  if (loadingStage.value === stage) return;
  loadingStage.value = stage;
  const target = STAGE_TARGETS[stage];
  const start = Math.max(STAGE_STARTS[stage], loadingPercent.value);
  // 立刻把进度拉到阶段起点（不会回退），再开定时器增长到 target
  if (loadingPercent.value < start) loadingPercent.value = start;
  clearProgressTimer();
  progressTimer = window.setInterval(() => {
    if (loadingPercent.value >= target) {
      clearProgressTimer();
      return;
    }
    // 距离目标越远，步长越大；临近目标时放缓，给用户「接近完成」的视觉感
    const remaining = target - loadingPercent.value;
    const step = remaining > 20 ? 3 : remaining > 5 ? 1.5 : 0.6;
    loadingPercent.value = Math.min(target, +(loadingPercent.value + step).toFixed(1));
  }, 30);
}

/** 开始加载：清空进度，进入 fetch 阶段 */
function startLoading() {
  clearHideTimer();
  loading.value = true;
  loadingPercent.value = 0;
  loadingStage.value = null;
  setLoadingStage('fetch');
}

/** 加载成功：快速跑到 100%，再延迟关闭，让用户看到「完成」 */
function finishLoading() {
  clearProgressTimer();
  loadingPercent.value = 100;
  loadingStage.value = 'finalize';
  clearHideTimer();
  hideTimer = window.setTimeout(() => {
    loading.value = false;
    loadingStage.value = null;
    loadingPercent.value = 0;
  }, 240);
}

/** 加载失败：停在当前进度，由错误占位 UI 接管（保留 progressTimer 已停止） */
function failLoading() {
  clearProgressTimer();
  clearHideTimer();
  loading.value = false;
}

// ==================== View Mode Configuration ====================

const viewModeConfig = computed(() => ({
  compact: {
    nodeWidth: 120,
    nodeHeight: 50,
    avatarSize: 0,
    nameFontSize: 13,
    sublabelFontSize: 0,
    nodeSep: 40,
    rankSep: 100,
  },
  detailed: {
    nodeWidth: 170,
    nodeHeight: 82,
    avatarSize: 44,
    nameFontSize: 14,
    sublabelFontSize: 11,
    nodeSep: 50,
    rankSep: 140,
  },
  portrait: {
    nodeWidth: 110,
    nodeHeight: 125,
    avatarSize: 62,
    nameFontSize: 13,
    sublabelFontSize: 10,
    nodeSep: 30,
    rankSep: 160,
  },
}));

// ==================== Data Fetching ====================

/**
 * 族谱树错误处理辅助
 * - 401：未登录（族谱可公开，但有些家族可能要求登录；保留为可重试场景）
 * - 403：无权限
 * - 404：家族不存在
 * - 5xx：服务器内部错误
 */
function describeError(status: number, fallback: string): string {
  if (status === 401) return '登录已过期，请重新登录后再访问族谱';
  if (status === 403) return '当前账号无权查看此族谱';
  if (status === 404) return '未找到该家族，可能已被删除';
  if (status >= 500) return '服务器开小差了，请稍后重试';
  return fallback;
}

const fetchTreeData = async (rootId: string = '1') => {
  // 拉取阶段：进入 fetch，progressTimer 会驱动 0→32% 平滑增长
  startLoading();
  errorState.value = null;
  try {
    if (props.clanId) {
      const response: any = await treeApi.getClanFullTree(props.clanId);
      // API 完成：进入 parse 阶段，进度条会跳到 30 附近再平滑增长到 60%
      setLoadingStage('parse');
      if (response?.rootNode) {
        genealogyStore.setMainLineage(response.mainLineage || []);
        genealogyStore.totalPersons = response.totalPersons || 0;
        return response.rootNode;
      }
    }
    setLoadingStage('parse');
    const data = await treeApi.getSubTree(rootId);
    return data;
  } catch (error: any) {
    // request 拦截器会同时弹出顶部 toast
    const status: number = error?.status || error?.response?.status || 0;
    const message: string = error?.message || String(error);
    errorState.value = {
      code: status || 500,
      message: describeError(status, message),
    };
    // 报错：停止定时器，进度条冻结在当前位置，错误占位接管
    failLoading();
    // 不再吞错：抛出以便外层可观察
    throw error;
  }
  // 注意：成功路径不在这里 finally 关闭 loading，因为后续还要经过 parse→render→finalize
};

/** 重试入口：清除错误态并重新拉取 */
const retryLoad = async () => {
  errorState.value = null;
  const rootId = props.rootPersonId || '1';
  try {
    const data = await fetchTreeData(rootId);
    if (data) {
      const treeData = (data as any).data || data;
      genealogyStore.setTreeData(treeData);
      initGraph(treeData);
    }
  } catch {
    // 错误已由 fetchTreeData 内设置到 errorState，无需再处理
  }
};

// ==================== Data Transformation ====================

const transformToG6Data = (node: GenealogyNode): any => {
  const isMainLineage = genealogyStore.isInMainLineage(node.id);

  const result: any = {
    id: String(node.id),
    label: node.full_name || node.label || '',
    data: {
      gender: node.gender,
      is_living: node.is_living,
      birth_year: node.birth_date ? new Date(node.birth_date).getFullYear() : undefined,
      death_year: node.death_date ? new Date(node.death_date).getFullYear() : undefined,
      has_photo: node.has_photo,
      thumbnail_url: node.thumbnail_url,
      avatar_url: node.avatar_url,
      is_main_lineage: isMainLineage,
      original: node,
    },
  };

  if (node.children && node.children.length > 0) {
    result.children = node.children.map((child) => transformToG6Data(child));
  }

  return result;
};

// ==================== Search & Filter ====================

const matchesSearch = (node: any): boolean => {
  if (!searchKeyword.value) return true;
  const keyword = searchKeyword.value.toLowerCase();
  const label = (node.label || '').toLowerCase();
  const name = (node.data?.original?.full_name || '').toLowerCase();
  return label.includes(keyword) || name.includes(keyword);
};

const matchesGenderFilter = (node: any): boolean => {
  if (filterGender.value === 'all') return true;
  return node.data?.gender === filterGender.value;
};

const matchesPhotoFilter = (node: any): boolean => {
  if (!showOnlyWithPhotos.value) return true;
  return node.data?.has_photo === true;
};

// Generate initial avatar SVG based on gender and name
const generateAvatarSvg = (name: string, gender: string): string => {
  const initial = name ? name.charAt(0) : '?';
  const bgColor = gender === 'male' ? '#1976D2' : '#C2185B';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
    <circle cx="40" cy="40" r="40" fill="${bgColor}" opacity="0.15"/>
    <text x="40" y="46" text-anchor="middle" fill="${bgColor}" font-size="32" font-weight="600">${initial}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

// ==================== Graph Initialization ====================

const initGraph = (data: GenealogyNode) => {
  if (!container.value) return;

  if (graph.value) {
    graph.value.destroy();
  }

  const width = container.value.offsetWidth;
  const height = container.value.offsetHeight;
  const config = viewModeConfig.value[genealogyStore.viewMode];

  // 数据转换发生在 initGraph 之前的调用点（见 onMounted/retryLoad），这里直接进入 render 阶段
  setLoadingStage('render');

  const treeData = transformToG6Data(data);
  const graphData = treeToGraphData(treeData);

  const g6Graph = new Graph({
    container: container.value,
    width,
    height,
    autoFit: 'view',
    autoResize: true,
    behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element', 'tooltip'],
    layout: {
      type: 'compact-box',
      direction: layoutDirection.value,
      nodeSep: config.nodeSep,
      rankSep: config.rankSep,
      getId: (d: any) => d.id,
    },
    node: {
      type: 'rect',
      style: {
        size: [config.nodeWidth, config.nodeHeight],
        radius: 8,
        fill: (d: any) => {
          if (!matchesSearch(d) || !matchesGenderFilter(d) || !matchesPhotoFilter(d)) {
            return '#F5F0E8';
          }
          if (d.data?.is_main_lineage) {
            return '#FFF8E7';
          }
          if (d.data?.is_living) {
            return d.data?.gender === 'male' ? '#E8F4FD' : '#FDE8F0';
          }
          return '#FAFAFA';
        },
        stroke: (d: any) => {
          const isSelected = genealogyStore.selectedNode?.id === Number(d.id);
          if (isSelected) return '#C9A96E';

          if (!matchesSearch(d) || !matchesGenderFilter(d) || !matchesPhotoFilter(d)) {
            return '#D0D0D0';
          }
          if (d.data?.is_main_lineage) return '#C9A96E';
          if (!d.data?.is_living) return '#A1887F';
          return d.data?.gender === 'male' ? '#90CAF9' : '#F48FB1';
        },
        lineWidth: (d: any) => {
          const isSelected = genealogyStore.selectedNode?.id === Number(d.id);
          if (isSelected) return 4;
          if (!d.data?.is_living) return 3;
          if (d.data?.is_main_lineage) return 2.5;
          return 1.5;
        },
        shadowColor: (d: any) => {
          if (genealogyStore.selectedNode?.id === Number(d.id)) return 'rgba(201, 169, 110, 0.4)';
          if (d.data?.is_main_lineage) return 'rgba(201, 169, 110, 0.2)';
          return 'transparent';
        },
        shadowBlur: (d: any) => {
          if (genealogyStore.selectedNode?.id === Number(d.id)) return 16;
          if (d.data?.is_main_lineage) return 8;
          return 0;
        },
        shadowOffsetX: 0,
        shadowOffsetY: 4,
        cursor: 'pointer',
        opacity: (d: any) => {
          if (!matchesSearch(d) || !matchesGenderFilter(d) || !matchesPhotoFilter(d)) {
            return 0.4;
          }
          return 1;
        },

        // Avatar image
        iconSrc: (d: any) => {
          if (config.avatarSize === 0) return undefined;
          if (d.data?.thumbnail_url) return d.data.thumbnail_url;
          return generateAvatarSvg(
            d.label || d.data?.original?.full_name || '',
            d.data?.gender || 'male',
          );
        },
        iconWidth: config.avatarSize,
        iconHeight: config.avatarSize,
        iconOffset: (_d: any) => {
          if (genealogyStore.viewMode === 'portrait') {
            return [0, -20];
          }
          return [-(config.nodeWidth / 2 - 28), 0];
        },
        iconRadius: config.avatarSize / 2,

        // Name label
        labelText: (d: any) => {
          const name = d.label || '';
          if (genealogyStore.viewMode === 'portrait') {
            return name.length > 6 ? name.substring(0, 5) + '..' : name;
          }
          return name.length > 8 ? name.substring(0, 7) + '..' : name;
        },
        labelFill: (d: any) => {
          if (!matchesSearch(d) || !matchesGenderFilter(d) || !matchesPhotoFilter(d)) {
            return '#B0B0B0';
          }
          return '#2C3E50';
        },
        labelFontSize: config.nameFontSize,
        labelFontWeight: 600,
        labelPlacement: genealogyStore.viewMode === 'portrait' ? 'bottom' : 'right',
        labelOffset: genealogyStore.viewMode === 'portrait' ? [0, 30] : [10, 0],

        // Sublabel (years)
        sublabelText: (d: any) => {
          if (genealogyStore.viewMode === 'compact' || config.sublabelFontSize === 0) {
            return '';
          }
          const birth = d.data?.birth_year;
          const death = d.data?.death_year;
          if (birth && death) return `${birth} - ${death}`;
          if (birth) return `${birth} - `;
          return '';
        },
        sublabelFill: (d: any) => {
          if (!matchesSearch(d) || !matchesGenderFilter(d) || !matchesPhotoFilter(d)) {
            return '#D0D0D0';
          }
          return '#7F8C8D';
        },
        sublabelFontSize: config.sublabelFontSize,
        sublabelPlacement: 'bottom',
        sublabelOffset: genealogyStore.viewMode === 'portrait' ? [0, 10] : [0, -2],

        // Gender dot for compact mode
        ...(genealogyStore.viewMode === 'compact' && {
          iconSrc: (d: any) => {
            return d.data?.gender === 'male'
              ? `data:image/svg+xml;base64,${btoa('<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" fill="#1976D2" opacity="0.6"/></svg>')}`
              : `data:image/svg+xml;base64,${btoa('<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" fill="#C2185B" opacity="0.6"/></svg>')}`;
          },
          iconWidth: 12,
          iconHeight: 12,
          iconOffset: [-(config.nodeWidth / 2 - 14), 0],
        }),
      },
    },
    edge: {
      type: 'cubic-horizontal',
      style: {
        stroke: (d: any) => {
          const sourceMatched = matchesSearch(d.source) && matchesGenderFilter(d.source);
          const targetMatched = matchesSearch(d.target) && matchesGenderFilter(d.target);
          return (sourceMatched && targetMatched) ? '#B0BEC5' : '#E8E0D8';
        },
        lineWidth: 2,
        endArrow: false,
        shadowColor: 'rgba(0, 0, 0, 0.05)',
        shadowBlur: 2,
      },
    },
  });

  // Node click event
  g6Graph.on('node:click', (e: any) => {
    const nodeModel = e.target?.getAttribute?.('model') || e.item?.getModel();
    if (nodeModel?.data?.original) {
      genealogyStore.selectNode(nodeModel.data.original as GenealogyNode);
      refreshGraph();
    }
  });

  // Tooltip configuration using G6 v5 API
  g6Graph.on('node:mouseenter', (e: any) => {
    const nodeModel = e.target?.getAttribute?.('model') || e.item?.getModel();
    if (nodeModel?.data?.original) {
      const data = nodeModel.data;
      const name = data.original.full_name || data.original.label || '未知';
      const gender = data.gender === 'male' ? '男' : '女';
      const birthYear = data.birth_year ? `出生: ${data.birth_year}` : '';
      const deathYear = data.death_year ? `去世: ${data.death_year}` : '';
      const status = data.is_living ? '在世' : '已故';
      
      const tooltipContent = `
        <div style="padding: 8px 12px; min-width: 140px; background: rgba(255, 255, 255, 0.98); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid rgba(201, 169, 110, 0.2);">
          <div style="font-weight: 600; color: #5D4037; margin-bottom: 4px;">${name}</div>
          <div style="display: flex; gap: 8px; font-size: 12px; color: #7F8C8D;">
            <span>${gender}</span>
            <span>${status}</span>
          </div>
          ${birthYear && `<div style="font-size: 12px; color: #999; margin-top: 4px;">${birthYear} ${deathYear}</div>`}
        </div>
      `;
      
      const event = e.originalEvent as MouseEvent;
      const tooltip = document.createElement('div');
      tooltip.innerHTML = tooltipContent;
      tooltip.style.position = 'fixed';
      tooltip.style.left = `${event.clientX + 15}px`;
      tooltip.style.top = `${event.clientY + 15}px`;
      tooltip.style.zIndex = '1000';
      tooltip.style.pointerEvents = 'none';
      tooltip.id = 'g6-tooltip';
      document.body.appendChild(tooltip);
      
      const removeTooltip = () => {
        const el = document.getElementById('g6-tooltip');
        if (el) el.remove();
      };
      
      g6Graph.once('node:mouseleave', removeTooltip);
      
      document.addEventListener('click', removeTooltip, { once: true });
    }
  });

  g6Graph.setData(graphData);
  g6Graph.render();
  graph.value = g6Graph;
  // 渲染完成：进度条快速跑满到 100% 再延迟关闭
  finishLoading();
};

// ==================== Search Handler ====================

const handleSearch = () => {
  if (!graph.value || !genealogyStore.treeData) return;
  highlightNodeIds.value.clear();
  
  if (searchKeyword.value) {
    let count = 0;
    const findAllMatches = (node: any) => {
      if (matchesSearch(node)) {
        highlightNodeIds.value.add(String(node.id));
        count++;
      }
      if (node.children) {
        node.children.forEach(findAllMatches);
      }
    };
    const treeData = transformToG6Data(genealogyStore.treeData);
    findAllMatches(treeData);
    searchResultCount.value = count;
    
    if (count > 0) {
      ElMessage.info(`找到 ${count} 个匹配结果`);
      const firstMatchId = highlightNodeIds.value.values().next().value;
      if (firstMatchId) {
        setTimeout(() => {
          try {
            graph.value.focusElement(firstMatchId, { duration: 500 });
          } catch {
            console.log('Focus element failed');
          }
        }, 300);
      }
    } else {
      ElMessage.warning('未找到匹配结果');
    }
  } else {
    searchResultCount.value = 0;
  }
  refreshGraph();
};

const clearSearch = () => {
  searchKeyword.value = '';
  highlightNodeIds.value.clear();
  refreshGraph();
};

// ==================== Layout Controls ====================

const toggleLayout = () => {
  layoutDirection.value = layoutDirection.value === 'TB' ? 'LR' : 'TB';
  ElMessage.success(`已切换为${layoutDirection.value === 'TB' ? '纵向' : '横向'}布局`);
  if (genealogyStore.treeData) {
    initGraph(genealogyStore.treeData);
  }
};

const handleViewModeChange = (mode: ViewMode) => {
  genealogyStore.setViewMode(mode);
  if (genealogyStore.treeData) {
    initGraph(genealogyStore.treeData);
  }
};

const handleGenderFilterChange = () => {
  refreshGraph();
};

const refreshGraph = () => {
  if (graph.value && genealogyStore.treeData) {
    initGraph(genealogyStore.treeData);
  }
};

// ==================== Zoom Controls ====================

const zoomIn = () => {
  if (graph.value) {
    const zoom = graph.value.getZoom();
    graph.value.zoomTo(zoom * 1.2);
  }
};

const zoomOut = () => {
  if (graph.value) {
    const zoom = graph.value.getZoom();
    graph.value.zoomTo(zoom / 1.2);
  }
};

const resetZoom = () => {
  if (graph.value) {
    graph.value.fitView();
  }
};

const focusMainLineage = () => {
  if (!graph.value || genealogyStore.mainLineage.length === 0) {
    ElMessage.info('未找到主传承线路数据');
    return;
  }
  const rootId = genealogyStore.mainLineage[0];
  try {
    graph.value.focusElement(rootId);
  } catch {
    ElMessage.info('无法聚焦，请手动缩放定位');
  }
};

const addPerson = () => {
  ElMessage.info('添加人员功能开发中');
};

// ==================== Watch & Lifecycle ====================

watch(
  () => genealogyStore.selectedNode,
  () => {
    refreshGraph();
  },
);

onMounted(async () => {
  await nextTick();
  const rootId = props.rootPersonId || '1';
  try {
    const data = await fetchTreeData(rootId);
    if (data) {
      const treeData = (data as any).data || data;
      genealogyStore.setTreeData(treeData);
      initGraph(treeData);
    }
  } catch {
    // 错误已在 fetchTreeData 中设置到 errorState，画布将展示错误占位
  }
});

onUnmounted(() => {
  // 清理进度定时器，避免组件卸载后定时器还在跑
  clearProgressTimer();
  clearHideTimer();
  if (graph.value) {
    graph.value.destroy();
    graph.value = null;
  }
});

defineExpose({
  zoomIn,
  zoomOut,
  resetZoom,
  addPerson,
  refresh: refreshGraph,
  focusMainLineage,
});
</script>

<template>
  <div class="genealogy-tree-container">
    <!-- Enhanced Warm-Toned Toolbar -->
    <div class="tree-toolbar">
      <!-- Search Section -->
      <div class="toolbar-section">
        <div class="section-label">搜索</div>
        <div class="toolbar-search">
          <el-input
            v-model="searchKeyword"
            :placeholder="searchResultCount > 0 ? `找到 ${searchResultCount} 个结果` : '搜索姓名...'"
            :prefix-icon="Search"
            :suffix-icon="searchResultCount > 0 ? 'Check' : undefined"
            clearable
            @keyup.enter="handleSearch"
            @clear="clearSearch"
            @input="handleSearch"
            size="default"
            style="width: 200px"
            :class="{ 'has-search-result': searchResultCount > 0 }"
          />
        </div>
      </div>

      <el-divider direction="vertical" />

      <!-- View Mode Section -->
      <div class="toolbar-section">
        <div class="section-label">视图</div>
        <div class="view-mode-switcher">
          <el-button-group>
            <el-button
              :type="genealogyStore.viewMode === 'compact' ? 'primary' : 'default'"
              @click="handleViewModeChange('compact')"
              size="small"
              title="紧凑视图"
            >
              <el-icon><List /></el-icon>
              <span class="btn-text">紧凑</span>
            </el-button>
            <el-button
              :type="genealogyStore.viewMode === 'detailed' ? 'primary' : 'default'"
              @click="handleViewModeChange('detailed')"
              size="small"
              title="详细视图"
            >
              <el-icon><Grid /></el-icon>
              <span class="btn-text">详细</span>
            </el-button>
            <el-button
              :type="genealogyStore.viewMode === 'portrait' ? 'primary' : 'default'"
              @click="handleViewModeChange('portrait')"
              size="small"
              title="肖像视图"
            >
              <el-icon><User /></el-icon>
              <span class="btn-text">肖像</span>
            </el-button>
          </el-button-group>
        </div>
      </div>

      <el-divider direction="vertical" />

      <!-- Filter Section -->
      <div class="toolbar-section">
        <div class="section-label">筛选</div>
        <div class="filter-group">
          <el-select
            v-model="filterGender"
            placeholder="全部"
            @change="handleGenderFilterChange"
            size="small"
            style="width: 80px"
          >
            <el-option label="全部" value="all" />
            <el-option label="男" value="male" />
            <el-option label="女" value="female" />
          </el-select>

          <el-checkbox
            v-model="showOnlyWithPhotos"
            @change="refreshGraph"
            size="small"
          >
            仅照片
          </el-checkbox>
        </div>
      </div>

      <el-divider direction="vertical" />

      <!-- Layout Section -->
      <div class="toolbar-section">
        <div class="section-label">布局</div>
        <el-button
          @click="toggleLayout"
          :icon="layoutDirection === 'TB' ? Grid : Rank"
          size="small"
          :type="layoutDirection === 'TB' ? 'primary' : 'default'"
          title="切换布局方向"
        >
          {{ layoutDirection === 'TB' ? '纵向' : '横向' }}
        </el-button>
      </div>

      <div class="toolbar-spacer"></div>

      <!-- Actions Section -->
      <div class="toolbar-section actions-section">
        <el-button-group class="zoom-controls">
          <el-button @click="zoomIn" size="small" title="放大">
            <el-icon><ZoomIn /></el-icon>
          </el-button>
          <el-button @click="zoomOut" size="small" title="缩小">
            <el-icon><ZoomOut /></el-icon>
          </el-button>
          <el-button @click="resetZoom" size="small" title="重置视图">
            <el-icon><ScaleToOriginal /></el-icon>
          </el-button>
        </el-button-group>

        <el-button
          @click="focusMainLineage"
          size="small"
          title="聚焦传承线路"
          :type="genealogyStore.mainLineage.length ? 'warning' : 'default'"
        >
          <el-icon><Connection /></el-icon>
          <span class="btn-text">传承</span>
        </el-button>

        <el-button @click="refreshGraph" :icon="Refresh" size="small" title="刷新" />

        <el-button type="primary" @click="addPerson" :icon="Plus" size="small">
          添加
        </el-button>
      </div>
    </div>

    <!-- Stats Bar -->
    <div class="tree-stats" v-if="genealogyStore.treeData">
      <span class="stat-item">
        总人数: <strong>{{ genealogyStore.totalPersons || '-' }}</strong>
      </span>
      <span class="stat-divider">|</span>
      <span class="stat-item">
        视图: <strong>{{ genealogyStore.viewMode === 'compact' ? '紧凑' : genealogyStore.viewMode === 'detailed' ? '详细' : '肖像' }}</strong>
      </span>
      <span class="stat-divider">|</span>
      <span class="stat-item">
        布局: <strong>{{ layoutDirection === 'TB' ? '纵向' : '横向' }}</strong>
      </span>
      <span class="stat-item lineage-hint" v-if="genealogyStore.mainLineage.length">
        <el-icon><Connection /></el-icon> 金色高亮为主传承线路
      </span>
    </div>

    <!-- Loading with staged progress -->
    <div v-if="loading" class="tree-loading">
      <div class="loading-content">
        <div class="loading-icon-wrapper">
          <el-icon class="is-loading" :size="44"><Loading /></el-icon>
        </div>
        <p class="loading-text">{{ loadingMessage }}</p>
        <el-progress
          :percentage="Math.floor(loadingPercent)"
          :stroke-width="6"
          :show-text="false"
          :duration="0"
          color="#C9A96E"
          class="loading-progress"
        />
        <div class="loading-meta">
          <span class="loading-percent">{{ Math.floor(loadingPercent) }}%</span>
          <span class="loading-stage-hint" v-if="loadingStage">
            {{ stageLabelMap[loadingStage] }}
          </span>
        </div>
      </div>
    </div>

    <!-- 错误占位：族谱树加载失败时显示，并提供重试入口 -->
    <div v-else-if="errorState" class="tree-error-placeholder">
      <div class="error-card">
        <el-icon :size="56" color="#C9A96E"><Warning /></el-icon>
        <h3 class="error-title">族谱树暂不可用</h3>
        <p class="error-message">{{ errorState.message }}</p>
        <p class="error-code" v-if="errorState.code">错误码：{{ errorState.code }}</p>
        <div class="error-actions">
          <el-button type="primary" :icon="Refresh" @click="retryLoad">重新加载</el-button>
          <el-button :icon="User" @click="$router?.push?.('/login')" v-if="errorState.code === 401">重新登录</el-button>
        </div>
      </div>
    </div>

    <!-- Graph Container -->
    <div ref="container" class="genealogy-tree-canvas" v-show="!loading && !errorState"></div>
  </div>
</template>

<style scoped>
.genealogy-tree-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #FAF8F5 0%, #F5F0E8 100%);
  overflow: hidden;
}

.tree-toolbar {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  background: rgba(255, 252, 248, 0.95);
  backdrop-filter: blur(12px);
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(93, 64, 55, 0.1);
  border: 1px solid rgba(201, 169, 110, 0.25);
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: #8D6E63;
  min-width: 36px;
  text-align: right;
}

.toolbar-search {
  display: flex;
  align-items: center;
}

.toolbar-spacer {
  flex: 1;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.actions-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-controls {
  background: rgba(201, 169, 110, 0.1);
  border-radius: 8px;
}

.view-mode-switcher .el-button.is-primary {
  background: #C9A96E;
  border-color: #C9A96E;
}

.view-mode-switcher .el-button.is-primary:hover {
  background: #B8944E;
  border-color: #B8944E;
}

.btn-text {
  display: inline-block;
  font-size: 12px;
}

.has-search-result {
  box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.3);
  border-color: #4CAF50 !important;
}

.tree-stats {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 252, 248, 0.9);
  backdrop-filter: blur(8px);
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 12px;
  color: #7F8C8D;
  border: 1px solid rgba(201, 169, 110, 0.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.stat-divider {
  color: #DDD;
}

.stat-item strong {
  color: #5D4037;
}

.lineage-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #C9A96E;
}

.tree-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(250, 248, 245, 0.92);
  backdrop-filter: blur(4px);
  z-index: 20;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 32px 40px;
  min-width: 320px;
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid rgba(201, 169, 110, 0.25);
  box-shadow: 0 8px 32px rgba(93, 64, 55, 0.12);
}

.loading-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(201, 169, 110, 0.08);
  color: #C9A96E;
}

.loading-text {
  color: #5D4037;
  font-size: 15px;
  font-weight: 500;
  margin: 0;
  letter-spacing: 0.5px;
}

.loading-progress {
  width: 280px;
  margin: 0;
}

/* Element Plus 进度条内部颜色统一为金色 */
.loading-progress :deep(.el-progress-bar__inner) {
  background: linear-gradient(90deg, #E8C887 0%, #C9A96E 100%);
  transition: width 80ms linear;
}

.loading-progress :deep(.el-progress-bar__outer) {
  background-color: rgba(201, 169, 110, 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.loading-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 280px;
  font-size: 12px;
  color: #8D6E63;
}

.loading-percent {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-weight: 600;
  color: #C9A96E;
}

.loading-stage-hint {
  font-size: 11px;
  color: #B0A18F;
}

/* 错误占位：族谱树加载失败时居中显示 */
.tree-error-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(250, 248, 245, 0.95);
  backdrop-filter: blur(6px);
  z-index: 20;
}

.error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 48px;
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid rgba(201, 169, 110, 0.3);
  box-shadow: 0 8px 32px rgba(93, 64, 55, 0.12);
  max-width: 420px;
  text-align: center;
}

.error-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #5D4037;
}

.error-message {
  margin: 0;
  font-size: 14px;
  color: #5D4037;
  line-height: 1.6;
}

.error-code {
  margin: 0;
  font-size: 12px;
  color: #8D6E63;
  font-family: monospace;
}

.error-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.genealogy-tree-canvas {
  width: 100%;
  height: 100%;
  background-image:
    radial-gradient(circle at 20% 50%, rgba(201, 169, 110, 0.06) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(93, 64, 55, 0.04) 0%, transparent 50%);
}

@media (max-width: 1200px) {
  .tree-toolbar {
    flex-direction: column;
    align-items: stretch;
    padding: 10px 12px;
  }
  .toolbar-left,
  .toolbar-center,
  .toolbar-right {
    flex-wrap: wrap;
  }
}

@media (max-width: 768px) {
  .tree-toolbar {
    top: 8px;
    left: 8px;
    right: 8px;
    padding: 8px;
  }
  .tree-stats {
    font-size: 10px;
    padding: 4px 12px;
    gap: 8px;
  }
}
</style>
