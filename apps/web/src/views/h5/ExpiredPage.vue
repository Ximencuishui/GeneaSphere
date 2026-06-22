<template>
  <div class="h5-page h5-page--narrow">
    <div class="h5-card" style="text-align: center; padding: 48px 24px;">
      <div style="font-size: 64px;">⌛</div>
      <h1 class="h5-title">验证已超时</h1>
      <p class="h5-subtitle">二维码或验证会话已超过 30 分钟有效期</p>
      <div class="h5-divider" />
      <p class="h5-tip">请联系家族管理员获取新的二维码，或重新发起验证。</p>
      <button class="h5-btn" @click="onBack">返回首页</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import '@/styles/h5.scss'

const router = useRouter()

const onBack = () => {
  sessionStorage.removeItem('h5_invite_session')
  router.replace('/')
}
</script>



