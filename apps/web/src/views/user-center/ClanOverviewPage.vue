<script setup lang="ts">
/**
 * 用户中心 - 家族概况（只读）
 * --------------------------------------------------------------------
 * 族员查看所属家族的概况信息，不可编辑。
 * 展示：家族基础信息（名称/来源/精神/家规/口号/简介）+ 理事会 + 修谱小组
 */
import { ref, onMounted } from 'vue'
import axios from 'axios'
import {
  ElMessage,
  ElDescriptions,
  ElDescriptionsItem,
  ElDivider,
  ElEmpty,
} from 'element-plus'
import {
  User,
  Edit as EditIcon,
  Phone,
  Position,
} from '@element-plus/icons-vue'

const loading = ref(false)
const overview = ref<any>(null)

const fetchOverview = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/user/clan-overview')
    overview.value = res.data
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '加载家族概况失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchOverview()
})
</script>

<template>
  <div class="user-clan-overview" v-loading="loading">
    <!-- 未加入家族 -->
    <ElEmpty v-if="!overview" description="您尚未加入任何家族" />

    <template v-else>
      <!-- 家族基础信息卡片 -->
      <ElCard v-if="overview.clan" class="info-card" shadow="hover">
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

      <!-- 家族理事会 -->
      <ElCard class="section-card" shadow="hover">
        <template #header>
          <div class="section-header">
            <div class="section-title">
              <ElIcon><User /></ElIcon>
              <span>家族理事会</span>
              <ElTag size="small" type="info" effect="plain">{{ (overview.council || []).length }} 人</ElTag>
            </div>
          </div>
        </template>

        <div v-if="(overview.council || []).length === 0" class="empty-tip">
          暂无理事会成员
        </div>
        <ElTable v-else :data="overview.council" stripe size="default">
          <ElTableColumn type="index" label="#" width="60" />
          <ElTableColumn prop="name" label="理事姓名" min-width="120" />
          <ElTableColumn prop="contact" label="联系方式" min-width="160">
            <template #default="{ row }">
              <ElIcon><Phone /></ElIcon>
              <span style="margin-left: 6px;">{{ row.contact }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="position" label="职务" min-width="120">
            <template #default="{ row }">
              <span v-if="row.position">
                <ElIcon><Position /></ElIcon>
                <span style="margin-left: 6px;">{{ row.position }}</span>
              </span>
              <span v-else style="color: #909399;">—</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="remark" label="备注" min-width="160">
            <template #default="{ row }">
              <span v-if="row.remark" style="color: #606266;">{{ row.remark }}</span>
              <span v-else style="color: #909399;">—</span>
            </template>
          </ElTableColumn>
        </ElTable>
      </ElCard>

      <!-- 修谱小组 -->
      <ElCard class="section-card" shadow="hover">
        <template #header>
          <div class="section-header">
            <div class="section-title">
              <ElIcon><EditIcon /></ElIcon>
              <span>修谱小组</span>
              <ElTag size="small" type="info" effect="plain">{{ (overview.revision_team || []).length }} 人</ElTag>
            </div>
          </div>
        </template>

        <div v-if="(overview.revision_team || []).length === 0" class="empty-tip">
          暂无修谱小组成员
        </div>
        <ElTable v-else :data="overview.revision_team" stripe size="default">
          <ElTableColumn type="index" label="#" width="60" />
          <ElTableColumn prop="name" label="联系人" min-width="120" />
          <ElTableColumn prop="contact" label="联系方式" min-width="160">
            <template #default="{ row }">
              <ElIcon><Phone /></ElIcon>
              <span style="margin-left: 6px;">{{ row.contact }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="duty" label="职责" min-width="120">
            <template #default="{ row }">
              <span v-if="row.duty">{{ row.duty }}</span>
              <span v-else style="color: #909399;">—</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="remark" label="备注" min-width="160">
            <template #default="{ row }">
              <span v-if="row.remark" style="color: #606266;">{{ row.remark }}</span>
              <span v-else style="color: #909399;">—</span>
            </template>
          </ElTableColumn>
        </ElTable>
      </ElCard>
    </template>
  </div>
</template>

<style scoped>
.user-clan-overview {
  max-width: 1200px;
  margin: 0 auto;
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

@media (max-width: 768px) {
  .clan-name-main {
    font-size: 18px;
  }

  .info-descriptions :deep(.el-descriptions__label) {
    width: 90px;
  }
}
</style>
