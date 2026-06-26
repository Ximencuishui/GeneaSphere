<template>
  <div class="reviews-page">
    <div class="page-header">
      <h2>家庭关系变更审核</h2>
    </div>

    <ElCard>
      <ElForm :inline="true" class="filter-form">
        <ElFormItem label="状态">
          <ElSelect v-model="filterStatus" placeholder="全部" clearable @change="fetchData">
            <ElOption label="待审核" value="pending" />
            <ElOption label="已通过" value="approved" />
            <ElOption label="已驳回" value="rejected" />
            <ElOption label="自动通过" value="auto_approved" />
            <ElOption label="需线下确认" value="needs_manual" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="类型">
          <ElSelect v-model="filterType" placeholder="全部" clearable @change="fetchData">
            <ElOption label="婚姻状态" value="marriage" />
            <ElOption label="配偶" value="spouse" />
            <ElOption label="子女" value="child" />
            <ElOption label="抚养关系" value="custody" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" @click="fetchData">查询</ElButton>
        </ElFormItem>
      </ElForm>

      <ElTable :data="changes" v-loading="loading" style="width: 100%">
        <ElTableColumn prop="created_at" label="时间" width="170">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="person_name" label="当事人" width="120" />
        <ElTableColumn prop="change_type" label="类型" width="100">
          <template #default="{ row }">
            <ElTag :type="typeTag(row.change_type)" size="small">{{ typeLabel(row.change_type) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="变更摘要" min-width="200">
          <template #default="{ row }">
            <div class="state-preview">
              <span v-if="row.previous_state" class="old">{{ formatStateBrief(row.previous_state) }}</span>
              <ElIcon v-if="row.previous_state" style="margin: 0 8px"><ArrowRight /></ElIcon>
              <span class="new">{{ formatStateBrief(row.current_state) }}</span>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="status" label="状态" width="120">
          <template #default="{ row }">
            <ElTag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" @click="viewDetail(row)">详情</ElButton>
            <ElButton v-if="row.status === 'pending' || row.status === 'needs_manual'" size="small" type="success" @click="approve(row)">通过</ElButton>
            <ElButton v-if="row.status === 'pending' || row.status === 'needs_manual'" size="small" type="danger" @click="reject(row)">驳回</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

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

    <!-- 详情抽屉 -->
    <ElDrawer v-model="drawerVisible" title="变更详情" size="600px">
      <template v-if="detail">
        <ElDescriptions :column="1" border>
          <ElDescriptionsItem label="当事人">{{ detail.person_name }}</ElDescriptionsItem>
          <ElDescriptionsItem label="操作人">{{ detail.operator_phone }}</ElDescriptionsItem>
          <ElDescriptionsItem label="变更类型">{{ typeLabel(detail.change_type) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="状态">
            <ElTag :type="statusTag(detail.status)" size="small">{{ statusLabel(detail.status) }}</ElTag>
          </ElDescriptionsItem>
          <ElDescriptionsItem v-if="detail.reject_reason" label="驳回理由">{{ detail.reject_reason }}</ElDescriptionsItem>
          <ElDescriptionsItem v-if="detail.reviewed_at" label="审核时间">{{ formatDate(detail.reviewed_at) }}</ElDescriptionsItem>
        </ElDescriptions>

        <h4 style="margin: 20px 0 8px">变更前</h4>
        <pre class="state-json">{{ formatState(detail.previous_state) }}</pre>

        <h4 style="margin: 20px 0 8px">变更后</h4>
        <pre class="state-json">{{ formatState(detail.current_state) }}</pre>
      </template>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { familyRelationApi } from '@/api/familyRelation'

const changes = ref<any[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const filterStatus = ref('')
const filterType = ref('')

const drawerVisible = ref(false)
const detail = ref<any>(null)

function formatDate(d: string) { return d ? new Date(d).toLocaleString() : '' }

function typeLabel(t: string) {
  const m: Record<string, string> = { marriage: '婚姻状态', spouse: '配偶', child: '子女', custody: '抚养关系' }
  return m[t] || t
}
function typeTag(t: string) {
  const m: Record<string, string> = { marriage: 'primary', spouse: 'success', child: 'warning', custody: 'info' }
  return m[t] || ''
}
function statusLabel(s: string) {
  const m: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已驳回', auto_approved: '自动通过', needs_manual: '需线下确认' }
  return m[s] || s
}
function statusTag(s: string) {
  const m: Record<string, string> = { pending: 'warning', approved: 'success', rejected: 'danger', auto_approved: 'info', needs_manual: 'warning' }
  return m[s] || ''
}
function formatState(s: any) { return s ? JSON.stringify(s, null, 2) : '无' }
function formatStateBrief(s: any) {
  if (!s || Object.keys(s).length === 0) return '—'
  const first = Object.entries(s)[0]
  return `${first[0]}: ${first[1]}`
}

async function fetchData() {
  loading.value = true
  try {
    const clanSlug = new URLSearchParams(location.search).get('clanId') || '1'
    const res: any = await familyRelationApi.admin.listChanges({
      clanId,
      status: filterStatus.value || undefined,
      change_type: filterType.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    })
    changes.value = res.data
    total.value = res.pagination.total
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function viewDetail(row: any) {
  try {
    const res: any = await familyRelationApi.admin.getChange(row.id)
    detail.value = res
    drawerVisible.value = true
  } catch (err) {
    ElMessage.error('获取详情失败')
  }
}

async function approve(row: any) {
  try {
    await familyRelationApi.admin.approve(row.id)
    ElMessage.success('已通过')
    await fetchData()
  } catch { ElMessage.error('操作失败') }
}

async function reject(row: any) {
  ElMessageBox.prompt('请输入驳回理由', '驳回', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputValidator: (v: string) => !!v || '理由不能为空',
  }).then(async ({ value }) => {
    try {
      await familyRelationApi.admin.reject(row.id, value)
      ElMessage.success('已驳回')
      await fetchData()
    } catch { ElMessage.error('操作失败') }
  }).catch(() => {})
}

onMounted(fetchData)
</script>

<style scoped>
.filter-form { margin-bottom: 16px; }
.page-header { margin-bottom: 24px; }
.page-header h2 { margin: 0; color: #303133; }
.state-preview { display: flex; align-items: center; font-size: 13px; }
.state-preview .old { color: #909399; }
.state-preview .new { color: #409eff; font-weight: 500; }
.state-json { margin: 0; font-size: 12px; background: #f5f7fa; padding: 12px; border-radius: 4px; white-space: pre-wrap; max-height: 300px; overflow: auto; }
.pagination-wrap { margin-top: 20px; display: flex; justify-content: center; }
</style>
