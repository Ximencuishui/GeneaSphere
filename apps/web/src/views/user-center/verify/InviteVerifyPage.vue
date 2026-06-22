<template>
  <div class="page">
    <h2>我的验证二维码</h2>
    <p class="tip">作为已认证族人，你可以为疑似本族的人生成 30 分钟有效的验证二维码。对方扫码后由你担保他/她完成身份验证。</p>

    <el-card>
      <template #header>
        <div class="card-header">
          <span>生成新二维码</span>
        </div>
      </template>
      <el-form :inline="true">
        <el-form-item label="家族 ID">
          <el-input v-model="form.clanId" placeholder="默认 1" style="width: 160px;" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="generating" @click="onGenerate">生成</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="current" style="margin-top: 16px;">
      <template #header>
        <div class="card-header">
          <span>当前有效二维码（30 分钟内有效）</span>
          <el-button text @click="copyLink">复制链接</el-button>
        </div>
      </template>
      <div style="text-align: center;">
        <el-image :src="current.qrcode_data_url" style="width: 220px; height: 220px;" />
        <p style="margin-top: 12px; word-break: break-all;">{{ current.url }}</p>
        <p style="color: #909399; font-size: 12px;">过期：{{ formatDate(current.expire_at) }}</p>
      </div>
    </el-card>

    <el-card style="margin-top: 16px;">
      <template #header>
        <div class="card-header">
          <span>我发起过的验证</span>
          <el-button text @click="fetchList">刷新</el-button>
        </div>
      </template>
      <el-table :data="list" v-loading="loading" border>
        <el-table-column prop="code" label="Code" width="240" />
        <el-table-column prop="scan_count" label="扫码次数" width="100" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.effective_status)">{{ statusLabel(row.effective_status) }}</el-tag>
          </template>
        </el-table-column>
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
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import QRCode from 'qrcode'

const form = ref({ clanId: '1' })
const generating = ref(false)
const current = ref<any>(null)
const list = ref<any[]>([])
const loading = ref(false)

const formatDate = (d: string) => (d ? new Date(d).toLocaleString() : '—')
const statusLabel = (s: string) => ({ ACTIVE: '有效', EXPIRED: '已过期', REVOKED: '已撤销' }[s] || s)
const statusTag = (s: string) => ({ ACTIVE: 'success', EXPIRED: 'info', REVOKED: 'danger' }[s] as any || '')

const onGenerate = async () => {
  try {
    generating.value = true
    const res = await axios.post('/api/invite/peer-qrcode', {
      clan_id: form.value.clanId,
    })
    const data: any = res.data
    try {
      data.qrcode_data_url = await QRCode.toDataURL(data.url, { width: 480, margin: 1 })
    } catch {}
    current.value = data
    ElMessage.success('已生成')
    await fetchList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

const copyLink = () => {
  if (!current.value?.url) return
  navigator.clipboard?.writeText(current.value.url)
  ElMessage.success('已复制链接')
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/invite/peer-qrcode/my-records')
    list.value = res.data.data
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(fetchList)
</script>

<style scoped>
.page { padding: 16px; }
.tip { color: #909399; font-size: 14px; margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
