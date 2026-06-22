<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { MemoryQuiz } from '@/types/memory'

const props = defineProps<{
  quiz: MemoryQuiz
  index: number
}>()

const emit = defineEmits<{
  (e: 'answer', quizId: number, answer: string): void
}>()

const userAnswer = ref('')
const timeLeft = ref(60)
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0) {
      clearInterval(timer!)
      emit('answer', props.quiz.id, userAnswer.value || '')
    }
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function submit() {
  if (timer) clearInterval(timer)
  emit('answer', props.quiz.id, userAnswer.value)
}
</script>

<template>
  <div class="question-card">
    <div class="question-header">
      <span class="question-number">第 {{ index + 1 }} 题</span>
      <span class="question-timer" :class="{ urgent: timeLeft <= 10 }">
        {{ timeLeft }}s
      </span>
    </div>
    <div class="question-body">
      <p class="question-text">{{ quiz.question }}</p>
      <div class="question-meta">
        <span class="meta-location">{{ quiz.location }}</span>
        <span class="meta-decade">{{ quiz.decade }} 年代</span>
      </div>
      <el-input
        v-model="userAnswer"
        type="textarea"
        :rows="3"
        placeholder="请输入你的答案..."
        class="answer-input"
        @keyup.enter="submit"
      />
    </div>
    <div class="question-footer">
      <el-button type="primary" size="small" @click="submit" :disabled="!userAnswer.trim()">
        提交答案
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.question-card {
  background: white;
  border-radius: 12px;
  border: 1px solid #e8e0d8;
  overflow: hidden;
  transition: box-shadow 0.2s;
}
.question-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}
.question-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #faf8f5;
  border-bottom: 1px solid #f0ebe4;
}
.question-number {
  font-size: 13px;
  font-weight: 600;
  color: #5D4037;
}
.question-timer {
  font-size: 14px;
  font-weight: 700;
  color: #8D6E63;
  font-variant-numeric: tabular-nums;
}
.question-timer.urgent {
  color: #F56C6C;
  animation: pulse 0.5s ease-in-out infinite alternate;
}
@keyframes pulse {
  from { opacity: 1; }
  to { opacity: 0.5; }
}
.question-body {
  padding: 16px;
}
.question-text {
  font-size: 15px;
  line-height: 1.7;
  color: #2c3e50;
  margin: 0 0 12px;
}
.question-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.meta-location, .meta-decade {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(93, 64, 55, 0.06);
  color: #5D4037;
}
.answer-input {
  margin-top: 8px;
}
.question-footer {
  padding: 8px 16px;
  background: #faf8f5;
  border-top: 1px solid #f0ebe4;
  text-align: right;
}
</style>
