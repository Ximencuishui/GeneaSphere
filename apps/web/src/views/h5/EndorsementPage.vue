<template>
  <div class="h5-page">
    <CountdownBar v-if="expireAt" :expire-at="expireAt" :on-expire="onExpire" title="背书有效期" />

    <div class="h5-card">
      <h1 class="h5-title">熟人背书</h1>
      <p class="h5-subtitle">请输入一位已认证族人的手机号或姓名，请求他/她为你背书</p>

      <label class="h5-label">已认证族人手机号 / 姓名</label>
      <input v-model="endorserKey" class="h5-input" placeholder="138xxxxxxxx 或 姓名" />

      <button class="h5-btn" :disabled="!endorserKey || submitting" @click="onSubmit">发送背书请求</button>

      <div v-if="result" class="h5-card" style="background: #f0f9eb; margin-top: 16px;">
        <div style="font-size: 16px; color: #67c23a; margin-bottom: 8px;">背书请求已发送</div>
        <div style="color: #606266; font-size: 14px;">
          已通知 <strong>{{ result.endorser?.nickname || '对方' }}</strong>（{{ result.endorser?.phone }}），
          请在 30 分钟内等待他/她确认。
        </div>
        <div class="h5-divider" />
        <div class="h5-tip">对方确认后，你将自动成为本家族成员。如对方超时未响应，可重新发起。</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { showToast, showDialog } from 'vant'
import 'vant/es/toast/style'
import 'vant/es/dialog/style'
import CountdownBar from '@/components/CountdownBar.vue'
import '@/styles/h5.scss'

const route = useRoute()
const router = useRouter()
const sessionId = String(route.query.session_id || '')

const expireAt = ref<string | null>(null)
const endorserKey = ref('')
const submitting = ref(false)
const result = ref<any>(null)

const onExpire = () => {
  showDialog({ title: '已超时', message: '请重新扫码开始验证' })
  router.replace('/h5/expired')
}

const onSubmit = async () => {
  if (!endorserKey.value) return
  try {
    submitting.value = true
    const res = (await axios.post(`/api/invite/h5/endorsement/${sessionId}/request`, {
      endorser_key: endorserKey.value,
    })).data
    result.value = res
    showToast('请求已发送')
  } catch (e: any) {
    showToast(e?.response?.data?.message || '发送失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  if (!sessionId) {
    router.replace('/h5/expired')
    return
  }
  const cache = sessionStorage.getItem('h5_invite_session')
  if (cache) {
    expireAt.value = JSON.parse(cache).expire_at
  }
})
</script>
