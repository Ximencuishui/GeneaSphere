<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import QRCode from 'qrcode'
import { ElMessage } from 'element-plus'

const route = useRoute()
const clanSlug = computed(() => String(route.params.slug || ''))
const notices = ref<any[]>([])
const loading = ref(false)
const qrDataUrl = ref('')

function buildLink(notice: any) {
  return `${window.location.origin}/h5/genealogy-edit?clanSlug=${encodeURIComponent(clanSlug.value)}&token=${encodeURIComponent(notice.token)}`
}

const activeNotice = computed(() => notices.value.find((item) => item.status === 'sent') || notices.value[0])

async function refreshQr() {
  qrDataUrl.value = activeNotice.value
    ? await QRCode.toDataURL(buildLink(activeNotice.value), { width: 480, margin: 1 })
    : ''
}

async function loadNotices() {
  loading.value = true
  try {
    const { data } = await axios.get(`/api/genealogy/${clanSlug.value}/crowdsource/notices`)
    notices.value = data?.data ?? data ?? []
    await refreshQr()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '加载族员入口失败')
  } finally {
    loading.value = false
  }
}

async function copyLink(notice: any) {
  await navigator.clipboard.writeText(buildLink(notice))
  ElMessage.success('族员入口链接已复制')
}

onMounted(loadNotices)
</script>

<template>
  <div class="h5-entry-page">
    <GenealogyWorkflowBar :highlight="['notify', 'member_edit']" />
    <ElRow :gutter="20">
      <ElCol :xs="24" :md="8">
        <ElCard v-loading="loading" class="qr-card">
          <template #header><strong>当前族员入口</strong></template>
          <template v-if="activeNotice">
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="族员入口二维码" class="qr-image" />
            <h3>{{ activeNotice.title }}</h3>
            <p>{{ activeNotice.content }}</p>
            <ElButton type="primary" @click="copyLink(activeNotice)">复制链接</ElButton>
          </template>
          <ElEmpty v-else description="请先在众包修改中创建通知文案" />
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :md="16">
        <ElCard>
          <template #header>
            <div class="header"><strong>全部入口链接</strong><ElButton @click="loadNotices">刷新</ElButton></div>
          </template>
          <ElTable v-loading="loading" :data="notices" empty-text="暂无通知文案">
            <ElTableColumn prop="title" label="通知标题" min-width="180" />
            <ElTableColumn prop="status" label="状态" width="100" />
            <ElTableColumn prop="sent_count" label="访问/发送数" width="110" />
            <ElTableColumn label="入口链接" min-width="260">
              <template #default="{ row }"><span class="link">{{ buildLink(row) }}</span></template>
            </ElTableColumn>
            <ElTableColumn label="操作" width="100">
              <template #default="{ row }"><ElButton link type="primary" @click="copyLink(row)">复制</ElButton></template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
        <ElCard class="log-card">
          <template #header><strong>访问记录</strong></template>
          <ElEmpty description="访问日志接口尚未提供" />
        </ElCard>
      </ElCol>
    </ElRow>
  </div>
</template>

<style scoped>
.h5-entry-page { max-width: 1400px; margin: 0 auto; }
.qr-card { text-align: center; }
.qr-image { width: min(100%, 280px); }
.header { display: flex; justify-content: space-between; align-items: center; }
.link { font-size: 12px; color: #606266; word-break: break-all; }
.log-card { margin-top: 20px; }
</style>
