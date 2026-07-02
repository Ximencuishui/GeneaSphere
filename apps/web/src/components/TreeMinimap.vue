<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Close, MapLocation } from '@element-plus/icons-vue';

interface SnapshotNode {
  id: string;
  x: number;
  y: number;
  gender?: string;
  isMain?: boolean;
  isLiving?: boolean;
}

interface SnapshotViewport {
  cx: number;
  cy: number;
  vw: number;
  vh: number;
  zoom: number;
}

interface Snapshot {
  nodes: SnapshotNode[];
  viewport: SnapshotViewport;
}

const props = withDefaults(
  defineProps<{
    /** 位置（来自 useTreeLayoutOrchestrator） */
    position?: 'bottom-right' | 'top-right' | 'hidden';
    /** 尺寸（来自 useTreeLayoutOrchestrator；详情面板打开时会被缩小） */
    size?: { w: number; h: number };
    /** 从父组件 TreePage 注入的画布快照获取器（来自 GenealogyTree 的 defineExpose） */
    getSnapshot?: () => Snapshot | null;
    /** 从父组件注入的画布平移方法（来自 GenealogyTree 的 defineExpose） */
    onPanTo?: (canvasX: number, canvasY: number) => void;
  }>(),
  {
    position: 'bottom-right',
    size: () => ({ w: 200, h: 150 }),
    getSnapshot: undefined,
    onPanTo: undefined,
  },
);

type UiState = 'collapsed' | 'expanded';
const uiState = ref<UiState>('collapsed');

/**
 * setTimeout 返回类型在 DOM lib 下是 number，在 Node lib 下是 NodeJS.Timeout。
 * 项目 tsconfig 同时引入了两类 lib，直接写 ReturnType<typeof setTimeout> 会产生
 * "number | Timeout" 不兼容。这里统一用 unknown + 工具函数清除 timer。
 */
let hoverTimer: unknown = null;
let leaveTimer: unknown = null;
let redrawRaf: unknown = null;

/** 类型抹平：把 unknown timer id 当作 number 传给 clearTimeout */
function clearTimer(id: unknown): void {
  if (id != null) clearTimeout(id as number);
}

const canvasRef = ref<HTMLCanvasElement | null>(null);

/** 节流（200ms）状态：上次重绘时间 */
let lastRedrawAt = 0;
const REDRAW_THROTTLE_MS = 200;

/** 当前快照缓存（外部通过 watch triggerSnapshot 主动驱动） */
const snapshot = ref<Snapshot | null>(null);

/** 触发一次画布重绘（节流） */
function triggerRedraw() {
  if (redrawRaf) return;
  const wait = Math.max(0, REDRAW_THROTTLE_MS - (Date.now() - lastRedrawAt));
  redrawRaf = window.setTimeout(() => {
    redrawRaf = null;
    lastRedrawAt = Date.now();
    redraw();
  }, wait);
}

/** 从父组件拉取快照（外部画布变化时可调） */
function refreshSnapshot() {
  if (!props.getSnapshot) return;
  snapshot.value = props.getSnapshot();
  triggerRedraw();
}

defineExpose({ refreshSnapshot });

/** 折叠热区 hover 1s 展开 */
function onHotzoneEnter() {
  if (props.position === 'hidden') return;
  clearTimer(leaveTimer);
  if (hoverTimer) clearTimer(hoverTimer);
  hoverTimer = window.setTimeout(() => {
    uiState.value = 'expanded';
    // 进入展开态时主动拉一次快照（可能主画布已经 ready）
    refreshSnapshot();
  }, 1000);
}

/** 移开 3s 自动收回 */
function onHotzoneLeave() {
  if (hoverTimer) clearTimer(hoverTimer);
  if (leaveTimer) clearTimer(leaveTimer);
  leaveTimer = window.setTimeout(() => {
    uiState.value = 'collapsed';
  }, 3000);
}

/** Canvas 2D 绘制 */
function redraw() {
  const cv = canvasRef.value;
  if (!cv) return;
  const snap = snapshot.value;
  if (!snap || snap.nodes.length === 0) {
    // 没数据：清空 canvas 显示空白
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const { w, h } = props.size;
    cv.width = w * devicePixelRatio;
    cv.height = h * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.clearRect(0, 0, w, h);
    return;
  }

  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const { w, h } = props.size;
  cv.width = w * devicePixelRatio;
  cv.height = h * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // 计算坐标范围 + 等比缩放
  const xs = snap.nodes.map((n) => n.x);
  const ys = snap.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 8;
  const sX = (w - pad * 2) / (maxX - minX || 1);
  const sY = (h - pad * 2) / (maxY - minY || 1);
  const s = Math.min(sX, sY);

  // 画背景网格（淡）
  ctx.strokeStyle = 'rgba(201, 169, 110, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    ctx.moveTo((w * i) / 4, 0);
    ctx.lineTo((w * i) / 4, h);
    ctx.moveTo(0, (h * i) / 4);
    ctx.lineTo(w, (h * i) / 4);
  }
  ctx.stroke();

  // 画节点点
  for (const n of snap.nodes) {
    const px = pad + (n.x - minX) * s;
    const py = pad + (n.y - minY) * s;
    if (n.isMain) {
      ctx.fillStyle = '#C9A96E';
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (n.gender === 'male') {
      ctx.fillStyle = n.isLiving === false ? 'rgba(144, 202, 249, 0.5)' : '#90CAF9';
    } else if (n.gender === 'female') {
      ctx.fillStyle = n.isLiving === false ? 'rgba(244, 141, 177, 0.5)' : '#F48FB1';
    } else {
      ctx.fillStyle = '#BDBDBD';
    }
    if (!(n.isMain)) {
      ctx.beginPath();
      ctx.arc(px, py, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 视口矩形
  const { cx, cy, vw, vh, zoom } = snap.viewport;
  const halfW = vw / zoom / 2;
  const halfH = vh / zoom / 2;
  const rx = pad + (cx - halfW - minX) * s;
  const ry = pad + (cy - halfH - minY) * s;
  const rw = (vw / zoom) * s;
  const rh = (vh / zoom) * s;
  ctx.fillStyle = 'rgba(201, 169, 110, 0.12)';
  ctx.strokeStyle = '#C9A96E';
  ctx.lineWidth = 1.5;
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeRect(rx, ry, rw, rh);
}

/** 缩略图拖拽：mousedown 起跳，mousemove 平移，mouseup 结束 */
const dragging = ref(false);
let panStartScreen: { x: number; y: number } | null = null;

function onCanvasMouseDown(e: MouseEvent) {
  if (!props.onPanTo) return;
  dragging.value = true;
  panStartScreen = { x: e.clientX, y: e.clientY };
  panTo(e);
  window.addEventListener('mousemove', onCanvasMouseMove);
  window.addEventListener('mouseup', onCanvasMouseUp, { once: true });
}

function onCanvasMouseMove(e: MouseEvent) {
  if (dragging.value) panTo(e);
}

function onCanvasMouseUp() {
  dragging.value = false;
  panStartScreen = null;
  window.removeEventListener('mousemove', onCanvasMouseMove);
}

function panTo(e: MouseEvent) {
  if (!props.onPanTo || !snapshot.value) return;
  const cv = canvasRef.value;
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  const rx = e.clientX - rect.left;
  const ry = e.clientY - rect.top;
  const snap = snapshot.value;
  const xs = snap.nodes.map((n) => n.x);
  const ys = snap.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const { w, h } = props.size;
  const pad = 8;
  const sX = (w - pad * 2) / (maxX - minX || 1);
  const sY = (h - pad * 2) / (maxY - minY || 1);
  const s = Math.min(sX, sY);
  const canvasX = (rx - pad) / s + minX;
  const canvasY = (ry - pad) / s + minY;
  props.onPanTo(canvasX, canvasY);
}

/** 当 size/position 变化时重绘 */
watch(
  () => [props.size.w, props.size.h, props.position],
  () => triggerRedraw(),
);

/** 组件挂载时尝试拉一次快照（可能主画布已经 ready） */
onMounted(() => {
  refreshSnapshot();
});

onUnmounted(() => {
  if (hoverTimer) clearTimer(hoverTimer);
  if (leaveTimer) clearTimer(leaveTimer);
  if (redrawRaf) clearTimer(redrawRaf);
  window.removeEventListener('mousemove', onCanvasMouseMove);
});
</script>

<template>
  <div
    v-if="position !== 'hidden'"
    class="tree-minimap"
    :class="[`minimap--${position}`, `minimap--${uiState}`]"
    :style="{
      width: uiState === 'collapsed' ? '48px' : `${size.w}px`,
      height: uiState === 'collapsed' ? '48px' : `${size.h}px`,
    }"
    @mouseenter="onHotzoneEnter"
    @mouseleave="onHotzoneLeave"
  >
    <!-- 折叠态：仅显示图标 + 节点数（从 snapshot 取） -->
    <div
      v-if="uiState === 'collapsed'"
      class="minimap__hotzone"
      @click="uiState = 'expanded'"
    >
      <el-icon :size="20"><MapLocation /></el-icon>
      <span class="minimap__count">{{ snapshot?.nodes.length ?? 0 }}</span>
      <span class="minimap__dot" />
    </div>

    <!-- 展开态：标题栏 + Canvas + 关闭按钮 -->
    <template v-else>
      <div class="minimap__header">
        <span class="minimap__title">
          <el-icon :size="13"><MapLocation /></el-icon>
          鸟瞰图
        </span>
        <el-icon class="minimap__close" @click="uiState = 'collapsed'"><Close /></el-icon>
      </div>
      <canvas
        ref="canvasRef"
        class="minimap__canvas"
        @mousedown="onCanvasMouseDown"
      />
    </template>
  </div>
</template>

<style scoped>
.tree-minimap {
  position: absolute;
  z-index: var(--z-minimap, 25);
  background: rgba(255, 252, 248, 0.96);
  backdrop-filter: blur(8px);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(93, 64, 55, 0.12);
  border: 1px solid rgba(201, 169, 110, 0.3);
  transition:
    width 0.2s ease,
    height 0.2s ease,
    right 0.2s ease,
    top 0.2s ease,
    bottom 0.2s ease;
  overflow: hidden;
}
.tree-minimap.minimap--bottom-right {
  right: 16px;
  bottom: 56px; /* 避开 stats 条 */
}
.tree-minimap.minimap--top-right {
  right: 16px;
  top: 56px; /* 避开工具栏 */
}

/* 折叠热区 */
.tree-minimap.minimap--collapsed {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.minimap__hotzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  position: relative;
  color: #5D4037;
}
.minimap__count {
  font-size: 10px;
  font-weight: 600;
  color: #7F8C8D;
}
.minimap__dot {
  position: absolute;
  top: -4px;
  right: -8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4CAF50;
}

/* 展开态 */
.minimap__header {
  height: 24px;
  padding: 0 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #5D4037;
  border-bottom: 1px solid rgba(201, 169, 110, 0.2);
  user-select: none;
}
.minimap__title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}
.minimap__close {
  cursor: pointer;
  color: #7F8C8D;
  transition: color 0.15s ease;
}
.minimap__close:hover {
  color: #C9A96E;
}
.minimap__canvas {
  display: block;
  width: 100%;
  height: calc(100% - 24px);
  cursor: grab;
}
.minimap__canvas:active {
  cursor: grabbing;
}
</style>