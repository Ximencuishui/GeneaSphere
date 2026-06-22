<template>
  <div class="timeline-control">
    <!-- 顶部信息 -->
    <div class="timeline-header">
      <span class="timeline-current">{{ currentYearLabel }}</span>
      <span class="timeline-range" v-if="minYear && maxYear && (minYear !== maxYear)">
        {{ minYear }} - {{ maxYear >= 9999 ? '今' : maxYear }}
      </span>
    </div>

    <!-- 主体：时间轴 + 标记 -->
    <div class="timeline-track" ref="trackEl">
      <!-- 刻度线 -->
      <div class="timeline-ticks">
        <div
          v-for="tick in ticks"
          :key="tick.year"
          class="timeline-tick"
          :style="{ left: tick.position + '%' }"
        >
          <div class="tick-line" :class="{ major: tick.major }"></div>
          <div class="tick-label" :class="{ major: tick.major }">{{ tick.label }}</div>
        </div>
      </div>

      <!-- POI 标记 -->
      <div
        v-for="(poi, idx) in poiMarkers"
        :key="poi.id || poi.name + idx"
        class="poi-marker-dot"
        :style="{
          left: poi.position + '%',
          background: poi.color,
        }"
        :title="`${poi.name} (${poi.earliest_year ?? '?'})`"
        @click="$emit('poi-jump', poi)"
      ></div>

      <!-- 当前指针 -->
      <div class="timeline-pointer" :style="{ left: pointerPosition + '%' }"></div>

      <!-- 透明滑块覆盖在轨道上 -->
      <input
        type="range"
        :min="effectiveMin"
        :max="effectiveMax"
        :value="currentYear"
        :step="1"
        class="timeline-slider"
        @input="onSliderInput"
      />
    </div>

    <!-- 播放控制 -->
    <div class="timeline-controls">
      <el-button-group>
        <el-button :type="playing ? 'danger' : 'primary'" @click="$emit('play-toggle')">
          <el-icon><VideoPlay v-if="!playing" /><VideoPause v-else /></el-icon>
          {{ playing ? '暂停' : '播放' }}
        </el-button>
        <el-button @click="$emit('reset')">
          <el-icon><RefreshLeft /></el-icon>
          重置
        </el-button>
      </el-button-group>

      <div class="speed-control">
        <span class="speed-label">速度：</span>
        <el-radio-group :model-value="speed" @change="$emit('speed-change', $event as number)" size="small">
          <el-radio-button :value="1">1x</el-radio-button>
          <el-radio-button :value="2">2x</el-radio-button>
          <el-radio-button :value="4">4x</el-radio-button>
          <el-radio-button :value="8">8x</el-radio-button>
        </el-radio-group>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { VideoPlay, VideoPause, RefreshLeft } from '@element-plus/icons-vue';

interface PoiMarker {
  id: string;
  name: string;
  earliest_year?: number;
  position: number;
  color: string;
}

const props = defineProps<{
  currentYear: number;
  minYear?: number;
  maxYear?: number;
  pois: Array<{
    id?: string;
    name: string;
    earliest_year?: number;
    source?: string;
    branch?: string | null;
  }>;
  playing: boolean;
  speed: number;
}>();

const emit = defineEmits<{
  (e: 'update:currentYear', year: number): void;
  (e: 'play-toggle'): void;
  (e: 'reset'): void;
  (e: 'speed-change', speed: number): void;
  (e: 'poi-jump', poi: any): void;
}>();

const trackEl = ref<HTMLElement | null>(null);

const effectiveMin = computed(() => {
  // 如果没有显式 minYear，从 POI 自动计算
  if (props.minYear != null) return props.minYear;
  const ys = props.pois
    .map((p) => p.earliest_year)
    .filter((y): y is number => typeof y === 'number');
  return ys.length > 0 ? Math.min(...ys) : 1500;
});

const effectiveMax = computed(() => {
  if (props.maxYear != null) return props.maxYear;
  const ys = props.pois
    .map((p) => p.latest_year as number | undefined)
    .filter((y): y is number => typeof y === 'number');
  return ys.length > 0 ? Math.max(...ys, new Date().getFullYear()) : new Date().getFullYear();
});

const minYear = computed(() => effectiveMin.value);
const maxYear = computed(() => effectiveMax.value);

const pointerPosition = computed(() => {
  const range = maxYear.value - minYear.value;
  if (range <= 0) return 0;
  return Math.min(100, Math.max(0, ((props.currentYear - minYear.value) / range) * 100));
});

const currentYearLabel = computed(() => {
  if (props.currentYear >= 9999) return '现代';
  return `${props.currentYear} 年`;
});

const poiMarkers = computed<PoiMarker[]>(() => {
  const range = maxYear.value - minYear.value;
  if (range <= 0) return [];
  return props.pois
    .filter((p) => typeof p.earliest_year === 'number')
    .map((p) => {
      const y = p.earliest_year!;
      const pos = Math.min(100, Math.max(0, ((y - minYear.value) / range) * 100));
      let color = '#2B6CB0';
      if (p.source === 'birth') color = '#E53E3E';
      else if (p.source === 'death') color = '#718096';
      else if (p.source === 'mixed') color = '#D69E2E';
      return {
        id: p.id || p.name,
        name: p.name,
        earliest_year: y,
        position: pos,
        color,
      };
    });
});

const ticks = computed(() => {
  const range = maxYear.value - minYear.value;
  if (range <= 0) return [];
  const step = range > 500 ? 100 : range > 200 ? 50 : range > 50 ? 10 : 5;
  const result: Array<{ year: number; label: string; position: number; major: boolean }> = [];
  const startY = Math.ceil(minYear.value / step) * step;
  for (let y = startY; y <= maxYear.value; y += step) {
    const position = ((y - minYear.value) / range) * 100;
    result.push({
      year: y,
      label: y >= 9999 ? '今' : y.toString(),
      position,
      major: y % (step * 5) === 0 || y === startY || y === maxYear.value,
    });
  }
  return result;
});

function onSliderInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  emit('update:currentYear', v);
}
</script>

<style scoped>
.timeline-control {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: #f7fafc;
  border-top: 1px solid #e2e8f0;
}

.timeline-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 13px;
}

.timeline-current {
  font-size: 16px;
  font-weight: 600;
  color: #2d3748;
}

.timeline-range {
  color: #718096;
}

.timeline-track {
  position: relative;
  height: 56px;
  margin: 0 8px;
}

.timeline-ticks {
  position: absolute;
  inset: 0 0 0 0;
  pointer-events: none;
}

.timeline-tick {
  position: absolute;
  bottom: 18px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.tick-line {
  width: 1px;
  height: 6px;
  background: #cbd5e0;
}

.tick-line.major {
  height: 12px;
  background: #4a5568;
}

.tick-label {
  font-size: 10px;
  color: #718096;
  margin-top: 2px;
}

.tick-label.major {
  color: #2d3748;
  font-weight: 500;
}

.poi-marker-dot {
  position: absolute;
  bottom: 16px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  transform: translate(-50%, 0);
  cursor: pointer;
  z-index: 5;
}

.poi-marker-dot:hover {
  transform: translate(-50%, -2px) scale(1.2);
  transition: all 0.15s ease;
}

.timeline-pointer {
  position: absolute;
  bottom: 12px;
  width: 3px;
  height: 28px;
  background: #e53e3e;
  border-radius: 2px;
  transform: translateX(-50%);
  pointer-events: none;
  box-shadow: 0 0 8px rgba(229, 62, 62, 0.5);
  z-index: 6;
}

.timeline-slider {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  margin: 0;
  z-index: 10;
}

.timeline-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

.speed-control {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #4a5568;
}

.speed-label {
  white-space: nowrap;
}
</style>
