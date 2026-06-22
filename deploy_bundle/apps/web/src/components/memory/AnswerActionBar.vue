<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useMemoryStore } from '@/stores/memory'

const props = defineProps<{
  quizId: number
  initialEndorsements?: number
}>()

const emit = defineEmits<{
  (e: 'answered', content: string): void
  (e: 'endorsed', endorsements: number): void
}>()

const store = useMemoryStore()
const showInput = ref(false)
const answerText = ref('')
const submitting = ref(false)

async function sayKnow() {
  if (!answerText.value.trim()) {
    ElMessage.warning('请输入答案')
    return
  }
  submitting.value = true
  try {
    await store.createAnswer(props.quizId, answerText.value.trim())
    ElMessage.success('答案已提交')
    emit('answered', answerText.value.trim())
    showInput.value = false
    answerText.value = ''
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

async function endorse() {
  submitting.value = true
  try {
    const res = await store.endorseAnswer(props.quizId)
    ElMessage.success('已证实')
    emit('endorsed', res.endorsements)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="answer-action-bar">
    <div v-if="!showInput" class="action-buttons">
      <el-button size="small" type="primary" plain @click="showInput = true">
        我知道
      </el-button>
      <el-button size="small" plain @click="endorse" :loading="submitting">
        我证实 ({{ initialEndorsements || 0 }})
      </el-button>
    </div>
    <div v-else class="answer-input-area">
      <el-input
        v-model="answerText"
        :rows="2"
        type="textarea"
        placeholder="写下你的答案..."
        size="small"
      />
      <div class="input-actions">
        <el-button size="small" @click="showInput = false">取消</el-button>
        <el-button size="small" type="primary" @click="sayKnow" :loading="submitting">
          提交
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.action-buttons {
  display: flex;
  gap: 8px;
}
.answer-input-area {
  margin-top: 8px;
}
.input-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
}
</style>
