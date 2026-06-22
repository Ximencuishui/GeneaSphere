<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'

interface Props {
  mainClanTree: TreeNode[]
  applicantTree?: TreeNode[]
  selectedId?: string
  mode?: 'single' | 'double'
  showApplicant?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'single',
  showApplicant: true,
})

const emit = defineEmits<{
  (e: 'select', node: TreeNode): void
}>()

const searchQuery = ref('')
const zoomLevel = ref(100)
const mainClanScrollContainer = ref<HTMLElement | null>(null)
const selectedNode = ref<TreeNode | null>(null)
const showOnlyWithPhotos = ref(false)

// 过滤树节点
const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
  if (!query) return nodes
  const lowerQuery = query.toLowerCase()
  return nodes
    .map((node) => {
      const matches = node.fullName.toLowerCase().includes(lowerQuery)
      const filteredChildren = filterTree(node.children || [], query)
      if (matches || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren }
      }
      return null
    })
    .filter(Boolean) as TreeNode[]
}

const filteredMainClanTree = computed(() => {
  let tree = filterTree(props.mainClanTree, searchQuery.value)
  if (showOnlyWithPhotos.value) {
    tree = filterByPhoto(tree)
  }
  return tree
})
const filteredApplicantTree = computed(() => {
  let tree = filterTree(props.applicantTree || [], searchQuery.value)
  if (showOnlyWithPhotos.value) {
    tree = filterByPhoto(tree)
  }
  return tree
})

// Filter nodes that have photos
const filterByPhoto = (nodes: TreeNode[]): TreeNode[] => {
  return nodes
    .map((node) => {
      const hasPhoto = node.hasPhoto
      const filteredChildren = filterByPhoto(node.children || [])
      if (hasPhoto || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren }
      }
      return null
    })
    .filter(Boolean) as TreeNode[]
}

// 处理节点点击
const handleNodeClick = (node: TreeNode) => {
  if (props.mode === 'single') {
    selectedNode.value = node
    emit('select', node)
  }
}

// 缩放控制
const zoomIn = () => {
  zoomLevel.value = Math.min(150, zoomLevel.value + 10)
}

const zoomOut = () => {
  zoomLevel.value = Math.max(50, zoomLevel.value - 10)
}

const resetZoom = () => {
  zoomLevel.value = 100
}

// 滚动到选中节点
const scrollToNode = (container: HTMLElement | null, nodeId: string) => {
  if (!container) return
  const element = container.querySelector(`[data-id="${nodeId}"]`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// 监听选中节点变化，自动滚动
watch(
  () => props.selectedId,
  (newId) => {
    if (newId) {
      scrollToNode(mainClanScrollContainer.value, newId)
    }
  },
)

// 渲染树形结构
const renderTree = (nodes: TreeNode[], depth = 0): TreeNode[] => {
  return nodes.map((node) => ({
    ...node,
    depth,
    children: node.children ? renderTree(node.children, depth + 1) : [],
  }))
}
</script>

<template>
  <div class="tree-select">
    <!-- 搜索和控制栏 -->
    <div class="toolbar">
      <el-input
        v-model="searchQuery"
        placeholder="搜索成员姓名..."
        :prefix-icon="Search"
        clearable
        class="search-input"
      />
      <el-checkbox v-model="showOnlyWithPhotos" size="small" class="photo-filter">
        仅显示有照片
      </el-checkbox>
      <div class="zoom-controls">
        <el-button-group>
          <el-button @click="zoomOut" :icon="'ZoomOut'">-</el-button>
          <el-button @click="resetZoom" :icon="'Refresh'">{{ zoomLevel }}%</el-button>
          <el-button @click="zoomIn" :icon="'ZoomIn'">+</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 双树展示 -->
    <div class="trees-container" :class="{ 'double-mode': showApplicant && applicantTree?.length }">
      <!-- 主家族树 -->
      <div class="tree-panel main-clan">
        <div class="panel-header">
          <span class="panel-title">主家族</span>
          <el-tag type="success" size="small">选择挂载点</el-tag>
        </div>
        <div class="tree-scroll-container" ref="mainClanScrollContainer">
          <div class="tree-content" :style="{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left' }">
            <template v-if="filteredMainClanTree.length">
              <TreeNode
                v-for="node in filteredMainClanTree"
                :key="node.id"
                :node="node"
                :selected-id="selectedNode?.id"
                :is-main-clan="true"
                @click="handleNodeClick"
              />
            </template>
            <el-empty v-else-if="searchQuery" description="未找到匹配成员" />
            <el-empty v-else description="暂无成员数据" />
          </div>
        </div>
      </div>

      <!-- 申请方支系树 -->
      <div v-if="showApplicant && applicantTree?.length" class="tree-panel applicant-clan">
        <div class="panel-header">
          <span class="panel-title">申请方支系</span>
          <el-tag type="warning" size="small">预览</el-tag>
        </div>
        <div class="tree-scroll-container">
          <div class="tree-content" :style="{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left' }">
            <template v-if="filteredApplicantTree.length">
              <TreeNode
                v-for="node in filteredApplicantTree"
                :key="node.id"
                :node="node"
                :selected-id="undefined"
                :is-main-clan="false"
                @click="() => {}"
              />
            </template>
            <el-empty v-else description="暂无支系数据" />
          </div>
        </div>
      </div>
    </div>

    <!-- 选中节点信息 -->
    <div v-if="selectedNode" class="selected-info">
      <el-divider content-position="left">已选择挂载点</el-divider>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="姓名">{{ selectedNode.fullName }}</el-descriptions-item>
        <el-descriptions-item label="性别">{{ selectedNode.gender === 'male' ? '男' : '女' }}</el-descriptions-item>
        <el-descriptions-item label="出生日期">{{ selectedNode.birthDate || '-' }}</el-descriptions-item>
        <el-descriptions-item label="去世日期">{{ selectedNode.deathDate || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="selectedNode.isLiving ? 'info' : 'danger'" size="small">
            {{ selectedNode.isLiving ? '在世' : '已故' }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </div>
  </div>
</template>

<script lang="ts">
// TreeNode 子组件
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

interface TreeNode {
  id: string
  fullName: string
  gender: 'male' | 'female'
  birthDate?: string
  deathDate?: string
  isLiving: boolean
  children?: TreeNode[]
  depth?: number
  selected?: boolean
  hasPhoto?: boolean
  thumbnailUrl?: string
}

const TreeNode = defineComponent({
  name: 'TreeNode',
  props: {
    node: {
      type: Object as PropType<TreeNode>,
      required: true,
    },
    selectedId: {
      type: String,
      default: null,
    },
    isMainClan: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['click'],
  setup(props, { emit }) {
    const handleClick = () => {
      if (props.isMainClan) {
        emit('click', props.node)
      }
    }

    const isSelected = () => props.selectedId === props.node.id

    return { handleClick, isSelected }
  },
  template: `
    <div class="tree-node-wrapper">
      <div
        class="tree-node"
        :class="{
          'is-selected': isSelected(),
          'is-living': node.isLiving,
          'is-deceased': !node.isLiving,
          'has-photo': node.hasPhoto,
          'clickable': isMainClan,
        }"
        :data-id="node.id"
        @click="handleClick"
      >
        <span v-if="node.thumbnailUrl" class="node-thumb">
          <img :src="node.thumbnailUrl" :alt="node.fullName" />
        </span>
        <span v-else class="node-icon">{{ node.gender === 'male' ? '♂' : '♀' }}</span>
        <span class="node-name">{{ node.fullName }}</span>
        <span v-if="node.isLiving" class="living-badge">在</span>
        <span v-else class="deceased-badge">故</span>
      </div>
      <div v-if="node.children?.length" class="tree-children">
        <TreeNode
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :selected-id="selectedId"
          :is-main-clan="isMainClan"
          @click="$emit('click', $event)"
        />
      </div>
    </div>
  `,
})

export default { name: 'TreeSelect', components: { TreeNode } }
</script>

<style scoped>
.tree-select {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f7fa;
  border-radius: 8px;
  overflow: hidden;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: white;
  border-bottom: 1px solid #e4e7ed;
}

.search-input {
  width: 300px;
}

.zoom-controls {
  display: flex;
  gap: 8px;
}

.trees-container {
  display: flex;
  flex: 1;
  min-height: 400px;
  overflow: hidden;
}

.trees-container.double-mode .tree-panel {
  width: 50%;
}

.tree-panel {
  display: flex;
  flex-direction: column;
  background: white;
  overflow: hidden;
}

.tree-panel:first-child {
  border-right: 1px solid #e4e7ed;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #fafafa;
  border-bottom: 1px solid #e4e7ed;
}

.panel-title {
  font-weight: 600;
  color: #303133;
}

.tree-scroll-container {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.tree-content {
  display: inline-block;
  min-width: 100%;
}

.tree-node-wrapper {
  padding-left: 24px;
  position: relative;
}

.tree-node-wrapper::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 0;
  height: 100%;
  border-left: 1px dashed #dcdfe6;
}

.tree-node-wrapper:first-child::before {
  top: 12px;
}

.tree-node {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  margin: 4px 0;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.tree-node.clickable:hover {
  background: #ecf5ff;
  border-color: #409eff;
}

.tree-node.is-selected {
  background: #409eff;
  border-color: #409eff;
  color: white;
}

.tree-node.is-living {
  background: #f0f9eb;
  border-color: #67c23a;
}

.tree-node.is-living.is-selected {
  background: #409eff;
}

.tree-node.is-deceased {
  border-color: #C9A96E;
  border-width: 2px;
  background: #FFFBF0;
}

.tree-node.is-deceased.is-selected {
  background: #C9A96E;
  border-color: #C9A96E;
  color: white;
}

.tree-node.has-photo .node-thumb {
  display: flex;
  align-items: center;
  margin-right: 8px;
}

.tree-node.has-photo .node-thumb img {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #C9A96E;
}

.node-thumb {
  display: flex;
  align-items: center;
  margin-right: 8px;
}

.node-thumb img {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #e4e7ed;
}

.deceased-badge {
  margin-left: 8px;
  padding: 2px 6px;
  background: #C9A96E;
  color: white;
  border-radius: 2px;
  font-size: 10px;
}

.photo-filter {
  margin-left: 12px;
}

.node-icon {
  margin-right: 8px;
  font-size: 14px;
}

.node-name {
  flex: 1;
  font-size: 14px;
}

.living-badge {
  margin-left: 8px;
  padding: 2px 6px;
  background: #67c23a;
  color: white;
  border-radius: 2px;
  font-size: 10px;
}

.tree-children {
  margin-left: 0;
}

.selected-info {
  padding: 16px;
  background: white;
  border-top: 1px solid #e4e7ed;
}
</style>
