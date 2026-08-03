<template>
  <div class="not-found-page">
    <div class="not-found-card">
      <p class="not-found-code">404</p>
      <h1>页面不存在</h1>
      <p class="not-found-message">你访问的用户中心页面不存在或已被移除。</p>
      <el-button type="primary" @click="goProfile">返回个人资料</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function goProfile() {
  router.replace('/user-center/profile')
}
</script>

<style scoped>
.not-found-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}

.not-found-card {
  width: min(100%, 520px);
  padding: 48px 32px;
  border-radius: 16px;
  background: var(--el-bg-color);
  text-align: center;
}

.not-found-code {
  margin: 0;
  color: var(--el-color-primary);
  font-size: 72px;
  font-weight: 700;
  line-height: 1;
}

h1 {
  margin: 20px 0 8px;
  color: var(--el-text-color-primary);
  font-size: 24px;
}

.not-found-message {
  margin: 0 0 24px;
  color: var(--el-text-color-secondary);
}
</style>
