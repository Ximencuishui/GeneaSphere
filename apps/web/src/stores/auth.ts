import { defineStore } from "pinia"
import { ref, computed } from "vue"
import axios from "axios"
import router from "@/router"

const TOKEN_KEY = "geneasphere_token"
const DEMO_CLAN_SLUG_KEY = "demo_clan_slug"

interface AuthUser {
  sub: string
  phone: string
  role: string
}

interface DemoPerson {
  id: string
  full_name: string
  gender: string
  birth_date: string | null
  birth_place: string | null
  migration_branch: string | null
  avatar_url: string | null
  clan: {
    id: string
    name: string
    slug: string
  }
}

/** 演示账号登录接口的响应数据 */
export interface DemoLoginResponse {
  access_token: string
  user: { id: string; phone: string; role: string }
  demoClanId: string | null
  demoClanSlug: string | null
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
  const demoPerson = ref<DemoPerson | null>(null)
  const demoPersonLoading = ref(false)

  if (token.value) {
    axios.defaults.headers.common["Authorization"] = "Bearer " + token.value
  }

  const isLoggedIn = computed(() => !!token.value)

  /** 发送短信验证码 */
  const sendSmsCode = async (phone: string, purpose: 'REGISTER' | 'LOGIN') => {
    const response = await axios.post("/api/auth/send-sms-code", { phone, purpose })
    return response.data
  }

  /** 登录后智能跳转：多家族 SaaS 跳转规则 */
  const navigateAfterLogin = async () => {
    try {
      const response = await axios.get('/api/auth/me/admin-clans')
      const clans: Array<{ id: string; slug: string; name: string }> = response.data.clans || []
      if (clans.length === 1) {
        // 单一家族：直接进入家族后台
        await router.push(`/zupu/${clans[0].slug}/dashboard`)
      } else if (clans.length > 1) {
        // 多个家族：跳转到家族选择页
        await router.push('/select-family')
      } else {
        // 无管理家族：进入普通用户仪表盘
        await router.push('/dashboard')
      }
    } catch (error) {
      console.warn('Failed to fetch admin clans, fallback to dashboard', error)
      await router.push('/dashboard')
    }
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
      await navigateAfterLogin()
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
      await navigateAfterLogin()
    } catch (error) {
      throw error
    } finally {
      loading.value = false
    }
  }

  const logout = () => {
    token.value = ""
    user.value = null
    demoPerson.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(DEMO_CLAN_SLUG_KEY)
    delete axios.defaults.headers.common["Authorization"]
    router.push("/login")
  }

  /**
   * 应用演示账号登录结果到全局状态。
   * 统一处理 token / user / axios headers / demoClanSlug 四个副作用，
   * 避免 DemoRoleModal 等调用方各自实现。
   */
  const applyDemoLogin = (data: DemoLoginResponse) => {
    token.value = data.access_token
    user.value = {
      sub: data.user.id,
      phone: data.user.phone,
      role: data.user.role,
    }
    localStorage.setItem(TOKEN_KEY, data.access_token)
    axios.defaults.headers.common["Authorization"] = "Bearer " + data.access_token
    if (data.demoClanSlug) {
      localStorage.setItem(DEMO_CLAN_SLUG_KEY, data.demoClanSlug)
    }
  }

  /**
   * 获取当前演示账号关联的 Person 记录（族员视角的"朱小小"身份）。
   * - 管理员演示账号 → null（管理员视角不绑定具体 Person）
   * - 族员演示账号   → 朱小小 Person 数据
   * - 非演示账号     → 返回 null（其他用户无此概念）
   */
  const fetchDemoPerson = async () => {
    if (!token.value) return null
    demoPersonLoading.value = true
    try {
      const response = await axios.get('/api/auth/me/demo-person')
      demoPerson.value = response.data.person || null
      return demoPerson.value
    } catch (error) {
      // 403 等错误静默处理：非演示账号正常跳过
      demoPerson.value = null
      return null
    } finally {
      demoPersonLoading.value = false
    }
  }

  /** 标记当前演示族员账号（便捷 setter） */
  const setDemoPerson = (p: DemoPerson | null) => {
    demoPerson.value = p
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
      await navigateAfterLogin()
    } catch (error) {
      throw error
    } finally {
      loading.value = false
    }
  }

  return { token, loading, user, isLoggedIn, demoPerson, demoPersonLoading, sendSmsCode, login, loginBySms, logout, register, applyDemoLogin, fetchDemoPerson, setDemoPerson }
})