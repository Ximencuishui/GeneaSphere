<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const saving = ref(false)
const form = reactive({
  registration_review_enabled: true,
  sms_enabled: true,
  ai_tools_enabled: true,
})

const fetchSettings = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/platform/settings/switches')
    Object.assign(form, res.data)
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

const save = async () => {
  saving.value = true
  try {
    await axios.put('/api/platform/settings/switches', form)
    ElMessage.success('已保存')
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchSettings()
})
</script>

<template>
  <div class="switches">
    <ElCard shadow="hover" v-loading="loading">
      <template #header>
        <div class="page-header">
          <h2>全局开关</h2>
          <ElButton type="primary" :loading="saving" @click="save">保存修改</ElButton>
        </div>
      </template>

      <ElForm label-width="200px">
        <ElFormItem label="注册审核">
          <ElSwitch
            v-model="form.registration_review_enabled"
            active-text="开启"
            inactive-text="关闭"
            inline-prompt
          />
          <span class="hint">开启后新家族需人工审核后才能使用</span>
        </ElFormItem>
        <ElFormItem label="短信功能">
          <ElSwitch
            v-model="form.sms_enabled"
            active-text="开启"
            inactive-text="关闭"
            inline-prompt
          />
          <span class="hint">维护期间可临时关闭全平台短信发送</span>
        </ElFormItem>
        <ElFormItem label="AI 工具">
          <ElSwitch
            v-model="form.ai_tools_enabled"
            active-text="开启"
            inactive-text="关闭"
            inline-prompt
          />
          <span class="hint">关闭后 AI 工具箱将不可用</span>
        </ElFormItem>
      </ElForm>
    </ElCard>
  </div>
</template>

<style scoped>
.switches {
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h2 {
  margin: 0;
}

.hint {
  margin-left: 12px;
  color: #909399;
  font-size: 12px;
}
</style>
