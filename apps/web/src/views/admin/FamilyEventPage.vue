<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import { buildFamilyEventWritePayload } from './family-event-payload'

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
const photoPreviews = ref<Array<{ id: number; url: string }>>([])
const csvInputRef = ref<HTMLInputElement | null>(null)

function numericIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const ids: number[] = []
  const seen = new Set<number>()
  for (const item of value) {
    const id = typeof item === 'number' ? item : Number(String(item).trim())
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function currentUploaderId(): string {
  const token = localStorage.getItem('geneasphere_token') || localStorage.getItem('access_token') || ''
  const encoded = token.split('.')[1]
  if (!encoded) return ''
  try {
    const payload = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))
    return String(payload.sub || '')
  } catch {
    return ''
  }
}

function isAlreadyExistingLifeEvent(err: any): boolean {
  const data = err?.response?.data
  if (data?.skipped === true) return true
  const raw = data?.message ?? err?.message ?? ''
  const message = Array.isArray(raw) ? raw.join(' ') : String(raw)
  if (err?.response?.status === 409) return true
  return /已存在|重复|唯一约束|unique constraint|P2002/i.test(message)
}

async function loadList() {
  loading.value = true
  try {
    const res = await axios.get(`/api/family-events/${clanSlug.value}`, {
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
  photoPreviews.value = []
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
  form.media_ids = numericIds(row.media_ids)
  photoPreviews.value = Array.isArray(row.media)
    ? row.media.flatMap((item: { id?: string | number; url?: string }) => {
        const id = Number(item?.id)
        if (!Number.isSafeInteger(id) || id <= 0) return []
        return [{ id, url: item.url || '' }]
      })
    : []
  dialogVisible.value = true
}

function removePhoto(id: number) {
  form.media_ids = form.media_ids.filter((item) => item !== id)
  photoPreviews.value = photoPreviews.value.filter((item) => item.id !== id)
}

/**
 * 复用影像上传接口 POST /api/media/upload。
 * 请求字段与 apps/web/src/api/media.ts 的 uploadMedia 相同：file、clan_id、uploader_id。
 */
async function uploadEventPhoto(options: {
  file: File
  onSuccess?: (body: unknown) => void
  onError?: (err: unknown) => void
}) {
  try {
    const clanRes = await axios.get(`/api/clans/${clanSlug.value}`)
    const clanId = clanRes.data?.id
    const uploaderId = currentUploaderId()
    if (clanId == null || clanId === '' || !uploaderId) {
      throw new Error('缺少家族或登录信息，无法上传照片')
    }
    const body = new FormData()
    body.append('file', options.file)
    body.append('clan_id', String(clanId))
    body.append('uploader_id', uploaderId)
    const res = await axios.post('/api/media/upload', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    const media = res.data?.data ?? res.data
    const id = Number(media?.id)
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error('上传未返回媒体 id')
    }
    if (!form.media_ids.includes(id)) form.media_ids.push(id)
    const url = media?.thumb_url || media?.display_url || media?.file_url || ''
    photoPreviews.value = photoPreviews.value.filter((item) => item.id !== id).concat({ id, url })
    options.onSuccess?.(media)
  } catch (err: any) {
    ElMessage.error(`上传失败：${err?.response?.data?.message ?? err.message}`)
    options.onError?.(err)
  }
}

async function handleSubmit() {
  if (!form.event_name.trim()) {
    ElMessage.warning('请输入事件名称')
    return
  }
  const payload = buildFamilyEventWritePayload(form)
  try {
    if (dialogMode.value === 'create') {
      await axios.post(`/api/family-events/${clanSlug.value}`, payload)
      ElMessage.success('事件已创建')
    } else {
      await axios.put(`/api/family-events/${clanSlug.value}/${editingId.value}`, payload)
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
    await axios.delete(`/api/family-events/${clanSlug.value}/${row.id}`)
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
    const res = await axios.post(`/api/family-events/${clanSlug.value}/generate-life-events`)
    const candidates: any[] = res.data?.candidates ?? []
    if (candidates.length === 0) {
      ElMessage.info('未生成任何候选事件')
      return
    }
    let successCount = 0
    let failedCount = 0
    let skippedCount = 0
    for (const c of candidates) {
      try {
        const created = await axios.post(`/api/family-events/${clanSlug.value}`, {
          event_name: c.event_name,
          event_type: c.event_type,
          event_date: c.event_date,
          event_year: c.event_year,
          ...(c.person_id != null && c.person_id !== '' ? { person_id: c.person_id } : {}),
        })
        if (created.data?.skipped) skippedCount++
        else successCount++
      } catch (err) {
        if (isAlreadyExistingLifeEvent(err)) skippedCount++
        else failedCount++
      }
    }
    if (failedCount > 0) {
      const skippedText = skippedCount > 0 ? `，跳过 ${skippedCount} 条` : ''
      ElMessage.warning(`成功 ${successCount} 条${skippedText}，失败 ${failedCount} 条`)
    } else if (skippedCount > 0) {
      ElMessage.success(`已自动生成 ${successCount} 个事件，跳过 ${skippedCount} 条`)
    } else {
      ElMessage.success(`已自动生成 ${successCount} 个事件`)
    }
    loadList()
  } catch (err: any) {
    ElMessage.error(`自动生成失败：${err?.response?.data?.message ?? err.message}`)
  }
}

function openCsvImport() {
  csvInputRef.value?.click()
}

async function handleCsvImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const body = new FormData()
  body.append('file', file)
  try {
    const res = await axios.post(`/api/family-events/${clanSlug.value}/import-csv`, body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    const success = Number(res.data?.success ?? 0)
    const skipped = Number(res.data?.skipped ?? 0)
    const failed = Number(res.data?.failed ?? 0)
    const text = `成功导入 ${success} 条，跳过 ${skipped} 条重复生卒，失败 ${failed} 条`
    if (failed > 0) ElMessage.warning(text)
    else ElMessage.success(text)
    await loadList()
  } catch (err: any) {
    const raw = err?.response?.data?.message ?? err?.message
    const message = Array.isArray(raw) ? raw.join('；') : String(raw || 'CSV 解析失败')
    ElMessage.error(message)
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
      <ElButton @click="openCsvImport">导入 CSV</ElButton>
      <input ref="csvInputRef" type="file" accept=".csv" hidden @change="handleCsvImport" />
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
      <ElTableColumn label="照片" width="160">
        <template #default="{ row }">
          <div class="photo-cell">
            <img
              v-for="item in (row.media ?? []).slice(0, 3)"
              :key="item.id"
              :src="item.url"
              class="list-thumb"
              alt=""
            />
            <span v-if="!(row.media?.length)" class="photo-empty">暂无照片</span>
          </div>
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
        <ElFormItem label="照片">
          <ElUpload
            class="event-photo-upload"
            accept="image/jpeg,image/png,image/gif,image/webp"
            :show-file-list="false"
            :http-request="uploadEventPhoto"
            multiple
          >
            <ElButton>上传照片</ElButton>
          </ElUpload>
          <div class="hint">上传后写入本次保存的 media_ids</div>
          <div class="form-photos">
            <div v-for="item in photoPreviews" :key="item.id" class="form-photo">
              <img v-if="item.url" :src="item.url" class="form-thumb" alt="" />
              <span v-else class="photo-empty">无缩略图</span>
              <button type="button" class="photo-remove" @click="removePhoto(item.id)">移除</button>
            </div>
            <span v-if="form.media_ids.length === 0" class="photo-empty">暂无照片</span>
          </div>
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
.photo-cell { display: flex; align-items: center; gap: 4px; min-height: 28px; }
.list-thumb { width: 36px; height: 36px; object-fit: cover; border-radius: 4px; flex: 0 0 auto; background: #f5f7fa; }
.photo-empty { color: #909399; font-size: 12px; line-height: 1.4; }
.form-photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.form-photo { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.form-thumb { width: 72px; height: 72px; object-fit: cover; border-radius: 4px; background: #f5f7fa; }
.photo-remove { border: 0; background: transparent; color: #f56c6c; padding: 0; cursor: pointer; font-size: 12px; }
</style>
