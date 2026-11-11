<script setup lang="ts">
/**
 * 卷首人名索引。A4 竖版，字母组不拆到两页。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { biographyAnchorId, type BiographySource } from '@/utils/biography-index';
import {
  NAME_INDEX_COLUMNS,
  NAME_INDEX_PACK_SAFETY,
  nameIndexFromEntries,
  packIndexGroups,
  type NameIndexGroup,
} from '@/utils/name-index';

const props = withDefaults(defineProps<{
  entries: BiographySource[];
  script?: 'horizontal' | 'antique';
}>(), {
  script: 'horizontal',
});

const emit = defineEmits<{
  (e: 'open-bio', payload: { name: string; chartNo: number }): void;
}>();

const groups = computed(() => nameIndexFromEntries(props.entries));
const pages = ref<NameIndexGroup[][]>([]);
const openPages = ref<boolean[]>([]);
const measuring = ref(true);
const stageRef = ref<HTMLElement | null>(null);
const headRef = ref<HTMLElement | null>(null);
const probeRef = ref<HTMLElement | null>(null);
let measureTries = 0;

const displayPages = computed(() => {
  if (!groups.value.length) return [];
  if (measuring.value || !pages.value.length) return [groups.value];
  return pages.value;
});

watch([groups, () => props.script], async () => {
  measuring.value = true;
  pages.value = [];
  openPages.value = [];
  await nextTick();
  measure();
}, { immediate: true });

async function measure() {
  const stage = stageRef.value;
  const probe = probeRef.value;
  if (!stage || !probe || !groups.value.length) {
    measuring.value = false;
    return;
  }
  const budget = stage.clientHeight;
  if ((budget < 40 || (props.script === 'antique' && stage.clientWidth < 40)) && measureTries < 8) {
    measureTries += 1;
    requestAnimationFrame(() => measure());
    return;
  }
  measureTries = 0;
  const antique = props.script === 'antique';
  const head = headRef.value;
  const nodes = [...probe.querySelectorAll<HTMLElement>('.idx-group')];
  const headHeight = head?.offsetHeight ?? 0;
  const columnHeight = Math.max(40, budget - (antique ? headHeight : 0));
  if (antique) {
    probe.style.height = `${columnHeight}px`;
    probe.style.width = 'auto';
    probe.style.display = 'flex';
    for (const node of nodes) applyColumn(node, columnHeight);
  }
  const firstBudget = antique ? stage.clientWidth : Math.max(1, budget - headHeight);
  const heights = nodes.map((node) => (antique ? node.offsetWidth : node.offsetHeight));
  if (antique) {
    for (const node of nodes) clearColumn(node);
    probe.style.height = '';
    probe.style.width = '';
    probe.style.display = '';
  }
  const indexes = antique
    ? packColumns(heights, stage.clientWidth, stage.clientWidth)
    : packIndexGroups(heights, firstBudget, budget);
  pages.value = indexes.map((group) => group.map((index) => groups.value[index]));
  openPages.value = indexes.map((group, pageIndex) => {
    const room = antique
      ? stage.clientWidth
      : (pageIndex === 0 ? firstBudget : budget) * NAME_INDEX_COLUMNS - NAME_INDEX_PACK_SAFETY;
    return group.some((index) => heights[index] > room);
  });
  measuring.value = false;
}

function applyColumn(node: HTMLElement, height: number) {
  node.style.writingMode = 'vertical-rl';
  node.style.textOrientation = 'upright';
  node.style.height = `${height}px`;
  node.style.maxHeight = `${height}px`;
  node.style.width = 'max-content';
}

function clearColumn(node: HTMLElement) {
  node.style.writingMode = '';
  node.style.textOrientation = '';
  node.style.height = '';
  node.style.maxHeight = '';
  node.style.width = '';
}

function packColumns(widths: number[], firstBudget: number, budget: number): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  let room = Math.max(1, firstBudget);
  widths.forEach((width, index) => {
    if (page.length && used + width > room) {
      pages.push(page);
      page = [];
      used = 0;
      room = Math.max(1, budget);
    }
    page.push(index);
    used += width;
    if (width > room) {
      pages.push(page);
      page = [];
      used = 0;
      room = Math.max(1, budget);
    }
  });
  if (page.length) pages.push(page);
  return pages;
}

function bindStage(pageIndex: number, element: unknown) {
  if (pageIndex === 0) stageRef.value = element as HTMLElement | null;
}

function bindHead(pageIndex: number, element: unknown) {
  if (pageIndex === 0) headRef.value = element as HTMLElement | null;
}
</script>

<template>
  <div class="idx-book" :class="{ 'is-measuring': measuring && groups.length, 'is-antique': script === 'antique' }">
    <div v-if="measuring" ref="probeRef" class="idx-probe" aria-hidden="true">
      <section v-for="group in groups" :key="'measure-' + group.letter" class="idx-group">
        <h3 class="idx-letter">【{{ group.letter }}】</h3>
        <p v-for="row in group.rows" :key="'measure-' + row.personId + '-' + row.chartNo" class="idx-row">
          {{ row.name }}｜{{ row.pinyin }}｜{{ row.generationLabel }}｜苏式第{{ row.suChartNo || '—' }}图｜欧式第{{ row.ouChartNo || row.chartNo }}图｜第{{ row.pageNo }}页
        </p>
      </section>
    </div>
    <section v-if="!groups.length" class="idx-sheet is-odd" :class="{ 'is-antique': script === 'antique' }">
      <div class="idx-stage">
        <header class="idx-head">
          <h2 class="idx-title">卷首 · 人名索引</h2>
          <p class="idx-lead">本索引按姓名拼音排序。一条记录同时列出苏式图号、欧式图号和页码。</p>
        </header>
        <p class="idx-empty">本索引暂无已录入完整行传的族人。</p>
      </div>
      <p class="idx-foot">第 1 页 / 共 1 页</p>
    </section>
    <section
      v-for="(page, pageIndex) in displayPages"
      :key="pageIndex"
      class="idx-sheet"
      :class="[pageIndex % 2 === 0 ? 'is-odd' : 'is-even', { 'is-open': openPages[pageIndex], 'is-antique': script === 'antique' }]"
    >
      <div class="idx-stage" :ref="(element) => bindStage(pageIndex, element)">
        <header v-if="pageIndex === 0" class="idx-head" :ref="(element) => bindHead(pageIndex, element)">
          <h2 class="idx-title">卷首 · 人名索引</h2>
          <p class="idx-lead">本索引按姓名拼音排序。一条记录同时列出苏式图号、欧式图号和页码。</p>
        </header>
        <div class="idx-columns">
          <section v-for="group in page" :key="group.letter" class="idx-group">
            <h3 class="idx-letter">【{{ group.letter }}】</h3>
            <p v-for="row in group.rows" :key="row.personId + '-' + row.chartNo" class="idx-row">
              <a
                class="idx-jump"
                :href="`#${biographyAnchorId(row.name, row.chartNo)}`"
                :title="`跳转到人物传：${row.name}，第${row.chartNo}图`"
                @click.prevent="emit('open-bio', { name: row.name, chartNo: row.chartNo })"
              >{{ row.name }}</a>｜{{ row.pinyin }}｜{{ row.generationLabel }}｜苏式第{{ row.suChartNo || '—' }}图｜欧式第{{ row.ouChartNo || row.chartNo }}图｜第{{ row.pageNo }}页
            </p>
          </section>
        </div>
      </div>
      <p class="idx-foot">第 {{ pageIndex + 1 }} 页 / 共 {{ displayPages.length }} 页</p>
    </section>
  </div>
</template>

<style scoped>
.idx-book {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  gap: 18px 22px;
}

.idx-book.is-measuring {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}

.idx-probe {
  position: absolute;
  left: -12000px;
  top: 0;
  width: calc((175mm - 8mm) / 2);
  visibility: hidden;
  pointer-events: none;
}

.idx-sheet {
  position: relative;
  width: 210mm;
  height: 297mm;
  margin: 0;
  padding: 30mm 15mm 25mm 20mm;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(40, 32, 18, 0.12);
  font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
  color: #1a1a1a;
}

.idx-sheet.is-even {
  padding: 30mm 20mm 25mm 15mm;
}

.idx-sheet.is-open {
  height: auto;
  min-height: 297mm;
  overflow: visible;
}

.idx-stage {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.idx-title {
  margin: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.28em;
}

.idx-lead {
  margin: 6px 0 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: #666;
}

.idx-empty {
  margin: 12px 0;
  text-align: center;
  font-size: 12px;
  color: #888;
}

.idx-columns {
  column-count: 2;
  column-gap: 8mm;
  column-fill: balance;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

.idx-sheet.is-open .idx-columns {
  height: auto;
  column-count: 1;
}

.idx-letter {
  margin: 0;
  padding-top: 12px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
}

.idx-row {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  break-inside: avoid;
}

.idx-jump {
  color: #1a56c4;
  text-decoration: underline;
  cursor: pointer;
}

.idx-foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8mm;
  margin: 0;
  text-align: center;
  font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: #6d6458;
}

.idx-book.is-antique .idx-sheet {
  font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
}

.idx-book.is-antique .idx-stage {
  flex-direction: column;
  align-items: stretch;
  height: 100%;
}

.idx-book.is-antique .idx-head {
  align-self: flex-end;
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-start;
  gap: 3mm;
  height: auto;
  flex: 0 0 auto;
  margin: 0 0 3mm auto;
  writing-mode: horizontal-tb;
}

.idx-book.is-antique .idx-title,
.idx-book.is-antique .idx-lead,
.idx-book.is-antique .idx-empty {
  writing-mode: vertical-rl;
  text-orientation: upright;
  height: auto;
  max-height: 52mm;
  margin: 0;
  text-align: start;
}

.idx-book.is-antique .idx-columns {
  column-count: auto;
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 5mm;
  flex: 1 1 auto;
  height: 0;
  min-height: 0;
  width: 100%;
}

.idx-book.is-antique .idx-group,
.idx-book.is-antique .idx-letter,
.idx-book.is-antique .idx-row {
  writing-mode: vertical-rl;
  text-orientation: upright;
}

.idx-book.is-antique .idx-group {
  height: 100%;
  max-height: 100%;
  width: max-content;
  flex: 0 0 auto;
}

.idx-book.is-antique .idx-probe {
  width: auto;
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-start;
}

.idx-book.is-antique .idx-foot {
  writing-mode: horizontal-tb;
  font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
}

@media print {
  .idx-book { display: block; gap: 0; }
  .idx-sheet { box-shadow: none; break-after: page; page-break-after: always; }
  .idx-jump { color: inherit; text-decoration: none; }
}
</style>
