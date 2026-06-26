<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const clanSlug = computed(() => route.params.slug || '1')

const reports = ref<any[]>([])
const loading = ref(false)
const pagination = ref({ page: 1, pageSize: 20, total: 0 })
const filters = ref({ status: 'all', targetType: '' })

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {
      clanSlug: clanId.value,
      page: pagination.value.page,
      pageSize: pagination.value.pageSize,
    }
    if (filters.value.status !== 'all') {
      params.status = filters.value.status
    }
    if (filters.value.targetType) {
      params.targetType = filters.value.targetType
    }
    const res = await axios.get('/api/admin/reports', { params })
    reports.value = res.data.data
    pagination.value.total = res.data.total
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const handleConfirm = async (id: string) => {
  try {
    await ElMessageBox.confirm('确认该举报内容违规并处理？', '提示', { type: 'warning' })
    await axios.post(`/api/admin/reports/${id}/confirm`, {
      clanSlug: clanId.value,
      result: '已确认违规并处理',
    })
    ElMessage.success('已确认处理')
    fetchData()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '操作失败')
    }
  }
}

const handleReject = async (id: string) => {
  try {
    await ElMessageBox.confirm('驳回该举报？', '提示', { type: 'info' })
    await axios.post(`/api/admin/reports/${id}/reject`, {
      clanSlug: clanId.value,
      result: '举报已驳回',
    })
    ElMessage.success('已驳回')
    fetchData()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '操作失败')
    }
  }
}

const handleFilter = () => {
  pagination.value.page = 1
  fetchData()
}

const handlePageChange = (page: number) => {
  pagination.value.page = page
  fetchData()
}

const getStatusType = (status: string) => {
  switch (status) {
    case 'PENDING': return 'warning'
    case 'CONFIRMED': return 'danger'
    case 'REJECTED': return 'info'
    default: return 'info'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'PENDING': return '待处理'
    case 'CONFIRMED': return '已确认'
    case 'REJECTED': return '已驳回'
    default: return status
  }
}

const getTargetTypeText = (type: string) => {
  switch (type) {
    case 'MEDIA': return '影像'
    case 'BIO': return '生平'
    case 'POST': return '寻亲帖'
    case 'MEMBER': return '成员'
    default: return type
  }
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="reports-page">
    <div class="page-header">
      <h2>举报管理</h2>
      <div class="filters">
        <el-select v-model="filters.status" placeholder="状态" style="width: 120px" @change="handleFilter">
          <el-option label="全部" value="all" />
          <el-option label="待处理" value="PENDING" />
          <el-option label="已确认" value="CONFIRMED" />
          <el-option label="已驳回" value="REJECTED" />
        </el-select>
        <el-select v-model="filters.targetType" placeholder="类型" style="width: 120px" @change="handleFilter">
          <el-option label="全部类型" value="" />
          <el-option label="影像" value="MEDIA" />
          <el-option label="生平" value="BIO" />
          <el-option label="寻亲帖" value="POST" />
          <el-option label="成员" value="MEMBER" />
        </el-select>
      </div>
    </div>

    <el-table :data="reports" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          <el-tag>{{ getTargetTypeText(row.target_type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="举报原因" min-width="150" />
      <el-table-column prop="description" label="详细描述" min-width="150" show-overflow-tooltip />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)">
            {{ getStatusText(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="reporter_name" label="举报人" width="120" />
      <el-table-column prop="created_at" label="举报时间" width="180">
        <template #default="{ row }">
          {{ new Date(row.created_at).toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'PENDING'">
            <el-button link type="danger" @click="handleConfirm(row.id)">确认</el-button>
            <el-button link type="info" @click="handleReject(row.id)">驳回</el-button>
          </template>
          <span v-else class="handled-info">{{ row.result }}</span>
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
  </div>
</template>

<style scoped>
.reports-page {
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

.filters {
  display: flex;
  gap: 10px;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.handled-info {
  color: #999;
  font-size: 12px;
}
</style>
