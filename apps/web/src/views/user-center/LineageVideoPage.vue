<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import lineageVideoApi, {
  type LineageVideoProject,
  type LineagePreviewResult,
  type MonthlyUsage,
} from '@/api/lineageVideo'

const router = useRouter()
const route = useRoute()

// 状态
const loading = ref(false)
const submitting = ref(false)
const loadingPreview = ref(false)
const personSearchLoading = ref(false)

// 选中的中心人物
const selectedPerson = ref<any>(null)

// 人物搜索
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const showSearchDropdown = ref(false)

// 素材预览
const preview = ref<LineagePreviewResult | null>(null)

// 月度用量
const monthlyUsage = ref<MonthlyUsage>({ used: 0, limit: 2, remaining: 2 })

// 已有项目列表
const projects = ref<LineageVideoProject[]>([])

// 参数表单
const form = reactive<{
  direction: 'paternal' | 'maternal' | 'both';
  up_generations: number;
  down_generations: number;
  include_spouse: boolean;
  style: 'nostalgic' | 'bw复古' | 'modern';
}>({
  direction: 'paternal',
  up_generations: 5,
  down_generations: 3,
  include_spouse: true,
  style: 'nostalgic',
})

// 方向选项
const directionOptions = [
  { value: 'paternal', label: '父系', desc: '仅父亲血脉' },
  { value: 'maternal', label: '母系', desc: '仅母亲血脉' },
  { value: 'both', label: '双系', desc: '父母双方合并' },
]

// 风格选项
const styleOptions = [
  { value: 'nostalgic', label: '温馨怀旧（泛黄滤镜）' },
  { value: 'bw复古', label: '黑白复古' },
  { value: 'modern', label: '现代明亮' },
]

// 计算属性
const estimatedDuration = computed(() => {
  if (!preview.value) return 0
  const seconds = preview.value.estimated_duration_seconds
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
})

const canCreate = computed(() => {
  return selectedPerson.value && preview.value && preview.value.media_count > 0
})

// 初始化
onMounted(async () => {
  await fetchMonthlyUsage()
  await fetchProjects()
  // 预加载家族成员
  await loadInitialPersons()

  // 处理从TreePage传来的personId参数
  const queryPersonId = route.query.personId as string
  if (queryPersonId && searchResults.value.length > 0) {
    const person = searchResults.value.find((p: any) => String(p.id) === queryPersonId)
    if (person) {
      await selectPerson(person)
    }
  }
})

// 加载初始人物列表
async function loadInitialPersons() {
  try {
    const list = await lineageVideoApi.searchPersons('', 30) as any
    searchResults.value = list || []
    showSearchDropdown.value = false
  } catch {
    searchResults.value = []
  }
}

// 监听参数变化重新预览
watch(
  () => [form.direction, form.up_generations, form.down_generations, form.include_spouse],
  () => {
    if (selectedPerson.value) {
      loadPreview()
    }
  },
)

// 搜索人物
async function searchPersons(query: string) {
  try {
    const list = await lineageVideoApi.searchPersons(query, 30) as any
    searchResults.value = list || []
    showSearchDropdown.value = searchResults.value.length > 0
  } catch {
    searchResults.value = []
  }
}

// 选择人物
async function selectPerson(person: any) {
  selectedPerson.value = person
  searchQuery.value = person.full_name
  showSearchDropdown.value = false
  await loadPreview()
}

// 加载素材预览
async function loadPreview() {
  if (!selectedPerson.value) return

  loadingPreview.value = true
  try {
    preview.value = await lineageVideoApi.previewMaterials({
      centerPersonId: selectedPerson.value.id,
      direction: form.direction,
      upGenerations: form.up_generations,
      downGenerations: form.down_generations,
      includeSpouse: form.include_spouse,
    }) as any
  } catch (err: any) {
    console.error('加载预览失败:', err)
    preview.value = null
  } finally {
    loadingPreview.value = false
  }
}

// 获取月度用量
async function fetchMonthlyUsage() {
  try {
    monthlyUsage.value = await lineageVideoApi.getMonthlyUsage() as any
  } catch {
    // 忽略
  }
}

// 获取项目列表
async function fetchProjects() {
  loading.value = true
  try {
    const res = await lineageVideoApi.listProjects({ page: 1, pageSize: 20 }) as any
    projects.value = res.data || []
  } catch {
    projects.value = []
  } finally {
    loading.value = false
  }
}

// 创建项目（免费排队）
async function handleCreate() {
  if (!canCreate.value) return

  try {
    await ElMessageBox.confirm(
      `确认生成直系血缘视频？\n\n中心人物：${selectedPerson.value.full_name}\n方向：${directionOptions.find(d => d.value === form.direction)?.label}\n向上${form.up_generations}代，向下${form.down_generations}代\n素材：${preview.value?.person_count}人，${preview.value?.media_count}张媒体\n预计时长：${estimatedDuration.value}`,
      '确认生成',
      { confirmButtonText: '确认生成', cancelButtonText: '取消', type: 'info' },
    )
  } catch {
    return
  }

  submitting.value = true
  try {
    const res = await lineageVideoApi.createProject({
      center_person_id: Number(selectedPerson.value.id),
      direction: form.direction,
      up_generations: form.up_generations,
      down_generations: form.down_generations,
      include_spouse: form.include_spouse,
      style: form.style,
      use_priority: false,
    }) as any

    ElMessage.success('生成任务已创建，正在排队中...')
    await fetchProjects()
    await fetchMonthlyUsage()

    if (res.id) {
      router.push(`/user-center/lineage-video/${res.id}`)
    }
  } catch (err: any) {
    ElMessage.error(err.message || '创建失败')
  } finally {
    submitting.value = false
  }
}

// 创建项目（付费优先）
async function handleCreatePriority() {
  if (!canCreate.value) return

  try {
    await ElMessageBox.confirm(
      `付费优先生成 ¥9.9，立即处理无需排队\n\n中心人物：${selectedPerson.value.full_name}\n方向：${directionOptions.find(d => d.value === form.direction)?.label}`,
      '付费优先生成',
      { confirmButtonText: '确认支付 ¥9.9', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }

  submitting.value = true
  try {
    const res = await lineageVideoApi.createProject({
      center_person_id: Number(selectedPerson.value.id),
      direction: form.direction,
      up_generations: form.up_generations,
      down_generations: form.down_generations,
      include_spouse: form.include_spouse,
      style: form.style,
      use_priority: true,
    }) as any

    ElMessage.success('付费项目已创建，正在优先处理...')
    await fetchProjects()

    if (res.id) {
      router.push(`/user-center/lineage-video/${res.id}`)
    }
  } catch (err: any) {
    ElMessage.error(err.message || '创建失败')
  } finally {
    submitting.value = false
  }
}

// 状态标签
function statusTagType(status: string) {
  switch (status) {
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'processing': return 'warning'
    default: return 'info'
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'queued': return '排队中'
    case 'processing': return '生成中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    default: return '未知'
  }
}

function directionLabel(dir: string) {
  switch (dir) {
    case 'paternal': return '父系'
    case 'maternal': return '母系'
    case 'both': return '双系'
    default: return dir
  }
}

// 查看详情
function viewDetail(project: LineageVideoProject) {
  router.push(`/user-center/lineage-video/${project.id}`)
}

// 关闭搜索
function handleOutsideClick() {
  showSearchDropdown.value = false
}
</script>

<template>
  <div class="lineage-video-page">
    <h2 class="page-title">直系血缘视频生成</h2>
    <p class="page-desc">以自己为中心，追溯直系血脉，生成一段专属的血脉传承视频</p>

    <ElRow :gutter="24">
      <!-- 左侧：参数设置 -->
      <ElCol :xs="24" :md="14">
        <ElCard class="settings-card">
          <template #header>
            <span class="card-title">参数设置</span>
          </template>

          <!-- 中心人物选择 -->
          <div class="form-item">
            <label class="form-label">中心人物</label>
            <div class="person-search-wrapper" v-click-outside="handleOutsideClick">
              <ElInput
                v-model="searchQuery"
                placeholder="搜索家族成员..."
                @input="searchPersons"
                :loading="personSearchLoading"
                clearable
              >
                <template #prefix>
                  <ElIcon><User /></ElIcon>
                </template>
              </ElInput>
              <div v-if="showSearchDropdown" class="search-dropdown">
                <div
                  v-for="person in searchResults"
                  :key="person.id"
                  class="search-item"
                  @click="selectPerson(person)"
                >
                  <span class="person-name">{{ person.full_name }}</span>
                  <span class="person-gender" :class="person.gender">
                    {{ person.gender === 'male' ? '男' : '女' }}
                  </span>
                </div>
              </div>
            </div>
            <div v-if="selectedPerson" class="selected-person">
              已选择：<strong>{{ selectedPerson.full_name }}</strong>
            </div>
          </div>

          <!-- 追溯方向 -->
          <div class="form-item">
            <label class="form-label">追溯方向</label>
            <ElRadioGroup v-model="form.direction">
              <ElRadioButton
                v-for="opt in directionOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
                <span class="radio-desc">{{ opt.desc }}</span>
              </ElRadioButton>
            </ElRadioGroup>
          </div>

          <!-- 代数设置 -->
          <div class="form-item generation-row">
            <div class="gen-item">
              <label class="form-label">向上追溯（祖先）</label>
              <ElInputNumber
                v-model="form.up_generations"
                :min="1"
                :max="20"
                :step="1"
              />
              <span class="gen-hint">代</span>
            </div>
            <div class="gen-item">
              <label class="form-label">向下延展（后代）</label>
              <ElInputNumber
                v-model="form.down_generations"
                :min="0"
                :max="10"
                :step="1"
              />
              <span class="gen-hint">代（0=不含后代）</span>
            </div>
          </div>

          <!-- 包含配偶 -->
          <div class="form-item inline-item">
            <label class="form-label">包含直系配偶</label>
            <ElSwitch v-model="form.include_spouse" />
            <span class="form-hint">如曾祖母、儿媳等</span>
          </div>

          <!-- 风格 -->
          <div class="form-item">
            <label class="form-label">视频风格</label>
            <ElSelect v-model="form.style" style="width: 240px">
              <ElOption
                v-for="s in styleOptions"
                :key="s.value"
                :value="s.value"
                :label="s.label"
              />
            </ElSelect>
          </div>

          <!-- 素材预览 -->
          <div v-if="preview" class="preview-section" v-loading="loadingPreview">
            <ElDivider />
            <h4 class="preview-title">素材预览</h4>
            <div class="preview-stats">
              <div class="stat">
                <span class="stat-value">{{ preview.person_count }}</span>
                <span class="stat-label">人物</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ preview.media_count }}</span>
                <span class="stat-label">照片/视频</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ estimatedDuration }}</span>
                <span class="stat-label">预计时长</span>
              </div>
            </div>
            <!-- 人物列表 -->
            <div class="person-list" v-if="preview.persons.length > 0">
              <ElTag
                v-for="p in preview.persons"
                :key="p.id"
                size="small"
                :type="p.generation === 0 ? 'primary' : p.generation < 0 ? 'info' : 'success'"
                class="person-tag"
              >
                {{ p.full_name }}（{{ p.relationship }}）
              </ElTag>
            </div>
          </div>

          <!-- 操作按钮 -->
          <ElDivider />
          <div class="actions">
            <div class="usage-hint">
              <ElIcon><InfoFilled /></ElIcon>
              本月已生成 {{ monthlyUsage.used }}/{{ monthlyUsage.limit }} 条，
              剩余 {{ monthlyUsage.remaining }} 条免费额度
            </div>
            <div class="action-buttons">
              <ElButton
                type="primary"
                size="large"
                :loading="submitting"
                :disabled="!canCreate"
                @click="handleCreate"
              >
                生成视频（排队）
              </ElButton>
              <ElButton
                type="warning"
                size="large"
                :loading="submitting"
                :disabled="!canCreate"
                @click="handleCreatePriority"
              >
                付费优先生成 ¥9.9
              </ElButton>
            </div>
          </div>
        </ElCard>
      </ElCol>

      <!-- 右侧：已有项目 -->
      <ElCol :xs="24" :md="10">
        <ElCard class="projects-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">我的直系血缘视频</span>
              <ElButton text type="primary" @click="fetchProjects">刷新</ElButton>
            </div>
          </template>

          <div v-if="projects.length === 0 && !loading" class="empty-state">
            <ElEmpty description="暂无直系血缘视频项目" :image-size="80" />
          </div>

          <div v-else class="project-list" v-loading="loading">
            <div
              v-for="project in projects"
              :key="project.id"
              class="project-item"
              @click="viewDetail(project)"
            >
              <div class="project-info">
                <div class="project-title">
                  {{ project.center_person.full_name }} 的血脉视频
                </div>
                <div class="project-meta">
                  <ElTag size="small" :type="statusTagType(project.status)">
                    {{ statusLabel(project.status) }}
                  </ElTag>
                  <span class="meta-text">{{ directionLabel(project.direction) }}</span>
                  <span class="meta-text">上{{ project.up_generations }}代 / 下{{ project.down_generations }}代</span>
                </div>
                <div class="project-date">
                  {{ new Date(project.created_at).toLocaleDateString() }}
                </div>
              </div>
              <ElIcon class="arrow-icon"><ArrowRight /></ElIcon>
            </div>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>
  </div>
</template>

<style scoped>
.lineage-video-page {
  padding: 0;
}

.page-title {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 8px;
}

.page-desc {
  color: #909399;
  margin: 0 0 24px;
  font-size: 14px;
}

.settings-card,
.projects-card {
  margin-bottom: 24px;
}

.card-title {
  font-weight: 600;
  font-size: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  font-size: 12px;
  color: #909399;
  margin-left: 8px;
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
  max-height: 200px;
  overflow-y: auto;
}

.search-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-item:hover {
  background: #f5f7fa;
}

.person-name {
  font-size: 14px;
}

.person-gender {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 2px;
}

.person-gender.male {
  color: #409eff;
  background: #ecf5ff;
}

.person-gender.female {
  color: #f56c6c;
  background: #fef0f0;
}

.selected-person {
  margin-top: 6px;
  font-size: 13px;
  color: #67c23a;
}

.radio-desc {
  font-size: 11px;
  color: #909399;
  margin-left: 4px;
}

.generation-row {
  display: flex;
  gap: 24px;
}

.gen-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gen-item .form-label {
  margin-bottom: 0;
  white-space: nowrap;
}

.gen-hint {
  font-size: 12px;
  color: #909399;
}

.inline-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.inline-item .form-label {
  margin-bottom: 0;
}

.preview-section {
  padding: 0;
}

.preview-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
}

.preview-stats {
  display: flex;
  gap: 32px;
  margin-bottom: 16px;
}

.stat {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #409eff;
}

.stat-label {
  font-size: 12px;
  color: #909399;
}

.person-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.person-tag {
  margin: 0;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.usage-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #909399;
}

.action-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

/* 项目列表 */
.project-list {
  display: flex;
  flex-direction: column;
}

.project-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background 0.2s;
}

.project-item:last-child {
  border-bottom: none;
}

.project-item:hover {
  background: #f5f7fa;
}

.project-title {
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 4px;
}

.project-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 2px;
}

.meta-text {
  font-size: 12px;
  color: #909399;
}

.project-date {
  font-size: 12px;
  color: #c0c4cc;
}

.arrow-icon {
  color: #c0c4cc;
}

.empty-state {
  padding: 20px 0;
}
</style>
