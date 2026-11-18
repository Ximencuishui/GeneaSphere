<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const route = useRoute()
const clanSlug = computed(() => String(route.params.slug || '1'))

const exportOptions = ref({
  type: 'all',
  format: 'json',
})
const exporting = ref(false)
const tasks = ref<any[]>([])

const exportTypes = [
  { value: 'all', label: '全部数据（ZIP）' },
  { value: 'members', label: '成员数据' },
  { value: 'relationships', label: '家族关系' },
  { value: 'media', label: '影像清单' },
  { value: 'migration', label: '迁徙记录' },
  { value: 'logs', label: '操作日志' },
]

const formatOptions = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
]

const statusText: Record<string, string> = {
  pending: '排队中',
  processing: '处理中',
  completed: '可下载',
  failed: '失败',
}

const loadTasks = async () => {
  const res = await axios.get('/api/admin/settings/exports', {
    params: { clanSlug: clanSlug.value },
  })
  tasks.value = res.data.data || []
}

const handleExport = async () => {
  exporting.value = true
  try {
    await axios.post('/api/admin/settings/exports', {
      clanSlug: clanSlug.value,
      type: exportOptions.value.type,
      format: exportOptions.value.format,
    })
    ElMessage.success('已提交导出，完成后会收到站内信')
    await loadTasks()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '提交失败')
  } finally {
    exporting.value = false
  }
}

const downloadTask = async (row: any) => {
  try {
    const res = await axios.get(`/api/admin/settings/exports/${row.id}/download`, {
      params: { clanSlug: clanSlug.value },
      responseType: 'blob',
    })
    const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = row.file_name || `export-${row.id}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '下载失败')
  }
}

onMounted(loadTasks)
</script>

<template>
  <div class="data-export-page">
    <div class="page-header">
      <h2>数据导出</h2>
    </div>

    <el-card class="export-card">
      <template #header>
        <span>提交导出任务</span>
      </template>

      <el-form :model="exportOptions" label-width="120px">
        <el-form-item label="导出类型">
          <el-select v-model="exportOptions.type" style="width: 240px;">
            <el-option
              v-for="item in exportTypes"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="族谱格式">
          <el-select v-model="exportOptions.format" style="width: 240px;">
            <el-option
              v-for="item in formatOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="exporting" @click="handleExport">
            提交任务
          </el-button>
          <el-button @click="loadTasks">刷新</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 16px;">
      <template #header>
        <span>导出记录</span>
      </template>
      <el-table :data="tasks" stripe>
        <el-table-column prop="created_at" label="提交时间" min-width="160">
          <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column prop="format" label="格式" width="80" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">{{ statusText[row.status] || row.status }}</template>
        </el-table-column>
        <el-table-column prop="error_message" label="说明" min-width="160" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'completed'"
              size="small"
              type="primary"
              @click="downloadTask(row)"
            >
              下载
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="export-tips" style="margin-top: 16px;">
      <template #header>
        <span>导出说明</span>
      </template>
      <ul class="tips-list">
        <li>任务在后台生成，完成后通过站内信通知，文件保留 7 天</li>
        <li>全部数据打成 ZIP：族谱 JSON 或 CSV、迁徙 CSV、操作日志 CSV、影像清单 CSV</li>
        <li>本地或对象存储能读到的影像原文件会放进 ZIP。清单写出是否打进包和原因。有影像但一个原文件都读不到时，任务标为失败，不记成完成。没有影像的家族仍可完成。</li>
        <li>当前没有 Excel 导出，请使用 CSV 或 JSON</li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.data-export-page {
  padding: 20px;
  max-width: 960px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.tips-list {
  margin: 0;
  padding-left: 20px;
  color: #666;
}

.tips-list li {
  line-height: 2;
}
</style>
