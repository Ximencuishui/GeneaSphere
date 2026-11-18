<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const route = useRoute()
const clanSlug = computed(() => route.params.slug || '1')

// 数据
const usageList = ref<any[]>([])
const stats = ref<any>(null)
const loading = ref(false)
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
})

// 筛选
const filters = ref({
  toolType: '',
  filterUserId: '',
  startDate: '',
  endDate: '',
})

// 加载列表
const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/toolbox-usage/list', {
      params: {
        clanSlug: clanSlug.value,
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
        toolType: filters.value.toolType || undefined,
        filterUserId: filters.value.filterUserId || undefined,
        startDate: filters.value.startDate || undefined,
        endDate: filters.value.endDate || undefined,
      },
    })
    usageList.value = res.data.data
    pagination.value.total = res.data.total
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 加载统计
const fetchStats = async () => {
  try {
    const res = await axios.get('/api/admin/toolbox-usage/stats', {
      params: { clanSlug: clanSlug.value },
    })
    stats.value = res.data
  } catch (e: any) {
    console.error('加载统计失败', e)
  }
}

// 搜索
const handleSearch = () => {
  pagination.value.page = 1
  fetchList()
}

// 重置
const handleReset = () => {
  filters.value = { toolType: '', filterUserId: '', startDate: '', endDate: '' }
  handleSearch()
}

// 分页
const handlePageChange = (page: number) => {
  pagination.value.page = page
  fetchList()
}

// 获取工具名称
const TOOL_NAMES: Record<string, string> = {
  restore: '修复',
  color: '上色',
  expand: '扩图',
  remove: '去物',
  compose: '拼图',
  enhance: '增强',
  animate: '动画',
}

const getToolName = (tool: string) => TOOL_NAMES[tool] || tool

const getStatusTag = (status: string) => {
  const statusMap: Record<string, { type: string; text: string }> = {
    completed: { type: 'success', text: '完成' },
    failed: { type: 'danger', text: '失败' },
    pending: { type: 'warning', text: '排队' },
    processing: { type: 'warning', text: '处理中' },
  }
  return statusMap[status] || { type: 'info', text: status }
}

onMounted(() => {
  fetchList()
  fetchStats()
})
</script>

<template>
  <div class="toolbox-usage-page">
    <div class="page-header">
      <h2>AI工具使用记录</h2>
    </div>

    <!-- 统计卡片 -->
    <div v-if="stats" class="stats-grid">
      <el-card class="stat-card">
        <template #header>
          <span>总使用次数</span>
        </template>
        <div class="stat-value">{{ stats.total?.usage_count || 0 }}</div>
      </el-card>
      <el-card class="stat-card">
        <template #header>
          <span>本月使用</span>
        </template>
        <div class="stat-value">{{ stats.this_month?.usage_count || 0 }}</div>
      </el-card>
      <el-card class="stat-card">
        <template #header>
          <span>本月消耗</span>
        </template>
        <div class="stat-value">{{ stats.this_month?.credits_used || 0 }}</div>
      </el-card>
      <el-card class="stat-card">
        <template #header>
          <span>剩余免费次数</span>
        </template>
        <div class="stat-value">{{ stats.remaining_free_credits || 0 }}</div>
      </el-card>
    </div>

    <!-- 工具使用分布 -->
    <el-card v-if="stats?.by_tool" class="tool-distribution" style="margin-top: 16px;">
      <template #header>
        <span>工具使用分布</span>
      </template>
      <el-table :data="stats.by_tool" stripe size="small">
        <el-table-column prop="tool" label="工具">
          <template #default="{ row }">
            {{ getToolName(row.tool) }}
          </template>
        </el-table-column>
        <el-table-column prop="count" label="本月次数" />
        <el-table-column prop="credits" label="本月消耗" />
      </el-table>
    </el-card>

    <!-- 筛选 -->
    <el-card class="filter-card" style="margin-top: 16px;">
      <el-form :inline="true" :model="filters">
        <el-form-item label="工具类型">
          <el-select v-model="filters.toolType" placeholder="全部" clearable style="width: 150px;">
            <el-option label="修复" value="restore" />
            <el-option label="上色" value="color" />
            <el-option label="扩图" value="expand" />
            <el-option label="去物" value="remove" />
            <el-option label="拼图" value="compose" />
            <el-option label="增强" value="enhance" />
            <el-option label="动画" value="animate" />
          </el-select>
        </el-form-item>
        <el-form-item label="使用者">
          <el-input v-model="filters.filterUserId" placeholder="用户ID" clearable style="width: 180px;" />
        </el-form-item>
        <el-form-item label="开始日期">
          <el-date-picker v-model="filters.startDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker v-model="filters.endDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 使用记录列表 -->
    <el-table :data="usageList" v-loading="loading" stripe style="margin-top: 16px;">
      <el-table-column prop="id" label="ID" width="80" show-overflow-tooltip />
      <el-table-column prop="user_name" label="使用者" width="100" />
      <el-table-column label="工具" width="120">
        <template #default="{ row }">
          {{ getToolName(row.tool_type) }}
        </template>
      </el-table-column>
      <el-table-column prop="image_count" label="处理图片数" width="110" />
      <el-table-column prop="credits_used" label="消耗次数" width="100" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="getStatusTag(row.status).type" size="small">
            {{ getStatusTag(row.status).text }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="时间" width="160">
        <template #default="{ row }">
          {{ row.created_at ? new Date(row.created_at).toLocaleString() : '-' }}
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <el-pagination
      v-model:current-page="pagination.page"
      :total="pagination.total"
      :page-size="pagination.pageSize"
      @current-change="handlePageChange"
      layout="total, prev, pager, next"
      class="pagination"
    />
  </div>
</template>

<style scoped>
.toolbox-usage-page {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.stat-card {
  text-align: center;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #409eff;
  padding: 10px 0;
}

.filter-card {
  margin-bottom: 0;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
