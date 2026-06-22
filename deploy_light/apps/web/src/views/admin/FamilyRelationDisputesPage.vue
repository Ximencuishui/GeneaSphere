<template>
  <div class="disputes-page">
    <div class="page-header">
      <h2>子女归属争议</h2>
    </div>

    <ElCard>
      <ElTable :data="disputes" v-loading="loading" style="width: 100%">
        <ElTableColumn prop="created_at" label="时间" width="170">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="person.full_name" label="当事人" width="120" />
        <ElTableColumn prop="change_type" label="类型" width="100">
          <template #default="{ row }">
            <ElTag type="info" size="small">{{ typeLabel(row.change_type) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="当前状态">
          <template #default="{ row }">
            <pre class="state-json">{{ formatState(row.current_state) }}</pre>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="280">
          <template #default="{ row }">
            <ElButton size="small" type="primary" @click="resolve(row, 'living_with')">判给当事人</ElButton>
            <ElButton size="small" type="warning" @click="resolve(row, 'not_living_with')">判给另一方</ElButton>
            <ElButton size="small" type="success" @click="resolve(row, 'joint')">共同抚养</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-if="!loading && disputes.length === 0" description="暂无争议记录" />
    </ElCard>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { familyRelationApi } from '@/api/familyRelation'

const disputes = ref<any[]>([])
const loading = ref(false)

function formatDate(d: string) { return d ? new Date(d).toLocaleString() : '' }
function typeLabel(t: string) {
  const m: Record<string, string> = { marriage: '婚姻状态', spouse: '配偶', child: '子女', custody: '抚养关系' }
  return m[t] || t
}
function formatState(s: any) { return s ? JSON.stringify(s, null, 2) : '无' }

async function fetchData() {
  loading.value = true
  try {
    const clanId = new URLSearchParams(location.search).get('clanId') || '1'
    disputes.value = await familyRelationApi.admin.listDisputes(clanId) as any[]
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function resolve(row: any, custodyStatus: string) {
  try {
    await familyRelationApi.admin.resolveDispute(row.id, custodyStatus)
    ElMessage.success('争议已解决')
    await fetchData()
  } catch { ElMessage.error('操作失败') }
}

onMounted(fetchData)
</script>

<style scoped>
.page-header { margin-bottom: 24px; }
.page-header h2 { margin: 0; color: #303133; }
.state-json { margin: 0; font-size: 12px; white-space: pre-wrap; }
</style>
