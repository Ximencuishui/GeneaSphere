<template>
  <div class="page">
    <div class="page-header">
      <h2>信息修改审核</h2>
      <div>
        <el-select v-model="status" placeholder="状态" clearable style="width: 160px;" @change="fetchList">
          <el-option label="PENDING" value="PENDING" />
          <el-option label="APPROVED" value="APPROVED" />
          <el-option label="REJECTED" value="REJECTED" />
        </el-select>
        <el-button @click="fetchList" style="margin-left: 8px;">刷新</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="person_id" label="人物 ID" width="120" />
      <el-table-column prop="field_name" label="字段" width="100" />
      <el-table-column prop="old_value" label="原值" />
      <el-table-column prop="new_value" label="新值" />
      <el-table-column prop="reason" label="原因" width="160" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="提交时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'PENDING'" size="small" type="success" @click="onReview(row, 'APPROVED')">通过</el-button>
          <el-button v-if="row.status === 'PENDING'" size="small" type="danger" @click="onReview(row, 'REJECTED')">驳回</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="rejectDialogVisible" title="驳回原因" width="420">
      <el-input v-model="rejectReason" type="textarea" :rows="3" placeholder="请输入驳回原因" />
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="confirmReject">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const route = useRoute()
const clanId = ref(String(route.query.clanId || '1'))

const list = ref<any[]>([])
const status = ref<string>('')
const loading = ref(false)
const rejectDialogVisible = ref(false)
const rejectReason = ref('')
const currentRecord = ref<any>(null)

const formatDate = (d: string) => (d ? new Date(d).toLocaleString() : '—')

const statusTag = (s: string) => ({
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger',
}[s] as any || '')

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/invite/modification-requests', {
      params: { clan_id: clanId.value, status: status.value || undefined },
    })
    list.value = res.data.data
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const onReview = async (row: any, decision: 'APPROVED' | 'REJECTED') => {
  if (decision === 'REJECTED') {
    currentRecord.value = row
    rejectReason.value = ''
    rejectDialogVisible.value = true
    return
  }
  try {
    await axios.patch(`/api/invite/modification-requests/${row.id}`, { status: 'APPROVED' })
    ElMessage.success('已通过')
    await fetchList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '操作失败')
  }
}

const confirmReject = async () => {
  if (!rejectReason.value) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  try {
    await axios.patch(`/api/invite/modification-requests/${currentRecord.value.id}`, {
      status: 'REJECTED',
      reject_reason: rejectReason.value,
    })
    ElMessage.success('已驳回')
    rejectDialogVisible.value = false
    await fetchList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '操作失败')
  }
}

onMounted(fetchList)
</script>

<style scoped>
.page { padding: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
</style>
