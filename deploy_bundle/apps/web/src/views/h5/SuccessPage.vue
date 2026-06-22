<template>
  <div class="h5-page h5-page--narrow">
    <div class="h5-card" style="text-align: center; padding: 48px 24px;">
      <div style="font-size: 64px;">🎉</div>
      <h1 class="h5-title">验证通过</h1>
      <p class="h5-subtitle">你已成功通过身份验证<br />正式成为 {{ clanName }} 成员</p>

      <div class="h5-divider" />

      <p class="h5-tip">后续可在「我的家族」中查看自己的位置与族谱信息。</p>
      <button class="h5-btn" @click="onEnter">进入家族</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import '@/styles/h5.scss'

const route = useRoute()
const router = useRouter()
const clanName = String(route.query.clan_name || '本家族')

const onEnter = () => {
  sessionStorage.removeItem('h5_invite_session')
  router.replace('/clans')
}
</script>



