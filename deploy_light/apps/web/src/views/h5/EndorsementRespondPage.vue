<template>
  <div class="h5-page">
    <div class="h5-card">
      <h1 class="h5-title">背书请求</h1>
      <p class="h5-subtitle">{{ scannerNickname }} 正在请你为他/她背书为 {{ clanName }} 成员</p>

      <div v-if="status === 'responded'">
        <div class="h5-card" :style="result === 'CONFIRMED' ? 'background:#f0f9eb;color:#67c23a;' : 'background:#fef0f0;color:#f56c6c;'">
          你已 {{ result === 'CONFIRMED' ? '确认' : '拒绝' }} 该背书请求
        </div>
      </div>
      <template v-else-if="status === 'pending'">
        <div style="margin: 16px 0;">
          <label class="h5-label">拒绝时填写原因（可选）</label>
          <textarea v-model="rejectReason" class="h5-textarea" placeholder="例如：我不认识这个人" />
        </div>
        <button class="h5-btn" :disabled="submitting" @click="onConfirm">确认是本家族成员</button>
        <button class="h5-btn h5-btn--danger" :disabled="submitting" @click="onReject">拒绝</button>
      </template>
      <div v-else class="h5-empty">{{ statusText || '该请求不存在或已处理' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { showToast } from 'vant'
import 'vant/es/toast/style'
import '@/styles/h5.scss'

const route = useRoute()

const endorsementId = String(route.query.id || '')
const scannerNickname = ref('某位族人')
const clanName = ref('本家族')
const status = ref<'pending' | 'responded' | 'invalid'>('pending')
const result = ref<'CONFIRMED' | 'REJECTED' | null>(null)
const statusText = ref('')
const rejectReason = ref('')
const submitting = ref(false)

const onConfirm = async () => respond('CONFIRMED')
const onReject = async () => {
  if (!rejectReason.value) {
    showToast('请填写拒绝原因')
    return
  }
  await respond('REJECTED')
}

const respond = async (r: 'CONFIRMED' | 'REJECTED') => {
  try {
    submitting.value = true
    await axios.post(`/api/invite/h5/endorsement/${endorsementId}/respond`, {
      result: r,
      reject_reason: r === 'REJECTED' ? rejectReason.value : undefined,
    })
    result.value = r
    status.value = 'responded'
    showToast(r === 'CONFIRMED' ? '已确认' : '已拒绝')
  } catch (e: any) {
    showToast(e?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  if (!endorsementId) {
    status.value = 'invalid'
    statusText.value = '未携带背书请求 id'
  }
})
</script>
