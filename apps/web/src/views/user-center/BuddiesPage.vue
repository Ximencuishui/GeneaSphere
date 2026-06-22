<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { findBuddies, sendGreeting, getMyMatches } from '@/api/buddy'

const router = useRouter()
const loading = ref(false)
const matches = ref<any[]>([])
const findForm = ref({
  location_name: '',
  start_year: undefined as number | undefined,
  end_year: undefined as number | undefined,
})

// 发起寻找
async function handleFind() {
  if (!findForm.value.location_name) {
    ElMessage.warning('请输入童年地点名称')
    return
  }

  loading.value = true
  try {
    const res = await findBuddies(findForm.value)
    matches.value = res.data
    if (matches.value.length === 0) {
      ElMessage.info('暂时没有找到小伙伴，建议补充更多童年地点信息')
    } else {
      ElMessage.success(`找到 ${matches.value.length} 位可能的小伙伴`)
    }
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '寻找失败')
  } finally {
    loading.value = false
  }
}

// 发送打招呼
async function handleGreeting(matchedUserId: string) {
  try {
    await sendGreeting(matchedUserId, {
      message: '你好，我也是在那里长大的，还记得我吗？',
    })
    ElMessage.success('打招呼已发送，等待对方回应')
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '发送失败')
  }
}

// 查看详情
function viewDetail(matchId: number) {
  router.push(`/user-center/buddies/${matchId}`)
}

// 管理童年地点
function managePlaces() {
  router.push('/user-center/buddies/childhood-places')
}

onMounted(async () => {
  // 加载已有的匹配
  try {
    const res = await getMyMatches()
    matches.value = res.data
  } catch (error) {
    // 忽略错误
  }
})
</script>

<template>
  <div class="buddies-page">
    <div class="page-header">
      <h2>寻找儿时伙伴</h2>
      <ElButton type="primary" plain @click="managePlaces">
        <ElIcon><Location /></ElIcon>
        我的童年地点设置
      </ElButton>
    </div>

    <!-- 快捷入口 -->
    <ElCard class="quick-entry-card" shadow="hover">
      <ElRow :gutter="20">
        <ElCol :xs="24" :sm="8">
          <ElButton type="primary" style="width: 100%" @click="$refs.locationInput?.focus()">
            <ElIcon><Location /></ElIcon>
            按地点找
          </ElButton>
        </ElCol>
        <ElCol :xs="24" :sm="8">
          <ElButton type="success" style="width: 100%" disabled>
            <ElIcon><Picture /></ElIcon>
            按照片找 (开发中)
          </ElButton>
        </ElCol>
        <ElCol :xs="24" :sm="8">
          <ElButton type="warning" style="width: 100%" disabled>
            <ElIcon><Bell /></ElIcon>
            看看谁在找我 (开发中)
          </ElButton>
        </ElCol>
      </ElRow>
    </ElCard>

    <!-- 寻找表单 -->
    <ElCard class="find-form-card" shadow="hover">
      <ElForm :model="findForm" label-width="100px">
        <ElFormItem label="童年地点">
          <ElInput
            ref="locationInput"
            v-model="findForm.location_name"
            placeholder="例如：王家村、红旗小学"
            clearable
          />
        </ElFormItem>
        <ElFormItem label="时间段（可选）">
          <ElCol :span="11">
            <ElInputNumber
              v-model="findForm.start_year"
              :min="1900"
              :max="2020"
              placeholder="开始年份"
              style="width: 100%"
            />
          </ElCol>
          <ElCol :span="2" style="text-align: center">-</ElCol>
          <ElCol :span="11">
            <ElInputNumber
              v-model="findForm.end_year"
              :min="1900"
              :max="2020"
              placeholder="结束年份"
              style="width: 100%"
            />
          </ElCol>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :loading="loading" @click="handleFind">
            <ElIcon><Search /></ElIcon>
            开始寻找
          </ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <!-- 匹配结果列表 -->
    <ElCard v-if="matches.length > 0" class="matches-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>匹配结果 ({{ matches.length }})</span>
        </div>
      </template>

      <ElTable :data="matches" style="width: 100%">
        <ElTableColumn label="用户" min-width="200">
          <template #default="{ row }">
            <div class="user-cell">
              <ElAvatar :size="40" :src="row.matched_user?.avatar_url">
                {{ row.matched_user?.nickname?.charAt(0) || '用' }}
              </ElAvatar>
              <div class="user-info">
                <div class="nickname">{{ row.matched_user?.nickname || '匿名用户' }}</div>
                <div class="location">{{ row.location }}</div>
              </div>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="匹配度" width="120">
          <template #default="{ row }">
            <ElTag :type="row.match_score >= 80 ? 'success' : row.match_score >= 60 ? 'warning' : 'info'">
              {{ row.match_score }}%
            </ElTag>
          </template>
        </ElTableColumn>

        <ElTableColumn label="匹配依据" min-width="250">
          <template #default="{ row }">
            <div v-for="(reason, idx) in row.match_reasons" :key="idx" class="reason-item">
              {{ reason }}
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" type="primary" @click="handleGreeting(row.matched_user.id)">
              打招呼
            </ElButton>
            <ElButton size="small" @click="viewDetail(row.id)">
              查看详情
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <!-- 空状态 -->
    <ElEmpty v-else-if="!loading" description="还没有匹配结果，试试寻找吧" />
  </div>
</template>

<style scoped>
.buddies-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.quick-entry-card {
  margin-bottom: 24px;
}

.find-form-card {
  margin-bottom: 24px;
}

.matches-card {
  margin-bottom: 24px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info {
  flex: 1;
}

.nickname {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.location {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.reason-item {
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
}

.reason-item:not(:last-child) {
  margin-bottom: 4px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .page-header h2 {
    font-size: 20px;
  }
}
</style>
