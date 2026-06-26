<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const route = useRoute()
const clanSlug = computed(() => route.params.slug || '1')

// 导出选项
const exportOptions = ref({
  type: 'all',
  format: 'excel',
  includeDeceased: true,
  includePhotos: true,
  includeMedia: false,
})

// 导出状态
const exporting = ref(false)

// 导出类型列表
const exportTypes = [
  { value: 'all', label: '全部数据' },
  { value: 'members', label: '成员数据' },
  { value: 'relationships', label: '家族关系' },
  { value: 'media', label: '影像数据' },
  { value: 'migration', label: '迁徙记录' },
]

// 格式选项
const formatOptions = [
  { value: 'excel', label: 'Excel (.xlsx)' },
  { value: 'csv', label: 'CSV (.csv)' },
  { value: 'json', label: 'JSON (.json)' },
]

// 执行导出
const handleExport = async () => {
  exporting.value = true
  try {
    const params = new URLSearchParams()
    params.append('clanId', clanId.value as string)
    params.append('type', exportOptions.value.type)
    params.append('format', exportOptions.value.format)
    params.append('includeDeceased', String(exportOptions.value.includeDeceased))
    params.append('includePhotos', String(exportOptions.value.includePhotos))
    params.append('includeMedia', String(exportOptions.value.includeMedia))

    ElMessage.info('正在准备导出文件，请稍候...')

    const res = await axios.get(`/api/admin/settings/export?${params.toString()}`, {
      responseType: 'blob',
    })

    // 创建下载链接
    const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url

    // 生成文件名
    const timestamp = new Date().toISOString().slice(0, 10)
    const filename = `family_export_${timestamp}.${exportOptions.value.format}`
    link.download = filename

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    ElMessage.success('导出成功')
  } catch (e: any) {
    if (e.response?.status === 401) {
      ElMessage.error('请先登录')
    } else {
      ElMessage.error(e.message || '导出失败')
    }
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="data-export-page">
    <div class="page-header">
      <h2>数据导出</h2>
    </div>

    <el-card class="export-card">
      <template #header>
        <span>导出设置</span>
      </template>

      <el-form :model="exportOptions" label-width="120px">
        <el-form-item label="导出类型">
          <el-select v-model="exportOptions.type" style="width: 200px;">
            <el-option
              v-for="item in exportTypes"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="导出格式">
          <el-select v-model="exportOptions.format" style="width: 200px;">
            <el-option
              v-for="item in formatOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="导出选项">
          <el-checkbox v-model="exportOptions.includeDeceased">包含已故成员</el-checkbox>
          <el-checkbox v-model="exportOptions.includePhotos">包含照片信息</el-checkbox>
          <el-checkbox v-model="exportOptions.includeMedia">包含影像文件</el-checkbox>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="exporting" @click="handleExport">
            {{ exporting ? '导出中...' : '开始导出' }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="export-tips" style="margin-top: 16px;">
      <template #header>
        <span>导出说明</span>
      </template>
      <ul class="tips-list">
        <li>Excel 格式适合查看和打印，包含基本格式</li>
        <li>CSV 格式适合数据迁移或导入其他系统</li>
        <li>JSON 格式保留完整数据结构，适合程序处理</li>
        <li>影像文件需要单独下载，不包含在导出包中</li>
        <li>大量数据导出可能需要较长时间，请耐心等待</li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.data-export-page {
  padding: 20px;
  max-width: 800px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.export-card {
  margin-bottom: 0;
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
