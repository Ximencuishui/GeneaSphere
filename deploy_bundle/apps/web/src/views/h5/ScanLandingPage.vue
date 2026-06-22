<template>
  <div class="h5-page h5-page--narrow">
    <div class="h5-card" style="text-align: center;">
      <div style="font-size: 40px; margin: 24px 0 12px;">⏳</div>
      <h1 class="h5-title">正在解析二维码…</h1>
      <p class="h5-subtitle">请稍候，正在为你建立验证会话</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { showToast, showDialog, closeToast } from 'vant'
import 'vant/es/toast/style'
import 'vant/es/dialog/style'
import '@/styles/h5.scss'

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  const code = String(route.query.code || '')
  if (!code) {
    showDialog({ title: '无效二维码', message: '未携带 code 参数' })
    router.replace('/h5/expired')
    return
  }
  try {
    showToast({ type: 'loading', message: '正在加载…', duration: 0 })
    const res = (await axios.get('/api/invite/h5/resolve', { params: { code } })).data
    closeToast()
    sessionStorage.setItem('h5_invite_session', JSON.stringify(res))
    router.replace({
      path: '/h5/wx-auth',
      query: { session_id: res.session_id },
    })
  } catch (e: any) {
    closeToast()
    showDialog({
      title: '二维码无效',
      message: e?.response?.data?.message || '请重新扫码或联系管理员',
    })
    router.replace('/h5/expired')
  }
})
</script>
