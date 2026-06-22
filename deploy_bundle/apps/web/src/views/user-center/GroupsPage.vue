<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ChatLineRound, Clock, User, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import discussionApi from '@/api/discussion'
import type { DiscussionGroup } from '@/types'

const router = useRouter()
const loading = ref(false)
const groups = ref<DiscussionGroup[]>([])
const notice = ref<string>('')
const createDialogVisible = ref(false)
const createForm = ref({ name: '', description: '', is_public: false })
const createLoading = ref(false)

async function fetchGroups() {
  loading.value = true
  try {
    const res = await discussionApi.groups.list()
    groups.value = res.data
    notice.value = res.notice || ''
  } finally {
    loading.value = false
  }
}

function gotoGroup(id: string) {
  router.push(`/user-center/groups/${id}`)
}

async function handleCreateGroup() {
  if (!createForm.value.name.trim()) {
    ElMessage.warning('请输入小组名称')
    return
  }
  createLoading.value = true
  try {
    const group = await discussionApi.groups.create(createForm.value)
    ElMessage.success('小组创建成功')
    createDialogVisible.value = false
    createForm.value = { name: '', description: '', is_public: false }
    await fetchGroups()
    // 跳转到新创建的小组
    gotoGroup((group as any).id)
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '创建失败')
  } finally {
    createLoading.value = false
  }
}

function getRoleLabel(role?: string) {
  switch (role) {
    case 'CREATOR': return '创建者'
    case 'ADMIN': return '管理员'
    default: return '成员'
  }
}

function getRoleType(role?: string) {
  switch (role) {
    case 'CREATOR': return 'danger'
    case 'ADMIN': return 'warning'
    default: return 'primary'
  }
}

onMounted(fetchGroups)
</script>

<template>
  <div class="groups-page">
    <ElCard v-loading="loading">
      <template #header>
        <div class="header">
          <h2 class="page-title">我的小组</h2>
          <ElButton type="primary" :icon="Plus" @click="createDialogVisible = true">
            创建小组
          </ElButton>
        </div>
      </template>

      <ElAlert
        v-if="notice"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        {{ notice }}
      </ElAlert>

      <div v-if="groups.length > 0" class="group-grid">
        <div
          v-for="g in groups"
          :key="g.id"
          class="group-card"
          @click="gotoGroup(g.id)"
        >
          <div class="group-header">
            <h3 class="group-name">{{ g.name }}</h3>
            <ElTag :type="getRoleType(g.my_role)" size="small">
              {{ getRoleLabel(g.my_role) }}
            </ElTag>
          </div>
          <p v-if="g.description" class="group-desc">{{ g.description }}</p>
          <div class="group-meta">
            <span>
              <ElIcon><User /></ElIcon>
              {{ g.member_count }} 人
            </span>
            <span>
              <ElIcon><ChatLineRound /></ElIcon>
              {{ g.topic_count }} 话题
            </span>
            <span>
              <ElIcon><Clock /></ElIcon>
              {{ new Date(g.last_active_at).toLocaleString() }}
            </span>
          </div>
          <div class="group-footer">
            <ElBadge
              v-if="g.unread_topic_count > 0"
              :value="g.unread_topic_count"
              :max="99"
              class="unread-badge"
            />
            <ElButton type="primary" plain class="enter-btn">进入小组</ElButton>
          </div>
        </div>
      </div>

      <ElEmpty
        v-else-if="!loading"
        description="暂未加入任何小组"
      >
        <template #image>
          <ElIcon :size="64" color="#c0c4cc"><ChatLineRound /></ElIcon>
        </template>
        <ElButton type="primary" @click="createDialogVisible = true">
          创建第一个小组
        </ElButton>
      </ElEmpty>
    </ElCard>

    <!-- 创建小组对话框 -->
    <ElDialog
      v-model="createDialogVisible"
      title="创建小组"
      width="480px"
      :close-on-click-modal="false"
    >
      <ElForm :model="createForm" label-width="80px">
        <ElFormItem label="小组名称" required>
          <ElInput
            v-model="createForm.name"
            placeholder="请输入小组名称"
            maxlength="50"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="小组描述">
          <ElInput
            v-model="createForm.description"
            type="textarea"
            :rows="3"
            placeholder="简要描述小组的目的和内容"
            maxlength="200"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="公开小组">
          <ElSwitch v-model="createForm.is_public" />
          <span class="form-tip">公开小组可见，但加入仍需邀请</span>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="createDialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="createLoading" @click="handleCreateGroup">
          创建
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.groups-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.group-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 18px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.group-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.group-name {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.group-desc {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #909399;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.group-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: #909399;
  margin-bottom: 16px;
}

.group-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.group-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  border-top: 1px solid #f0f2f5;
  padding-top: 12px;
}

.unread-badge {
  margin-right: auto;
}

.enter-btn {
  width: 100px;
}

.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}
</style>