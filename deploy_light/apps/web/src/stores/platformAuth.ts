import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import router from '@/router'

const TOKEN_KEY = 'geneasphere_platform_token'

export type PlatformRole = 'super' | 'operator' | 'finance' | 'auditor'

interface PlatformAdmin {
  id: string
  username: string
  real_name?: string
  role: PlatformRole
  phone?: string
  status?: string
  last_login_at?: string | null
}

interface PlatformAuthState {
  sub: string
  username: string
  role: PlatformRole
  exp: number
}

function parseTokenPayload(token: string): PlatformAuthState | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return {
      sub: payload.sub || '',
      username: payload.username || '',
      role: (payload.role || 'operator') as PlatformRole,
      exp: payload.exp || 0,
    }
  } catch {
    return null
  }
}

export const usePlatformAuthStore = defineStore('platformAuth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const admin = ref<PlatformAdmin | null>(
    token.value
      ? (() => {
          const payload = parseTokenPayload(token.value)
          return payload
            ? {
                id: payload.sub,
                username: payload.username,
                role: payload.role,
              }
            : null
        })()
      : null,
  )
  const loading = ref(false)

  if (token.value) {
    axios.defaults.headers.common['Authorization'] = 'Bearer ' + token.value
  }

  const isLoggedIn = computed(() => !!token.value)
  const roleLabel = computed(() => {
    const map: Record<PlatformRole, string> = {
      super: '超级管理员',
      operator: '运营管理员',
      finance: '财务管理员',
      auditor: '审计员',
    }
    return admin.value ? map[admin.value.role] || admin.value.role : ''
  })

  const login = async (username: string, password: string) => {
    loading.value = true
    try {
      const response = await axios.post('/api/platform/auth/login', {
        username,
        password,
      })
      token.value = response.data.access_token
      localStorage.setItem(TOKEN_KEY, token.value)
      axios.defaults.headers.common['Authorization'] = 'Bearer ' + token.value
      admin.value = response.data.admin
      await router.push('/platform-admin/dashboard')
    } catch (error) {
      throw error
    } finally {
      loading.value = false
    }
  }

  const logout = async () => {
    try {
      await axios.post('/api/platform/auth/logout').catch(() => {})
    } finally {
      token.value = ''
      admin.value = null
      localStorage.removeItem(TOKEN_KEY)
      delete axios.defaults.headers.common['Authorization']
      router.push('/platform-admin/login')
    }
  }

  const fetchProfile = async () => {
    const res = await axios.get('/api/platform/auth/profile')
    admin.value = res.data
  }

  return { token, admin, loading, isLoggedIn, roleLabel, login, logout, fetchProfile }
})
