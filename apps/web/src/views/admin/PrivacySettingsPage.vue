<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const route = useRoute()

const clanSlug = ref('')
const loading = ref(false)
const saving = ref(false)

const settings = ref({
  allow_visitor_deceased: false,
  max_generations_visible: 5,
  hide_living_photos: true,
  hide_living_spouses: true,
  enable_relative_verify: false,
  verify_questions: ['请输入您父亲的姓名', '请输入您祖父的出生年份'],
  verify_max_attempts: 3,
})

const verifyOptions = ref([
  { label: '请输入您父亲的姓名', value: '请输入您父亲的姓名' },
  { label: '请输入您祖父的出生年份', value: '请输入您祖父的出生年份' },
  { label: '请输入您曾祖父的配偶姓氏', value: '请输入您曾祖父的配偶姓氏' },
])

const fetchSettings = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/settings/privacy', {
      params: { clanSlug: clanId.value },
    })
    settings.value = res.data
  } catch (error) {
    console.error('Failed to fetch settings:', error)
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  saving.value = true
  try {
    await axios.put('/api/admin/settings/privacy', {
      clanSlug: clanId.value,
      ...settings.value,
    })
    ElMessage.success('隐私配置已保存')
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const handleExportData = async () => {
  try {
    ElMessage.info('正在导出数据...')
    const res = await axios.get('/api/admin/settings/export', {
      params: { clanSlug: clanId.value },
    })
    // 导出为 JSON 文件
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `geneasphere_clan_${clanId.value}_${new Date().toISOString().slice(0, 10)}.json`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('数据导出成功')
  } catch (error) {
    ElMessage.error('导出失败')
  }
}

onMounted(() => {
  clanId.value = route.params.slug as string || '1'
  fetchSettings()
})
</script>

<template>
  <div class="privacy-settings-page">
    <ElCard v-loading="loading">
      <template #header>
        <h2>隐私配置</h2>
      </template>

      <ElForm label-width="200px" class="settings-form">
        <!-- 游客可见范围 -->
        <ElDivider content-position="left">游客可见范围</ElDivider>

        <ElFormItem label="允许查看已故人员">
          <ElSwitch v-model="settings.allow_visitor_deceased" />
        </ElFormItem>

        <ElFormItem label="仅展示前 N 代">
          <ElInputNumber
            v-model="settings.max_generations_visible"
            :min="1"
            :max="20"
            :step="1"
          />
          <span style="margin-left: 8px; color: #909399;">代（默认5）</span>
        </ElFormItem>

        <ElFormItem label="隐藏在世人员照片">
          <ElSwitch v-model="settings.hide_living_photos" />
        </ElFormItem>

        <ElFormItem label="隐藏在世人员配偶信息">
          <ElSwitch v-model="settings.hide_living_spouses" />
        </ElFormItem>

        <!-- 亲属验证登录 -->
        <ElDivider content-position="left">亲属验证登录</ElDivider>

        <ElFormItem label="启用亲属验证">
          <ElSwitch v-model="settings.enable_relative_verify" />
        </ElFormItem>

        <ElFormItem
          label="验证问题配置"
          v-if="settings.enable_relative_verify"
        >
          <ElCheckboxGroup v-model="settings.verify_questions">
            <ElCheckbox
              v-for="opt in verifyOptions"
              :key="opt.value"
              :label="opt.value"
            >
              {{ opt.label }}
            </ElCheckbox>
          </ElCheckboxGroup>
        </ElFormItem>

        <ElFormItem
          label="容错次数"
          v-if="settings.enable_relative_verify"
        >
          <ElInputNumber
            v-model="settings.verify_max_attempts"
            :min="1"
            :max="10"
            :step="1"
          />
        </ElFormItem>

        <!-- 数据导出 -->
        <ElDivider content-position="left">数据备份</ElDivider>

        <ElFormItem label="数据导出">
          <ElButton type="primary" @click="handleExportData">
            一键导出家族数据
          </ElButton>
          <div style="margin-top: 8px; color: #909399; font-size: 12px;">
            包含全部人员信息和照片，用于备份
          </div>
        </ElFormItem>
      </ElForm>

      <div class="form-actions">
        <ElButton type="primary" @click="handleSave" :loading="saving">
          保存配置
        </ElButton>
      </div>
    </ElCard>
  </div>
</template>

<style scoped>
.privacy-settings-page {
  max-width: 1000px;
  margin: 0 auto;
}

.settings-form {
  margin-top: 20px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #EBEEF5;
}
</style>
