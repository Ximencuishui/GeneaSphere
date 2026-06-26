<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()

const statusLabels: Record<string, string> = {
  PENDING: '待支付',
  PRINTING: '印刷中',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

const clanSlug = ref('')
const loading = ref(false)
const orders = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const activeTab = ref('')

const fetchOrders = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/orders', {
      params: {
        clanSlug: clanId.value,
        page: currentPage.value,
        pageSize: pageSize.value,
        status: activeTab.value || undefined,
      },
    })
    orders.value = res.data.data
    total.value = res.data.pagination.total
  } catch (error) {
    console.error('Failed to fetch orders:', error)
  } finally {
    loading.value = false
  }
}

const getLogistics = async (order: any) => {
  if (!order.tracking_no) {
    return
  }
  // 对接快递100 API
  window.open(`https://www.kuaidi100.com/chaxun?nu=${order.tracking_no}`, '_blank')
}

const handleReorder = async (order: any) => {
  try {
    await ElMessageBox.confirm(
      `基于订单 #${order.id} 生成新订单？规格、数量、收货地址将被复制。`,
      '再次购买',
      { type: 'info', confirmButtonText: '确认', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  loading.value = true
  try {
    const res = await axios.post(`/api/admin/orders/${order.id}/reorder`)
    ElMessage.success(res.data.message || '新订单已生成')
    await fetchOrders()
    // 后端返回 redirect_url，前端优先使用；无则跳印刷页
    const url = res.data.redirect_url || `/print?reorder=${res.data.new_order_id}`
    router.push(url)
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '再次购买失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  clanId.value = route.params.slug as string || '1'
  fetchOrders()
})
</script>

<template>
  <div class="orders-page">
    <ElCard>
      <template #header>
        <h2>印刷订单管理</h2>
      </template>

      <ElTabs v-model="activeTab" @tab-change="fetchOrders">
        <ElTabPane label="全部" name="" />
        <ElTabPane label="待支付" name="PENDING" />
        <ElTabPane label="印刷中" name="PRINTING" />
        <ElTabPane label="已发货" name="SHIPPED" />
        <ElTabPane label="已完成" name="COMPLETED" />
      </ElTabs>

      <ElTable :data="orders" v-loading="loading">
        <ElTableColumn prop="id" label="订单编号" width="120" />
        <ElTableColumn prop="specification" label="印刷规格" min-width="150" />
        <ElTableColumn prop="quantity" label="数量" width="80" />
        <ElTableColumn prop="amount" label="金额" width="120">
          <template #default="{ row }">
            ¥{{ row.amount?.toFixed(2) }}
          </template>
        </ElTableColumn>
        <ElTableColumn prop="status" label="状态" width="120">
          <template #default="{ row }">
            <ElTag
              :type="row.status === 'COMPLETED' ? 'success' : row.status === 'SHIPPED' ? 'primary' : 'warning'"
            >
              {{ statusLabels[row.status] || row.status }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="tracking_no" label="物流单号" width="150" />
        <ElTableColumn prop="created_at" label="下单时间" width="180">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleDateString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <ElButton
              type="primary"
              size="small"
              @click="getLogistics(row)"
              :disabled="!row.tracking_no"
            >
              查看物流
            </ElButton>
            <ElButton
              type="success"
              size="small"
              @click="router.push('/print?reorder=' + row.id)"
            >
              再次购买
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElEmpty v-if="!loading && orders.length === 0" description="暂无订单数据" />

      <ElPagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchOrders"
        @current-change="fetchOrders"
      />
    </ElCard>
  </div>
</template>

<style scoped>
.orders-page {
  max-width: 1400px;
  margin: 0 auto;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
