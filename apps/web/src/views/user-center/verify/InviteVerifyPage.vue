<!--
  我的验证（P2：tab 化）
  --------------------------------------------------------------------
  - tab 1：互发验证（生成新二维码）
  - tab 2：我的记录（合并原 MyVerifyRecordsPage 的两个子 tab）
    - 我发起的
    - 我参与的
  - 通过 query 参数 ?tab=records 支持路由直达，与
    UserCenterLayout 中 /user-center/verify/records 的重定向兼容。
-->
<template>
  <div class="page">
    <header class="page-header">
      <h2 class="page-title">我的验证</h2>
      <p class="page-tip">
        作为已认证族人，你可以为疑似本族的人生成 30 分钟有效的验证二维码；
        也可查看自己发起过与正在参与的验证会话。
      </p>
    </header>

    <ElTabs v-model="outerTab" class="outer-tabs">
      <!-- ============ tab 1：互发验证 ============ -->
      <ElTabPane label="互发验证" name="peer">
        <ElCard class="section-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">生成新二维码</span>
            </div>
          </template>
          <ElForm :inline="true" class="gen-form">
            <ElFormItem label="家族">
              <ElSelect
                v-model="form.clanId"
                placeholder="请选择家族"
                style="width: 240px"
                :disabled="clanOptions.length === 0"
              >
                <ElOption
                  v-for="opt in clanOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem>
              <ElButton
                type="primary"
                :loading="generating"
                :disabled="!form.clanId"
                @click="onGenerate"
              >
                生成
              </ElButton>
            </ElFormItem>
          </ElForm>
          <p v-if="clanOptions.length === 0" class="muted-tip">
            您尚未加入任何家族，无法生成邀请码。
          </p>
        </ElCard>

        <ElCard v-if="current" class="section-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">当前有效二维码（30 分钟内有效）</span>
              <ElButton text @click="copyLink">复制链接</ElButton>
            </div>
          </template>
          <div class="qrcode-box">
            <ElImage
              v-if="current.qrcode_data_url"
              :src="current.qrcode_data_url"
              style="width: 220px; height: 220px"
            />
            <p class="qrcode-url">{{ current.url }}</p>
            <p class="muted-tip">过期：{{ formatDate(current.expire_at) }}</p>
          </div>
        </ElCard>
      </ElTabPane>

      <!-- ============ tab 2：我的记录 ============ -->
      <ElTabPane label="我的记录" name="records">
        <ElTabs v-model="recordsTab" class="inner-tabs">
          <ElTabPane label="我发起的" name="sent">
            <ElTable :data="sentList" v-loading="loadingSent" border>
              <ElTableColumn prop="code" label="Code" width="240" />
              <ElTableColumn prop="scan_count" label="扫码次数" width="100" />
              <ElTableColumn label="状态" width="100">
                <template #default="{ row }">
                  <ElTag :type="statusTag(row.effective_status)">
                    {{ statusLabel(row.effective_status) }}
                  </ElTag>
                </template>
              </ElTableColumn>
              <ElTableColumn label="过期时间" width="180">
                <template #default="{ row }">{{ formatDate(row.expire_at) }}</template>
              </ElTableColumn>
              <ElTableColumn label="创建时间" width="180">
                <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
              </ElTableColumn>
            </ElTable>
            <div v-if="!loadingSent && sentList.length === 0" class="empty-tip">
              暂无发起的验证记录
            </div>
          </ElTabPane>

          <ElTabPane label="我参与的" name="received">
            <ElTable :data="receivedList" v-loading="loadingReceived" border>
              <ElTableColumn prop="id" label="会话 ID" width="100" />
              <ElTableColumn prop="clan_id" label="家族" width="120">
                <template #default="{ row }">
                  <span>{{ clanName(row.clan_id) || `#${row.clan_id}` }}</span>
                </template>
              </ElTableColumn>
              <ElTableColumn prop="verify_method" label="验证方式" width="120" />
              <ElTableColumn label="状态" width="120">
                <template #default="{ row }">
                  <ElTag :type="statusTag(row.status)">{{ statusText(row.status) }}</ElTag>
                </template>
              </ElTableColumn>
              <ElTableColumn label="扫描者" min-width="140">
                <template #default="{ row }">
                  {{ row.scanner_nickname || row.scanner_phone || '匿名' }}
                </template>
              </ElTableColumn>
              <ElTableColumn label="创建时间" width="180">
                <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
              </ElTableColumn>
            </ElTable>
            <div v-if="!loadingReceived && receivedList.length === 0" class="empty-tip">
              暂无参与的验证记录
            </div>
          </ElTabPane>
        </ElTabs>
      </ElTabPane>
    </ElTabs>
  </div>
</template>

<script setup lang="ts">
/**
 * 我的验证（tab 化）
 * - outerTab: peer / records（与 query 参数 ?tab 同步）
 * - recordsTab: sent / received（仅在 outerTab=records 时使用）
 */
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import QRCode from 'qrcode'
import { ElMessage } from 'element-plus'
import { useUserCenterStore } from '@/stores/userCenter'
import type { UserApplicationsResponse } from '@/types'

const route = useRoute()
const router = useRouter()
const userStore = useUserCenterStore()

const outerTab = ref<'peer' | 'records'>('peer')
const recordsTab = ref<'sent' | 'received'>('sent')

// 互发验证（tab 1）
const form = ref({ clanId: '' })
const generating = ref(false)
const current = ref<any>(null)

// 记录（tab 2）
const sentList = ref<any[]>([])
const receivedList = ref<any[]>([])
const loadingSent = ref(false)
const loadingReceived = ref(false)

const formatDate = (d: string) => (d ? new Date(d).toLocaleString() : '—')
const statusLabel = (s: string) =>
  ({ ACTIVE: '有效', EXPIRED: '已过期', REVOKED: '已撤销' }[s] || s)
const statusText = (s: string) =>
  ({ PENDING: '进行中', PASSED: '已通过', FAILED: '未通过', EXPIRED: '已过期' }[s] || s)
const statusTag = (s: string) =>
  ({
    ACTIVE: 'success',
    EXPIRED: 'info',
    REVOKED: 'danger',
    PENDING: 'warning',
    PASSED: 'success',
    FAILED: 'danger',
  }[s] as any) || ''

const clanOptions = computed<Array<{ label: string; value: string }>>(() => {
  const families = userStore.profile?.families || []
  const primary = userStore.profile?.primary_clan
  const seen = new Set<string>()
  const result: Array<{ label: string; value: string }> = []
  if (primary?.slug) {
    seen.add(primary.slug)
    result.push({ label: `${primary.name}（主家族）`, value: primary.slug })
  }
  for (const f of families) {
    if (f.slug && !seen.has(f.slug)) {
      seen.add(f.slug)
      result.push({ label: f.name, value: f.slug })
    }
  }
  return result
})

const clanName = (cid: string | number) => {
  const c = userStore.profile?.families?.find((f) => String(f.id) === String(cid))
  return c?.name || ''
}

const syncOuterTabFromRoute = () => {
  const t = route.query.tab
  if (t === 'records') outerTab.value = 'records'
  else outerTab.value = 'peer'
}

watch(outerTab, (v) => {
  // 切到 records 但 URL 没标记时补上 ?tab=records，便于面包屑 / 直达
  if (v === 'records' && route.query.tab !== 'records') {
    router.replace({ query: { ...route.query, tab: 'records' } })
  } else if (v === 'peer' && route.query.tab === 'records') {
    const next = { ...route.query }
    delete next.tab
    router.replace({ query: next })
  }
})

watch(
  () => route.query.tab,
  () => syncOuterTabFromRoute(),
)

const onGenerate = async () => {
  try {
    generating.value = true
    const res = await axios.post('/api/invite/peer-qrcode', {
      clan_slug: form.value.clanId,
    })
    const data: any = res.data?.data || res.data || {}
    try {
      if (data.url) {
        data.qrcode_data_url = await QRCode.toDataURL(data.url, { width: 480, margin: 1 })
      }
    } catch {}
    current.value = data
    ElMessage.success('已生成')
    await fetchSent()
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

const fetchSent = async () => {
  loadingSent.value = true
  try {
    const res = await axios.get('/api/invite/peer-qrcode/my-records')
    sentList.value = res.data?.data || []
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loadingSent.value = false
  }
}

const fetchReceived = async () => {
  loadingReceived.value = true
  try {
    // 用 user module 聚合的 applications.verification 列表
    const res = await axios.get('/api/user/applications', {
      params: { category: 'verification', pageSize: 50 },
    })
    const data = res.data as UserApplicationsResponse
    receivedList.value = data?.verification?.data || []
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loadingReceived.value = false
  }
}

onMounted(async () => {
  syncOuterTabFromRoute()
  if (!userStore.profile) {
    await userStore.fetchProfile()
  }
  if (!form.value.clanId && clanOptions.value.length > 0) {
    form.value.clanId = clanOptions.value[0].value
  }
  await Promise.all([fetchSent(), fetchReceived()])
})
</script>

<style scoped>
.page {
  padding: 16px;
}
.page-header {
  margin-bottom: 16px;
}
.page-title {
  margin: 0 0 4px 0;
  font-size: 18px;
  color: #303133;
}
.page-tip {
  margin: 0;
  color: #909399;
  font-size: 13px;
  line-height: 1.6;
}
.section-card {
  margin-bottom: 16px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-title {
  font-weight: 600;
  color: #303133;
}
.gen-form {
  margin-bottom: 0;
}
.qrcode-box {
  text-align: center;
}
.qrcode-url {
  margin-top: 12px;
  word-break: break-all;
}
.muted-tip {
  color: #909399;
  font-size: 12px;
  margin: 8px 0 0 0;
}
.empty-tip {
  text-align: center;
  color: #909399;
  font-size: 13px;
  padding: 24px 0;
}
.inner-tabs {
  background: #fff;
  border-radius: 6px;
  padding: 4px 0;
}
</style>
