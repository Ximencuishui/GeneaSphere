<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useMemoryStore } from '@/stores/memory'
import QuestionCard from '@/components/memory/QuestionCard.vue'
import type { MemoryQuiz } from '@/types/memory'

const route = useRoute()
const router = useRouter()
const store = useMemoryStore()

const step = ref<'info' | 'quiz' | 'result'>('info')
const location = ref((route.query.location as string) || '')
const decade = ref(Number(route.query.decade) || 1980)
const userName = ref('')
const userPhone = ref('')
const quizzes = ref<MemoryQuiz[]>([])
const quizAnswers = ref<{ quizId: number; answer: string }[]>([])
const result = ref<any>(null)
const submitting = ref(false)

async function startQuiz() {
  if (!location.value || !userName.value || !userPhone.value) {
    ElMessage.warning('请填写完整信息')
    return
  }
  const data = await store.fetchQuizzes(location.value, decade.value)
  if (!data || data.length === 0) {
    ElMessage.warning('暂未找到该地区的验证题目')
    return
  }
  quizzes.value = data
  quizAnswers.value = []
  step.value = 'quiz'
}

function onAnswer(quizId: number, answer: string) {
  quizAnswers.value.push({ quizId, answer })
  if (quizAnswers.value.length >= quizzes.value.length) {
    submitAll()
  }
}

async function submitAll() {
  submitting.value = true
  try {
    const res = await store.submitQuizAnswers(location.value, decade.value, quizAnswers.value)
    result.value = res
    step.value = 'result'
    if (res.passed) {
      ElMessage.success('验证通过！欢迎加入寻根路社区')
    } else {
      ElMessage.warning(`答对 ${res.correctCount}/${res.totalCount} 题，24小时后可重试`)
    }
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

function retry() {
  step.value = 'info'
  result.value = null
  quizzes.value = []
  quizAnswers.value = []
}
</script>

<template>
  <div class="quiz-verification-page">
    <div class="page-container">
      <!-- 步骤 1：填写信息 -->
      <div v-if="step === 'info'" class="info-step">
        <div class="step-icon">&#128220;</div>
        <h2>地方记忆身份验证</h2>
        <p class="step-desc">
          您正在查看 <strong>{{ location }}</strong> 地区 {{ decade }} 年代的记忆内容。
          请补充真实信息，通过本地知识问答验证后即可访问。
        </p>
        <el-form class="info-form" label-position="top">
          <el-form-item label="您的姓名">
            <el-input v-model="userName" placeholder="请输入姓名" />
          </el-form-item>
          <el-form-item label="手机号码">
            <el-input v-model="userPhone" placeholder="请输入手机号" />
          </el-form-item>
        </el-form>
        <div class="form-actions">
          <el-button type="primary" size="large" @click="startQuiz" class="btn-start">
            开始验证
          </el-button>
          <p class="form-hint">我们将从 "地方记忆题库" 中随机抽取3道关于该地区的题目</p>
        </div>
      </div>

      <!-- 步骤 2：答题 -->
      <div v-if="step === 'quiz'" class="quiz-step">
        <div class="step-icon">&#128221;</div>
        <h2>请回答以下问题</h2>
        <p class="step-desc">
          关于 <strong>{{ location }}</strong> 地区 {{ decade }} 年代，答对 2 题及以上视为验证通过
        </p>
        <div class="quiz-list">
          <QuestionCard
            v-for="(q, idx) in quizzes"
            :key="q.id"
            :quiz="q"
            :index="idx"
            @answer="onAnswer"
          />
        </div>
      </div>

      <!-- 步骤 3：结果 -->
      <div v-if="step === 'result'" class="result-step">
        <div v-if="result?.passed" class="result-success">
          <div class="result-icon">&#9989;</div>
          <h2>验证通过</h2>
          <p class="result-text">您已成功验证为 {{ location }} 地区的知情者</p>
          <div class="result-stats">
            <span class="stat">答对 {{ result.correctCount }}/{{ result.totalCount }} 题</span>
          </div>
          <el-button type="primary" size="large" @click="router.push('/memory-wall?location=' + location)">
            进入记忆留言墙
          </el-button>
        </div>
        <div v-else class="result-fail">
          <div class="result-icon">&#10060;</div>
          <h2>未通过验证</h2>
          <p class="result-text">答对 {{ result?.correctCount }}/{{ result?.totalCount }} 题，需要答对至少 2 题</p>
          <div class="result-details" v-if="result?.results">
            <div v-for="r in result.results" :key="r.quizId" class="result-item">
              <span class="result-mark" :class="{ correct: r.correct, wrong: !r.correct }">
                {{ r.correct ? '&#10004;' : '&#10008;' }}
              </span>
              <span class="result-answer">正确答案：{{ r.correctAnswer }}</span>
            </div>
          </div>
          <p class="retry-hint">24小时后可重新挑战</p>
          <el-button size="large" @click="retry">重新验证</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quiz-verification-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #faf8f5, #f5f0eb);
  display: flex;
  justify-content: center;
  padding: 80px 24px;
}
.page-container {
  max-width: 600px;
  width: 100%;
}
.step-icon {
  font-size: 48px;
  text-align: center;
  margin-bottom: 16px;
}
h2 {
  text-align: center;
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 12px;
}
.step-desc {
  text-align: center;
  font-size: 14px;
  color: #5a6a7a;
  line-height: 1.6;
  margin: 0 0 32px;
}
.info-form {
  background: white;
  padding: 24px;
  border-radius: 12px;
  border: 1px solid #e8e0d8;
}
.form-actions {
  text-align: center;
  margin-top: 24px;
}
.btn-start {
  padding: 14px 48px;
  font-size: 16px;
  font-weight: 600;
  background: linear-gradient(135deg, #5D4037, #8D6E63);
  border: none;
}
.form-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 12px;
}
.quiz-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.result-success, .result-fail {
  text-align: center;
  background: white;
  padding: 40px 24px;
  border-radius: 16px;
  border: 1px solid #e8e0d8;
}
.result-icon {
  font-size: 64px;
  margin-bottom: 16px;
}
.result-text {
  font-size: 15px;
  color: #5a6a7a;
  margin: 0 0 16px;
}
.result-stats {
  margin-bottom: 24px;
}
.stat {
  font-size: 14px;
  color: #5D4037;
  font-weight: 600;
}
.result-details {
  text-align: left;
  max-width: 400px;
  margin: 16px auto;
}
.result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f0ebe4;
}
.result-mark {
  font-size: 16px;
}
.result-mark.correct { color: #67C23A; }
.result-mark.wrong { color: #F56C6C; }
.result-answer {
  font-size: 13px;
  color: #5a6a7a;
}
.retry-hint {
  font-size: 13px;
  color: #94a3b8;
  margin: 16px 0;
}
</style>
