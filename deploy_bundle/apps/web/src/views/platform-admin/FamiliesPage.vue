<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()

const loading = ref(false)
const families = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)
const filterKeyword = ref('')
const filterStatus = ref('')
const filterStartDate = ref('')
const filterEndDate = ref('')

const fetchFamilies = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/platform/families', {
      params: {
        keyword: filterKeyword.value || undefined,
        status: filterStatus.value || undefined,
        startDate: filterStartDate.value || undefined,
        endDate: filterEndDate.value || undefined,
        page: currentPage.value,
        pageSize: pageSize.value,
      },
    })
    families.value = res.data.data
    total.value = res.data.pagination.total
  } catch (err) {
    console.error('获取家族列表失败', err)
  } finally {
    loading.value = false
  }
}

const statusType = (s: string) => {
  switch (s) {
    case 'NORMAL': return 'success'
    case 'FROZEN': return 'warning'
    case 'PENDING_REVIEW': return 'info'
    case 'DELETED': return 'danger'
    default: return 'info'
  }
}

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    NORMAL: '正常', FROZEN: '已冻结', PENDING_REVIEW: '待审核', DELETED: '已删除',
  }
  return map[s] || s
}

const handleApprove = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定审核通过「${row.name}」？`, '确认', { type: 'success' })
    await axios.post(`/api/platform/families/${row.id}/approve`)
    ElMessage.success('已通过')
    fetchFamilies()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleReject = async (row: any) => {
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回理由', '驳回注册', {
      inputPattern: /.+/, inputErrorMessage: '理由不能为空', inputType: 'textarea',
    })
    await axios.post(`/api/platform/families/${row.id}/reject`, { reason: value })
    ElMessage.success('已驳回')
    fetchFamilies()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleFreeze = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定冻结「${row.name}」？冻结后家族成员将无法登录。`, '冻结家族', { type: 'warning' })
    await axios.post(`/api/platform/families/${row.id}/freeze`)
    ElMessage.success('已冻结')
    fetchFamilies()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleUnfreeze = async (row: any) => {
  try {
    await axios.post(`/api/platform/families/${row.id}/unfreeze`)
    ElMessage.success('已解冻')
    fetchFamilies()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要逻辑删除「${row.name}」？此操作可在 30 天内联系客服恢复。`,
      '删除家族',
      { type: 'error', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    )
    await axios.delete(`/api/platform/families/${row.id}`)
    ElMessage.success('已删除')
    fetchFamilies()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleExport = async (row: any) => {
  try {
    const res = await axios.get(`/api/platform/families/${row.id}/export`, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `clan_${row.id}_${Date.now()}.json`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('已导出')
  } catch (err: any) {
    ElMessage.error('导出失败')
  }
}

const goDetail = (row: any) => {
  router.push(`/platform-admin/families/${row.id}`)
}

onMounted(() => {
  fetchFamilies()
})
</script>

<template>
  <div class="families-page">
    <ElCard shadow="hover">
      <template #header>
        <div class="page-header">
          <h2>家族管理</h2>
          <ElButton @click="fetchFamilies">刷新</ElButton>
        </div>
      </template>

      <div class="filter-bar">
        <ElInput v-model="filterKeyword" placeholder="搜索家族名称" clearable @input="fetchFamilies" style="width: 220px;" />
        <ElSelect v-model="filterStatus" placeholder="状态" clearable @change="fetchFamilies" style="width: 160px;">
          <ElOption label="正常" value="NORMAL" />
          <ElOption label="待审核" value="PENDING_REVIEW" />
          <ElOption label="已冻结" value="FROZEN" />
          <ElOption label="已删除" value="DELETED" />
        </ElSelect>
        <ElDatePicker v-model="filterStartDate" type="date" placeholder="注册开始" @change="fetchFamilies" />
        <ElDatePicker v-model="filterEndDate" type="date" placeholder="注册结束" @change="fetchFamilies" />
      </div>

      <ElTable :data="families" v-loading="loading" stripe>
        <ElTableColumn prop="name" label="家族名称" min-width="160">
          <template #default="{ row }">
            <ElLink type="primary" @click="goDetail(row)">{{ row.name }}</ElLink>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="admin_phone_masked" label="管理员" width="160" />
        <ElTableColumn prop="member_count" label="成员" width="80" align="center" />
        <ElTableColumn prop="person_count" label="人物" width="80" align="center" />
        <ElTableColumn prop="media_count" label="照片" width="80" align="center" />
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusType(row.status)">{{ statusLabel(row.status) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="register_ip" label="注册IP" width="140" />
        <ElTableColumn label="注册时间" width="170">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" @click="goDetail(row)">详情</ElButton>
            <ElButton v-if="row.status === 'PENDING_REVIEW'" size="small" type="success" @click="handleApprove(row)">通过</ElButton>
            <ElButton v-if="row.status === 'PENDING_REVIEW'" size="small" type="danger" @click="handleReject(row)">驳回</ElButton>
            <ElButton v-if="row.status === 'NORMAL'" size="small" type="warning" @click="handleFreeze(row)">冻结</ElButton>
            <ElButton v-if="row.status === 'FROZEN'" size="small" type="primary" @click="handleUnfreeze(row)">解冻</ElButton>
            <ElButton size="small" @click="handleExport(row)">导出</ElButton>
            <ElButton v-if="row.status !== 'DELETED'" size="small" type="danger" @click="handleDelete(row)">删除</ElButton>
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
        @size-change="fetchFamilies"
        @current-change="fetchFamilies"
      />
    </ElCard>
  </div>
</template>

<style scoped>
.families-page {
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
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
