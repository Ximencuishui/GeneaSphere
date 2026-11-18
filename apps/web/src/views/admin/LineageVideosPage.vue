<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const clanSlug = computed(() => String(route.params.slug || ''))

const STATUS_LABEL: Record<string, string> = {
  queued: '排队中',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
}

const DIRECTION_LABEL: Record<string, string> = {
  paternal: '父系',
  maternal: '母系',
  both: '双系',
}

const STYLE_LABEL: Record<string, string> = {
  nostalgic: '温馨怀旧',
  'bw复古': '黑白复古',
  modern: '现代明亮',
}

const statusLabel = (status?: string) => (status && STATUS_LABEL[status]) || status || '-'

const readError = (e: any, fallback: string) => {
  const msg = e?.response?.data?.message
  if (Array.isArray(msg)) return msg.join('；')
  return msg || e?.message || fallback
}

const projects = ref<any[]>([])
const loading = ref(false)
const pagination = ref({ page: 1, pageSize: 20, total: 0 })

const detailVisible = ref(false)
const detailLoading = ref(false)
const saving = ref(false)
const current = ref<any>(null)
const editForm = ref({ status: 'queued', error_message: '' })

const fetchData = async () => {
  loading.value = true
  try {
    const res = await axios.get(`/api/admin/lineage-videos/${clanSlug.value}`, {
      params: {
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
      },
    })
    projects.value = res.data.data || []
    pagination.value.total = res.data.total || 0
  } catch (e: any) {
    ElMessage.error(readError(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

const fillForm = (project: any) => {
  editForm.value = {
    status: project?.status || 'queued',
    error_message: project?.error_message || '',
  }
}

const handleViewDetail = async (row: any) => {
  current.value = { ...row }
  fillForm(row)
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res = await axios.get(`/api/admin/lineage-videos/${clanSlug.value}/${row.id}`)
    if (!detailVisible.value || current.value?.id !== row.id) return
    current.value = res.data
    fillForm(res.data)
  } catch (e: any) {
    ElMessage.error(readError(e, '加载详情失败'))
  } finally {
    detailLoading.value = false
  }
}

const handleSave = async () => {
  if (!current.value?.id || saving.value) return
  saving.value = true
  try {
    await axios.put(`/api/admin/lineage-videos/${clanSlug.value}/${current.value.id}`, {
      status: editForm.value.status,
      error_message: editForm.value.error_message,
    })
    ElMessage.success('已保存')
    await handleViewDetail(current.value)
    await fetchData()
  } catch (e: any) {
    ElMessage.error(readError(e, '保存失败'))
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id: string) => {
  try {
    await ElMessageBox.confirm('确定要删除这条直系血缘视频吗？删除后不可恢复。', '提示', { type: 'warning' })
    await axios.delete(`/api/admin/lineage-videos/${clanSlug.value}/${id}`)
    ElMessage.success('删除成功')
    if (current.value?.id === id) detailVisible.value = false
    await fetchData()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(readError(e, '删除失败'))
    }
  }
}

const handlePageChange = (page: number) => {
  pagination.value.page = page
  fetchData()
}

const formatTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : '-')

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="lineage-videos-page">
    <div class="page-header">
      <h2>直系血缘视频</h2>
    </div>

    <el-empty
      v-if="!loading && projects.length === 0"
      description="还没有直系血缘视频"
    />

    <template v-else>
      <el-table :data="projects" v-loading="loading" stripe>
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column prop="creator_name" label="创建人" width="160" show-overflow-tooltip />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            {{ statusLabel(row.status) }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleViewDetail(row)">查看</el-button>
            <el-button link type="danger" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="pagination.total > pagination.pageSize"
        v-model:current-page="pagination.page"
        :total="pagination.total"
        :page-size="pagination.pageSize"
        layout="total, prev, pager, next"
        class="pagination"
        @current-change="handlePageChange"
      />
    </template>

    <el-dialog v-model="detailVisible" :title="current?.title || '直系血缘视频详情'" width="760px" destroy-on-close>
      <div v-loading="detailLoading">
        <el-descriptions v-if="current" :column="2" border>
          <el-descriptions-item label="标题">{{ current.title || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ current.creator_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="中心人物">{{ current.center_person?.full_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="方向">{{ DIRECTION_LABEL[current.direction] || current.direction || '-' }}</el-descriptions-item>
          <el-descriptions-item label="向上代数">{{ current.up_generations ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="向下代数">{{ current.down_generations ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="包含配偶">{{ current.include_spouse ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="风格">{{ STYLE_LABEL[current.style] || current.style || '-' }}</el-descriptions-item>
          <el-descriptions-item label="排队位置">{{ current.queue_position ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="付费优先">{{ current.priority ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="时长">{{ current.duration_seconds != null ? `${current.duration_seconds} 秒` : '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(current.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="完成时间">{{ formatTime(current.completed_at) }}</el-descriptions-item>
          <el-descriptions-item label="视频地址" :span="2">{{ current.video_url || '暂无' }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="current?.video_url" class="player-wrap">
          <video :src="current.video_url" controls preload="metadata" class="player" />
        </div>

        <el-form :model="editForm" label-width="72px" class="edit-form">
          <el-form-item label="状态">
            <el-select v-model="editForm.status" style="width: 220px">
              <el-option v-for="(label, value) in STATUS_LABEL" :key="value" :label="label" :value="value" />
            </el-select>
          </el-form-item>
          <el-form-item label="说明">
            <el-input v-model="editForm.error_message" type="textarea" :rows="3" placeholder="生成说明或失败原因" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button type="danger" :disabled="!current?.id" @click="handleDelete(current.id)">删除</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.lineage-videos-page {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.pagination {
  margin-top: 16px;
  justify-content: flex-end;
}

.player-wrap {
  margin-top: 16px;
}

.player {
  width: 100%;
  max-height: 420px;
  background: #111;
}

.edit-form {
  margin-top: 20px;
}
</style>
