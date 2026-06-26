<script setup lang="ts">
import { ref, computed } from "vue"
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElTabs, ElTabPane } from "element-plus"
import { useAuthStore } from "@/stores/auth"
import { useRouter } from "vue-router"
import axios from "axios"

const authStore = useAuthStore()
const router = useRouter()
const phone = ref("")
const password = ref("")
const smsCode = ref("")
const demoAdminLoading = ref(false)
const demoMemberLoading = ref(false)
const smsSending = ref(false)
const smsCountdown = ref(0)
const activeTab = ref("password")

let countdownTimer: ReturnType<typeof setInterval> | null = null

if (localStorage.getItem("geneasphere_token")) {
  localStorage.removeItem("geneasphere_token")
  delete axios.defaults.headers.common["Authorization"]
}

const isPhoneValid = computed(() => /^1[3-9]\d{9}$/.test(phone.value))

const handleSendSms = async () => {
  if (!isPhoneValid.value) {
    ElMessage.error("请输入正确的手机号")
    return
  }
  smsSending.value = true
  try {
    await authStore.sendSmsCode(phone.value, 'LOGIN')
    ElMessage.success("验证码已发送")
    // 倒计时
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

// 密码登录
const handleLogin = async () => {
  try {
    await authStore.login(phone.value, password.value)
    ElMessage.success("登录成功")
  } catch (error: any) {
    const msg = error.response?.data?.message || "登录失败，请检查手机号和密码"
    ElMessage.error(msg)
  }
}

// 短信验证码登录
const handleSmsLogin = async () => {
  if (!smsCode.value) {
    ElMessage.error("请输入验证码")
    return
  }
  try {
    await authStore.loginBySms(phone.value, smsCode.value)
    ElMessage.success("登录成功")
  } catch (error: any) {
    const msg = error.response?.data?.message || "验证码登录失败"
    ElMessage.error(msg)
  }
}

// 族谱管理员演示登录
const handleAdminDemoLogin = async () => {
  demoAdminLoading.value = true
  try {
    const response = await axios.post('/api/auth/demo-login')
    const { access_token, demoClanId, demoClanSlug, user } = response.data

    localStorage.setItem('geneasphere_token', access_token)
    axios.defaults.headers.common['Authorization'] = 'Bearer ' + access_token

    authStore.token = access_token
    authStore.user = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
    }

    // 记住 demo 家族 slug，供 LandingPage “进入后台”按钮直接使用，
    // 避免再次访问 /admin/* 重定向到 /select-family 触发 admin-clans 接口 401
    if (demoClanSlug) {
      localStorage.setItem('demo_clan_slug', demoClanSlug)
    }

    ElMessage.success('欢迎体验族谱管理后台！')

    // 优先用 slug 跳 demo 家族后台（跳过 select-family / admin-clans）
    if (demoClanSlug) {
      router.push(`/zupu/${demoClanSlug}/dashboard`)
    } else if (demoClanId) {
      router.push(`/tree/${demoClanId}`)
    } else {
      router.push('/clans')
    }
  } catch (error: any) {
    const msg = error.response?.data?.message || '演示服务暂不可用'
    ElMessage.error(msg)
  } finally {
    demoAdminLoading.value = false
  }
}

// 族员个人页面演示登录
const handleMemberDemoLogin = async () => {
  demoMemberLoading.value = true
  try {
    const response = await axios.post('/api/auth/demo-member-login')
    const { access_token, demoClanId, demoClanSlug, user } = response.data

    localStorage.setItem('geneasphere_token', access_token)
    axios.defaults.headers.common['Authorization'] = 'Bearer ' + access_token

    authStore.token = access_token
    authStore.user = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
    }

    if (demoClanSlug) {
      localStorage.setItem('demo_clan_slug', demoClanSlug)
    }

    ElMessage.success('欢迎体验族员个人页面！')

    // demo 成员也优先用 slug 进入家族后台，体验路径与管理员一致
    if (demoClanSlug) {
      router.push(`/zupu/${demoClanSlug}/dashboard`)
    } else if (demoClanId) {
      router.push(`/tree/${demoClanId}`)
    } else {
      router.push('/dashboard')
    }
  } catch (error: any) {
    const msg = error.response?.data?.message || '演示服务暂不可用'
    ElMessage.error(msg)
  } finally {
    demoMemberLoading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-form">
      <div class="form-header">
        <h2>登录寻根路</h2>
        <p class="form-subtitle">管理您的家族数字化档案</p>
      </div>

      <ElTabs v-model="activeTab" class="login-tabs">
        <ElTabPane label="密码登录" name="password">
          <ElForm :model="{ phone, password }" label-width="0">
            <ElFormItem>
              <ElInput v-model="phone" placeholder="手机号" size="large" />
            </ElFormItem>
            <ElFormItem>
              <ElInput v-model="password" type="password" placeholder="密码" size="large" show-password />
            </ElFormItem>
            <ElFormItem>
              <ElButton type="primary" size="large" :loading="authStore.loading" @click="handleLogin" style="width: 100%">
                登录
              </ElButton>
            </ElFormItem>
          </ElForm>
        </ElTabPane>

        <ElTabPane label="短信登录" name="sms">
          <ElForm :model="{ phone, smsCode }" label-width="0">
            <ElFormItem>
              <ElInput v-model="phone" placeholder="手机号" size="large" />
            </ElFormItem>
            <ElFormItem>
              <div class="sms-code-row">
                <ElInput v-model="smsCode" placeholder="验证码" size="large" class="sms-input" maxlength="6" />
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
              <ElButton type="primary" size="large" :loading="authStore.loading" @click="handleSmsLogin" style="width: 100%">
                登录
              </ElButton>
            </ElFormItem>
          </ElForm>
        </ElTabPane>
      </ElTabs>

      <div class="form-divider">
        <span>或</span>
      </div>
      <div class="demo-buttons">
        <ElFormItem>
          <ElButton size="large" class="btn-demo-admin" :loading="demoAdminLoading" @click="handleAdminDemoLogin" style="width: 100%">
            <span class="demo-icon">&#9654;</span>
            一键体验族谱管理演示
          </ElButton>
        </ElFormItem>
        <ElFormItem>
          <ElButton size="large" class="btn-demo-member" :loading="demoMemberLoading" @click="handleMemberDemoLogin" style="width: 100%">
            <span class="demo-icon">&#9679;</span>
            一键体验族员个人页面
          </ElButton>
        </ElFormItem>
      </div>
      <ElFormItem>
        <ElButton text @click="router.push('/register')" style="width: 100%; color: #5D4037;">
          还没有账号？立即注册
        </ElButton>
      </ElFormItem>
      <ElFormItem>
        <ElButton text @click="router.push('/')" style="width: 100%; color: #94a3b8; font-size: 13px;">
          ← 返回首页
        </ElButton>
      </ElFormItem>
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
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
}

.form-header {
  text-align: center;
  margin-bottom: 24px;
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

.login-tabs {
  margin-bottom: 8px;
}

.login-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}

.login-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  font-weight: 500;
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

.form-divider {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 8px 0 16px;
  color: #cbd5e1;
  font-size: 13px;
}

.form-divider::before,
.form-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e2e8f0;
}

.demo-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn-demo-admin {
  background: linear-gradient(135deg, #5D4037, #8D6E63);
  border: none;
  color: white;
  font-weight: 600;
  border-radius: 8px;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(93, 64, 55, 0.25);
}

.btn-demo-admin:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(93, 64, 55, 0.35);
}

.btn-demo-member {
  background: linear-gradient(135deg, #1976D2, #42A5F5);
  border: none;
  color: white;
  font-weight: 600;
  border-radius: 8px;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(25, 118, 210, 0.25);
}

.btn-demo-member:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(25, 118, 210, 0.35);
}

.demo-icon {
  margin-right: 8px;
  font-size: 14px;
}
</style>