<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const route = useRoute()
const clanSlug = computed(() => String(route.params.slug ?? '1'))

const form = reactive({
  title: '家族大事件·精选回顾',
  start_year: undefined as number | undefined,
  end_year: undefined as number | undefined,
  event_type_filter: [] as string[],
  style: 'nostalgic' as 'nostalgic' | 'modern' | 'solemn',
})

const previewData = ref<any>(null)
const generating = ref(false)
const list = ref<any[]>([])
const loading = ref(false)
const pollingTimer = ref<number | null>(null)

const eventTypeOptions = [
  { value: 'ancestor_worship', label: '祭祖' },
  { value: 'genealogy', label: '修谱' },
  { value: 'building', label: '建祠' },
  { value: 'birth', label: '诞辰' },
  { value: 'death', label: '逝世' },
  { value: 'gathering', label: '聚会' },
  { value: 'other', label: '其他' },
]

const styleOptions = [
  { value: 'nostalgic', label: '怀旧' },
  { value: 'modern', label: '现代' },
  { value: 'solemn', label: '庄重' },
]

async function loadPreview() {
  try {
    const res = await axios.get(`/api/clan-event-videos/${clanId.value}/preview`, {
      params: {
        start_year: form.start_year || undefined,
        end_year: form.end_year || undefined,
        event_type: form.event_type_filter.join(',') || undefined,
      },
    })
    previewData.value = res.data
  } catch (err: any) {
    ElMessage.error(`预览失败：${err?.response?.data?.message ?? err.message}`)
  }
}

async function loadList() {
  loading.value = true
  try {
    const res = await axios.get(`/api/clan-event-videos/${clanId.value}`)
    list.value = res.data?.items ?? []
  } catch (err: any) {
    ElMessage.error(`加载列表失败：${err?.response?.data?.message ?? err.message}`)
  } finally {
    loading.value = false
  }
}

async function handleGenerate() {
  if (!form.title.trim()) {
    ElMessage.warning('请输入视频标题')
    return
  }
  generating.value = true
  try {
    const res = await axios.post(`/api/clan-event-videos/${clanId.value}`, {
      ...form,
      start_year: form.start_year || undefined,
      end_year: form.end_year || undefined,
      event_type_filter: form.event_type_filter.length ? form.event_type_filter : undefined,
    })
    ElMessage.success('视频项目已创建，正在生成中…')
    loadList()
    startPolling(res.data.id)
  } catch (err: any) {
    ElMessage.error(`创建失败：${err?.response?.data?.message ?? err.message}`)
  } finally {
    generating.value = false
  }
}

function startPolling(projectId: string) {
  if (pollingTimer.value) clearInterval(pollingTimer.value)
  pollingTimer.value = window.setInterval(async () => {
    try {
      const res = await axios.get(`/api/clan-event-videos/${clanId.value}/${projectId}`)
      if (res.data?.status === 'completed') {
        ElMessage.success('视频生成完成！')
        if (pollingTimer.value) clearInterval(pollingTimer.value)
        pollingTimer.value = null
        loadList()
      } else if (res.data?.status === 'failed') {
        ElMessage.error('视频生成失败')
        if (pollingTimer.value) clearInterval(pollingTimer.value)
        pollingTimer.value = null
        loadList()
      }
    } catch {
      // ignore
    }
  }, 5000)
}

function statusType(s: string) {
  return { queued: 'info', processing: 'warning', completed: 'success', failed: 'danger' }[s] ?? 'info'
}

function statusLabel(s: string) {
  return { queued: '排队中', processing: '生成中', completed: '已完成', failed: '失败' }[s] ?? s
}

function formatDuration(s: number | null) {
  if (!s) return '-'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function formatBytes(b: number | null) {
  if (!b) return '-'
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(2)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

function typeLabels(types: string[] | undefined) {
  if (!types || types.length === 0) return '全部类型'
  return types.map(t => eventTypeOptions.find(o => o.value === t)?.label ?? t).join('、')
}

onMounted(() => {
  loadPreview()
  loadList()
})
</script>

<template>
  <div class="page-container">
    <h2 class="page-title">全族大事件视频</h2>
    <p class="page-desc">将家族大事件（祭祖、修谱、聚会等）串联成一段视频，展示家族重要历史时刻</p>

    <div class="grid">
      <ElCard class="form-card">
        <template #header>参数设置</template>
        <ElForm :model="form" label-position="top">
          <ElFormItem label="视频标题" required>
            <ElInput v-model="form.title" maxlength="200" show-word-limit />
          </ElFormItem>
          <ElFormItem label="时间范围">
            <div class="year-range">
              <ElInputNumber v-model="form.start_year" :min="1000" :max="9999" controls-position="right" placeholder="起始年" />
              <span>至</span>
              <ElInputNumber v-model="form.end_year" :min="1000" :max="9999" controls-position="right" placeholder="结束年" />
              <span class="hint">留空则使用所有事件</span>
            </div>
          </ElFormItem>
          <ElFormItem label="事件类型">
            <ElCheckboxGroup v-model="form.event_type_filter">
              <ElCheckbox v-for="opt in eventTypeOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
            </ElCheckboxGroup>
          </ElFormItem>
          <ElFormItem label="视频风格">
            <ElRadioGroup v-model="form.style">
              <ElRadioButton v-for="opt in styleOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </ElRadioButton>
            </ElRadioGroup>
          </ElFormItem>
          <ElFormItem>
            <ElButton type="primary" :loading="generating" @click="handleGenerate">开始生成</ElButton>
            <ElButton @click="loadPreview">刷新预览</ElButton>
          </ElFormItem>
        </ElForm>
      </ElCard>

      <ElCard class="preview-card">
        <template #header>预览</template>
        <div v-if="previewData" class="preview-content">
          <ElDescriptions :column="1" border>
            <ElDescriptionsItem label="将包含事件">
              <span class="big-num">{{ previewData.event_count }}</span> 个大事件
            </ElDescriptionsItem>
            <ElDescriptionsItem label="时间跨度">
              {{ previewData.year_range?.earliest ?? '-' }} ~ {{ previewData.year_range?.latest ?? '-' }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="预计时长">
              {{ formatDuration(previewData.estimated_duration_seconds) }}
            </ElDescriptionsItem>
          </ElDescriptions>
          <div v-if="previewData.event_count === 0" class="empty-hint">
            当前筛选条件下无大事件
            <ElLink type="primary" @click="$router.push(`/zupu/${clanSlug}//admin/family-events`)">去添加事件 →</ElLink>
          </div>
        </div>
      </ElCard>
    </div>

    <ElCard class="list-card">
      <template #header>
        <div class="list-header">
          <span>历史项目</span>
          <ElButton size="small" @click="loadList">刷新</ElButton>
        </div>
      </template>
      <ElTable v-loading="loading" :data="list" border>
        <ElTableColumn label="标题" prop="title" />
        <ElTableColumn label="时间范围" width="160">
          <template #default="{ row }">
            {{ row.start_year ?? '不限' }} ~ {{ row.end_year ?? '不限' }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="事件类型" width="160">
          <template #default="{ row }">{{ typeLabels(row.event_type_filter) }}</template>
        </ElTableColumn>
        <ElTableColumn label="事件数" width="80" prop="event_count" />
        <ElTableColumn label="时长" width="80">
          <template #default="{ row }">{{ formatDuration(row.duration_seconds) }}</template>
        </ElTableColumn>
        <ElTableColumn label="大小" width="100">
          <template #default="{ row }">{{ formatBytes(row.file_size) }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusType(row.status) as any" size="small">{{ statusLabel(row.status) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="创建时间" width="180">
          <template #default="{ row }">{{ new Date(row.created_at).toLocaleString('zh-CN') }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="160">
          <template #default="{ row }">
            <ElButton v-if="row.video_url" size="small" type="primary" @click="window.open(row.video_url, '_blank')">
              播放
            </ElButton>
            <ElButton v-if="row.video_url" size="small" @click="() => {
              const a = document.createElement('a')
              a.href = row.video_url
              a.download = `${row.title}.mp4`
              a.click()
            }">下载</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>
  </div>
</template>

<style scoped>
.page-container { max-width: 1400px; margin: 0 auto; }
.page-title { margin: 0 0 8px; font-size: 22px; color: #303133; }
.page-desc { margin: 0 0 16px; color: #909399; font-size: 14px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.year-range { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.hint { font-size: 12px; color: #909399; }
.big-num { font-size: 24px; font-weight: 600; color: #67C23A; }
.empty-hint { color: #909399; font-size: 14px; margin-top: 12px; text-align: center; }
.list-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }
@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr; }
}
</style>
