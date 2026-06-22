<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()

const clanId = ref('')
const loading = ref(false)
const saving = ref(false)
const xipaiList = ref<any[]>([])

const newXipai = ref({ generation: 0, character: '', note: '' })
const showAddDialog = ref(false)

const fetchXipai = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/settings/xipai', {
      params: { clanId: clanId.value },
    })
    xipaiList.value = res.data
  } catch (error) {
    console.error('Failed to fetch xipai:', error)
  } finally {
    loading.value = false
  }
}

const handleAdd = async () => {
  if (!newXipai.value.character) {
    ElMessage.warning('请输入字辈字符')
    return
  }
  saving.value = true
  try {
    await axios.post('/api/admin/settings/xipai', {
      clanId: clanId.value,
      generation: newXipai.value.generation,
      character: newXipai.value.character,
      note: newXipai.value.note,
    })
    ElMessage.success('字辈添加成功')
    showAddDialog.value = false
    newXipai.value = { generation: 0, character: '', note: '' }
    fetchXipai()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '添加失败')
  } finally {
    saving.value = false
  }
}

const handleEdit = async (item: any) => {
  try {
    const { value } = await ElMessageBox.prompt(
      '修改字辈字符',
      '编辑字辈',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: item.character,
        inputPattern: /.+/,
        inputErrorMessage: '字符不能为空',
      }
    )
    await axios.put(`/api/admin/settings/xipai/${item.id}`, {
      character: value,
      note: item.note,
    })
    ElMessage.success('修改成功')
    fetchXipai()
  } catch (error: any) {
    if (error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  }
}

const handleDelete = async (item: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除字辈「${item.character}」吗？`,
      '确认删除',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    await axios.delete(`/api/admin/settings/xipai/${item.id}`)
    ElMessage.success('删除成功')
    fetchXipai()
  } catch (error: any) {
    if (error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  }
}

onMounted(() => {
  clanId.value = route.query.clanId as string || '1'
  fetchXipai()
})
</script>

<template>
  <div class="xipai-settings-page">
    <ElCard v-loading="loading">
      <template #header>
        <div class="page-header">
          <h2>字辈管理</h2>
          <ElButton type="primary" @click="showAddDialog = true">
            添加字辈
          </ElButton>
        </div>
      </template>

      <ElAlert type="info" show-icon style="margin-bottom: 20px;">
        <template #title>说明</template>
        <p>字辈用于规范家族成员的命名。系统会根据世代自动匹配字辈，若姓名不含对应字辈将发出警告。</p>
      </ElAlert>

      <ElTable :data="xipaiList" class="xipai-table">
        <ElTableColumn prop="generation" label="世代" width="100" />
        <ElTableColumn prop="character" label="字辈字符" width="150">
          <template #default="{ row }">
            <ElTag size="large" type="primary">{{ row.character }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="note" label="备注" />
        <ElTableColumn label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <ElButton type="primary" size="small" @click="handleEdit(row)">
              编辑
            </ElButton>
            <ElButton type="danger" size="small" @click="handleDelete(row)">
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElEmpty v-if="!loading && xipaiList.length === 0" description="暂无字辈数据" />
    </ElCard>

    <!-- 添加字辈对话框 -->
    <ElDialog v-model="showAddDialog" title="添加字辈" width="500px">
      <ElForm label-width="100px">
        <ElFormItem label="世代">
          <ElInputNumber v-model="newXipai.generation" :min="1" :step="1" />
        </ElFormItem>
        <ElFormItem label="字辈字符">
          <ElInput v-model="newXipai.character" maxlength="10" placeholder="如：宏" />
        </ElFormItem>
        <ElFormItem label="备注">
          <ElInput v-model="newXipai.note" type="textarea" placeholder="可选" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="showAddDialog = false">取消</ElButton>
        <ElButton type="primary" @click="handleAdd" :loading="saving">
          确定
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.xipai-settings-page {
  max-width: 1000px;
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

.xipai-table {
  margin-top: 20px;
}
</style>
