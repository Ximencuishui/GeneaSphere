<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const route = useRoute()
const clanSlug = computed(() => String(route.params.slug ?? '1'))

interface OldPdf {
  kind: 'edition' | 'source'
  title: string
  origin: string
  at: string | null
  document_id: string | null
  task_id: string | null
  file_url: string | null
  page_count: number | null
  file_size: string | null
  print_job: { id: string; status: string } | null
}

const list = ref<OldPdf[]>([])
const loading = ref(false)
const printingId = ref('')

async function loadList() {
  loading.value = true
  try {
    const res = await axios.get(`/api/genealogy/${clanSlug.value}/published-pdfs`)
    list.value = res.data?.data ?? res.data ?? []
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '旧谱加载失败')
  } finally {
    loading.value = false
  }
}

async function sourceBlob(item: OldPdf) {
  const response = await axios.get(`/api/genealogy/${clanSlug.value}/source-pdfs/${item.task_id}`, {
    responseType: 'blob',
  })
  const payload = response instanceof Blob ? response : response.data
  if (payload instanceof Blob) return payload
  return new Blob([payload], { type: 'application/pdf' })
}

async function errorText(err: any, fallback: string) {
  const data = err?.response?.data
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text())
      const message = parsed?.message
      if (typeof message === 'string' && message) return message
      if (Array.isArray(message) && message.length) return message.join('；')
    } catch {
      return fallback
    }
  }
  return data?.message || fallback
}

async function handleView(item: OldPdf) {
  if (item.file_url) {
    window.open(item.file_url, '_blank')
    return
  }
  try {
    const url = URL.createObjectURL(await sourceBlob(item))
    window.open(url, '_blank')
  } catch (err: any) {
    ElMessage.error(await errorText(err, '无法预览这份旧谱'))
  }
}

async function handleDownload(item: OldPdf) {
  const name = item.title.endsWith('.pdf') ? item.title : `${item.title}.pdf`
  if (item.file_url) {
    const link = document.createElement('a')
    link.href = item.file_url
    link.download = name
    link.click()
    return
  }
  try {
    const url = URL.createObjectURL(await sourceBlob(item))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (err: any) {
    ElMessage.error(await errorText(err, '无法下载这份旧谱'))
  }
}

async function handlePrint(item: OldPdf) {
  const key = item.document_id || item.task_id || ''
  printingId.value = key
  try {
    if (item.kind === 'source') {
      await axios.post(`/api/genealogy/${clanSlug.value}/source-pdfs/${item.task_id}/print`)
    } else {
      await axios.post(`/api/genealogy-documents/${clanSlug.value}/${item.document_id}/print-jobs`)
    }
    ElMessage.success('已创建印刷工作项')
    await loadList()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '下单印刷失败')
  } finally {
    printingId.value = ''
  }
}

function formatBytes(value: string | number | null) {
  const bytes = typeof value === 'string' ? Number(value) : value
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function printLabel(job: OldPdf['print_job']) {
  if (!job) return '未下单'
  if (job.status === 'PENDING') return '待印刷'
  return job.status
}

onMounted(loadList)
</script>

<template>
  <div class="page-container">
    <GenealogyWorkflowBar />
    <h2 class="page-title">旧谱</h2>
    <p class="page-desc">这里是已定稿的 PDF，以及从旧谱电子化上传的原件。可以预览、下载或下单印刷。要重新生成定稿，去册谱版式渲染。</p>

    <div class="toolbar">
      <ElButton @click="loadList">刷新</ElButton>
    </div>

    <ElTable v-loading="loading" :data="list" border stripe empty-text="还没有旧谱 PDF">
      <ElTableColumn prop="title" label="名称" />
      <ElTableColumn label="来源" width="120">
        <template #default="{ row }">
          <ElTag size="small" :type="row.kind === 'source' ? 'warning' : row.origin === '当前定稿' ? 'success' : 'info'">
            {{ row.origin }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="页数" width="80">
        <template #default="{ row }">{{ row.page_count ?? '—' }}</template>
      </ElTableColumn>
      <ElTableColumn label="文件大小" width="120">
        <template #default="{ row }">{{ formatBytes(row.file_size) }}</template>
      </ElTableColumn>
      <ElTableColumn label="时间" width="180">
        <template #default="{ row }">
          {{ row.at ? new Date(row.at).toLocaleString('zh-CN') : '—' }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="印刷" width="100">
        <template #default="{ row }">{{ printLabel(row.print_job) }}</template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <ElButton size="small" @click="handleView(row)">预览</ElButton>
          <ElButton size="small" type="primary" @click="handleDownload(row)">下载</ElButton>
          <ElButton
            size="small"
            type="success"
            :loading="printingId === (row.document_id || row.task_id)"
            @click="handlePrint(row)"
          >
            印刷
          </ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
  </div>
</template>

<style scoped>
.page-container { max-width: 1400px; margin: 0 auto; }
.page-title { margin: 0 0 8px; font-size: 22px; color: #303133; }
.page-desc { margin: 0 0 16px; color: #909399; font-size: 14px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
</style>
