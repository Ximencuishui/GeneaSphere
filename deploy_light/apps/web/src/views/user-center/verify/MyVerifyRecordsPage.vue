<template>
  <div class="page">
    <h2>验证记录</h2>
    <p class="tip">这里展示你作为发起人或被背书人的验证记录。</p>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="我发起的" name="sent">
        <el-table :data="sentList" v-loading="loading" border>
          <el-table-column prop="code" label="Code" width="240" />
          <el-table-column prop="scan_count" label="扫码次数" width="100" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.effective_status)">{{ statusLabel(row.effective_status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="过期时间" width="180">
            <template #default="{ row }">{{ formatDate(row.expire_at) }}</template>
          </el-table-column>
          <el-table-column label="创建时间" width="180">
            <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="我参与的" name="received">
        <el-table :data="receivedList" v-loading="loading" border>
          <el-table-column prop="id" label="会话 ID" width="100" />
          <el-table-column prop="clan_id" label="家族" width="100" />
          <el-table-column prop="verify_method" label="验证方式" width="120" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.status)">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="180">
            <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const activeTab = ref<'sent' | 'received'>('sent')
const sentList = ref<any[]>([])
const receivedList = ref<any[]>([])
const loading = ref(false)

const formatDate = (d: string) => (d ? new Date(d).toLocaleString() : '—')
const statusLabel = (s: string) => ({ ACTIVE: '有效', EXPIRED: '已过期', REVOKED: '已撤销' }[s] || s)
const statusTag = (s: string) => ({
  ACTIVE: 'success', EXPIRED: 'info', REVOKED: 'danger',
  PENDING: 'warning', PASSED: 'success', FAILED: 'danger',
}[s] as any || '')

const fetchSent = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/invite/peer-qrcode/my-records')
    sentList.value = res.data.data
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

watch(activeTab, async (v) => {
  if (v === 'received' && receivedList.value.length === 0) {
    loading.value = true
    try {
      // 通过验证会话接口间接获取；此处仅展示与当前用户相关的会话需要后端补一个
      // 为保持简单，这里从我能管理的家族 / 我扫过的会话两种维度查
      // TODO: 后端补充 /api/invite/peer-qrcode/my-sessions 接口
      receivedList.value = []
    } finally {
      loading.value = false
    }
  }
})

onMounted(fetchSent)
</script>

<style scoped>
.page { padding: 16px; }
.tip { color: #909399; font-size: 14px; margin-bottom: 16px; }
</style>
