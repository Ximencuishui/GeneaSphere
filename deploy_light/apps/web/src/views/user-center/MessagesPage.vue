<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import personalSpaceApi from '@/api/personalSpace'
import type { UserMessage, SpacePrivacyLevel } from '@/types'

const router = useRouter()

// ==================== 状态 ====================
const loading = ref(false)
const messages = ref<UserMessage[]>([])
const pagination = ref({ page: 1, total: 0, total_pages: 0 })
const filterYear = ref<number | undefined>(undefined)

// 发布表单
const postContent = ref('')
const postPrivacy = ref<SpacePrivacyLevel>('clan')
const postImage = ref<File | null>(null)
const posting = ref(false)

// 编辑
const editingId = ref<string | null>(null)
const editContent = ref('')

const contentLength = computed(() => postContent.value.length)

const privacyOptions = [
  { value: 'self', label: '仅自己可见', icon: 'Lock' },
  { value: 'clan', label: '全族公开', icon: 'UserFilled' },
  { value: 'lineage', label: '上下几代公开', icon: 'Connection' },
  { value: 'public', label: '平台公开', icon: 'View' },
  { value: 'same_location', label: '同地点用户公开', icon: 'LocationFilled' },
]

const currentYear = new Date().getFullYear()
const yearOptions = computed(() => {
  const years: number[] = []
  for (let y = currentYear; y >= 2024; y--) years.push(y)
  return years
})

function getPrivacyLabel(val: string) {
  return privacyOptions.find((p) => p.value === val)?.label || val
}

function getPrivacyIcon(val: string) {
  return privacyOptions.find((p) => p.value === val)?.icon || 'Lock'
}

// ==================== 数据加载 ====================

async function fetchMessages(page = 1) {
  loading.value = true
  try {
    const res = (await personalSpaceApi.messages.list({
      year: filterYear.value,
      page,
      pageSize: 20,
    })) as unknown as { data: UserMessage[]; pagination: any }
    messages.value = res.data
    pagination.value = res.pagination
  } catch (err) {
    console.error('获取留言列表失败', err)
  } finally {
    loading.value = false
  }
}

// ==================== 发布留言 ====================

function handleImageSelect(file: any) {
  postImage.value = file.raw
}

function removeImage() {
  postImage.value = null
}

async function postMessage() {
  if (!postContent.value.trim()) {
    ElMessage.warning('请输入留言内容')
    return
  }
  if (postContent.value.length > 200) {
    ElMessage.warning('留言内容不能超过200字')
    return
  }
  posting.value = true
  try {
    await personalSpaceApi.messages.create({
      content: postContent.value,
      privacy: postPrivacy.value,
      image: postImage.value || undefined,
    })
    ElMessage.success('留言已发布')
    postContent.value = ''
    postPrivacy.value = 'clan'
    postImage.value = null
    await fetchMessages(1)
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '发布失败')
  } finally {
    posting.value = false
  }
}

// ==================== 编辑留言 ====================

function startEdit(msg: UserMessage) {
  editingId.value = msg.id
  editContent.value = msg.content
}

function cancelEdit() {
  editingId.value = null
  editContent.value = ''
}

async function saveEdit(id: string) {
  if (!editContent.value.trim()) {
    ElMessage.warning('留言内容不能为空')
    return
  }
  if (editContent.value.length > 200) {
    ElMessage.warning('留言内容不能超过200字')
    return
  }
  try {
    await personalSpaceApi.messages.update(id, { content: editContent.value })
    ElMessage.success('留言已更新')
    editingId.value = null
    await fetchMessages(pagination.value.page)
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '更新失败')
  }
}

// ==================== 删除留言 ====================

async function deleteMessage(msg: UserMessage) {
  try {
    await ElMessageBox.confirm('确定删除此留言吗？', '确认删除', { type: 'warning' })
    await personalSpaceApi.messages.delete(msg.id)
    ElMessage.success('留言已删除')
    await fetchMessages(pagination.value.page)
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error('删除失败')
  }
}

// ==================== 生命周期 ====================

onMounted(() => {
  fetchMessages()
})
</script>

<template>
  <div class="messages-page">
    <!-- 个人空间 Tab 导航 -->
    <div class="space-tabs">
      <ElButton text class="tab-btn" @click="router.push('/user-center/personal-space/albums')">相册</ElButton>
      <ElButton type="primary" text class="tab-btn active">留言板</ElButton>
    </div>

    <h3 class="page-title">留言板</h3>

    <!-- 发布留言区 -->
    <div class="post-area">
      <div v-if="editingId === null" class="post-form">
        <ElInput
          v-model="postContent"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="说点什么..."
        />
        <div class="post-footer">
          <div class="post-options">
            <ElUpload
              :auto-upload="false"
              :show-file-list="false"
              accept="image/*"
              :limit="1"
              :on-change="handleImageSelect"
            >
              <ElButton icon="Camera" text size="small">
                {{ postImage ? '已选配图' : '可选配图' }}
              </ElButton>
            </ElUpload>
            <ElTag
              v-if="postImage"
              closable
              size="small"
              @close="removeImage"
              class="image-tag"
            >
              {{ postImage.name }}
            </ElTag>
            <ElSelect v-model="postPrivacy" size="small" style="width: 140px">
              <ElOption
                v-for="opt in privacyOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </ElSelect>
          </div>
          <ElButton
            type="primary"
            :loading="posting"
            :disabled="contentLength === 0 || contentLength > 200"
            @click="postMessage"
          >
            发表
          </ElButton>
        </div>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="filter-bar">
      <ElSelect
        v-model="filterYear"
        clearable
        placeholder="按年份筛选"
        style="width: 140px"
        @change="fetchMessages(1)"
      >
        <ElOption
          v-for="y in yearOptions"
          :key="y"
          :label="`${y}年`"
          :value="y"
        />
      </ElSelect>
    </div>

    <!-- 留言列表 -->
    <div v-if="loading && messages.length === 0" class="loading-area">
      <ElSkeleton :rows="3" animated />
    </div>

    <ElEmpty v-else-if="messages.length === 0" description="暂无留言" />

    <div v-else class="message-list">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message-card"
      >
        <div class="message-header">
          <div class="message-avatar">
            <img
              v-if="msg.author?.avatar_url"
              :src="msg.author.avatar_url"
              alt=""
            />
            <ElIcon v-else :size="24" color="#fff"><UserFilled /></ElIcon>
          </div>
          <div class="message-author-info">
            <span class="author-name">{{ msg.author?.nickname || '用户' }}</span>
            <span class="message-time">
              {{ new Date(msg.created_at).toLocaleString() }}
              <span v-if="msg.is_edited" class="edited-tag">(已编辑)</span>
            </span>
          </div>
          <ElTag size="small" effect="plain" class="privacy-tag">
            <ElIcon :size="12"><component :is="getPrivacyIcon(msg.privacy)" /></ElIcon>
            {{ getPrivacyLabel(msg.privacy) }}
          </ElTag>
        </div>

        <!-- 内容区 -->
        <div class="message-body">
          <template v-if="editingId === msg.id">
            <ElInput
              v-model="editContent"
              type="textarea"
              :rows="3"
              maxlength="200"
              show-word-limit
            />
            <div class="edit-actions">
              <ElButton size="small" @click="cancelEdit">取消</ElButton>
              <ElButton size="small" type="primary" @click="saveEdit(msg.id)">保存</ElButton>
            </div>
          </template>
          <template v-else>
            <p class="message-text">{{ msg.content }}</p>
            <div v-if="msg.image_url" class="message-image">
              <img :src="msg.image_url" alt="配图" />
            </div>
          </template>
        </div>

        <!-- 操作按钮 -->
        <div v-if="editingId !== msg.id" class="message-footer">
          <div class="message-stats">
            <span>👍 {{ msg.like_count }}</span>
          </div>
          <div class="message-actions">
            <ElButton
              v-if="msg.can_edit"
              icon="Edit"
              text
              size="small"
              @click="startEdit(msg)"
            >
              编辑
            </ElButton>
            <ElButton
              icon="Delete"
              text
              size="small"
              type="danger"
              @click="deleteMessage(msg)"
            >
              删除
            </ElButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="pagination.total_pages > 1" class="pagination">
      <ElPagination
        :current-page="pagination.page"
        :page-size="20"
        :total="pagination.total"
        layout="prev, pager, next"
        @current-change="(p: number) => fetchMessages(p)"
      />
    </div>
  </div>
</template>

<style scoped>
.messages-page {
  max-width: 800px;
  margin: 0 auto;
}

.space-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid #e4e7ed;
  padding-bottom: 8px;
}

.tab-btn {
  font-size: 15px;
  padding: 8px 16px;
}

.tab-btn.active {
  font-weight: 600;
}

.page-title {
  margin: 0 0 20px;
  font-size: 18px;
  color: #303133;
}

.post-area {
  margin-bottom: 20px;
}

.post-form {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.post-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.post-options {
  display: flex;
  align-items: center;
  gap: 12px;
}

.image-tag {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-bar {
  margin-bottom: 16px;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.message-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5d4037, #8d6e63);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.message-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.message-author-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.author-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.message-time {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.edited-tag {
  color: #e6a23c;
  font-size: 11px;
}

.privacy-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.message-body {
  margin-bottom: 8px;
}

.message-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-image {
  margin-top: 10px;
}

.message-image img {
  max-width: 300px;
  max-height: 300px;
  border-radius: 6px;
  object-fit: cover;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.message-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #f0f2f5;
  padding-top: 8px;
}

.message-stats {
  font-size: 13px;
  color: #909399;
}

.message-actions {
  display: flex;
  gap: 4px;
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.loading-area {
  padding: 20px;
}
</style>
