<script setup lang="ts">
/**
 * 修谱工作流条
 * 展示"新建族谱 → 旧谱电子化（导入与拍照→OCR→左右对照编修→保存数据表）→ 发通知族员 →
 * 族员自行更改 → 审核 → 新谱建成 → 印刷出谱"全流程，当前阶段高亮、可点击跳转。
 * 数据来源：GET /api/genealogy-workflow/status?clanId=<slug>（后端按真实业务数据推导）。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

interface WorkflowSubStage {
  key: string
  label: string
  status: 'done' | 'current' | 'todo'
  count: number
  detail: string
  link: string
}

interface WorkflowStage {
  key: string
  label: string
  status: 'done' | 'current' | 'todo'
  count: number
  detail: string
  link: string
  sub_stages?: WorkflowSubStage[]
}

interface WorkflowStatus {
  progress: number
  done_count: number
  total_count: number
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
 * 例如 ['digitize'] 或 ['notify', 'member_edit', 'review']。
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
  loading.value = true
  error.value = ''
  errorType.value = 'network'
  try {
    const res = await axios.get('/api/genealogy-workflow/status', {
      params: { clanId: clanSlug.value },
    })
    workflow.value = res.data
  } catch (e: any) {
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

function handleRetry() {
  if (errorType.value === 'auth') {
    // 清除过期的 token 并跳转登录
    localStorage.removeItem('geneasphere_token')
    router.push({ path: '/login', query: { redirect: route.fullPath } })
  } else {
    load()
  }
}

function go(link: string) {
  if (link) router.push(link)
}

const digitizeStage = computed(() => workflow.value?.stages.find((s) => s.key === 'digitize'))

onMounted(load)
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
          <el-tag v-if="workflow.current_label" type="warning" size="small" effect="light" class="wf-current-tag">
            当前：{{ workflow.current_label }}
          </el-tag>
          <el-tag v-else type="success" size="small" effect="light" class="wf-current-tag">
            全流程已完成 ✓
          </el-tag>
        </div>
        <div class="wf-progress">
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
      </div>

      <!-- 主阶段步骤条 -->
      <div class="wf-steps">
        <template v-for="(stage, i) in workflow.stages" :key="stage.key">
          <div
            class="wf-step"
            :class="[stage.status, { highlighted: isStageHighlighted(stage.key) }]"
            :title="stage.detail"
            @click="go(stage.link)"
          >
            <div class="wf-node-row">
              <div class="wf-node">
                <svg v-if="stage.status === 'done'" class="wf-node-icon" viewBox="0 0 24 24" width="16" height="16">
                  <path fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <span v-else-if="stage.status === 'current'" class="wf-pulse" />
                <span v-else class="wf-num">{{ i + 1 }}</span>
              </div>
              <div v-if="i < workflow.stages.length - 1" class="wf-line" :class="{ active: stage.status === 'done' }" />
            </div>
            <div class="wf-label" :class="{ strong: stage.status === 'current' }">{{ stage.label }}</div>
            <div v-if="stage.count > 0" class="wf-count">{{ stage.count }}</div>
          </div>
        </template>
      </div>

      <!-- 旧谱电子化子步骤 -->
      <div v-if="digitizeStage && digitizeStage.sub_stages && digitizeStage.sub_stages.length" class="wf-substeps">
        <span class="wf-substep-hint">旧谱电子化：</span>
        <span
          v-for="sub in digitizeStage.sub_stages"
          :key="sub.key"
          class="wf-substep"
          :class="[sub.status, { highlighted: isSubHighlighted(sub.key) }]"
          :title="sub.detail"
          @click="go(sub.link)"
        >
          <i class="wf-sub-dot" />
          {{ sub.label }}
          <em v-if="sub.count > 0" class="wf-sub-count">{{ sub.count }}</em>
        </span>
      </div>
    </div>
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

.wf-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 260px;
  flex: 1;
  max-width: 380px;
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
}

.wf-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  min-width: 0;
}

.wf-node-row {
  display: flex;
  align-items: center;
  width: 100%;
}

.wf-node {
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
  box-shadow: 0 0 0 4px rgba(230, 162, 60, 0.18);
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
  font-size: 13px;
  color: #7a6a55;
  text-align: center;
  white-space: nowrap;
  transition: color 0.2s;
}

.wf-label.strong {
  color: #d08a1f;
  font-weight: 600;
}

.wf-step.done .wf-label {
  color: #529b2e;
}

.wf-count {
  margin-top: 3px;
  font-size: 11px;
  color: #b5a488;
}

.wf-step.done .wf-count {
  color: #67c23a;
}

.wf-step.current .wf-count {
  color: #d08a1f;
  font-weight: 600;
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
