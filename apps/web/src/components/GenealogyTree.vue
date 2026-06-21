<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { Graph, treeToGraphData } from '@antv/g6';
import { ElMessage } from 'element-plus';
import { useGenealogyStore } from '@/stores/genealogy';
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

/**
 * Fetch tree data from API
 */
const fetchTreeData = async (rootId: string = '1') => {
  loading.value = true;
  try {
    const data = await treeApi.getSubTree(rootId);
    return data;
  } catch (error: any) {
    ElMessage.error(error.message || '获取族谱树失败');
    return null;
  } finally {
    loading.value = false;
  }
};

/**
 * Transform tree data to G6 format
 */
const transformToG6Data = (node: GenealogyNode): any => {
  const result: any = {
    id: String(node.id),
    label: node.full_name || node.label,
    data: {
      gender: node.gender,
      is_living: node.is_living,
      birth_year: node.birth_date ? new Date(node.birth_date).getFullYear() : undefined,
      death_year: node.death_date ? new Date(node.death_date).getFullYear() : undefined,
      original: node,
    },
  };

  if (node.children && node.children.length > 0) {
    result.children = node.children.map((child) => transformToG6Data(child));
  }

  return result;
};

/**
 * Initialize G6 graph
 */
const initGraph = (data: GenealogyNode) => {
  if (!container.value) return;

  // Destroy existing graph
  if (graph.value) {
    graph.value.destroy();
  }

  const width = container.value.offsetWidth;
  const height = container.value.offsetHeight;

  // Transform data
  const treeData = transformToG6Data(data);
  const graphData = treeToGraphData(treeData);

  // Create graph
  const g6Graph = new Graph({
    container: container.value,
    width,
    height,
    autoFit: 'view',
    autoResize: true,
    behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
    layout: {
      type: 'compact-box',
      direction: 'TB',
      nodeSep: 50,
      rankSep: 120,
    },
    node: {
      type: 'rect',
      style: {
        size: [120, 60],
        radius: 8,
        fill: (d: any) => {
          if (d.data?.is_living) {
            return d.data?.gender === 'male' ? '#E3F2FD' : '#FCE4EC';
          }
          return '#F5F5F5';
        },
        stroke: (d: any) => {
          if (genealogyStore.selectedNode?.id === Number(d.id)) {
            return '#C9A96E';
          }
          return d.data?.gender === 'male' ? '#1976D2' : '#C2185B';
        },
        lineWidth: (d: any) => {
          return genealogyStore.selectedNode?.id === Number(d.id) ? 3 : 2;
        },
        labelText: (d: any) => d.label || d.data?.label || '',
        labelFill: '#333',
        labelFontSize: 14,
        labelFontWeight: 500,
        labelPlacement: 'center',
        sublabelText: (d: any) => {
          const birth = d.data?.birth_year;
          const death = d.data?.death_year;
          if (birth && death) {
            return `${birth} - ${death}`;
          } else if (birth) {
            return `${birth} - `;
          }
          return '';
        },
        sublabelFill: '#666',
        sublabelFontSize: 12,
        sublabelPlacement: 'bottom',
      },
    },
    edge: {
      type: 'polyline',
      style: {
        stroke: '#999',
        lineWidth: 2,
        endArrow: false,
      },
    },
    plugins: [
      {
        type: 'toolbar',
        position: 'top-right',
      },
    ],
  });

  // Node click event
  g6Graph.on('node:click', (e: any) => {
    const nodeModel = e.item?.getModel();
    if (nodeModel?.data?.original) {
      genealogyStore.selectNode(nodeModel.data.original as GenealogyNode);
      refreshGraph();
    }
  });

  // Set data and render
  g6Graph.setData(graphData);
  g6Graph.render();
  graph.value = g6Graph;
};

/**
 * Refresh graph (re-render with updated styles)
 */
const refreshGraph = () => {
  if (graph.value && genealogyStore.treeData) {
    initGraph(genealogyStore.treeData);
  }
};

/**
 * Zoom in
 */
const zoomIn = () => {
  if (graph.value) {
    const zoom = graph.value.getZoom();
    graph.value.zoomTo(zoom * 1.2);
  }
};

/**
 * Zoom out
 */
const zoomOut = () => {
  if (graph.value) {
    const zoom = graph.value.getZoom();
    graph.value.zoomTo(zoom / 1.2);
  }
};

/**
 * Reset zoom
 */
const resetZoom = () => {
  if (graph.value) {
    graph.value.fitView();
  }
};

/**
 * Add person (placeholder)
 */
const addPerson = () => {
  ElMessage.info('添加人员功能开发中');
};

// Watch for selected node changes
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
    genealogyStore.setTreeData(data);
    initGraph(data);
  }
});

onUnmounted(() => {
  if (graph.value) {
    graph.value.destroy();
    graph.value = null;
  }
});

// Expose methods
defineExpose({
  zoomIn,
  zoomOut,
  resetZoom,
  addPerson,
  refresh: () => {
    if (genealogyStore.treeData) {
      initGraph(genealogyStore.treeData);
    }
  },
});
</script>

<template>
  <div class="genealogy-tree-container">
    <!-- Toolbar -->
    <div class="tree-toolbar">
      <el-button-group>
        <el-button @click="zoomIn" title="放大">
          <el-icon><ZoomIn /></el-icon>
        </el-button>
        <el-button @click="zoomOut" title="缩小">
          <el-icon><ZoomOut /></el-icon>
        </el-button>
        <el-button @click="resetZoom" title="重置视图">
          <el-icon><ScaleToOriginal /></el-icon>
        </el-button>
      </el-button-group>

      <el-button type="primary" @click="addPerson" title="添加人员">
        <el-icon><Plus /></el-icon>
        添加人员
      </el-button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="tree-loading">
      <el-loading />
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
  background: #FAF8F5;
}

.tree-toolbar {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
  display: flex;
  gap: 12px;
  background: white;
  padding: 8px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.genealogy-tree-canvas {
  width: 100%;
  height: 100%;
}
</style>
