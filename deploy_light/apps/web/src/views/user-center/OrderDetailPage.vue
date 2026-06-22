<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import userApi from '@/api/user'
import type { UserOrderDetail } from '@/types'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const order = ref<UserOrderDetail | null>(null)

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
    case 'CANCELLED':
      return 'danger'
    default:
      return 'info'
  }
}

async function fetchOrder() {
  loading.value = true
  try {
    const id = route.params.id as string
    const data = (await userApi.orders.getById(id)) as unknown as UserOrderDetail
    order.value = data
  } finally {
    loading.value = false
  }
}

const shippingAddress = computed(() => {
  if (!order.value?.shipping_address) return null
  if (typeof order.value.shipping_address === 'string') {
    try {
      return JSON.parse(order.value.shipping_address)
    } catch {
      return null
    }
  }
  return order.value.shipping_address
})

function viewLogistics() {
  if (!order.value?.tracking_no) return
  window.open(
    `https://www.kuaidi100.com/chaxun?nu=${order.value.tracking_no}`,
    '_blank',
  )
}

onMounted(fetchOrder)
</script>

<template>
  <div class="order-detail-page">
    <ElCard v-loading="loading">
      <template #header>
        <div class="header">
          <ElButton text @click="router.back()">
            <ElIcon><ArrowLeft /></ElIcon>
            返回
          </ElButton>
          <h2 class="page-title">订单详情</h2>
        </div>
      </template>

      <template v-if="order">
        <!-- 概览 -->
        <div class="overview">
          <ElTag :type="statusTagType(order.status) as any" size="large">
            {{ statusLabels[order.status] || order.status }}
          </ElTag>
          <span class="order-id">订单号：{{ order.id }}</span>
        </div>

        <ElDescriptions
          :column="2"
          border
          style="margin-top: 20px"
          title="订单信息"
        >
          <ElDescriptionsItem label="印刷规格">
            {{ order.specification }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="数量">
            {{ order.quantity }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="金额">
            ¥{{ Number(order.amount).toFixed(2) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="退款状态">
            {{ order.refund_status === 'NONE' ? '无退款' : order.refund_status }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="下单时间">
            {{ new Date(order.created_at).toLocaleString() }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="更新时间">
            {{ new Date(order.updated_at).toLocaleString() }}
          </ElDescriptionsItem>
        </ElDescriptions>

        <!-- 物流 -->
        <ElDescriptions
          :column="2"
          border
          style="margin-top: 20px"
          title="物流信息"
        >
          <ElDescriptionsItem label="物流公司">
            {{ order.tracking_company || '尚未发货' }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="物流单号">
            <div class="tracking-row">
              <span>{{ order.tracking_no || '—' }}</span>
              <ElButton
                v-if="order.tracking_no"
                size="small"
                type="primary"
                plain
                @click="viewLogistics"
              >
                查看物流
              </ElButton>
            </div>
          </ElDescriptionsItem>
          <ElDescriptionsItem
            v-if="shippingAddress"
            label="收货地址"
            :span="2"
          >
            <div v-if="typeof shippingAddress === 'object'">
              <div>{{ shippingAddress.name }} {{ shippingAddress.phone }}</div>
              <div>
                {{ shippingAddress.region || '' }}
                {{ shippingAddress.detail || shippingAddress.address || '' }}
              </div>
            </div>
            <div v-else>{{ shippingAddress }}</div>
          </ElDescriptionsItem>
        </ElDescriptions>

        <!-- 退款 -->
        <ElDescriptions
          v-if="order.refund_status && order.refund_status !== 'NONE'"
          :column="2"
          border
          style="margin-top: 20px"
          title="退款信息"
        >
          <ElDescriptionsItem label="退款金额">
            ¥{{ Number(order.refund_amount || 0).toFixed(2) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="退款时间">
            {{ order.refunded_at ? new Date(order.refunded_at).toLocaleString() : '—' }}
          </ElDescriptionsItem>
          <ElDescriptionsItem
            v-if="order.refund_reason"
            label="退款原因"
            :span="2"
          >
            {{ order.refund_reason }}
          </ElDescriptionsItem>
        </ElDescriptions>
      </template>

      <ElEmpty v-else-if="!loading" description="订单不存在" />
    </ElCard>
  </div>
</template>

<style scoped>
.order-detail-page {
  max-width: 960px;
  margin: 0 auto;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.overview {
  display: flex;
  align-items: center;
  gap: 16px;
}

.order-id {
  font-size: 13px;
  color: #909399;
}

.tracking-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>