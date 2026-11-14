<script setup lang="ts">
/**
 * 修谱工作流条
 * 展示 8 步修谱主流程。圆点里只放序号，统计数字在右下角小标签。
 * 点击节点跳到侧栏对应页面；路由变化时重新拉取进度。
 * 数据来源：GET /api/genealogy-workflow/status?clanId=<slug>（后端按真实业务数据推导）。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

interface WorkflowSubStage {
  key: string
  label: string
  status: 'done' | 'current' | 'todo' | 'returned'
  count: number
  badge?: number
  detail: string
  link: string
}

interface WorkflowStage {
  key: string
  label: string
  status: 'done' | 'current' | 'todo' | 'returned' | 'suspended'
  count: number
  count_label?: string
  badge?: number
  returned?: boolean
  detail: string
  link: string
  menu_path?: string
  pre_condition?: string | null
  reject_return_key?: string | null
  blocked?: boolean
  return_notice?: { reason: string; requirement: string } | null
  returned_from_label?: string | null
  sub_stages?: WorkflowSubStage[]
}

interface WorkflowStatus {
  progress: number
  done_count: number
  total_count: number
  mode?: 'serial' | 'free'
  progress_paused?: boolean
  current_stage: string | null
  current_label: string | null
  stages: WorkflowStage[]
}

const route = useRoute()
const router = useRouter()
const clanSlug = computed(() => String(route.params.slug ?? ''))
const workflow = ref<WorkflowStatus | null>(null)
const loading = ref(false)
const error = ref('')
const errorType = ref<'auth' | 'forbidden' | 'notFound' | 'network'>('network')

/**
 * 凸显的工作流节点 key 列表（与 workflow.stages[].key 对应）。
 * 例如 ['digitize'] 或 ['errata_notice', 'errata_revise']。
 * 默认空数组：与现有行为一致，不凸显任何节点。
 *
 * 设计意图：在【修谱】菜单下的子页面顶部展示完整工作流条的同时，
 * 凸显与该页面相关的节点（更大、更亮、加发光/边框），让管理员一眼看到
 * "我目前在做什么、还差几步"。
 */
const props = defineProps<{
  highlight?: string[]
}>()
const highlightKeys = computed<Set<string>>(() => new Set(props.highlight ?? []))

/** 主阶段是否被凸显 */
function isStageHighlighted(key: string): boolean {
  return highlightKeys.value.has(key)
}

/** 子阶段是否被凸显（属于 digitize 的子阶段） */
function isSubHighlighted(key: string): boolean {
  return highlightKeys.value.has(key)
}

async function load() {
  if (!clanSlug.value) return
  const firstLoad = !workflow.value
  if (firstLoad) loading.value = true
  try {
    const res = await axios.get('/api/genealogy-workflow/status', {
      params: { clanId: clanSlug.value },
    })
    error.value = ''
    workflow.value = res.data
  } catch (e: any) {
    if (!firstLoad) return
    const status: number = e?.response?.status || 0
    const message = e?.response?.data?.message || ''
    if (status === 401 || message.includes('Unauthorized') || message.includes('未授权')) {
      error.value = '登录已过期，请重新登录'
      errorType.value = 'auth'
    } else if (status === 403 || message.includes('Forbidden') || message.includes('Admin access')) {
      error.value = '需要家族管理员权限才能查看修谱工作流'
      errorType.value = 'forbidden'
    } else if (status === 404) {
      error.value = '未找到该家族，无法获取修谱工作流'
      errorType.value = 'notFound'
    } else {
      error.value = '修谱工作流加载失败，请稍后重试'
      errorType.value = 'network'
    }
  } finally {
    loading.value = false
  }
}

function go(link: string) {
  if (link) router.push(link)
}

function handleRetry() {
  if (errorType.value === 'auth') {
    localStorage.removeItem('geneasphere_token')
    router.push({ path: '/login', query: { redirect: route.fullPath } })
  } else {
    load()
  }
}

function stepTitle(stage: WorkflowStage) {
  if (!stage.blocked) return stage.detail
  const stages = workflow.value?.stages ?? []
  const index = stages.findIndex((item) => item.key === stage.key)
  const blocker = stages.slice(0, index).find((item) => item.status !== 'done')
  if (!blocker) return stage.detail
  if (blocker.status === 'returned') {
    const source = blocker.returned_from_label || blocker.label
    return `${source}环节已驳回，请先处理：${blocker.label}`
  }
  if (blocker.status === 'suspended') return '本项目当前已搁置，恢复流转后才可继续推进'
  return `请先完成上一环节：${blocker.label}`
}

function onStep(stage: WorkflowStage) {
  if (stage.blocked) return
  go(stage.menu_path || stage.link)
}

function onSubStep(link: string) {
  if (digitizeStage.value?.blocked) return
  go(link)
}

const pageReturn = computed(() => {
  const keys = highlightKeys.value
  return workflow.value?.stages.find((stage) => keys.has(stage.key) && stage.return_notice)?.return_notice ?? null
})

const pageSuspended = computed(() => {
  const keys = highlightKeys.value
  return Boolean(workflow.value?.stages.some((stage) => keys.has(stage.key) && stage.status === 'suspended'))
})

const hasReturned = computed(() => Boolean(workflow.value?.stages.some((stage) => stage.status === 'returned')))

const focusStage = computed(() => {
  const stages = workflow.value?.stages ?? []
  return stages.find((stage) => stage.status === 'suspended') || stages.find((stage) => stage.status === 'current') || null
})

async function toggleSuspend() {
  const stage = focusStage.value
  if (!stage) return
  const body = stage.status === 'suspended'
    ? { clanId: clanSlug.value, resume: stage.key }
    : { clanId: clanSlug.value, suspend: stage.key }
  await axios.patch('/api/genealogy-workflow/settings', body)
  await load()
}

function onExternalRefresh() {
  load()
}

onMounted(() => window.addEventListener('xiupu-workflow-refresh', onExternalRefresh))
onBeforeUnmount(() => window.removeEventListener('xiupu-workflow-refresh', onExternalRefresh))

const digitizeStage = computed(() => workflow.value?.stages.find((s) => s.key === 'digitize'))

watch(() => route.fullPath, () => load(), { immediate: true })
</script>

<template>
  <div class="genealogy-workflow-bar">
    <!-- 加载骨架 -->
    <div v-if="loading" class="wf-card wf-skeleton">
      <el-skeleton :rows="2" animated />
    </div>

    <!-- 错误兜底：不阻塞页面其他内容 -->
    <div v-else-if="error" class="wf-card wf-error">
      <span class="wf-error-text">{{ error }}</span>
      <el-button size="small" text type="primary" @click="handleRetry">
        {{ errorType === 'auth' ? '重新登录' : '重试' }}
      </el-button>
    </div>

    <div v-else-if="workflow" class="wf-card">
      <!-- 头部：标题 + 进度 -->
      <div class="wf-header">
        <div class="wf-title">
          <span class="wf-logo">谱</span>
          <span class="wf-name">修谱工作流</span>
          <el-tag v-if="workflow.progress_paused" type="info" size="small" effect="light" class="wf-current-tag">
            进度已搁置：{{ workflow.current_label }}
          </el-tag>
          <el-tag v-else-if="workflow.current_label" type="warning" size="small" effect="light" class="wf-current-tag">
            当前：{{ workflow.current_label }}
          </el-tag>
          <el-tag v-else type="success" size="small" effect="light" class="wf-current-tag">
            全流程已完成 ✓
          </el-tag>
          <el-button v-if="focusStage" text size="small" @click="toggleSuspend">
            {{ focusStage.status === 'suspended' ? '取消搁置' : '搁置当前环节' }}
          </el-button>
        </div>
        <div class="wf-progress-wrap">
          <div class="wf-progress wf-progress-quiet">
            <span class="wf-progress-text">{{ workflow.done_count }} / {{ workflow.total_count }} 步</span>
            <el-progress
              :percentage="workflow.progress"
              :show-text="false"
              :stroke-width="7"
              :color="workflow.progress >= 100 ? '#67C23A' : '#C9A96E'"
              class="wf-progress-bar"
            />
            <span class="wf-progress-num">{{ workflow.progress }}%</span>
          </div>
          <span v-if="hasReturned" class="wf-return-warn">⚠️ 存在驳回回流项，请先修订。</span>
        </div>
      </div>

      <div class="wf-steps">
        <template v-for="(stage, i) in workflow.stages" :key="stage.key">
          <div
            class="wf-step"
            :class="[stage.status, { highlighted: isStageHighlighted(stage.key), returned: stage.returned, blocked: stage.blocked }]"
            :title="stepTitle(stage)"
            @click="onStep(stage)"
          >
            <div class="wf-node-row">
              <div class="wf-node">
                <svg v-if="stage.status === 'done' && !stage.blocked" class="wf-node-icon" viewBox="0 0 24 24" width="16" height="16">
                  <path fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <span v-else class="wf-num">{{ i + 1 }}</span>
                <sup v-if="stage.badge" class="wf-dot">{{ stage.badge }}</sup>
                <span v-if="stage.count_label" class="wf-count-tag">{{ stage.count_label }}</span>
                <span v-else-if="stage.count > 0" class="wf-count-tag">{{ stage.count }}</span>
              </div>
              <div v-if="i < workflow.stages.length - 1" class="wf-line" :class="{ active: stage.status === 'done' }" />
            </div>
            <div class="wf-label" :class="{ strong: stage.status === 'current' || stage.status === 'returned' }">{{ stage.label }}</div>
          </div>
        </template>
      </div>

      <div v-if="digitizeStage && digitizeStage.sub_stages && digitizeStage.sub_stages.length" class="wf-substeps">
        <span class="wf-substep-hint">谱源录入：</span>
        <span
          v-for="sub in digitizeStage.sub_stages"
          :key="sub.key"
          class="wf-substep"
          :class="[sub.status, { highlighted: isSubHighlighted(sub.key) }]"
          :title="digitizeStage.blocked ? stepTitle(digitizeStage) : sub.detail"
          @click.stop="onSubStep(sub.link)"
        >
          <i class="wf-sub-dot" />
          {{ sub.label }}
          <em v-if="sub.count > 0" class="wf-sub-count">{{ sub.count }}</em>
        </span>
      </div>
    </div>

    <el-alert
      v-if="pageSuspended"
      class="wf-return-alert"
      type="info"
      show-icon
      :closable="false"
      title="本项目当前已搁置，恢复流转后才可继续推进"
    />
    <el-alert
      v-if="pageReturn"
      class="wf-return-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="`驳回：${pageReturn.reason}`"
      :description="pageReturn.requirement"
    />
  </div>
</template>

<style scoped>
.genealogy-workflow-bar {
  margin-bottom: 20px;
}

.wf-card {
  background: linear-gradient(135deg, #fffdf8 0%, #fff8ec 100%);
  border: 1px solid #e8d9bf;
  border-radius: 10px;
  padding: 16px 20px 14px;
  box-shadow: 0 2px 8px rgba(93, 64, 55, 0.08);
}

.wf-skeleton {
  padding: 20px;
}

.wf-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
}

.wf-error-text {
  color: #e6a23c;
  font-size: 13px;
}

/* ===== 头部 ===== */
.wf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.wf-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wf-logo {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: linear-gradient(135deg, #8d5b3c, #5d4037);
  color: #ffe9c8;
  font-size: 15px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wf-name {
  font-size: 16px;
  font-weight: 600;
  color: #5d4037;
}

.wf-current-tag {
  border-radius: 10px;
}

.wf-progress-wrap {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex: 1;
  min-width: 260px;
}

.wf-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
  flex: 1;
  max-width: 320px;
}

.wf-return-warn {
  color: #d08a1f;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
}

.wf-progress-quiet {
  opacity: 0.55;
}

.wf-progress-quiet .wf-progress-num {
  font-size: 12px;
  font-weight: 500;
}

.wf-return-alert {
  margin-top: 8px;
}

.wf-step.blocked {
  cursor: not-allowed;
}

.wf-step.blocked .wf-node {
  background: #e4ddd2;
  border-color: #efe7da;
  color: #a08b6f;
  box-shadow: none;
}

.wf-step.blocked .wf-label {
  color: #b5a488;
}

.wf-step.suspended .wf-node::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  border-top: 11px solid #a08b6f;
  border-left: 11px solid transparent;
  border-radius: 0 14px 0 0;
}

.wf-progress-text {
  font-size: 12px;
  color: #8c6d4f;
  white-space: nowrap;
}

.wf-progress-bar {
  flex: 1;
}

.wf-progress-num {
  font-size: 14px;
  font-weight: 600;
  color: #5d4037;
  min-width: 38px;
  text-align: right;
}

/* ===== 步骤条 ===== */
.wf-steps {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  overflow-x: auto;
  padding: 12px 4px 6px;
}

.wf-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  min-width: 92px;
}

.wf-node-row {
  display: flex;
  align-items: center;
  width: 100%;
}

.wf-node {
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #e4ddd2;
  color: #a08b6f;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.25s ease;
  border: 2px solid #efe7da;
  box-sizing: border-box;
}

.wf-step.done .wf-node {
  background: linear-gradient(135deg, #67c23a, #529b2e);
  border-color: #67c23a;
  color: #fff;
  box-shadow: 0 2px 6px rgba(103, 194, 58, 0.35);
}

.wf-step.current .wf-node {
  background: linear-gradient(135deg, #e6a23c, #d08a1f);
  border-color: #e6a23c;
  color: #fff;
  box-shadow: 0 0 0 4px rgba(230, 162, 60, 0.18);
}

.wf-step.returned .wf-node {
  background: #f8e7c1;
  border-color: #e6c07b;
  color: #8a5a12;
  box-shadow: 0 0 0 4px rgba(230, 192, 123, 0.28);
}

.wf-pulse {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  animation: wfPulse 1.4s ease-in-out infinite;
}

@keyframes wfPulse {
  0%, 100% { transform: scale(0.75); opacity: 0.9; }
  50% { transform: scale(1.15); opacity: 1; }
}

.wf-line {
  flex: 1;
  height: 3px;
  background: #e9e2d4;
  border-radius: 2px;
  margin: 0 6px;
  transition: background 0.4s ease;
}

.wf-line.active {
  background: linear-gradient(90deg, #a0d47e, #67c23a);
}

.wf-label {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.35;
  color: #7a6a55;
  text-align: center;
  white-space: normal;
  max-width: 96px;
  transition: color 0.2s;
}

.wf-label.strong {
  color: #d08a1f;
  font-weight: 600;
}

.wf-step.done .wf-label {
  color: #529b2e;
}

.wf-step.returned .wf-label {
  color: #8a5a12;
}

.wf-dot {
  position: absolute;
  top: -12px;
  left: 22px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #f56c6c;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 0 0 2px #fffdf8;
}

.wf-count-tag {
  position: absolute;
  left: 22px;
  bottom: -12px;
  background: #fffdf8;
  border: 1px solid #e8d9bf;
  color: #8c6d4f;
  font-size: 10px;
  line-height: 14px;
  padding: 0 4px;
  border-radius: 8px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 0 0 2px #fffdf8;
}

.wf-step:hover .wf-node {
  transform: translateY(-2px);
}

/* ===== 高亮（与当前页面相关的节点） ===== */
.wf-step.highlighted .wf-node {
  box-shadow:
    0 0 0 4px rgba(201, 169, 110, 0.30),
    0 4px 14px rgba(93, 64, 55, 0.28);
  transform: scale(1.12);
}

.wf-step.highlighted .wf-label {
  color: #5d4037;
  font-weight: 700;
}

.wf-step.highlighted .wf-label.strong {
  color: #c97c1a;
}

.wf-step.highlighted.done .wf-label {
  color: #3f8526;
}

.wf-step.highlighted .wf-count {
  background: linear-gradient(135deg, #c9a96e, #8d5b3c);
  color: #fff;
  padding: 0 6px;
  border-radius: 8px;
  font-weight: 600;
}

.wf-substep.highlighted {
  font-weight: 700;
  border-width: 2px;
  border-style: solid;
  background: linear-gradient(135deg, #fff8ec, #fffdf8);
  box-shadow: 0 2px 6px rgba(201, 169, 110, 0.25);
}

.wf-substep.highlighted.done {
  border-color: #67c23a;
}

.wf-substep.highlighted.current {
  border-color: #e6a23c;
  color: #c97c1a;
}

/* ===== 子步骤 ===== */
.wf-substeps {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding: 8px 12px;
  background: rgba(201, 169, 110, 0.10);
  border-radius: 8px;
  border: 1px dashed #d9c39a;
}

.wf-substep-hint {
  font-size: 12px;
  color: #8c6d4f;
  font-weight: 600;
}

.wf-substep {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #9c8a6d;
  padding: 3px 9px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e9e2d4;
  cursor: pointer;
  transition: all 0.2s;
}

.wf-substep .wf-sub-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #c9c2b4;
}

.wf-substep.done {
  color: #529b2e;
  border-color: #c2e0b2;
  background: #f2faee;
}

.wf-substep.done .wf-sub-dot {
  background: #67c23a;
}

.wf-substep.current {
  color: #d08a1f;
  border-color: #e6c68a;
  background: #fdf6ec;
  font-weight: 600;
}

.wf-substep.current .wf-sub-dot {
  background: #e6a23c;
  animation: wfPulse 1.4s ease-in-out infinite;
}

.wf-sub-count {
  font-style: normal;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  padding: 0 5px;
  font-size: 11px;
}

/* ===== 响应式 ===== */
@media (max-width: 1024px) {
  .wf-steps {
    overflow-x: auto;
    padding-bottom: 6px;
  }

  .wf-step {
    min-width: 96px;
  }
}

@media (max-width: 768px) {
  .wf-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .wf-progress {
    max-width: 100%;
    width: 100%;
  }
}
</style>
