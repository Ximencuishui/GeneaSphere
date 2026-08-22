<script setup lang="ts">
/**
 * 众包修改管理
 *
 * 左：通知文案管理（生成 H5 通知文案，让族员通过手机号登录修改族谱信息）
 * 右：族员修改审核（族员提交的修改记录，管理员通过/拒绝）
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument } from '@element-plus/icons-vue'
import axios from 'axios'
import BioReviewPage from '@/views/admin/BioReviewPage.vue'

const route = useRoute()
const router = useRouter()
const clanSlug = computed(() => String(route.params.slug ?? '1'))
const ALLOWED_TABS = ['notice', 'submissions', 'bio'] as const
type TabKey = (typeof ALLOWED_TABS)[number]
const activeTab = ref<TabKey>('notice')

watch(() => route.query.tab, (value) => {
  activeTab.value = ALLOWED_TABS.includes(value as TabKey) ? value as TabKey : 'notice'
}, { immediate: true })

watch(activeTab, (value) => {
  if (route.query.tab !== value) router.replace({ query: { ...route.query, tab: value } })
  if (value === 'notice') loadNotices()
  if (value === 'submissions') loadSubmissions()
})

const workflowHighlight = computed(() => {
  if (activeTab.value === 'notice') return ['notify']
  if (activeTab.value === 'submissions') return ['member_edit']
  return ['review']
})

// ===== 通知文案 =====
interface Notice {
  id?: string
  title: string
  content: string
  start_at?: string
  end_at?: string
  status?: 'draft' | 'sent' | 'closed'
  sent_count?: number
  created_at?: string
  token?: string
}

const noticeList = ref<Notice[]>([])
const noticeLoading = ref(false)

async function loadNotices() {
  noticeLoading.value = true
  try {
    const { data } = await axios.get(`/api/genealogy/${clanSlug.value}/crowdsource/notices`)
    noticeList.value = data?.data ?? data ?? []
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '加载通知文案失败')
  } finally {
    noticeLoading.value = false
  }
}

const noticeDialogVisible = ref(false)
const noticeEditing = ref<Notice | null>(null)
const noticeForm = ref<Notice>({
  title: '',
  content: '',
  start_at: '',
  end_at: '',
  status: 'draft',
})

function resetNoticeForm() {
  noticeEditing.value = null
  noticeForm.value = {
    title: '',
    content: '',
    start_at: '',
    end_at: '',
    status: 'draft',
  }
}

function openCreateNotice() {
  resetNoticeForm()
  noticeDialogVisible.value = true
}

function openEditNotice(row: any) {
  noticeEditing.value = row
  noticeForm.value = { ...row }
  noticeDialogVisible.value = true
}

async function handleSaveNotice() {
  if (!noticeForm.value.title.trim()) {
    ElMessage.warning('请输入通知标题')
    return
  }
  if (!noticeForm.value.content.trim()) {
    ElMessage.warning('请输入通知内容')
    return
  }
  try {
    const payload = { ...noticeForm.value }
    if (noticeEditing.value?.id) {
      await axios.put(`/api/genealogy/${clanSlug.value}/crowdsource/notices/${noticeEditing.value.id}`, payload)
    } else {
      await axios.post(`/api/genealogy/${clanSlug.value}/crowdsource/notices`, payload)
    }
    ElMessage.success('通知文案已保存')
    noticeDialogVisible.value = false
    await loadNotices()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  }
}

async function handleDeleteNotice(row: any) {
  try {
    await ElMessageBox.confirm(`确认删除通知"${row.title}"？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await axios.delete(`/api/genealogy/${clanSlug.value}/crowdsource/notices/${row.id}`)
    ElMessage.success('通知文案已删除')
    await loadNotices()
  } catch {
    /* 用户取消 */
  }
}

/**
 * 生成 H5 链接（管理员可复制发送给族员；族员通过手机号登录修改）
 * 链接格式：${origin}/h5/genealogy-edit?clanSlug=${slug}&token=${token}
 */
function buildH5Link(row: any): string {
  const token = row.token || row.id || 'preview-token'
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/h5/genealogy-edit?clanSlug=${clanSlug.value}&token=${encodeURIComponent(String(token))}`
}

async function copyH5Link(row: any) {
  const link = buildH5Link(row)
  try {
    await navigator.clipboard.writeText(link)
    ElMessage.success('H5 链接已复制，可发送给族员')
  } catch {
    ElMessage.warning('复制失败，请手动复制：' + link)
  }
}

// ===== 族员修改审核 =====
interface Submission {
  id?: string
  member_name: string
  field: string
  before: string
  after: string
  submitted_at?: string
  status?: 'pending' | 'approved' | 'rejected'
}

const submissionList = ref<Submission[]>([])
const submissionLoading = ref(false)
const submissionFilter = ref<'all' | 'pending' | 'approved' | 'rejected'>('pending')

async function loadSubmissions() {
  submissionLoading.value = true
  try {
    const { data } = await axios.get(`/api/genealogy/${clanSlug.value}/crowdsource/submissions`, {
      params: { status: submissionFilter.value },
    })
    const rows = data?.data ?? data ?? []
    submissionList.value = rows.map((row: any) => ({
      ...row,
      member_name: row.member_name || row.requester_user_id,
      field: row.field || row.field_name,
      before: row.before ?? row.old_value ?? '',
      after: row.after ?? row.new_value ?? '',
      submitted_at: row.submitted_at || row.created_at,
      status: String(row.status || '').toLowerCase(),
    }))
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '加载审核列表失败')
  } finally {
    submissionLoading.value = false
  }
}

async function handleApprove(row: any) {
  try {
    await ElMessageBox.confirm(
      `通过 ${row.member_name} 的"${row.field}"修改？\n修改前：${row.before}\n修改后：${row.after}`,
      '审核通过',
      { type: 'success', confirmButtonText: '通过', cancelButtonText: '取消' },
    )
    await axios.post(`/api/genealogy/${clanSlug.value}/crowdsource/submissions/${row.id}/approve`)
    ElMessage.success('修改申请已通过')
    await loadSubmissions()
  } catch {
    /* 用户取消 */
  }
}

async function handleReject(row: any) {
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `拒绝 ${row.member_name} 的"${row.field}"修改？`,
      '审核拒绝',
      {
        inputPlaceholder: '请输入拒绝原因（族员可在 H5 端查看）',
        inputValidator: (v: string) => (v && v.trim() ? true : '请输入拒绝原因'),
        confirmButtonText: '确认拒绝',
        cancelButtonText: '取消',
      },
    )
    await axios.post(`/api/genealogy/${clanSlug.value}/crowdsource/submissions/${row.id}/reject`, { reason })
    ElMessage.success('修改申请已拒绝')
    await loadSubmissions()
  } catch {
    /* 用户取消 */
  }
}

onMounted(() => {
  if (activeTab.value === 'notice') loadNotices()
  if (activeTab.value === 'submissions') loadSubmissions()
})
</script>

<template>
  <div class="crowdsource-page">
    <!-- 修谱工作流（顶部一目了然，并凸显与本页相关的"发通知族员 / 族员自行更改 / 审核"三个节点） -->
    <GenealogyWorkflowBar :highlight="workflowHighlight" />
    <ElTabs v-model="activeTab" class="crowdsource-tabs">
      <ElTabPane label="通知文案管理" name="notice">
        <ElRow :gutter="20">
          <ElCol :span="24">
        <ElCard>
          <template #header>
            <div class="card-header">
              <h2>通知文案管理</h2>
              <ElButton type="primary" size="small" @click="openCreateNotice">新建通知</ElButton>
            </div>
          </template>

          <p class="card-hint">
            创建通知文案，生成 H5 链接发送给族员。族员扫码或点击链接，使用手机号登录后即可修改自己的族谱信息，提交后进入右侧审核列表。
          </p>

          <ElTable v-loading="noticeLoading" :data="noticeList" empty-text="暂无通知文案">
            <ElTableColumn label="标题" prop="title" />
            <ElTableColumn label="状态" prop="status" width="100">
              <template #default="{ row }">
                <ElTag :type="row.status === 'sent' ? 'success' : row.status === 'closed' ? 'info' : 'warning'" size="small">
                  {{ row.status === 'sent' ? '已发送' : row.status === 'closed' ? '已结束' : '草稿' }}
                </ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn label="已发送" prop="sent_count" width="90" />
            <ElTableColumn label="创建时间" prop="created_at" width="170" />
            <ElTableColumn label="操作" width="200">
              <template #default="{ row }">
                <ElButton size="small" link type="primary" @click="copyH5Link(row)">复制链接</ElButton>
                <ElButton size="small" link type="primary" @click="openEditNotice(row)">编辑</ElButton>
                <ElButton size="small" link type="danger" @click="handleDeleteNotice(row)">删除</ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
          </ElCol>
        </ElRow>
      </ElTabPane>

      <ElTabPane label="族员修改审核" name="submissions">
        <ElRow :gutter="20">
          <ElCol :span="24">
        <ElCard>
          <template #header>
            <div class="card-header">
              <h2>族员修改审核</h2>
              <ElSelect v-model="submissionFilter" size="small" style="width: 120px;" @change="loadSubmissions">
                <ElOption label="待审核" value="pending" />
                <ElOption label="已通过" value="approved" />
                <ElOption label="已拒绝" value="rejected" />
                <ElOption label="全部" value="all" />
              </ElSelect>
            </div>
          </template>

          <ElTable v-loading="submissionLoading" :data="submissionList" empty-text="暂无修改记录">
            <ElTableColumn label="族员" prop="member_name" width="100" />
            <ElTableColumn label="字段" prop="field" width="120" />
            <ElTableColumn label="修改前" prop="before">
              <template #default="{ row }">
                <span class="diff-old">{{ row.before || '—' }}</span>
              </template>
            </ElTableColumn>
            <ElTableColumn label="修改后" prop="after">
              <template #default="{ row }">
                <span class="diff-new">{{ row.after || '—' }}</span>
              </template>
            </ElTableColumn>
            <ElTableColumn label="提交时间" prop="submitted_at" width="160" />
            <ElTableColumn label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <ElButton v-if="row.status !== 'approved'" size="small" link type="success" @click="handleApprove(row)">通过</ElButton>
                <ElButton v-if="row.status !== 'rejected'" size="small" link type="danger" @click="handleReject(row)">拒绝</ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
          </ElCol>
        </ElRow>
      </ElTabPane>

      <ElTabPane label="生平传记审核" name="bio">
        <BioReviewPage />
      </ElTabPane>
    </ElTabs>

    <!-- 通知文案编辑弹窗 -->
    <ElDialog
      v-model="noticeDialogVisible"
      :title="noticeEditing ? '编辑通知文案' : '新建通知文案'"
      width="560px"
      :close-on-click-modal="false"
    >
      <ElForm :model="noticeForm" label-width="84px">
        <ElFormItem label="标题" required>
          <ElInput v-model="noticeForm.title" placeholder="例：请各位族亲核实个人信息" maxlength="60" show-word-limit />
        </ElFormItem>
        <ElFormItem label="正文" required>
          <ElInput
            v-model="noticeForm.content"
            type="textarea"
            :rows="6"
            placeholder="族员在 H5 页面上方将看到此文案"
            maxlength="500"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="生效时间">
          <div class="time-range">
            <ElDatePicker
              v-model="noticeForm.start_at"
              type="datetime"
              placeholder="开始时间"
              value-format="YYYY-MM-DD HH:mm:ss"
            />
            <span class="dash">—</span>
            <ElDatePicker
              v-model="noticeForm.end_at"
              type="datetime"
              placeholder="结束时间"
              value-format="YYYY-MM-DD HH:mm:ss"
            />
          </div>
        </ElFormItem>
        <ElFormItem label="H5 预览">
          <div class="h5-link-preview">
            <ElIcon><CopyDocument /></ElIcon>
            <span class="link-text">{{ buildH5Link(noticeForm) }}</span>
          </div>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="noticeDialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="handleSaveNotice">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.crowdsource-page {
  max-width: 1400px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.card-hint {
  margin: 0 0 12px 0;
  padding: 8px 12px;
  background: #f5f7fa;
  border-left: 3px solid #409eff;
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
  border-radius: 4px;
}

.diff-old {
  color: #909399;
  text-decoration: line-through;
}

.diff-new {
  color: #67c23a;
  font-weight: 500;
}

.time-range {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.time-range .el-date-editor {
  flex: 1;
}

.dash {
  color: #909399;
}

.h5-link-preview {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #f5f7fa;
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
  color: #606266;
  font-size: 12px;
  word-break: break-all;
}

.link-text {
  flex: 1;
  min-width: 0;
}
</style>
