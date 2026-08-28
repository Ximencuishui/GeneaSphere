<!--
  我的申请（P2：三段式 tab）
  --------------------------------------------------------------------
  - tab 1：族谱修改（PersonModificationRequest：我提交的修改申请）
  - tab 2：寻亲 / 互验（VerificationSession：我作为 inviter 或 scanner 的会话）
  - tab 3：家庭关系（FamilyRelationChange：我作为 target_user 的变更）
  - 每个 tab 显示未处理 / 已通过 / 已驳回 三种状态的小标签计数
-->
<template>
  <div class="page">
    <header class="page-header">
      <h2 class="page-title">我的申请</h2>
      <p class="page-tip">
        集中查看你提交的<strong>族谱修改 / 寻亲会话 / 家庭关系变更</strong>三类申请，
        支持按状态筛选与分页加载。
      </p>
    </header>

    <ElTabs v-model="activeTab" class="outer-tabs">
      <!-- =========== tab 1：族谱修改 =========== -->
      <ElTabPane :label="`族谱修改 (${tabCounts.modification})`" name="modification">
        <ElSegmented
          v-model="filterStatus.modification"
          :options="statusOptions.modification"
          class="status-filter"
        />
        <ElTable
          :data="rows.modification"
          v-loading="loading.modification"
          border
          stripe
          style="margin-top: 12px"
        >
          <ElTableColumn prop="id" label="ID" width="80" />
          <ElTableColumn prop="field_name" label="修改字段" width="120" />
          <ElTableColumn label="原值 → 新值" min-width="220">
            <template #default="{ row }">
              <span class="diff-old">{{ row.old_value || '—' }}</span>
              <span class="diff-arrow">→</span>
              <span class="diff-new">{{ row.new_value }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="reason" label="修改原因" min-width="160" show-overflow-tooltip />
          <ElTableColumn label="状态" width="110">
            <template #default="{ row }">
              <ElTag :type="modStatusTag(row.status)">
                {{ modStatusText(row.status) }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="提交时间" width="170">
            <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
          </ElTableColumn>
        </ElTable>
        <div
          v-if="!loading.modification && rows.modification.length === 0"
          class="empty-tip"
        >
          暂无族谱修改申请
        </div>
        <ElPagination
          v-if="pagination.modification.total > pagination.modification.pageSize"
          class="pager"
          background
          layout="prev, pager, next, total"
          :page-size="pagination.modification.pageSize"
          :total="pagination.modification.total"
          :current-page="pagination.modification.page"
          @current-change="(p: number) => changePage('modification', p)"
        />
      </ElTabPane>

      <!-- =========== tab 2：寻亲 / 互验 =========== -->
      <ElTabPane :label="`寻亲 / 互验 (${tabCounts.verification})`" name="verification">
        <ElSegmented
          v-model="filterStatus.verification"
          :options="statusOptions.verification"
          class="status-filter"
        />
        <ElTable
          :data="rows.verification"
          v-loading="loading.verification"
          border
          stripe
          style="margin-top: 12px"
        >
          <ElTableColumn prop="id" label="会话 ID" width="100" />
          <ElTableColumn label="角色" width="80">
            <template #default="{ row }">
              <ElTag size="small" :type="row.inviter_user_id ? 'success' : 'warning'">
                {{ row.inviter_user_id ? '发起人' : '扫描者' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="扫描者" min-width="140">
            <template #default="{ row }">
              {{ row.scanner_nickname || row.scanner_phone || '匿名' }}
            </template>
          </ElTableColumn>
          <ElTableColumn prop="verify_method" label="验证方式" width="120" />
          <ElTableColumn label="状态" width="110">
            <template #default="{ row }">
              <ElTag :type="sessionStatusTag(row.status)">
                {{ sessionStatusText(row.status) }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="创建时间" width="170">
            <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
          </ElTableColumn>
          <ElTableColumn label="过期时间" width="170">
            <template #default="{ row }">{{ formatDate(row.expire_at) }}</template>
          </ElTableColumn>
        </ElTable>
        <div
          v-if="!loading.verification && rows.verification.length === 0"
          class="empty-tip"
        >
          暂无寻亲 / 互发验证会话
        </div>
        <ElPagination
          v-if="pagination.verification.total > pagination.verification.pageSize"
          class="pager"
          background
          layout="prev, pager, next, total"
          :page-size="pagination.verification.pageSize"
          :total="pagination.verification.total"
          :current-page="pagination.verification.page"
          @current-change="(p: number) => changePage('verification', p)"
        />
      </ElTabPane>

      <!-- =========== tab 3：家庭关系 =========== -->
      <ElTabPane :label="`家庭关系 (${tabCounts.relation_change})`" name="relation_change">
        <ElSegmented
          v-model="filterStatus.relation_change"
          :options="statusOptions.relation_change"
          class="status-filter"
        />
        <ElTable
          :data="rows.relation_change"
          v-loading="loading.relation_change"
          border
          stripe
          style="margin-top: 12px"
        >
          <ElTableColumn prop="id" label="ID" width="80" />
          <ElTableColumn label="变更类型" width="120">
            <template #default="{ row }">
              {{ relationTypeText(row.change_type) }}
            </template>
          </ElTableColumn>
          <ElTableColumn prop="change_reason" label="变更原因" min-width="160" show-overflow-tooltip />
          <ElTableColumn label="隐私级别" width="100">
            <template #default="{ row }">
              {{ privacyText(row.privacy_level) }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="状态" width="110">
            <template #default="{ row }">
              <ElTag :type="relationStatusTag(row.status)">
                {{ relationStatusText(row.status) }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="创建时间" width="170">
            <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
          </ElTableColumn>
        </ElTable>
        <div
          v-if="!loading.relation_change && rows.relation_change.length === 0"
          class="empty-tip"
        >
          暂无家庭关系变更
        </div>
        <ElPagination
          v-if="pagination.relation_change.total > pagination.relation_change.pageSize"
          class="pager"
          background
          layout="prev, pager, next, total"
          :page-size="pagination.relation_change.pageSize"
          :total="pagination.relation_change.total"
          :current-page="pagination.relation_change.page"
          @current-change="(p: number) => changePage('relation_change', p)"
        />
      </ElTabPane>
    </ElTabs>
  </div>
</template>

<script setup lang="ts">
/**
 * 我的申请（族员侧 · P2）
 * - 调用 /api/user/applications?category=...&status=...&page=...&pageSize=...
 * - 三 tab 互不影响，pagination 独立。
 */
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import userApi from '@/api/user'
import { useUserCenterStore } from '@/stores/userCenter'
import type { UserApplicationsResponse } from '@/types'

const userStore = useUserCenterStore()

type Category = 'modification' | 'verification' | 'relation_change'

const activeTab = ref<Category>('modification')

const rows = reactive<Record<Category, any[]>>({
  modification: [],
  verification: [],
  relation_change: [],
})

const loading = reactive<Record<Category, boolean>>({
  modification: false,
  verification: false,
  relation_change: false,
})

const pagination = reactive<
  Record<Category, { page: number; pageSize: number; total: number }>
>({
  modification: { page: 1, pageSize: 20, total: 0 },
  verification: { page: 1, pageSize: 20, total: 0 },
  relation_change: { page: 1, pageSize: 20, total: 0 },
})

const filterStatus = reactive<Record<Category, string>>({
  modification: '',
  verification: '',
  relation_change: '',
})

const statusOptions = {
  modification: [
    { label: '全部', value: '' },
    { label: '待审核', value: 'PENDING' },
    { label: '已通过', value: 'APPROVED' },
    { label: '已驳回', value: 'REJECTED' },
  ],
  verification: [
    { label: '全部', value: '' },
    { label: '进行中', value: 'PENDING' },
    { label: '已通过', value: 'PASSED' },
    { label: '未通过', value: 'FAILED' },
    { label: '已过期', value: 'EXPIRED' },
  ],
  relation_change: [
    { label: '全部', value: '' },
    { label: '待审核', value: 'pending' },
    { label: '已批准', value: 'approved' },
    { label: '已驳回', value: 'rejected' },
    { label: '自动批准', value: 'auto_approved' },
  ],
}

const tabCounts = reactive<Record<Category, number>>({
  modification: 0,
  verification: 0,
  relation_change: 0,
})

const formatDate = (d: string) => (d ? new Date(d).toLocaleString() : '—')

const modStatusText = (s: string) =>
  ({ PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' }[s] || s)
const modStatusTag = (s: string) =>
  ({ PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger' }[s] as any) || ''

const sessionStatusText = (s: string) =>
  ({ PENDING: '进行中', PASSED: '已通过', FAILED: '未通过', EXPIRED: '已过期' }[s] || s)
const sessionStatusTag = (s: string) =>
  ({ PENDING: 'warning', PASSED: 'success', FAILED: 'danger', EXPIRED: 'info' }[s] as any) || ''

const relationStatusText = (s: string) =>
  ({
    pending: '待审核',
    approved: '已批准',
    auto_approved: '自动批准',
    rejected: '已驳回',
    needs_manual: '需人工',
  }[s] || s)
const relationStatusTag = (s: string) =>
  ({
    pending: 'warning',
    approved: 'success',
    auto_approved: 'success',
    rejected: 'danger',
    needs_manual: 'warning',
  }[s] as any) || ''

const relationTypeText = (t: string) =>
  ({ marriage: '婚姻', spouse: '配偶', child: '子女', custody: '抚养' }[t] || t)
const privacyText = (p: string) =>
  ({ self: '本人可见', admin: '管理员可见', clan: '家族可见' }[p] || p)

const fetchTab = async (category: Category) => {
  loading[category] = true
  try {
    const { page, pageSize } = pagination[category]
    const res = (await userApi.applications.list({
      category,
      status: filterStatus[category] || undefined,
      page,
      pageSize,
    })) as unknown as UserApplicationsResponse
    rows[category] = res?.[category]?.data || []
    pagination[category].total = res?.[category]?.pagination?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading[category] = false
  }
}

const refreshAllCounts = async () => {
  try {
    const res = (await userApi.applications.list({ pageSize: 1 })) as unknown as UserApplicationsResponse
    tabCounts.modification = res?.modification?.pagination?.total || 0
    tabCounts.verification = res?.verification?.pagination?.total || 0
    tabCounts.relation_change = res?.relation_change?.pagination?.total || 0
  } catch (e: any) {
    // 静默失败：仅影响 tab 角标
    console.warn('[MyApplications] 加载 tab 计数失败:', e?.message)
  }
}

const changePage = (category: Category, p: number) => {
  pagination[category].page = p
  fetchTab(category)
}

// tab 切换 & 状态过滤变化时重新加载
watch(activeTab, (t) => {
  if (t) fetchTab(t as Category)
})
watch(
  () => ({ ...filterStatus }),
  () => {
    pagination[activeTab.value].page = 1
    fetchTab(activeTab.value)
  },
  { deep: true },
)

onMounted(async () => {
  if (!userStore.profile) {
    await userStore.fetchProfile()
  }
  await Promise.all([
    fetchTab('modification'),
    refreshAllCounts(),
  ])
})
</script>

<style scoped>
.page {
  padding: 16px;
}
.page-header {
  margin-bottom: 16px;
}
.page-title {
  margin: 0 0 4px 0;
  font-size: 18px;
  color: #303133;
}
.page-tip {
  margin: 0;
  color: #909399;
  font-size: 13px;
  line-height: 1.6;
}
.status-filter {
  margin-top: 8px;
}
.empty-tip {
  text-align: center;
  color: #909399;
  font-size: 13px;
  padding: 24px 0;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
.diff-old {
  color: #909399;
  text-decoration: line-through;
  margin-right: 6px;
}
.diff-arrow {
  color: #c9a96e;
  margin: 0 4px;
}
.diff-new {
  color: #5d4037;
  font-weight: 600;
}
</style>
