<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()

// 状态
const sending = ref(false)
const balance = ref(0)
const smsUnitPrice = 0.05

// 收件人选择
const recipientType = ref<'all' | 'role' | 'custom'>('all')
const selectedRole = ref('MEMBER')
const customPhones = ref('')
const memberList = ref<any[]>([])
const selectedMembers = ref<string[]>([])

// 短信内容
const smsContent = ref('')
const signName = ref('【根脉云谱】')
const signOptions = [
  '【根脉云谱】',
  '【张氏宗亲会】',
  '【李氏家族】',
  '【王氏宗祠】',
]

// 发送方式
const sendType = ref<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE')
const scheduledDate = ref('')
const scheduledTime = ref('')

// 获取家族ID
const clanId = computed(() => (route.query.clanId as string) || '1')

// 预估费用
const recipientCount = computed(() => {
  if (recipientType.value === 'all') {
    return memberList.value.length
  } else if (recipientType.value === 'role') {
    return memberList.value.filter(m => m.role === selectedRole.value || 
      (selectedRole.value === 'MEMBER' && ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'].includes(m.role))).length
  } else {
    const phones = customPhones.value.split(/[,，\n]/).filter(p => p.trim())
    return phones.length
  }
})

const estimatedCost = computed(() => {
  return recipientCount.value * smsUnitPrice
})

// 余额警告
const showLowBalanceWarning = computed(() => balance.value < 10 && balance.value > 0)
const showNoBalance = computed(() => balance.value <= 0)

// 校验余额
const canSend = computed(() => {
  return balance.value >= estimatedCost.value && smsContent.value.trim().length > 0 && recipientCount.value > 0
})

// 获取余额
const fetchBalance = async () => {
  try {
    const res = await axios.get('/api/admin/sms/balance', {
      params: { clanId: clanId.value }
    })
    balance.value = res.data.balance
  } catch {
    balance.value = 0
  }
}

// 获取成员列表（用于收件人选择）
const fetchMembers = async () => {
  try {
    const res = await axios.get('/api/admin/members', {
      params: { clanId: clanId.value, pageSize: 1000 }
    })
    memberList.value = res.data.members || []
  } catch {
    memberList.value = []
  }
}

// 初始化
onMounted(async () => {
  await Promise.all([fetchBalance(), fetchMembers()])
})

// 提交发送
const handleSend = async () => {
  if (!canSend.value) {
    if (balance.value < estimatedCost.value) {
      try {
        await ElMessageBox.confirm(
          `余额不足！当前余额 ${balance.value.toFixed(2)} 元，预估费用 ${estimatedCost.value.toFixed(2)} 元`,
          '余额不足',
          { confirmButtonText: '立即充值', cancelButtonText: '取消', type: 'warning' }
        )
        router.push({ path: '/admin/sms/balance', query: { clanId: clanId.value } })
      } catch {
        // 用户取消
      }
      return
    }
    ElMessage.warning('请填写短信内容并选择收件人')
    return
  }

  // 确认发送
  try {
    await ElMessageBox.confirm(
      `确认发送短信？\n收件人数量：${recipientCount.value}\n预估费用：¥${estimatedCost.value.toFixed(2)}`,
      '确认发送',
      { confirmButtonText: '确认发送', cancelButtonText: '取消', type: 'info' }
    )
  } catch {
    return
  }

  sending.value = true
  try {
    // 构建收件人ID列表
    let recipientIds: string[] = []
    if (recipientType.value === 'all') {
      recipientIds = memberList.value.map(m => m.user_id)
    } else if (recipientType.value === 'role') {
      recipientIds = memberList.value.map(m => m.user_id)
    } else {
      // 自定义手机号
      recipientIds = customPhones.value.split(/[,，\n]/).map(p => p.trim()).filter(p => p)
    }

    await axios.post('/api/admin/sms/send', {
      clanId: clanId.value,
      content: signName.value + smsContent.value,
      recipientIds,
      signName: signName.value,
      sendType: sendType.value,
      scheduledAt: sendType.value === 'SCHEDULED' && scheduledDate.value && scheduledTime.value
        ? `${scheduledDate.value} ${scheduledTime.value}:00`
        : undefined,
    })

    ElMessage.success(sendType.value === 'SCHEDULED' ? '定时发送设置成功' : '短信发送成功')
    
    // 刷新余额
    await fetchBalance()
    
    // 清空表单
    smsContent.value = ''
    customPhones.value = ''
    selectedMembers.value = []
    
  } catch (error: any) {
    if (error.response?.data?.code === 'INSUFFICIENT_BALANCE') {
      try {
        await ElMessageBox.confirm(
          `余额不足！${error.response.data.message}`,
          '余额不足',
          { confirmButtonText: '立即充值', cancelButtonText: '取消', type: 'warning' }
        )
        router.push({ path: '/admin/sms/balance', query: { clanId: clanId.value } })
      } catch {
        // 用户取消
      }
    } else {
      ElMessage.error(error.response?.data?.message || '发送失败')
    }
  } finally {
    sending.value = false
  }
}

// 前往充值
const goToRecharge = () => {
  router.push({ path: '/admin/sms/balance', query: { clanId: clanId.value } })
}
</script>

<template>
  <div class="sms-send-page">
    <ElCard>
      <template #header>
        <div class="card-header">
          <span class="title">发送短信通知</span>
          <div class="balance-info">
            <span class="balance-label">余额：</span>
            <span class="balance-value" :class="{ 'low-balance': showLowBalanceWarning, 'no-balance': showNoBalance }">
              ¥{{ balance.toFixed(2) }}
            </span>
            <ElButton type="primary" size="small" @click="goToRecharge">充值</ElButton>
          </div>
        </div>
      </template>

      <!-- 余额警告 -->
      <ElAlert
        v-if="showLowBalanceWarning"
        type="warning"
        title="余额偏低"
        :description="`当前余额 ${balance.toFixed(2)} 元，建议及时充值以确保短信发送`"
        show-icon
        :closable="false"
        style="margin-bottom: 20px"
      />
      <ElAlert
        v-if="showNoBalance"
        type="error"
        title="余额不足"
        description="当前余额为 0 元，无法发送短信，请先充值"
        show-icon
        :closable="false"
        style="margin-bottom: 20px"
      />

      <ElForm label-width="100px" class="sms-form">
        <!-- 收件人选择 -->
        <ElFormItem label="收件人">
          <div class="recipient-section">
            <ElRadioGroup v-model="recipientType" class="recipient-type-group">
              <ElRadio value="all">全部成员</ElRadio>
              <ElRadio value="role">按角色筛选</ElRadio>
              <ElRadio value="custom">自定义号码</ElRadio>
            </ElRadioGroup>

            <!-- 角色筛选 -->
            <div v-if="recipientType === 'role'" class="role-filter">
              <ElSelect v-model="selectedRole" placeholder="选择角色" style="width: 200px">
                <ElOption label="全部成员" value="MEMBER" />
                <ElOption label="仅管理员" value="ADMIN" />
                <ElOption label="仅编辑者" value="EDITOR" />
              </ElSelect>
            </div>

            <!-- 自定义号码 -->
            <div v-if="recipientType === 'custom'" class="custom-phones">
              <ElInput
                v-model="customPhones"
                type="textarea"
                :rows="4"
                placeholder="请输入手机号，多个号码用逗号或换行分隔"
              />
              <div class="phone-hint">示例：13800138000, 13900139000</div>
            </div>

            <!-- 已选成员 -->
            <div v-if="recipientType !== 'custom'" class="member-summary">
              <ElTag type="info">
                共 {{ recipientType === 'all' ? memberList.length : memberList.filter(m => m.role === selectedRole || selectedRole === 'MEMBER').length }} 位成员
              </ElTag>
            </div>
          </div>
        </ElFormItem>

        <!-- 短信内容 -->
        <ElFormItem label="短信内容">
          <div class="content-section">
            <ElInput
              v-model="smsContent"
              type="textarea"
              :rows="5"
              :maxlength="500"
              show-word-limit
              placeholder="请输入短信内容"
            />
            <div class="content-info">
              <span>{{ smsContent.length }}/500 字</span>
            </div>
          </div>
        </ElFormItem>

        <!-- 签名 -->
        <ElFormItem label="短信签名">
          <ElSelect v-model="signName" placeholder="选择签名" style="width: 200px">
            <ElOption v-for="sign in signOptions" :key="sign" :label="sign" :value="sign" />
          </ElSelect>
        </ElFormItem>

        <!-- 发送方式 -->
        <ElFormItem label="发送方式">
          <div class="send-type-section">
            <ElRadioGroup v-model="sendType">
              <ElRadio value="IMMEDIATE">立即发送</ElRadio>
              <ElRadio value="SCHEDULED">定时发送</ElRadio>
            </ElRadioGroup>

            <!-- 定时选择 -->
            <div v-if="sendType === 'SCHEDULED'" class="schedule-picker">
              <ElDatePicker
                v-model="scheduledDate"
                type="date"
                placeholder="选择日期"
                :disabled-date="(date: Date) => date < new Date()"
                style="margin-right: 10px"
              />
              <ElTimePicker
                v-model="scheduledTime"
                placeholder="选择时间"
                format="HH:mm"
                value-format="HH:mm"
                style="width: 120px"
              />
            </div>
          </div>
        </ElFormItem>

        <!-- 费用预估 -->
        <ElFormItem label="预估费用">
          <div class="cost-estimate">
            <span class="cost-formula">
              {{ recipientCount }} 人 × {{ smsUnitPrice }} 元/条 = 
            </span>
            <span class="cost-value" :class="{ 'cost-warning': balance < estimatedCost }">
              ¥{{ estimatedCost.toFixed(2) }}
            </span>
            <ElTag v-if="balance < estimatedCost" type="danger" size="small" style="margin-left: 10px">
              余额不足
            </ElTag>
          </div>
        </ElFormItem>

        <!-- 提交按钮 -->
        <ElFormItem>
          <div class="form-actions">
            <ElButton @click="router.back()">取消</ElButton>
            <ElButton
              type="primary"
              :loading="sending"
              :disabled="!canSend && !showNoBalance"
              @click="handleSend"
            >
              {{ sendType === 'SCHEDULED' ? '设置定时发送' : '发送短信' }}
            </ElButton>
          </div>
        </ElFormItem>
      </ElForm>
    </ElCard>
  </div>
</template>

<style scoped>
.sms-send-page {
  max-width: 900px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-size: 18px;
  font-weight: 600;
}

.balance-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.balance-label {
  color: #909399;
}

.balance-value {
  font-size: 18px;
  font-weight: 600;
  color: #67C23A;
}

.balance-value.low-balance {
  color: #E6A23C;
}

.balance-value.no-balance {
  color: #F56C6C;
}

.sms-form {
  max-width: 600px;
}

.recipient-section {
  width: 100%;
}

.recipient-type-group {
  margin-bottom: 15px;
}

.role-filter {
  margin-top: 10px;
}

.custom-phones {
  margin-top: 10px;
}

.phone-hint {
  margin-top: 5px;
  font-size: 12px;
  color: #909399;
}

.member-summary {
  margin-top: 10px;
}

.content-section {
  width: 100%;
}

.content-info {
  margin-top: 5px;
  text-align: right;
  font-size: 12px;
  color: #909399;
}

.send-type-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.schedule-picker {
  margin-top: 10px;
  display: flex;
}

.cost-estimate {
  display: flex;
  align-items: center;
}

.cost-formula {
  color: #909399;
}

.cost-value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.cost-value.cost-warning {
  color: #F56C6C;
}

.form-actions {
  display: flex;
  gap: 10px;
}
</style>
