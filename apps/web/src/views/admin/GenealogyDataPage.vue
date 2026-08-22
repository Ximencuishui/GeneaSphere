<script setup lang="ts">
/**
 * 族谱数据管理页面
 * Tab：
 *   - 新建族谱：录入族谱草稿信息（族谱名/版本号/起止世代/描述/封面），可保存/备份/提交定谱
 *   - 旧谱电子化：旧谱项目列表（详情/继续编辑）
 *   - PDF 导入管理：复用 ImportManagementPage（导入记录/活跃任务/OCR 统计）
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import ImportManagementPage from '@/views/admin/ImportManagementPage.vue'

const route = useRoute()
const router = useRouter()

const clanSlug = computed(() => String(route.params.slug ?? '1'))

// 当前 tab（与 URL ?tab= 同步），允许值：new | digitize | pdf-import
const ALLOWED_TABS = ['new', 'digitize', 'pdf-import'] as const
type TabKey = (typeof ALLOWED_TABS)[number]
const activeTab = ref<TabKey>('new')

function syncTabFromQuery() {
  const q = String(route.query.tab || '')
  if ((ALLOWED_TABS as readonly string[]).includes(q)) {
    activeTab.value = q as TabKey
  } else {
    activeTab.value = 'new'
  }
}

watch(() => route.query.tab, syncTabFromQuery, { immediate: true })

function handleTabClick(tab: any) {
  const name = tab?.props?.name as TabKey
  activeTab.value = name
  router.replace({ query: { ...route.query, tab: name } })
}

// ===== Tab 1：新建族谱 =====
const newForm = ref({
  name: '',
  version: '',
  generation_start: undefined as number | undefined,
  generation_end: undefined as number | undefined,
  description: '',
  cover_image_url: '',
})

const draftSaving = ref(false)
const editingDraftId = ref<string | null>(null)
const draftList = ref<any[]>([])
const draftLoading = ref(false)

async function loadDraftList() {
  draftLoading.value = true
  try {
    const { data } = await axios.get(`/api/genealogy/${clanSlug.value}/drafts`)
    draftList.value = data?.data ?? data ?? []
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '加载草稿失败')
  } finally {
    draftLoading.value = false
  }
}

async function handleSaveDraft() {
  if (!newForm.value.name.trim()) {
    ElMessage.warning('请输入族谱名称')
    return
  }
  draftSaving.value = true
  try {
    if (editingDraftId.value) {
      await axios.put(`/api/genealogy/${clanSlug.value}/drafts/${editingDraftId.value}`, newForm.value)
    } else {
      await axios.post(`/api/genealogy/${clanSlug.value}/drafts`, newForm.value)
    }
    ElMessage.success(editingDraftId.value ? '草稿已更新' : '草稿已保存')
    editingDraftId.value = null
    await loadDraftList()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    draftSaving.value = false
  }
}

async function handleBackup() {
  try {
    await ElMessageBox.confirm(
      '备份当前族谱数据为 JSON 文件（含成员/关系/草稿元信息）。',
      '备份族谱数据',
      { type: 'info', confirmButtonText: '开始备份', cancelButtonText: '取消' },
    )
    const response = await axios.get(`/api/genealogy/${clanSlug.value}/export`, {
      params: { format: 'json' },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `${clanSlug.value}-genealogy-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    ElMessage.success('族谱备份已下载')
  } catch {
    /* 用户取消 */
  }
}

function loadDraft(row: any) {
  editingDraftId.value = row.id
  newForm.value = {
    name: row.name || '',
    version: row.version || '',
    generation_start: row.generation_start ?? undefined,
    generation_end: row.generation_end ?? undefined,
    description: row.description || '',
    cover_image_url: row.cover_image_url || '',
  }
}

async function removeDraft(row: any) {
  try {
    await ElMessageBox.confirm(`确认删除草稿“${row.name}”？`, '删除确认', { type: 'warning' })
    await axios.delete(`/api/genealogy/${clanSlug.value}/drafts/${row.id}`)
    if (editingDraftId.value === row.id) editingDraftId.value = null
    ElMessage.success('草稿已删除')
    await loadDraftList()
  } catch (err: any) {
    if (err !== 'cancel' && err !== 'close') ElMessage.error(err?.response?.data?.message || '删除失败')
  }
}

function handleGoFinalize() {
  router.push(`/zupu/${clanSlug.value}/genealogy/finalize`)
}

// 根据当前 tab 决定修谱工作流条上要凸显的节点：
//   - 新建族谱 tab → 高亮 "新建族谱" 节点
//   - 旧谱电子化 / PDF 导入管理 tab → 高亮 "旧谱电子化" 主阶段及其子步骤（OCR/对照/保存）
const workflowHighlight = computed<string[]>(() => {
  if (activeTab.value === 'new') return ['clan_created']
  if (activeTab.value === 'digitize') return ['digitize', 'import_photo', 'compare_edit', 'save_table']
  if (activeTab.value === 'pdf-import') return ['digitize', 'ocr', 'compare_edit', 'save_table']
  return ['digitize']
})

// ===== Tab 2：旧谱电子化 =====
const digitizeList = ref<any[]>([])
const digitizeLoading = ref(false)

async function loadDigitizeList() {
  digitizeLoading.value = true
  try {
    const { data } = await axios.get(`/api/genealogy/${clanSlug.value}/digitize-tasks`)
    digitizeList.value = data?.data ?? data ?? []
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '加载旧谱电子化列表失败')
  } finally {
    digitizeLoading.value = false
  }
}

function handleDigitizeDetail(row: any) {
  router.push({ path: `/zupu/${clanSlug.value}/genealogy/data`, query: { tab: 'pdf-import', taskId: row?.id } })
}
function handleDigitizeContinue(row: any) {
  router.push({ path: `/zupu/${clanSlug.value}/genealogy/data`, query: { tab: 'pdf-import', taskId: row?.id, action: 'continue' } })
}

// ===== Tab 3：PDF 导入管理（直接渲染 ImportManagementPage）=====
// ImportManagementPage 内部使用 route.params.slug 加载数据，无需传 prop

watch(activeTab, (v) => {
  if (v === 'digitize' && digitizeList.value.length === 0 && !digitizeLoading.value) {
    loadDigitizeList()
  } else if (v === 'new' && draftList.value.length === 0 && !draftLoading.value) {
    loadDraftList()
  }
})

onMounted(() => {
  if (activeTab.value === 'digitize') loadDigitizeList()
  if (activeTab.value === 'new') loadDraftList()
})
</script>

<template>
  <div class="genealogy-data-page">
    <!-- 修谱工作流（顶部一目了然，并凸显与本页相关的节点：随当前 tab 联动） -->
    <GenealogyWorkflowBar :highlight="workflowHighlight" />
    <ElCard>
      <template #header>
        <div class="page-header">
          <h2>族谱数据</h2>
          <ElButton type="primary" :icon="undefined" @click="handleBackup">备份族谱数据</ElButton>
        </div>
      </template>

      <ElTabs :model-value="activeTab" @tab-click="handleTabClick">
        <!-- Tab 1：新建族谱 -->
        <ElTabPane label="新建族谱" name="new">
          <ElForm
            :model="newForm"
            label-width="100px"
            class="new-form"
          >
            <ElFormItem label="族谱名称" required>
              <ElInput v-model="newForm.name" placeholder="例：朱氏宗谱·2026版" maxlength="60" show-word-limit />
            </ElFormItem>
            <ElFormItem label="版本号">
              <ElInput v-model="newForm.version" placeholder="例：v2026.1（选填，自动生成）" />
            </ElFormItem>
            <ElFormItem label="起止世代">
              <div class="gen-range">
                <ElInput v-model.number="newForm.generation_start" type="number" placeholder="起始世代" />
                <span class="dash">—</span>
                <ElInput v-model.number="newForm.generation_end" type="number" placeholder="结束世代" />
              </div>
            </ElFormItem>
            <ElFormItem label="封面图 URL">
              <ElInput v-model="newForm.cover_image_url" placeholder="可粘贴已上传的影像 URL（选填）" />
            </ElFormItem>
            <ElFormItem label="描述">
              <ElInput
                v-model="newForm.description"
                type="textarea"
                :rows="4"
                placeholder="族谱简介、修谱缘由、收录范围等"
                maxlength="500"
                show-word-limit
              />
            </ElFormItem>
            <ElFormItem>
              <ElButton type="primary" :loading="draftSaving" @click="handleSaveDraft">保存草稿</ElButton>
              <ElButton type="success" @click="handleGoFinalize">提交定谱</ElButton>
              <ElButton @click="handleBackup">下载备份</ElButton>
            </ElFormItem>
          </ElForm>

          <ElDivider content-position="left">已保存的草稿</ElDivider>
          <ElTable v-loading="draftLoading" :data="draftList" empty-text="暂无草稿">
            <ElTableColumn label="族谱名称" prop="name" />
            <ElTableColumn label="版本号" prop="version" width="120" />
            <ElTableColumn label="更新时间" prop="updated_at" width="180" />
            <ElTableColumn label="操作" width="180">
              <template #default="{ row }">
                <ElButton size="small" link type="primary" @click="loadDraft(row)">编辑</ElButton>
                <ElButton size="small" link type="success" @click="handleGoFinalize">定谱</ElButton>
                <ElButton size="small" link type="danger" @click="removeDraft(row)">删除</ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </ElTabPane>

        <!-- Tab 2：旧谱电子化 -->
        <ElTabPane label="旧谱电子化" name="digitize">
          <div class="tab-toolbar">
            <ElButton type="primary" @click="router.push({ query: { ...route.query, tab: 'pdf-import' } })">新建旧谱电子化</ElButton>
            <ElButton @click="loadDigitizeList">刷新</ElButton>
          </div>
          <ElTable v-loading="digitizeLoading" :data="digitizeList" empty-text="暂无旧谱电子化项目">
            <ElTableColumn label="项目名称" prop="name" />
            <ElTableColumn label="原始文件" prop="source_file" width="200" />
            <ElTableColumn label="状态" prop="status" width="120">
              <template #default="{ row }">
                <ElTag :type="row.status === 'completed' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'">
                  {{ row.status_label || row.status || '—' }}
                </ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn label="创建时间" prop="created_at" width="180" />
            <ElTableColumn label="操作" width="220">
              <template #default="{ row }">
                <ElButton size="small" link type="primary" @click="handleDigitizeDetail(row)">详情</ElButton>
                <ElButton size="small" link type="success" @click="handleDigitizeContinue(row)">继续编辑</ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </ElTabPane>

        <!-- Tab 3：PDF 导入管理（复用现有页面） -->
        <ElTabPane label="PDF 导入管理" name="pdf-import">
          <div class="pdf-import-wrap">
            <ImportManagementPage />
          </div>
        </ElTabPane>
      </ElTabs>
    </ElCard>
  </div>
</template>

<style scoped>
.genealogy-data-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.new-form {
  max-width: 720px;
  margin-top: 8px;
}

.gen-range {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.gen-range .el-input {
  flex: 1;
}

.dash {
  color: #909399;
}

.tab-toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}

/* PDF 导入管理内嵌时去掉自身 Card 外框（已被外层 ElCard 包裹） */
.pdf-import-wrap :deep(.el-card) {
  border: none;
  box-shadow: none;
}
</style>
