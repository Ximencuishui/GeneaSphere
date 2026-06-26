<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'

const route = useRoute()
const clanSlug = computed(() => String(route.params.slug ?? '1'))

const list = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const styleFilter = ref<string>('')

const styleOptions = [
  { value: '', label: '全部' },
  { value: 'traditional', label: '传统悬挂式' },
  { value: 'modern', label: '现代图文混排' },
  { value: 'simple', label: '简约列表式' },
]

const diffDialogVisible = ref(false)
const diffResult = ref<any>(null)

async function loadList() {
  loading.value = true
  try {
    const res = await axios.get(`/api/genealogy-documents/${clanId.value}`, {
      params: {
        style: styleFilter.value || undefined,
        page: page.value,
        pageSize: pageSize.value,
      },
    })
    list.value = res.data?.items ?? []
    total.value = res.data?.total ?? 0
  } catch (err: any) {
    ElMessage.error(`加载失败：${err?.response?.data?.message ?? err.message}`)
  } finally {
    loading.value = false
  }
}

function handleView(item: any) {
  if (item.file_url) {
    window.open(item.file_url, '_blank')
  } else {
    ElMessage.warning('文件 URL 不可用')
  }
}

function handleDownload(item: any) {
  if (!item.file_url) return
  const link = document.createElement('a')
  link.href = item.file_url
  link.download = `${item.version_name}.pdf`
  link.click()
}

async function handleDelete(item: any) {
  try {
    await ElMessageBox.confirm(
      `确认删除版本 v${item.version_number} "${item.version_name}"？此操作不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await axios.delete(`/api/genealogy-documents/${clanId.value}/${item.id}`)
    ElMessage.success('已删除')
    loadList()
  } catch (err: any) {
    ElMessage.error(`删除失败：${err?.response?.data?.message ?? err.message}`)
  }
}

const selectedForDiff = ref<string[]>([])

async function handleDiff() {
  if (selectedForDiff.value.length !== 2) {
    ElMessage.warning('请选择两个版本进行对比')
    return
  }
  try {
    const res = await axios.get(`/api/genealogy-documents/${clanId.value}/diff`, {
      params: { idA: selectedForDiff.value[0], idB: selectedForDiff.value[1] },
    })
    diffResult.value = res.data
    diffDialogVisible.value = true
  } catch (err: any) {
    ElMessage.error(`对比失败：${err?.response?.data?.message ?? err.message}`)
  }
}

function formatBytes(b: number | null) {
  if (!b) return '-'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(2)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

function styleLabel(s: string) {
  return styleOptions.find((o) => o.value === s)?.label ?? s
}

onMounted(() => {
  loadList()
})
</script>

<template>
  <div class="page-container">
    <h2 class="page-title">族谱历史版本</h2>
    <p class="page-desc">查看、下载、对比历史生成的族谱文档版本</p>

    <div class="toolbar">
      <ElSelect v-model="styleFilter" placeholder="按风格筛选" clearable style="width: 200px" @change="loadList">
        <ElOption v-for="opt in styleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
      </ElSelect>
      <ElButton type="primary" :disabled="selectedForDiff.length !== 2" @click="handleDiff">
        对比所选版本 ({{ selectedForDiff.length }}/2)
      </ElButton>
      <ElButton @click="loadList">刷新</ElButton>
    </div>

    <ElTable
      v-loading="loading"
      :data="list"
      border
      stripe
      @selection-change="(rows: any[]) => selectedForDiff = rows.map(r => r.id)"
    >
      <ElTableColumn type="selection" width="50" />
      <ElTableColumn label="版本号" width="80">
        <template #default="{ row }">v{{ row.version_number }}</template>
      </ElTableColumn>
      <ElTableColumn prop="version_name" label="版本名称" />
      <ElTableColumn label="风格" width="120">
        <template #default="{ row }">
          <ElTag size="small">{{ styleLabel(row.style) }}</ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="页数" width="80" prop="page_count" />
      <ElTableColumn label="文件大小" width="120">
        <template #default="{ row }">{{ formatBytes(row.file_size) }}</template>
      </ElTableColumn>
      <ElTableColumn label="生成时间" width="180">
        <template #default="{ row }">
          {{ new Date(row.created_at).toLocaleString('zh-CN') }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <ElButton size="small" @click="handleView(row)">预览</ElButton>
          <ElButton size="small" type="primary" @click="handleDownload(row)">下载</ElButton>
          <ElButton size="small" type="danger" @click="handleDelete(row)">删除</ElButton>
        </template>
      </ElTableColumn>
    </ElTable>

    <ElPagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50]"
      layout="total, sizes, prev, pager, next, jumper"
      class="pagination"
      @current-change="loadList"
      @size-change="loadList"
    />

    <ElDialog v-model="diffDialogVisible" title="版本对比" width="640px">
      <div v-if="diffResult" class="diff-content">
        <h4>{{ diffResult.version_a.version_name }} → {{ diffResult.version_b.version_name }}</h4>
        <ElDescriptions :column="1" border>
          <ElDescriptionsItem label="版本号差异">
            +{{ diffResult.diff.version_number_diff }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="页数差异">
            <span :class="{ increased: diffResult.diff.page_count_diff > 0, decreased: diffResult.diff.page_count_diff < 0 }">
              {{ diffResult.diff.page_count_diff > 0 ? '+' : '' }}{{ diffResult.diff.page_count_diff }}
            </span>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="文件大小差异">
            {{ formatBytes(diffResult.diff.file_size_diff) }}
          </ElDescriptionsItem>
        </ElDescriptions>
      </div>
    </ElDialog>
  </div>
</template>

<style scoped>
.page-container { max-width: 1400px; margin: 0 auto; }
.page-title { margin: 0 0 8px; font-size: 22px; color: #303133; }
.page-desc { margin: 0 0 16px; color: #909399; font-size: 14px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
.pagination { margin-top: 16px; justify-content: flex-end; display: flex; }
.diff-content h4 { margin: 0 0 12px; }
.increased { color: #67C23A; }
.decreased { color: #F56C6C; }
</style>
