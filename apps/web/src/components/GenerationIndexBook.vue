<script setup lang="ts">
/**
 * 标准宗谱的字辈索引。按行装进 A4 版心，页脚只放页码。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { BIO_ENTRY_GAP_PX, packBiographyPages } from '@/utils/biography-index';

const props = withDefaults(defineProps<{
  rows: { generation: number; character: string; note?: string | null }[];
  script?: 'horizontal' | 'antique';
}>(), {
  script: 'horizontal',
});

const pages = ref<typeof props.rows[]>([]);
const measuring = ref(true);
const stageRef = ref<HTMLElement | null>(null);
const headRef = ref<HTMLElement | null>(null);
let measureTries = 0;

const displayPages = computed(() => {
  if (!props.rows.length) return [];
  if (measuring.value || !pages.value.length) return [props.rows];
  return pages.value;
});

watch([() => props.rows, () => props.script], async () => {
  measuring.value = true;
  pages.value = [];
  measureTries = 0;
  await nextTick();
  measure();
}, { immediate: true });

function measure() {
  const stage = stageRef.value;
  if (!stage || !props.rows.length) {
    measuring.value = false;
    return;
  }
  const budget = stage.clientHeight;
  if (budget < 40 && measureTries < 8) {
    measureTries += 1;
    requestAnimationFrame(() => measure());
    return;
  }
  measureTries = 0;
  const headHeight = headRef.value?.offsetHeight ?? 0;
  const firstBudget = Math.max(1, budget - headHeight);
  const nodes = [...stage.querySelectorAll<HTMLElement>('.gen-row')];
  const heights = nodes.map((node) => node.offsetHeight);
  const indexes = packBiographyPages(heights, firstBudget, budget);
  pages.value = indexes.map((group) => group.map((index) => props.rows[index]));
  measuring.value = false;
}

function bindStage(pageIndex: number, element: unknown) {
  if (pageIndex === 0) stageRef.value = element as HTMLElement | null;
}

function bindHead(pageIndex: number, element: unknown) {
  if (pageIndex === 0) headRef.value = element as HTMLElement | null;
}
</script>

<template>
  <div id="book-generation" class="gen-book" :class="{ 'is-measuring': measuring && rows.length, 'is-antique': script === 'antique' }" :style="{ '--gen-row-gap': `${BIO_ENTRY_GAP_PX}px` }">
    <section v-if="!rows.length" class="gen-sheet is-odd" :class="{ 'is-antique': script === 'antique' }">
      <div class="gen-stage">
        <header class="gen-head">
          <h2 class="gen-title">字辈索引</h2>
        </header>
        <p class="gen-empty">字辈尚未录入。</p>
      </div>
      <p class="gen-foot">第 1 页 / 共 1 页</p>
    </section>
    <section
      v-for="(page, pageIndex) in displayPages"
      :key="pageIndex"
      class="gen-sheet"
      :class="{
        'is-even': pageIndex % 2 === 1,
        'is-odd': pageIndex % 2 === 0,
        'is-antique': script === 'antique',
      }"
    >
      <div class="gen-stage" :ref="(element) => bindStage(pageIndex, element)">
        <header v-if="pageIndex === 0" class="gen-head" :ref="(element) => bindHead(pageIndex, element)">
          <h2 class="gen-title">字辈索引</h2>
        </header>
        <p v-for="row in page" :key="row.generation" class="gen-row">
          第{{ row.generation }}世｜{{ row.character }}<template v-if="row.note">｜{{ row.note }}</template>
        </p>
      </div>
      <p class="gen-foot">第 {{ pageIndex + 1 }} 页 / 共 {{ displayPages.length }} 页</p>
    </section>
  </div>
</template>

<style scoped>
.gen-book {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  gap: 18px 22px;
}

.gen-book.is-measuring {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}

.gen-sheet {
  position: relative;
  flex: 0 0 auto;
  width: 210mm;
  height: 297mm;
  margin: 0;
  padding: 30mm 15mm 25mm 20mm;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 8px 28px rgba(60, 40, 20, 0.12);
  font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
  color: #1a1a1a;
}

.gen-sheet.is-even {
  padding: 30mm 20mm 25mm 15mm;
}

.gen-stage {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.gen-head {
  margin: 0;
  padding-bottom: 8px;
}

.gen-title {
  margin: 0;
  text-align: left;
  font-size: 22px;
  letter-spacing: 0.2em;
}

.gen-row,
.gen-empty {
  margin: 0;
  font-size: 16px;
  line-height: 1.7;
  text-align: left;
}

.gen-row + .gen-row {
  margin-top: var(--gen-row-gap, 8px);
}

.gen-empty { color: #666; }

.gen-foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8mm;
  margin: 0;
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: #6d6458;
}

.gen-book.is-antique .gen-sheet { font-family: 'SimSun', 'NSimSun', 'Songti SC', serif; }

.gen-book.is-antique .gen-head {
  display: flex;
  justify-content: flex-end;
}

.gen-book.is-antique .gen-title,
.gen-book.is-antique .gen-row,
.gen-book.is-antique .gen-empty {
  writing-mode: vertical-rl;
  text-orientation: upright;
  text-align: start;
}

.gen-book.is-antique .gen-title { max-height: 46mm; }

.gen-book.is-antique .gen-foot {
  writing-mode: horizontal-tb;
  font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
}

@media print {
  .gen-book { display: block; gap: 0; }
  .gen-sheet { box-shadow: none; break-after: page; page-break-after: always; }
}
</style>
