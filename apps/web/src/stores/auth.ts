import { defineStore } from "pinia"
import { ref, computed } from "vue"
import axios from "axios"
import router from "@/router"

const TOKEN_KEY = "geneasphere_token"

interface AuthUser {
  sub: string
  phone: string
  role: string
}

function parseTokenPayload(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return {
      sub: payload.sub || '',
      phone: payload.phone || '',
      role: payload.role || 'VIEWER',
    }
  } catch {
    return null
  }
}

export const useAuthStore = defineStore("auth", () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || "")
  const loading = ref(false)
  const user = ref<AuthUser | null>(token.value ? parseTokenPayload(token.value) : null)

  if (token.value) {
    axios.defaults.headers.common["Authorization"] = "Bearer " + token.value
  }

  const isLoggedIn = computed(() => !!token.value)

  /** 发送短信验证码 */
  const sendSmsCode = async (phone: string, purpose: 'REGISTER' | 'LOGIN') => {
    const response = await axios.post("/api/auth/send-sms-code", { phone, purpose })
    return response.data
  }

  /** 短信验证码登录（无密码自动注册） */
  const loginBySms = async (phone: string, smsCode: string) => {
    loading.value = true
    try {
      const response = await axios.post("/api/auth/login", { phone, smsCode })
      token.value = response.data.access_token
      localStorage.setItem(TOKEN_KEY, token.value)
      axios.defaults.headers.common["Authorization"] = "Bearer " + token.value
      user.value = parseTokenPayload(token.value)
      await router.push("/dashboard")
    } catch (error) {
      throw error
    } finally {
      loading.value = false
    }
  }

  /** 密码登录 */
  const login = async (phone: string, password: string) => {
    loading.value = true
    try {
      const response = await axios.post("/api/auth/login", { phone, password })
      token.value = response.data.access_token
      localStorage.setItem(TOKEN_KEY, token.value)
      axios.defaults.headers.common["Authorization"] = "Bearer " + token.value
      user.value = parseTokenPayload(token.value)
      await router.push("/dashboard")
    } catch (error) {
      throw error
    } finally {
      loading.value = false
    }
  }

  const logout = () => {
    token.value = ""
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    delete axios.defaults.headers.common["Authorization"]
    router.push("/login")
  }

  /** 注册（需要短信验证码） */
  const register = async (phone: string, password: string, smsCode: string) => {
    loading.value = true
    try {
      const response = await axios.post("/api/auth/register", { phone, password, smsCode })
      token.value = response.data.access_token
      localStorage.setItem(TOKEN_KEY, token.value)
      axios.defaults.headers.common["Authorization"] = "Bearer " + token.value
      user.value = parseTokenPayload(token.value)
      await router.push("/dashboard")
    } catch (error) {
      throw error
    } finally {
      loading.value = false
    }
  }

  return { token, loading, user, isLoggedIn, sendSmsCode, login, loginBySms, logout, register }
})