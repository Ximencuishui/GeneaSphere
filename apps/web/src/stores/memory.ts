import { defineStore } from 'pinia'
import axios from 'axios'
import type { MemoryQuiz, MemoryAnswer, MemoryBadge, MemoryWallData } from '@/types/memory'

export const useMemoryStore = defineStore('memory', {
  state: () => ({
    currentQuizzes: [] as MemoryQuiz[],
    quizResults: null as any | null,
    wallData: null as MemoryWallData | null,
    badges: [] as MemoryBadge[],
    verifiedLocations: [] as any[],
    loading: false,
  }),

  actions: {
    // 获取验证题目
    async fetchQuizzes(location: string, decade?: number) {
      this.loading = true
      try {
        const params: any = { location }
        if (decade) params.decade = decade
        const res = await axios.get('/api/memory/quiz', { params })
        this.currentQuizzes = res.data
        return res.data
      } finally {
        this.loading = false
      }
    },

    // 提交验证答案
    async submitQuizAnswers(location: string, decade: number, answers: { quizId: number; answer: string }[]) {
      this.loading = true
      try {
        const res = await axios.post('/api/memory/quiz/submit', { location, decade, answers })
        this.quizResults = res.data
        return res.data
      } finally {
        this.loading = false
      }
    },

    // 创建题目
    async createQuiz(data: { location: string; region?: string; decade: number; question: string; tags?: string }) {
      const res = await axios.post('/api/memory/quiz/create', data)
      return res.data
    },

    // 提交答案
    async createAnswer(quizId: number, content: string) {
      const res = await axios.post('/api/memory/answer', { quizId, content })
      return res.data
    },

    // "我证实"投票
    async endorseAnswer(answerId: number) {
      const res = await axios.post(`/api/memory/answer/${answerId}/endorse`)
      return res.data
    },

    // 获取记忆墙数据
    async fetchMemoryWall(location: string, decade?: number, page = 1, pageSize = 20) {
      this.loading = true
      try {
        const params: any = { location, page, pageSize }
        if (decade) params.decade = decade
        const res = await axios.get('/api/memory/wall', { params })
        this.wallData = res.data
        return res.data
      } finally {
        this.loading = false
      }
    },

    // 获取用户徽章
    async fetchBadges() {
      try {
        const res = await axios.get('/api/memory/badges')
        this.badges = res.data
        return res.data
      } catch {
        this.badges = []
        return []
      }
    },

    // 获取已验证地区
    async fetchVerifiedLocations() {
      try {
        const res = await axios.get('/api/memory/verified-locations')
        this.verifiedLocations = res.data
        return res.data
      } catch {
        this.verifiedLocations = []
        return []
      }
    },
  },
})
