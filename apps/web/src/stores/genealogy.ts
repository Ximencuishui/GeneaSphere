import { defineStore } from "pinia"
import { ref } from "vue"

export interface GenealogyNode {
  id: string
  name: string
  gender: "male" | "female"
  birthDate?: string
  deathDate?: string
  spouseId?: string
  children?: GenealogyNode[]
}

export const useGenealogyStore = defineStore("genealogy", () => {
  const selectedNode = ref<GenealogyNode | null>(null)
  const treeData = ref<GenealogyNode | null>(null)

  const selectNode = (node: GenealogyNode | null) => {
    selectedNode.value = node
  }

  const setTreeData = (data: GenealogyNode | null) => {
    treeData.value = data
  }

  return { selectedNode, treeData, selectNode, setTreeData }
})