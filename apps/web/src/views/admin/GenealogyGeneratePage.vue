<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'

const route = useRoute()
const clanId = computed(() => String(route.query.clanId ?? '1'))

const form = reactive({
  version_name: '族谱·2026版',
  style: 'traditional' as 'traditional' | 'modern' | 'simple',
  branch: '',
  generation_start: undefined as number | undefined,
  generation_end: undefined as number | undefined,
  cover_image_url: '',
  include_options: {
    basic_info: true,
    spouse_info: true,
    children_list: true,
    bio_text: false,
    photo: false,
    migration: false,
  },
})

const generating = ref(false)
const lastResult = ref<any>(null)

const styleOptions = [
  { value: 'traditional', label: '传统悬挂式（世系图）', desc: '适合大幅挂轴，显示父子、夫妻关系' },
  { value: 'modern', label: '现代图文混排（A4册子）', desc: '照片+文字，作为家族纪念册' },
  { value: 'simple', label: '简约列表式', desc: '快速查看' },
]

const branchOptions = ref<string[]>([])
async function loadBranches() {
  try {
    const res = await axios.get(`/api/migration/${clanId.value}/branches`)
    branchOptions.value = (res.data?.data ?? []).map((b: any) => b.branch || b)
  } catch {
    branchOptions.value = []
  }
}

async function handleGenerate() {
  if (!form.version_name.trim()) {
    ElMessage.warning('请输入版本名称')
    return
  }
  try {
    await ElMessageBox.confirm(
      '生成族谱文档将消耗一定时间（取决于人数）。确认开始生成？',
      '确认',
      { confirmButtonText: '开始生成', cancelButtonText: '取消', type: 'info' },
    )
  } catch {
    return
  }

  generating.value = true
  try {
    const res = await axios.post(`/api/genealogy-documents/${clanId.value}`, {
      ...form,
      generation_start: form.generation_start || undefined,
      generation_end: form.generation_end || undefined,
    })
    lastResult.value = res.data
    ElMessage.success('族谱文档已生成并保存为新版本')
  } catch (err: any) {
    ElMessage.error(`生成失败：${err?.response?.data?.message ?? err.message}`)
  } finally {
    generating.value = false
  }
}

function handleDownload() {
  if (!lastResult.value?.file_url) return
  const link = document.createElement('a')
  link.href = lastResult.value.file_url
  link.download = `${form.version_name}.pdf`
  link.click()
}

function handleOrderPrint() {
  ElMessage.info('跳转到印刷下单（复用现有印刷流程）')
}

onMounted(() => {
  loadBranches()
})
</script>

<template>
  <div class="page-container">
    <h2 class="page-title">生成族谱文档</h2>
    <p class="page-desc">将家族的族谱数据生成可视化的 PDF 文档，支持多种排版风格与历史版本管理</p>

    <div class="form-grid">
      <ElCard class="form-card">
        <template #header>基础信息</template>
        <ElForm :model="form" label-position="top">
          <ElFormItem label="版本名称" required>
            <ElInput v-model="form.version_name" placeholder="如：族谱·2026版" maxlength="200" show-word-limit />
          </ElFormItem>
          <ElFormItem label="范围">
            <ElRadioGroup v-model="form.branch">
              <ElRadioButton value="">全族</ElRadioButton>
              <ElRadioButton v-for="b in branchOptions" :key="b" :value="b">{{ b }}</ElRadioButton>
            </ElRadioGroup>
          </ElFormItem>
          <ElFormItem label="世代范围（可选）">
            <div class="generation-range">
              <ElInputNumber v-model="form.generation_start" :min="1" :max="50" placeholder="起始" />
              <span class="separator">至</span>
              <ElInputNumber v-model="form.generation_end" :min="1" :max="50" placeholder="结束" />
              <span class="hint">留空则包含所有世代</span>
            </div>
          </ElFormItem>
          <ElFormItem label="封面图片 URL（可选）">
            <ElInput v-model="form.cover_image_url" placeholder="可填写 COS 图片地址" />
          </ElFormItem>
        </ElForm>
      </ElCard>

      <ElCard class="form-card">
        <template #header>排版风格</template>
        <ElRadioGroup v-model="form.style" class="style-options">
          <ElRadioButton
            v-for="opt in styleOptions"
            :key="opt.value"
            :value="opt.value"
            class="style-option"
          >
            <div class="style-card">
              <div class="style-label">{{ opt.label }}</div>
              <div class="style-desc">{{ opt.desc }}</div>
            </div>
          </ElRadioButton>
        </ElRadioGroup>
      </ElCard>

      <ElCard class="form-card">
        <template #header>内容包含</template>
        <ElCheckboxGroup v-model="form.include_options">
          <ElCheckbox :label="true" :value="true">人物基本信息（姓名、生卒、字辈）</ElCheckbox>
          <ElCheckbox :value="false" label="spouse_info">配偶信息</ElCheckbox>
          <ElCheckbox :value="false" label="children_list">子女列表</ElCheckbox>
          <ElCheckbox label="bio_text">生平简介</ElCheckbox>
          <ElCheckbox label="photo">照片（优先使用正式肖像）</ElCheckbox>
          <ElCheckbox label="migration">迁徙记录</ElCheckbox>
        </ElCheckboxGroup>
      </ElCard>

      <ElCard class="action-card">
        <ElButton
          type="primary"
          size="large"
          :loading="generating"
          @click="handleGenerate"
        >
          生成预览
        </ElButton>
        <ElButton
          v-if="lastResult"
          size="large"
          @click="handleDownload"
        >
          下载 PDF
        </ElButton>
        <ElButton
          v-if="lastResult"
          type="success"
          size="large"
          @click="handleOrderPrint"
        >
          下单印刷
        </ElButton>
      </ElCard>

      <ElCard v-if="lastResult" class="result-card">
        <template #header>生成结果</template>
        <ElDescriptions :column="2" border>
          <ElDescriptionsItem label="版本号">v{{ lastResult.version_number }}</ElDescriptionsItem>
          <ElDescriptionsItem label="页数">{{ lastResult.page_count }}</ElDescriptionsItem>
          <ElDescriptionsItem label="文件大小">
            {{ ((lastResult.file_size ?? 0) / 1024 / 1024).toFixed(2) }} MB
          </ElDescriptionsItem>
          <ElDescriptionsItem label="风格">{{ lastResult.style }}</ElDescriptionsItem>
          <ElDescriptionsItem label="生成时间" :span="2">
            {{ new Date(lastResult.created_at).toLocaleString('zh-CN') }}
          </ElDescriptionsItem>
        </ElDescriptions>
        <div v-if="lastResult.file_url" class="preview-frame">
          <iframe :src="lastResult.file_url" frameborder="0" class="pdf-preview" />
        </div>
      </ElCard>
    </div>
  </div>
</template>

<style scoped>
.page-container { max-width: 1200px; margin: 0 auto; }
.page-title { margin: 0 0 8px; font-size: 22px; color: #303133; }
.page-desc { margin: 0 0 24px; color: #909399; font-size: 14px; }
.form-grid { display: flex; flex-direction: column; gap: 16px; }
.generation-range { display: flex; align-items: center; gap: 12px; }
.separator { color: #909399; }
.hint { font-size: 12px; color: #909399; }
.style-options { display: flex; flex-direction: column; gap: 12px; width: 100%; }
.style-option { margin-right: 0 !important; }
.style-card { padding: 4px 0; text-align: left; }
.style-label { font-weight: 600; }
.style-desc { font-size: 12px; color: #909399; margin-top: 4px; }
.action-card { display: flex; gap: 12px; justify-content: center; }
.preview-frame { margin-top: 16px; }
.pdf-preview { width: 100%; height: 600px; border: 1px solid #ebeef5; border-radius: 4px; }
</style>
