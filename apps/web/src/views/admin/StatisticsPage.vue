<script setup lang="ts">
/**
 * 数据统计（独立路由访问）
 *
 * 内容已抽取到 StatisticsPanel 组件，与 DashboardPage 共享同一份数据展示。
 * 保留独立路由 /zupu/:slug/statistics 便于直接访问。
 */
import StatisticsPanel from '@/components/admin/StatisticsPanel.vue'
</script>

<template>
  <div class="statistics-page">
    <div class="page-header">
      <h2>数据统计</h2>
    </div>
    <StatisticsPanel />
  </div>
</template>

<style scoped>
.statistics-page {
  padding: 0;
}

.page-header {
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}
</style>