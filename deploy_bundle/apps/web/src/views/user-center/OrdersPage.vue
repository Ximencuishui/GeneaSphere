<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import userApi from '@/api/user'
import type { UserOrder, Pagination } from '@/types'

const router = useRouter()
const loading = ref(false)
const orders = ref<UserOrder[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const activeTab = ref('')

const statusLabels: Record<string, string> = {
  PENDING: '待支付',
  PAID: '已支付',
  PRINTING: '印刷中',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

function statusTagType(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'success'
    case 'SHIPPED':
      return 'primary'
    case 'PRINTING':
      return 'warning'
    case 'PAID':
      return 'info'
    case 'CANCELLED':
      return 'danger'
    default:
      return 'info'
  }
}

async function fetchOrders() {
  loading.value = true
  try {
    const res = (await userApi.orders.list({
      page: currentPage.value,
      pageSize: pageSize.value,
      status: activeTab.value || undefined,
    })) as unknown as Pagination<UserOrder>
    orders.value = res.data
    total.value = res.pagination.total
  } finally {
    loading.value = false
  }
}

function handleTabChange() {
  currentPage.value = 1
  fetchOrders()
}

function viewDetail(order: UserOrder) {
  router.push(`/user-center/orders/${order.id}`)
}

function viewLogistics(order: UserOrder) {
  if (!order.tracking_no) return
  window.open(
    `https://www.kuaidi100.com/chaxun?nu=${order.tracking_no}`,
    '_blank',
  )
}

onMounted(fetchOrders)
</script>

<template>
  <div class="orders-page">
    <ElCard v-loading="loading">
      <template #header>
        <h2 class="page-title">我的订单</h2>
      </template>

      <ElTabs v-model="activeTab" @tab-change="handleTabChange">
        <ElTabPane label="全部" name="" />
        <ElTabPane label="待支付" name="PENDING" />
        <ElTabPane label="印刷中" name="PRINTING" />
        <ElTabPane label="已发货" name="SHIPPED" />
        <ElTabPane label="已完成" name="COMPLETED" />
        <ElTabPane label="已取消" name="CANCELLED" />
      </ElTabs>

      <ElTable :data="orders">
        <ElTableColumn prop="id" label="订单号" width="120" />
        <ElTableColumn prop="specification" label="印刷规格" min-width="160" />
        <ElTableColumn prop="quantity" label="数量" width="80" />
        <ElTableColumn label="金额" width="120">
          <template #default="{ row }">
            ¥{{ Number(row.amount).toFixed(2) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusTagType(row.status) as any" size="small">
              {{ statusLabels[row.status] || row.status }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="tracking_no" label="物流单号" width="150">
          <template #default="{ row }">
            {{ row.tracking_no || '—' }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="下单时间" width="170">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" type="primary" plain @click="viewDetail(row)">
              详情
            </ElButton>
            <ElButton
              size="small"
              :disabled="!row.tracking_no"
              @click="viewLogistics(row)"
            >
              物流
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElEmpty
        v-if="!loading && orders.length === 0"
        description="暂无订单"
      >
        <ElButton type="primary" @click="$router.push('/print')">
          去下单
        </ElButton>
      </ElEmpty>

      <ElPagination
        v-if="total > 0"
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @current-change="fetchOrders"
        @size-change="fetchOrders"
      />
    </ElCard>
  </div>
</template>

<style scoped>
.orders-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>