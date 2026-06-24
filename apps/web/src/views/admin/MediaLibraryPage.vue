<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const clanId = computed(() => route.query.clanId || '1')

// 数据列表
const mediaList = ref<any[]>([])
const loading = ref(false)
const pagination = ref({
  page: 1,
  pageSize: 30,
  total: 0,
})

// 筛选条件
const filters = ref({
  keyword: '',
  category: '',
  year: '',
  uploaderId: '',
})

// 批量选择
const selectedItems = ref<string[]>([])
const batchDialogVisible = ref(false)
const batchAction = ref<'update' | 'delete'>('update')

// 详情编辑
const detailVisible = ref(false)
const currentMedia = ref<any>(null)
const editForm = ref({
  title: '',
  description: '',
  taken_year: '',
  taken_location: '',
  category: '',
})

// 加载数据
const fetchData = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/media/list', {
      params: {
        clanId: clanId.value,
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
        keyword: filters.value.keyword || undefined,
        category: filters.value.category || undefined,
        year: filters.value.year || undefined,
        uploaderId: filters.value.uploaderId || undefined,
      },
    })
    mediaList.value = res.data.data
    pagination.value.total = res.data.total
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 搜索
const handleSearch = () => {
  pagination.value.page = 1
  fetchData()
}

// 重置筛选
const handleReset = () => {
  filters.value = {
    keyword: '',
    category: '',
    year: '',
    uploaderId: '',
  }
  handleSearch()
}

// 打开详情
const handleViewDetail = (row: any) => {
  currentMedia.value = row
  editForm.value = {
    title: row.title || '',
    description: row.description || '',
    taken_year: row.taken_year || '',
    taken_location: row.taken_location || '',
    category: row.category || '',
  }
  detailVisible.value = true
}

// 保存编辑
const handleSaveEdit = async () => {
  try {
    await axios.put(`/api/admin/media/${currentMedia.value.id}`, editForm.value, {
      params: { clanId: clanId.value },
    })
    ElMessage.success('保存成功')
    detailVisible.value = false
    fetchData()
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败')
  }
}

// 删除单个
const handleDelete = async (id: string) => {
  try {
    await ElMessageBox.confirm('确定要删除该影像吗？', '提示', { type: 'warning' })
    await axios.delete(`/api/admin/media/${id}`, {
      params: { clanId: clanId.value },
    })
    ElMessage.success('删除成功')
    fetchData()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '删除失败')
    }
  }
}

// 设为封面
const handleSetCover = async (id: string) => {
  try {
    await axios.post(`/api/admin/media/${id}/set-cover`, {}, {
      params: { clanId: clanId.value },
    })
    ElMessage.success('已设为封面')
    fetchData()
  } catch (e: any) {
    ElMessage.error(e.message || '设置失败')
  }
}

// 批量更新
const handleBatchUpdate = async () => {
  try {
    await axios.post('/api/admin/media/batch-update', {
      ids: selectedItems.value,
      ...editForm.value,
    }, {
      params: { clanId: clanId.value },
    })
    ElMessage.success('批量更新成功')
    batchDialogVisible.value = false
    selectedItems.value = []
    fetchData()
  } catch (e: any) {
    ElMessage.error(e.message || '批量更新失败')
  }
}

// 批量删除
const handleBatchDelete = async () => {
  try {
    await ElMessageBox.confirm(`确定要删除选中的 ${selectedItems.value.length} 项影像吗？`, '提示', { type: 'warning' })
    await axios.post('/api/admin/media/batch-delete', {
      ids: selectedItems.value,
    }, {
      params: { clanId: clanId.value },
    })
    ElMessage.success('批量删除成功')
    batchDialogVisible.value = false
    selectedItems.value = []
    fetchData()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '批量删除失败')
    }
  }
}

// 打开批量操作
const handleBatchAction = (action: 'update' | 'delete') => {
  batchAction.value = action
  editForm.value = {
    title: '',
    description: '',
    taken_year: '',
    taken_location: '',
    category: '',
  }
  batchDialogVisible.value = true
}

// 分页
const handlePageChange = (page: number) => {
  pagination.value.page = page
  fetchData()
}

// 复选框变化
const handleSelectionChange = (selection: any[]) => {
  selectedItems.value = selection.map((item) => item.id)
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="media-library-page">
    <div class="page-header">
      <h2>影像库</h2>
      <div class="header-actions">
        <el-button
          :disabled="selectedItems.length === 0"
          @click="handleBatchAction('update')"
        >
          批量更新
        </el-button>
        <el-button
          :disabled="selectedItems.length === 0"
          type="danger"
          @click="handleBatchAction('delete')"
        >
          批量删除
        </el-button>
      </div>
    </div>

    <!-- 筛选 -->
    <el-card class="filter-card">
      <el-form :inline="true" :model="filters">
        <el-form-item label="关键词">
          <el-input v-model="filters.keyword" placeholder="搜索标题/描述" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="filters.category" placeholder="全部" clearable>
            <el-option label="家庭合影" value="family_portrait" />
            <el-option label="个人照片" value="portrait" />
            <el-option label="风景" value="landscape" />
            <el-option label="文物" value="artifact" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="年份">
          <el-input v-model="filters.year" placeholder="如 1980" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 列表 -->
    <el-table
      :data="mediaList"
      v-loading="loading"
      @selection-change="handleSelectionChange"
      stripe
      style="margin-top: 16px;"
    >
      <el-table-column type="selection" width="55" />
      <el-table-column label="缩略图" width="100">
        <template #default="{ row }">
          <el-image
            v-if="row.thumb_url || row.url"
            :src="row.thumb_url || row.url"
            fit="cover"
            style="width: 60px; height: 60px; cursor: pointer;"
            @click="handleViewDetail(row)"
          />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="150" />
      <el-table-column prop="category" label="分类" width="100">
        <template #default="{ row }">
          {{ row.category === 'family_portrait' ? '家庭合影' : row.category === 'portrait' ? '个人照片' : row.category === 'landscape' ? '风景' : row.category === 'artifact' ? '文物' : '其他' }}
        </template>
      </el-table-column>
      <el-table-column prop="taken_year" label="年份" width="80" />
      <el-table-column prop="taken_location" label="拍摄地点" width="120" />
      <el-table-column prop="uploader_name" label="上传者" width="100" />
      <el-table-column prop="created_at" label="上传时间" width="160">
        <template #default="{ row }">
          {{ row.created_at ? new Date(row.created_at).toLocaleString() : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleViewDetail(row)">编辑</el-button>
          <el-button link type="success" @click="handleSetCover(row.id)">设为封面</el-button>
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

    <!-- 详情编辑弹窗 -->
    <el-dialog v-model="detailVisible" title="影像详情" width="600px" destroy-on-close>
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="标题">
          <el-input v-model="editForm.title" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="拍摄年份">
          <el-input v-model="editForm.taken_year" />
        </el-form-item>
        <el-form-item label="拍摄地点">
          <el-input v-model="editForm.taken_location" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="editForm.category" style="width: 100%;">
            <el-option label="家庭合影" value="family_portrait" />
            <el-option label="个人照片" value="portrait" />
            <el-option label="风景" value="landscape" />
            <el-option label="文物" value="artifact" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="detailVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量操作弹窗 -->
    <el-dialog
      v-model="batchDialogVisible"
      :title="batchAction === 'update' ? '批量更新' : '批量删除'"
      width="500px"
      destroy-on-close
    >
      <template v-if="batchAction === 'update'">
        <el-form :model="editForm" label-width="100px">
          <el-form-item label="拍摄年份">
            <el-input v-model="editForm.taken_year" placeholder="留空则不更新" />
          </el-form-item>
          <el-form-item label="拍摄地点">
            <el-input v-model="editForm.taken_location" placeholder="留空则不更新" />
          </el-form-item>
          <el-form-item label="分类">
            <el-select v-model="editForm.category" placeholder="留空则不更新" clearable style="width: 100%;">
              <el-option label="家庭合影" value="family_portrait" />
              <el-option label="个人照片" value="portrait" />
              <el-option label="风景" value="landscape" />
              <el-option label="文物" value="artifact" />
              <el-option label="其他" value="other" />
            </el-select>
          </el-form-item>
        </el-form>
      </template>
      <template v-else>
        <p>确定要删除选中的 <strong>{{ selectedItems.length }}</strong> 项影像吗？此操作不可逆。</p>
      </template>
      <template #footer>
        <template v-if="batchAction === 'update'">
          <el-button @click="batchDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleBatchUpdate">确认更新</el-button>
        </template>
        <template v-else>
          <el-button @click="batchDialogVisible = false">取消</el-button>
          <el-button type="danger" @click="handleBatchDelete">确认删除</el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.media-library-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.filter-card {
  margin-bottom: 0;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
