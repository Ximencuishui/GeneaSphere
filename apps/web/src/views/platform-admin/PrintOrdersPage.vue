<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const orders = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const activeStatus = ref('')
const filterFamilyId = ref('')
const filterStartDate = ref('')
const filterEndDate = ref('')

const shipDialogVisible = ref(false)
const shipForm = ref({ id: '', tracking_no: '', tracking_company: '顺丰' })

const refundDialogVisible = ref(false)
const refundForm = ref({ id: '', amount: 0, reason: '' })

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/platform/orders/print', {
      params: {
        status: activeStatus.value || undefined,
        familyId: filterFamilyId.value || undefined,
        startDate: filterStartDate.value || undefined,
        endDate: filterEndDate.value || undefined,
        page: currentPage.value,
        pageSize: pageSize.value,
      },
    })
    orders.value = res.data.data
    total.value = res.data.pagination.total
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    PENDING: '待支付', PAID: '已支付', PRINTING: '印刷中', SHIPPED: '已发货', COMPLETED: '已完成', CANCELLED: '已取消',
  }
  return map[s] || s
}
const statusType = (s: string) => {
  if (s === 'COMPLETED') return 'success'
  if (s === 'CANCELLED') return 'danger'
  if (s === 'SHIPPED') return 'primary'
  return 'warning'
}

const openShip = (row: any) => {
  shipForm.value = { id: row.id, tracking_no: '', tracking_company: '顺丰' }
  shipDialogVisible.value = true
}

const submitShip = async () => {
  if (!shipForm.value.tracking_no) {
    ElMessage.warning('请填写物流单号')
    return
  }
  try {
    await axios.post(`/api/platform/orders/print/${shipForm.value.id}/ship`, {
      tracking_no: shipForm.value.tracking_no,
      tracking_company: shipForm.value.tracking_company,
    })
    ElMessage.success('已标记发货')
    shipDialogVisible.value = false
    fetchList()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const openRefund = (row: any) => {
  refundForm.value = { id: row.id, amount: Number(row.amount), reason: '' }
  refundDialogVisible.value = true
}

const submitRefund = async () => {
  if (!refundForm.value.amount || refundForm.value.amount <= 0 || !refundForm.value.reason) {
    ElMessage.warning('请填写退款金额与原因')
    return
  }
  try {
    await axios.post(`/api/platform/orders/print/${refundForm.value.id}/refund`, {
      amount: refundForm.value.amount,
      reason: refundForm.value.reason,
    })
    ElMessage.success('已发起退款')
    refundDialogVisible.value = false
    fetchList()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const getLogistics = (row: any) => {
  if (row.tracking_no) {
    window.open(`https://www.kuaidi100.com/chaxun?nu=${row.tracking_no}`, '_blank')
  }
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="print-orders-page">
    <ElCard shadow="hover">
      <template #header>
        <div class="page-header">
          <h2>印刷订单管理</h2>
          <ElButton @click="fetchList">刷新</ElButton>
        </div>
      </template>

      <ElTabs v-model="activeStatus" @tab-change="fetchList">
        <ElTabPane label="全部" name="" />
        <ElTabPane label="待支付" name="PENDING" />
        <ElTabPane label="已支付" name="PAID" />
        <ElTabPane label="印刷中" name="PRINTING" />
        <ElTabPane label="已发货" name="SHIPPED" />
        <ElTabPane label="已完成" name="COMPLETED" />
        <ElTabPane label="已取消" name="CANCELLED" />
      </ElTabs>

      <div class="filter-bar">
        <ElInput v-model="filterFamilyId" placeholder="家族ID" clearable @input="fetchList" style="width: 160px;" />
        <ElDatePicker v-model="filterStartDate" type="date" placeholder="开始日期" @change="fetchList" />
        <ElDatePicker v-model="filterEndDate" type="date" placeholder="结束日期" @change="fetchList" />
      </div>

      <ElTable :data="orders" v-loading="loading" stripe>
        <ElTableColumn prop="id" label="订单号" width="100" />
        <ElTableColumn label="家族" width="160">
          <template #default="{ row }">
            <span>{{ row.family.name }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="user_phone_masked" label="下单人" width="140" />
        <ElTableColumn prop="specification" label="规格" min-width="140" />
        <ElTableColumn prop="quantity" label="数量" width="80" align="center" />
        <ElTableColumn label="金额" width="100">
          <template #default="{ row }">¥{{ Number(row.amount).toFixed(2) }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusType(row.status)">{{ statusLabel(row.status) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="退款" width="100">
          <template #default="{ row }">
            <ElTag v-if="row.refund_status === 'FULL'" type="info">全额</ElTag>
            <ElTag v-else-if="row.refund_status === 'PARTIAL'" type="warning">部分 ¥{{ row.refund_amount }}</ElTag>
            <span v-else>-</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="tracking_no" label="物流单号" width="140" />
        <ElTableColumn label="下单时间" width="170">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <ElButton v-if="['PAID','PRINTING','PENDING'].includes(row.status)" size="small" type="primary" @click="openShip(row)">发货</ElButton>
            <ElButton v-if="!['CANCELLED'].includes(row.status) && row.refund_status !== 'FULL'" size="small" type="warning" @click="openRefund(row)">退款</ElButton>
            <ElButton size="small" :disabled="!row.tracking_no" @click="getLogistics(row)">物流</ElButton>
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

    <ElDialog v-model="shipDialogVisible" title="标记发货" width="480px">
      <ElForm label-width="100px">
        <ElFormItem label="快递公司">
          <ElSelect v-model="shipForm.tracking_company" style="width: 100%;">
            <ElOption label="顺丰速运" value="顺丰" />
            <ElOption label="中通快递" value="中通" />
            <ElOption label="圆通速递" value="圆通" />
            <ElOption label="韵达快递" value="韵达" />
            <ElOption label="EMS" value="EMS" />
            <ElOption label="京东物流" value="京东" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="物流单号">
          <ElInput v-model="shipForm.tracking_no" placeholder="请填写物流单号" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="shipDialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="submitShip">确认发货</ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="refundDialogVisible" title="发起退款" width="480px">
      <ElForm label-width="100px">
        <ElFormItem label="退款金额">
          <ElInputNumber v-model="refundForm.amount" :min="0.01" :precision="2" :step="1" style="width: 100%;" />
        </ElFormItem>
        <ElFormItem label="退款原因">
          <ElInput v-model="refundForm.reason" type="textarea" :rows="3" placeholder="请填写退款原因" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="refundDialogVisible = false">取消</ElButton>
        <ElButton type="warning" @click="submitRefund">确认退款</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.print-orders-page {
  max-width: 1500px;
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

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
