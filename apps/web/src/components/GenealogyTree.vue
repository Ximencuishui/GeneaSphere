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
  List
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
const searchKeyword = ref('');
const layoutDirection = ref<'TB' | 'LR'>('TB');
const filterGender = ref<'all' | 'male' | 'female'>('all');
const highlightNodeIds = ref<Set<string>>(new Set());
const showOnlyWithPhotos = ref(false);

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

const fetchTreeData = async (rootId: string = '1') => {
  loading.value = true;
  try {
    if (props.clanId) {
      const response: any = await treeApi.getClanFullTree(props.clanId);
      if (response?.rootNode) {
        genealogyStore.setMainLineage(response.mainLineage || []);
        genealogyStore.totalPersons = response.totalPersons || 0;
        return response.rootNode;
      }
    }
    const data = await treeApi.getSubTree(rootId);
    return data;
  } catch (error: any) {
    ElMessage.error(error.message || '获取族谱树失败');
    return null;
  } finally {
    loading.value = false;
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

  const treeData = transformToG6Data(data);
  const graphData = treeToGraphData(treeData);

  const g6Graph = new Graph({
    container: container.value,
    width,
    height,
    autoFit: 'view',
    autoResize: true,
    behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
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
          if (genealogyStore.selectedNode?.id === Number(d.id)) return 'rgba(201, 169, 110, 0.3)';
          if (d.data?.is_main_lineage) return 'rgba(201, 169, 110, 0.2)';
          return 'transparent';
        },
        shadowBlur: (d: any) => {
          if (genealogyStore.selectedNode?.id === Number(d.id)) return 12;
          if (d.data?.is_main_lineage) return 8;
          return 0;
        },
        shadowOffsetX: 0,
        shadowOffsetY: 2,

        // Avatar image
        iconSrc: (d: any) => {
          if (config.avatarSize === 0) return undefined;
          if (d.data?.thumbnail_url) return d.data.thumbnail_url;
          // Generate initial avatar if no photo
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

  g6Graph.setData(graphData);
  g6Graph.render();
  graph.value = g6Graph;
};

// ==================== Search Handler ====================

const handleSearch = () => {
  if (!graph.value || !genealogyStore.treeData) return;
  highlightNodeIds.value.clear();
  if (searchKeyword.value) {
    const findAllMatches = (node: any) => {
      if (matchesSearch(node)) {
        highlightNodeIds.value.add(String(node.id));
      }
      if (node.children) {
        node.children.forEach(findAllMatches);
      }
    };
    const treeData = transformToG6Data(genealogyStore.treeData);
    findAllMatches(treeData);
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
  const data = await fetchTreeData(rootId);
  if (data) {
    const treeData = data.data || data;
    genealogyStore.setTreeData(treeData);
    initGraph(treeData);
  }
});

onUnmounted(() => {
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
      <div class="toolbar-left">
        <div class="toolbar-search">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索姓名..."
            :prefix-icon="Search"
            clearable
            @keyup.enter="handleSearch"
            @clear="clearSearch"
            size="default"
            style="width: 160px"
          />
          <el-button type="primary" @click="handleSearch" :icon="Search" size="small">
            搜索
          </el-button>
        </div>

        <el-divider direction="vertical" />

        <!-- View Mode Switcher -->
        <div class="view-mode-switcher">
          <el-button-group>
            <el-button
              :type="genealogyStore.viewMode === 'compact' ? 'primary' : 'default'"
              @click="handleViewModeChange('compact')"
              size="small"
              title="紧凑视图"
            >
              <el-icon><List /></el-icon>
            </el-button>
            <el-button
              :type="genealogyStore.viewMode === 'detailed' ? 'primary' : 'default'"
              @click="handleViewModeChange('detailed')"
              size="small"
              title="详细视图"
            >
              <el-icon><Grid /></el-icon>
            </el-button>
            <el-button
              :type="genealogyStore.viewMode === 'portrait' ? 'primary' : 'default'"
              @click="handleViewModeChange('portrait')"
              size="small"
              title="肖像视图"
            >
              <el-icon><User /></el-icon>
            </el-button>
          </el-button-group>
        </div>
      </div>

      <div class="toolbar-center">
        <el-select
          v-model="filterGender"
          placeholder="性别"
          @change="handleGenderFilterChange"
          size="small"
          style="width: 100px"
        >
          <el-option label="全部" value="all" />
          <el-option label="男" value="male">
            <el-icon><Male /></el-icon>
            <span> 男</span>
          </el-option>
          <el-option label="女" value="female">
            <el-icon><Female /></el-icon>
            <span> 女</span>
          </el-option>
        </el-select>

        <el-checkbox
          v-model="showOnlyWithPhotos"
          @change="refreshGraph"
          size="small"
        >
          仅显示有照片
        </el-checkbox>

        <el-button
          @click="toggleLayout"
          :icon="layoutDirection === 'TB' ? Grid : Rank"
          size="small"
          title="切换布局方向"
        >
          {{ layoutDirection === 'TB' ? '纵向' : '横向' }}
        </el-button>
      </div>

      <div class="toolbar-right">
        <el-button-group>
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

    <!-- Loading -->
    <div v-if="loading" class="tree-loading">
      <div class="loading-content">
        <el-icon class="is-loading" :size="48"><Loading /></el-icon>
        <p class="loading-text">正在加载族谱树...</p>
      </div>
    </div>

    <!-- Graph Container -->
    <div ref="container" class="genealogy-tree-canvas"></div>
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
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  background: rgba(255, 252, 248, 0.95);
  backdrop-filter: blur(12px);
  padding: 10px 16px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(93, 64, 55, 0.1);
  border: 1px solid rgba(201, 169, 110, 0.25);
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-search {
  display: flex;
  align-items: center;
  gap: 6px;
}

.view-mode-switcher .el-button.is-primary {
  background: #C9A96E;
  border-color: #C9A96E;
}

.view-mode-switcher .el-button.is-primary:hover {
  background: #B8944E;
  border-color: #B8944E;
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
  background: rgba(250, 248, 245, 0.9);
  backdrop-filter: blur(4px);
  z-index: 20;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-text {
  color: #5D4037;
  font-size: 16px;
  font-weight: 500;
  margin: 0;
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
