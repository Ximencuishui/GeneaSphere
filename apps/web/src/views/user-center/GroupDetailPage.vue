<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, User, ChatLineRound, Document, Plus, Setting,
  Top, Delete, More
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import discussionApi from '@/api/discussion'
import type { DiscussionGroup, GroupTopic, GroupMember, DiscussionSummary } from '@/types'

const route = useRoute()
const router = useRouter()
const groupId = computed(() => route.params.id as string)

const loading = ref(false)
const group = ref<DiscussionGroup | null>(null)
const activeTab = ref('topics')
const topics = ref<GroupTopic[]>([])
const topicsLoading = ref(false)
const topicsPagination = ref({ page: 1, pageSize: 20, total: 0 })
const members = ref<GroupMember[]>([])
const membersLoading = ref(false)
const summaries = ref<DiscussionSummary[]>([])
const summariesLoading = ref(false)

// 创建话题
const createTopicDialogVisible = ref(false)
const createTopicForm = ref({ title: '', content: '' })
const createTopicLoading = ref(false)

async function fetchGroup() {
  loading.value = true
  try {
    group.value = await discussionApi.groups.getById(groupId.value)
  } catch (err) {
    ElMessage.error('获取小组信息失败')
    router.back()
  } finally {
    loading.value = false
  }
}

async function fetchTopics() {
  topicsLoading.value = true
  try {
    const res = await discussionApi.topics.list(groupId.value, {
      page: topicsPagination.value.page,
      pageSize: topicsPagination.value.pageSize,
    })
    topics.value = res.data
    topicsPagination.value.total = res.pagination.total
  } catch (err) {
    ElMessage.error('获取话题列表失败')
  } finally {
    topicsLoading.value = false
  }
}

async function fetchMembers() {
  membersLoading.value = true
  try {
    members.value = await discussionApi.members.list(groupId.value)
  } catch (err) {
    ElMessage.error('获取成员列表失败')
  } finally {
    membersLoading.value = false
  }
}

async function fetchSummaries() {
  summariesLoading.value = true
  try {
    summaries.value = await discussionApi.summaries.list(groupId.value)
  } catch (err) {
    ElMessage.error('获取总结列表失败')
  } finally {
    summariesLoading.value = false
  }
}

function handleTabChange(tab: string) {
  if (tab === 'topics' && topics.value.length === 0) fetchTopics()
  if (tab === 'members' && members.value.length === 0) fetchMembers()
  if (tab === 'summaries' && summaries.value.length === 0) fetchSummaries()
}

function gotoTopic(id: string) {
  router.push(`/user-center/groups/topic/${id}`)
}

function gotoSummary(id: string) {
  router.push(`/user-center/groups/summary/${id}`)
}

async function handleCreateTopic() {
  if (!createTopicForm.value.title.trim() || !createTopicForm.value.content.trim()) {
    ElMessage.warning('请填写话题标题和内容')
    return
  }
  createTopicLoading.value = true
  try {
    const topic = await discussionApi.topics.create(groupId.value, createTopicForm.value)
    ElMessage.success('话题创建成功')
    createTopicDialogVisible.value = false
    createTopicForm.value = { title: '', content: '' }
    await fetchTopics()
    gotoTopic((topic as any).id)
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '创建失败')
  } finally {
    createTopicLoading.value = false
  }
}

async function handleDeleteTopic(topic: GroupTopic) {
  try {
    await ElMessageBox.confirm('确定要删除这个话题吗？', '删除话题', { type: 'warning' })
    await discussionApi.topics.delete(topic.id)
    ElMessage.success('已删除')
    fetchTopics()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '删除失败')
  }
}

async function handleTogglePin(topic: GroupTopic) {
  try {
    await discussionApi.topics.togglePin(topic.id, !topic.is_pinned)
    ElMessage.success(topic.is_pinned ? '已取消置顶' : '已置顶')
    fetchTopics()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const canManage = computed(() => {
  return group.value?.my_role === 'CREATOR' || group.value?.my_role === 'ADMIN'
})

onMounted(() => {
  fetchGroup()
  fetchTopics()
})
</script>

<template>
  <div class="group-detail-page" v-loading="loading">
    <!-- 顶部导航 -->
    <div class="page-nav">
      <ElButton text :icon="ArrowLeft" @click="router.back()">返回</ElButton>
    </div>

    <!-- 小组信息卡片 -->
    <ElCard class="group-info-card" shadow="never">
      <div class="group-info">
        <div class="group-cover">
          <div class="cover-placeholder">
            <ElIcon :size="48" color="#d7ccc8"><ChatLineRound /></ElIcon>
          </div>
        </div>
        <div class="group-details">
          <h1 class="group-name">{{ group?.name }}</h1>
          <p v-if="group?.description" class="group-desc">{{ group.description }}</p>
          <div class="group-stats">
            <span><ElIcon><User /></ElIcon> {{ group?.member_count }} 成员</span>
            <span><ElIcon><ChatLineRound /></ElIcon> {{ group?.topic_count }} 话题</span>
          </div>
        </div>
        <div class="group-actions">
          <ElButton v-if="canManage" type="primary" :icon="Plus" @click="createTopicDialogVisible = true">
            发话题
          </ElButton>
          <ElButton v-else type="primary" :icon="Plus" @click="createTopicDialogVisible = true">
            发话题
          </ElButton>
        </div>
      </div>
    </ElCard>

    <!-- 标签页 -->
    <ElCard class="content-card" shadow="never">
      <ElTabs v-model="activeTab" @tab-change="handleTabChange">
        <ElTabPane label="话题" name="topics">
          <template #label>
            <span class="tab-label"><ChatLineRound /> 话题</span>
          </template>

          <div v-loading="topicsLoading" class="topics-container">
            <div v-if="topics.length > 0" class="topic-list">
              <div
                v-for="topic in topics"
                :key="topic.id"
                class="topic-item"
                @click="gotoTopic(topic.id)"
              >
                <div class="topic-header">
                  <ElTag v-if="topic.is_pinned" type="warning" size="small" effect="plain">
                    置顶
                  </ElTag>
                  <h3 class="topic-title">{{ topic.title }}</h3>
                </div>
                <p class="topic-content">{{ topic.content }}</p>
                <div class="topic-meta">
                  <span class="author">
                    <ElAvatar :size="20" :src="topic.author.avatar_url">
                      {{ topic.author.nickname?.charAt(0) }}
                    </ElAvatar>
                    {{ topic.author.nickname || '匿名用户' }}
                  </span>
                  <span class="reply-count">{{ topic.reply_count }} 回复</span>
                  <span class="time">{{ new Date(topic.created_at).toLocaleDateString() }}</span>
                  <div class="topic-actions" v-if="canManage" @click.stop>
                    <ElDropdown trigger="click">
                      <ElButton text size="small"><More /></ElButton>
                      <template #dropdown>
                        <ElDropdownMenu>
                          <ElDropdownItem @click="handleTogglePin(topic)">
                            <ElIcon><Top /></ElIcon>
                            {{ topic.is_pinned ? '取消置顶' : '置顶' }}
                          </ElDropdownItem>
                          <ElDropdownItem divided @click="handleDeleteTopic(topic)">
                            <ElIcon><Delete /></ElIcon>
                            删除
                          </ElDropdownItem>
                        </ElDropdownMenu>
                      </template>
                    </ElDropdown>
                  </div>
                </div>
              </div>
            </div>
            <ElEmpty v-else description="暂无话题，快来发起第一个话题吧" />
          </div>

          <div v-if="topicsPagination.total > topicsPagination.pageSize" class="pagination">
            <ElPagination
              v-model:current-page="topicsPagination.page"
              :page-size="topicsPagination.pageSize"
              :total="topicsPagination.total"
              layout="prev, pager, next"
              @current-change="fetchTopics"
            />
          </div>
        </ElTabPane>

        <ElTabPane label="讨论总结" name="summaries">
          <template #label>
            <span class="tab-label"><Document /> 讨论总结</span>
          </template>

          <div v-loading="summariesLoading" class="summaries-container">
            <div v-if="summaries.length > 0" class="summary-list">
              <div
                v-for="s in summaries"
                :key="s.id"
                class="summary-item"
                @click="gotoSummary(s.id)"
              >
                <div class="summary-header">
                  <ElTag :type="s.summary_type === 'topic' ? 'primary' : 'success'" size="small">
                    {{ s.summary_type === 'topic' ? '话题总结' : '小组总结' }}
                  </ElTag>
                  <h3 class="summary-title">{{ s.title }}</h3>
                </div>
                <div class="summary-meta">
                  <span>版本 v{{ s.version }}</span>
                  <span>生成者：{{ s.generated_by.nickname }}</span>
                  <span>{{ new Date(s.created_at).toLocaleDateString() }}</span>
                </div>
              </div>
            </div>
            <ElEmpty v-else description="暂无讨论总结" />
          </div>
        </ElTabPane>

        <ElTabPane label="成员" name="members">
          <template #label>
            <span class="tab-label"><User /> 成员 ({{ members.length }})</span>
          </template>

          <div v-loading="membersLoading" class="members-container">
            <div v-if="members.length > 0" class="member-list">
              <div v-for="m in members" :key="m.user_id" class="member-item">
                <ElAvatar :size="40" :src="m.avatar_url">
                  {{ m.nickname?.charAt(0) }}
                </ElAvatar>
                <div class="member-info">
                  <span class="member-name">{{ m.nickname }}</span>
                  <ElTag :type="m.role === 'CREATOR' ? 'danger' : m.role === 'ADMIN' ? 'warning' : 'info'" size="small">
                    {{ m.role === 'CREATOR' ? '创建者' : m.role === 'ADMIN' ? '管理员' : '成员' }}
                  </ElTag>
                </div>
                <span class="join-time">加入于 {{ new Date(m.joined_at).toLocaleDateString() }}</span>
              </div>
            </div>
            <ElEmpty v-else description="暂无成员" />
          </div>
        </ElTabPane>
      </ElTabs>
    </ElCard>

    <!-- 创建话题对话框 -->
    <ElDialog
      v-model="createTopicDialogVisible"
      title="发起话题"
      width="600px"
      :close-on-click-modal="false"
    >
      <ElForm :model="createTopicForm" label-width="80px">
        <ElFormItem label="话题标题" required>
          <ElInput
            v-model="createTopicForm.title"
            placeholder="请输入话题标题"
            maxlength="100"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="话题内容" required>
          <ElInput
            v-model="createTopicForm.content"
            type="textarea"
            :rows="6"
            placeholder="请详细描述您想讨论的话题..."
            maxlength="5000"
            show-word-limit
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="createTopicDialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="createTopicLoading" @click="handleCreateTopic">
          发布
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.group-detail-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 16px;
}

.page-nav {
  margin-bottom: 16px;
}

.group-info-card {
  margin-bottom: 16px;
}

.group-info {
  display: flex;
  gap: 20px;
}

.group-cover {
  flex-shrink: 0;
}

.cover-placeholder {
  width: 100px;
  height: 100px;
  background: linear-gradient(135deg, #5d4037, #8d6e63);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.group-details {
  flex: 1;
  min-width: 0;
}

.group-name {
  margin: 0 0 8px 0;
  font-size: 22px;
  color: #303133;
}

.group-desc {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.5;
}

.group-stats {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #909399;
}

.group-stats span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.group-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.content-card {
  min-height: 400px;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.topics-container,
.summaries-container,
.members-container {
  min-height: 200px;
}

.topic-list,
.summary-list,
.member-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.topic-item,
.summary-item {
  padding: 16px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.topic-item:hover,
.summary-item:hover {
  background-color: #f5f7fa;
}

.topic-header,
.summary-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.topic-title,
.summary-title {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.topic-content {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.topic-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  color: #909399;
}

.topic-meta .author {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.topic-actions {
  margin-left: auto;
}

.summary-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #909399;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}

.member-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.member-name {
  font-size: 14px;
  color: #303133;
}

.join-time {
  font-size: 12px;
  color: #909399;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
</style>