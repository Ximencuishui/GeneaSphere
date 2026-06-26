<script setup lang="ts">
import { ref, onMounted } from 'vue';import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import TreeSelect from '@/components/TreeSelect.vue'

const route = useRoute()
const router = useRouter()

// 步骤控制
const currentStep = ref(0)
const steps = [
  { title: '挂载点选择', description: '选择主家族中的挂载点' },
  { title: '世代确认', description: '确认并调整世代对齐' },
  { title: '执行合并', description: '确认并执行归宗合并' },
  { title: '完成', description: '合并操作已完成' },
]

// 数据状态
const loading = ref(false)
const submitting = ref(false)
const wizardData = ref<any>(null)
const mainClanTree = ref<any[]>([])
const applicantTree = ref<any[]>([])
const anchors = ref<any[]>([])

// 选择的挂载点
const selectedAnchor = ref<any>(null)

// 世代对齐数据
const generationAlignments = ref<any[]>([])
const hasConflicts = ref(false)

// 合并结果
const mergeResult = ref<any>(null)

// 获取向导初始化数据
const fetchWizardData = async () => {
  loading.value = true
  try {
    const appId = route.params.appId
    const res = await axios.get(`/api/admin/merge/wizard/${appId}`)
    wizardData.value = res.data.data
    
    // 获取族谱树
    await Promise.all([
      fetchMainClanTree(),
      fetchApplicantTree(),
    ])
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '获取数据失败')
  } finally {
    loading.value = false
  }
}

// 获取主家族树
const fetchMainClanTree = async () => {
  if (!wizardData.value) return
  try {
    const res = await axios.get(`/api/admin/merge/clans/${wizardData.value.mainClan.id}/tree`)
    mainClanTree.value = res.data.data
    // 过滤已故人员作为可选择的挂载点
    anchors.value = res.data.data.filter((p: any) => !p.isLiving)
  } catch (error) {
    console.error('Failed to fetch main clan tree:', error)
  }
}

// 获取申请方支系树
const fetchApplicantTree = async () => {
  if (!wizardData.value) return
  try {
    const res = await axios.get(`/api/admin/merge/clans/${wizardData.value.applicantClan.id}/tree`)
    applicantTree.value = res.data.data
  } catch (error) {
    console.error('Failed to fetch applicant tree:', error)
  }
}

// 处理挂载点选择
const handleAnchorSelect = async (node: any) => {
  selectedAnchor.value = node
  
  // 验证挂载点
  try {
    const res = await axios.post('/api/admin/merge/validate-anchor', {
      anchorPersonId: node.id,
      mainClanId: wizardData.value.mainClan.id,
      applicantClanId: wizardData.value.applicantClan.id,
    })
    
    if (!res.data.success) {
      ElMessage.warning(res.data.data.error || '挂载点验证失败')
      return
    }
    
    // 显示警告
    if (res.data.data.warnings?.length) {
      ElMessage.warning(res.data.data.warnings.join('\\n'))
    }
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '验证失败')
  }
}

// 下一步：获取世代对齐预览
const nextToGeneration = async () => {
  if (!selectedAnchor.value) {
    ElMessage.warning('请先选择一个挂载点')
    return
  }
  
  try {
    const res = await axios.post('/api/admin/merge/preview-alignment', {
      anchorPersonId: selectedAnchor.value.id,
      applicantClanId: wizardData.value.applicantClan.id,
      mainClanId: wizardData.value.mainClan.id,
    })
    
    generationAlignments.value = res.data.data
    hasConflicts.value = res.data.data.some((g: any) => g.hasConflict)
    currentStep.value = 1
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '获取世代对齐信息失败')
  }
}

// 调整世代
const adjustGeneration = (personId: string, delta: number) => {
  const item = generationAlignments.value.find((g) => g.personId === personId)
  if (item) {
    const newAdjustment = item.adjustment + delta
    // 限制调整范围在 -1 到 1
    if (newAdjustment >= -1 && newAdjustment <= 1) {
      item.adjustment = newAdjustment
      item.newGeneration = item.originalGeneration + item.adjustment + delta
    }
  }
}

// 检查冲突
const checkConflicts = () => {
  // 检查是否有父子关系冲突
  for (const item of generationAlignments.value) {
    if (item.hasConflict) {
      return true
    }
  }
  return false
}

// 下一步：执行合并
const nextToExecute = async () => {
  if (checkConflicts()) {
    ElMessage.error('存在世代冲突，请先解决')
    return
  }
  
  try {
    await ElMessageBox.confirm(
      `确认执行归宗合并？\n\n` +
      `挂载点：${selectedAnchor.value.fullName}\n` +
      `影响人数：${generationAlignments.value.length}\n\n` +
      `⚠️ 系统将自动创建数据快照（24小时内可回滚）`,
      '确认合并',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
    )
    currentStep.value = 2
  } catch {
    // 用户取消
  }
}

// 执行合并
const executeMerge = async () => {
  submitting.value = true
  try {
    // 计算总世代偏移
    const offsetAdjustment = generationAlignments.value.reduce(
      (sum: number, g: any) => sum + g.adjustment,
      0
    )
    
    const res = await axios.post('/api/admin/merge/execute', {
      applicationId: route.params.appId,
      anchorPersonId: selectedAnchor.value.id,
      generationOffset: offsetAdjustment,
    })
    
    mergeResult.value = res.data.data
    ElMessage.success('归宗合并已完成！')
    currentStep.value = 3
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '合并执行失败')
  } finally {
    submitting.value = false
  }
}

// 返回申请列表
const goBack = () => {
  router.push(`/zupu/${clanSlug}//admin/merge/applications`)
}

// 完成
const finish = () => {
  router.push(`/zupu/${clanSlug}//admin/merge/applications`)
}

// 初始化
onMounted(() => {
  fetchWizardData()
})
</script>

<template>
  <div class="merge-wizard-page">
    <el-card>
      <template #header>
        <div class="page-header">
          <h2>归宗合并向导</h2>
          <el-button @click="goBack">返回列表</el-button>
        </div>
      </template>

      <!-- 申请信息 -->
      <div v-if="wizardData" class="application-info">
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="申请人">{{ wizardData.application.applicant?.phone }}</el-descriptions-item>
          <el-descriptions-item label="祖籍地">{{ wizardData.application.origin_place }}</el-descriptions-item>
          <el-descriptions-item label="字辈信息">
            <el-tag v-for="x in wizardData.application.xipai_info" :key="x" size="small" style="margin-right: 4px;">
              {{ x }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- 步骤条 -->
      <el-steps :active="currentStep" finish-status="success" class="steps">
        <el-step v-for="(step, index) in steps" :key="index" :title="step.title" :description="step.description" />
      </el-steps>

      <!-- 步骤1：挂载点选择 -->
      <div v-show="currentStep === 0" class="step-content">
        <el-alert type="info" :closable="false" show-icon>
          <template #title>
            请在主家族中选择一个已故人员作为挂载点。挂载点将成为申请方支系的"父节点"。
          </template>
        </el-alert>

        <div class="tree-section">
          <TreeSelect
            :main-clan-tree="mainClanTree"
            :applicant-tree="applicantTree"
            :selected-id="selectedAnchor?.id"
            mode="single"
            show-applicant
            @select="handleAnchorSelect"
          />
        </div>

        <div class="step-actions">
          <el-button type="primary" :disabled="!selectedAnchor" @click="nextToGeneration">
            下一步：世代确认
          </el-button>
        </div>
      </div>

      <!-- 步骤2：世代确认 -->
      <div v-show="currentStep === 1" class="step-content">
        <el-alert :type="hasConflicts ? 'error' : 'info'" :closable="false" show-icon>
          <template #title>
            {{ hasConflicts ? '存在世代冲突，请调整后再继续' : '请确认以下世代对齐信息，如有需要可微调世代偏移' }}
          </template>
        </el-alert>

        <el-table :data="generationAlignments" border size="small" class="alignment-table">
          <el-table-column prop="fullName" label="成员姓名" width="150" />
          <el-table-column label="原世代" width="100" align="center">
            <template #default="{ row }">
              {{ row.originalGeneration }} 代
            </template>
          </el-table-column>
          <el-table-column label="调整" width="120" align="center">
            <template #default="{ row }">
              <el-button-group size="small">
                <el-button @click="adjustGeneration(row.personId, -1)">-</el-button>
                <el-button disabled>{{ row.adjustment }}</el-button>
                <el-button @click="adjustGeneration(row.personId, 1)">+</el-button>
              </el-button-group>
            </template>
          </el-table-column>
          <el-table-column label="新世代" width="100" align="center">
            <template #default="{ row }">
              {{ row.newGeneration }} 代
            </template>
          </el-table-column>
          <el-table-column label="状态" width="150" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.hasConflict" type="danger" size="small">
                {{ row.conflictReason || '冲突' }}
              </el-tag>
              <el-tag v-else type="success" size="small">正常</el-tag>
            </template>
          </el-table-column>
        </el-table>

        <div class="step-actions">
          <el-button @click="currentStep = 0">上一步</el-button>
          <el-button type="primary" :disabled="hasConflicts" @click="nextToExecute">
            下一步：执行合并
          </el-button>
        </div>
      </div>

      <!-- 步骤3：执行合并 -->
      <div v-show="currentStep === 2" class="step-content">
        <el-result icon="warning" title="即将执行归宗合并">
          <template #extra>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="挂载点">
                {{ selectedAnchor?.fullName }} (ID: {{ selectedAnchor?.id }})
              </el-descriptions-item>
              <el-descriptions-item label="影响人数">
                {{ generationAlignments.length }} 人
              </el-descriptions-item>
              <el-descriptions-item label="操作说明">
                申请方支系将作为主家族的子树挂载到指定挂载点下
              </el-descriptions-item>
            </el-descriptions>
            <div class="warning-text">
              <el-icon><WarningFilled /></el-icon>
              此操作不可逆，请在确认无误后点击"确认合并"
            </div>
          </template>
        </el-result>

        <div class="step-actions">
          <el-button @click="currentStep = 1">上一步</el-button>
          <el-button type="danger" :loading="submitting" @click="executeMerge">
            确认合并
          </el-button>
        </div>
      </div>

      <!-- 步骤4：完成 -->
      <div v-show="currentStep === 3" class="step-content">
        <el-result icon="success" title="归宗合并已完成">
          <template #extra>
            <p>申请方支系已成功并入主家族。</p>
            <el-button type="primary" @click="finish">返回申请列表</el-button>
          </template>
        </el-result>
      </div>

      <div v-if="loading" class="loading-overlay">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>加载中...</span>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.merge-wizard-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h2 {
  margin: 0;
}

.application-info {
  margin-bottom: 20px;
}

.steps {
  margin: 30px 0;
}

.step-content {
  min-height: 400px;
}

.tree-section {
  margin: 20px 0;
  height: 500px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
}

.alignment-table {
  margin-top: 20px;
}

.step-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #e4e7ed;
}

.warning-text {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
  color: #e6a23c;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  gap: 12px;
}
</style>
