const fs = require('fs');

const authStore = `import { defineStore } from "pinia"
import { ref, computed } from "vue"
import axios from "axios"
import router from "@/router"

const TOKEN_KEY = "geneasphere_token"

export const useAuthStore = defineStore("auth", () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || "")
  const loading = ref(false)

  const isLoggedIn = computed(() => !!token.value)

  const login = async (phone, password) => {
    loading.value = true
    try {
      const response = await axios.post("/api/auth/login", { phone, password })
      token.value = response.data.token
      localStorage.setItem(TOKEN_KEY, token.value)
      axios.defaults.headers.common["Authorization"] = "Bearer " + token.value
      await router.push("/dashboard")
    } catch (error) {
      throw error
    } finally {
      loading.value = false
    }
  }

  const logout = () => {
    token.value = ""
    localStorage.removeItem(TOKEN_KEY)
    delete axios.defaults.headers.common["Authorization"]
    router.push("/login")
  }

  return { token, loading, isLoggedIn, login, logout }
})`;

fs.writeFileSync("e:/GeneaSphere/apps/web/src/stores/auth.ts", authStore);
console.log("auth.ts created");

const loginView = `<script setup lang="ts">
import { ref } from "vue"
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage } from "element-plus"
import { useAuthStore } from "@/stores/auth"

const authStore = useAuthStore()
const phone = ref("")
const password = ref("")

const handleLogin = async () => {
  try {
    await authStore.login(phone.value, password.value)
    ElMessage.success("Login success")
  } catch (error) {
    ElMessage.error("Login failed")
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-form">
      <h2>Login</h2>
      <ElForm :model="{ phone, password }" label-width="80px">
        <ElFormItem label="Phone">
          <ElInput v-model="phone" placeholder="Enter phone" />
        </ElFormItem>
        <ElFormItem label="Password">
          <ElInput v-model="password" type="password" placeholder="Enter password" />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :loading="authStore.loading" @click="handleLogin">
            Login
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
</style>`;

fs.writeFileSync("e:/GeneaSphere/apps/web/src/views/LoginView.vue", loginView);
console.log("LoginView.vue created");

const dashboardView = `<script setup lang="ts">
import { useAuthStore } from "@/stores/auth"

const authStore = useAuthStore()
</script>

<template>
  <div class="dashboard">
    <h1>Welcome</h1>
    <ElButton type="danger" @click="authStore.logout">
      Logout
    </ElButton>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 20px;
}
</style>`;

fs.writeFileSync("e:/GeneaSphere/apps/web/src/views/DashboardView.vue", dashboardView);
console.log("DashboardView.vue created");

const mainTs = `import { createApp } from "vue"
import { createPinia } from "pinia"
import ElementPlus from "element-plus"
import "element-plus/dist/index.css"
import App from "./App.vue"
import router from "./router"

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus)

app.mount("#app")`;

fs.writeFileSync("e:/GeneaSphere/apps/web/src/main.ts", mainTs);
console.log("main.ts updated");

const appVue = `<script setup lang="ts">
</script>

<template>
  <router-view />
</template>`;

fs.writeFileSync("e:/GeneaSphere/apps/web/src/App.vue", appVue);
console.log("App.vue updated");

const registerView = `<script setup lang="ts">
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
</style>`;

fs.writeFileSync("e:/GeneaSphere/apps/web/src/views/RegisterView.vue", registerView);
console.log("RegisterView.vue created");

console.log("All files generated successfully!");
