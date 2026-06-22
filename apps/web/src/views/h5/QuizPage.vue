<template>
  <div class="h5-page">
    <CountdownBar v-if="expireAt" :expire-at="expireAt" :on-expire="onExpire" title="还剩" />

    <div class="h5-card">
      <h1 class="h5-title">身份验证</h1>
      <p class="h5-subtitle">请回答关于族谱的 {{ total }} 道选择题，答对 {{ required }} 题即可通过</p>

      <div v-if="loading" class="h5-empty">题目加载中…</div>

      <template v-else-if="currentQuestion">
        <div class="h5-progress">
          <span>进度 {{ currentIndex + 1 }}/{{ total }}</span>
          <div class="h5-progress__bar">
            <div class="h5-progress__fill" :style="{ width: ((currentIndex + 1) / total) * 100 + '%' }" />
          </div>
        </div>

        <div style="font-size: 16px; margin: 12px 0;">
          <span style="color: #909399; font-size: 12px; margin-right: 6px;">
            {{ difficultyLabel(currentQuestion.difficulty) }}
          </span>
          {{ currentQuestion.question }}
        </div>

        <div class="h5-radio-group">
          <div
            v-for="opt in currentQuestion.options"
            :key="opt"
            class="h5-radio"
            :class="{ 'is-active': selected === opt }"
            @click="selected = opt"
          >
            <input type="radio" :checked="selected === opt" />
            <span>{{ opt }}</span>
          </div>
        </div>

        <button class="h5-btn" :disabled="!selected || submitting" @click="onNext">
          {{ isLast ? '提交答案' : '下一题' }}
        </button>
        <button v-if="!isLast" class="h5-btn h5-btn--secondary" :disabled="retryUsed >= maxRetry" @click="onRetry">
          换一组题（剩余 {{ maxRetry - retryUsed }} 次）
        </button>
      </template>

      <div v-else class="h5-empty">未生成题目</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { showToast, showDialog } from 'vant'
import 'vant/es/toast/style'
import 'vant/es/dialog/style'
import CountdownBar from '@/components/CountdownBar.vue'
import '@/styles/h5.scss'

const route = useRoute()
const router = useRouter()
const sessionId = String(route.query.session_id || '')

const expireAt = ref<string | null>(null)
const total = ref(3)
const required = ref(2)
const maxRetry = ref(3)
const loading = ref(true)
const submitting = ref(false)
const questions = ref<any[]>([])
const currentIndex = ref(0)
const selected = ref('')
const retryUsed = ref(0)

const currentQuestion = computed(() => questions.value[currentIndex.value])
const isLast = computed(() => currentIndex.value === questions.value.length - 1)

const difficultyLabel = (d: string) => {
  return { EASY: '初级', MEDIUM: '中级', HARD: '高级' }[d] || d
}

const onExpire = () => {
  showDialog({ title: '已超时', message: '请重新扫码开始验证' })
  router.replace('/h5/expired')
}

const loadQuestions = async () => {
  loading.value = true
  try {
    const res = (await axios.get(`/api/invite/h5/quiz/${sessionId}`)).data
    questions.value = res.questions
    total.value = res.total
    required.value = res.required_correct
    maxRetry.value = res.max_retry
  } catch (e: any) {
    showToast(e?.response?.data?.message || '加载题目失败')
  } finally {
    loading.value = false
  }
}

const onNext = async () => {
  if (!selected.value) return
  try {
    submitting.value = true
    await axios.post(`/api/invite/h5/quiz/${sessionId}/answer`, {
      attempt_id: currentQuestion.value.attempt_id,
      answer: selected.value,
    })
    if (isLast.value) {
      const res = (await axios.post(`/api/invite/h5/quiz/${sessionId}/submit`, {
        answers: questions.value.map((q) => ({
          attempt_id: q.attempt_id,
          answer: q.attempt_id === currentQuestion.value.attempt_id ? selected.value : (q.user_answer || ''),
        })),
        retry_round: retryUsed.value,
      })).data
      if (res.passed) {
        showToast(`验证通过（${res.correct_count}/${res.total_count}）`)
        setTimeout(() => router.replace({ path: '/h5/success', query: { session_id: sessionId } }), 600)
      } else if (res.can_retry) {
        showDialog({
          title: '本次未通过',
          message: `答对 ${res.correct_count} 题，可以重新抽题（剩 ${res.retry_remaining} 次）`,
          confirmButtonText: '重新抽题',
        })
          .then(() => {
            retryUsed.value += 1
            currentIndex.value = 0
            selected.value = ''
            loadQuestions()
          })
          .catch(() => {
            router.replace({ path: '/h5/endorsement', query: { session_id: sessionId } })
          })
      } else {
        showDialog({ title: '验证失败', message: '请尝试熟人背书' })
        router.replace({ path: '/h5/endorsement', query: { session_id: sessionId } })
      }
    } else {
      currentQuestion.value.user_answer = selected.value
      currentIndex.value += 1
      selected.value = ''
    }
  } catch (e: any) {
    showToast(e?.response?.data?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

const onRetry = async () => {
  retryUsed.value += 1
  currentIndex.value = 0
  selected.value = ''
  await loadQuestions()
}

onMounted(async () => {
  if (!sessionId) {
    router.replace('/h5/expired')
    return
  }
  const cache = sessionStorage.getItem('h5_invite_session')
  if (cache) {
    const parsed = JSON.parse(cache)
    expireAt.value = parsed.expire_at
  }
  await loadQuestions()
})
</script>
