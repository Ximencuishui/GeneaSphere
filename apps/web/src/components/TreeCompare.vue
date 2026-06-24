<script setup lang="ts">
/**
 * TreeCompare 组件 - 用于比对两棵子树的详细信息
 * 需求来源: 寻根路家谱管理员后台需求文档 v1.1 - 4.4.2节申请详情与比对工具
 */
import { computed } from 'vue'
import { ElTag, ElProgress, ElAlert } from 'element-plus'

interface CompareItem {
  key: string
  label: string
  mainValue?: string
  applicantValue?: string
  isMatch: boolean
  matchType?: 'exact' | 'partial' | 'none'
}

interface Props {
  mainClanInfo: {
    name: string
    originPlace?: string
    xipaiInfo?: string[]
    ancestorName?: string
    migrationHistory?: string
  }
  applicantInfo: {
    name: string
    originPlace?: string
    xipaiInfo?: string[]
    ancestorName?: string
    migrationHistory?: string
  }
  matchScore?: number
  matchReasons?: string[]
}

const props = defineProps<Props>()

// 构建比对数据
const compareItems = computed<CompareItem[]>(() => {
  const items: CompareItem[] = []

  // 祖籍地比对
  items.push({
    key: 'originPlace',
    label: '祖籍地',
    mainValue: props.mainClanInfo.originPlace,
    applicantValue: props.applicantInfo.originPlace,
    isMatch: isLocationMatch(props.mainClanInfo.originPlace, props.applicantInfo.originPlace),
    matchType: getMatchType(props.mainClanInfo.originPlace, props.applicantInfo.originPlace),
  })

  // 字辈比对
  const mainXipai = props.mainClanInfo.xipaiInfo || []
  const applicantXipai = props.applicantInfo.xipaiInfo || []
  const commonXipai = mainXipai.filter(x => applicantXipai.includes(x))
  items.push({
    key: 'xipai',
    label: '字辈序列',
    mainValue: mainXipai.join(' - '),
    applicantValue: applicantXipai.join(' - '),
    isMatch: commonXipai.length > 0,
    matchType: commonXipai.length > 0 ? 'exact' : 'none',
  })

  // 关键祖先比对
  items.push({
    key: 'ancestor',
    label: '关键祖先',
    mainValue: props.mainClanInfo.ancestorName,
    applicantValue: props.applicantInfo.ancestorName,
    isMatch: isNameMatch(props.mainClanInfo.ancestorName, props.applicantInfo.ancestorName),
    matchType: getMatchType(props.mainClanInfo.ancestorName, props.applicantInfo.ancestorName),
  })

  // 迁徙史比对
  items.push({
    key: 'migration',
    label: '迁徙史',
    mainValue: props.mainClanInfo.migrationHistory,
    applicantValue: props.applicantInfo.migrationHistory,
    isMatch: isLocationMatch(props.mainClanInfo.migrationHistory, props.applicantInfo.migrationHistory),
    matchType: getMatchType(props.mainClanInfo.migrationHistory, props.applicantInfo.migrationHistory),
  })

  return items
})

// 计算匹配分数描述
const scoreDescription = computed(() => {
  const score = props.matchScore || 0
  if (score >= 80) return '高度匹配'
  if (score >= 60) return '中度匹配'
  if (score >= 40) return '低度匹配'
  return '匹配度较低'
})

const scoreType = computed((): 'success' | 'warning' | 'danger' | 'info' => {
  const score = props.matchScore || 0
  if (score >= 70) return 'success'
  if (score >= 40) return 'warning'
  return 'danger'
})

// 辅助函数
function isLocationMatch(main?: string, applicant?: string): boolean {
  if (!main || !applicant) return false
  return main.includes(applicant) || applicant.includes(main) || fuzzyMatch(main, applicant)
}

function isNameMatch(main?: string, applicant?: string): boolean {
  if (!main || !applicant) return false
  return main === applicant || fuzzyMatch(main, applicant)
}

function fuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  const aLower = a.toLowerCase()
  const bLower = b.toLowerCase()
  // 检查是否包含共同的关键字
  const keywords = ['县', '市', '省', '镇', '村', '郡', '府']
  for (const keyword of keywords) {
    if (aLower.includes(keyword) && bLower.includes(keyword)) {
      return true
    }
  }
  return false
}

function getMatchType(main?: string, applicant?: string): 'exact' | 'partial' | 'none' {
  if (!main || !applicant) return 'none'
  if (main === applicant) return 'exact'
  if (isLocationMatch(main, applicant) || isNameMatch(main, applicant)) return 'partial'
  return 'none'
}

// 获取匹配类型标签
function getMatchTagType(type?: 'exact' | 'partial' | 'none'): 'success' | 'warning' | 'info' {
  switch (type) {
    case 'exact': return 'success'
    case 'partial': return 'warning'
    default: return 'info'
  }
}

function getMatchLabel(type?: 'exact' | 'partial' | 'none'): string {
  switch (type) {
    case 'exact': return '完全匹配'
    case 'partial': return '部分匹配'
    default: return '无匹配'
  }
}
</script>

<template>
  <div class="tree-compare">
    <!-- 匹配评分 -->
    <div class="match-score-section">
      <div class="score-header">
        <span class="score-title">匹配评分</span>
        <ElTag :type="scoreType" size="large">{{ scoreDescription }}</ElTag>
      </div>
      <ElProgress
        :percentage="matchScore || 0"
        :color="matchScore && matchScore >= 70 ? '#67C23A' : matchScore && matchScore >= 40 ? '#E6A23C' : '#F56C6C'"
        :text-inside="true"
        :stroke-width="20"
      />
    </div>

    <!-- 匹配依据 -->
    <ElAlert
      v-if="matchReasons && matchReasons.length > 0"
      type="success"
      :closable="false"
      show-icon
      class="match-reasons"
    >
      <template #title>匹配依据</template>
      <ul class="reasons-list">
        <li v-for="(reason, index) in matchReasons" :key="index">{{ reason }}</li>
      </ul>
    </ElAlert>

    <!-- 比对详情 -->
    <div class="compare-details">
      <div class="compare-header">
        <div class="compare-column main">
          <span class="column-title">主家族</span>
          <span class="clan-name">{{ mainClanInfo.name }}</span>
        </div>
        <div class="compare-column applicant">
          <span class="column-title">申请方</span>
          <span class="clan-name">{{ applicantInfo.name }}</span>
        </div>
      </div>

      <div class="compare-rows">
        <div v-for="item in compareItems" :key="item.key" class="compare-row">
          <div class="row-label">{{ item.label }}</div>
          <div class="row-values">
            <div class="value-cell main" :class="{ 'highlight': item.isMatch }">
              <template v-if="item.mainValue">
                {{ item.mainValue }}
              </template>
              <span v-else class="empty-value">-</span>
            </div>
            <div class="value-cell applicant" :class="{ 'highlight': item.isMatch }">
              <template v-if="item.applicantValue">
                {{ item.applicantValue }}
              </template>
              <span v-else class="empty-value">-</span>
            </div>
          </div>
          <div class="row-status">
            <ElTag
              :type="getMatchTagType(item.matchType)"
              size="small"
              effect="plain"
            >
              {{ getMatchLabel(item.matchType) }}
            </ElTag>
          </div>
        </div>
      </div>
    </div>

    <!-- 共同字辈高亮展示 -->
    <div v-if="mainClanInfo.xipaiInfo?.length && applicantInfo.xipaiInfo?.length" class="common-xipai">
      <div class="section-title">共同字辈</div>
      <div class="xipai-display">
        <div class="xipai-list main">
          <span
            v-for="x in mainClanInfo.xipaiInfo"
            :key="x"
            class="xipai-item"
            :class="{ 'matched': applicantInfo.xipaiInfo?.includes(x) }"
          >
            {{ x }}
          </span>
        </div>
        <div class="xipai-list applicant">
          <span
            v-for="x in applicantInfo.xipaiInfo"
            :key="x"
            class="xipai-item"
            :class="{ 'matched': mainClanInfo.xipaiInfo?.includes(x) }"
          >
            {{ x }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tree-compare {
  background: #fafafa;
  border-radius: 8px;
  padding: 20px;
}

.match-score-section {
  margin-bottom: 20px;
}

.score-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.score-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.match-reasons {
  margin-bottom: 20px;
}

.reasons-list {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.reasons-list li {
  line-height: 1.8;
  color: #606266;
}

.compare-details {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #ebeef5;
}

.compare-header {
  display: flex;
  background: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
}

.compare-column {
  flex: 1;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.compare-column.main {
  border-right: 1px solid #ebeef5;
}

.column-title {
  font-size: 12px;
  color: #909399;
}

.clan-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.compare-rows {
  padding: 0;
}

.compare-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #f0f0f0;
}

.compare-row:last-child {
  border-bottom: none;
}

.row-label {
  width: 100px;
  padding: 12px 16px;
  font-size: 13px;
  color: #606266;
  background: #fafafa;
  border-right: 1px solid #ebeef5;
  flex-shrink: 0;
}

.row-values {
  flex: 1;
  display: flex;
}

.value-cell {
  flex: 1;
  padding: 12px 16px;
  font-size: 13px;
  color: #303133;
}

.value-cell.main {
  border-right: 1px solid #ebeef5;
}

.value-cell.highlight {
  background: #f0f9eb;
  color: #67c23a;
}

.empty-value {
  color: #c0c4cc;
}

.row-status {
  width: 100px;
  padding: 8px 12px;
  text-align: center;
  flex-shrink: 0;
}

.common-xipai {
  margin-top: 20px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.xipai-display {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.xipai-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.xipai-item {
  padding: 4px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 13px;
  color: #606266;
  transition: all 0.2s;
}

.xipai-item.matched {
  background: linear-gradient(135deg, #67c23a, #85ce61);
  color: white;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(103, 194, 58, 0.3);
}
</style>
