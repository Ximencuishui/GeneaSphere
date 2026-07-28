<script setup lang="ts">
import { ref, computed } from 'vue';
import { ArrowLeft, ArrowRight, Rank } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

interface SnapshotNode {
  id: string;
  y: number;
}

interface Snapshot {
  nodes: SnapshotNode[];
  viewport: { vh: number; zoom: number };
}

const props = withDefaults(
  defineProps<{
    /** 来自 orchestrator：详情面板开启时被互斥为 hidden */
    visibility?: 'visible' | 'hidden';
    /** 来自 GenealogyTree：树最大代际（深度） */
    totalGenerations?: number;
    /** 来自 GenealogyTree：树快照（含节点 y 坐标，用于按代际查找代表节点） */
    getSnapshot?: () => Snapshot | null;
    /** 来自 GenealogyTree：聚焦某节点的 API */
    onFocusNode?: (id: string) => void;
  }>(),
  {
    visibility: 'visible',
    totalGenerations: 1,
    getSnapshot: undefined,
    onFocusNode: undefined,
  },
);

/** 当前选中的代际（用于滑块手柄定位） */
const selected = ref(1);

/** 长刻度：每 5 代显示数字 */
const longTicks = computed(() => {
  const arr: number[] = [];
  for (let i = 1; i <= props.totalGenerations; i += 5) arr.push(i);
  if (props.totalGenerations > 1 && !arr.includes(props.totalGenerations)) {
    arr.push(props.totalGenerations);
  }
  if (!arr.includes(1)) arr.unshift(1);
  return arr;
});

/** 短刻度：1 - totalGenerations 全部可见，点击可触发 */
const allTicks = computed(() => {
  const arr: number[] = [];
  for (let i = 1; i <= props.totalGenerations; i++) arr.push(i);
  return arr;
});

/** 用户主动 hover 浮出态：hover 1s 后浮出，移开 3s 自动收回 */
const expanded = ref(false);

let hoverTimer: unknown = null;
let leaveTimer: unknown = null;

function clearTimer(id: unknown): void {
  if (id != null) clearTimeout(id as number);
}

function onButtonEnter() {
  if (props.visibility === 'hidden') return;
  clearTimer(leaveTimer);
  if (hoverTimer) clearTimer(hoverTimer);
  hoverTimer = setTimeout(() => {
    expanded.value = true;
  }, 1000);
}

function onButtonLeave() {
  clearTimer(hoverTimer);
  if (leaveTimer) clearTimer(leaveTimer);
  leaveTimer = setTimeout(() => {
    expanded.value = false;
  }, 3000);
}

function onPanelEnter() {
  // 用户进入浮层：重置自动收回定时器
  clearTimer(leaveTimer);
  if (leaveTimer) clearTimer(leaveTimer);
  leaveTimer = setTimeout(() => {
    expanded.value = false;
  }, 3000);
}

function onPanelLeave() {
  if (leaveTimer) clearTimer(leaveTimer);
  leaveTimer = setTimeout(() => {
    expanded.value = false;
  }, 3000);
}

/**
 * 点击代际刻度 → 找到该代际的代表性节点并聚焦
 * - 代表性节点 = 该代际 y 坐标最小（顶部节点 → 根方向）
 * - 若该代际无节点 → 仅消息提示
 *
 * 本期是 M3 第一版（UI 骨架 + 互斥已完整）：已能交互；
 * 后续 M3+ 阶段扩展为实际的"按代际过滤显示"。
 */
function onTickClick(gen: number) {
  selected.value = gen;
  const snap = props.getSnapshot?.();
  if (!snap) {
    ElMessage.info(`代际 ${gen}（画布尚未就绪）`);
    return;
  }
  // 把节点按 y 分桶找该代际的代表节点（按当前 viewport 的 zoom / 视高推算代际高度）
  const { vh, zoom } = snap.viewport;
  // 代际 y 跨度近似为 (canvasHeight / totalGenerations)
  // 但更可靠的做法是排序 y 后按等距分桶
  const sortedY = [...snap.nodes].map((n) => n.y).sort((a, b) => a - b);
  if (sortedY.length === 0) {
    ElMessage.info(`代际 ${gen}（暂无节点数据）`);
    return;
  }
  // 总 y 跨度
  const minY = sortedY[0];
  const maxY = sortedY[sortedY.length - 1];
  const range = Math.max(1, maxY - minY);
  // 第 gen 代的 y 区间中心 = minY + (gen - 0.5) * range / totalGenerations
  const targetY = minY + (gen - 0.5) * (range / props.totalGenerations);
  // 找最接近 targetY 的节点
  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const n of snap.nodes) {
    const d = Math.abs(n.y - targetY);
    if (d < bestDist) {
      bestDist = d;
      bestId = n.id;
    }
  }
  if (bestId && props.onFocusNode) {
    props.onFocusNode(bestId);
    // 顺手重置 hover timer，让用户可以继续看面板
    onPanelEnter();
  } else {
    ElMessage.info(`代际 ${gen}（未找到代表节点）`);
  }
  // 静默使用 vh / zoom 避免 TS noUnusedLocals（项目禁用规则）
  void vh;
  void zoom;
}

function nextGen() {
  if (selected.value < props.totalGenerations) {
    onTickClick(selected.value + 1);
  }
}

function prevGen() {
  if (selected.value > 1) {
    onTickClick(selected.value - 1);
  }
}
</script>

<template>
  <div
    class="tree-gen-slider"
    :class="{ 'slider--hidden': visibility === 'hidden' }"
  >
    <!-- 工具栏按钮：hover 触发浮出 -->
    <el-tooltip content="代际导航" placement="top">
      <el-button
        :icon="Rank"
        size="small"
        plain
        class="slider-trigger"
        @mouseenter="onButtonEnter"
        @mouseleave="onButtonLeave"
        @click="expanded = true"
      />
    </el-tooltip>

    <!-- hover 浮层：贴在画布内底部 -->
    <transition name="slider-fade">
      <div
        v-show="expanded"
        class="slider__panel"
        @mouseenter="onPanelEnter"
        @mouseleave="onPanelLeave"
      >
        <div class="slider__nav">
          <el-button :icon="ArrowLeft" size="small" plain :disabled="selected <= 1" @click="prevGen" />
          <span class="slider__current">第 {{ selected }} / {{ totalGenerations }} 代</span>
          <el-button :icon="ArrowRight" size="small" plain :disabled="selected >= totalGenerations" @click="nextGen" />
        </div>
        <div class="slider__track">
          <div
            v-for="t in allTicks"
            :key="t"
            class="slider__tick"
            :class="{
              'tick--long': longTicks.includes(t),
              'tick--active': t === selected,
            }"
            :style="{ left: ((t - 1) / Math.max(1, totalGenerations - 1) * 100) + '%' }"
            @click="onTickClick(t)"
          >
            <span v-if="longTicks.includes(t)" class="slider__label">{{ t }}</span>
          </div>
          <!-- 手柄 -->
          <div
            class="slider__handle"
            :style="{ left: ((selected - 1) / Math.max(1, totalGenerations - 1) * 100) + '%' }"
          />
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.tree-gen-slider {
  /* 独立绝对定位：trigger 按钮贴在画布右下角 minimap 左侧（互不遮挡） */
  position: absolute;
  right: 88px; /* 避开右下角 minimap 48px + 16px 间距 */
  bottom: 24px;
  z-index: var(--z-slider, 20);
  display: inline-flex;
  align-items: center;
}
.slider--hidden {
  display: none !important;
}

.slider__panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 56px; /* 避开 stats 条 */
  height: 56px;
  background: rgba(255, 252, 248, 0.96);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgba(201, 169, 110, 0.25);
  box-shadow: 0 -2px 8px rgba(93, 64, 55, 0.06);
  z-index: var(--z-slider, 20);
  display: flex;
  flex-direction: column;
  padding: 4px 16px;
  user-select: none;
}

.slider__nav {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #5D4037;
}
.slider__current {
  font-weight: 600;
  color: #C9A96E;
  font-variant-numeric: tabular-nums;
}

.slider__track {
  position: relative;
  flex: 1;
  margin: 4px 8px 0;
}

.slider__tick {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 1px;
  height: 8px;
  background: #D0D0D0;
  cursor: pointer;
  transition: height 0.15s ease, background 0.15s ease;
}
.slider__tick:hover {
  height: 12px;
  background: #A1887F;
}
.slider__tick.tick--long {
  height: 12px;
  background: #A1887F;
}
.slider__tick.tick--active {
  background: #C9A96E;
  height: 16px;
  width: 2px;
}

.slider__label {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: #7F8C8D;
}

.slider__handle {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 4px;
  height: 22px;
  border-radius: 2px;
  background: #C9A96E;
  box-shadow: 0 0 0 2px rgba(201, 169, 110, 0.3);
  pointer-events: none;
  transition: left 0.15s ease;
}

.slider-fade-enter-active,
.slider-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.slider-fade-enter-from,
.slider-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>