<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()

// Tab 控制
const activeTab = ref('balance')

// 状态
const rechargeLoading = ref(false)

// 余额信息
const balanceInfo = ref({
  balance: 0,
  total_recharged: 0,
  total_consumed: 0,
  low_balance_threshold: 20,
  is_low_balance: true,
})

// 费用统计
const costStats = ref({
  month_sent_count: 0,
  month_consumed: 0,
})

// 充值档位
const rechargeTiers = ref<any[]>([])
const selectedTier = ref<number | null>(null)
const customAmount = ref<number | null>(null)
const paymentMethod = ref<'wechat' | 'alipay'>('wechat')

// 充值记录
const rechargeRecords = ref<any[]>([])
const rechargeTotal = ref(0)
const rechargePage = ref(1)

// 扣费记录
const costLogs = ref<any[]>([])
const costLogsTotal = ref(0)
const costLogsPage = ref(1)

// 阈值设置
const thresholdDialogVisible = ref(false)
const newThreshold = ref(20)

// 获取家族ID
const clanId = computed(() => (route.query.clanId as string) || '1')

// 初始化
onMounted(async () => {
  await Promise.all([fetchBalance(), fetchRechargeTiers()])
  
  // 检查是否有 tab 参数
  if (route.query.tab === 'records') {
    activeTab.value = 'records'
    await fetchSendRecords()
  } else if (route.query.tab === 'costs') {
    activeTab.value = 'cost-logs'
    await fetchCostLogs()
  }
})

// 获取余额信息
const fetchBalance = async () => {
  try {
    const res = await axios.get('/api/admin/sms/balance', {
      params: { clanId: clanId.value }
    })
    balanceInfo.value = res.data
    newThreshold.value = res.data.low_balance_threshold
  } catch {
    // ignore
  }
}

// 获取费用统计
const fetchCostStats = async () => {
  try {
    const res = await axios.get('/api/admin/sms/balance/stats', {
      params: { clanId: clanId.value }
    })
    costStats.value = res.data
  } catch {
    // ignore
  }
}

// 获取充值档位
const fetchRechargeTiers = async () => {
  try {
    const res = await axios.get('/api/admin/sms/recharge-tiers')
    rechargeTiers.value = res.data.tiers
  } catch {
    // ignore
  }
}

// 执行充值
const handleRecharge = async () => {
  const amount = customAmount.value || selectedTier.value
  if (!amount) {
    ElMessage.warning('请选择充值金额')
    return
  }

  rechargeLoading.value = true
  try {
    const res = await axios.post('/api/admin/sms/recharge', {
      clanId: clanId.value,
      amount,
      paymentMethod: paymentMethod.value,
    })

    // 模拟支付成功，直接更新余额
    if (res.data.status === 'success') {
      ElMessage.success(`充值成功！${res.data.bonus > 0 ? `赠送 ${res.data.bonus} 元，` : ''}实际到账 ${res.data.total_amount} 元`)
      await fetchBalance()
      selectedTier.value = null
      customAmount.value = null
      
      // 刷新充值记录
      await fetchRechargeRecords()
    }
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '充值失败')
  } finally {
    rechargeLoading.value = false
  }
}

// 获取充值记录
const fetchRechargeRecords = async () => {
  try {
    const res = await axios.get('/api/admin/sms/recharge-records', {
      params: {
        clanId: clanId.value,
        page: rechargePage.value,
        pageSize: 10,
      }
    })
    rechargeRecords.value = res.data.records || []
    rechargeTotal.value = res.data.total || 0
  } catch {
    rechargeRecords.value = []
  }
}

// 获取扣费记录
const fetchCostLogs = async () => {
  try {
    const res = await axios.get('/api/admin/sms/cost-logs', {
      params: {
        clanId: clanId.value,
        page: costLogsPage.value,
        pageSize: 10,
      }
    })
    costLogs.value = res.data.logs || []
    costLogsTotal.value = res.data.total || 0
  } catch {
    costLogs.value = []
  }
}

// 获取发送记录
const sendRecords = ref<any[]>([])
const sendRecordsTotal = ref(0)
const sendRecordsPage = ref(1)

const fetchSendRecords = async () => {
  try {
    const res = await axios.get('/api/admin/sms/records', {
      params: {
        clanId: clanId.value,
        page: sendRecordsPage.value,
        pageSize: 10,
      }
    })
    sendRecords.value = res.data.records || []
    sendRecordsTotal.value = res.data.total || 0
  } catch {
    sendRecords.value = []
  }
}

// 设置阈值
const handleSetThreshold = async () => {
  try {
    await axios.put('/api/admin/sms/balance/threshold', {
      clanId: clanId.value,
      threshold: newThreshold.value,
    })
    ElMessage.success('阈值设置成功')
    thresholdDialogVisible.value = false
    await fetchBalance()
  } catch {
    ElMessage.error('设置失败')
  }
}

// Tab 切换
const handleTabChange = async (tab: string) => {
  if (tab === 'records' || tab === 'cost-logs') {
    await fetchSendRecords()
    await fetchCostLogs()
  } else if (tab === 'stats') {
    await fetchCostStats()
  }
}

// 格式化日期
const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

// 状态标签类型
const getStatusType = (status: string) => {
  const types: Record<string, string> = {
    SUCCESS: 'success',
    PENDING: 'warning',
    FAILED: 'danger',
    SENT: 'success',
    PROCESSING: 'primary',
    CANCELLED: 'info',
  }
  return types[status] || 'info'
}

const getStatusText = (status: string) => {
  const texts: Record<string, string> = {
    SUCCESS: '成功',
    PENDING: '处理中',
    FAILED: '失败',
    SENT: '已发送',
    PROCESSING: '发送中',
    CANCELLED: '已取消',
  }
  return texts[status] || status
}
</script>

<template>
  <div class="sms-balance-page">
    <ElRow :gutter="20">
      <!-- 左侧：余额卡片和充值 -->
      <ElCol :xs="24" :md="16">
        <!-- 余额信息卡片 -->
        <ElCard class="balance-card">
          <template #header>
            <div class="card-header">
              <span>短信余额</span>
              <ElButton text type="primary" @click="thresholdDialogVisible = true">
                设置预警阈值
              </ElButton>
            </div>
          </template>
          
          <div class="balance-display">
            <div class="balance-main">
              <span class="balance-label">当前余额</span>
              <span class="balance-value" :class="{ 'low-balance': balanceInfo.is_low_balance }">
                ¥{{ balanceInfo.balance.toFixed(2) }}
              </span>
            </div>
            
            <ElAlert
              v-if="balanceInfo.is_low_balance"
              type="warning"
              :closable="false"
              show-icon
              style="margin: 15px 0"
            >
              <template #title>
                余额低于预警阈值 ({{ balanceInfo.low_balance_threshold.toFixed(2) }} 元)
              </template>
            </ElAlert>
            
            <div class="balance-stats">
              <div class="stat-item">
                <span class="stat-label">累计充值</span>
                <span class="stat-value">¥{{ balanceInfo.total_recharged.toFixed(2) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">累计消费</span>
                <span class="stat-value">¥{{ balanceInfo.total_consumed.toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </ElCard>

        <!-- 充值卡片 -->
        <ElCard class="recharge-card">
          <template #header>
            <span>充值</span>
          </template>
          
          <div class="recharge-section">
            <!-- 充值档位 -->
            <div class="tier-grid">
              <div
                v-for="tier in rechargeTiers"
                :key="tier.amount"
                class="tier-item"
                :class="{ selected: selectedTier === tier.amount }"
                @click="selectedTier = tier.amount; customAmount = null"
              >
                <div class="tier-amount">¥{{ tier.amount }}</div>
                <div v-if="tier.bonus > 0" class="tier-bonus">送 ¥{{ tier.bonus }}</div>
                <div class="tier-desc">{{ tier.description }}</div>
              </div>
            </div>

            <!-- 自定义金额 -->
            <div class="custom-amount">
              <span>自定义金额：</span>
              <ElInputNumber
                v-model="customAmount"
                :min="1"
                :precision="0"
                placeholder="输入金额"
                style="width: 150px"
                @change="selectedTier = null"
              />
            </div>

            <!-- 支付方式 -->
            <div class="payment-method">
              <span>支付方式：</span>
              <ElRadioGroup v-model="paymentMethod">
                <ElRadio value="wechat">微信支付</ElRadio>
                <ElRadio value="alipay">支付宝</ElRadio>
              </ElRadioGroup>
            </div>

            <!-- 充值按钮 -->
            <div class="recharge-action">
              <ElButton
                type="primary"
                size="large"
                :loading="rechargeLoading"
                @click="handleRecharge"
              >
                立即充值 {{ (customAmount || selectedTier) ? `¥${(customAmount || selectedTier)}` : '' }}
              </ElButton>
            </div>
          </div>
        </ElCard>
      </ElCol>

      <!-- 右侧：统计和记录 -->
      <ElCol :xs="24" :md="8">
        <!-- 费用统计 -->
        <ElCard class="stats-card" @click="activeTab = 'stats'; handleTabChange('stats')">
          <template #header>
            <span>本月费用统计</span>
          </template>
          
          <div class="stats-display">
            <div class="stat-main">
              <div class="stat-row">
                <span>发送条数</span>
                <span class="stat-num">{{ costStats.month_sent_count }} 条</span>
              </div>
              <div class="stat-row">
                <span>消费金额</span>
                <span class="stat-num">¥{{ costStats.month_consumed.toFixed(2) }}</span>
              </div>
            </div>
            <div class="stat-unit">
              单价：¥0.05/条
            </div>
          </div>
        </ElCard>

        <!-- 快捷操作 -->
        <ElCard class="quick-actions-card">
          <template #header>
            <span>快捷操作</span>
          </template>
          
          <div class="quick-actions">
            <ElButton type="primary" @click="router.push({ path: '/admin/sms/send', query: { clanId: clanId } })">
              发送短信
            </ElButton>
            <ElButton @click="activeTab = 'records'; handleTabChange('records')">
              发送记录
            </ElButton>
            <ElButton @click="activeTab = 'cost-logs'; handleTabChange('cost-logs')">
              扣费记录
            </ElButton>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- 记录列表 -->
    <ElCard class="records-card" style="margin-top: 20px">
      <template #header>
        <ElTabs v-model="activeTab" @tab-change="handleTabChange">
          <ElTabPane label="发送记录" name="records" />
          <ElTabPane label="充值记录" name="recharge" />
          <ElTabPane label="扣费记录" name="cost-logs" />
        </ElTabs>
      </template>

      <!-- 发送记录 -->
      <ElTable v-if="activeTab === 'records'" :data="sendRecords" stripe>
        <ElTableColumn prop="created_at" label="发送时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </ElTableColumn>
        <ElTableColumn prop="content_summary" label="内容摘要" min-width="200" />
        <ElTableColumn prop="recipient_count" label="收件人" width="80" align="center" />
        <ElTableColumn prop="success_count" label="成功" width="60" align="center" />
        <ElTableColumn prop="fail_count" label="失败" width="60" align="center" />
        <ElTableColumn prop="cost" label="费用" width="80" align="center">
          <template #default="{ row }">¥{{ row.cost?.toFixed(2) || '0.00' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="status" label="状态" width="80" align="center">
          <template #default="{ row }">
            <ElTag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </ElTag>
          </template>
        </ElTableColumn>
      </ElTable>

      <!-- 充值记录 -->
      <ElTable v-if="activeTab === 'recharge'" :data="rechargeRecords" stripe>
        <ElTableColumn prop="created_at" label="充值时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="充值金额" width="120">
          <template #default="{ row }">
            <span>¥{{ row.amount.toFixed(2) }}</span>
            <span v-if="row.bonus > 0" class="bonus-text">+赠¥{{ row.bonus }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="total_amount" label="到账金额" width="100">
          <template #default="{ row }">¥{{ row.total_amount?.toFixed(2) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="payment_method" label="支付方式" width="100">
          <template #default="{ row }">
            {{ row.payment_method === 'wechat' ? '微信支付' : '支付宝' }}
          </template>
        </ElTableColumn>
        <ElTableColumn prop="trade_no" label="订单号" min-width="180" />
        <ElTableColumn prop="status" label="状态" width="80" align="center">
          <template #default="{ row }">
            <ElTag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </ElTag>
          </template>
        </ElTableColumn>
      </ElTable>

      <!-- 扣费记录 -->
      <ElTable v-if="activeTab === 'cost-logs'" :data="costLogs" stripe>
        <ElTableColumn prop="created_at" label="扣费时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </ElTableColumn>
        <ElTableColumn prop="content_summary" label="关联发送" min-width="200" />
        <ElTableColumn prop="success_count" label="成功条数" width="100" align="center" />
        <ElTableColumn prop="unit_price" label="单价" width="80" align="center">
          <template #default="{ row }">¥{{ row.unit_price?.toFixed(4) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="total_cost" label="扣费金额" width="100" align="center">
          <template #default="{ row }">
            <span class="cost-text">-¥{{ row.total_cost?.toFixed(2) }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="cost_status" label="状态" width="80" align="center">
          <template #default="{ row }">
            <ElTag :type="row.cost_status === 'DEDUCTED' ? 'success' : 'info'" size="small">
              {{ row.cost_status === 'DEDUCTED' ? '已扣费' : '待扣费' }}
            </ElTag>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <!-- 设置阈值对话框 -->
    <ElDialog v-model="thresholdDialogVisible" title="设置低余额预警阈值" width="400px">
      <ElForm label-width="120px">
        <ElFormItem label="预警阈值">
          <ElInputNumber
            v-model="newThreshold"
            :min="0"
            :precision="2"
            :step="10"
            style="width: 200px"
          />
          <span style="margin-left: 10px">元</span>
        </ElFormItem>
        <div class="threshold-hint">
          当余额低于此阈值时，系统将发送站内信提醒您
        </div>
      </ElForm>
      <template #footer>
        <ElButton @click="thresholdDialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="handleSetThreshold">确定</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.sms-balance-page {
  max-width: 1200px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.balance-display {
  padding: 10px 0;
}

.balance-main {
  text-align: center;
  padding: 20px 0;
}

.balance-label {
  display: block;
  font-size: 14px;
  color: #909399;
  margin-bottom: 10px;
}

.balance-value {
  font-size: 48px;
  font-weight: 700;
  color: #67C23A;
}

.balance-value.low-balance {
  color: #E6A23C;
}

.balance-stats {
  display: flex;
  justify-content: center;
  gap: 60px;
  padding: 20px 0;
  border-top: 1px solid #EBEEF5;
  margin-top: 20px;
}

.stat-item {
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-bottom: 5px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.recharge-section {
  padding: 10px 0;
}

.tier-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
  margin-bottom: 20px;
}

.tier-item {
  border: 2px solid #E4E7ED;
  border-radius: 8px;
  padding: 15px 10px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
}

.tier-item:hover {
  border-color: #409EFF;
}

.tier-item.selected {
  border-color: #409EFF;
  background-color: #ECF5FF;
}

.tier-amount {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
}

.tier-bonus {
  font-size: 12px;
  color: #67C23A;
  margin-top: 5px;
}

.tier-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}

.custom-amount {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.payment-method {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.recharge-action {
  text-align: center;
  padding-top: 10px;
}

.stats-display {
  padding: 10px 0;
}

.stat-main {
  margin-bottom: 15px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #F5F7FA;
}

.stat-num {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.stat-unit {
  text-align: center;
  font-size: 12px;
  color: #909399;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quick-actions :deep(.el-button) {
  width: 100%;
}

.bonus-text {
  color: #67C23A;
  font-size: 12px;
  margin-left: 5px;
}

.cost-text {
  color: #F56C6C;
  font-weight: 600;
}

.threshold-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 10px;
}

@media (max-width: 768px) {
  .tier-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
