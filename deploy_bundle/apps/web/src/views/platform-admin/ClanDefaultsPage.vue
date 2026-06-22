<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const saving = ref(false)
const form = reactive({
  daily_sms_limit: 50,
  member_monthly_receive_limit: 200,
  default_visitor_visibility: 'limited',
})

const visibilityOptions = [
  { label: '仅基础信息', value: 'basic' },
  { label: '受限详情', value: 'limited' },
  { label: '完整可见', value: 'full' },
]

const fetchSettings = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/platform/settings/clan-defaults')
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
    await axios.put('/api/platform/settings/clan-defaults', form)
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
  <div class="clan-defaults">
    <ElCard shadow="hover" v-loading="loading">
      <template #header>
        <div class="page-header">
          <h2>家族默认配置</h2>
          <ElButton type="primary" :loading="saving" @click="save">保存修改</ElButton>
        </div>
      </template>

      <ElForm label-width="200px">
        <ElFormItem label="每日短信上限（条）">
          <ElInputNumber v-model="form.daily_sms_limit" :min="0" :step="10" />
          <span class="hint">新家族每日可发送的短信条数上限</span>
        </ElFormItem>
        <ElFormItem label="成员月接收上限（条）">
          <ElInputNumber v-model="form.member_monthly_receive_limit" :min="0" :step="50" />
          <span class="hint">每名成员每月可接收的短信条数</span>
        </ElFormItem>
        <ElFormItem label="游客可见范围（默认值）">
          <ElRadioGroup v-model="form.default_visitor_visibility">
            <ElRadio v-for="opt in visibilityOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </ElRadio>
          </ElRadioGroup>
        </ElFormItem>
      </ElForm>
    </ElCard>
  </div>
</template>

<style scoped>
.clan-defaults {
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
