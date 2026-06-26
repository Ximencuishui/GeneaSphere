<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'

const route = useRoute()
const clanSlug = computed(() => String(route.params.slug ?? '1'))

const list = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)

const filters = reactive({
  event_type: '',
  start_year: undefined as number | undefined,
  end_year: undefined as number | undefined,
})

const eventTypeOptions = [
  { value: '', label: '全部类型' },
  { value: 'ancestor_worship', label: '祭祖' },
  { value: 'genealogy', label: '修谱' },
  { value: 'building', label: '建祠' },
  { value: 'birth', label: '诞辰' },
  { value: 'death', label: '逝世' },
  { value: 'gathering', label: '聚会' },
  { value: 'other', label: '其他' },
]

const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref<string | null>(null)
const form = reactive({
  event_name: '',
  event_type: 'ancestor_worship',
  event_date: '',
  event_year: undefined as number | undefined,
  location: '',
  description: '',
  media_ids: [] as number[],
})

async function loadList() {
  loading.value = true
  try {
    const res = await axios.get(`/api/family-events/${clanId.value}`, {
      params: {
        event_type: filters.event_type || undefined,
        start_year: filters.start_year || undefined,
        end_year: filters.end_year || undefined,
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

function resetForm() {
  form.event_name = ''
  form.event_type = 'ancestor_worship'
  form.event_date = ''
  form.event_year = undefined
  form.location = ''
  form.description = ''
  form.media_ids = []
  editingId.value = null
}

function handleCreate() {
  resetForm()
  dialogMode.value = 'create'
  dialogVisible.value = true
}

function handleEdit(row: any) {
  resetForm()
  dialogMode.value = 'edit'
  editingId.value = row.id
  form.event_name = row.event_name
  form.event_type = row.event_type
  form.event_date = row.event_date ? row.event_date.slice(0, 10) : ''
  form.event_year = row.event_year
  form.location = row.location || ''
  form.description = row.description || ''
  form.media_ids = row.media_ids ?? []
  dialogVisible.value = true
}

async function handleSubmit() {
  if (!form.event_name.trim()) {
    ElMessage.warning('请输入事件名称')
    return
  }
  const payload: any = {
    event_name: form.event_name,
    event_type: form.event_type,
    location: form.location || undefined,
    description: form.description || undefined,
    media_ids: form.media_ids,
  }
  if (form.event_date) {
    payload.event_date = new Date(form.event_date).toISOString()
  } else if (form.event_year) {
    payload.event_year = form.event_year
  }
  try {
    if (dialogMode.value === 'create') {
      await axios.post(`/api/family-events/${clanId.value}`, payload)
      ElMessage.success('事件已创建')
    } else {
      await axios.put(`/api/family-events/${clanId.value}/${editingId.value}`, payload)
      ElMessage.success('事件已更新')
    }
    dialogVisible.value = false
    loadList()
  } catch (err: any) {
    ElMessage.error(`保存失败：${err?.response?.data?.message ?? err.message}`)
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm(
      `确认删除事件 "${row.event_name}"？`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await axios.delete(`/api/family-events/${clanId.value}/${row.id}`)
    ElMessage.success('已删除')
    loadList()
  } catch (err: any) {
    ElMessage.error(`删除失败：${err?.response?.data?.message ?? err.message}`)
  }
}

async function handleAutoGenerate() {
  try {
    await ElMessageBox.confirm(
      '系统将基于人物生卒数据自动生成候选事件（诞辰/逝世），是否继续？',
      '自动生成',
      { type: 'info', confirmButtonText: '继续', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    const res = await axios.post(`/api/family-events/${clanId.value}/generate-life-events`)
    const candidates: any[] = res.data?.candidates ?? []
    if (candidates.length === 0) {
      ElMessage.info('未生成任何候选事件')
      return
    }
    let successCount = 0
    for (const c of candidates) {
      try {
        await axios.post(`/api/family-events/${clanId.value}`, {
          event_name: c.event_name,
          event_type: c.event_type,
          event_date: c.event_date,
          event_year: c.event_year,
        })
        successCount++
      } catch {
        // skip individual errors
      }
    }
    ElMessage.success(`已自动生成 ${successCount} 个事件`)
    loadList()
  } catch (err: any) {
    ElMessage.error(`自动生成失败：${err?.response?.data?.message ?? err.message}`)
  }
}

function typeLabel(t: string) {
  return eventTypeOptions.find(o => o.value === t)?.label ?? t
}

function formatDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('zh-CN')
}

onMounted(() => {
  loadList()
})
</script>

<template>
  <div class="page-container">
    <h2 class="page-title">家族大事件管理</h2>
    <p class="page-desc">管理祭祖、修谱、建祠、聚会等家族重要历史时刻</p>

    <div class="toolbar">
      <ElSelect v-model="filters.event_type" placeholder="事件类型" clearable style="width: 140px" @change="loadList">
        <ElOption v-for="opt in eventTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
      </ElSelect>
      <ElInputNumber v-model="filters.start_year" :min="1000" :max="9999" placeholder="起始年" controls-position="right" @change="loadList" />
      <span>~</span>
      <ElInputNumber v-model="filters.end_year" :min="1000" :max="9999" placeholder="结束年" controls-position="right" @change="loadList" />
      <div class="spacer" />
      <ElButton type="warning" @click="handleAutoGenerate">自动生成（基于生卒）</ElButton>
      <ElButton type="primary" @click="handleCreate">新增事件</ElButton>
    </div>

    <ElTable v-loading="loading" :data="list" border stripe>
      <ElTableColumn label="事件名称" prop="event_name" min-width="200" />
      <ElTableColumn label="类型" width="100">
        <template #default="{ row }">
          <ElTag size="small">{{ typeLabel(row.event_type) }}</ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="时间" width="160">
        <template #default="{ row }">
          <span v-if="row.event_date">{{ formatDate(row.event_date) }}</span>
          <span v-else-if="row.event_year">{{ row.event_year }} 年</span>
          <span v-else>-</span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="地点" prop="location" min-width="160">
        <template #default="{ row }">{{ row.location || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="描述" min-width="240">
        <template #default="{ row }">
          <div class="desc-cell">{{ row.description || '-' }}</div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="创建时间" width="180">
        <template #default="{ row }">{{ new Date(row.created_at).toLocaleString('zh-CN') }}</template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <ElButton size="small" @click="handleEdit(row)">编辑</ElButton>
          <ElButton size="small" type="danger" @click="handleDelete(row)">删除</ElButton>
        </template>
      </ElTableColumn>
    </ElTable>

    <ElPagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      class="pagination"
      @current-change="loadList"
      @size-change="loadList"
    />

    <ElDialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增事件' : '编辑事件'"
      width="640px"
    >
      <ElForm :model="form" label-position="top">
        <ElFormItem label="事件名称" required>
          <ElInput v-model="form.event_name" maxlength="100" show-word-limit />
        </ElFormItem>
        <ElFormItem label="事件类型" required>
          <ElSelect v-model="form.event_type" style="width: 100%">
            <ElOption v-for="opt in eventTypeOptions.filter(o => o.value)" :key="opt.value" :label="opt.label" :value="opt.value" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="事件日期">
          <div class="date-row">
            <ElDatePicker v-model="form.event_date" type="date" placeholder="选择具体日期" value-format="YYYY-MM-DD" />
            <span class="or">或</span>
            <ElInputNumber v-model="form.event_year" :min="1000" :max="9999" placeholder="仅填写年份" controls-position="right" />
          </div>
          <div class="hint">精确日期和年份至少填写一个</div>
        </ElFormItem>
        <ElFormItem label="地点">
          <ElInput v-model="form.location" maxlength="200" />
        </ElFormItem>
        <ElFormItem label="描述">
          <ElInput v-model="form.description" type="textarea" :rows="3" maxlength="1000" show-word-limit />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="handleSubmit">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.page-container { max-width: 1400px; margin: 0 auto; }
.page-title { margin: 0 0 8px; font-size: 22px; color: #303133; }
.page-desc { margin: 0 0 16px; color: #909399; font-size: 14px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
.spacer { flex: 1; }
.pagination { margin-top: 16px; justify-content: flex-end; display: flex; }
.desc-cell { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.date-row { display: flex; align-items: center; gap: 12px; }
.or { color: #909399; }
.hint { font-size: 12px; color: #909399; margin-top: 4px; }
</style>
