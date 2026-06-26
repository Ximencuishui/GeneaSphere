<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const clanSlug = computed(() => route.params.slug || '1')

// 数据列表
const albums = ref<any[]>([])
const loading = ref(false)
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
})

// 详情弹窗
const detailVisible = ref(false)
const currentAlbum = ref<any>(null)
const photos = ref<any[]>([])
const photosLoading = ref(false)

// 编辑弹窗
const editDialogVisible = ref(false)
const editingAlbum = ref<any>(null)
const editForm = ref({
  title: '',
  description: '',
  family_name: '',
  generation: '',
  cover_url: '',
})

// 加载数据
const fetchData = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/family-albums', {
      params: {
        clanSlug: clanId.value,
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
      },
    })
    albums.value = res.data.data
    pagination.value.total = res.data.total
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 查看详情
const handleViewDetail = async (row: any) => {
  currentAlbum.value = row
  photosLoading.value = true
  detailVisible.value = true
  try {
    const res = await axios.get(`/api/admin/family-albums/${row.id}`, {
      params: { clanSlug: clanId.value },
    })
    photos.value = res.data.photos || []
  } catch (e: any) {
    ElMessage.error(e.message || '加载详情失败')
  } finally {
    photosLoading.value = false
  }
}

// 打开编辑
const handleEdit = (row: any) => {
  editingAlbum.value = row
  editForm.value = {
    title: row.title || '',
    description: row.description || '',
    family_name: row.family_name || '',
    generation: row.generation || '',
    cover_url: row.cover_url || '',
  }
  editDialogVisible.value = true
}

// 保存编辑
const handleSave = async () => {
  if (!editForm.value.title.trim()) {
    ElMessage.warning('请输入图册标题')
    return
  }
  try {
    await axios.put(`/api/admin/family-albums/${editingAlbum.value.id}`, editForm.value, {
      params: { clanSlug: clanId.value },
    })
    ElMessage.success('保存成功')
    editDialogVisible.value = false
    fetchData()
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败')
  }
}

// 删除
const handleDelete = async (id: string) => {
  try {
    await ElMessageBox.confirm('确定要删除该图册吗？', '提示', { type: 'warning' })
    await axios.delete(`/api/admin/family-albums/${id}`, {
      params: { clanSlug: clanId.value },
    })
    ElMessage.success('删除成功')
    fetchData()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '删除失败')
    }
  }
}

// 分页
const handlePageChange = (page: number) => {
  pagination.value.page = page
  fetchData()
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

    <el-table :data="albums" v-loading="loading" stripe>
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
      <el-table-column prop="title" label="图册标题" min-width="150" />
      <el-table-column prop="family_name" label="家庭名称" width="150" />
      <el-table-column prop="generation" label="世代" width="80" />
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column prop="photo_count" label="照片数" width="100" />
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

    <!-- 分页 -->
    <el-pagination
      v-model:current-page="pagination.page"
      :total="pagination.total"
      :page-size="pagination.pageSize"
      @current-change="handlePageChange"
      layout="total, prev, pager, next"
      class="pagination"
    />

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" :title="currentAlbum?.title || '图册详情'" width="800px" destroy-on-close>
      <div class="album-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="家庭名称">{{ currentAlbum?.family_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="世代">{{ currentAlbum?.generation || '-' }}</el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{ currentAlbum?.description || '-' }}</el-descriptions-item>
        </el-descriptions>

        <h4 style="margin-top: 20px;">照片列表</h4>
        <div v-loading="photosLoading" class="photo-grid">
          <div v-if="photos.length === 0" class="empty-tip">暂无照片</div>
          <el-image
            v-for="photo in photos"
            :key="photo.id"
            :src="photo.url"
            :preview-src-list="photos.map(p => p.url)"
            fit="cover"
            class="photo-item"
          />
        </div>
      </div>
    </el-dialog>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editDialogVisible" title="编辑图册" width="500px" destroy-on-close>
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="图册标题" required>
          <el-input v-model="editForm.title" placeholder="请输入图册标题" />
        </el-form-item>
        <el-form-item label="家庭名称">
          <el-input v-model="editForm.family_name" placeholder="请输入家庭名称" />
        </el-form-item>
        <el-form-item label="世代">
          <el-input v-model="editForm.generation" placeholder="如：第12世" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="3" placeholder="请输入描述" />
        </el-form-item>
        <el-form-item label="封面URL">
          <el-input v-model="editForm.cover_url" placeholder="请输入封面图片URL" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
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

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.photo-item {
  width: 150px;
  height: 150px;
  border-radius: 4px;
  cursor: pointer;
}

.empty-tip {
  grid-column: 1 / -1;
  text-align: center;
  color: #999;
  padding: 40px 0;
}
</style>
