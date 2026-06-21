<script setup lang="ts">
import { ref } from "vue"
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage } from "element-plus"
import { useAuthStore } from "@/stores/auth"
import { useRouter } from "vue-router"
import axios from "axios"

const authStore = useAuthStore()
const router = useRouter()
const phone = ref("")
const password = ref("")
const demoLoading = ref(false)

if (localStorage.getItem("geneasphere_token")) {
  localStorage.removeItem("geneasphere_token")
  delete axios.defaults.headers.common["Authorization"]
}

const handleLogin = async () => {
  try {
    await authStore.login(phone.value, password.value)
    ElMessage.success("登录成功")
  } catch (error) {
    ElMessage.error("登录失败，请检查手机号和密码")
  }
}

const handleDemoLogin = async () => {
  demoLoading.value = true
  try {
    const response = await axios.post('/api/auth/demo-login')
    const { access_token, demoClanId } = response.data

    localStorage.setItem('geneasphere_token', access_token)
    axios.defaults.headers.common['Authorization'] = 'Bearer ' + access_token

    authStore.token = access_token
    authStore.user = {
      sub: response.data.user.id,
      phone: response.data.user.phone,
      role: 'OWNER',
    }

    ElMessage.success('欢迎体验根脉云谱！')

    if (demoClanId) {
      router.push(`/tree/${demoClanId}`)
    } else {
      router.push('/clans')
    }
  } catch (error: any) {
    const msg = error.response?.data?.message || '演示服务暂不可用'
    ElMessage.error(msg)
  } finally {
    demoLoading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-form">
      <div class="form-header">
        <h2>登录根脉云谱</h2>
        <p class="form-subtitle">管理您的家族数字化档案</p>
      </div>
      <ElForm :model="{ phone, password }" label-width="0">
        <ElFormItem>
          <ElInput
            v-model="phone"
            placeholder="手机号"
            size="large"
            :prefix-icon="null"
          />
        </ElFormItem>
        <ElFormItem>
          <ElInput
            v-model="password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton
            type="primary"
            size="large"
            :loading="authStore.loading"
            @click="handleLogin"
            style="width: 100%"
          >
            登录
          </ElButton>
        </ElFormItem>
        <div class="form-divider">
          <span>或</span>
        </div>
        <ElFormItem>
          <ElButton
            size="large"
            class="btn-demo"
            :loading="demoLoading"
            @click="handleDemoLogin"
            style="width: 100%"
          >
            <span class="demo-icon">▶</span>
            一键体验演示账号
          </ElButton>
        </ElFormItem>
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
  width: 400px;
  max-width: 100%;
  padding: 40px 36px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
}

.form-header {
  text-align: center;
  margin-bottom: 32px;
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

.btn-demo {
  background: linear-gradient(135deg, #5D4037, #8D6E63);
  border: none;
  color: white;
  font-weight: 600;
  border-radius: 8px;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(93, 64, 55, 0.25);
}

.btn-demo:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(93, 64, 55, 0.35);
}

.demo-icon {
  margin-right: 6px;
  font-size: 13px;
}
</style>