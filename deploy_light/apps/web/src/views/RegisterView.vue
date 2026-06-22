<script setup lang="ts">
import { ref } from "vue"
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage } from "element-plus"
import { useRouter } from "vue-router"
import { useAuthStore } from "@/stores/auth"

const router = useRouter()
const authStore = useAuthStore()
const phone = ref("")
const password = ref("")
const confirmPassword = ref("")

const handleRegister = async () => {
  if (password.value !== confirmPassword.value) {
    ElMessage.error("Passwords do not match")
    return
  }
  try {
    await authStore.register(phone.value, password.value)
    ElMessage.success("Registration success")
  } catch (error) {
    ElMessage.error("Registration failed")
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-form">
      <h2>Register</h2>
      <ElForm :model="{ phone, password, confirmPassword }" label-width="80px">
        <ElFormItem label="Phone">
          <ElInput v-model="phone" placeholder="Enter phone" />
        </ElFormItem>
        <ElFormItem label="Password">
          <ElInput v-model="password" type="password" placeholder="Enter password" />
        </ElFormItem>
        <ElFormItem label="Confirm">
          <ElInput v-model="confirmPassword" type="password" placeholder="Confirm password" />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :loading="authStore.loading" @click="handleRegister" style="width: 100%;">
            Register
          </ElButton>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="info" @click="router.push('/login')" style="width: 100%;">
            Back to Login
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
  height: 100vh;
  background-color: #f5f5f5;
}

.login-form {
  width: 400px;
  padding: 30px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.login-form h2 {
  text-align: center;
  margin-bottom: 20px;
}
</style>