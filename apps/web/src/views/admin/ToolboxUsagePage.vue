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
  tool: '',
  startDate: '',
  endDate: '',
})

// 加载列表
const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/toolbox-usage/list', {
      params: {
        clanSlug: clanId.value,
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
        tool: filters.value.tool || undefined,
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
      params: { clanSlug: clanId.value },
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
  filters.value = { tool: '', startDate: '', endDate: '' }
  handleSearch()
}

// 分页
const handlePageChange = (page: number) => {
  pagination.value.page = page
  fetchList()
}

// 获取工具名称
const getToolName = (tool: string) => {
  const toolMap: Record<string, string> = {
    memory_quiz: '族谱问答',
    ocr: 'OCR识别',
    face_compare: '人脸比对',
    name_analysis: '姓名分析',
    biography_rewrite: '生平改写',
    image_enhance: '图片增强',
  }
  return toolMap[tool] || tool
}

// 获取状态标签
const getStatusTag = (status: string) => {
  const statusMap: Record<string, { type: string; text: string }> = {
    success: { type: 'success', text: '成功' },
    failed: { type: 'danger', text: '失败' },
    pending: { type: 'warning', text: '处理中' },
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
        <div class="stat-value">{{ stats.total_usage || 0 }}</div>
      </el-card>
      <el-card class="stat-card">
        <template #header>
          <span>本月使用</span>
        </template>
        <div class="stat-value">{{ stats.monthly_usage || 0 }}</div>
      </el-card>
      <el-card class="stat-card">
        <template #header>
          <span>使用成员数</span>
        </template>
        <div class="stat-value">{{ stats.unique_users || 0 }}</div>
      </el-card>
      <el-card class="stat-card">
        <template #header>
          <span>成功率</span>
        </template>
        <div class="stat-value">{{ stats.success_rate || 0 }}%</div>
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
        <el-table-column prop="count" label="使用次数" />
        <el-table-column prop="users" label="使用人数" />
        <el-table-column label="占比" width="150">
          <template #default="{ row }">
            <el-progress
              :percentage="stats.total_usage > 0 ? Math.round((row.count / stats.total_usage) * 100) : 0"
              :stroke-width="8"
            />
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 筛选 -->
    <el-card class="filter-card" style="margin-top: 16px;">
      <el-form :inline="true" :model="filters">
        <el-form-item label="工具类型">
          <el-select v-model="filters.tool" placeholder="全部" clearable style="width: 150px;">
            <el-option label="族谱问答" value="memory_quiz" />
            <el-option label="OCR识别" value="ocr" />
            <el-option label="人脸比对" value="face_compare" />
            <el-option label="姓名分析" value="name_analysis" />
            <el-option label="生平改写" value="biography_rewrite" />
            <el-option label="图片增强" value="image_enhance" />
          </el-select>
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
          {{ getToolName(row.tool) }}
        </template>
      </el-table-column>
      <el-table-column prop="input_summary" label="输入摘要" min-width="200" show-overflow-tooltip />
      <el-table-column prop="output_summary" label="输出摘要" min-width="200" show-overflow-tooltip />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="getStatusTag(row.status).type" size="small">
            {{ getStatusTag(row.status).text }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="duration_ms" label="耗时(ms)" width="100">
        <template #default="{ row }">
          {{ row.duration_ms ? `${row.duration_ms}ms` : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="使用时间" width="160">
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
