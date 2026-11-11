<script setup lang="ts">
/**
 * 册谱苏式垂珠。和欧式共用人物、缩放和分页开关。版本A长房在左，版本B长房在右。
 */
import { computed, ref } from 'vue';
import type { EuropeanLinkInput, EuropeanPersonInput } from '@/utils/european-chart';
import type { EuropeanPersonCaption } from '@/utils/european-chart-source';
import { SU_BLOCKS_PER_PAGE, buildSuCharts, groupSuCharts } from '@/utils/su-chart';
import SuChartSheet from '@/components/SuChartSheet.vue';

const props = withDefaults(defineProps<{
  people: EuropeanPersonInput[];
  links: EuropeanLinkInput[];
  captions?: Record<string, EuropeanPersonCaption>;
  selectedId?: string | number | null;
  script?: 'horizontal' | 'antique';
  titleVertical?: boolean;
  pack?: 'exclusive' | 'share';
  zoom?: number;
  continuous?: boolean | null;
  showToolbar?: boolean;
  /** 不传时用组件内部开关；册谱页传入时和欧式共用的顶栏一起记住。 */
  beadLines?: boolean | null;
}>(), {
  script: 'horizontal',
  titleVertical: false,
  pack: 'exclusive',
  continuous: null,
  showToolbar: true,
  beadLines: null,
});

const emit = defineEmits<{
  (e: 'select', personId: string): void;
  (e: 'open-bio', payload: { personId: string; name: string; chartNo: number; citeBook?: '人物传' | '闺秀录'; anchorId: string }): void;
  (e: 'update:beadLines', value: boolean): void;
}>();

const localZoom = ref(1);
const localContinuous = ref(false);
const localBeads = ref(false);
const zoom = computed(() => (props.zoom == null ? localZoom.value : props.zoom));
const continuous = computed(() => (props.continuous == null ? localContinuous.value : props.continuous));
const beadsOn = computed(() => (props.beadLines == null ? localBeads.value : props.beadLines));
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`);

const charts = computed(() => buildSuCharts(props.people, props.links, {
  blocksPerPage: continuous.value ? 100000 : SU_BLOCKS_PER_PAGE,
}));
const groups = computed(() => (
  continuous.value ? [charts.value].filter((group) => group.length > 0) : groupSuCharts(charts.value, props.pack)
));

function zoomBy(delta: number) {
  const next = Math.round((zoom.value + delta) * 10) / 10;
  localZoom.value = Math.min(2, Math.max(0.6, next));
}

function toggleBeads() {
  const next = !beadsOn.value;
  localBeads.value = next;
  emit('update:beadLines', next);
}
</script>

<template>
  <div class="su-chart-view" :class="{ 'is-flow': continuous }">
    <p v-if="charts.length === 0" class="su-empty">当前世系还排不出苏谱</p>
    <div v-if="showToolbar && charts.length" class="su-zoom-bar">
      <button type="button" @click="zoomBy(-0.1)">缩小</button>
      <span>{{ zoomLabel }}</span>
      <button type="button" @click="zoomBy(0.1)">放大</button>
      <button type="button" @click="localZoom = 1">原大</button>
      <button
        type="button"
        :class="{ 'is-active': continuous }"
        :aria-pressed="continuous"
        @click="localContinuous = !localContinuous"
      >连续显示</button>
      <button
        type="button"
        class="su-bead-toggle"
        :class="{ 'is-active': beadsOn }"
        :aria-pressed="beadsOn"
        @click="toggleBeads"
      >{{ beadsOn ? '隐藏垂珠连线' : '显示垂珠连线' }}</button>
    </div>
    <div v-if="charts.length" class="su-flow" :style="{ zoom }">
      <SuChartSheet
        v-for="(group, pageIndex) in groups"
        :key="group.map((chart) => chart.index).join('|') || 'empty'"
        :charts="group"
        :captions="captions"
        :selected-id="selectedId"
        :script="script"
        :title-vertical="titleVertical"
        :flow="continuous"
        :bead-lines="beadsOn"
        :page-number="continuous ? undefined : pageIndex + 1"
        :page-count="continuous ? undefined : groups.length"
        @select="emit('select', $event)"
        @open-bio="emit('open-bio', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.su-chart-view {
  width: 100%;
}

.su-empty {
  margin: 48px auto 0;
  text-align: center;
  font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
  font-size: 18px;
  letter-spacing: 0.2em;
  color: #6d6458;
}

.su-zoom-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0 0 12px;
}

.su-zoom-bar button {
  font-family: inherit;
  font-size: 13px;
  color: #3e3a35;
  background: #fff;
  border: 1px solid #d2c6b2;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
}

.su-zoom-bar button.is-active {
  color: #fff;
  background: #2a241c;
  border-color: #2a241c;
}

.su-flow {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  gap: 18px 22px;
}

@media print {
  .su-zoom-bar { display: none; }
  .su-flow { zoom: 1 !important; }
}
</style>
