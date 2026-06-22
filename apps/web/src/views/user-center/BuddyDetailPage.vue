<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getMatchDetail, respondMatch } from '@/api/buddy'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const matchDetail = ref<any>(null)

const isRequester = computed(() => {
  // 判断当前用户是发起人还是接收人
  return true // 简化处理，实际应从用户store获取
})

const statusText = computed(() => {
  if (!matchDetail.value) return ''
  switch (matchDetail.value.status) {
    case 'PENDING':
      return '等待回应'
    case 'ACCEPTED':
      return '已接受'
    case 'DECLINED':
      return '已拒绝'
    case 'IGNORED':
      return '已忽略'
    case 'EXPIRED':
      return '已过期'
    default:
      return '未知'
  }
})

const statusType = computed(() => {
  if (!matchDetail.value) return 'info'
  switch (matchDetail.value.status) {
    case 'PENDING':
      return 'warning'
    case 'ACCEPTED':
      return 'success'
    case 'DECLINED':
    case 'IGNORED':
    case 'EXPIRED':
      return 'danger'
    default:
      return 'info'
  }
})

// 加载匹配详情
async function loadDetail() {
  const recordId = parseInt(route.params.id as string)
  loading.value = true
  try {
    const res = await getMatchDetail(recordId)
    matchDetail.value = res.data
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '加载失败')
    router.back()
  } finally {
    loading.value = false
  }
}

// 回应匹配
async function handleRespond(action: 'accept' | 'decline' | 'ignore') {
  const recordId = parseInt(route.params.id as string)
  try {
    await respondMatch(recordId, { action })
    
    const messages = {
      accept: '已接受，你们已成为儿时伙伴！',
      decline: '已婉拒，尊重对方的选择',
      ignore: '已忽略',
    }
    ElMessage.success(messages[action])
    
    await loadDetail()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '操作失败')
  }
}

onMounted(() => {
  loadDetail()
})
</script>

<template>
  <div class="buddy-detail-page" v-loading="loading">
    <div v-if="matchDetail" class="detail-content">
      <!-- 头部信息 -->
      <ElCard class="header-card" shadow="hover">
        <div class="header-content">
          <div class="user-section">
            <ElAvatar :size="60" :src="matchDetail.requester?.avatar_url">
              {{ matchDetail.requester?.nickname?.charAt(0) || '请' }}
            </ElAvatar>
            <div class="arrow">
              <ElIcon :size="24"><Right /></ElIcon>
            </div>
            <ElAvatar :size="60" :src="matchDetail.matched_user?.avatar_url">
              {{ matchDetail.matched_user?.nickname?.charAt(0) || '应' }}
            </ElAvatar>
          </div>
          <div class="status-section">
            <ElTag :type="statusType" size="large">{{ statusText }}</ElTag>
          </div>
        </div>
      </ElCard>

      <!-- 匹配信息 -->
      <ElCard class="info-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <span>匹配信息</span>
          </div>
        </template>

        <ElDescriptions :column="1" border>
          <ElDescriptionsItem label="匹配度">
            <ElTag :type="matchDetail.match_score >= 80 ? 'success' : 'warning'">
              {{ matchDetail.match_score }}%
            </ElTag>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="匹配依据">
            <div v-for="(reason, idx) in matchDetail.match_reasons" :key="idx">
              {{ reason }}
            </div>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="打招呼消息" v-if="matchDetail.greeting_message">
            <ElAlert
              :title="matchDetail.greeting_message"
              type="info"
              :closable="false"
            />
          </ElDescriptionsItem>
          <ElDescriptionsItem label="发起时间">
            {{ new Date(matchDetail.contacted_at || matchDetail.created_at).toLocaleString() }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="回应时间" v-if="matchDetail.responded_at">
            {{ new Date(matchDetail.responded_at).toLocaleString() }}
          </ElDescriptionsItem>
        </ElDescriptions>
      </ElCard>

      <!-- 用户信息 -->
      <ElRow :gutter="20" class="users-card">
        <ElCol :span="12">
          <ElCard shadow="hover">
            <template #header>发起人</template>
            <div class="user-info">
              <ElAvatar :size="50" :src="matchDetail.requester?.avatar_url">
                {{ matchDetail.requester?.nickname?.charAt(0) || '请' }}
              </ElAvatar>
              <div class="user-meta">
                <div class="nickname">{{ matchDetail.requester?.nickname || '匿名用户' }}</div>
                <div class="birth-date" v-if="matchDetail.requester?.birth_date">
                  出生年份: {{ new Date(matchDetail.requester.birth_date).getFullYear() }}
                </div>
              </div>
            </div>
          </ElCard>
        </ElCol>
        <ElCol :span="12">
          <ElCard shadow="hover">
            <template #header>接收人</template>
            <div class="user-info">
              <ElAvatar :size="50" :src="matchDetail.matched_user?.avatar_url">
                {{ matchDetail.matched_user?.nickname?.charAt(0) || '应' }}
              </ElAvatar>
              <div class="user-meta">
                <div class="nickname">{{ matchDetail.matched_user?.nickname || '匿名用户' }}</div>
                <div class="birth-date" v-if="matchDetail.matched_user?.birth_date">
                  出生年份: {{ new Date(matchDetail.matched_user.birth_date).getFullYear() }}
                </div>
              </div>
            </div>
          </ElCard>
        </ElCol>
      </ElRow>

      <!-- 操作按钮 -->
      <div class="actions-section">
        <template v-if="matchDetail.status === 'PENDING'">
          <ElButton type="success" size="large" @click="handleRespond('accept')">
            <ElIcon><Check /></ElIcon>
            接受
          </ElButton>
          <ElButton type="danger" size="large" @click="handleRespond('decline')">
            <ElIcon><Close /></ElIcon>
            婉拒
          </ElButton>
          <ElButton size="large" @click="handleRespond('ignore')">
            忽略
          </ElButton>
        </template>
        <template v-else-if="matchDetail.status === 'ACCEPTED'">
          <ElAlert
            title="恭喜！你们已经成为儿时伙伴，可以互相查看联系方式了。"
            type="success"
            :closable="false"
            show-icon
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.buddy-detail-page {
  max-width: 900px;
  margin: 0 auto;
}

.header-card {
  margin-bottom: 24px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-section {
  display: flex;
  align-items: center;
  gap: 20px;
}

.arrow {
  color: #409eff;
}

.status-section {
  text-align: right;
}

.info-card {
  margin-bottom: 24px;
}

.card-header {
  font-size: 16px;
  font-weight: 600;
}

.users-card {
  margin-bottom: 24px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-meta {
  flex: 1;
}

.nickname {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.birth-date {
  font-size: 13px;
  color: #909399;
}

.actions-section {
  display: flex;
  gap: 16px;
  justify-content: center;
  padding: 24px 0;
}

@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    gap: 16px;
  }

  .status-section {
    text-align: left;
  }

  .user-section {
    flex-direction: column;
  }

  .arrow {
    transform: rotate(90deg);
  }

  .users-card .el-col {
    margin-bottom: 16px;
  }

  .actions-section {
    flex-direction: column;
  }

  .actions-section .el-button {
    width: 100%;
  }
}
</style>
