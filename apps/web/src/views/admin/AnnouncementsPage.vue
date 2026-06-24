<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const clanId = computed(() => route.query.clanId || '1')

// 数据列表
const announcements = ref<any[]>([])
const loading = ref(false)
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
})

// 表单数据
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const formData = ref({
  title: '',
  content: '',
  cover_url: '',
  is_pinned: false,
  is_active: true,
})

// 加载数据
const fetchData = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/announcements', {
      params: {
        clanId: clanId.value,
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
      },
    })
    announcements.value = res.data.data
    pagination.value.total = res.data.total
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 新增/编辑
const handleAdd = () => {
  editingId.value = null
  formData.value = {
    title: '',
    content: '',
    cover_url: '',
    is_pinned: false,
    is_active: true,
  }
  dialogVisible.value = true
}

const handleEdit = (row: any) => {
  editingId.value = row.id
  formData.value = {
    title: row.title,
    content: row.content,
    cover_url: row.cover_url || '',
    is_pinned: row.is_pinned,
    is_active: row.is_active,
  }
  dialogVisible.value = true
}

const handleSubmit = async () => {
  try {
    if (editingId.value) {
      await axios.put(`/api/admin/announcements/${editingId.value}`, {
        ...formData.value,
        clanId: clanId.value,
      })
      ElMessage.success('更新成功')
    } else {
      await axios.post('/api/admin/announcements', {
        ...formData.value,
        clanId: clanId.value,
      })
      ElMessage.success('发布成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

// 删除
const handleDelete = async (id: string) => {
  try {
    await ElMessageBox.confirm('确定要删除该公告吗？', '提示', {
      type: 'warning',
    })
    await axios.delete(`/api/admin/announcements/${id}`, {
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

// 置顶/取消置顶
const handleTogglePin = async (row: any) => {
  try {
    await axios.patch(`/api/admin/announcements/${row.id}/pin`, {
      isPinned: !row.is_pinned,
    }, {
      params: { clanId: clanId.value },
    })
    ElMessage.success(row.is_pinned ? '已取消置顶' : '已置顶')
    fetchData()
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

// 下架/上架
const handleToggleStatus = async (row: any) => {
  try {
    await axios.patch(`/api/admin/announcements/${row.id}/status`, {
      isActive: !row.is_active,
    }, {
      params: { clanId: clanId.value },
    })
    ElMessage.success(row.is_active ? '已下架' : '已发布')
    fetchData()
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

const handlePageChange = (page: number) => {
  pagination.value.page = page
  fetchData()
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="announcements-page">
    <div class="page-header">
      <h2>公告管理</h2>
      <el-button type="primary" @click="handleAdd">发布公告</el-button>
    </div>

    <el-table :data="announcements" v-loading="loading" stripe>
      <el-table-column prop="title" label="标题" min-width="200" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'">
            {{ row.is_active ? '已发布' : '草稿' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="置顶" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.is_pinned" type="warning">置顶</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="creator_name" label="创建人" width="120" />
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">
          {{ new Date(row.created_at).toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
          <el-button link type="warning" @click="handleTogglePin(row)">
            {{ row.is_pinned ? '取消置顶' : '置顶' }}
          </el-button>
          <el-button link type="info" @click="handleToggleStatus(row)">
            {{ row.is_active ? '下架' : '发布' }}
          </el-button>
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

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑公告' : '发布公告'" width="600px">
      <el-form :model="formData" label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="formData.title" placeholder="请输入公告标题" maxlength="200" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="formData.content" type="textarea" :rows="6" placeholder="请输入公告内容" />
        </el-form-item>
        <el-form-item label="封面图">
          <el-input v-model="formData.cover_url" placeholder="请输入封面图 URL" />
        </el-form-item>
        <el-form-item label="置顶">
          <el-switch v-model="formData.is_pinned" />
        </el-form-item>
        <el-form-item label="发布状态">
          <el-switch v-model="formData.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.announcements-page {
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

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
