<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const clanSlug = computed(() => route.params.slug || '1')

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  preview: '已生成预览',
  ordered: '已下单',
}

const COVER_LABEL: Record<string, string> = {
  red: '喜庆红',
  gold: '典雅金',
  green: '清新绿',
  ink: '水墨风',
  modern: '现代简约',
}

const GROUPING_LABEL: Record<string, string> = {
  family: '按家庭',
  branch: '按房支',
  generation: '按世代',
}

const PAGE_TYPE_LABEL: Record<string, string> = {
  cover: '封面',
  toc: '目录',
  section: '章节扉页',
  person: '个人介绍页',
  family: '家庭组页',
  epilogue: '后记',
}

const statusLabel = (status?: string) => (status && STATUS_LABEL[status]) || status || '-'
const coverLabel = (value?: string) => (value && COVER_LABEL[value]) || value || '-'
const groupingLabel = (value?: string) => (value && GROUPING_LABEL[value]) || value || '-'
const pageTypeLabel = (value?: string) => (value && PAGE_TYPE_LABEL[value]) || value || '-'

const readError = (e: any, fallback: string) => {
  const msg = e?.response?.data?.message
  if (Array.isArray(msg)) return msg.join('；')
  return msg || e?.message || fallback
}

const projects = ref<any[]>([])
const loading = ref(false)
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
})

const detailVisible = ref(false)
const currentProject = ref<any>(null)
const pages = ref<any[]>([])
const detailLoading = ref(false)

const editDialogVisible = ref(false)
const editingProject = ref<any>(null)
const editLoading = ref(false)
const editForm = ref({
  title: '',
  preface: '',
  status: 'draft',
})

const fetchData = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/family-albums', {
      params: {
        clanSlug: clanSlug.value,
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
      },
    })
    projects.value = res.data.data
    pagination.value.total = res.data.total
  } catch (e: any) {
    ElMessage.error(readError(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

const handleViewDetail = async (row: any) => {
  currentProject.value = { ...row }
  pages.value = []
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res = await axios.get(`/api/admin/family-albums/${row.id}`, {
      params: { clanSlug: clanSlug.value },
    })
    currentProject.value = res.data
    pages.value = res.data.pages || []
  } catch (e: any) {
    ElMessage.error(readError(e, '加载详情失败'))
  } finally {
    detailLoading.value = false
  }
}

const handleEdit = async (row: any) => {
  editingProject.value = row
  editForm.value = {
    title: row.title || '',
    preface: '',
    status: row.status || 'draft',
  }
  editDialogVisible.value = true
  editLoading.value = true
  try {
    const res = await axios.get(`/api/admin/family-albums/${row.id}`, {
      params: { clanSlug: clanSlug.value },
    })
    if (editingProject.value?.id !== row.id) return
    editForm.value = {
      title: res.data.title ?? '',
      preface: res.data.preface ?? '',
      status: res.data.status || 'draft',
    }
  } catch (e: any) {
    ElMessage.error(readError(e, '加载图册失败'))
  } finally {
    editLoading.value = false
  }
}

const handleSave = async () => {
  if (editLoading.value) return
  if (!editForm.value.title.trim()) {
    ElMessage.warning('请输入图册标题')
    return
  }
  try {
    await axios.put(`/api/admin/family-albums/${clanSlug.value}/${editingProject.value.id}`, {
      title: editForm.value.title,
      preface: editForm.value.preface,
      status: editForm.value.status,
    })
    ElMessage.success('保存成功')
    editDialogVisible.value = false
    fetchData()
  } catch (e: any) {
    ElMessage.error(readError(e, '保存失败'))
  }
}

const handleDelete = async (id: string) => {
  try {
    await ElMessageBox.confirm('确定要删除该图册吗？', '提示', { type: 'warning' })
    await axios.delete(`/api/admin/family-albums/${id}`, {
      params: { clanSlug: clanSlug.value },
    })
    ElMessage.success('删除成功')
    fetchData()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(readError(e, '删除失败'))
    }
  }
}

const pageEditVisible = ref(false)
const pageSaving = ref(false)
const editingPage = ref<any>(null)
const pageForm = ref({
  title: '',
  subtitle: '',
  body: '',
})

const openPageEdit = (row: any) => {
  editingPage.value = row
  pageForm.value = {
    title: row.title || '',
    subtitle: row.subtitle || '',
    body: row.body || '',
  }
  pageEditVisible.value = true
}

const reloadDetail = async (id: string) => {
  detailLoading.value = true
  try {
    const res = await axios.get(`/api/admin/family-albums/${id}`, {
      params: { clanSlug: clanSlug.value },
    })
    currentProject.value = res.data
    pages.value = res.data.pages || []
  } catch (e: any) {
    ElMessage.error(readError(e, '加载详情失败'))
  } finally {
    detailLoading.value = false
  }
}

const handleSavePage = async () => {
  if (pageSaving.value) return
  const projectId = currentProject.value?.id
  const pageId = editingPage.value?.id
  if (!projectId || !pageId) return
  pageSaving.value = true
  try {
    await axios.put(`/api/admin/family-albums/${clanSlug.value}/${projectId}/pages/${pageId}`, {
      title: pageForm.value.title,
      subtitle: pageForm.value.subtitle,
      body: pageForm.value.body,
    })
    ElMessage.success('页面已保存')
    pageEditVisible.value = false
    await reloadDetail(projectId)
  } catch (e: any) {
    ElMessage.error(readError(e, '保存失败'))
  } finally {
    pageSaving.value = false
  }
}

const handlePageChange = (page: number) => {
  pagination.value.page = page
  fetchData()
}

const spouseLabel = (value: boolean | null | undefined) => {
  if (value == null) return '-'
  return value ? '是' : '否'
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="family-albums-page">
    <div class="page-header">
      <h2>家庭图册</h2>
    </div>

    <el-table :data="projects" v-loading="loading" stripe>
      <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          {{ statusLabel(row.status) }}
        </template>
      </el-table-column>
      <el-table-column prop="generations" label="世代数" width="90" />
      <el-table-column prop="page_count" label="页数" width="80" />
      <el-table-column prop="person_count" label="人数" width="80" />
      <el-table-column label="起始人" width="140" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.start_person?.name || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="user_name" label="创建者" width="140" show-overflow-tooltip />
      <el-table-column prop="created_at" label="创建时间" width="170">
        <template #default="{ row }">
          {{ row.created_at ? new Date(row.created_at).toLocaleString() : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleViewDetail(row)">查看</el-button>
          <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="pagination.page"
      :total="pagination.total"
      :page-size="pagination.pageSize"
      @current-change="handlePageChange"
      layout="total, prev, pager, next"
      class="pagination"
    />

    <el-dialog v-model="detailVisible" :title="currentProject?.title || '图册详情'" width="960px" destroy-on-close>
      <div v-loading="detailLoading">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="序言" :span="2">{{ currentProject?.preface || '-' }}</el-descriptions-item>
          <el-descriptions-item label="封面模板">{{ coverLabel(currentProject?.cover_template) }}</el-descriptions-item>
          <el-descriptions-item label="含配偶">{{ spouseLabel(currentProject?.include_spouse) }}</el-descriptions-item>
          <el-descriptions-item label="分组方式">{{ groupingLabel(currentProject?.grouping) }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="section-title">页面</h4>
        <el-table :data="pages" size="small" stripe>
          <el-table-column prop="page_number" label="页码" width="80" />
          <el-table-column label="页类型" width="140">
            <template #default="{ row }">
              {{ pageTypeLabel(row.page_type) }}
            </template>
          </el-table-column>
          <el-table-column label="标题" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.title || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="副标题" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.subtitle || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="正文" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.body || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openPageEdit(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>

    <el-dialog v-model="editDialogVisible" title="编辑图册" width="500px" destroy-on-close>
      <el-form :model="editForm" label-width="100px" v-loading="editLoading">
        <el-form-item label="图册标题" required>
          <el-input v-model="editForm.title" placeholder="请输入图册标题" />
        </el-form-item>
        <el-form-item label="序言">
          <el-input v-model="editForm.preface" type="textarea" :rows="4" placeholder="请输入序言" />
        </el-form-item>
        <el-form-item label="状态" required>
          <el-select v-model="editForm.status" style="width: 100%">
            <el-option
              v-for="(label, value) in STATUS_LABEL"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editLoading" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pageEditVisible" title="编辑页面" width="560px" destroy-on-close>
      <el-form :model="pageForm" label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="pageForm.title" placeholder="页面标题" />
        </el-form-item>
        <el-form-item label="副标题">
          <el-input v-model="pageForm.subtitle" placeholder="副标题" />
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="pageForm.body" type="textarea" :rows="6" placeholder="页面正文" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pageEditVisible = false">取消</el-button>
        <el-button type="primary" :loading="pageSaving" @click="handleSavePage">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.family-albums-page {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.section-title {
  margin: 20px 0 12px;
}
</style>
