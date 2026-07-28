<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'

/**
 * 通用页面加载占位组件（零依赖 Element Plus 版本）
 *
 * 关键设计：本组件**不依赖 element-plus**，全部用纯 CSS + 内联 SVG 实现。
 * 这让 PageLoader chunk 可以在 vendor-element-plus（946KB）加载完成前
 * 独立渲染，避免路由切换后因 element-plus 还未就绪而出现「白屏 +
 * 加载占位也加载不出来」的尴尬。
 *
 * 能力：
 * 1. 顶部细长进度条：根据 stages 自动平滑推进百分比（参考 GenealogyTree 实现）
 * 2. 阶段列表：当前阶段高亮，已完成打勾，未执行灰显
 * 3. 实时日志面板：父组件 push 的日志滚动展示（每次 API/处理可推一条）
 * 4. 失败态：进度条冻结在当前阶段、阶段标记为失败、显示错误信息
 * 5. 完成态：进度条快速到 100%，延迟约 240ms 再关闭（让用户看到完成）
 *
 * 使用方法：
 *   <PageLoader
 *     :visible="loading"
 *     title="正在加载"
 *     :stages="[{ key:'fetch', label:'拉取数据' }]"
 *     :current-stage="stage"
 *     :logs="logs"
 *     :error="hasError"
 *     error-message="加载失败"
 *   />
 */
interface LoadingStage {
  /** 阶段唯一 key（与 currentStage 匹配） */
  key: string
  /** 阶段标签 */
  label: string
  /** 阶段副标题（可选） */
  desc?: string
}

export interface PageLoaderLog {
  /** 日志时间戳字符串，如 '14:32:05' */
  time: string
  /** 阶段 key（用于前缀展示） */
  stage?: string
  /** 日志正文 */
  message: string
  /** 类型：info（默认）/ success / warn / error */
  type?: 'info' | 'success' | 'warn' | 'error'
}

const props = withDefaults(
  defineProps<{
    visible: boolean
    title?: string
    stages: LoadingStage[]
    /** 当前阶段 key（与 stages 中某项匹配） */
    currentStage?: string
    /** 实时日志 */
    logs?: PageLoaderLog[]
    /** 是否失败 */
    error?: boolean
    /** 失败信息（顶部展示） */
    errorMessage?: string
    /** 是否变体为全屏覆盖（true：fixed 全屏；false：嵌入父容器） */
    fullscreen?: boolean
    /** 紧凑模式（仅进度条+标题，无阶段列表） */
    compact?: boolean
  }>(),
  {
    title: '正在加载',
    currentStage: '',
    logs: () => [],
    error: false,
    errorMessage: '',
    fullscreen: true,
    compact: false,
  },
)

/** 进度内部状态：父组件不需要关心百分比，由组件自动驱动 */
const internalPercent = ref(0)
let progressTimer: number | null = null
let hideTimer: number | null = null

/** 阶段百分比区间：根据 stages 数量自动均分 */
const stageRanges = computed(() => {
  const map: Record<string, { start: number; target: number }> = {}
  const len = props.stages.length
  if (len === 0) return map
  const each = 100 / len
  props.stages.forEach((s, i) => {
    const start = Math.max(0, Math.floor(i * each) - 1)
    const target = Math.min(100, Math.floor((i + 1) * each))
    map[s.key] = { start, target }
  })
  // 最后一个阶段强制 100
  if (len > 0) {
    const last = props.stages[len - 1]
    map[last.key] = { start: Math.max(0, 100 - Math.ceil(each)), target: 100 }
  }
  return map
})

/** 当前阶段在 stages 数组中的索引 */
const currentIndex = computed(() =>
  props.stages.findIndex((s) => s.key === props.currentStage),
)

/** 当前阶段对象 */
const currentStageData = computed(() => {
  const idx = currentIndex.value
  return idx === -1 ? null : props.stages[idx]
})

/** 是否某阶段已经完成（在 currentStage 之前） */
function isStageDone(key: string): boolean {
  const idx = props.stages.findIndex((s) => s.key === key)
  if (idx === -1) return false
  if (props.error && key === props.currentStage) return false
  if (idx < currentIndex.value) return true
  // 同一阶段：进度 >= target 即认为完成（兜底，防止父组件忘记切换 currentStage）
  const range = stageRanges.value[key]
  if (range && internalPercent.value >= range.target) return true
  return false
}

/** 展示百分比：失败时停在当前进度；完成时（visible=false）忽略 */
const displayPercent = computed(() => {
  if (props.error) return Math.min(internalPercent.value, 99)
  return Math.min(100, Math.round(internalPercent.value))
})

/** 顶部 hint：成功 / 失败 / 进行中 */
const hintText = computed(() => {
  if (props.error) return '加载失败'
  if (displayPercent.value >= 100) return '加载完成'
  return `${displayPercent.value}%`
})

/** 进度条颜色（错误态用红色） */
const barColor = computed(() => {
  if (props.error) return '#f56c6c'
  return '#C9A96E'
})

function clearProgressTimer() {
  if (progressTimer !== null) {
    clearInterval(progressTimer)
    progressTimer = null
  }
}

function clearHideTimer() {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

/**
 * 当 currentStage 变化时，平滑增长进度到该阶段目标
 * - 同阶段重复调用：忽略
 * - 跨阶段调用：先跳到该阶段起点附近（不回退），再平滑增长
 */
watch(
  () => props.currentStage,
  (newStage) => {
    if (!newStage) return
    const range = stageRanges.value[newStage]
    if (!range) return
    if (internalPercent.value < range.start) {
      internalPercent.value = range.start
    }
    clearProgressTimer()
    progressTimer = window.setInterval(() => {
      if (internalPercent.value >= range.target) {
        clearProgressTimer()
        return
      }
      const remaining = range.target - internalPercent.value
      const step = remaining > 20 ? 3 : remaining > 5 ? 1.5 : 0.6
      internalPercent.value = Math.min(
        range.target,
        +(internalPercent.value + step).toFixed(1),
      )
    }, 30)
  },
)

/** 失败时：进度条冻结在当前位置，由错误占位 UI 接管 */
watch(
  () => props.error,
  (isError) => {
    if (isError) {
      clearProgressTimer()
    }
  },
)

/** 显隐切换：visible=false 时延迟清理内部状态，给过渡动画一点时间 */
watch(
  () => props.visible,
  (v) => {
    if (!v) {
      clearProgressTimer()
    } else {
      // 若内部进度因上次完成已到 100，先重置回 0
      if (internalPercent.value >= 100) internalPercent.value = 0
      clearHideTimer()
    }
  },
)

const logListRef = ref<HTMLElement | null>(null)

/** 日志更新时自动滚到底部 */
watch(
  () => props.logs.length,
  async () => {
    await nextTick()
    if (logListRef.value) {
      logListRef.value.scrollTop = logListRef.value.scrollHeight
    }
  },
)

onUnmounted(() => {
  clearProgressTimer()
  clearHideTimer()
})

/** 阶段标签（用于日志前缀） */
function stageTagForLog(key?: string): string {
  if (!key) return '系统'
  const stage = props.stages.find((s) => s.key === key)
  return stage ? stage.label : key
}
</script>

<template>
  <Transition name="loader-fade">
    <div
      v-if="visible"
      class="page-loader"
      :class="{ 'is-fullscreen': fullscreen, 'is-compact': compact }"
    >
      <div class="loader-card">
        <!-- 顶部进度条（纯 CSS + 内联样式，不依赖 element-plus） -->
        <div
          class="top-progress"
          :class="{ 'is-compact-bar': compact, 'is-error': error }"
        >
          <div
            class="top-progress-inner"
            :style="{
              width: displayPercent + '%',
              background: barColor,
            }"
          />
        </div>

        <!-- 标题 + 提示 -->
        <div v-if="!compact" class="header">
          <div class="title-row">
            <h3 class="title">
              <!-- 内联 SVG 图标：不依赖 @element-plus/icons-vue -->
              <svg
                v-if="!error && displayPercent < 100"
                class="title-icon loading"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-dasharray="14 42"
                />
              </svg>
              <svg
                v-else-if="error"
                class="title-icon error"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="currentColor"
                  opacity="0.15"
                />
                <path
                  d="M8 8 L16 16 M16 8 L8 16"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  fill="none"
                />
              </svg>
              <svg
                v-else
                class="title-icon ok"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="currentColor"
                  opacity="0.18"
                />
                <path
                  d="M7 12 L11 16 L17 9"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                />
              </svg>
              <span>{{ title }}</span>
            </h3>
            <span class="hint" :class="{ 'is-error': error }">{{ hintText }}</span>
          </div>
          <p v-if="currentStageData && !error" class="current-stage">
            {{ currentStageData.label }}
            <span v-if="currentStageData.desc" class="stage-desc-inline">
              · {{ currentStageData.desc }}
            </span>
          </p>
          <p v-else-if="error && errorMessage" class="error-message">
            {{ errorMessage }}
          </p>
          <p v-else-if="error" class="error-message">加载失败，请稍后重试</p>
        </div>

        <!-- 阶段列表（非紧凑模式） -->
        <div v-if="!compact && stages.length > 0" class="stage-list">
          <div
            v-for="(stage, idx) in stages"
            :key="stage.key"
            class="stage-item"
            :class="{
              'is-pending':
                stage.key !== currentStage && !isStageDone(stage.key),
              'is-active':
                stage.key === currentStage && !error,
              'is-done': isStageDone(stage.key) && !(stage.key === currentStage && error),
              'is-error': stage.key === currentStage && error,
            }"
          >
            <div class="stage-marker">
              <!-- 错误 -->
              <svg
                v-if="stage.key === currentStage && error"
                class="marker-icon error"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path
                  d="M6 6 L18 18 M18 6 L6 18"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                />
              </svg>
              <!-- 完成 -->
              <svg
                v-else-if="isStageDone(stage.key)"
                class="marker-icon done"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path
                  d="M5 12 L10 17 L19 7"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                />
              </svg>
              <!-- 进行中 -->
              <svg
                v-else-if="stage.key === currentStage"
                class="marker-icon loading"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-dasharray="14 42"
                />
              </svg>
              <span v-else class="marker-num">{{ idx + 1 }}</span>
            </div>
            <div class="stage-info">
              <div class="stage-label">{{ stage.label }}</div>
              <div v-if="stage.desc" class="stage-desc">{{ stage.desc }}</div>
            </div>
          </div>
        </div>

        <!-- 滚动日志区（非紧凑模式 + 至少 1 条日志） -->
        <div v-if="!compact && logs.length > 0" class="log-section">
          <div class="log-header">
            <span>实时日志</span>
            <span class="log-count">{{ logs.length }} 条</span>
          </div>
          <div ref="logListRef" class="log-list">
            <div
              v-for="(log, idx) in logs"
              :key="idx"
              class="log-item"
              :class="`log-${log.type || 'info'}`"
            >
              <span class="log-time">{{ log.time }}</span>
              <span class="log-stage-tag">[{{ stageTagForLog(log.stage) }}]</span>
              <span class="log-msg">{{ log.message }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.page-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  width: 100%;
  box-sizing: border-box;
}

.page-loader.is-fullscreen {
  position: fixed;
  inset: 0;
  background: rgba(245, 247, 250, 0.96);
  z-index: 2000;
  padding: 24px;
}

.page-loader.is-compact {
  padding: 0;
}

.loader-card {
  width: 100%;
  max-width: 640px;
  background: #ffffff;
  border-radius: 12px;
  padding: 24px 28px 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(201, 169, 110, 0.15);
}

.is-fullscreen .loader-card {
  max-width: 720px;
}

.is-compact .loader-card {
  background: transparent;
  box-shadow: none;
  border: none;
  padding: 0;
}

/* ====== 进度条（纯 CSS） ====== */
.top-progress {
  width: 100%;
  height: 6px;
  background: #ebeef5;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 16px;
  position: relative;
}
.is-compact-bar {
  height: 4px;
  margin-bottom: 8px;
}
.top-progress-inner {
  height: 100%;
  background: #C9A96E;
  border-radius: 3px;
  transition: width 0.25s ease, background 0.25s ease;
}
.top-progress.is-error .top-progress-inner {
  background: #f56c6c;
}

.header {
  margin-bottom: 18px;
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  flex-shrink: 0;
}
.title-icon.loading {
  color: #C9A96E;
  animation: loader-spin 1.2s linear infinite;
}
.title-icon.ok {
  color: #67C23A;
}
.title-icon.error {
  color: #f56c6c;
}

.hint {
  font-size: 13px;
  color: #909399;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.hint.is-error {
  color: #f56c6c;
}

.current-stage {
  margin: 6px 0 0;
  font-size: 13px;
  color: #5D4037;
  font-weight: 500;
}

.stage-desc-inline {
  color: #909399;
  font-weight: 400;
  margin-left: 4px;
}

.error-message {
  margin: 6px 0 0;
  font-size: 13px;
  color: #f56c6c;
}

/* ====== 阶段列表 ====== */
.stage-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
  border-top: 1px dashed #ebeef5;
  margin-bottom: 16px;
}

.stage-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 4px;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.stage-item.is-active {
  background: rgba(201, 169, 110, 0.08);
}

.stage-marker {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #f4f4f5;
  color: #c0c4cc;
  font-size: 12px;
  font-weight: 600;
  margin-top: 2px;
}

.stage-item.is-done .stage-marker {
  background: #67C23A;
  color: #fff;
}

.stage-item.is-active .stage-marker {
  background: #C9A96E;
  color: #fff;
}

.stage-item.is-error .stage-marker {
  background: #f56c6c;
  color: #fff;
}

.marker-icon {
  font-size: 14px;
}

.marker-icon.loading {
  animation: loader-spin 1.2s linear infinite;
}

.stage-info {
  flex: 1;
  min-width: 0;
}

.stage-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.stage-item.is-active .stage-label {
  color: #303133;
  font-weight: 600;
}

.stage-item.is-pending .stage-label {
  color: #c0c4cc;
}

.stage-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
  line-height: 1.5;
}

/* ====== 滚动日志 ====== */
.log-section {
  border-top: 1px dashed #ebeef5;
  padding-top: 12px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.log-count {
  font-variant-numeric: tabular-nums;
}

.log-list {
  max-height: 160px;
  overflow-y: auto;
  background: #fafafa;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px 12px;
  font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
}

.log-item {
  display: flex;
  gap: 8px;
  color: #606266;
  word-break: break-all;
}

.log-time {
  color: #c0c4cc;
  flex-shrink: 0;
}

.log-stage-tag {
  color: #C9A96E;
  flex-shrink: 0;
}

.log-msg {
  flex: 1;
  min-width: 0;
}

.log-item.log-success {
  color: #67C23A;
}
.log-item.log-success .log-stage-tag {
  color: #67C23A;
}

.log-item.log-warn {
  color: #E6A23C;
}
.log-item.log-warn .log-stage-tag {
  color: #E6A23C;
}

.log-item.log-error {
  color: #f56c6c;
}
.log-item.log-error .log-stage-tag {
  color: #f56c6c;
}

/* ====== 过渡动画 ====== */
.loader-fade-enter-active,
.loader-fade-leave-active {
  transition: opacity 0.25s ease;
}
.loader-fade-enter-from,
.loader-fade-leave-to {
  opacity: 0;
}

@keyframes loader-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>