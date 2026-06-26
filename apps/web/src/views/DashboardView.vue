<script setup lang="ts">
import { defineAsyncComponent } from "vue"
import { useAuthStore } from "@/stores/auth"
import { useGenealogyStore } from "@/stores/genealogy"

// 异步加载 GenealogyTree 组件（含 @antv/g6 1MB+ 重库）：
// 避免 vendor-antv 阻塞 DashboardView 的挂载。
const GenealogyTree = defineAsyncComponent(
  () => import("@/components/GenealogyTree.vue"),
)

const authStore = useAuthStore()
const genealogyStore = useGenealogyStore()
</script>

<template>
  <div class="dashboard">
    <div class="header">
      <h1>族谱树</h1>
      <ElButton type="danger" @click="authStore.logout">
        Logout
      </ElButton>
    </div>
    <div class="content">
      <div class="tree-container">
        <GenealogyTree />
      </div>
      <div class="detail-panel">
        <h2>详情</h2>
        <div v-if="genealogyStore.selectedNode" class="detail-content">
          <ElDescriptions :column="1" border>
            <ElDescriptionsItem label="姓名">
              {{ genealogyStore.selectedNode.full_name || genealogyStore.selectedNode.label }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="性别">
              {{ genealogyStore.selectedNode.gender === 'male' ? '男' : '女' }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="出生日期" v-if="genealogyStore.selectedNode.birth_date">
              {{ genealogyStore.selectedNode.birth_date }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="逝世日期" v-if="genealogyStore.selectedNode.death_date">
              {{ genealogyStore.selectedNode.death_date }}
            </ElDescriptionsItem>
          </ElDescriptions>
        </div>
        <div v-else class="empty-state">
          <ElEmpty description="请点击节点查看详情" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h1 {
  margin: 0;
}

.content {
  flex: 1;
  display: flex;
  gap: 20px;
}

.tree-container {
  flex: 1;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  overflow: hidden;
}

.detail-panel {
  width: 320px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.detail-panel h2 {
  margin: 0 0 16px 0;
  font-size: 18px;
}

.detail-content {
  flex: 1;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>