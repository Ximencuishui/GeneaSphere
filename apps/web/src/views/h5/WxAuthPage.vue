<template>
  <div class="h5-page h5-page--narrow">
    <div class="h5-card" style="text-align: center; padding: 32px 20px;">
      <div style="font-size: 48px;">💬</div>
      <h1 class="h5-title">微信授权</h1>
      <p class="h5-subtitle">允许「根脉云谱」获取你的微信基本信息</p>

      <div v-if="profile" style="margin: 16px 0; padding: 12px; background: #f5f7fa; border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 12px; text-align: left;">
          <img v-if="profile.avatar" :src="profile.avatar" style="width: 48px; height: 48px; border-radius: 50%;" />
          <div>
            <div style="font-weight: 500;">{{ profile.nickname }}</div>
            <div style="color: #909399; font-size: 12px;">openid: {{ profile.openid.slice(0, 12) }}…</div>
          </div>
        </div>
      </div>

      <div v-if="!hasPhone" style="margin-top: 12px;">
        <p class="h5-label" style="text-align: left;">当前微信未绑定手机号，请输入：</p>
        <input
          v-model="phoneInput"
          class="h5-input"
          type="tel"
          placeholder="请输入手机号"
          maxlength="11"
        />
      </div>

      <button class="h5-btn" :disabled="submitting" @click="onAuth">
        {{ profile ? '确认进入' : '模拟微信授权' }}
      </button>
      <p class="h5-tip">本系统当前为 Mock 环境，授权流程不会发送任何真实数据到微信</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { showToast, showDialog, closeToast } from 'vant'
import 'vant/es/toast/style'
import 'vant/es/dialog/style'
import '@/styles/h5.scss'

const route = useRoute()
const router = useRouter()

const sessionId = String(route.query.session_id || '')
const profile = ref<any>(null)
const phoneInput = ref('')
const hasPhone = ref(true)
const submitting = ref(false)

const onAuth = async () => {
  if (submitting.value) return
  try {
    submitting.value = true
    showToast({ type: 'loading', message: '授权中…', duration: 0 })
    const payload: any = { code: 'mock_code_' + Date.now() }
    if (!hasPhone.value) {
      if (!/^1\d{10}$/.test(phoneInput.value)) {
        closeToast()
        showToast('请输入有效的 11 位手机号')
        submitting.value = false
        return
      }
      payload.mock_phone = phoneInput.value
    }
    const res = (await axios.post('/api/invite/h5/wx-callback', payload, {
      params: { session_id: sessionId },
    })).data
    profile.value = res.profile
    hasPhone.value = !!res.profile?.phone
    closeToast()
    showToast('授权成功')
    setTimeout(() => {
      router.replace({ path: '/h5/info', query: { session_id: sessionId } })
    }, 600)
  } catch (e: any) {
    closeToast()
    showDialog({ title: '授权失败', message: e?.response?.data?.message || '请稍后重试' })
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  if (!sessionId) {
    showDialog({ title: '无效会话', message: '未携带 session_id' })
    router.replace('/h5/expired')
  }
})
</script>
