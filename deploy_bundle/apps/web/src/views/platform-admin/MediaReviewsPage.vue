<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const items = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const activeStatus = ref('PENDING')
const filterClanId = ref('')
const filterStartDate = ref('')
const filterEndDate = ref('')

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/platform/reviews/media', {
      params: {
        status: activeStatus.value,
        clanId: filterClanId.value || undefined,
        startDate: filterStartDate.value || undefined,
        endDate: filterEndDate.value || undefined,
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
    await axios.post(`/api/platform/reviews/media/${row.id}/approve`)
    ElMessage.success('已通过')
    fetchList()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleReject = async (row: any) => {
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回理由', '驳回影像', {
      inputPattern: /.+/, inputErrorMessage: '理由不能为空', inputType: 'textarea',
    })
    await axios.post(`/api/platform/reviews/media/${row.id}/reject`, { reason: value })
    ElMessage.success('已驳回')
    fetchList()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定删除该影像（违规处理）？此操作不可逆。', '违规删除', { type: 'error' })
    await axios.post(`/api/platform/reviews/media/${row.id}/delete`)
    ElMessage.success('已删除')
    fetchList()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="media-reviews-page">
    <ElCard shadow="hover">
      <template #header>
        <div class="page-header">
          <h2>全平台影像审核</h2>
          <ElButton @click="fetchList">刷新</ElButton>
        </div>
      </template>

      <ElTabs v-model="activeStatus" @tab-change="fetchList">
        <ElTabPane label="待审核" name="PENDING" />
        <ElTabPane label="已通过" name="APPROVED" />
        <ElTabPane label="已驳回" name="REJECTED" />
      </ElTabs>

      <div class="filter-bar">
        <ElInput v-model="filterClanId" placeholder="家族ID" clearable @input="fetchList" style="width: 160px;" />
        <ElDatePicker v-model="filterStartDate" type="date" placeholder="开始日期" @change="fetchList" />
        <ElDatePicker v-model="filterEndDate" type="date" placeholder="结束日期" @change="fetchList" />
      </div>

      <ElTable :data="items" v-loading="loading" stripe>
        <ElTableColumn label="缩略图" width="100">
          <template #default="{ row }">
            <ElImage :src="row.media_url" :preview-src-list="[row.media_url]" class="thumbnail" fit="cover" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="所属家族" width="160">
          <template #default="{ row }">
            <span>{{ row.clan.name }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="uploader_id" label="上传者" width="220" />
        <ElTableColumn prop="taken_year" label="年代" width="80" />
        <ElTableColumn prop="taken_location" label="地点" width="140" />
        <ElTableColumn prop="description" label="描述" min-width="160" show-overflow-tooltip />
        <ElTableColumn label="提交时间" width="170">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <ElButton v-if="row.status === 'PENDING'" size="small" type="success" @click="handleApprove(row)">通过</ElButton>
            <ElButton v-if="row.status === 'PENDING'" size="small" type="warning" @click="handleReject(row)">驳回</ElButton>
            <ElButton v-if="row.status === 'PENDING'" size="small" type="danger" @click="handleDelete(row)">违规删除</ElButton>
            <span v-else-if="row.status === 'REJECTED'" class="muted">已驳回：{{ row.reject_reason }}</span>
            <span v-else class="muted">已通过</span>
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
.media-reviews-page {
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
  flex-wrap: wrap;
}

.thumbnail {
  width: 60px;
  height: 60px;
  border-radius: 4px;
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
