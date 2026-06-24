<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Document, Delete } from '@element-plus/icons-vue';import { ElMessage, ElMessageBox } from 'element-plus'
import discussionApi from '@/api/discussion'
import type { TopicDetail, TopicReply } from '@/types'

const route = useRoute()
const router = useRouter()
const topicId = computed(() => route.params.id as string)

const loading = ref(false)
const topic = ref<TopicDetail | null>(null)
const replyContent = ref('')
const replyMediaUrls = ref<string[]>([])
const submitLoading = ref(false)
const generateSummaryLoading = ref(false)

async function fetchTopic() {
  loading.value = true
  try {
    topic.value = await discussionApi.topics.getById(topicId.value)
  } catch (err) {
    ElMessage.error('获取话题详情失败')
    router.back()
  } finally {
    loading.value = false
  }
}

async function handleSubmitReply() {
  if (!replyContent.value.trim()) {
    ElMessage.warning('请输入回复内容')
    return
  }
  submitLoading.value = true
  try {
    await discussionApi.replies.create(topicId.value, {
      content: replyContent.value,
      media_urls: replyMediaUrls.value,
    })
    ElMessage.success('回复成功')
    replyContent.value = ''
    replyMediaUrls.value = []
    await fetchTopic()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '回复失败')
  } finally {
    submitLoading.value = false
  }
}

async function handleDeleteReply(reply: TopicReply) {
  try {
    await ElMessageBox.confirm('确定要删除这条回复吗？', '删除回复', { type: 'warning' })
    await discussionApi.replies.delete(reply.id)
    ElMessage.success('已删除')
    await fetchTopic()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '删除失败')
  }
}

async function handleGenerateSummary() {
  try {
    await ElMessageBox.confirm(
      '确定要生成此话题的讨论总结吗？总结将基于所有回复内容自动生成。',
      '生成讨论总结',
      { type: 'info', confirmButtonText: '确定', cancelButtonText: '取消' }
    )
    generateSummaryLoading.value = true
    const res = await discussionApi.summaries.generateTopic(topicId.value)
    ElMessage.success(res.message || '总结生成成功')
    // 跳转到总结详情
    router.push(`/user-center/groups/summary/${res.id}`)
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '生成失败')
  } finally {
    generateSummaryLoading.value = false
  }
}

const canManage = computed(() => {
  return topic.value?.author.id === 'current_user_id' // TODO: 获取当前用户ID
})

onMounted(fetchTopic)
</script>

<template>
  <div class="topic-detail-page" v-loading="loading">
    <!-- 顶部导航 -->
    <div class="page-nav">
      <ElButton text :icon="ArrowLeft" @click="router.back()">返回</ElButton>
      <span class="group-name" v-if="topic">{{ topic.group_name }}</span>
    </div>

    <!-- 话题内容 -->
    <ElCard class="topic-card" shadow="never" v-if="topic">
      <div class="topic-header">
        <div class="author-info">
          <ElAvatar :size="40" :src="topic.author.avatar_url">
            {{ topic.author.nickname?.charAt(0) }}
          </ElAvatar>
          <div class="author-detail">
            <span class="author-name">{{ topic.author.nickname || '匿名用户' }}</span>
            <span class="post-time">{{ new Date(topic.created_at).toLocaleString() }}</span>
          </div>
        </div>
        <div class="topic-actions">
          <ElButton
            type="primary"
            :icon="Document"
            :loading="generateSummaryLoading"
            @click="handleGenerateSummary"
          >
            生成总结
          </ElButton>
        </div>
      </div>

      <h1 class="topic-title">{{ topic.title }}</h1>
      <div class="topic-content">{{ topic.content }}</div>
    </ElCard>

    <!-- 回复列表 -->
    <ElCard class="replies-card" shadow="never" v-if="topic">
      <template #header>
        <div class="replies-header">
          <span>回复 ({{ topic.replies.pagination.total }})</span>
        </div>
      </template>

      <div class="replies-list" v-if="topic.replies.data.length > 0">
        <div v-for="reply in topic.replies.data" :key="reply.id" class="reply-item">
          <ElAvatar :size="36" :src="reply.author.avatar_url">
            {{ reply.author.nickname?.charAt(0) }}
          </ElAvatar>
          <div class="reply-body">
            <div class="reply-header">
              <span class="author-name">{{ reply.author.nickname || '匿名用户' }}</span>
              <span class="reply-time">{{ new Date(reply.created_at).toLocaleString() }}</span>
              <ElButton
                v-if="reply.author.id === 'current_user_id'"
                text
                size="small"
                type="danger"
                :icon="Delete"
                @click="handleDeleteReply(reply)"
              >
                删除
              </ElButton>
            </div>
            <div class="reply-content">{{ reply.content }}</div>
            <div v-if="reply.media_urls?.length" class="reply-media">
              <ElImage
                v-for="url in reply.media_urls"
                :key="url"
                :src="url"
                fit="cover"
                class="media-img"
                :preview-src-list="reply.media_urls"
              />
            </div>
          </div>
        </div>
      </div>
      <ElEmpty v-else description="暂无回复，快来发表你的看法吧" />

      <!-- 分页 -->
      <div v-if="topic.replies.pagination.total > topic.replies.pagination.pageSize" class="pagination">
        <ElPagination
          v-model:current-page="topic.replies.pagination.page"
          :page-size="topic.replies.pagination.pageSize"
          :total="topic.replies.pagination.total"
          layout="prev, pager, next"
          @current-change="fetchTopic"
        />
      </div>
    </ElCard>

    <!-- 回复输入框 -->
    <ElCard class="reply-input-card" shadow="never">
      <template #header>
        <span>发表回复</span>
      </template>
      <ElInput
        v-model="replyContent"
        type="textarea"
        :rows="4"
        placeholder="请输入你的回复..."
        maxlength="2000"
        show-word-limit
      />
      <div class="reply-actions">
        <ElButton type="primary" :loading="submitLoading" @click="handleSubmitReply">
          提交回复
        </ElButton>
      </div>
    </ElCard>
  </div>
</template>

<style scoped>
.topic-detail-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 16px;
}

.page-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.group-name {
  color: #909399;
  font-size: 14px;
}

.topic-card {
  margin-bottom: 16px;
}

.topic-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.author-info {
  display: flex;
  gap: 12px;
}

.author-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.author-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.post-time {
  font-size: 12px;
  color: #909399;
}

.topic-actions {
  flex-shrink: 0;
}

.topic-title {
  margin: 0 0 16px 0;
  font-size: 22px;
  color: #303133;
  line-height: 1.4;
}

.topic-content {
  font-size: 15px;
  color: #606266;
  line-height: 1.8;
  white-space: pre-wrap;
}

.replies-card {
  margin-bottom: 16px;
}

.replies-header {
  font-weight: 500;
}

.replies-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.reply-item {
  display: flex;
  gap: 12px;
}

.reply-body {
  flex: 1;
  min-width: 0;
}

.reply-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.reply-time {
  font-size: 12px;
  color: #909399;
}

.reply-content {
  font-size: 14px;
  color: #303133;
  line-height: 1.6;
  white-space: pre-wrap;
}

.reply-media {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.media-img {
  width: 100px;
  height: 100px;
  border-radius: 4px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

.reply-input-card {
  margin-bottom: 16px;
}

.reply-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>