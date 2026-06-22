<template>
  <div class="history-page">
    <div class="page-header">
      <h2>我的家庭关系变更历史</h2>
      <ElButton @click="$router.push('/user-center/family-relation')">返回更新</ElButton>
    </div>

    <ElCard>
      <!-- 时间筛选 -->
      <div class="filter-bar">
        <ElDatePicker
          v-model="startDate"
          type="date"
          placeholder="开始日期"
          value-format="YYYY-MM-DD"
          style="width: 160px"
          clearable
        />
        <span class="filter-sep">至</span>
        <ElDatePicker
          v-model="endDate"
          type="date"
          placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 160px"
          clearable
        />
        <ElButton type="primary" @click="fetchData">查询</ElButton>
      </div>

      <ElTabs v-model="activeTab" @tab-click="fetchData">
        <ElTabPane label="全部" name="all" />
        <ElTabPane label="婚姻状态" name="marriage" />
        <ElTabPane label="配偶" name="spouse" />
        <ElTabPane label="子女" name="child" />
        <ElTabPane label="抚养关系" name="custody" />
      </ElTabs>

      <ElTimeline v-if="historyList.length > 0">
        <ElTimelineItem
          v-for="item in historyList"
          :key="item.id"
          :timestamp="formatDate(item.created_at)"
          placement="top"
        >
          <ElCard shadow="never" class="history-card">
            <div class="history-header">
              <ElTag :type="tagType(item.change_type)" size="small">
                {{ labelMap[item.change_type] }}
              </ElTag>
              <ElTag v-if="item.needs_manual" type="warning" size="small">待管理员处理</ElTag>
              <ElTag v-if="item.is_disputed" type="danger" size="small">争议中</ElTag>
              <ElTag :type="statusType(item.status)" size="small">
                {{ statusLabelMap[item.status] }}
              </ElTag>
              <span class="privacy-tag" v-if="item.privacy_level === 'self'">仅自己可见</span>
              <span class="privacy-tag admin-tag" v-else-if="item.privacy_level === 'admin'">管理员可见</span>
            </div>
            <div class="history-summary">
              <pre v-if="item.current_state" class="state-json">{{ formatState(item.current_state) }}</pre>
            </div>
          </ElCard>
        </ElTimelineItem>
      </ElTimeline>

      <ElEmpty v-else description="暂无变更记录" />

      <div class="pagination-wrap" v-if="total > 0">
        <ElPagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="fetchData"
        />
      </div>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUserCenterStore } from '@/stores/userCenter'

const userStore = useUserCenterStore()

const activeTab = ref('all')
const historyList = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const startDate = ref('')
const endDate = ref('')

const labelMap: Record<string, string> = {
  marriage: '婚姻状态',
  spouse: '配偶',
  child: '子女',
  custody: '抚养关系',
}

const statusLabelMap: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  auto_approved: '自动通过',
  needs_manual: '需线下确认',
  resolved: '已解决',
}

function tagType(changeType: string) {
  const map: Record<string, string> = { marriage: 'primary', spouse: 'success', child: 'warning', custody: 'info' }
  return map[changeType] || ''
}

function statusType(status: string) {
  const map: Record<string, string> = { pending: 'warning', approved: 'success', rejected: 'danger', auto_approved: 'success', needs_manual: 'warning' }
  return map[status] || ''
}

function formatDate(d: string) {
  return new Date(d).toLocaleString()
}

function formatState(state: any) {
  if (typeof state === 'string') return state
  return JSON.stringify(state, null, 2)
}

async function fetchData() {
  const persons = await userStore.fetchMyPerson()
  const personId = userStore.linkedPersons[0]?.person_id || undefined
  const res: any = await userStore.fetchRelationHistory({
    person_id: personId,
    change_type: activeTab.value === 'all' ? undefined : activeTab.value,
    start_date: startDate.value || undefined,
    end_date: endDate.value || undefined,
    page: page.value,
    pageSize: pageSize.value,
  })
  if (res) {
    historyList.value = userStore.relationHistory
    total.value = res.pagination?.total || 0
  }
}

onMounted(fetchData)
</script>

<style scoped>
.history-page { max-width: 800px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-header h2 { margin: 0; color: #303133; }
.filter-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.filter-sep { color: #909399; font-size: 14px; }
.history-card { margin-bottom: 8px; }
.history-header { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.privacy-tag { font-size: 12px; color: #909399; }
.admin-tag { color: #e6a23c; }
.history-summary { font-size: 14px; color: #606266; }
.state-json { margin: 0; font-size: 12px; background: #f5f7fa; padding: 8px; border-radius: 4px; white-space: pre-wrap; }
.pagination-wrap { margin-top: 20px; display: flex; justify-content: center; }
</style>
