<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import type { AxiosResponse } from 'axios'
// ========== 接口响应类型定义 ==========

interface SummaryTotals {
  new_families: number
  new_users: number
  new_media: number
  new_orders: number
  revenue: number
}

interface SummaryResponse {
  period: 'day' | 'week' | 'month'
  since: string
  totals: SummaryTotals
  trends: Array<{ date: string; revenue: number; order_count: number }>
}

interface FamilyRankingItem {
  clan_id: string
  name: string
  value: number
}

interface FamilyRankingResponse {
  type: string
  data: FamilyRankingItem[]
}

interface ToolUsageItem {
  tool_key: string
  tool_name: string
  count: number
}

// ========== 状态 ==========

const period = ref<'day' | 'week' | 'month'>('week')
const summary = ref<SummaryResponse>({
  period: 'week',
  since: '',
  totals: { new_families: 0, new_users: 0, new_media: 0, new_orders: 0, revenue: 0 },
  trends: [],
})
const rankingType = ref<'member_count' | 'photo_count' | 'storage' | 'revenue'>('member_count')
const rankingData = ref<FamilyRankingItem[]>([])
const rankingPagination = ref({ page: 1, page_size: 20, total: 0, total_pages: 0 })
const toolUsageData = ref<ToolUsageItem[]>([])
const toolUsagePeriod = ref<'day' | 'week' | 'month'>('week')
const pdfPeriod = ref<'day' | 'week' | 'month'>('week')

const fetchSummary = async () => {
  try {
    const res = await axios.get<SummaryResponse>('/api/platform/statistics/summary', {
      params: { period: period.value },
    })
    summary.value = res.data
  } catch (err) {
    console.error(err)
  }
}

const fetchRanking = async () => {
  try {
    const res = await axios.get<FamilyRankingResponse>(
      '/api/platform/statistics/family-ranking',
      { params: { type: rankingType.value, limit: 20 } },
    )
    rankingData.value = res.data.data
  } catch (err) {
    console.error(err)
  }
}

const fetchToolUsage = async () => {
  try {
    const res = await axios.get<{ period: string; since: string; data: ToolUsageItem[] }>(
      '/api/platform/statistics/tool-usage',
      { params: { period: toolUsagePeriod.value, limit: 20 } },
    )
    toolUsageData.value = res.data.data || []
  } catch (err) {
    console.error(err)
  }
}

const handleExport = async (type: 'summary' | 'family-ranking', format: 'excel' | 'csv') => {
  try {
    const res: AxiosResponse<Blob> = await axios.get('/api/platform/statistics/export', {
      params: { type, format },
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    const ext = format === 'excel' ? 'xlsx' : 'csv'
    link.setAttribute('download', `stats_${type}_${Date.now()}.${ext}`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('已导出')
  } catch (err) {
    ElMessage.error('导出失败')
  }
}

const handleDownloadPdf = async () => {
  try {
    const res: AxiosResponse<Blob> = await axios.get('/api/platform/statistics/report', {
      params: { period: pdfPeriod.value },
      responseType: 'blob',
    })
    const label =
      pdfPeriod.value === 'day' ? 'daily' : pdfPeriod.value === 'week' ? 'weekly' : 'monthly'
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `xungenlu_${label}_report_${Date.now()}.pdf`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('PDF 报表已生成')
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || 'PDF 生成失败')
  }
}

const typeLabel = (t: string) => {
  const map: Record<string, string> = {
    member_count: '成员数', photo_count: '照片数', storage: '存储量', revenue: '收入',
  }
  return map[t] || t
}

const formatValue = (t: string, v: number) => {
  if (t === 'storage') return (v / 1024 / 1024).toFixed(2) + ' MB'
  if (t === 'revenue') return '¥' + Number(v).toFixed(2)
  return v.toLocaleString()
}

onMounted(() => {
  fetchSummary()
  fetchRanking()
  fetchToolUsage()
})
</script>

<template>
  <div class="statistics-page">
    <ElRow :gutter="20">
      <ElCol :span="14">
        <ElCard shadow="hover">
          <template #header>
            <div class="page-header">
              <h2>周期统计</h2>
              <ElRadioGroup v-model="period" @change="fetchSummary" size="small">
                <ElRadioButton value="day">日</ElRadioButton>
                <ElRadioButton value="week">周</ElRadioButton>
                <ElRadioButton value="month">月</ElRadioButton>
              </ElRadioGroup>
            </div>
          </template>
          <div class="metrics">
            <div class="metric"><div class="num">{{ summary.totals.new_families }}</div><div class="lbl">新增家族</div></div>
            <div class="metric"><div class="num">{{ summary.totals.new_users }}</div><div class="lbl">新增用户</div></div>
            <div class="metric"><div class="num">{{ summary.totals.new_media }}</div><div class="lbl">新增照片</div></div>
            <div class="metric"><div class="num">{{ summary.totals.new_orders }}</div><div class="lbl">新增订单</div></div>
            <div class="metric highlight"><div class="num">¥{{ Number(summary.totals.revenue).toFixed(2) }}</div><div class="lbl">本周期收入</div></div>
          </div>
          <ElTable :data="summary.trends" stripe size="small" style="margin-top: 16px;">
            <ElTableColumn prop="date" label="日期" width="140" />
            <ElTableColumn label="订单数" width="140">
              <template #default="{ row }">{{ row.order_count }}</template>
            </ElTableColumn>
            <ElTableColumn label="收入">
              <template #default="{ row }">¥{{ Number(row.revenue).toFixed(2) }}</template>
            </ElTableColumn>
          </ElTable>
          <ElButton style="margin-top: 12px;" @click="handleExport('summary', 'excel')">导出 Excel</ElButton>
        </ElCard>
      </ElCol>

      <ElCol :span="10">
        <ElCard shadow="hover">
          <template #header>
            <h2>家族排行</h2>
          </template>
          <ElSelect v-model="rankingType" @change="fetchRanking" style="width: 100%; margin-bottom: 12px;">
            <ElOption label="按成员数" value="member_count" />
            <ElOption label="按照片数" value="photo_count" />
            <ElOption label="按存储量" value="storage" />
            <ElOption label="按收入" value="revenue" />
          </ElSelect>
          <ElTable :data="rankingData" size="small" max-height="380">
            <ElTableColumn type="index" label="#" width="50" />
            <ElTableColumn prop="name" label="家族名称" />
            <ElTableColumn :label="typeLabel(rankingType)" align="right">
              <template #default="{ row }">{{ formatValue(rankingType, row.value) }}</template>
            </ElTableColumn>
          </ElTable>
          <ElButton style="margin-top: 12px;" @click="handleExport('family-ranking', 'excel')">导出 Excel</ElButton>
        </ElCard>
      </ElCol>
    </ElRow>

    <ElCard shadow="hover" class="tool-usage">
      <template #header>
        <div class="page-header">
          <h2>工具使用排行</h2>
          <ElRadioGroup v-model="toolUsagePeriod" @change="fetchToolUsage" size="small">
            <ElRadioButton value="day">日</ElRadioButton>
            <ElRadioButton value="week">周</ElRadioButton>
            <ElRadioButton value="month">月</ElRadioButton>
          </ElRadioGroup>
        </div>
      </template>
      <ElTable v-if="toolUsageData.length > 0" :data="toolUsageData" size="small" stripe>
        <ElTableColumn type="index" label="#" width="60" />
        <ElTableColumn prop="tool_name" label="工具名称" min-width="160" />
        <ElTableColumn prop="tool_key" label="标识" width="160" />
        <ElTableColumn prop="count" label="调用次数" width="120" align="right">
          <template #default="{ row }">{{ row.count.toLocaleString() }}</template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-else description="本周期暂无工具调用记录" />
    </ElCard>

    <ElCard shadow="hover" class="pdf-report-card">
      <template #header>
        <div class="page-header">
          <h2>PDF 报表下载</h2>
          <ElRadioGroup v-model="pdfPeriod" size="small">
            <ElRadioButton value="day">日报</ElRadioButton>
            <ElRadioButton value="week">周报</ElRadioButton>
            <ElRadioButton value="month">月报</ElRadioButton>
          </ElRadioGroup>
        </div>
      </template>
      <p class="pdf-desc">自动生成包含核心指标、收入趋势、家族排行的 PDF 报表（需求 §3.11）。</p>
      <ElButton type="primary" @click="handleDownloadPdf">下载 {{ pdfPeriod === 'day' ? '日报' : pdfPeriod === 'week' ? '周报' : '月报' }} PDF</ElButton>
    </ElCard>
  </div>
</template>

<style scoped>
.statistics-page {
  max-width: 1400px;
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

.metrics {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-bottom: 8px;
}

.metric {
  text-align: center;
  padding: 16px 8px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e6ecf5 100%);
  border-radius: 8px;
}

.metric.highlight {
  background: linear-gradient(135deg, #2c5fa3 0%, #5e8fd1 100%);
  color: #fff;
}

.metric .num {
  font-size: 20px;
  font-weight: 700;
  color: #1f3a5f;
}

.metric.highlight .num {
  color: #fff;
}

.metric .lbl {
  font-size: 12px;
  color: #5a6678;
  margin-top: 4px;
}

.metric.highlight .lbl {
  color: rgba(255, 255, 255, 0.85);
}

.tool-usage {
  margin-top: 20px;
}

.pdf-report-card {
  margin-top: 20px;
}

.pdf-desc {
  color: #5a6678;
  font-size: 13px;
  margin: 0 0 12px;
}
</style>
