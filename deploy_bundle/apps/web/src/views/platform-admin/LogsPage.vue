<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const activeTab = ref('operations')
const loading = ref(false)
const items = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const filterActionType = ref('')
const filterAdminId = ref('')
const filterStartDate = ref('')
const filterEndDate = ref('')
const filterStatus = ref('')

const fetchLogs = async () => {
  loading.value = true
  try {
    if (activeTab.value === 'operations') {
      const res = await axios.get('/api/platform/logs/operations', {
        params: {
          adminId: filterAdminId.value || undefined,
          actionType: filterActionType.value || undefined,
          startDate: filterStartDate.value || undefined,
          endDate: filterEndDate.value || undefined,
          page: currentPage.value,
          pageSize: pageSize.value,
        },
      })
      items.value = res.data.data
      total.value = res.data.pagination.total
    } else {
      const res = await axios.get('/api/platform/logs/login', {
        params: {
          adminId: filterAdminId.value || undefined,
          status: filterStatus.value || undefined,
          page: currentPage.value,
          pageSize: pageSize.value,
        },
      })
      items.value = res.data.data
      total.value = res.data.pagination.total
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

const actionTypeLabel = (s: string) => {
  const map: Record<string, string> = {
    LOGIN: '登录', LOGIN_FAILED: '登录失败', LOGOUT: '退出',
    VIEW_DASHBOARD: '查看控制台',
    APPROVE_CLAN: '通过家族', REJECT_CLAN: '驳回家族',
    FREEZE_CLAN: '冻结家族', UNFREEZE_CLAN: '解冻家族',
    DELETE_CLAN: '删除家族', EXPORT_CLAN_DATA: '导出家族数据',
    BAN_USER: '封禁用户', UNBAN_USER: '解封用户',
    RESET_USER_PASSWORD: '重置用户密码', DELETE_USER: '注销用户',
    PLATFORM_APPROVE_MEDIA: '通过影像', PLATFORM_REJECT_MEDIA: '驳回影像', PLATFORM_DELETE_MEDIA: '删除影像',
    PLATFORM_APPROVE_POST: '通过寻亲帖', PLATFORM_REMOVE_POST: '下架寻亲帖',
    SHIP_ORDER: '订单发货', REFUND_ORDER: '订单退款',
    EXPORT_RECHARGE_CSV: '导出充值对账',
    UPDATE_PRICING: '更新定价', UPDATE_CLAN_DEFAULTS: '更新家族默认', UPDATE_FEATURE_SWITCHES: '更新全局开关',
    EXPORT_STATISTICS: '导出统计',
  }
  return map[s] || s
}

const handleExport = async () => {
  try {
    const res = await axios.get('/api/platform/logs/operations/export', {
      params: {
        startDate: filterStartDate.value || undefined,
        endDate: filterEndDate.value || undefined,
      },
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `platform_logs_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('已导出')
  } catch (err) {
    ElMessage.error('导出失败')
  }
}

onMounted(() => {
  fetchLogs()
})
</script>

<template>
  <div class="logs-page">
    <ElCard shadow="hover">
      <template #header>
        <div class="page-header">
          <h2>日志审计</h2>
          <ElButton type="primary" @click="handleExport">导出 CSV</ElButton>
        </div>
      </template>

      <ElTabs v-model="activeTab" @tab-change="fetchLogs">
        <ElTabPane label="操作日志" name="operations" />
        <ElTabPane label="登录日志" name="login" />
      </ElTabs>

      <div class="filter-bar">
        <ElInput v-model="filterAdminId" placeholder="管理员ID" clearable @input="fetchLogs" style="width: 160px;" />
        <template v-if="activeTab === 'operations'">
          <ElInput v-model="filterActionType" placeholder="操作类型（英文枚举）" clearable @input="fetchLogs" style="width: 240px;" />
          <ElDatePicker v-model="filterStartDate" type="date" placeholder="开始" @change="fetchLogs" />
          <ElDatePicker v-model="filterEndDate" type="date" placeholder="结束" @change="fetchLogs" />
        </template>
        <template v-else>
          <ElSelect v-model="filterStatus" placeholder="结果" clearable @change="fetchLogs" style="width: 140px;">
            <ElOption label="成功" value="success" />
            <ElOption label="失败" value="failed" />
          </ElSelect>
        </template>
      </div>

      <ElTable :data="items" v-loading="loading" stripe>
        <ElTableColumn label="管理员" width="160">
          <template #default="{ row }">
            {{ row.admin?.real_name || row.admin?.username || '-' }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="200">
          <template #default="{ row }">
            <ElTag>{{ actionTypeLabel(row.action_type) || row.action_type }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="target_type" label="目标类型" width="120" />
        <ElTableColumn prop="target_id" label="目标ID" width="160" />
        <ElTableColumn label="详情" min-width="220">
          <template #default="{ row }">
            <span v-if="row.detail" class="detail-cell">{{ JSON.stringify(row.detail) }}</span>
            <span v-else>-</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="ip_address" label="IP" width="140" />
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag v-if="row.status === 'success'" type="success">成功</ElTag>
            <ElTag v-else-if="row.status === 'failed'" type="danger">失败</ElTag>
            <ElTag v-else>{{ row.status }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="时间" width="170">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString() }}
          </template>
        </ElTableColumn>
      </ElTable>

      <ElPagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchLogs"
        @current-change="fetchLogs"
      />
    </ElCard>
  </div>
</template>

<style scoped>
.logs-page {
  max-width: 1500px;
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

.filter-bar {
  display: flex;
  gap: 12px;
  margin: 12px 0 16px;
  flex-wrap: wrap;
}

.detail-cell {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #5a6678;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
