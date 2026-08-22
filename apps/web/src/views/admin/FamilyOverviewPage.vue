<script setup lang="ts">
/**
 * 家族概况（菜单重构 2026-08-20 后）
 * --------------------------------------------------------------------
 * 整合原【数据概览】+【家族信息】+ 新增【家族理事会】【修谱小组】：
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  家族概况（页面标题 + 右上角设置图标 → 弹出 ClanInfoDialog） │
 *   │                                                              │
 *   │  ┌────────────────────────────────────────────────────────┐ │
 *   │  │ 家族信息卡（名称/口号/祖籍/简介 + 联系信息）             │ │
 *   │  └────────────────────────────────────────────────────────┘ │
 *   │                                                              │
 *   │  ┌────────────┬────────────┬────────────┐                   │
 *   │  │ 家族成员    │ 在世人数   │ 家族影像    │  (顶部统计)       │
 *   │  └────────────┴────────────┴────────────┘                   │
 *   │                                                              │
 *   │  ┌───────────────────────────┬───────────────────────────┐  │
 *   │  │ 家族理事会（并列入口卡片） │ 修谱小组（并列入口卡片） │  │
 *   │  └───────────────────────────┴───────────────────────────┘  │
 *   │        │ 点击弹窗查看成员详情            │ 点击弹窗查看成员详情│
 *   │        ▼                                 ▼                  │
 *   │   TeamMembersDialog(council)      TeamMembersDialog(team)   │
 *   │                                                              │
 *   │  ┌────────────────────────────────────────────────────────┐ │
 *   │  │ 数据统计（原 StatisticsPanel 复用）                     │ │
 *   │  └────────────────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * 内部交互：
 *   - 家族理事会 | 修谱小组：页面上为并列入口卡片，点击才弹窗看成员详情
 *     （TeamMembersDialog，含新增/编辑/删除），不在页面直接展开列表
 *   - 家族信息编辑走 /api/admin/clan-overview/info（弹窗）
 *   - 顶部统计走 /api/admin/dashboard（不变）
 */
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import {
  ElMessage,
  ElDescriptions,
  ElDescriptionsItem,
  ElDivider,
} from 'element-plus'
import {
  UserFilled,
  HomeFilled,
  PictureFilled,
  Setting,
  EditPen,
} from '@element-plus/icons-vue'

import ClanInfoDialog from './components/ClanInfoDialog.vue'
import TeamMembersDialog from './components/TeamMembersDialog.vue'
import StatisticsPanel from '@/components/admin/StatisticsPanel.vue'

const route = useRoute()
const clanSlug = computed(() => (route.params.slug as string) || '1')

const loading = ref(false)

/**
 * 家族概况统计（沿用原 DashboardPage 顶部 3 张卡）
 */
const statistics = ref({
  total_members: 0,
  living_count: 0,
  photo_count: 0,
})

/**
 * 家族基础信息（页面标题 + 简要展示）
 */
const overview = ref<any>(null)

const fetchOverview = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/clan-overview', {
      params: { clanSlug: clanSlug.value },
    })
    overview.value = res.data

    // 同步顶部统计（直接复用 dashboard 数据）
    await fetchDashboard()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '加载家族概况失败')
  } finally {
    loading.value = false
  }
}

const fetchDashboard = async () => {
  try {
    const res = await axios.get('/api/admin/dashboard', {
      params: { clanSlug: clanSlug.value },
    })
    const stats = res.data?.statistics || {}
    statistics.value = {
      total_members: stats.total_members ?? 0,
      living_count: stats.living_count ?? 0,
      photo_count: stats.photo_count ?? 0,
    }
  } catch (e: any) {
    // dashboard 失败不影响主流程
    console.warn('fetchDashboard failed:', e)
  }
}

// ==================== 弹窗控制 ====================
const infoDialogVisible = ref(false)
const openClanInfoDialog = () => {
  infoDialogVisible.value = true
}
const onClanInfoSaved = () => {
  // 信息更新后重新拉取概况
  fetchOverview()
}

// ==================== 家族理事会 | 修谱小组（并列入口 → 弹窗详情） ====================
// 页面上仅展示两张并列入口卡片（含成员数），点击才弹窗查看成员详情，
// 不在页面直接展开成员列表。
const councilDialogVisible = ref(false)
const teamDialogVisible = ref(false)

const councilMembers = computed<any[]>(() =>
  Array.isArray(overview.value?.council) ? overview.value.council : [],
)
const revisionTeamMembers = computed<any[]>(() =>
  Array.isArray(overview.value?.revision_team) ? overview.value.revision_team : [],
)

// 弹窗内增删改后刷新概况（成员数同步）
const onTeamChanged = () => {
  fetchOverview()
}

onMounted(() => {
  fetchOverview()
})
</script>

<template>
  <div class="family-overview-page" v-loading="loading">
    <!-- 页面顶部：标题 + 家族信息设置图标 -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">家族概况</h2>
        <span v-if="overview?.clan" class="clan-name">
          · {{ overview.clan.name }}
        </span>
      </div>
      <ElTooltip content="家族信息设置" placement="top">
        <ElButton
          type="primary"
          :icon="Setting"
          circle
          @click="openClanInfoDialog"
        />
      </ElTooltip>
    </div>

    <!-- 家族基础信息卡片（顶部：名称 / 来源 / 精神 / 家规 / 口号 / 简介） -->
    <ElCard v-if="overview?.clan" class="info-card" shadow="hover">
      <div class="info-header">
        <div class="clan-title">
          <h3 class="clan-name-main">{{ overview.clan.name }}</h3>
          <span v-if="overview.clan.slogan" class="clan-slogan">{{ overview.clan.slogan }}</span>
        </div>
      </div>

      <ElDivider class="info-divider" />

      <ElDescriptions
        :column="2"
        border
        size="default"
        class="info-descriptions"
      >
        <ElDescriptionsItem label="家族名称">
          <span class="value-strong">{{ overview.clan.name || '—' }}</span>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="家族来源">
          <span class="value-strong">{{ overview.clan.origin_place || '—' }}</span>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="家族精神" :span="2">
          <div class="value-multiline">{{ overview.clan.spirit || '—' }}</div>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="家规家训" :span="2">
          <div class="value-multiline">{{ overview.clan.rules || '—' }}</div>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="家族口号" :span="2">
          <span class="value-strong">{{ overview.clan.slogan || '—' }}</span>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="家族简介" :span="2">
          <div class="value-multiline">{{ overview.clan.description || '—' }}</div>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="联系邮箱">
          <span class="value-strong">{{ overview.extra?.contact_email || '—' }}</span>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="联系电话">
          <span class="value-strong">{{ overview.extra?.contact_phone || '—' }}</span>
        </ElDescriptionsItem>
      </ElDescriptions>
    </ElCard>

    <!-- 顶部 3 张统计卡 -->
    <ElRow :gutter="20" class="stats-row">
      <ElCol :xs="12" :sm="8">
        <ElCard class="stat-card" shadow="hover" @click="$router.push('/tree/' + clanSlug)">
          <div class="stat-content">
            <div class="stat-icon" style="background: linear-gradient(135deg, #409EFF, #337ECC);">
              <ElIcon :size="28"><UserFilled /></ElIcon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.total_members }}</div>
              <div class="stat-label">家族成员</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="8">
        <ElCard class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-icon" style="background: linear-gradient(135deg, #67C23A, #529B2E);">
              <ElIcon :size="28"><HomeFilled /></ElIcon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.living_count }}</div>
              <div class="stat-label">在世人数</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="8">
        <ElCard class="stat-card" shadow="hover" @click="$router.push(`/zupu/${clanSlug}/media/library`)">
          <div class="stat-content">
            <div class="stat-icon" style="background: linear-gradient(135deg, #E6A23C, #C98A2E);">
              <ElIcon :size="28"><PictureFilled /></ElIcon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.photo_count }}</div>
              <div class="stat-label">家族影像</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- 家族理事会 | 修谱小组：并列入口卡片，点击弹窗查看成员详情 -->
    <ElRow :gutter="20" class="org-row">
      <ElCol :xs="24" :sm="12">
        <ElCard class="org-card" shadow="hover" @click="councilDialogVisible = true">
          <div class="org-card-body">
            <div class="org-icon" style="background: linear-gradient(135deg, #B8826F, #A06B52);">
              <ElIcon :size="24"><UserFilled /></ElIcon>
            </div>
            <div class="org-info">
              <div class="org-title">家族理事会</div>
              <div class="org-count">
                <template v-if="councilMembers.length > 0">{{ councilMembers.length }} 名成员</template>
                <template v-else>暂无成员</template>
              </div>
            </div>
            <div class="org-more">查看详情 ›</div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :sm="12">
        <ElCard class="org-card" shadow="hover" @click="teamDialogVisible = true">
          <div class="org-card-body">
            <div class="org-icon" style="background: linear-gradient(135deg, #7E9CB0, #607D96);">
              <ElIcon :size="24"><EditPen /></ElIcon>
            </div>
            <div class="org-info">
              <div class="org-title">修谱小组</div>
              <div class="org-count">
                <template v-if="revisionTeamMembers.length > 0">{{ revisionTeamMembers.length }} 名成员</template>
                <template v-else>暂无成员</template>
              </div>
            </div>
            <div class="org-more">查看详情 ›</div>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- 数据统计（原独立页面，已集成到本页面下方） -->
    <div class="stats-panel-wrapper">
      <StatisticsPanel />
    </div>

    <!-- 家族信息编辑弹窗 -->
    <ClanInfoDialog
      v-model="infoDialogVisible"
      @saved="onClanInfoSaved"
    />

    <!-- 家族理事会 / 修谱小组 成员详情弹窗（点击入口卡片才打开） -->
    <TeamMembersDialog
      v-model="councilDialogVisible"
      type="council"
      :clan-slug="clanSlug"
      @changed="onTeamChanged"
    />
    <TeamMembersDialog
      v-model="teamDialogVisible"
      type="revision-team"
      :clan-slug="clanSlug"
      @changed="onTeamChanged"
    />

  </div>
</template>

<style scoped>
.family-overview-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 0 4px;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.clan-name {
  color: #909399;
  font-size: 14px;
}

.info-card {
  margin-bottom: 16px;
}

.info-header {
  padding: 4px 4px 12px;
}

.clan-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px;
}

.clan-name-main {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  line-height: 1.3;
}

.clan-slogan {
  color: #B8826F;
  font-size: 14px;
  font-style: italic;
}

.info-divider {
  margin: 4px 0 16px;
}

.info-descriptions {
  margin-top: 4px;
}

.info-descriptions :deep(.el-descriptions__label) {
  color: #909399;
  font-weight: 500;
  width: 100px;
}

.info-descriptions :deep(.el-descriptions__content) {
  color: #303133;
}

.value-strong {
  color: #303133;
  font-weight: 500;
  font-size: 14px;
}

.value-multiline {
  white-space: pre-wrap;
  word-break: break-word;
  color: #303133;
  font-size: 14px;
  line-height: 1.7;
}

.stats-row {
  margin-bottom: 16px;
}

/* 家族理事会 | 修谱小组：并列入口卡片 */
.org-row {
  margin-bottom: 16px;
}

.org-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  height: 100%;
}

.org-card:hover {
  transform: translateY(-4px);
}

.org-card-body {
  display: flex;
  align-items: center;
  gap: 16px;
}

.org-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  flex-shrink: 0;
}

.org-info {
  flex: 1;
  min-width: 0;
}

.org-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.org-count {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

.org-more {
  flex-shrink: 0;
  font-size: 13px;
  color: #B8826F;
}

.section-card {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #303133;
}

.empty-tip {
  padding: 24px 0;
  text-align: center;
  color: #909399;
  font-size: 13px;
}

.stats-panel-wrapper {
  margin-top: 16px;
}

.stat-card {
  cursor: pointer;
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-4px);
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  flex-shrink: 0;
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 2px;
}

@media (max-width: 768px) {
  .stat-value {
    font-size: 22px;
  }

  .stat-icon {
    width: 44px;
    height: 44px;
  }

  .clan-name-main {
    font-size: 18px;
  }

  .info-descriptions :deep(.el-descriptions__label) {
    width: 90px;
  }
}
</style>