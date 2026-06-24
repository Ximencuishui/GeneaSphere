<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Edit, Download, Clock, Fold, Expand } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus';import discussionApi from '@/api/discussion'
import type { DiscussionSummary, SummaryVersion } from '@/types'

const route = useRoute()
const router = useRouter()
const summaryId = computed(() => route.params.id as string)

const loading = ref(false)
const summary = ref<DiscussionSummary | null>(null)
const versions = ref<SummaryVersion[]>([])
const versionsVisible = ref(false)
const editMode = ref(false)
const editContent = ref<any>(null)
const saveLoading = ref(false)
const expandedSections = ref<Set<string>>(new Set(['background', 'main_points', 'consensus', 'disagreements', 'action_items']))

async function fetchSummary() {
  loading.value = true
  try {
    summary.value = await discussionApi.summaries.getById(summaryId.value)
    editContent.value = { ...summary.value.content }
  } catch (err) {
    ElMessage.error('获取总结详情失败')
    router.back()
  } finally {
    loading.value = false
  }
}

async function fetchVersions() {
  try {
    versions.value = await discussionApi.summaries.versions(summaryId.value)
    versionsVisible.value = true
  } catch (err) {
    ElMessage.error('获取版本历史失败')
  }
}

async function handleSaveEdit() {
  saveLoading.value = true
  try {
    await discussionApi.summaries.update(summaryId.value, editContent.value)
    ElMessage.success('保存成功')
    editMode.value = false
    await fetchSummary()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saveLoading.value = false
  }
}

async function handleExport(format: 'md' | 'pdf') {
  try {
    const blob = await discussionApi.summaries.export(summaryId.value, format) as unknown as Blob;
    const url = URL.createObjectURL(blob as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${summary.value?.title}.${format}`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (err) {
    ElMessage.error('导出失败')
  }
}

function toggleSection(key: string) {
  if (expandedSections.value.has(key)) {
    expandedSections.value.delete(key)
  } else {
    expandedSections.value.add(key)
  }
}

const canEdit = computed(() => {
  // TODO: 检查当前用户是否有编辑权限
  return summary.value?.generated_by?.id === 'current_user_id'
})

onMounted(fetchSummary)
</script>

<template>
  <div class="summary-detail-page" v-loading="loading">
    <!-- 顶部导航 -->
    <div class="page-nav">
      <ElButton text :icon="ArrowLeft" @click="router.back()">返回</ElButton>
    </div>

    <!-- 总结内容 -->
    <ElCard class="summary-card" shadow="never" v-if="summary">
      <template #header>
        <div class="summary-header">
          <div class="header-info">
            <ElTag :type="summary.summary_type === 'topic' ? 'primary' : 'success'" size="small">
              {{ summary.summary_type === 'topic' ? '话题总结' : '小组总结' }}
            </ElTag>
            <span class="version">v{{ summary.version }}</span>
          </div>
          <div class="header-actions">
            <ElButton
              v-if="canEdit && !editMode"
              type="primary"
              :icon="Edit"
              @click="editMode = true"
            >
              编辑
            </ElButton>
            <ElButton :icon="Clock" @click="fetchVersions">版本历史</ElButton>
            <ElDropdown trigger="click">
              <ElButton :icon="Download">导出</ElButton>
              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem @click="handleExport('md')">导出为 Markdown</ElDropdownItem>
                  <ElDropdownItem @click="handleExport('pdf')">导出为 PDF</ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </div>
        </div>
      </template>

      <h1 class="summary-title">{{ summary.title }}</h1>
      <div class="summary-meta">
        <span>生成者：{{ summary.generated_by.nickname }}</span>
        <span>生成时间：{{ new Date(summary.created_at).toLocaleString() }}</span>
        <span v-if="summary.source_topic_title">来源话题：{{ summary.source_topic_title }}</span>
      </div>

      <!-- 内容区块 -->
      <div class="summary-content" v-if="summary.content">
        <!-- 讨论背景 -->
        <div class="content-section">
          <div class="section-header" @click="toggleSection('background')">
            <ElIcon>
              <component :is="expandedSections.has('background') ? Fold : Expand" />
            </ElIcon>
            <h3>讨论背景</h3>
          </div>
          <div class="section-body" v-show="expandedSections.has('background')">
            <template v-if="editMode">
              <ElInput v-model="editContent.background" type="textarea" :rows="3" />
            </template>
            <p v-else>{{ summary.content.background || '无' }}</p>
          </div>
        </div>

        <!-- 主要观点 -->
        <div class="content-section">
          <div class="section-header" @click="toggleSection('main_points')">
            <ElIcon>
              <component :is="expandedSections.has('main_points') ? Fold : Expand" />
            </ElIcon>
            <h3>主要观点</h3>
          </div>
          <div class="section-body" v-show="expandedSections.has('main_points')">
            <template v-if="editMode">
              <div v-for="(point, index) in editContent.main_points" :key="index" class="edit-point">
                <ElInput v-model="point.author" placeholder="发言人" />
                <ElInput v-model="point.point" type="textarea" placeholder="观点内容" />
                <ElInput v-model="point.evidence" placeholder="证据/引用" />
              </div>
              <ElButton size="small" @click="editContent.main_points.push({ author: '', point: '', evidence: '' })">
                添加观点
              </ElButton>
            </template>
            <template v-else>
              <div v-if="summary.content.main_points?.length" class="point-list">
                <div v-for="(point, index) in summary.content.main_points" :key="index" class="point-item">
                  <strong>{{ point.author }}:</strong> {{ point.point }}
                  <div v-if="point.evidence" class="evidence">
                    <em>证据: {{ point.evidence }}</em>
                  </div>
                </div>
              </div>
              <p v-else>无</p>
            </template>
          </div>
        </div>

        <!-- 共识 -->
        <div class="content-section">
          <div class="section-header" @click="toggleSection('consensus')">
            <ElIcon>
              <component :is="expandedSections.has('consensus') ? Fold : Expand" />
            </ElIcon>
            <h3>共识</h3>
          </div>
          <div class="section-body" v-show="expandedSections.has('consensus')">
            <template v-if="editMode">
              <div v-for="(_item, index) in editContent.consensus" :key="index" class="edit-list-item">
                <ElInput v-model="editContent.consensus[index]" />
              </div>
              <ElButton size="small" @click="editContent.consensus.push('')">添加共识</ElButton>
            </template>
            <template v-else>
              <ul v-if="summary.content.consensus?.length">
                <li v-for="(item, index) in summary.content.consensus" :key="index">{{ item }}</li>
              </ul>
              <p v-else>无</p>
            </template>
          </div>
        </div>

        <!-- 分歧 -->
        <div class="content-section">
          <div class="section-header" @click="toggleSection('disagreements')">
            <ElIcon>
              <component :is="expandedSections.has('disagreements') ? Fold : Expand" />
            </ElIcon>
            <h3>分歧</h3>
          </div>
          <div class="section-body" v-show="expandedSections.has('disagreements')">
            <template v-if="editMode">
              <div v-for="(_item, index) in editContent.disagreements" :key="index" class="edit-list-item">
                <ElInput v-model="editContent.disagreements[index]" />
              </div>
              <ElButton size="small" @click="editContent.disagreements.push('')">添加分歧</ElButton>
            </template>
            <template v-else>
              <ul v-if="summary.content.disagreements?.length">
                <li v-for="(item, index) in summary.content.disagreements" :key="index">{{ item }}</li>
              </ul>
              <p v-else>无</p>
            </template>
          </div>
        </div>

        <!-- 待办事项 -->
        <div class="content-section">
          <div class="section-header" @click="toggleSection('action_items')">
            <ElIcon>
              <component :is="expandedSections.has('action_items') ? Fold : Expand" />
            </ElIcon>
            <h3>待办事项</h3>
          </div>
          <div class="section-body" v-show="expandedSections.has('action_items')">
            <template v-if="editMode">
              <div v-for="(item, index) in editContent.action_items" :key="index" class="edit-action-item">
                <ElInput v-model="item.task" placeholder="任务描述" />
                <ElInput v-model="item.assignee" placeholder="负责人" />
                <ElInput v-model="item.deadline" placeholder="截止时间" />
              </div>
              <ElButton size="small" @click="editContent.action_items.push({ task: '', assignee: '', deadline: '' })">
                添加待办
              </ElButton>
            </template>
            <template v-else>
              <div v-if="summary.content.action_items?.length" class="action-list">
                <div v-for="(item, index) in summary.content.action_items" :key="index" class="action-item">
                  <el-checkbox disabled />
                  <span class="action-task">{{ item.task }}</span>
                  <span v-if="item.assignee" class="action-assignee">负责人: {{ item.assignee }}</span>
                  <span v-if="item.deadline" class="action-deadline">截止: {{ item.deadline }}</span>
                </div>
              </div>
              <p v-else>无</p>
            </template>
          </div>
        </div>
      </div>

      <!-- 编辑模式操作栏 -->
      <div v-if="editMode" class="edit-actions">
        <ElButton @click="editMode = false">取消</ElButton>
        <ElButton type="primary" :loading="saveLoading" @click="handleSaveEdit">保存</ElButton>
      </div>
    </ElCard>

    <!-- 版本历史对话框 -->
    <ElDialog v-model="versionsVisible" title="版本历史" width="600px">
      <div v-if="versions.length > 0" class="version-list">
        <div v-for="v in versions" :key="v.version" class="version-item">
          <div class="version-info">
            <span class="version-num">v{{ v.version }}</span>
            <span class="version-editor">{{ v.editor.nickname }}</span>
            <span class="version-time">{{ new Date(v.edited_at).toLocaleString() }}</span>
          </div>
        </div>
      </div>
      <ElEmpty v-else description="暂无版本历史" />
    </ElDialog>
  </div>
</template>

<style scoped>
.summary-detail-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 16px;
}

.page-nav {
  margin-bottom: 16px;
}

.summary-card {
  margin-bottom: 16px;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.version {
  font-size: 14px;
  color: #909399;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.summary-title {
  margin: 0 0 12px 0;
  font-size: 24px;
  color: #303133;
}

.summary-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  font-size: 13px;
  color: #909399;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.summary-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.content-section {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #f5f7fa;
  cursor: pointer;
  user-select: none;
}

.section-header h3 {
  margin: 0;
  font-size: 15px;
  color: #303133;
}

.section-body {
  padding: 16px;
  background: #fff;
}

.section-body p,
.section-body ul {
  margin: 0;
  line-height: 1.8;
  color: #606266;
}

.section-body ul {
  padding-left: 24px;
}

.point-item {
  margin-bottom: 12px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.evidence {
  margin-top: 8px;
  padding-left: 12px;
  border-left: 2px solid #8d6e63;
  font-size: 13px;
  color: #909399;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #fff3e0;
  border-radius: 4px;
  margin-bottom: 8px;
}

.action-task {
  flex: 1;
}

.action-assignee,
.action-deadline {
  font-size: 12px;
  color: #909399;
}

.edit-point,
.edit-list-item,
.edit-action-item {
  margin-bottom: 12px;
}

.edit-actions {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-item {
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.version-num {
  font-weight: 500;
  color: #5d4037;
}

.version-editor,
.version-time {
  font-size: 13px;
  color: #909399;
}
</style>