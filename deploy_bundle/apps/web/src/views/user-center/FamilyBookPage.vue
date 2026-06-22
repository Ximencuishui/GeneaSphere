<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import familyBookApi, {
  GROUPING_OPTIONS,
  COVER_TEMPLATE_OPTIONS,
  FIELD_OPTIONS,
  FAMILY_BOOK_STATUS_LABEL,
  FAMILY_BOOK_STATUS_TAG,
} from '@/api/familyBook'
import type {
  FamilyBookProjectSummary,
  FamilyBookEstimate,
  FamilyBookPerson,
} from '@/api/familyBook'

const router = useRouter()
const route = useRoute()

// 状态
const tab = ref<'create' | 'list'>('create')
const loading = ref(false)
const submitting = ref(false)

// 人物搜索
const searchQuery = ref('')
const personResults = ref<FamilyBookPerson[]>([])
const showPersonDropdown = ref(false)
const selectedPerson = ref<FamilyBookPerson | null>(null)
const personSearchLoading = ref(false)

// 估算预览
const estimate = ref<FamilyBookEstimate | null>(null)
const estimating = ref(false)

// 我的项目列表
const projects = ref<FamilyBookProjectSummary[]>([])
const projectsTotal = ref(0)

// 表单
const form = reactive({
  generations: 3,
  include_spouse: true,
  grouping: 'family' as 'family' | 'branch' | 'generation',
  selected_fields: ['name', 'photo', 'birth', 'bio'] as string[],
  cover_template: 'red' as 'red' | 'gold' | 'green' | 'ink' | 'modern',
  title: '',
  preface: '',
})

const canSubmit = computed(() => !!selectedPerson.value)

// ============================================================
//                  人物选择与表单
// ============================================================

async function loadInitialPersons() {
  try {
    personSearchLoading.value = true
    personResults.value = (await familyBookApi.searchPersons('', 30)) as any
  } catch (err) {
    console.error('加载初始人物失败', err)
  } finally {
    personSearchLoading.value = false
  }
}

async function searchPersons(q: string) {
  try {
    personSearchLoading.value = true
    personResults.value = (await familyBookApi.searchPersons(q, 30)) as any
    showPersonDropdown.value = personResults.value.length > 0
  } catch (err) {
    console.error(err)
  } finally {
    personSearchLoading.value = false
  }
}

function selectPerson(p: FamilyBookPerson) {
  selectedPerson.value = p
  searchQuery.value = p.full_name
  showPersonDropdown.value = false
  if (!form.title.trim()) {
    form.title = `${p.full_name}家族·${form.generations}代同堂`
  }
  runEstimate()
}

function clearPerson() {
  selectedPerson.value = null
  searchQuery.value = ''
  estimate.value = null
}

// 监听表单参数变化重新估算
watch(
  () => [
    selectedPerson.value?.id,
    form.generations,
    form.include_spouse,
    form.grouping,
    form.selected_fields.length,
  ],
  () => {
    if (selectedPerson.value) runEstimate()
  },
)

async function runEstimate() {
  if (!selectedPerson.value) {
    estimate.value = null
    return
  }
  estimating.value = true
  try {
    // 先创建草稿项目，再做估算
    if (!currentDraftId.value) {
      const res = (await familyBookApi.createProject({
        start_person_id: Number(selectedPerson.value.id),
        generations: form.generations,
        include_spouse: form.include_spouse,
        grouping: form.grouping,
        selected_fields: form.selected_fields,
        cover_template: form.cover_template,
        title: form.title,
        preface: form.preface,
      })) as any
      currentDraftId.value = res.id
    } else {
      // 更新现有草稿的参数
      await familyBookApi.updateProject(currentDraftId.value, {
        generations: form.generations,
        include_spouse: form.include_spouse,
        grouping: form.grouping,
        selected_fields: form.selected_fields,
        cover_template: form.cover_template,
        title: form.title,
        preface: form.preface,
      })
    }
    estimate.value = (await familyBookApi.previewEstimate(
      currentDraftId.value!,
    )) as any
  } catch (err: any) {
    console.error('估算失败', err)
    estimate.value = null
  } finally {
    estimating.value = false
  }
}

const currentDraftId = ref<string | null>(null)

// 处理外部传入的 personId（如族谱树右键菜单）
onMounted(async () => {
  await loadInitialPersons()
  await fetchProjects()
  const queryPersonId = route.query.personId as string | undefined
  if (queryPersonId) {
    const found = personResults.value.find(
      (p) => String(p.id) === queryPersonId,
    )
    if (found) selectPerson(found)
  }
})

// ============================================================
//                  项目列表
// ============================================================

async function fetchProjects() {
  loading.value = true
  try {
    const res = (await familyBookApi.listProjects({
      page: 1,
      pageSize: 50,
    })) as any
    projects.value = res.data || []
    projectsTotal.value = res.pagination?.total || 0
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

// ============================================================
//                  操作
// ============================================================

async function handleGeneratePreview() {
  if (!currentDraftId.value) {
    ElMessage.warning('请先选择起始人物')
    return
  }
  submitting.value = true
  try {
    await familyBookApi.updateProject(currentDraftId.value, {
      generations: form.generations,
      include_spouse: form.include_spouse,
      grouping: form.grouping,
      selected_fields: form.selected_fields,
      cover_template: form.cover_template,
      title: form.title,
      preface: form.preface,
    })
    await familyBookApi.generatePreview(currentDraftId.value)
    ElMessage.success('预览已生成，正在跳转…')
    router.push(`/user-center/family-book/preview/${currentDraftId.value}`)
  } catch (err: any) {
    ElMessage.error(err?.message || '生成预览失败')
  } finally {
    submitting.value = false
  }
}

function handleViewProject(p: FamilyBookProjectSummary) {
  if (p.status === 'preview' || p.status === 'ordered') {
    router.push(`/user-center/family-book/preview/${p.id}`)
  } else {
    router.push(`/user-center/family-book/${p.id}`)
  }
}

async function handleDelete(p: FamilyBookProjectSummary) {
  try {
    await ElMessageBox.confirm(
      `确定删除图册项目「${p.title}」吗？此操作不可恢复。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await familyBookApi.deleteProject(p.id)
    ElMessage.success('项目已删除')
    await fetchProjects()
  } catch (err: any) {
    ElMessage.error(err?.message || '删除失败')
  }
}

function handleResetDraft() {
  currentDraftId.value = null
  clearPerson()
  form.title = ''
  form.preface = ''
  estimate.value = null
}

function statusLabel(s: string) {
  return FAMILY_BOOK_STATUS_LABEL[s as keyof typeof FAMILY_BOOK_STATUS_LABEL] || s
}

function statusTag(s: string) {
  return FAMILY_BOOK_STATUS_TAG[s as keyof typeof FAMILY_BOOK_STATUS_TAG] || 'info'
}

function coverColor(template: string) {
  const opt = COVER_TEMPLATE_OPTIONS.find((o) => o.value === template)
  return opt?.preview_color || '#c0392b'
}
</script>

<template>
  <div class="family-book-page">
    <ElCard class="header-card" shadow="never">
      <div class="header">
        <div class="title-area">
          <h2 class="page-title">家庭图册</h2>
          <p class="page-desc">从某位前辈开始，生成向后若干代的家庭成员图文册</p>
        </div>
        <ElRadioGroup v-model="tab" size="default">
          <ElRadioButton label="create">新建图册</ElRadioButton>
          <ElRadioButton label="list">我的图册（{{ projectsTotal }}）</ElRadioButton>
        </ElRadioGroup>
      </div>
    </ElCard>

    <!-- ========== 新建图册 ========== -->
    <div v-show="tab === 'create'">
      <ElRow :gutter="20">
        <!-- 左侧：参数设置 -->
        <ElCol :xs="24" :md="14">
          <ElCard class="settings-card" shadow="never">
            <template #header>
              <span class="card-title">参数设置</span>
            </template>

            <!-- 起始人物 -->
            <div class="form-item">
              <label class="form-label required">起始人物</label>
              <div class="person-search-wrapper">
                <ElInput
                  v-model="searchQuery"
                  placeholder="搜索家族成员（如爷爷）"
                  clearable
                  :loading="personSearchLoading"
                  @input="searchPersons"
                  @clear="clearPerson"
                >
                  <template #prefix>
                    <ElIcon><User /></ElIcon>
                  </template>
                </ElInput>
                <div
                  v-if="showPersonDropdown && !selectedPerson"
                  class="search-dropdown"
                >
                  <div
                    v-for="p in personResults"
                    :key="p.id"
                    class="search-item"
                    @click="selectPerson(p)"
                  >
                    <span>{{ p.full_name }}</span>
                    <ElTag
                      size="small"
                      :type="p.gender === 'male' ? 'primary' : 'danger'"
                      effect="plain"
                    >
                      {{ p.gender === 'male' ? '男' : '女' }}
                    </ElTag>
                  </div>
                </div>
              </div>
              <div v-if="selectedPerson" class="selected-hint">
                已选择：<strong>{{ selectedPerson.full_name }}</strong>
              </div>
            </div>

            <!-- 向后代数 -->
            <div class="form-item">
              <label class="form-label">向后代数</label>
              <ElInputNumber
                v-model="form.generations"
                :min="1"
                :max="10"
                :step="1"
              />
              <span class="form-hint">代（最多 10 代）</span>
            </div>

            <!-- 包含配偶 -->
            <div class="form-item inline-item">
              <label class="form-label">包含配偶</label>
              <ElSwitch v-model="form.include_spouse" />
              <span class="form-hint">每代人的配偶（如祖母、儿媳等）</span>
            </div>

            <!-- 分类方式 -->
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

            <!-- 展示字段 -->
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

            <!-- 封面风格 -->
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

            <!-- 标题与前言 -->
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
              <label class="form-label">前言（可选）</label>
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
              <ElButton @click="handleResetDraft">重置</ElButton>
              <ElButton
                type="primary"
                size="large"
                :loading="submitting"
                :disabled="!canSubmit"
                @click="handleGeneratePreview"
              >
                生成预览
              </ElButton>
            </div>
          </ElCard>
        </ElCol>

        <!-- 右侧：估算预览 -->
        <ElCol :xs="24" :md="10">
          <ElCard class="preview-card" shadow="never" v-loading="estimating">
            <template #header>
              <span class="card-title">素材预览</span>
            </template>
            <div v-if="!estimate" class="empty-tip">
              <ElIcon :size="48" color="#c0c4cc"><Document /></ElIcon>
              <p>请先选择起始人物</p>
            </div>
            <div v-else class="estimate-content">
              <div class="estimate-stats">
                <div class="stat">
                  <div class="stat-value">{{ estimate.person_count }}</div>
                  <div class="stat-label">人物</div>
                </div>
                <div class="stat">
                  <div class="stat-value">{{ estimate.page_count }}</div>
                  <div class="stat-label">预计页数</div>
                </div>
                <div class="stat">
                  <div class="stat-value price">¥{{ estimate.estimated_price }}</div>
                  <div class="stat-label">预估金额</div>
                </div>
              </div>
              <ElAlert type="info" :closable="false" show-icon class="hint-alert">
                预览生成后，您可在电子杂志中翻页浏览，并继续编辑文字、替换照片或下单印刷。
              </ElAlert>
            </div>
          </ElCard>
        </ElCol>
      </ElRow>
    </div>

    <!-- ========== 我的图册 ========== -->
    <div v-show="tab === 'list'">
      <ElCard v-loading="loading" shadow="never">
        <div v-if="projects.length === 0 && !loading" class="empty-state">
          <ElEmpty description="暂无家庭图册项目">
            <ElButton type="primary" @click="tab = 'create'">立即创建</ElButton>
          </ElEmpty>
        </div>
        <div v-else class="project-grid">
          <div
            v-for="p in projects"
            :key="p.id"
            class="project-card"
            @click="handleViewProject(p)"
          >
            <div
              class="project-cover"
              :style="{ background: coverColor(p.cover_template) }"
            >
              <div class="cover-title">{{ p.title }}</div>
              <div class="cover-meta">{{ p.start_person.full_name }}</div>
            </div>
            <div class="project-body">
              <div class="project-tags">
                <ElTag size="small" :type="statusTag(p.status) as any">
                  {{ statusLabel(p.status) }}
                </ElTag>
                <ElTag size="small" type="info" effect="plain">
                  {{ p.generations }} 代
                </ElTag>
                <ElTag size="small" type="info" effect="plain">
                  {{ p.page_count }} 页
                </ElTag>
              </div>
              <div class="project-stats">
                <span>收录 {{ p.person_count }} 人</span>
                <span class="price">¥{{ p.estimated_price }}</span>
              </div>
              <div class="project-date">
                {{ new Date(p.created_at).toLocaleDateString() }}
              </div>
              <div class="project-actions">
                <ElButton
                  size="small"
                  type="danger"
                  plain
                  @click.stop="handleDelete(p)"
                >
                  删除
                </ElButton>
              </div>
            </div>
          </div>
        </div>
      </ElCard>
    </div>
  </div>
</template>

<style scoped>
.family-book-page {
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
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.title-area .page-title {
  margin: 0;
  font-size: 22px;
}

.title-area .page-desc {
  margin: 4px 0 0;
  color: #909399;
  font-size: 13px;
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

.form-label.required::before {
  content: '*';
  color: #f56c6c;
  margin-right: 4px;
}

.form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}

.person-search-wrapper {
  position: relative;
}

.search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
  max-height: 240px;
  overflow-y: auto;
}

.search-item {
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background 0.2s;
}

.search-item:hover {
  background: #f5f7fa;
}

.selected-hint {
  margin-top: 6px;
  font-size: 13px;
  color: #67c23a;
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
  transition: all 0.3s;
  background: #fff;
}

.cover-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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

.cover-text {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.cover-label {
  font-size: 12px;
  color: #303133;
  margin-top: 6px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.preview-card {
  min-height: 300px;
}

.empty-tip {
  text-align: center;
  padding: 60px 0;
  color: #909399;
}

.estimate-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.estimate-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stat {
  text-align: center;
  padding: 16px 0;
  background: #f8f9fa;
  border-radius: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #5d4037;
}

.stat-value.price {
  color: #f56c6c;
}

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.hint-alert {
  font-size: 12px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.project-card {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
}

.project-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(93, 64, 55, 0.12);
}

.project-cover {
  height: 120px;
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-family: 'KaiTi', serif;
}

.cover-title {
  font-size: 18px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.cover-meta {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.85;
}

.project-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.project-stats {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #606266;
}

.project-stats .price {
  color: #f56c6c;
  font-weight: 600;
}

.project-date {
  font-size: 12px;
  color: #c0c4cc;
}

.project-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.empty-state {
  padding: 40px 0;
}

@media (max-width: 768px) {
  .estimate-stats {
    grid-template-columns: 1fr;
  }
}
</style>
