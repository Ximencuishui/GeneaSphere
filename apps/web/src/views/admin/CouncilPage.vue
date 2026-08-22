<script setup lang="ts">
/**
 * 家族理事会管理页面
 * --------------------------------------------------------------------
 * 侧边栏菜单项，点击后进入此页面。
 * 页面内弹窗展示理事会成员列表，右上角设置按钮可增删改。
 */
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import {
  ElMessage,
  ElMessageBox,
} from 'element-plus'
import {
  User,
  Plus,
  Edit,
  Delete,
  Phone,
  Position,
  Setting,
} from '@element-plus/icons-vue'

const route = useRoute()
const clanSlug = computed(() => (route.params.slug as string) || '1')

const loading = ref(false)
const councilMembers = ref<any[]>([])

const fetchMembers = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/clan-overview/council', {
      params: { clanSlug: clanSlug.value },
    })
    councilMembers.value = Array.isArray(res.data?.members) ? [...res.data.members] : []
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '加载理事会成员失败')
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
    position: '',
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
    ElMessage.warning('请填写理事姓名')
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
      position: data.position,
      remark: data.remark,
    }
    if (data.id) {
      await axios.put(`/api/admin/clan-overview/council/${data.id}`, payload)
    } else {
      await axios.post('/api/admin/clan-overview/council', payload)
    }
    ElMessage.success(data.id ? '已更新理事' : '已新增理事')
    dialogVisible.value = false
    fetchMembers()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '保存失败')
  }
}
const removeMember = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除理事「${row.name}」吗？`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await axios.delete(`/api/admin/clan-overview/council/${row.id}`, {
      params: { clanSlug: clanSlug.value },
    })
    ElMessage.success('已删除理事')
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
  <div class="council-page" v-loading="loading">
    <!-- 页面顶部：标题 + 设置按钮 -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">家族理事会</h2>
        <ElTag size="small" type="info" effect="plain">{{ councilMembers.length }} 人</ElTag>
      </div>
      <ElTooltip content="管理理事会成员" placement="top">
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
      <div v-if="councilMembers.length === 0" class="empty-tip">
        暂无理事会成员，点击右上角按钮添加
      </div>
      <ElTable v-else :data="councilMembers" stripe size="default">
        <ElTableColumn type="index" label="#" width="60" />
        <ElTableColumn prop="name" label="理事姓名" min-width="120" />
        <ElTableColumn prop="contact" label="联系方式" min-width="160">
          <template #default="{ row }">
            <ElIcon><Phone /></ElIcon>
            <span style="margin-left: 6px;">{{ row.contact }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="position" label="职务" min-width="120">
          <template #default="{ row }">
            <span v-if="row.position">
              <ElIcon><Position /></ElIcon>
              <span style="margin-left: 6px;">{{ row.position }}</span>
            </span>
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
            <ElButton type="primary" link :icon="Edit" size="small" @click="openEdit(row)">
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
      :title="editing?.id ? '编辑理事' : '新增理事'"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <ElForm v-if="editing" label-width="90px">
        <ElFormItem label="理事姓名" required>
          <ElInput v-model="editing.name" placeholder="请输入理事姓名" maxlength="100" />
        </ElFormItem>
        <ElFormItem label="联系方式" required>
          <ElInput v-model="editing.contact" placeholder="电话 / 微信 / 邮箱" maxlength="100" />
        </ElFormItem>
        <ElFormItem label="职务">
          <ElInput v-model="editing.position" placeholder="如：理事长、副理事长" maxlength="100" />
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
.council-page {
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
