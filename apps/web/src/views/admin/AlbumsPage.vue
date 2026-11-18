<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()
const clanSlug = computed(() => route.params.slug || '1')

const PRIVACY_LABEL: Record<string, string> = {
  self: '仅自己',
  clan: '全族',
  lineage: '上下几代',
  public: '平台公开',
  same_location: '同地点',
}
const privacyLabel = (value?: string) => (value && PRIVACY_LABEL[value]) || value || '-'

// 数据列表
const albums = ref<any[]>([])
const loading = ref(false)

// 新增/编辑弹窗
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const formData = ref({
  name: '',
  description: '',
  cover_url: '',
  default_privacy: 'clan',
})

// 加载数据
const fetchData = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/albums', {
      params: { clanSlug: clanSlug.value },
    })
    albums.value = res.data.data || res.data
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 打开新增
const handleAdd = () => {
  editingId.value = null
  formData.value = {
    name: '',
    description: '',
    cover_url: '',
    default_privacy: 'clan',
  }
  dialogVisible.value = true
}

// 打开编辑
const handleEdit = (row: any) => {
  editingId.value = row.id
  formData.value = {
    name: row.name || '',
    description: row.description || '',
    cover_url: row.cover_url || '',
    default_privacy: row.default_privacy || 'clan',
  }
  dialogVisible.value = true
}

// 保存
const handleSave = async () => {
  if (!formData.value.name.trim()) {
    ElMessage.warning('请输入相册名称')
    return
  }
  try {
    if (editingId.value) {
      await axios.put(`/api/admin/albums/${clanSlug.value}/${editingId.value}`, formData.value)
      ElMessage.success('更新成功')
    } else {
      await axios.post(`/api/admin/albums/${clanSlug.value}`, formData.value)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败')
  }
}

// 删除
const handleDelete = async (id: string) => {
  try {
    await ElMessageBox.confirm('确定要删除该相册吗？', '提示', { type: 'warning' })
    await axios.delete(`/api/admin/albums/${id}`, {
      params: { clanSlug: clanSlug.value },
    })
    ElMessage.success('删除成功')
    fetchData()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '删除失败')
    }
  }
}

// 查看相册详情
const handleViewDetail = (row: any) => {
  router.push({ name: 'admin-media-library', query: { albumId: row.id } })
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="albums-page">
    <div class="page-header">
      <h2>相册管理</h2>
      <el-button type="primary" @click="handleAdd">新建相册</el-button>
    </div>

    <el-table :data="albums" v-loading="loading" stripe style="margin-top: 16px;">
      <el-table-column label="封面" width="100">
        <template #default="{ row }">
          <el-image
            v-if="row.cover_url"
            :src="row.cover_url"
            fit="cover"
            style="width: 60px; height: 60px; cursor: pointer;"
            @click="handleViewDetail(row)"
          />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="相册名称" min-width="150" />
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column prop="photo_count" label="照片数" width="100" />
      <el-table-column label="默认隐私" width="120">
        <template #default="{ row }">
          {{ privacyLabel(row.default_privacy) }}
        </template>
      </el-table-column>
      <el-table-column label="创建者" width="120" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.creator_name || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="160">
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

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑相册' : '新建相册'"
      width="500px"
      destroy-on-close
    >
      <el-form :model="formData" label-width="100px">
        <el-form-item label="相册名称" required>
          <el-input v-model="formData.name" placeholder="请输入相册名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="formData.description" type="textarea" :rows="3" placeholder="请输入相册描述" />
        </el-form-item>
        <el-form-item label="封面URL">
          <el-input v-model="formData.cover_url" placeholder="请输入封面图片URL" />
        </el-form-item>
        <el-form-item label="默认隐私">
          <el-select v-model="formData.default_privacy" style="width: 100%;">
            <el-option v-for="(label, value) in PRIVACY_LABEL" :key="value" :label="label" :value="value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.albums-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}
</style>
