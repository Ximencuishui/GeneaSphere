<script setup lang="ts">
/**
 * 欧谱：一张表一世系，五世一图。
 * canvas 铺在树谱上。book 是 A4 印刷页，一图一页，屏幕上可以放大缩小。
 */
import { computed, ref } from 'vue';
import { EUROPEAN_ROWS_PER_PAGE, fitEuropeanChartsToPages, type EuropeanChart } from '@/utils/european-chart';
import type { EuropeanPersonCaption } from '@/utils/european-chart-source';
import { indexChartAppearances } from '@/utils/biography-index';
import EuropeanChartSheet from '@/components/EuropeanChartSheet.vue';
import { continueNoteMode, type ContinueNoteMode } from '@/utils/continue-note';

const props = withDefaults(defineProps<{
  charts: EuropeanChart[];
  captions?: Record<string, EuropeanPersonCaption>;
  selectedId?: string | number | null;
  variant?: 'canvas' | 'book';
  /** horizontal 横排简体；antique 仿古竖排。只改字形方向，不改五世规则。 */
  script?: 'horizontal' | 'antique';
  titleVertical?: boolean;
  /** exclusive：一图独占一页。share：短图可以排在同一页。 */
  pack?: 'exclusive' | 'share';
  /** 册谱顶部控件传入时，和苏式共用同一比例。 */
  zoom?: number;
  /** 传入时由册谱顶部记住。开启后取消分页隔离。缺省 null，沿用组件内部状态。 */
  continuous?: boolean | null;
  showToolbar?: boolean;
  continueNote?: ContinueNoteMode | null;
}>(), {
  variant: 'canvas',
  script: 'horizontal',
  titleVertical: false,
  pack: 'exclusive',
  continuous: null,
  showToolbar: true,
  continueNote: null,
});

const emit = defineEmits<{
  (e: 'select', personId: string): void;
  (e: 'open-bio', payload: { personId: string; name: string; chartNo: number; citeBook?: '人物传' | '闺秀录' }): void;
}>();

const bookCharts = computed(() => (
  props.variant === 'book' ? fitEuropeanChartsToPages(props.charts) : props.charts
));

function groupSheets(charts: EuropeanChart[], pack: 'exclusive' | 'share'): EuropeanChart[][] {
  if (pack !== 'share') return charts.map((chart) => [chart]);
  const groups: EuropeanChart[][] = [];
  let bucket: EuropeanChart[] = [];
  let rows = 0;
  for (const chart of charts) {
    const need = Math.max(1, chart.rowCount);
    if (bucket.length && rows + need > EUROPEAN_ROWS_PER_PAGE) {
      groups.push(bucket);
      bucket = [];
      rows = 0;
    }
    bucket.push(chart);
    rows += need;
  }
  if (bucket.length) groups.push(bucket);
  return groups;
}

const sheetGroups = computed(() => groupSheets(bookCharts.value, props.pack));
const noteMode = computed(() => continueNoteMode(props.continueNote, props.script));
const chartPages = computed(() => {
  const map: Record<number, number> = {};
  sheetGroups.value.forEach((group, index) => {
    for (const chart of group) map[chart.index + 1] = index + 1;
  });
  return map;
});

const sheetCaptions = computed(() => {
  if (props.variant !== 'book' || !props.captions) return props.captions;
  const refs = indexChartAppearances(bookCharts.value);
  const next: Record<string, EuropeanPersonCaption> = { ...props.captions };
  for (const [id, ref] of refs) {
    const caption = props.captions[id];
    if (!caption?.biography?.trim()) continue;
    next[id] = { ...caption, biographyChartNo: ref.chartNo };
  }
  return next;
});

const localZoom = ref(1);
const localContinuous = ref(true);
const zoom = computed(() => (props.zoom == null ? localZoom.value : props.zoom));
const continuous = computed(() => (props.continuous == null ? localContinuous.value : props.continuous));
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`);
const flow = computed(() => props.continuous === true);

function zoomBy(delta: number) {
  const next = Math.round((zoom.value + delta) * 10) / 10;
  localZoom.value = Math.min(2, Math.max(0.6, next));
}

function onSelect(personId: string) {
  emit('select', personId);
}
</script>

<template>
  <div class="european-chart-view" :class="{ 'is-book': variant === 'book', 'is-flow': flow }">
    <p v-if="bookCharts.length === 0" class="ou-empty-state">当前世系还排不出欧谱</p>
    <div v-if="showToolbar && variant === 'book' && bookCharts.length" class="ou-zoom-bar">
      <button type="button" @click="zoomBy(-0.1)">缩小</button>
      <span class="ou-zoom-label">{{ zoomLabel }}</span>
      <button type="button" @click="zoomBy(0.1)">放大</button>
      <button type="button" @click="localZoom = 1">原大</button>
      <button
        type="button"
        :class="{ 'is-active': continuous }"
        :aria-pressed="continuous"
        @click="localContinuous = !localContinuous"
      >连续显示</button>
    </div>
    <div v-if="bookCharts.length" class="ou-book-flow" :style="variant === 'book' ? { zoom } : undefined">
      <EuropeanChartSheet
        v-for="(group, pageIndex) in sheetGroups"
        :key="group.map((chart) => `${chart.index}-${chart.generationFrom}-${chart.rowCount}`).join('|')"
        :chart="group[0]"
        :charts="group"
        :chart-index="pageIndex"
        :captions="sheetCaptions"
        :selected-id="selectedId"
        :variant="variant"
        :show-title="true"
        :with-anchor="variant === 'book'"
        :page-number="variant === 'book' ? pageIndex + 1 : undefined"
        :page-count="variant === 'book' ? sheetGroups.length : undefined"
        :center="variant === 'book' && continuous && !flow"
        :script="script"
        :title-vertical="titleVertical"
        :chart-pages="chartPages"
        :continue-note="noteMode"
        @select="onSelect"
        @open-bio="emit('open-bio', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.european-chart-view {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: auto;
  box-sizing: border-box;
  padding: 78px 28px 96px;
  background:
    radial-gradient(circle at 12% 8%, rgba(201, 169, 110, 0.16), transparent 42%),
    #f3efe4;
}

.ou-empty-state {
  margin: 18vh auto 0;
  text-align: center;
  font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
  font-size: 18px;
  letter-spacing: 0.2em;
  color: #6d6458;
}

.european-chart-view.is-book {
  position: static;
  inset: auto;
  z-index: auto;
  overflow: visible;
  padding: 0;
  background: transparent;
}

.is-book .ou-zoom-bar {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: rgba(255, 252, 246, 0.96);
  border: 1px solid #e4dccb;
  border-radius: 6px;
}

.is-book .ou-zoom-bar button {
  font-family: inherit;
  font-size: 13px;
  color: #3e3a35;
  background: #fff;
  border: 1px solid #d2c6b2;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
}

.is-book .ou-zoom-bar button.is-active {
  color: #fff;
  background: #2a241c;
  border-color: #2a241c;
}

.is-book .ou-zoom-label {
  min-width: 48px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: #3e3a35;
  font-size: 13px;
}

.is-book .ou-book-flow {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  gap: 18px 22px;
}

.is-book.is-flow :deep(.ou-sheet.is-book) {
  height: auto;
  min-height: 0;
  overflow: visible;
  break-after: auto;
  page-break-after: auto;
  box-shadow: none;
}

@media print {
  .is-book .ou-zoom-bar { display: none; }
  .is-book .ou-book-flow { zoom: 1 !important; }
}
</style>
