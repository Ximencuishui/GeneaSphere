<script setup lang="ts">
/**
 * 修谱小组管理页面
 * --------------------------------------------------------------------
 * 侧边栏菜单项，点击后进入此页面。
 * 页面内弹窗展示修谱小组成员列表，右上角设置按钮可增删改。
 */
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import {
  ElMessage,
  ElMessageBox,
} from 'element-plus'
import {
  Edit as EditIcon,
  Plus,
  Delete,
  Phone,
  Setting,
} from '@element-plus/icons-vue'

const route = useRoute()
const clanSlug = computed(() => (route.params.slug as string) || '1')

const loading = ref(false)
const members = ref<any[]>([])

const fetchMembers = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/clan-overview/revision-team', {
      params: { clanSlug: clanSlug.value },
    })
    members.value = Array.isArray(res.data?.members) ? [...res.data.members] : []
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '加载修谱小组成员失败')
  } finally {
    loading.value = false
  }
}

// ==================== 成员 CRUD 弹窗 ====================
const dialogVisible = ref(false)
const editing = ref<any>(null)

const openCreate = () => {
  editing.value = {
    name: '',
    contact: '',
    duty: '',
    remark: '',
  }
  dialogVisible.value = true
}
const openEdit = (row: any) => {
  editing.value = { ...row }
  dialogVisible.value = true
}
const submit = async () => {
  const data = editing.value
  if (!data?.name?.trim()) {
    ElMessage.warning('请填写联系人姓名')
    return
  }
  if (!data?.contact?.trim()) {
    ElMessage.warning('请填写联系方式')
    return
  }
  try {
    const payload = {
      clanSlug: clanSlug.value,
      name: data.name,
      contact: data.contact,
      duty: data.duty,
      remark: data.remark,
    }
    if (data.id) {
      await axios.put(`/api/admin/clan-overview/revision-team/${data.id}`, payload)
    } else {
      await axios.post('/api/admin/clan-overview/revision-team', payload)
    }
    ElMessage.success(data.id ? '已更新修谱组成员' : '已新增修谱组成员')
    dialogVisible.value = false
    fetchMembers()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '保存失败')
  }
}
const removeMember = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除修谱组成员「${row.name}」吗？`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await axios.delete(`/api/admin/clan-overview/revision-team/${row.id}`, {
      params: { clanSlug: clanSlug.value },
    })
    ElMessage.success('已删除修谱组成员')
    fetchMembers()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '删除失败')
  }
}

onMounted(() => {
  fetchMembers()
})
</script>

<template>
  <div class="revision-team-page" v-loading="loading">
    <!-- 页面顶部：标题 + 设置按钮 -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">修谱小组</h2>
        <ElTag size="small" type="info" effect="plain">{{ members.length }} 人</ElTag>
      </div>
      <ElTooltip content="管理修谱小组成员" placement="top">
        <ElButton
          type="primary"
          :icon="Setting"
          circle
          @click="openCreate"
        />
      </ElTooltip>
    </div>

    <!-- 成员列表 -->
    <ElCard class="section-card" shadow="hover">
      <div v-if="members.length === 0" class="empty-tip">
        暂无修谱小组成员，点击右上角按钮添加
      </div>
      <ElTable v-else :data="members" stripe size="default">
        <ElTableColumn type="index" label="#" width="60" />
        <ElTableColumn prop="name" label="联系人" min-width="120" />
        <ElTableColumn prop="contact" label="联系方式" min-width="160">
          <template #default="{ row }">
            <ElIcon><Phone /></ElIcon>
            <span style="margin-left: 6px;">{{ row.contact }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="duty" label="职责" min-width="120">
          <template #default="{ row }">
            <span v-if="row.duty">{{ row.duty }}</span>
            <span v-else style="color: #909399;">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="remark" label="备注" min-width="160">
          <template #default="{ row }">
            <span v-if="row.remark" style="color: #606266;">{{ row.remark }}</span>
            <span v-else style="color: #909399;">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <ElButton type="primary" link :icon="EditIcon" size="small" @click="openEdit(row)">
              编辑
            </ElButton>
            <ElButton type="danger" link :icon="Delete" size="small" @click="removeMember(row)">
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <!-- 成员编辑弹窗 -->
    <ElDialog
      v-model="dialogVisible"
      :title="editing?.id ? '编辑修谱组成员' : '新增修谱组成员'"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <ElForm v-if="editing" label-width="90px">
        <ElFormItem label="联系人" required>
          <ElInput v-model="editing.name" placeholder="请输入联系人姓名" maxlength="100" />
        </ElFormItem>
        <ElFormItem label="联系方式" required>
          <ElInput v-model="editing.contact" placeholder="电话 / 微信 / 邮箱" maxlength="100" />
        </ElFormItem>
        <ElFormItem label="职责">
          <ElInput v-model="editing.duty" placeholder="如：资料搜集、文字录入、校对" maxlength="100" />
        </ElFormItem>
        <ElFormItem label="备注">
          <ElInput
            v-model="editing.remark"
            type="textarea"
            :rows="2"
            placeholder="可选"
            maxlength="500"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="submit">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.revision-team-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 0 4px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.section-card {
  margin-bottom: 16px;
}

.empty-tip {
  padding: 48px 0;
  text-align: center;
  color: #909399;
  font-size: 14px;
}
</style>
