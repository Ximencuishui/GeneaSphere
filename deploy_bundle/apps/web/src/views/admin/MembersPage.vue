<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()

const clanId = ref('')
const loading = ref(false)
const members = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const activeTab = ref('members')
const selectedMembers = ref<any[]>([])

// 筛选条件
const filterRole = ref('')
const filterKeyword = ref('')

// 防抖搜索
let searchTimer: ReturnType<typeof setTimeout> | null = null
const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    fetchMembers()
  }, 300)
}
const onSearchClear = () => {
  filterKeyword.value = ''
  fetchMembers()
}

// 转让 Owner 对话框
const transferDialogVisible = ref(false)
const transferTargetPhone = ref('')
const transferConfirmPassword = ref('')

// 降级二次确认对话框
const demoteDialogVisible = ref(false)
const demoteMember = ref<any>(null)
const demoteNewRole = ref('')
const demotePassword = ref('')

const fetchMembers = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/members', {
      params: {
        clanId: clanId.value,
        page: currentPage.value,
        pageSize: pageSize.value,
        role: filterRole.value || undefined,
        keyword: filterKeyword.value || undefined,
      },
    })
    members.value = res.data.data
    total.value = res.data.pagination.total
  } catch (error) {
    console.error('Failed to fetch members:', error)
  } finally {
    loading.value = false
  }
}

const currentUserRole = computed(() => {
  // 从 localStorage 的 JWT token 中解析角色
  try {
    const token = localStorage.getItem('geneasphere_token')
    if (!token) return ''
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.role || ''
  } catch {
    return ''
  }
})

// 角色修改（含降级二次确认）
const handleRoleChange = async (member: any, newRole: string) => {
  // 从 Admin 降级为非 Admin，需要二次确认（输入密码）
  if ((member.role === 'ADMIN' || member.role === 'OWNER') && (newRole === 'EDITOR' || newRole === 'VIEWER')) {
    demoteMember.value = member
    demoteNewRole.value = newRole
    demotePassword.value = ''
    demoteDialogVisible.value = true
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要将 ${member.phone} 的角色修改为 ${newRole} 吗？`,
      '确认修改',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    await axios.patch(`/api/admin/members/${member.id}/role`, { role: newRole })
    ElMessage.success('角色修改成功')
    fetchMembers()
  } catch (error: any) {
    if (error !== 'cancel' && error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  }
}

const confirmDemote = async () => {
  if (!demotePassword.value) {
    ElMessage.warning('请输入密码确认')
    return
  }
  try {
    await axios.patch(`/api/admin/members/${demoteMember.value.id}/role`, {
      role: demoteNewRole.value,
      password: demotePassword.value,
    })
    ElMessage.success('角色修改成功')
    demoteDialogVisible.value = false
    fetchMembers()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '操作失败')
  }
}

// 转让 Owner
const openTransferDialog = () => {
  transferTargetPhone.value = ''
  transferConfirmPassword.value = ''
  transferDialogVisible.value = true
}

const confirmTransferOwnership = async () => {
  if (!transferTargetPhone.value || !transferConfirmPassword.value) {
    ElMessage.warning('请填写所有必填项')
    return
  }
  try {
    await axios.patch('/api/admin/members/transfer-ownership', {
      targetUserId: transferTargetPhone.value,
      password: transferConfirmPassword.value,
      clanId: clanId.value,
    })
    ElMessage.success('所有权已转让')
    transferDialogVisible.value = false
    fetchMembers()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '转让失败')
  }
}

// 批量修改角色
const handleBatchRoleChange = async (newRole: string) => {
  if (selectedMembers.value.length === 0) {
    ElMessage.warning('请先选择成员')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定要将选中的 ${selectedMembers.value.length} 名成员的角色修改为 ${newRole} 吗？`,
      '批量修改角色',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    await Promise.all(
      selectedMembers.value
        .filter(m => m.role !== 'OWNER')
        .map(m => axios.patch(`/api/admin/members/${m.id}/role`, { role: newRole }))
    )
    ElMessage.success('批量角色修改成功')
    selectedMembers.value = []
    fetchMembers()
  } catch (error: any) {
    if (error !== 'cancel' && error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  }
}

const handleRemoveMember = async (member: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要将 ${member.phone} 从家族中移除吗？此操作不可逆。`,
      '确认移除',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    await axios.delete(`/api/admin/members/${member.id}`)
    ElMessage.success('成员已移除')
    fetchMembers()
  } catch (error: any) {
    if (error !== 'cancel' && error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  }
}

const handleSelectionChange = (val: any[]) => {
  selectedMembers.value = val
}

onMounted(() => {
  clanId.value = route.query.clanId as string || '1'
  fetchMembers()

  if (route.query.tab === 'roles') {
    activeTab.value = 'roles'
  }
})
</script>

<template>
  <div class="members-page">
    <ElCard>
      <template #header>
        <div class="page-header">
          <h2>成员管理</h2>
          <ElRadioGroup v-model="activeTab" size="large">
            <ElRadioButton value="members">成员列表</ElRadioButton>
            <ElRadioButton value="roles">权限分配</ElRadioButton>
          </ElRadioGroup>
        </div>
      </template>

      <!-- 成员列表 -->
      <template v-if="activeTab === 'members'">
        <div class="filter-bar">
          <ElInput
            v-model="filterKeyword"
            placeholder="搜索成员..."
            class="search-input"
            clearable
            @input="onSearchInput"
            @clear="onSearchClear"
          >
            <template #prefix>
              <ElIcon><Search /></ElIcon>
            </template>
          </ElInput>
          <ElSelect
            v-model="filterRole"
            placeholder="按角色筛选"
            clearable
            @change="fetchMembers"
          >
            <ElOption label="Owner" value="OWNER" />
            <ElOption label="Admin" value="ADMIN" />
            <ElOption label="Editor" value="EDITOR" />
            <ElOption label="Viewer" value="VIEWER" />
          </ElSelect>
          <div class="filter-actions">
            <ElButton type="warning" size="small" @click="openTransferDialog" v-if="currentUserRole === 'OWNER'">
              转让所有权
            </ElButton>
          </div>
        </div>

        <!-- 批量操作栏 -->
        <div v-if="selectedMembers.length > 0" class="batch-bar">
          <span>已选 {{ selectedMembers.length }} 人</span>
          <ElButton size="small" @click="handleBatchRoleChange('EDITOR')">批量设为编辑者</ElButton>
          <ElButton size="small" @click="handleBatchRoleChange('VIEWER')">批量设为观察员</ElButton>
          <ElButton size="small" type="danger" @click="handleBatchRoleChange('ADMIN')">批量设为管理员</ElButton>
        </div>

        <ElTable
          :data="members"
          v-loading="loading"
          class="members-table"
          @selection-change="handleSelectionChange"
        >
          <ElTableColumn type="selection" width="50" :selectable="(row: any) => row.role !== 'OWNER'" />
          <ElTableColumn prop="phone" label="手机号" />
          <ElTableColumn prop="role" label="角色" width="150">
            <template #default="{ row }">
              <ElTag :type="row.role === 'OWNER' ? 'danger' : row.role === 'ADMIN' ? 'warning' : 'info'">
                {{ row.role }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="joined_at" label="加入时间" width="180">
            <template #default="{ row }">
              {{ new Date(row.joined_at).toLocaleDateString() }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <ElSelect
                :model-value="row.role"
                @change="(val: string) => handleRoleChange(row, val)"
                size="small"
                style="width: 120px;"
                :disabled="row.role === 'OWNER' && currentUserRole !== 'OWNER'"
              >
                <ElOption label="Owner" value="OWNER" :disabled="true" />
                <ElOption label="Admin" value="ADMIN" />
                <ElOption label="Editor" value="EDITOR" />
                <ElOption label="Viewer" value="VIEWER" />
              </ElSelect>
              <ElButton
                type="danger"
                size="small"
                @click="handleRemoveMember(row)"
                :disabled="row.role === 'OWNER'"
                style="margin-left: 8px;"
              >
                移除
              </ElButton>
            </template>
          </ElTableColumn>
        </ElTable>

        <ElEmpty v-if="!loading && members.length === 0" description="暂无成员数据" />

        <ElPagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          class="pagination"
          @size-change="fetchMembers"
          @current-change="fetchMembers"
        />
      </template>

      <!-- 权限分配 -->
      <template v-if="activeTab === 'roles'">
        <ElAlert type="info" show-icon style="margin-bottom: 20px;">
          <template #title>权限说明</template>
          <p><strong>OWNER</strong>：全部权限，可转让所有权</p>
          <p><strong>ADMIN</strong>：内容审核、寻亲处理、系统配置</p>
          <p><strong>EDITOR</strong>：增删改人员信息、上传照片</p>
          <p><strong>VIEWER</strong>：仅查看族谱、时光长廊</p>
        </ElAlert>

        <div style="margin-bottom: 16px;">
          <ElButton type="warning" @click="openTransferDialog" v-if="currentUserRole === 'OWNER'">
            转让家族所有权
          </ElButton>
        </div>

        <ElTable :data="members" v-loading="loading" @selection-change="handleSelectionChange">
          <ElTableColumn type="selection" width="50" :selectable="(row: any) => row.role !== 'OWNER'" />
          <ElTableColumn prop="phone" label="成员" />
          <ElTableColumn prop="role" label="当前角色" width="150">
            <template #default="{ row }">
              <ElTag>{{ row.role }}</ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="修改角色" width="300">
            <template #default="{ row }">
              <ElSelect
                :model-value="row.role"
                @change="(val: string) => handleRoleChange(row, val)"
                style="width: 150px;"
              >
                <ElOption label="Owner" value="OWNER" :disabled="true" />
                <ElOption label="Admin" value="ADMIN" />
                <ElOption label="Editor" value="EDITOR" />
                <ElOption label="Viewer" value="VIEWER" />
              </ElSelect>
            </template>
          </ElTableColumn>
        </ElTable>

        <ElEmpty v-if="!loading && members.length === 0" description="暂无成员数据" />

        <div v-if="selectedMembers.length > 0" style="margin-top: 16px;">
          <span>已选 {{ selectedMembers.length }} 人：</span>
          <ElButton size="small" type="primary" @click="handleBatchRoleChange('EDITOR')">设为编辑者</ElButton>
          <ElButton size="small" @click="handleBatchRoleChange('VIEWER')">设为观察员</ElButton>
          <ElButton size="small" type="warning" @click="handleBatchRoleChange('ADMIN')">设为管理员</ElButton>
        </div>
      </template>
    </ElCard>

    <!-- 转让所有权对话框 -->
    <ElDialog v-model="transferDialogVisible" title="转让家族所有权" width="450px" :close-on-click-modal="false">
      <ElForm label-width="100px">
        <ElFormItem label="新 Owner ID">
          <ElInput v-model="transferTargetPhone" placeholder="请输入目标用户的 ID" />
        </ElFormItem>
        <ElFormItem label="确认密码">
          <ElInput v-model="transferConfirmPassword" type="password" placeholder="请输入您的密码以确认" />
        </ElFormItem>
      </ElForm>
      <ElAlert type="error" show-icon style="margin-bottom: 12px;">
        <template #title>⚠️ 重要提示</template>
        转让后您将降级为 Admin，此操作不可撤销。请确认目标用户可信。
      </ElAlert>
      <template #footer>
        <ElButton @click="transferDialogVisible = false">取消</ElButton>
        <ElButton type="danger" @click="confirmTransferOwnership">确认转让</ElButton>
      </template>
    </ElDialog>

    <!-- 降级二次确认对话框 -->
    <ElDialog v-model="demoteDialogVisible" title="敏感操作 - 需要二次确认" width="420px" :close-on-click-modal="false">
      <p>您正在将 <strong>{{ demoteMember?.phone }}</strong> 从 <ElTag type="warning">{{ demoteMember?.role }}</ElTag> 降级为 <ElTag type="info">{{ demoteNewRole }}</ElTag></p>
      <ElForm label-width="100px" style="margin-top: 16px;">
        <ElFormItem label="管理员密码">
          <ElInput v-model="demotePassword" type="password" placeholder="请输入您的密码以确认" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="demoteDialogVisible = false">取消</ElButton>
        <ElButton type="danger" @click="confirmDemote">确认降级</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.members-page {
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
  gap: 16px;
  margin-bottom: 20px;
  align-items: center;
}

.filter-actions {
  margin-left: auto;
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  margin-bottom: 16px;
  background: #ECF5FF;
  border-radius: 6px;
  border: 1px solid #D9ECFF;
}

.search-input {
  width: 300px;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.members-table {
  margin-top: 20px;
}
</style>
