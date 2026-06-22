<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { usePlatformAuthStore } from '@/stores/platformAuth'

const authStore = usePlatformAuthStore()

const form = reactive({
  username: 'platform_admin',
  password: 'admin123',
})

const submitting = ref(false)
const errorMessage = ref('')

const handleLogin = async () => {
  if (!form.username || !form.password) {
    errorMessage.value = '请输入用户名与密码'
    return
  }
  submitting.value = true
  errorMessage.value = ''
  try {
    await authStore.login(form.username.trim(), form.password)
    ElMessage.success('登录成功')
  } catch (err: any) {
    errorMessage.value =
      err?.response?.data?.message || err?.message || '登录失败，请检查账号密码'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="platform-login">
    <div class="login-bg">
      <div class="bg-orb orb-1"></div>
      <div class="bg-orb orb-2"></div>
      <div class="bg-orb orb-3"></div>
    </div>
    <ElCard class="login-card" shadow="always">
      <div class="brand">
        <div class="logo">寻</div>
        <h1>寻根路 · 平台管理后台</h1>
        <p class="subtitle">xungenlu.cn Platform Administration Console</p>
      </div>
      <ElForm @submit.prevent="handleLogin" label-position="top">
        <ElFormItem label="用户名">
          <ElInput
            v-model="form.username"
            placeholder="请输入平台管理员账号"
            size="large"
            :prefix-icon="'User'"
            clearable
          />
        </ElFormItem>
        <ElFormItem label="密码">
          <ElInput
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            :prefix-icon="'Lock'"
            show-password
          />
        </ElFormItem>
        <ElAlert
          v-if="errorMessage"
          type="error"
          :closable="false"
          :title="errorMessage"
          style="margin-bottom: 16px"
        />
        <ElButton
          type="primary"
          size="large"
          :loading="submitting"
          style="width: 100%"
          @click="handleLogin"
        >
          登 录
        </ElButton>
        <div class="hint">
          <p>默认超级管理员：<strong>platform_admin / admin123</strong></p>
          <p class="muted">本系统仅供平台运营方使用，与家族管理员后台账号隔离。</p>
        </div>
      </ElForm>
    </ElCard>
  </div>
</template>

<style scoped>
.platform-login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: linear-gradient(135deg, #0f1c3f 0%, #1f3a5f 60%, #2d4f7a 100%);
  overflow: hidden;
}

.login-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.5;
}

.orb-1 {
  width: 400px;
  height: 400px;
  background: #4a90e2;
  top: -100px;
  left: -100px;
}

.orb-2 {
  width: 300px;
  height: 300px;
  background: #b07aff;
  bottom: -50px;
  right: -50px;
}

.orb-3 {
  width: 250px;
  height: 250px;
  background: #50c9c3;
  top: 50%;
  left: 60%;
}

.login-card {
  position: relative;
  width: 420px;
  padding: 16px 12px;
  border-radius: 16px;
  border: none;
  backdrop-filter: blur(10px);
  background-color: rgba(255, 255, 255, 0.96);
}

.brand {
  text-align: center;
  margin-bottom: 24px;
}

.logo {
  width: 64px;
  height: 64px;
  margin: 0 auto 12px;
  background: linear-gradient(135deg, #2c5fa3 0%, #5e8fd1 100%);
  color: white;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 2px;
  box-shadow: 0 8px 24px rgba(44, 95, 163, 0.4);
}

.brand h1 {
  margin: 0;
  font-size: 22px;
  color: #1f3a5f;
  font-weight: 600;
}

.subtitle {
  margin: 4px 0 0;
  color: #8c98a8;
  font-size: 12px;
  letter-spacing: 0.5px;
}

.hint {
  margin-top: 18px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
  font-size: 12px;
  color: #5a6678;
  text-align: center;
}

.hint strong {
  color: #1f3a5f;
}

.hint .muted {
  color: #909399;
  margin-top: 4px;
}
</style>
