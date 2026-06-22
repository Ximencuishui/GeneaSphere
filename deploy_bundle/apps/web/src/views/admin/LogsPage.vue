<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const route = useRoute()

const clanId = ref('')
const loading = ref(false)
const logs = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)

// 筛选条件
const filterAction = ref('')
const filterUserId = ref('')
const filterStartDate = ref('')
const filterEndDate = ref('')

const actionOptions = ref([
  { label: '修改成员角色', value: 'UPDATE_MEMBER_ROLE' },
  { label: '移除成员', value: 'REMOVE_MEMBER' },
  { label: '通过影像审核', value: 'APPROVE_MEDIA' },
  { label: '驳回影像审核', value: 'REJECT_MEDIA' },
  { label: '通过生平审核', value: 'APPROVE_BIO' },
  { label: '驳回生平审核', value: 'REJECT_BIO' },
  { label: '合并支系', value: 'MERGE_BRANCH' },
  { label: '修改隐私配置', value: 'UPDATE_PRIVACY_SETTINGS' },
  { label: '修改字辈', value: 'UPDATE_XIPAI' },
])

const fetchLogs = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/logs', {
      params: {
        clanId: clanId.value,
        page: currentPage.value,
        pageSize: pageSize.value,
        action: filterAction.value || undefined,
        userId: filterUserId.value || undefined,
        startDate: filterStartDate.value || undefined,
        endDate: filterEndDate.value || undefined,
      },
    })
    logs.value = res.data.data
    total.value = res.data.pagination.total
  } catch (error) {
    console.error('Failed to fetch logs:', error)
  } finally {
    loading.value = false
  }
}

const handleExport = async () => {
  try {
    const res = await axios.get('/api/admin/logs/export', {
      params: {
        clanId: clanId.value,
        startDate: filterStartDate.value || undefined,
        endDate: filterEndDate.value || undefined,
      },
      responseType: 'blob',
    })
    const blob = new Blob([res.data], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `audit_logs_${clanId.value}_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('日志已导出')
  } catch (error) {
    ElMessage.error('导出失败')
  }
}

onMounted(() => {
  clanId.value = route.query.clanId as string || '1'
  fetchLogs()
})
</script>

<template>
  <div class="logs-page">
    <ElCard>
      <template #header>
        <div class="page-header">
          <h2>操作日志</h2>
          <ElButton type="primary" @click="handleExport">
            导出CSV
          </ElButton>
        </div>
      </template>

      <!-- 筛选栏 -->
      <div class="filter-bar">
        <ElSelect
          v-model="filterAction"
          placeholder="操作类型"
          clearable
          style="width: 200px;"
          @change="fetchLogs"
        >
          <ElOption
            v-for="opt in actionOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </ElSelect>
        <ElDatePicker
          v-model="filterStartDate"
          type="date"
          placeholder="开始日期"
          style="width: 150px;"
          @change="fetchLogs"
        />
        <ElDatePicker
          v-model="filterEndDate"
          type="date"
          placeholder="结束日期"
          style="width: 150px;"
          @change="fetchLogs"
        />
        <ElButton @click="fetchLogs">刷新</ElButton>
      </div>

      <ElTable :data="logs" v-loading="loading" class="logs-table">
        <ElTableColumn prop="created_at" label="时间" width="180">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn prop="user_phone" label="操作人" width="150" />
        <ElTableColumn prop="action" label="操作类型" width="200">
          <template #default="{ row }">
            <ElTag>{{ row.action }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="target_type" label="目标类型" width="150" />
        <ElTableColumn prop="target_id" label="目标ID" width="120" />
        <ElTableColumn prop="details" label="详情" min-width="200" />
        <ElTableColumn prop="ip_address" label="IP地址" width="150" />
      </ElTable>

      <ElEmpty v-if="!loading && logs.length === 0" description="暂无日志数据" />

      <ElPagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchLogs"
        @current-change="fetchLogs"
      />
    </ElCard>
  </div>
</template>

<style scoped>
.logs-page {
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
  gap: 16px;
  margin-bottom: 20px;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.logs-table {
  margin-top: 20px;
}
</style>
