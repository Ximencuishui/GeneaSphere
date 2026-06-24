<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import familyBookApi, {
  GROUPING_OPTIONS,
  COVER_TEMPLATE_OPTIONS,
  FIELD_OPTIONS,
  FAMILY_BOOK_STATUS_LABEL,
} from '@/api/familyBook'
import type { FamilyBookProject } from '@/api/familyBook'

const router = useRouter()
const route = useRoute()

const projectId = computed(() => String(route.params.id || ''))

const loading = ref(false)
const saving = ref(false)
const project = ref<FamilyBookProject | null>(null)

const form = reactive({
  generations: 3,
  include_spouse: true,
  grouping: 'family' as 'family' | 'branch' | 'generation',
  selected_fields: ['name', 'photo', 'birth', 'bio'] as string[],
  cover_template: 'red' as 'red' | 'gold' | 'green' | 'ink' | 'modern',
  title: '',
  preface: '',
})

onMounted(async () => {
  await fetchProject()
})

async function fetchProject() {
  loading.value = true
  try {
    project.value = (await familyBookApi.getProject(projectId.value)) as any
    if (project.value) {
      form.generations = project.value.generations
      form.include_spouse = project.value.include_spouse
      form.grouping = project.value.grouping
      form.selected_fields = [...project.value.selected_fields]
      form.cover_template = project.value.cover_template
      form.title = project.value.title
      form.preface = project.value.preface || ''
    }
  } catch (err: any) {
    ElMessage.error(err?.message || '加载项目失败')
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    await familyBookApi.updateProject(projectId.value, {
      generations: form.generations,
      include_spouse: form.include_spouse,
      grouping: form.grouping,
      selected_fields: form.selected_fields,
      cover_template: form.cover_template,
      title: form.title,
      preface: form.preface,
    })
    ElMessage.success('设置已保存')
    await fetchProject()
  } catch (err: any) {
    ElMessage.error(err?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleGeneratePreview() {
  try {
    await ElMessageBox.confirm(
      '重新生成将覆盖当前预览内容（编辑过的文本会丢失），是否继续？',
      '生成预览',
      { confirmButtonText: '继续', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  saving.value = true
  try {
    // 先保存最新设置
    await familyBookApi.updateProject(projectId.value, {
      generations: form.generations,
      include_spouse: form.include_spouse,
      grouping: form.grouping,
      selected_fields: form.selected_fields,
      cover_template: form.cover_template,
      title: form.title,
      preface: form.preface,
    })
    await familyBookApi.generatePreview(projectId.value)
    ElMessage.success('预览已生成')
    router.push(`/user-center/family-book/preview/${projectId.value}`)
  } catch (err: any) {
    ElMessage.error(err?.message || '生成失败')
  } finally {
    saving.value = false
  }
}

function handlePreview() {
  router.push(`/user-center/family-book/preview/${projectId.value}`)
}

async function handleDelete() {
  try {
    await ElMessageBox.confirm(
      '确定删除该项目吗？此操作不可恢复。',
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await familyBookApi.deleteProject(projectId.value)
    ElMessage.success('已删除')
    router.push('/user-center/family-book')
  } catch (err: any) {
    ElMessage.error(err?.message || '删除失败')
  }
}

function statusLabel(s?: string) {
  if (!s) return ''
  return FAMILY_BOOK_STATUS_LABEL[s as keyof typeof FAMILY_BOOK_STATUS_LABEL] || s
}

function coverColor(template: string) {
  const opt = COVER_TEMPLATE_OPTIONS.find((o) => o.value === template)
  return opt?.preview_color || '#c0392b'
}

function getFieldLabels(fields: string[]) {
  return fields
    .map((f) => FIELD_OPTIONS.find((o) => o.value === f)?.label)
    .filter(Boolean)
    .join('、')
}
</script>

<template>
  <div class="family-book-detail" v-loading="loading">
    <ElCard class="header-card" shadow="never">
      <div class="header">
        <ElButton icon="ArrowLeft" @click="$router.push('/user-center/family-book')">
          返回列表
        </ElButton>
        <div class="header-info">
          <h2 class="page-title">{{ project?.title || '加载中…' }}</h2>
          <div class="meta">
            <ElTag size="small" effect="plain">
              {{ statusLabel(project?.status) }}
            </ElTag>
            <span v-if="project && project.start_person">
              起始人物：<strong>{{ project.start_person.full_name }}</strong>
            </span>
            <span v-if="project">
              {{ project.person_count }} 人 / {{ project.page_count }} 页
            </span>
          </div>
        </div>
        <div class="header-actions">
          <ElButton
            v-if="project && (project.status === 'preview' || project.status === 'ordered')"
            @click="handlePreview"
          >
            查看预览
          </ElButton>
          <ElButton type="primary" :loading="saving" @click="handleSave">
            保存设置
          </ElButton>
        </div>
      </div>
    </ElCard>

    <ElRow :gutter="20" v-if="project">
      <ElCol :xs="24" :md="14">
        <ElCard shadow="never">
          <template #header>
            <span class="card-title">图册设置</span>
          </template>

          <div class="form-item">
            <label class="form-label">图册标题</label>
            <ElInput
              v-model="form.title"
              placeholder="如：张氏家族·三代同堂"
              maxlength="100"
              show-word-limit
            />
          </div>

          <div class="form-item">
            <label class="form-label">起始人物</label>
            <div class="readonly-field">
              <ElIcon><User /></ElIcon>
              <span v-if="project?.start_person">{{ project.start_person.full_name }}</span>
              <ElTag
                v-if="project?.start_person"
                size="small"
                :type="project.start_person.gender === 'male' ? 'primary' : 'danger'"
                effect="plain"
              >
                {{ project.start_person.gender === 'male' ? '男' : '女' }}
              </ElTag>
              <span class="readonly-hint">起始人物不可修改</span>
            </div>
          </div>

          <div class="form-item">
            <label class="form-label">向后代数</label>
            <ElInputNumber v-model="form.generations" :min="1" :max="10" :step="1" />
            <span class="form-hint">代（最多 10 代）</span>
          </div>

          <div class="form-item inline-item">
            <label class="form-label">包含配偶</label>
            <ElSwitch v-model="form.include_spouse" />
            <span class="form-hint">每代人的配偶</span>
          </div>

          <div class="form-item">
            <label class="form-label">分类方式</label>
            <ElRadioGroup v-model="form.grouping">
              <ElRadioButton
                v-for="opt in GROUPING_OPTIONS"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
                <span class="radio-desc">{{ opt.desc }}</span>
              </ElRadioButton>
            </ElRadioGroup>
          </div>

          <div class="form-item">
            <label class="form-label">展示信息字段</label>
            <ElCheckboxGroup v-model="form.selected_fields">
              <ElCheckbox
                v-for="f in FIELD_OPTIONS"
                :key="f.value"
                :value="f.value"
              >
                {{ f.label }}
              </ElCheckbox>
            </ElCheckboxGroup>
          </div>

          <div class="form-item">
            <label class="form-label">封面风格</label>
            <div class="cover-grid">
              <div
                v-for="opt in COVER_TEMPLATE_OPTIONS"
                :key="opt.value"
                class="cover-card"
                :class="{ active: form.cover_template === opt.value }"
                :style="{ borderColor: opt.preview_color }"
                @click="form.cover_template = opt.value"
              >
                <div
                  class="cover-preview"
                  :style="{ background: opt.preview_color }"
                >
                  <span class="cover-text">家</span>
                </div>
                <div class="cover-label">{{ opt.label }}</div>
              </div>
            </div>
          </div>

          <div class="form-item">
            <label class="form-label">前言</label>
            <ElInput
              v-model="form.preface"
              type="textarea"
              :rows="3"
              placeholder="可写下对长辈的祝福、家族寄语等"
              maxlength="500"
              show-word-limit
            />
          </div>

          <ElDivider />

          <div class="action-buttons">
            <ElButton type="danger" plain @click="handleDelete">删除项目</ElButton>
            <div style="flex: 1"></div>
            <ElButton @click="handleSave" :loading="saving">保存设置</ElButton>
            <ElButton
              type="primary"
              :loading="saving"
              @click="handleGeneratePreview"
            >
              重新生成预览
            </ElButton>
          </div>
        </ElCard>
      </ElCol>

      <ElCol :xs="24" :md="10">
        <ElCard shadow="never" class="info-card">
          <template #header>
            <span class="card-title">项目信息</span>
          </template>
          <template v-if="project">
          <div class="cover-preview-large" :style="{ background: coverColor(form.cover_template) }">
            <div class="cover-large-title">{{ form.title || '未命名图册' }}</div>
            <div v-if="project?.start_person" class="cover-large-meta">
              {{ project.start_person.full_name }} · {{ form.generations }} 代同堂
            </div>
          </div>
          <ElDescriptions :column="1" border style="margin-top: 16px">
            <ElDescriptionsItem label="起始人物">
              {{ project?.start_person?.full_name || '未知' }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="当前状态">
              {{ statusLabel(project.status) }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="已收录">
              {{ project.person_count }} 人
            </ElDescriptionsItem>
            <ElDescriptionsItem label="页数">
              {{ project.page_count }} 页
            </ElDescriptionsItem>
            <ElDescriptionsItem label="分类方式">
              {{ GROUPING_OPTIONS.find((o) => o.value === project?.grouping)?.label }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="展示字段">
              {{ getFieldLabels(project.selected_fields) }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="预估金额">
              ¥{{ project.estimated_price }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="创建时间">
              {{ new Date(project.created_at).toLocaleString() }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="更新时间">
              {{ new Date(project.updated_at).toLocaleString() }}
            </ElDescriptionsItem>
            <ElDescriptionsItem v-if="project.print_order" label="关联订单">
              {{ project.print_order.id }}（{{ project.print_order.status }}）
            </ElDescriptionsItem>
          </ElDescriptions>
          </template>
        </ElCard>
      </ElCol>
    </ElRow>
  </div>
</template>

<style scoped>
.family-book-detail {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.header-card {
  margin-bottom: 4px;
}

.header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-info {
  flex: 1;
  min-width: 0;
}

.page-title {
  margin: 0;
  font-size: 20px;
}

.meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #606266;
  margin-top: 4px;
  flex-wrap: wrap;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.card-title {
  font-weight: 600;
  font-size: 16px;
}

.form-item {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #303133;
}

.form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}

.readonly-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  color: #606266;
}

.readonly-hint {
  margin-left: auto;
  font-size: 12px;
  color: #c0c4cc;
}

.radio-desc {
  font-size: 11px;
  color: #909399;
  margin-left: 4px;
}

.inline-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.inline-item .form-label {
  margin-bottom: 0;
}

.cover-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
}

.cover-card {
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  text-align: center;
  background: #fff;
}

.cover-card.active {
  border-width: 2px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.cover-preview {
  width: 100%;
  height: 70px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 32px;
  font-weight: 700;
  font-family: 'KaiTi', serif;
}

.cover-label {
  font-size: 12px;
  margin-top: 6px;
  color: #303133;
}

.action-buttons {
  display: flex;
  gap: 12px;
  align-items: center;
}

.info-card {
  position: sticky;
  top: 20px;
}

.cover-preview-large {
  height: 180px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #fff;
  font-family: 'KaiTi', serif;
  text-align: center;
  padding: 20px;
}

.cover-large-title {
  font-size: 22px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.cover-large-meta {
  margin-top: 8px;
  font-size: 13px;
  opacity: 0.85;
}
</style>
