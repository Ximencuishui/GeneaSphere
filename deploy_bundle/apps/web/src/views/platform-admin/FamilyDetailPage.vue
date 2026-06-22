<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const detail = ref<any>(null)
const clanId = ref(route.params.id as string)

const fetchDetail = async () => {
  loading.value = true
  try {
    const res = await axios.get(`/api/platform/families/${clanId.value}`)
    detail.value = res.data
  } catch (err) {
    console.error(err)
    ElMessage.error('获取家族详情失败')
  } finally {
    loading.value = false
  }
}

const handleApprove = async () => {
  try {
    await ElMessageBox.confirm('确定审核通过？', '确认', { type: 'success' })
    await axios.post(`/api/platform/families/${clanId.value}/approve`)
    ElMessage.success('已通过')
    fetchDetail()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleFreeze = async () => {
  try {
    await ElMessageBox.confirm('确定冻结？', '冻结家族', { type: 'warning' })
    await axios.post(`/api/platform/families/${clanId.value}/freeze`)
    ElMessage.success('已冻结')
    fetchDetail()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleUnfreeze = async () => {
  await axios.post(`/api/platform/families/${clanId.value}/unfreeze`)
  ElMessage.success('已解冻')
  fetchDetail()
}

const handleDelete = async () => {
  try {
    await ElMessageBox.confirm('确定逻辑删除？', '确认删除', { type: 'error', confirmButtonText: '确认删除' })
    await axios.delete(`/api/platform/families/${clanId.value}`)
    ElMessage.success('已删除')
    router.push('/platform-admin/families')
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

const handleExport = async () => {
  const res = await axios.get(`/api/platform/families/${clanId.value}/export`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `clan_${clanId.value}_${Date.now()}.json`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

onMounted(() => {
  fetchDetail()
})
</script>

<template>
  <div class="family-detail">
    <ElPageHeader @back="router.push('/platform-admin/families')" :icon="ArrowLeft">
      <template #content>
        <span class="page-header-text">家族详情</span>
      </template>
    </ElPageHeader>

    <ElCard v-loading="loading" class="detail-card" shadow="hover">
      <template v-if="detail">
        <h2 class="family-name">{{ detail.name }}</h2>
        <ElTag :type="detail.status === 'NORMAL' ? 'success' : detail.status === 'FROZEN' ? 'warning' : 'danger'" effect="dark" round>
          {{ detail.status === 'NORMAL' ? '正常' : detail.status === 'FROZEN' ? '已冻结' : detail.status === 'PENDING_REVIEW' ? '待审核' : '已删除' }}
        </ElTag>

        <ElDescriptions :column="2" border class="info-table" style="margin-top: 20px;">
          <ElDescriptionsItem label="家族ID">{{ detail.id }}</ElDescriptionsItem>
          <ElDescriptionsItem label="管理员手机">{{ detail.admin_user.phone_masked }}</ElDescriptionsItem>
          <ElDescriptionsItem label="注册时间">{{ new Date(detail.created_at).toLocaleString() }}</ElDescriptionsItem>
          <ElDescriptionsItem label="注册IP">{{ detail.register_ip || '未记录' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="审核时间">{{ detail.reviewed_at ? new Date(detail.reviewed_at).toLocaleString() : '未审核' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="审核人ID">{{ detail.reviewer_id || '-' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="家族描述" :span="2">
            {{ detail.description || '（无）' }}
          </ElDescriptionsItem>
        </ElDescriptions>

        <h3 class="section-title">数据概览</h3>
        <ElRow :gutter="20">
          <ElCol :span="5"><div class="metric-card"><div class="num">{{ detail.stats.member_count }}</div><div class="label">成员数</div></div></ElCol>
          <ElCol :span="5"><div class="metric-card"><div class="num">{{ detail.stats.media_count }}</div><div class="label">照片数</div></div></ElCol>
          <ElCol :span="7"><div class="metric-card"><div class="num">{{ (detail.stats.storage_bytes / 1024 / 1024).toFixed(2) }} MB</div><div class="label">存储用量</div></div></ElCol>
          <ElCol :span="7"><div class="metric-card"><div class="num">{{ detail.stats.print_order_count }}</div><div class="label">印刷订单数</div></div></ElCol>
        </ElRow>

        <h3 class="section-title">操作</h3>
        <ElSpace wrap>
          <ElButton v-if="detail.status === 'PENDING_REVIEW'" type="success" @click="handleApprove">审核通过</ElButton>
          <ElButton v-if="detail.status === 'NORMAL'" type="warning" @click="handleFreeze">冻结</ElButton>
          <ElButton v-if="detail.status === 'FROZEN'" type="primary" @click="handleUnfreeze">解冻</ElButton>
          <ElButton @click="handleExport">导出数据</ElButton>
          <ElButton v-if="detail.status !== 'DELETED'" type="danger" @click="handleDelete">逻辑删除</ElButton>
        </ElSpace>
      </template>
    </ElCard>
  </div>
</template>

<style scoped>
.family-detail {
  max-width: 1200px;
  margin: 0 auto;
}

.detail-card {
  margin-top: 16px;
}

.family-name {
  display: inline-block;
  margin: 0 12px 0 0;
  color: #1f3a5f;
}

.info-table {
  margin-top: 16px;
}

.section-title {
  margin: 24px 0 12px;
  color: #1f3a5f;
  border-left: 4px solid #2c5fa3;
  padding-left: 10px;
  font-size: 16px;
}

.metric-card {
  background: linear-gradient(135deg, #f5f7fa 0%, #e6ecf5 100%);
  border-radius: 8px;
  padding: 20px 12px;
  text-align: center;
}

.metric-card .num {
  font-size: 24px;
  font-weight: 700;
  color: #1f3a5f;
}

.metric-card .label {
  font-size: 13px;
  color: #5a6678;
  margin-top: 4px;
}

.page-header-text {
  font-size: 16px;
  color: #1f3a5f;
  font-weight: 600;
}
</style>
