<script setup lang="ts">
/**
 * 组织成员弹窗（家族理事会 / 修谱小组 共用）
 * --------------------------------------------------------------------
 * 由 FamilyOverviewPage 的并列入口卡片触发，弹窗内查看成员详情并支持
 * 增删改。通过 type 区分两套接口与字段：
 *   - council:       GET/POST/PUT/DELETE /api/admin/clan-overview/council[/:id]
 *                   字段：name / contact / position / remark
 *   - revision-team: GET/POST/PUT/DELETE /api/admin/clan-overview/revision-team[/:id]
 *                   字段：name / contact / duty / remark
 */
import { ref, computed, watch } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus,
  Edit,
  Delete,
  Phone,
  Position,
} from '@element-plus/icons-vue'

const props = defineProps<{
  modelValue: boolean
  type: 'council' | 'revision-team'
  clanSlug: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'changed'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const isCouncil = computed(() => props.type === 'council')
const dialogTitle = computed(() => (isCouncil.value ? '家族理事会' : '修谱小组'))
const nameLabel = computed(() => (isCouncil.value ? '理事姓名' : '联系人'))
const roleLabel = computed(() => (isCouncil.value ? '职务' : '职责'))
const roleKey = computed(() => (isCouncil.value ? 'position' : 'duty'))
const apiBase = computed(() => `/api/admin/clan-overview/${props.type}`)

const loading = ref(false)
const members = ref<any[]>([])

const fetchMembers = async () => {
  loading.value = true
  try {
    const res = await axios.get(apiBase.value, {
      params: { clanSlug: props.clanSlug },
    })
    members.value = Array.isArray(res.data?.members) ? [...res.data.members] : []
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '加载成员失败')
  } finally {
    loading.value = false
  }
}

// 打开时拉取最新成员列表
watch(
  () => props.modelValue,
  (v) => {
    if (v) fetchMembers()
  },
)

// ==================== 成员 CRUD 弹窗 ====================
const editVisible = ref(false)
const editing = ref<any>(null)

const openCreate = () => {
  editing.value = { name: '', contact: '', [roleKey.value]: '', remark: '' }
  editVisible.value = true
}
const openEdit = (row: any) => {
  editing.value = { ...row }
  editVisible.value = true
}
const submit = async () => {
  const data = editing.value
  if (!data?.name?.trim()) {
    ElMessage.warning(`请填写${nameLabel.value}`)
    return
  }
  if (!data?.contact?.trim()) {
    ElMessage.warning('请填写联系方式')
    return
  }
  try {
    const payload = {
      clanSlug: props.clanSlug,
      name: data.name,
      contact: data.contact,
      remark: data.remark,
      [roleKey.value]: data[roleKey.value],
    }
    if (data.id) {
      await axios.put(`${apiBase.value}/${data.id}`, payload)
    } else {
      await axios.post(apiBase.value, payload)
    }
    ElMessage.success(data.id ? '已更新成员' : '已新增成员')
    editVisible.value = false
    fetchMembers()
    emit('changed')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '保存失败')
  }
}
const removeMember = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除「${row.name}」吗？`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await axios.delete(`${apiBase.value}/${row.id}`, {
      params: { clanSlug: props.clanSlug },
    })
    ElMessage.success('已删除成员')
    fetchMembers()
    emit('changed')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '删除失败')
  }
}
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="dialogTitle"
    width="720px"
    :close-on-click-modal="false"
    destroy-on-close
    class="team-members-dialog"
  >
    <div v-loading="loading" class="dialog-body">
      <div class="dialog-toolbar">
        <ElTag size="small" type="info" effect="plain">{{ members.length }} 名成员</ElTag>
        <ElButton type="primary" :icon="Plus" size="small" @click="openCreate">
          新增成员
        </ElButton>
      </div>

      <div v-if="members.length === 0" class="empty-tip">
        暂无{{ dialogTitle }}成员，点击「新增成员」添加
      </div>
      <ElTable v-else :data="members" stripe size="default">
        <ElTableColumn type="index" label="#" width="60" />
        <ElTableColumn prop="name" :label="nameLabel" min-width="120" />
        <ElTableColumn prop="contact" label="联系方式" min-width="160">
          <template #default="{ row }">
            <ElIcon><Phone /></ElIcon>
            <span style="margin-left: 6px;">{{ row.contact }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn :prop="roleKey" :label="roleLabel" min-width="120">
          <template #default="{ row }">
            <span v-if="row[roleKey]">{{ row[roleKey] }}</span>
            <span v-else style="color: #909399;">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="remark" label="备注" min-width="140">
          <template #default="{ row }">
            <span v-if="row.remark" style="color: #606266;">{{ row.remark }}</span>
            <span v-else style="color: #909399;">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="140" fixed="right">
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
    </div>

    <!-- 成员编辑弹窗（append-to-body 避免嵌套层级问题） -->
    <ElDialog
      v-model="editVisible"
      :title="editing?.id ? `编辑${dialogTitle}成员` : `新增${dialogTitle}成员`"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
      append-to-body
    >
      <ElForm v-if="editing" label-width="90px">
        <ElFormItem :label="nameLabel" required>
          <ElInput v-model="editing.name" :placeholder="`请输入${nameLabel}`" maxlength="100" />
        </ElFormItem>
        <ElFormItem label="联系方式" required>
          <ElInput v-model="editing.contact" placeholder="电话 / 微信 / 邮箱" maxlength="100" />
        </ElFormItem>
        <ElFormItem :label="roleLabel">
          <ElInput
            v-model="editing[roleKey]"
            :placeholder="isCouncil ? '如：理事长、副理事长' : '如：资料搜集、文字录入、校对'"
            maxlength="100"
          />
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
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" @click="submit">保存</ElButton>
      </template>
    </ElDialog>
  </ElDialog>
</template>

<style scoped>
.team-members-dialog :deep(.el-dialog__body) {
  padding-top: 8px;
  padding-bottom: 8px;
}

.dialog-body {
  min-height: 200px;
}

.dialog-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.empty-tip {
  padding: 40px 0;
  text-align: center;
  color: #909399;
  font-size: 13px;
}
</style>
