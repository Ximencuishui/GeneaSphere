<script setup lang="ts">
/**
 * 家族信息设置弹窗（抽屉式 ElDialog）
 * --------------------------------------------------------------------
 * 由 FamilyOverviewPage 顶部的「设置」图标触发，承载原【家族信息】
 * 设置页的全部表单。
 *
 * 支持字段（全部 PUT /api/admin/clan-overview/info）：
 *   - 基础信息：name / description / slogan / origin_place
 *   - 视觉元素：logo_url / cover_url
 *   - 扩展信息：contact_email / contact_phone / website / established_year
 *               / cultural_heritage / notable_figures
 *
 * 兼容老接口 PUT /api/admin/settings/clan-info：保留两套接口均可读写，
 * 优先调用新接口，老接口字段相同、向后兼容。
 */
import { ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const route = useRoute()
const clanSlug = computed(() => (route.params.slug as string) || '')

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const saving = ref(false)

// 基础信息
const clanInfo = ref({
  name: '',
  description: '',
  slogan: '',
  origin_place: '',
  spirit: '',
  rules: '',
})

// 视觉元素
const visual = ref({
  logo_url: '',
  cover_url: '',
})

// 扩展信息（落 settings_json）
const extraInfo = ref({
  contact_email: '',
  contact_phone: '',
  website: '',
  established_year: '',
  cultural_heritage: '',
  notable_figures: '',
})

const fetchData = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/settings/clan-info', {
      params: { clanSlug: clanSlug.value },
    })
    const data = res.data || {}
    clanInfo.value = {
      name: data.name || '',
      description: data.description || '',
      slogan: data.slogan || '',
      origin_place: data.origin_place || '',
      spirit: data.spirit || '',
      rules: data.rules || '',
    }
    visual.value = {
      logo_url: data.logo_url || '',
      cover_url: data.cover_url || '',
    }
    extraInfo.value = {
      contact_email: data.contact_email || '',
      contact_phone: data.contact_phone || '',
      website: data.website || '',
      established_year: data.established_year || '',
      cultural_heritage: data.cultural_heritage || '',
      notable_figures: data.notable_figures || '',
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  if (!clanInfo.value.name.trim()) {
    ElMessage.warning('请输入家族名称')
    return
  }
  saving.value = true
  try {
    // 优先调用新接口（支持全字段）。失败时退回老接口。
    try {
      await axios.put(
        '/api/admin/clan-overview/info',
        {
          clanSlug: clanSlug.value,
          name: clanInfo.value.name,
          description: clanInfo.value.description,
          slogan: clanInfo.value.slogan,
          origin_place: clanInfo.value.origin_place,
          spirit: clanInfo.value.spirit,
          rules: clanInfo.value.rules,
          logo_url: visual.value.logo_url,
          cover_url: visual.value.cover_url,
          ...extraInfo.value,
        },
        { params: { clanSlug: clanSlug.value } },
      )
    } catch (innerErr: any) {
      // 兼容老接口（不抛错说明老接口不支持新接口字段）
      await axios.put(
        '/api/admin/settings/clan-info',
        {
          clanSlug: clanSlug.value,
          name: clanInfo.value.name,
          description: clanInfo.value.description,
          slogan: clanInfo.value.slogan,
          origin_place: clanInfo.value.origin_place,
          logo_url: visual.value.logo_url,
          cover_url: visual.value.cover_url,
          settings_json: extraInfo.value,
        },
        { params: { clanSlug: clanSlug.value } },
      )
    }
    ElMessage.success('保存成功')
    emit('saved')
    visible.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 打开时加载数据
watch(
  () => props.modelValue,
  (v) => {
    if (v) fetchData()
  },
)
</script>

<template>
  <ElDialog
    v-model="visible"
    title="家族信息设置"
    width="720px"
    :close-on-click-modal="false"
    destroy-on-close
    class="clan-info-dialog"
  >
    <div v-loading="loading">
        <!-- 基础信息 -->
        <ElCard class="form-section" shadow="never">
          <template #header><span>基础信息</span></template>
          <ElForm label-width="100px">
            <ElFormItem label="家族名称" required>
              <ElInput
                v-model="clanInfo.name"
                placeholder="请输入家族名称"
                maxlength="50"
                show-word-limit
              />
            </ElFormItem>
            <ElFormItem label="家族简介">
              <ElInput
                v-model="clanInfo.description"
                type="textarea"
                :rows="3"
                placeholder="请输入家族简介"
                maxlength="500"
                show-word-limit
              />
            </ElFormItem>
            <ElFormItem label="家族口号">
              <ElInput
                v-model="clanInfo.slogan"
                placeholder="如：传承家族文化，弘扬优良家风"
                maxlength="100"
                show-word-limit
              />
            </ElFormItem>
            <ElFormItem label="家族祖籍">
              <ElInput
                v-model="clanInfo.origin_place"
                placeholder="如：浙江省绍兴市"
              />
            </ElFormItem>
            <ElFormItem label="家族精神">
              <ElInput
                v-model="clanInfo.spirit"
                type="textarea"
                :rows="3"
                placeholder="如：忠孝传家、诗书继世"
                maxlength="500"
                show-word-limit
              />
            </ElFormItem>
            <ElFormItem label="家规家训">
              <ElInput
                v-model="clanInfo.rules"
                type="textarea"
                :rows="4"
                placeholder="请输入家规家训内容"
                maxlength="2000"
                show-word-limit
              />
            </ElFormItem>
          </ElForm>
        </ElCard>

        <!-- 视觉元素 -->
        <ElCard class="form-section" shadow="never">
          <template #header><span>视觉元素</span></template>
          <ElForm label-width="100px">
            <ElFormItem label="家族封面">
              <div class="cover-preview">
                <ElImage
                  v-if="visual.cover_url"
                  :src="visual.cover_url"
                  fit="cover"
                  class="preview-image"
                />
                <div v-else class="preview-placeholder">
                  <ElIcon><Picture /></ElIcon>
                  <span>暂无封面</span>
                </div>
              </div>
              <ElInput
                v-model="visual.cover_url"
                placeholder="请输入封面图片URL"
                style="margin-top: 8px;"
                clearable
              />
            </ElFormItem>
            <ElFormItem label="家族Logo">
              <div class="logo-preview">
                <ElImage
                  v-if="visual.logo_url"
                  :src="visual.logo_url"
                  fit="contain"
                  class="preview-logo"
                />
                <div v-else class="preview-placeholder small">
                  <ElIcon><Picture /></ElIcon>
                  <span>暂无Logo</span>
                </div>
              </div>
              <ElInput
                v-model="visual.logo_url"
                placeholder="请输入Logo图片URL"
                style="margin-top: 8px;"
                clearable
              />
            </ElFormItem>
          </ElForm>
        </ElCard>

        <!-- 扩展信息 -->
        <ElCard class="form-section" shadow="never">
          <template #header><span>扩展信息</span></template>
          <ElForm label-width="100px">
            <ElFormItem label="联系邮箱">
              <ElInput v-model="extraInfo.contact_email" placeholder="如：clan@example.com" />
            </ElFormItem>
            <ElFormItem label="联系电话">
              <ElInput v-model="extraInfo.contact_phone" placeholder="如：13800138000" />
            </ElFormItem>
            <ElFormItem label="官方网站">
              <ElInput v-model="extraInfo.website" placeholder="如：https://www.example.com" />
            </ElFormItem>
            <ElFormItem label="家族成立年份">
              <ElInput v-model="extraInfo.established_year" placeholder="如：1900" />
            </ElFormItem>
            <ElFormItem label="文化遗产">
              <ElInput
                v-model="extraInfo.cultural_heritage"
                type="textarea"
                :rows="2"
                placeholder="描述家族的文化遗产、传统技艺等"
              />
            </ElFormItem>
            <ElFormItem label="家族名人">
              <ElInput
                v-model="extraInfo.notable_figures"
                type="textarea"
                :rows="2"
                placeholder="列出家族中有突出贡献的人物"
              />
            </ElFormItem>
          </ElForm>
        </ElCard>
    </div>

    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="saving" @click="handleSave">保存</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.clan-info-dialog :deep(.el-dialog__body) {
  padding-top: 8px;
  padding-bottom: 8px;
}

.form-section {
  margin-bottom: 12px;
}

.form-section:last-child {
  margin-bottom: 0;
}

.cover-preview,
.logo-preview {
  width: 100%;
}

.preview-image {
  width: 100%;
  height: 160px;
  border-radius: 6px;
  border: 1px solid #dcdfe6;
}

.preview-logo {
  width: 100px;
  height: 100px;
  border-radius: 6px;
  border: 1px solid #dcdfe6;
  background: #f5f7fa;
}

.preview-placeholder {
  width: 100%;
  height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  border-radius: 6px;
  color: #909399;
  border: 1px dashed #dcdfe6;
}

.preview-placeholder.small {
  width: 100px;
  height: 100px;
}

.preview-placeholder .el-icon {
  font-size: 36px;
  margin-bottom: 6px;
}

.preview-placeholder.small .el-icon {
  font-size: 20px;
}
</style>