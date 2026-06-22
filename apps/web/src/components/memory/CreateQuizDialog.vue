<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useMemoryStore } from '@/stores/memory'

const store = useMemoryStore()
const visible = ref(false)
const form = ref({
  location: '',
  region: '',
  decade: new Date().getFullYear(),
  question: '',
  tags: '',
})
const submitting = ref(false)

function reset() {
  form.value = { location: '', region: '', decade: new Date().getFullYear(), question: '', tags: '' }
}

async function submit() {
  if (!form.value.location || !form.value.question) {
    ElMessage.warning('请填写地点和问题')
    return
  }
  submitting.value = true
  try {
    await store.createQuiz(form.value)
    ElMessage.success('题目已提交，等待管理员审核')
    visible.value = false
    reset()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

function open() {
  visible.value = true
}

defineExpose({ open })
</script>

<template>
  <el-dialog v-model="visible" title="创建地方记忆题目" width="520px" :close-on-click-modal="false">
    <el-form :model="form" label-position="top">
      <el-row :gutter="16">
        <el-col :span="14">
          <el-form-item label="地点">
            <el-input v-model="form.location" placeholder="如：湖北十堰" />
          </el-form-item>
        </el-col>
        <el-col :span="10">
          <el-form-item label="年代">
            <el-input-number v-model="form.decade" :min="1900" :max="2030" :step="5" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="地域范围（可选）">
        <el-input v-model="form.region" placeholder="如：华中/湖北省" />
      </el-form-item>
      <el-form-item label="问题">
        <template #label>
          问题 <span class="label-hint">（填空引导式）</span>
        </template>
        <el-input
          v-model="form.question"
          type="textarea"
          :rows="3"
          placeholder='在 [具体地名]，[年代] 左右，提到 [老地标/事件]，本地人一定都知道的是______？'
        />
      </el-form-item>
      <el-form-item label="标签（可选，逗号分隔）">
        <el-input v-model="form.tags" placeholder="如：工厂,80年代,二汽" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="submit" :loading="submitting">提交审核</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.label-hint {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 400;
}
</style>
