<template>
  <div class="page">
    <div class="page-header">
      <h2>邀请二维码</h2>
      <div class="actions">
        <el-button v-if="activeTab === 'qrcodes'" type="primary" @click="dialogVisible = true">
          生成新二维码
        </el-button>
        <el-button @click="activeTab === 'qrcodes' ? fetchList() : fetchRecords()">
          刷新
        </el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="invite-tabs" @tab-change="onTabChange">
      <!-- 二维码列表（原 QrcodeListPage 内容） -->
      <el-tab-pane label="二维码列表" name="qrcodes">
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
              <el-button size="small" type="danger" :disabled="row.effective_status !== 'ACTIVE'" @click="onRevoke(row)">
                撤销
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <GenerateQrcodeDialog
          v-model:visible="dialogVisible"
          :clan-slug="clanSlug"
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
      </el-tab-pane>

      <!-- 验证记录（原 VerificationRecordsPage 内容，已合并到邀请二维码页） -->
      <el-tab-pane label="验证记录" name="verification">
        <div class="filter-bar">
          <el-select v-model="recordStatus" placeholder="状态" clearable style="width: 160px;" @change="fetchRecords">
            <el-option label="PENDING" value="PENDING" />
            <el-option label="PASSED" value="PASSED" />
            <el-option label="FAILED" value="FAILED" />
            <el-option label="EXPIRED" value="EXPIRED" />
          </el-select>
        </div>

        <el-table :data="records" v-loading="recordsLoading" border stripe>
          <el-table-column prop="id" label="ID" width="100" />
          <el-table-column label="扫码者" width="200">
            <template #default="{ row }">
              <div>{{ row.scanner_nickname || '—' }}</div>
              <div style="color: #909399; font-size: 12px;">{{ row.scanner_phone || (row.scanner_openid && row.scanner_openid.slice(0, 12) + '…') }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="recordStatusTag(row.status)">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="verify_method" label="验证方式" width="120" />
          <el-table-column label="创建时间" width="180">
            <template #default="{ row }">
              {{ formatDate(row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="过期时间" width="180">
            <template #default="{ row }">
              {{ formatDate(row.expire_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="viewRecordDetail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="recordsPage"
          v-model:page-size="recordsPageSize"
          :total="recordsTotal"
          layout="total, prev, pager, next"
          @current-change="fetchRecords"
          style="margin-top: 12px; text-align: right;"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import QRCode from 'qrcode'
import GenerateQrcodeDialog from './GenerateQrcodeDialog.vue'

const route = useRoute()
const router = useRouter()
// P1-5 修复：使用路由上的 clanSlug 而非 URL 拼出的 clan_id，与后端 /api/invite/qrcodes?clan_slug 对齐
const clanSlug = ref(String(route.params.slug || ''))

// Tab 状态：qrcodes = 二维码列表（默认），verification = 验证记录
// 通过 ?tab=verification 可深链直入验证记录 tab
const activeTab = ref<string>((route.query.tab as string) === 'verification' ? 'verification' : 'qrcodes')

// =================== 二维码列表 ===================
const list = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const qrcodeDialogVisible = ref(false)
const newQrcode = ref<any>(null)

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/invite/qrcodes', { params: { clan_slug: clanSlug.value } })
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

// =================== 验证记录（原 VerificationRecordsPage 逻辑合并入） ===================
const records = ref<any[]>([])
const recordsTotal = ref(0)
const recordsPage = ref(1)
const recordsPageSize = ref(20)
const recordStatus = ref<string>('')
const recordsLoading = ref(false)

const recordStatusTag = (s: string) => ({
  PENDING: 'warning',
  PASSED: 'success',
  FAILED: 'danger',
  EXPIRED: 'info',
}[s] as any || '')

const fetchRecords = async () => {
  recordsLoading.value = true
  try {
    const res = await axios.get('/api/invite/verification-records', {
      params: {
        clan_slug: clanSlug.value,
        status: recordStatus.value || undefined,
        page: recordsPage.value,
        pageSize: recordsPageSize.value,
      },
    })
    records.value = res.data.data
    recordsTotal.value = res.data.pagination.total
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    recordsLoading.value = false
  }
}

const viewRecordDetail = (row: any) => {
  router.push({
    name: 'admin-invite-record-detail',
    params: { id: row.id },
    query: { clanSlug: clanSlug.value },
  })
}

// Tab 切换时同步 URL，便于分享/书签，并按需懒加载
const onTabChange = (tab: string | number) => {
  const next = String(tab)
  router.replace({
    path: route.path,
    query: next === 'qrcodes' ? {} : { tab: next },
  })
}

// 监听 route.query.tab 支持深链切换
watch(
  () => route.query.tab,
  (tab) => {
    const next = (tab as string) === 'verification' ? 'verification' : 'qrcodes'
    if (next !== activeTab.value) {
      activeTab.value = next
    }
  },
)

// 切换 tab 时请求对应数据（仅首次切换时请求）
const ensureLoaded = (() => {
  const loaded = { qrcodes: false, verification: false }
  return (tab: string) => {
    if (loaded[tab as keyof typeof loaded]) return
    loaded[tab as keyof typeof loaded] = true
    if (tab === 'qrcodes') fetchList()
    else fetchRecords()
  }
})()

watch(activeTab, (tab) => ensureLoaded(tab))

onMounted(() => {
  ensureLoaded(activeTab.value)
})
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
.invite-tabs {
  background-color: #FFFFFF;
  border-radius: 6px;
  padding: 12px 16px 16px;
}
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  align-items: center;
}
</style>