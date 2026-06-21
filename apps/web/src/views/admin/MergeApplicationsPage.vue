<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()

const clanId = ref('')
const loading = ref(false)
const applications = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const activeTab = ref('PENDING')

const fetchApplications = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/merge/applications', {
      params: {
        clanId: clanId.value,
        page: currentPage.value,
        pageSize: pageSize.value,
        status: activeTab.value,
      },
    })
    applications.value = res.data.data
    total.value = res.data.pagination.total
  } catch (error) {
    console.error('Failed to fetch applications:', error)
  } finally {
    loading.value = false
  }
}

const handleApprove = async (app: any) => {
  try {
    // 先获取详情进行比对
    const detail = await axios.get(`/api/admin/merge/applications/${app.id}`)
    const comparison = detail.data.comparison

    await ElMessageBox.confirm(
      `匹配度：${comparison.total_score}%\n\n建议：${comparison.suggestion}\n\n确定通过此申请？`,
      '确认归宗合并',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )

    // 选择挂载点（简化版，实际应该打开选择器）
    const mergeTargetId = prompt('请输入挂载点人物 ID：')
    if (!mergeTargetId) return

    await axios.post(`/api/admin/merge/applications/${app.id}/approve`, {
      merge_target_id: mergeTargetId,
    })
    ElMessage.success('申请已通过，正在执行归宗合并...')
    fetchApplications()
  } catch (error: any) {
    if (error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  }
}

const handleReject = async (app: any) => {
  try {
    const { value } = await ElMessageBox.prompt(
      '请输入拒绝理由',
      '拒绝申请',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /.+/,
        inputErrorMessage: '理由不能为空',
        inputType: 'textarea',
      }
    )
    await axios.post(`/api/admin/merge/applications/${app.id}/reject`, {
      reason: value,
    })
    ElMessage.success('已拒绝')
    fetchApplications()
  } catch (error: any) {
    if (error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  }
}

// 回滚功能
const rollbackDialogVisible = ref(false)
const snapshots = ref<any[]>([])
const rollbackLoading = ref(false)

const fetchSnapshots = async () => {
  try {
    const res = await axios.get('/api/admin/merge/snapshots', {
      params: { clanId: clanId.value },
    })
    snapshots.value = res.data
  } catch (error) {
    console.error('Failed to fetch snapshots:', error)
  }
}

const handleRollback = async (snapshot: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要回滚此快照吗？快照剩余有效时间 ${snapshot.expires_in_minutes} 分钟。`,
      '确认回滚',
      { confirmButtonText: '确定回滚', cancelButtonText: '取消', type: 'error' }
    )
    rollbackLoading.value = true
    await axios.post(`/api/admin/merge/rollback/${snapshot.id}`)
    ElMessage.success('回滚成功')
    rollbackDialogVisible.value = false
    fetchApplications()
  } catch (error: any) {
    if (error !== 'cancel' && error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  } finally {
    rollbackLoading.value = false
  }
}

const showRollbackDialog = () => {
  fetchSnapshots()
  rollbackDialogVisible.value = true
}

const handleMarkManual = async (app: any) => {
  try {
    await axios.post(`/api/admin/merge/applications/${app.id}/mark-manual`)
    ElMessage.success('已标记为需人工核查')
    fetchApplications()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '操作失败')
  }
}

onMounted(() => {
  clanId.value = route.query.clanId as string || '1'
  fetchApplications()
})
</script>

<template>
  <div class="merge-applications-page">
    <ElCard>
      <template #header>
        <div class="page-header">
          <h2>认亲申请管理</h2>
          <ElButton type="warning" @click="showRollbackDialog">
            查看可回滚快照
          </ElButton>
        </div>
      </template>

      <ElTabs v-model="activeTab" @tab-change="fetchApplications">
        <ElTabPane label="待处理" name="PENDING" />
        <ElTabPane label="已通过" name="APPROVED" />
        <ElTabPane label="已拒绝" name="REJECTED" />
        <ElTabPane label="需人工核查" name="NEEDS_MANUAL_REVIEW" />
      </ElTabs>

      <ElTable :data="applications" v-loading="loading">
        <ElTableColumn prop="applicant_phone" label="申请人" width="150" />
        <ElTableColumn prop="origin_place" label="祖籍地" width="150" />
        <ElTableColumn label="字辈信息" min-width="150">
          <template #default="{ row }">
            <ElTag v-for="x in row.xipai_info" :key="x" style="margin-right: 4px;">
              {{ x }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="ancestor_name" label="关键祖先" width="120" />
        <ElTableColumn prop="match_score" label="匹配度" width="100">
          <template #default="{ row }">
            <ElProgress
              v-if="row.match_score"
              :percentage="row.match_score"
              :color="row.match_score > 70 ? '#67C23A' : row.match_score > 40 ? '#E6A23C' : '#F56C6C'"
              :text-inside="true"
              :stroke-width="16"
            />
            <span v-else>-</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="status" label="状态" width="150">
          <template #default="{ row }">
            <ElTag
              :type="row.status === 'APPROVED' ? 'success' : row.status === 'REJECTED' ? 'danger' : 'warning'"
            >
              {{ row.status }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="created_at" label="申请时间" width="180">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleDateString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <ElButton
              v-if="row.status === 'PENDING'"
              type="success"
              size="small"
              @click="handleApprove(row)"
            >
              通过
            </ElButton>
            <ElButton
              v-if="row.status === 'PENDING'"
              type="danger"
              size="small"
              @click="handleReject(row)"
            >
              驳回
            </ElButton>
            <ElButton
              v-if="row.status === 'PENDING'"
              type="warning"
              size="small"
              @click="handleMarkManual(row)"
            >
              需人工核查
            </ElButton>
            <ElButton
              type="primary"
              size="small"
              @click="router.push('/admin/merge/applications/' + row.id)"
            >
              查看详情
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElEmpty v-if="!loading && applications.length === 0" description="暂无数据" />

    <!-- 回滚快照对话框 -->
    <ElDialog v-model="rollbackDialogVisible" title="可回滚快照（24小时内有效）" width="600px">
      <ElTable :data="snapshots" v-loading="rollbackLoading">
        <ElTableColumn prop="id" label="快照 ID" width="80" />
        <ElTableColumn prop="reason" label="原因" />
        <ElTableColumn prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn prop="expires_in_minutes" label="剩余有效时间" width="130">
          <template #default="{ row }">
            <ElTag :type="row.expires_in_minutes < 60 ? 'danger' : 'success'">
              {{ row.expires_in_minutes }} 分钟
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="100">
          <template #default="{ row }">
            <ElButton type="danger" size="small" @click="handleRollback(row)">
              回滚
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-if="!rollbackLoading && snapshots.length === 0" description="暂无可用快照" />
    </ElDialog>

      <ElPagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchApplications"
        @current-change="fetchApplications"
      />
    </ElCard>
  </div>
</template>

<style scoped>
.merge-applications-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h2 {
  margin: 0;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
