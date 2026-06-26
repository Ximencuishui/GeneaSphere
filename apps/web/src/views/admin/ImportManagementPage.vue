<script setup lang="ts">
/**
 * PDF 导入管理页面
 * 功能：导入记录管理、任务监控、OCR 使用统计
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { Document, VideoPlay, List, DataAnalysis } from '@element-plus/icons-vue'

const route = useRoute()

const clanSlug = ref('')
const loading = ref(false)
const activeTab = ref('logs')

// 分页参数
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)

// 导入记录
const importLogs = ref<any[]>([])
const logLoading = ref(false)
const logStatusFilter = ref('')

// 活跃任务
const activeTasks = ref<any[]>([])
const taskLoading = ref(false)

// OCR 统计
const ocrStats = ref<any>(null)
const statsLoading = ref(false)

// 初始化
onMounted(() => {
  clanSlug.value = (route.params.slug as string) || localStorage.getItem('demo_clan_slug') || 'zhuxi-demo'
  fetchOcrStats()
})

// 获取导入记录列表
const fetchImportLogs = async () => {
  logLoading.value = true
  try {
    const res = await axios.get('/api/admin/import/logs', {
      params: {
        clanSlug: clanSlug.value,
        page: currentPage.value,
        pageSize: pageSize.value,
        status: logStatusFilter.value || undefined,
      },
    })
    importLogs.value = res.data.data
    total.value = res.data.pagination.total
  } catch (error) {
    console.error('Failed to fetch import logs:', error)
    ElMessage.error('获取导入记录失败')
  } finally {
    logLoading.value = false
  }
}

// 获取活跃任务
const fetchActiveTasks = async () => {
  taskLoading.value = true
  try {
    const res = await axios.get('/api/admin/import/tasks/active', {
      params: { clanSlug: clanSlug.value },
    })
    activeTasks.value = res.data.data
  } catch (error) {
    console.error('Failed to fetch active tasks:', error)
    ElMessage.error('获取活跃任务失败')
  } finally {
    taskLoading.value = false
  }
}

// 获取 OCR 统计
const fetchOcrStats = async () => {
  statsLoading.value = true
  try {
    const res = await axios.get('/api/admin/import/ocr-stats', {
      params: { clanSlug: clanSlug.value },
    })
    ocrStats.value = res.data
  } catch (error) {
    console.error('Failed to fetch OCR stats:', error)
    ElMessage.error('获取 OCR 统计失败')
  } finally {
    statsLoading.value = false
  }
}

// 切换 Tab
const handleTabChange = (tab: string) => {
  activeTab.value = tab
  currentPage.value = 1
  if (tab === 'logs') {
    fetchImportLogs()
  } else if (tab === 'tasks') {
    fetchActiveTasks()
  }
}

// 监听 Tab 变化
const onTabClick = (tab: any) => {
  handleTabChange(tab.props.name)
}

// 翻页
const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchImportLogs()
}

// 状态筛选
const onStatusFilterChange = () => {
  currentPage.value = 1
  fetchImportLogs()
}

// 格式化文件大小
const formatFileSize = (size: string) => {
  const bytes = BigInt(size)
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (Number(bytes) / 1024).toFixed(1) + ' KB'
  return (Number(bytes) / (1024 * 1024)).toFixed(1) + ' MB'
}

// 获取状态标签类型
const getStatusType = (status: string): string => {
  switch (status) {
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'importing': return 'warning'
    default: return 'info'
  }
}

// 获取状态中文
const getStatusText = (status: string): string => {
  const statusMap: Record<string, string> = {
    pending: '等待中',
    parsing: '解析中',
    preview: '预览中',
    correcting: '校正中',
    importing: '导入中',
    completed: '已完成',
    failed: '失败',
  }
  return statusMap[status] || status
}

// 解析模式中文
const getParseModeText = (mode: string): string => {
  return mode === 'ocr' ? 'OCR 识别' : '文本解析'
}

// 初始化加载
onMounted(() => {
  fetchImportLogs()
})
</script>

<template>
  <div class="import-management-page">
    <el-card class="page-header">
      <template #header>
        <div class="card-header">
          <h2>PDF 导入管理</h2>
        </div>
      </template>

      <!-- Tab 切换 -->
      <el-tabs v-model="activeTab" @tab-click="onTabClick">
        <!-- 导入记录 -->
        <el-tab-pane label="导入记录" name="logs">
          <div class="tab-toolbar">
            <el-select
              v-model="logStatusFilter"
              placeholder="状态筛选"
              clearable
              @change="onStatusFilterChange"
              style="width: 150px"
            >
              <el-option label="全部" value="" />
              <el-option label="等待中" value="pending" />
              <el-option label="解析中" value="parsing" />
              <el-option label="预览中" value="preview" />
              <el-option label="校正中" value="correcting" />
              <el-option label="导入中" value="importing" />
              <el-option label="已完成" value="completed" />
              <el-option label="失败" value="failed" />
            </el-select>
            <el-button @click="fetchImportLogs">刷新</el-button>
          </div>

          <el-table
            :data="importLogs"
            v-loading="logLoading"
            stripe
            style="width: 100%"
          >
            <el-table-column prop="task_id" label="任务ID" width="120" show-overflow-tooltip />
            <el-table-column prop="user_phone" label="用户" width="120" />
            <el-table-column prop="file_name" label="文件名" show-overflow-tooltip />
            <el-table-column prop="file_size" label="大小" width="100">
              <template #default="{ row }">
                {{ formatFileSize(row.file_size) }}
              </template>
            </el-table-column>
            <el-table-column prop="parse_mode" label="解析模式" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.parse_mode === 'ocr' ? 'warning' : 'success'">
                  {{ getParseModeText(row.parse_mode) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="total_pages" label="页数" width="70" align="center" />
            <el-table-column prop="success_records" label="成功" width="70" align="center">
              <template #default="{ row }">
                <span class="success-text">{{ row.success_records }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="failed_records" label="失败" width="70" align="center">
              <template #default="{ row }">
                <span v-if="row.failed_records > 0" class="error-text">{{ row.failed_records }}</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="getStatusType(row.status)">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="160">
              <template #default="{ row }">
                {{ new Date(row.created_at).toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" size="small" link>
                  详情
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-pagination
            v-model:current-page="currentPage"
            :page-size="pageSize"
            :total="total"
            layout="total, prev, pager, next"
            @current-change="handlePageChange"
            style="margin-top: 16px; justify-content: flex-end"
          />
        </el-tab-pane>

        <!-- 活跃任务 -->
        <el-tab-pane label="活跃任务" name="tasks">
          <div class="tab-toolbar">
            <el-button @click="fetchActiveTasks">刷新</el-button>
          </div>

          <el-table
            :data="activeTasks"
            v-loading="taskLoading"
            stripe
            style="width: 100%"
          >
            <el-table-column prop="task_id" label="任务ID" width="120" show-overflow-tooltip />
            <el-table-column prop="user_phone" label="用户" width="120" />
            <el-table-column prop="file_name" label="文件名" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="getStatusType(row.status)">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="progress" label="进度" width="180">
              <template #default="{ row }">
                <el-progress :percentage="row.progress" :stroke-width="8" />
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="160">
              <template #default="{ row }">
                {{ new Date(row.created_at).toLocaleString() }}
              </template>
            </el-table-column>
          </el-table>

          <el-empty v-if="activeTasks.length === 0 && !taskLoading" description="暂无活跃任务" />
        </el-tab-pane>

        <!-- OCR 统计 -->
        <el-tab-pane label="OCR 统计" name="stats">
          <div class="tab-toolbar">
            <el-button @click="fetchOcrStats">刷新</el-button>
          </div>

          <div v-loading="statsLoading">
            <!-- 本月统计卡片 -->
            <el-row :gutter="20" style="margin-bottom: 20px">
              <el-col :span="6">
                <el-card shadow="hover">
                  <el-statistic title="本月 OCR 任务" :value="ocrStats?.monthly?.ocr_tasks || 0">
                    <template #prefix>
                      <el-icon><Document /></el-icon>
                    </template>
                  </el-statistic>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card shadow="hover">
                  <el-statistic title="本月文本解析" :value="ocrStats?.monthly?.text_tasks || 0">
                    <template #prefix>
                      <el-icon><List /></el-icon>
                    </template>
                  </el-statistic>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card shadow="hover">
                  <el-statistic title="总处理页数" :value="ocrStats?.monthly?.total_pages || 0">
                    <template #prefix>
                      <el-icon><VideoPlay /></el-icon>
                    </template>
                  </el-statistic>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card shadow="hover">
                  <el-statistic title="成功导入" :value="ocrStats?.monthly?.success_records || 0">
                    <template #prefix>
                      <el-icon><DataAnalysis /></el-icon>
                    </template>
                  </el-statistic>
                </el-card>
              </el-col>
            </el-row>

            <!-- 明细表格 -->
            <el-card>
              <template #header>
                <h4>本月详细数据</h4>
              </template>
              <el-descriptions :column="2" border v-if="ocrStats?.monthly">
                <el-descriptions-item label="总任务数">
                  {{ (ocrStats?.monthly?.ocr_tasks || 0) + (ocrStats?.monthly?.text_tasks || 0) }}
                </el-descriptions-item>
                <el-descriptions-item label="总记录数">
                  {{ ocrStats?.monthly?.total_records || 0 }}
                </el-descriptions-item>
                <el-descriptions-item label="成功记录">
                  <span class="success-text">{{ ocrStats?.monthly?.success_records || 0 }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="失败记录">
                  <span class="error-text">{{ ocrStats?.monthly?.failed_records || 0 }}</span>
                </el-descriptions-item>
              </el-descriptions>
            </el-card>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.import-management-page {
  padding: 20px;
}

.page-header {
  min-height: calc(100vh - 100px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h2 {
  margin: 0;
  font-size: 18px;
}

.tab-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
}

.success-text {
  color: #67c23a;
  font-weight: 500;
}

.error-text {
  color: #f56c6c;
  font-weight: 500;
}
</style>
