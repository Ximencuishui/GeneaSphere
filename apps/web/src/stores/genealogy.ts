import { defineStore } from "pinia"
import { ref } from "vue"
import type { GenealogyNode } from "@/types"

export type ViewMode = 'compact' | 'detailed' | 'portrait' | 'xianshi' | 'su' | 'zhe'

/** 卡片信息密度。与视图模式独立：简洁维持现卡片，详情加高并多一行字辈/排行。 */
export type CardDensity = 'simple' | 'detailed'

/** 现代卡片 / 古籍垂丝图 / 欧谱横格表。与视图模式独立，切换时整图重排。 */
export type TreeStyle = 'modern' | 'traditional' | 'european'

/** 全局世系 / 以某人为中心的亲属聚焦 */
export type TreeViewType = 'global' | 'focus'

export const useGenealogyStore = defineStore("genealogy", () => {
  const selectedNode = ref<GenealogyNode | null>(null)
  /** 每次点中人物都 +1，同一张卡片再点也会变，用来把抽屉从编辑态拉回详情。 */
  const selectionNonce = ref(0)
  const treeData = ref<GenealogyNode | null>(null)
  const viewMode = ref<ViewMode>('detailed')
  /** 默认简洁，避免一进页面就把已经调好的卡片撑高。 */
  const cardDensity = ref<CardDensity>('simple')
  /** 默认现代卡片。古谱是垂丝图。欧谱是五世一图的表格，不走画布。 */
  const treeStyle = ref<TreeStyle>('modern')
  const mainLineage = ref<string[]>([])
  const totalPersons = ref(0)
  const isLoading = ref(false)

  /** 当前画的是整棵世系，还是上下若干代的聚焦窗 */
  const viewType = ref<TreeViewType>('global')
  /** 聚焦窗的中心人物。全局模式下保留上次选择，方便再次进入聚焦。 */
  const focusCenterId = ref<string | null>(null)
  /** 向上追溯的父系代数，缺省 3 */
  const ancestorDepth = ref(3)
  /** 向下展开的子孙代数，缺省 3 */
  const descendantDepth = ref(3)

  const selectNode = (node: GenealogyNode | null) => {
    selectedNode.value = node
    if (node) selectionNonce.value += 1
  }

  const setTreeData = (data: GenealogyNode | null) => {
    treeData.value = data
  }

  const setViewMode = (mode: ViewMode) => {
    viewMode.value = mode
  }

  const setCardDensity = (density: CardDensity) => {
    cardDensity.value = density
  }

  const setTreeStyle = (style: TreeStyle) => {
    treeStyle.value = style
  }

  const setViewType = (type: TreeViewType) => {
    viewType.value = type
  }

  /** 记下中心人物并切到聚焦。真正拉数由画布组件做。 */
  const setFocusCenter = (id: string | number | null) => {
    focusCenterId.value = id == null || id === '' ? null : String(id)
    if (focusCenterId.value) viewType.value = 'focus'
  }

  const setMainLineage = (lineage: string[]) => {
    mainLineage.value = lineage
  }

  const isInMainLineage = (nodeId: string | number): boolean => {
    return mainLineage.value.includes(String(nodeId))
  }

  return {
    selectedNode,
    selectionNonce,
    treeData,
    viewMode,
    cardDensity,
    treeStyle,
    viewType,
    focusCenterId,
    ancestorDepth,
    descendantDepth,
    mainLineage,
    totalPersons,
    isLoading,
    selectNode,
    setTreeData,
    setViewMode,
    setCardDensity,
    setTreeStyle,
    setViewType,
    setFocusCenter,
    setMainLineage,
    isInMainLineage,
  }
})
