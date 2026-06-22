<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const users = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const filterKeyword = ref('')
const filterStatus = ref('')

const detailDialogVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<any>(null)

const tempPasswordDialogVisible = ref(false)
const tempPassword = ref('')

const fetchUsers = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/platform/users', {
      params: {
        keyword: filterKeyword.value || undefined,
        status: filterStatus.value || undefined,
        page: currentPage.value,
        pageSize: pageSize.value,
      },
    })
    users.value = res.data.data
    total.value = res.data.pagination.total
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

const banLabel = (s: string) => {
  const map: Record<string, string> = {
    NORMAL: '正常', BANNED_PERMANENT: '永久封禁', BANNED_7D: '封禁7天', BANNED_30D: '封禁30天',
  }
  return map[s] || s
}
const banType = (s: string) => {
  if (s === 'NORMAL') return 'success'
  if (s === 'BANNED_PERMANENT') return 'danger'
  return 'warning'
}

const handleBan = async (row: any) => {
  try {
    const { value } = await ElMessageBox.prompt(
      '封禁时长（PERMANENT / 7D / 30D）',
      '封禁用户',
      { inputValue: '7D', confirmButtonText: '确定封禁', cancelButtonText: '取消' },
    )
    const duration = (value || '').toUpperCase()
    if (!['PERMANENT', '7D', '30D'].includes(duration)) {
      ElMessage.error('封禁时长无效（仅支持 PERMANENT / 7D / 30D）')
      return
    }
    await axios.post(`/api/platform/users/${row.id}/ban`, { duration })
    ElMessage.success('已封禁')
    fetchUsers()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleUnban = async (row: any) => {
  try {
    await axios.post(`/api/platform/users/${row.id}/unban`)
    ElMessage.success('已解封')
    fetchUsers()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleResetPassword = async (row: any) => {
  try {
    await ElMessageBox.confirm('将生成临时密码（仅展示一次），确认重置？', '重置密码', { type: 'warning' })
    const res = await axios.post(`/api/platform/users/${row.id}/reset-password`)
    tempPassword.value = res.data.temp_password
    tempPasswordDialogVisible.value = true
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定注销该账号（标记永久封禁）？', '注销账号', { type: 'error' })
    await axios.delete(`/api/platform/users/${row.id}`)
    ElMessage.success('已注销')
    fetchUsers()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const openDetail = async (row: any) => {
  detailDialogVisible.value = true
  detailLoading.value = true
  try {
    const res = await axios.get(`/api/platform/users/${row.id}`)
    detail.value = res.data
  } catch (err) {
    console.error(err)
  } finally {
    detailLoading.value = false
  }
}

const copyPassword = () => {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(tempPassword.value).then(
      () => ElMessage.success('已复制'),
      () => ElMessage.warning('复制失败，请手动复制'),
    )
  } else {
    ElMessage.warning('当前环境不支持剪贴板 API，请手动复制')
  }
}

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <div class="users-page">
    <ElCard shadow="hover">
      <template #header>
        <div class="page-header">
          <h2>用户管理</h2>
          <ElButton @click="fetchUsers">刷新</ElButton>
        </div>
      </template>

      <div class="filter-bar">
        <ElInput v-model="filterKeyword" placeholder="手机号" clearable @input="fetchUsers" style="width: 220px;" />
        <ElSelect v-model="filterStatus" placeholder="封禁状态" clearable @change="fetchUsers" style="width: 160px;">
          <ElOption label="正常" value="NORMAL" />
          <ElOption label="永久封禁" value="BANNED_PERMANENT" />
          <ElOption label="封禁7天" value="BANNED_7D" />
          <ElOption label="封禁30天" value="BANNED_30D" />
        </ElSelect>
      </div>

      <ElTable :data="users" v-loading="loading" stripe>
        <ElTableColumn prop="phone_masked" label="手机号" width="160">
          <template #default="{ row }">
            <ElLink type="primary" @click="openDetail(row)">{{ row.phone_masked }}</ElLink>
          </template>
        </ElTableColumn>
        <ElTableColumn label="所属家族" min-width="200">
          <template #default="{ row }">
            <span v-if="row.families.length === 0" class="muted">-</span>
            <ElTag v-for="f in row.families" :key="f.id" style="margin-right: 4px;">{{ f.name }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="120">
          <template #default="{ row }">
            <ElTag :type="banType(row.ban_status)">{{ banLabel(row.ban_status) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="封禁到期" width="170">
          <template #default="{ row }">
            {{ row.ban_until ? new Date(row.ban_until).toLocaleString() : '-' }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="注册时间" width="170">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" @click="openDetail(row)">详情</ElButton>
            <ElButton v-if="row.ban_status === 'NORMAL'" size="small" type="warning" @click="handleBan(row)">封禁</ElButton>
            <ElButton v-else size="small" type="primary" @click="handleUnban(row)">解封</ElButton>
            <ElButton size="small" @click="handleResetPassword(row)">重置密码</ElButton>
            <ElButton size="small" type="danger" @click="handleDelete(row)">注销</ElButton>
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
        @size-change="fetchUsers"
        @current-change="fetchUsers"
      />
    </ElCard>

    <ElDialog v-model="detailDialogVisible" title="用户详情" width="720px">
      <div v-loading="detailLoading" v-if="detail">
        <ElDescriptions :column="2" border>
          <ElDescriptionsItem label="用户ID">{{ detail.id }}</ElDescriptionsItem>
          <ElDescriptionsItem label="手机号">{{ detail.phone_masked }}</ElDescriptionsItem>
          <ElDescriptionsItem label="状态">{{ banLabel(detail.ban_status) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="封禁到期">{{ detail.ban_until ? new Date(detail.ban_until).toLocaleString() : '-' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="最后登录IP">{{ detail.last_login_ip || '-' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="设备">{{ detail.last_login_device || '-' }}</ElDescriptionsItem>
        </ElDescriptions>

        <h4 class="section-title">所属家族</h4>
        <ElTable :data="detail.families" size="small">
          <ElTableColumn prop="name" label="家族名称" />
          <ElTableColumn prop="role" label="角色" width="120" />
          <ElTableColumn label="加入时间" width="200">
            <template #default="{ row }">
              {{ new Date(row.joined_at).toLocaleString() }}
            </template>
          </ElTableColumn>
        </ElTable>

        <h4 class="section-title">最近 10 条操作记录</h4>
        <ElTable :data="detail.recent_logs" size="small">
          <ElTableColumn prop="action" label="操作" width="180" />
          <ElTableColumn prop="target_type" label="目标类型" width="120" />
          <ElTableColumn prop="details" label="详情" />
          <ElTableColumn label="时间" width="180">
            <template #default="{ row }">
              {{ new Date(row.created_at).toLocaleString() }}
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </ElDialog>

    <ElDialog v-model="tempPasswordDialogVisible" title="重置成功" width="420px" :show-close="false">
      <ElAlert type="warning" :closable="false" style="margin-bottom: 12px;">
        临时密码仅展示一次，请立即告知用户并要求登录后修改。
      </ElAlert>
      <div class="pwd-display">{{ tempPassword }}</div>
      <ElButton type="primary" @click="copyPassword">复制</ElButton>
      <template #footer>
        <ElButton type="primary" @click="tempPasswordDialogVisible = false">关闭</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.users-page {
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

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.muted {
  color: #909399;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.section-title {
  margin: 20px 0 12px;
  color: #1f3a5f;
  border-left: 4px solid #2c5fa3;
  padding-left: 10px;
}

.pwd-display {
  font-family: 'Courier New', monospace;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 4px;
  text-align: center;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  color: #1f3a5f;
  margin-bottom: 12px;
}
</style>
