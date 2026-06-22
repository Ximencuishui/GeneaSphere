<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const items = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const filterStatus = ref('')
const filterFamilyId = ref('')
const filterStartDate = ref('')
const filterEndDate = ref('')

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/platform/orders/recharge', {
      params: {
        status: filterStatus.value || undefined,
        familyId: filterFamilyId.value || undefined,
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

const handleExport = async () => {
  try {
    const res = await axios.get('/api/platform/orders/recharge/export-csv', {
      params: {
        startDate: filterStartDate.value || undefined,
        endDate: filterEndDate.value || undefined,
      },
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `recharge_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('已导出对账 CSV')
  } catch (err) {
    ElMessage.error('导出失败')
  }
}

const statusType = (s: string) => (s === 'SUCCESS' ? 'success' : s === 'FAILED' ? 'danger' : 'warning')

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="recharge-page">
    <ElCard shadow="hover">
      <template #header>
        <div class="page-header">
          <h2>充值订单</h2>
          <ElButton type="primary" @click="handleExport">导出对账 CSV</ElButton>
        </div>
      </template>

      <div class="filter-bar">
        <ElSelect v-model="filterStatus" placeholder="状态" clearable @change="fetchList" style="width: 140px;">
          <ElOption label="成功" value="SUCCESS" />
          <ElOption label="失败" value="FAILED" />
          <ElOption label="待处理" value="PENDING" />
        </ElSelect>
        <ElInput v-model="filterFamilyId" placeholder="家族ID" clearable @input="fetchList" style="width: 160px;" />
        <ElDatePicker v-model="filterStartDate" type="date" placeholder="开始日期" @change="fetchList" />
        <ElDatePicker v-model="filterEndDate" type="date" placeholder="结束日期" @change="fetchList" />
      </div>

      <ElTable :data="items" v-loading="loading" stripe>
        <ElTableColumn prop="id" label="ID" width="100" />
        <ElTableColumn label="家族" width="160">
          <template #default="{ row }">
            <span>{{ row.family.name }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="user_id" label="用户ID" width="240" />
        <ElTableColumn label="金额" width="120">
          <template #default="{ row }">¥{{ Number(row.amount).toFixed(2) }}</template>
        </ElTableColumn>
        <ElTableColumn label="赠送" width="100">
          <template #default="{ row }">¥{{ Number(row.bonus_amount).toFixed(2) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="payment_method" label="支付方式" width="100" />
        <ElTableColumn prop="transaction_no" label="交易号" width="200" show-overflow-tooltip />
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusType(row.status)">{{ row.status }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="创建时间" width="170">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString() }}
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
.recharge-page {
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
