<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const saving = ref(false)
const form = reactive({
  sms_unit_price: 0.05,
  ai_tool_pricing: { restore: 1, animate: 3, colorize: 2, denoise: 2 },
  free_quota: 10,
  print_base_prices: { basic: 199, premium: 399, deluxe: 699 },
})

const fetchPricing = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/platform/settings/pricing')
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
    await axios.put('/api/platform/settings/pricing', form)
    ElMessage.success('已保存')
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchPricing()
})
</script>

<template>
  <div class="pricing-settings">
    <ElCard shadow="hover" v-loading="loading">
      <template #header>
        <div class="page-header">
          <h2>定价管理</h2>
          <ElButton type="primary" :loading="saving" @click="save">保存修改</ElButton>
        </div>
      </template>

      <ElForm label-width="160px">
        <h3 class="section-title">短信单价</h3>
        <ElFormItem label="国内短信 (元/条)">
          <ElInputNumber v-model="form.sms_unit_price" :min="0" :step="0.01" :precision="3" />
        </ElFormItem>

        <h3 class="section-title">AI 工具定价（每次消耗次数）</h3>
        <ElFormItem label="老照片修复">
          <ElInputNumber v-model="form.ai_tool_pricing.restore" :min="0" />
        </ElFormItem>
        <ElFormItem label="人物动态化">
          <ElInputNumber v-model="form.ai_tool_pricing.animate" :min="0" />
        </ElFormItem>
        <ElFormItem label="黑白上色">
          <ElInputNumber v-model="form.ai_tool_pricing.colorize" :min="0" />
        </ElFormItem>
        <ElFormItem label="图像降噪">
          <ElInputNumber v-model="form.ai_tool_pricing.denoise" :min="0" />
        </ElFormItem>

        <h3 class="section-title">免费额度</h3>
        <ElFormItem label="新用户每月免费次数">
          <ElInputNumber v-model="form.free_quota" :min="0" />
        </ElFormItem>

        <h3 class="section-title">印刷基价（元）</h3>
        <ElFormItem label="基础版">
          <ElInputNumber v-model="form.print_base_prices.basic" :min="0" :step="10" />
        </ElFormItem>
        <ElFormItem label="高级版">
          <ElInputNumber v-model="form.print_base_prices.premium" :min="0" :step="10" />
        </ElFormItem>
        <ElFormItem label="豪华版">
          <ElInputNumber v-model="form.print_base_prices.deluxe" :min="0" :step="10" />
        </ElFormItem>
      </ElForm>
    </ElCard>
  </div>
</template>

<style scoped>
.pricing-settings {
  max-width: 900px;
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

.section-title {
  margin: 16px 0 8px;
  color: #1f3a5f;
  border-left: 4px solid #2c5fa3;
  padding-left: 10px;
  font-size: 15px;
}
</style>
