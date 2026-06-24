<script setup lang="ts">
import { ref, computed } from "vue"
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage } from "element-plus"
import { useRouter } from "vue-router"
import { useAuthStore } from "@/stores/auth"

const router = useRouter()
const authStore = useAuthStore()
const phone = ref("")
const smsCode = ref("")
const password = ref("")
const confirmPassword = ref("")
const smsSending = ref(false)
const smsCountdown = ref(0)

let countdownTimer: ReturnType<typeof setInterval> | null = null

const isPhoneValid = computed(() => /^1[3-9]\d{9}$/.test(phone.value))

const handleSendSms = async () => {
  if (!isPhoneValid.value) {
    ElMessage.error("请输入正确的手机号")
    return
  }
  smsSending.value = true
  try {
    await authStore.sendSmsCode(phone.value, 'REGISTER')
    ElMessage.success("验证码已发送")
    smsCountdown.value = 60
    countdownTimer = setInterval(() => {
      smsCountdown.value--
      if (smsCountdown.value <= 0) {
        if (countdownTimer) clearInterval(countdownTimer)
      }
    }, 1000)
  } catch (error: any) {
    const msg = error.response?.data?.message || "发送失败"
    ElMessage.error(msg)
  } finally {
    smsSending.value = false
  }
}

const handleRegister = async () => {
  if (!smsCode.value) {
    ElMessage.error("请输入短信验证码")
    return
  }
  if (password.value !== confirmPassword.value) {
    ElMessage.error("两次密码不一致")
    return
  }
  try {
    await authStore.register(phone.value, password.value, smsCode.value)
    ElMessage.success("注册成功")
  } catch (error: any) {
    const msg = error.response?.data?.message || "注册失败"
    ElMessage.error(msg)
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-form">
      <div class="form-header">
        <h2>注册寻根路</h2>
        <p class="form-subtitle">开启您的家族数字化之旅</p>
      </div>
      <ElForm :model="{ phone, smsCode, password, confirmPassword }" label-width="0">
        <ElFormItem>
          <ElInput v-model="phone" placeholder="手机号" size="large" />
        </ElFormItem>
        <ElFormItem>
          <div class="sms-code-row">
            <ElInput v-model="smsCode" placeholder="短信验证码" size="large" class="sms-input" maxlength="6" />
            <ElButton
              size="large"
              class="sms-btn"
              :loading="smsSending"
              :disabled="smsCountdown > 0 || !isPhoneValid"
              @click="handleSendSms"
            >
              {{ smsCountdown > 0 ? `${smsCountdown}s` : '获取验证码' }}
            </ElButton>
          </div>
        </ElFormItem>
        <ElFormItem>
          <ElInput v-model="password" type="password" placeholder="设置密码（至少6位）" size="large" show-password />
        </ElFormItem>
        <ElFormItem>
          <ElInput v-model="confirmPassword" type="password" placeholder="确认密码" size="large" show-password />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" size="large" :loading="authStore.loading" @click="handleRegister" style="width: 100%;">
            注册
          </ElButton>
        </ElFormItem>
        <ElFormItem>
          <ElButton text @click="router.push('/login')" style="width: 100%; color: #5D4037;">
            已有账号？立即登录
          </ElButton>
        </ElFormItem>
        <ElFormItem>
          <ElButton text @click="router.push('/')" style="width: 100%; color: #94a3b8; font-size: 13px;">
            ← 返回首页
          </ElButton>
        </ElFormItem>
      </ElForm>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(180deg, #fdfbf9 0%, #f5f0eb 100%);
  padding: 24px;
}

.login-form {
  width: 420px;
  max-width: 100%;
  padding: 40px 36px;
  background-color: white;
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
}

.form-header {
  text-align: center;
  margin-bottom: 28px;
}

.form-header h2 {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 6px;
}

.form-subtitle {
  font-size: 14px;
  color: #94a3b8;
  margin: 0;
}

.sms-code-row {
  display: flex;
  gap: 12px;
}

.sms-input {
  flex: 1;
}

.sms-btn {
  min-width: 120px;
  background: linear-gradient(135deg, #5D4037, #8D6E63);
  border: none;
  color: white;
  font-weight: 500;
  border-radius: 8px;
}

.sms-btn:disabled {
  background: #e2e8f0;
  color: #94a3b8;
}
</style>