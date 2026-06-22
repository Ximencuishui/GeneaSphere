<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const items = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const activeStatus = ref('PUBLISHED')
const filterKeyword = ref('')

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/platform/reviews/posts', {
      params: {
        status: activeStatus.value || undefined,
        keyword: filterKeyword.value || undefined,
        page: currentPage.value,
        pageSize: pageSize.value,
      },
    })
    items.value = res.data.data
    total.value = res.data.pagination.total
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

const handleApprove = async (row: any) => {
  try {
    await axios.post(`/api/platform/reviews/posts/${row.id}/approve`)
    ElMessage.success('已通过')
    fetchList()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleRemove = async (row: any) => {
  try {
    const { value } = await ElMessageBox.prompt('请填写下架理由', '下架寻亲帖', {
      inputPattern: /.+/, inputErrorMessage: '理由不能为空', inputType: 'textarea',
    })
    await axios.post(`/api/platform/reviews/posts/${row.id}/remove`, { reason: value })
    ElMessage.success('已下架')
    fetchList()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const statusLabel = (s: string) => {
  const map: Record<string, string> = { PENDING: '待审核', PUBLISHED: '已发布', REMOVED: '已下架' }
  return map[s] || s
}
const statusType = (s: string) => {
  if (s === 'PUBLISHED') return 'success'
  if (s === 'REMOVED') return 'danger'
  return 'warning'
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="post-reviews-page">
    <ElCard shadow="hover">
      <template #header>
        <div class="page-header">
          <h2>全平台寻亲帖审核</h2>
          <ElButton @click="fetchList">刷新</ElButton>
        </div>
      </template>

      <ElTabs v-model="activeStatus" @tab-change="fetchList">
        <ElTabPane label="已发布" name="PUBLISHED" />
        <ElTabPane label="待审核" name="PENDING" />
        <ElTabPane label="已下架" name="REMOVED" />
      </ElTabs>

      <div class="filter-bar">
        <ElInput v-model="filterKeyword" placeholder="搜索祖籍/字辈" clearable @input="fetchList" style="width: 240px;" />
      </div>

      <ElTable :data="items" v-loading="loading" stripe>
        <ElTableColumn prop="id" label="ID" width="80" />
        <ElTableColumn prop="origin_place" label="祖籍地" min-width="140" />
        <ElTableColumn label="字辈" min-width="200">
          <template #default="{ row }">
            <ElTag v-for="x in row.xipai_keywords" :key="x" style="margin-right: 4px;">{{ x }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="contact_info" label="联系方式" width="160" show-overflow-tooltip />
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusType(row.status)">{{ statusLabel(row.status) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="发布时间" width="170">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <ElButton v-if="row.status === 'PENDING'" size="small" type="success" @click="handleApprove(row)">通过</ElButton>
            <ElButton v-if="row.status === 'PUBLISHED'" size="small" type="danger" @click="handleRemove(row)">下架</ElButton>
            <ElButton v-if="row.status === 'REMOVED'" size="small" type="success" @click="handleApprove(row)">恢复</ElButton>
            <span v-if="row.reject_reason" class="muted">理由：{{ row.reject_reason }}</span>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElPagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchList"
        @current-change="fetchList"
      />
    </ElCard>
  </div>
</template>

<style scoped>
.post-reviews-page {
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

.filter-bar {
  display: flex;
  gap: 12px;
  margin: 12px 0 16px;
}

.muted {
  color: #909399;
  font-size: 12px;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
