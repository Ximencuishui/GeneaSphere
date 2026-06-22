<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import familyBookApi, {
  COVER_TEMPLATE_OPTIONS,
} from '@/api/familyBook'
import type {
  FamilyBookProject,
  FamilyBookPage,
  PlaceFamilyBookOrderDto,
} from '@/api/familyBook'

const router = useRouter()
const route = useRoute()

const projectId = computed(() => String(route.params.id || ''))

const loading = ref(false)
const submitting = ref(false)
const project = ref<FamilyBookProject | null>(null)
const currentPageIndex = ref(0)
const fullscreen = ref(false)

// 编辑弹窗
const editDialogVisible = ref(false)
const editingPage = ref<FamilyBookPage | null>(null)
const editingBody = ref('')
const editingTitle = ref('')
const editingSubtitle = ref('')
const editSaving = ref(false)

// 下单弹窗
const orderDialogVisible = ref(false)
const orderForm = reactive<PlaceFamilyBookOrderDto>({
  specification: 'A4 精装',
  quantity: 1,
  shipping_address: undefined,
})

onMounted(async () => {
  await fetchProject()
  // 绑定键盘翻页
  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

async function fetchProject() {
  loading.value = true
  try {
    project.value = (await familyBookApi.getProject(projectId.value)) as any
    if (!project.value || !project.value.pages || project.value.pages.length === 0) {
      ElMessage.warning('该项目暂无内容，请先生成预览')
    }
  } catch (err: any) {
    ElMessage.error(err?.message || '加载项目失败')
  } finally {
    loading.value = false
  }
}

const pages = computed(() => project.value?.pages || [])
const currentPage = computed(() => pages.value[currentPageIndex.value])
const totalPages = computed(() => pages.value.length)
const isFirst = computed(() => currentPageIndex.value === 0)
const isLast = computed(() => currentPageIndex.value === totalPages.value - 1)

function nextPage() {
  if (!isLast.value) currentPageIndex.value++
}

function prevPage() {
  if (!isFirst.value) currentPageIndex.value--
}

function handleKeyDown(e: KeyboardEvent) {
  if (editDialogVisible.value || orderDialogVisible.value) return
  if (e.key === 'ArrowRight') nextPage()
  else if (e.key === 'ArrowLeft') prevPage()
  else if (e.key === 'Escape' && fullscreen.value) {
    fullscreen.value = false
  }
}

// 跳转到详情页编辑设置
function handleEditSettings() {
  router.push(`/user-center/family-book/${projectId.value}`)
}

function handleRegenerate() {
  if (!project.value) return
  ElMessageBox.confirm(
    '重新生成将覆盖现有页面内容（已编辑的文本会丢失），是否继续？',
    '重新生成',
    { confirmButtonText: '继续', cancelButtonText: '取消', type: 'warning' },
  )
    .then(async () => {
      submitting.value = true
      try {
        await familyBookApi.generatePreview(projectId.value)
        ElMessage.success('已重新生成')
        await fetchProject()
        currentPageIndex.value = 0
      } catch (err: any) {
        ElMessage.error(err?.message || '生成失败')
      } finally {
        submitting.value = false
      }
    })
    .catch(() => {})
}

// 内联编辑：点击页面文本进入编辑
function openEditDialog() {
  if (!currentPage.value) return
  if (currentPage.value.page_type === 'cover' || currentPage.value.page_type === 'toc') {
    ElMessage.info('该页面内容由系统自动生成，请到详情页修改标题或前言')
    return
  }
  editingPage.value = currentPage.value
  editingTitle.value = currentPage.value.title || ''
  editingSubtitle.value = currentPage.value.subtitle || ''
  editingBody.value = currentPage.value.body || ''
  editDialogVisible.value = true
}

async function saveEdit() {
  if (!editingPage.value) return
  editSaving.value = true
  try {
    await familyBookApi.updatePage(projectId.value, editingPage.value.id, {
      title: editingTitle.value,
      subtitle: editingSubtitle.value,
      body: editingBody.value,
    })
    ElMessage.success('已保存')
    editDialogVisible.value = false
    await fetchProject()
  } catch (err: any) {
    ElMessage.error(err?.message || '保存失败')
  } finally {
    editSaving.value = false
  }
}

// 下单印刷
function openOrderDialog() {
  if (!project.value) return
  if (project.value.status === 'ordered') {
    ElMessage.info('该项目已下单印刷')
    return
  }
  orderDialogVisible.value = true
}

async function submitOrder() {
  submitting.value = true
  try {
    const res = (await familyBookApi.placeOrder(projectId.value, {
      specification: orderForm.specification,
      quantity: orderForm.quantity,
      shipping_address: orderForm.shipping_address,
    })) as any
    ElMessage.success(
      `下单成功！订单号 ${res.print_order_id}，金额 ¥${res.amount}`,
    )
    orderDialogVisible.value = false
    await fetchProject()
  } catch (err: any) {
    ElMessage.error(err?.message || '下单失败')
  } finally {
    submitting.value = false
  }
}

// 辅助：根据封面模板获取颜色
function coverBg(template?: string) {
  const opt = COVER_TEMPLATE_OPTIONS.find((o) => o.value === template)
  return opt?.preview_color || '#c0392b'
}

// 切换全屏
function toggleFullscreen() {
  fullscreen.value = !fullscreen.value
}

// 返回
function goBack() {
  router.push('/user-center/family-book')
}

watch(currentPageIndex, () => {
  // 翻页重置滚动
  if (pageRef.value) {
    pageRef.value.scrollTop = 0
  }
})

const pageRef = ref<HTMLElement | null>(null)
</script>

<template>
  <div
    class="family-book-preview"
    :class="{ fullscreen: fullscreen }"
    v-loading="loading"
  >
    <!-- 顶部工具栏 -->
    <div v-if="!fullscreen" class="top-bar">
      <div class="left">
        <ElButton icon="ArrowLeft" @click="goBack">返回</ElButton>
        <h2 class="page-title">{{ project?.title }}</h2>
        <ElTag
          v-if="project"
          :type="project.status === 'ordered' ? 'warning' : project.status === 'preview' ? 'success' : 'info'"
          size="small"
        >
          {{
            project.status === 'ordered'
              ? '已下单'
              : project.status === 'preview'
                ? '已生成预览'
                : '草稿'
          }}
        </ElTag>
      </div>
      <div class="right">
        <ElButton @click="handleEditSettings">编辑设置</ElButton>
        <ElButton
          v-if="project?.status !== 'ordered'"
          type="warning"
          plain
          @click="handleRegenerate"
          :loading="submitting"
        >
          重新生成
        </ElButton>
        <ElButton
          v-if="project?.status !== 'ordered'"
          type="primary"
          @click="openOrderDialog"
        >
          下单印刷
        </ElButton>
      </div>
    </div>

    <!-- 电子杂志舞台 -->
    <div class="stage" :style="{ background: coverBg(project?.cover_template) + '15' }">
      <div class="book-frame">
        <transition name="page-flip" mode="out-in">
          <div
            v-if="currentPage"
            :key="currentPage.id"
            class="page"
            ref="pageRef"
          >
            <!-- 封面页 -->
            <div
              v-if="currentPage.page_type === 'cover'"
              class="page-cover"
              :style="{ background: coverBg(currentPage.content?.template) }"
            >
              <div class="cover-deco">家</div>
              <div class="cover-title">{{ currentPage.title }}</div>
              <div class="cover-subtitle">
                {{ currentPage.subtitle || '家庭纪念册' }}
              </div>
              <div class="cover-meta">
                <span v-if="currentPage.content?.start_person_name">
                  {{ currentPage.content.start_person_name }}
                </span>
                <span> · {{ currentPage.content?.generations }} 代同堂</span>
                <span v-if="currentPage.content?.person_count">
                  · 共 {{ currentPage.content.person_count }} 人
                </span>
              </div>
              <div v-if="currentPage.body" class="cover-preface">
                {{ currentPage.body }}
              </div>
              <div class="cover-footer">
                {{ new Date(currentPage.content?.created_at || Date.now()).toLocaleDateString() }}
              </div>
            </div>

            <!-- 目录页 -->
            <div v-else-if="currentPage.page_type === 'toc'" class="page-toc">
              <div class="page-header">{{ currentPage.title }}</div>
              <div class="toc-list">
                <div
                  v-for="(section, idx) in currentPage.content?.sections || []"
                  :key="idx"
                  class="toc-item"
                >
                  <span class="toc-index">{{ section.index }}.</span>
                  <span class="toc-title">{{ section.title }}</span>
                  <span class="toc-dots"></span>
                  <span class="toc-count">{{ section.member_count }} 人</span>
                </div>
              </div>
              <div class="toc-footer">
                共 {{ currentPage.content?.total_pages || totalPages }} 页
              </div>
            </div>

            <!-- 章节扉页 -->
            <div v-else-if="currentPage.page_type === 'section'" class="page-section">
              <div class="section-deco">第 {{ currentPage.content?.generation + 1 }} 代</div>
              <div class="section-title">{{ currentPage.title }}</div>
              <div class="section-subtitle">{{ currentPage.subtitle }}</div>
              <div class="section-meta">
                <span v-if="currentPage.content?.branch">
                  支系：{{ currentPage.content.branch }}
                </span>
                <span> · {{ currentPage.content?.member_count || 0 }} 人</span>
              </div>
            </div>

            <!-- 人物页 -->
            <div v-else-if="currentPage.page_type === 'person'" class="page-person">
              <div class="person-photo-wrap">
                <ElImage
                  v-if="currentPage.content?.photo_url"
                  :src="currentPage.content.photo_url"
                  fit="cover"
                  class="person-photo"
                />
                <div v-else class="person-photo placeholder">
                  <ElIcon :size="60" color="#fff"><UserFilled /></ElIcon>
                </div>
              </div>
              <div class="person-info">
                <div class="person-name">
                  {{ currentPage.title }}
                  <ElTag
                    v-if="currentPage.content?.is_spouse"
                    size="small"
                    type="warning"
                    effect="plain"
                    class="spouse-tag"
                  >
                    配偶
                  </ElTag>
                </div>
                <div v-if="currentPage.subtitle" class="person-subtitle">
                  {{ currentPage.subtitle }}
                </div>
                <div class="person-fields">
                  <div
                    v-if="currentPage.content?.birth_year"
                    class="field-row"
                  >
                    <span class="field-label">生年</span>
                    <span class="field-value">{{ currentPage.content.birth_year }}</span>
                  </div>
                  <div
                    v-if="currentPage.content?.death_year"
                    class="field-row"
                  >
                    <span class="field-label">卒年</span>
                    <span class="field-value">{{ currentPage.content.death_year }}</span>
                  </div>
                  <div
                    v-if="currentPage.content?.birth_place"
                    class="field-row"
                  >
                    <span class="field-label">出生地</span>
                    <span class="field-value">{{ currentPage.content.birth_place }}</span>
                  </div>
                  <div
                    v-if="currentPage.content?.occupation"
                    class="field-row"
                  >
                    <span class="field-label">职业</span>
                    <span class="field-value">{{ currentPage.content.occupation }}</span>
                  </div>
                  <div
                    v-if="currentPage.content?.residence"
                    class="field-row"
                  >
                    <span class="field-label">住址</span>
                    <span class="field-value">{{ currentPage.content.residence }}</span>
                  </div>
                  <div
                    v-if="currentPage.content?.bio"
                    class="field-row bio"
                  >
                    <span class="field-label">简介</span>
                    <span class="field-value">{{ currentPage.content.bio }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 后记页 -->
            <div v-else-if="currentPage.page_type === 'epilogue'" class="page-epilogue">
              <div class="epilogue-title">{{ currentPage.title }}</div>
              <div class="epilogue-subtitle">{{ currentPage.subtitle }}</div>
              <div class="epilogue-body">{{ currentPage.body }}</div>
              <div class="epilogue-meta">
                <span>共收录 {{ currentPage.content?.total_persons }} 位家人</span>
                <span> · 跨越 {{ currentPage.content?.total_groups }} 个家庭组</span>
              </div>
              <div class="epilogue-footer">— 谨以此册，献给家族 —</div>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- 底部工具栏 -->
    <div v-if="!fullscreen" class="bottom-bar">
      <div class="nav-buttons">
        <ElButton :disabled="isFirst" @click="prevPage" icon="ArrowLeft">
          上一页
        </ElButton>
        <span class="page-indicator">
          第 {{ currentPageIndex + 1 }} / {{ totalPages }} 页
        </span>
        <ElButton :disabled="isLast" @click="nextPage">
          下一页<i class="el-icon--right"><ArrowRight /></i>
        </ElButton>
      </div>
      <div class="extra-buttons">
        <ElButton
          v-if="currentPage && currentPage.page_type !== 'cover' && currentPage.page_type !== 'toc'"
          size="small"
          @click="openEditDialog"
        >
          <ElIcon><EditPen /></ElIcon>
          编辑文字
        </ElButton>
        <ElButton size="small" @click="toggleFullscreen">
          <ElIcon><FullScreen /></ElIcon>
          全屏
        </ElButton>
      </div>
    </div>

    <!-- 全屏模式下的浮动控制 -->
    <div v-if="fullscreen" class="floating-controls">
      <ElButton circle @click="prevPage" :disabled="isFirst">
        <ElIcon><ArrowLeft /></ElIcon>
      </ElButton>
      <div class="page-info">
        {{ currentPageIndex + 1 }} / {{ totalPages }}
      </div>
      <ElButton circle @click="nextPage" :disabled="isLast">
        <ElIcon><ArrowRight /></ElIcon>
      </ElButton>
      <ElButton circle @click="toggleFullscreen">
        <ElIcon><Close /></ElIcon>
      </ElButton>
    </div>

    <!-- 编辑页面弹窗 -->
    <ElDialog
      v-model="editDialogVisible"
      title="编辑页面内容"
      width="600px"
      destroy-on-close
    >
      <div v-if="editingPage" class="edit-form">
        <div class="form-row">
          <label>页面类型</label>
          <ElTag size="small">{{ editingPage.page_type }}</ElTag>
        </div>
        <div class="form-row">
          <label>标题</label>
          <ElInput v-model="editingTitle" maxlength="100" show-word-limit />
        </div>
        <div class="form-row">
          <label>副标题</label>
          <ElInput v-model="editingSubtitle" maxlength="100" show-word-limit />
        </div>
        <div class="form-row">
          <label>正文</label>
          <ElInput
            v-model="editingBody"
            type="textarea"
            :rows="6"
            maxlength="2000"
            show-word-limit
          />
        </div>
      </div>
      <template #footer>
        <ElButton @click="editDialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="editSaving" @click="saveEdit">
          保存
        </ElButton>
      </template>
    </ElDialog>

    <!-- 下单弹窗 -->
    <ElDialog
      v-model="orderDialogVisible"
      title="下单印刷"
      width="500px"
      destroy-on-close
    >
      <ElForm label-width="100px" v-if="project">
        <ElFormItem label="图册标题">
          <span>{{ project.title }}</span>
        </ElFormItem>
        <ElFormItem label="页数">
          <span>{{ project.page_count }} 页</span>
        </ElFormItem>
        <ElFormItem label="份数">
          <ElInputNumber v-model="orderForm.quantity" :min="1" :max="100" />
        </ElFormItem>
        <ElFormItem label="规格">
          <ElInput v-model="orderForm.specification" maxlength="50" />
        </ElFormItem>
        <ElFormItem label="预估金额">
          <span class="price">
            ¥{{ ((project.estimated_price || 0) * (orderForm.quantity || 1)).toFixed(2) }}
          </span>
        </ElFormItem>
      </ElForm>
      <ElAlert
        type="info"
        :closable="false"
        show-icon
        style="margin-top: 8px"
      >
        此为模拟下单流程。订单将进入待支付状态，可在「我的订单」中跟踪进度。
      </ElAlert>
      <template #footer>
        <ElButton @click="orderDialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitOrder">
          确认下单
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.family-book-preview {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
}

.family-book-preview.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #1a1a1a;
  max-width: none;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.top-bar .left,
.top-bar .right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.stage {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f5f5f5;
  border-radius: 12px;
  padding: 30px;
  min-height: 600px;
  transition: all 0.3s;
}

.fullscreen .stage {
  height: calc(100vh - 80px);
  background: #1a1a1a;
  border-radius: 0;
  padding: 40px;
}

.book-frame {
  width: 600px;
  max-width: 100%;
  aspect-ratio: 3 / 4;
  background: #fff;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}

.fullscreen .book-frame {
  width: 720px;
  aspect-ratio: 3 / 4;
}

.page {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.page::-webkit-scrollbar {
  width: 4px;
}
.page::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

/* ============ 封面页 ============ */
.page-cover {
  width: 100%;
  height: 100%;
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 40px;
  text-align: center;
  font-family: 'KaiTi', 'STKaiti', serif;
  position: relative;
}

.cover-deco {
  font-size: 64px;
  font-weight: 700;
  opacity: 0.3;
  margin-bottom: 20px;
  letter-spacing: 16px;
}

.cover-title {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 14px;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.cover-subtitle {
  font-size: 16px;
  opacity: 0.85;
  letter-spacing: 4px;
  margin-bottom: 24px;
}

.cover-meta {
  font-size: 13px;
  opacity: 0.8;
  margin-bottom: 24px;
}

.cover-preface {
  max-width: 80%;
  font-size: 13px;
  line-height: 1.8;
  opacity: 0.85;
  margin-bottom: 24px;
  white-space: pre-wrap;
}

.cover-footer {
  position: absolute;
  bottom: 24px;
  font-size: 12px;
  opacity: 0.7;
}

/* ============ 目录页 ============ */
.page-toc {
  padding: 50px 40px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 32px;
  font-family: 'KaiTi', serif;
  color: #303133;
}

.toc-list {
  flex: 1;
}

.toc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px dashed #dcdfe6;
  font-size: 14px;
}

.toc-index {
  font-weight: 600;
  color: #5d4037;
  width: 32px;
}

.toc-title {
  flex: 1;
  color: #303133;
}

.toc-dots {
  flex: 1;
  border-bottom: 1px dotted #c0c4cc;
  margin: 0 8px;
  height: 1px;
}

.toc-count {
  font-size: 12px;
  color: #909399;
}

.toc-footer {
  text-align: center;
  font-size: 12px;
  color: #909399;
  margin-top: 16px;
}

/* ============ 章节扉页 ============ */
.page-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 40px;
  background: linear-gradient(135deg, #fdf6ec 0%, #fff 100%);
}

.section-deco {
  font-size: 14px;
  color: #b8860b;
  letter-spacing: 4px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 36px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 16px;
  font-family: 'KaiTi', serif;
}

.section-subtitle {
  font-size: 16px;
  color: #606266;
  margin-bottom: 24px;
}

.section-meta {
  font-size: 13px;
  color: #909399;
}

/* ============ 人物页 ============ */
.page-person {
  padding: 32px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.person-photo-wrap {
  width: 100%;
  height: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #faf8f5, #fff);
  border-radius: 8px;
  overflow: hidden;
}

.person-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.person-photo.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #5d4037, #8d6e63);
}

.person-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.person-name {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'KaiTi', serif;
}

.spouse-tag {
  font-size: 11px;
}

.person-subtitle {
  font-size: 13px;
  color: #909399;
}

.person-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #faf8f5;
  padding: 16px;
  border-radius: 6px;
}

.field-row {
  display: flex;
  gap: 12px;
  font-size: 13px;
}

.field-row.bio {
  flex-direction: column;
  gap: 4px;
}

.field-label {
  color: #909399;
  min-width: 60px;
}

.field-value {
  color: #303133;
  line-height: 1.6;
}

/* ============ 后记 ============ */
.page-epilogue {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 40px;
  background: linear-gradient(135deg, #faf8f5 0%, #fff 100%);
  font-family: 'KaiTi', serif;
}

.epilogue-title {
  font-size: 32px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 12px;
}

.epilogue-subtitle {
  font-size: 14px;
  color: #909399;
  letter-spacing: 4px;
  margin-bottom: 24px;
}

.epilogue-body {
  max-width: 80%;
  font-size: 14px;
  line-height: 2;
  color: #606266;
  white-space: pre-wrap;
  margin-bottom: 24px;
}

.epilogue-meta {
  font-size: 13px;
  color: #909399;
  margin-bottom: 32px;
}

.epilogue-footer {
  font-size: 13px;
  color: #b8860b;
  letter-spacing: 4px;
}

/* ============ 底部导航 ============ */
.bottom-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.nav-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-indicator {
  font-size: 14px;
  color: #606266;
  font-weight: 600;
}

.extra-buttons {
  display: flex;
  gap: 8px;
}

/* ============ 全屏浮动控制 ============ */
.floating-controls {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  align-items: center;
  background: rgba(0, 0, 0, 0.7);
  padding: 8px 16px;
  border-radius: 32px;
  z-index: 10000;
}

.floating-controls :deep(.el-button) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.floating-controls :deep(.el-button:hover) {
  background: rgba(255, 255, 255, 0.3);
}

.floating-controls :deep(.el-button.is-disabled) {
  opacity: 0.3;
}

.page-info {
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  min-width: 60px;
  text-align: center;
}

/* ============ 翻页动画 ============ */
.page-flip-enter-active,
.page-flip-leave-active {
  transition: all 0.4s ease;
}
.page-flip-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.page-flip-leave-to {
  opacity: 0;
  transform: translateX(-40px);
}

/* ============ 编辑表单 ============ */
.edit-form .form-row {
  margin-bottom: 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.edit-form .form-row > label {
  min-width: 80px;
  font-size: 14px;
  color: #606266;
  line-height: 32px;
}

.price {
  color: #f56c6c;
  font-size: 20px;
  font-weight: 700;
}

@media (max-width: 768px) {
  .book-frame {
    width: 100%;
    aspect-ratio: 3 / 4;
  }
  .cover-title {
    font-size: 24px;
  }
  .section-title {
    font-size: 28px;
  }
}
</style>
