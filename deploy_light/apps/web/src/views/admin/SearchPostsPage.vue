<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()

const clanId = ref('')
const loading = ref(false)
const posts = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)

// 编辑对话框
const editDialogVisible = ref(false)
const editingPost = ref<any>(null)
const editForm = ref({
  origin_place: '',
  xipai_keywords: '',
  contact_info: '',
})

const fetchPosts = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/merge/posts', {
      params: {
        clanId: clanId.value,
        page: currentPage.value,
        pageSize: pageSize.value,
      },
    })
    posts.value = res.data.data
    total.value = res.data.pagination.total
  } catch (error) {
    console.error('Failed to fetch search posts:', error)
  } finally {
    loading.value = false
  }
}

const openEditDialog = (post: any) => {
  editingPost.value = post
  editForm.value = {
    origin_place: post.origin_place,
    xipai_keywords: Array.isArray(post.xipai_keywords) ? post.xipai_keywords.join(', ') : post.xipai_keywords || '',
    contact_info: post.contact_info || '',
  }
  editDialogVisible.value = true
}

const saveEdit = async () => {
  try {
    await axios.post(`/api/admin/merge/posts/${editingPost.value.id}/edit`, {
      origin_place: editForm.value.origin_place,
      xipai_keywords: editForm.value.xipai_keywords.split(',').map((s: string) => s.trim()).filter(Boolean),
      contact_info: editForm.value.contact_info,
    })
    ElMessage.success('寻亲帖已更新')
    editDialogVisible.value = false
    fetchPosts()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '更新失败')
  }
}

const handleDelete = async (post: any) => {
  try {
    await ElMessageBox.confirm(
      '确定要删除此寻亲帖吗？',
      '确认删除',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    await axios.post(`/api/admin/merge/posts/${post.id}/delete`)
    ElMessage.success('寻亲帖已删除')
    fetchPosts()
  } catch (error: any) {
    if (error !== 'cancel' && error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  }
}

onMounted(() => {
  clanId.value = route.query.clanId as string || '1'
  fetchPosts()
})
</script>

<template>
  <div class="search-posts-page">
    <ElCard>
      <template #header>
        <div class="page-header">
          <h2>寻亲帖管理</h2>
        </div>
      </template>

      <ElTable :data="posts" v-loading="loading">
        <ElTableColumn prop="origin_place" label="祖籍地" width="200" />
        <ElTableColumn label="字辈关键词" min-width="200">
          <template #default="{ row }">
            <ElTag v-for="x in row.xipai_keywords" :key="x" style="margin-right: 4px;">
              {{ x }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="contact_info" label="联系方式" width="200" />
        <ElTableColumn prop="created_by" label="创建者" width="150" />
        <ElTableColumn prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleDateString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <ElButton type="primary" size="small" @click="openEditDialog(row)">
              编辑
            </ElButton>
            <ElButton type="danger" size="small" @click="handleDelete(row)">
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElEmpty v-if="!loading && posts.length === 0" description="暂无寻亲帖" />

      <ElPagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchPosts"
        @current-change="fetchPosts"
      />
    </ElCard>

    <!-- 编辑对话框 -->
    <ElDialog v-model="editDialogVisible" title="编辑寻亲帖" width="500px">
      <ElForm label-width="100px">
        <ElFormItem label="祖籍地">
          <ElInput v-model="editForm.origin_place" />
        </ElFormItem>
        <ElFormItem label="字辈关键词">
          <ElInput v-model="editForm.xipai_keywords" placeholder="多个关键词用逗号分隔" />
        </ElFormItem>
        <ElFormItem label="联系方式">
          <ElInput v-model="editForm.contact_info" type="textarea" :rows="3" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="editDialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="saveEdit">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.search-posts-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h2 {
  margin: 0;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
