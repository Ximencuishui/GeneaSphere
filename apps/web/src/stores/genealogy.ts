import { defineStore } from "pinia"
import { ref } from "vue"
import type { GenealogyNode } from "@/types"

export type ViewMode = 'compact' | 'detailed' | 'portrait'

export const useGenealogyStore = defineStore("genealogy", () => {
  const selectedNode = ref<GenealogyNode | null>(null)
  const treeData = ref<GenealogyNode | null>(null)
  const viewMode = ref<ViewMode>('detailed')
  const mainLineage = ref<string[]>([])
  const totalPersons = ref(0)
  const isLoading = ref(false)

  const selectNode = (node: GenealogyNode | null) => {
    selectedNode.value = node
  }

  const setTreeData = (data: GenealogyNode | null) => {
    treeData.value = data
  }

  const setViewMode = (mode: ViewMode) => {
    viewMode.value = mode
  }

  const setMainLineage = (lineage: string[]) => {
    mainLineage.value = lineage
  }

  const isInMainLineage = (nodeId: string | number): boolean => {
    return mainLineage.value.includes(String(nodeId))
  }

  return {
    selectedNode,
    treeData,
    viewMode,
    mainLineage,
    totalPersons,
    isLoading,
    selectNode,
    setTreeData,
    setViewMode,
    setMainLineage,
    isInMainLineage,
  }
})
