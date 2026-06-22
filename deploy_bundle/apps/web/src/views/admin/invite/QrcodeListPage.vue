<template>
  <div class="page">
    <div class="page-header">
      <h2>邀请二维码</h2>
      <div class="actions">
        <el-button type="primary" @click="dialogVisible = true">生成新二维码</el-button>
        <el-button @click="fetchList">刷新</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="code" label="Code" width="280" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.effective_status)">{{ statusLabel(row.effective_status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="scan_count" label="扫码次数" width="100" />
      <el-table-column label="过期时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.expire_at) }}
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="链接">
        <template #default="{ row }">
          <el-link type="primary" :href="row.url" target="_blank">{{ row.url }}</el-link>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="copyLink(row)">复制链接</el-button>
          <el-button size="small" type="danger" :disabled="row.effective_status !== 'ACTIVE'" @click="onRevoke(row)">撤销</el-button>
        </template>
      </el-table-column>
    </el-table>

    <GenerateQrcodeDialog
      v-model:visible="dialogVisible"
      :clan-id="clanId"
      @created="onCreated"
    />

    <el-dialog
      v-model="qrcodeDialogVisible"
      title="邀请二维码"
      width="420"
    >
      <div v-if="newQrcode" style="text-align: center;">
        <el-image :src="newQrcode.qrcode_data_url" style="width: 240px; height: 240px;" />
        <p style="margin-top: 12px; word-break: break-all;">{{ newQrcode.url }}</p>
        <p style="color: #909399; font-size: 12px;">过期：{{ formatDate(newQrcode.expire_at) }}</p>
      </div>
      <template #footer>
        <el-button @click="copyLink(newQrcode)">复制链接</el-button>
        <el-button @click="downloadQrcode">下载 PNG</el-button>
        <el-button type="primary" @click="qrcodeDialogVisible = false">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import QRCode from 'qrcode'
import GenerateQrcodeDialog from './GenerateQrcodeDialog.vue'

const route = useRoute()
const clanId = ref(String(route.query.clanId || '1'))
const list = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const qrcodeDialogVisible = ref(false)
const newQrcode = ref<any>(null)

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/invite/qrcodes', { params: { clan_id: clanId.value } })
    list.value = res.data.data
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const formatDate = (d: string) => (d ? new Date(d).toLocaleString() : '—')

const statusLabel = (s: string) => ({
  ACTIVE: '有效',
  EXPIRED: '已过期',
  REVOKED: '已撤销',
}[s] || s)

const statusTagType = (s: string) => ({
  ACTIVE: 'success',
  EXPIRED: 'info',
  REVOKED: 'danger',
}[s] as any || '')

const onCreated = async (data: any) => {
  newQrcode.value = data
  try {
    newQrcode.value.qrcode_data_url = await QRCode.toDataURL(data.url, { width: 480, margin: 1 })
  } catch {}
  qrcodeDialogVisible.value = true
  await fetchList()
}

const onRevoke = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确认撤销二维码 ${row.code}？撤销后无法再使用`, '提示', {
      type: 'warning',
    })
    await axios.delete(`/api/invite/qrcodes/${row.id}`)
    ElMessage.success('已撤销')
    await fetchList()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '撤销失败')
  }
}

const copyLink = (row: any) => {
  if (!row?.url) return
  navigator.clipboard?.writeText(row.url)
  ElMessage.success('已复制链接')
}

const downloadQrcode = () => {
  if (!newQrcode.value?.qrcode_data_url) return
  const a = document.createElement('a')
  a.href = newQrcode.value.qrcode_data_url
  a.download = `invite-${newQrcode.value.code}.png`
  a.click()
}

onMounted(fetchList)
</script>

<style scoped>
.page {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.actions {
  display: flex;
  gap: 8px;
}
</style>
