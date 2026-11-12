<script setup lang="ts">
/**
 * 文档卷阅读页。A4 竖版，一块 HTML 不从中间切开。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { BIO_ENTRY_GAP_PX, packBiographyPages } from '@/utils/biography-index';
import { documentBlocksFromHtml } from '@/utils/document-blocks';

const props = withDefaults(defineProps<{
  title: string;
  html?: string;
  script?: 'horizontal' | 'antique';
  anchorId?: string;
  emptyText?: string;
}>(), {
  html: '',
  script: 'horizontal',
  anchorId: '',
  emptyText: '本篇尚未录入。',
});

const blocks = computed(() => documentBlocksFromHtml(props.html));
const pages = ref<string[][]>([]);
const openPages = ref<boolean[]>([]);
const measuring = ref(true);
const stageRef = ref<HTMLElement | null>(null);
const headRef = ref<HTMLElement | null>(null);
let measureTries = 0;

const displayPages = computed(() => {
  if (!blocks.value.length) return [];
  if (measuring.value || !pages.value.length) return [blocks.value];
  return pages.value;
});

watch([blocks, () => props.script, () => props.title], async () => {
  measuring.value = true;
  pages.value = [];
  openPages.value = [];
  measureTries = 0;
  await nextTick();
  measure();
}, { immediate: true });

async function measure() {
  const stage = stageRef.value;
  if (!stage || !blocks.value.length) {
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
  await waitForImages(stage);
  const headHeight = headRef.value?.offsetHeight ?? 0;
  const firstBudget = Math.max(1, budget - headHeight);
  const nodes = [...stage.querySelectorAll<HTMLElement>('.doc-block')];
  const heights = nodes.map((node) => node.offsetHeight);
  const indexes = packBiographyPages(heights, firstBudget, budget);
  pages.value = indexes.map((group) => group.map((index) => blocks.value[index]));
  openPages.value = indexes.map((group, pageIndex) => {
    const room = pageIndex === 0 ? firstBudget : budget;
    const used = group.reduce((sum, index, place) => sum + heights[index] + (place > 0 ? BIO_ENTRY_GAP_PX : 0), 0);
    return used > room + 1;
  });
  measuring.value = false;
}

function waitForImages(root: ParentNode): Promise<void> {
  const images = [...root.querySelectorAll('img')];
  return Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    });
  })).then(() => undefined);
}

function bindStage(pageIndex: number, element: unknown) {
  if (pageIndex === 0) stageRef.value = element as HTMLElement | null;
}

function bindHead(pageIndex: number, element: unknown) {
  if (pageIndex === 0) headRef.value = element as HTMLElement | null;
}
</script>

<template>
  <div
    :id="anchorId || undefined"
    class="doc-book"
    :class="{ 'is-measuring': measuring && blocks.length, 'is-antique': script === 'antique' }"
  >
    <section v-if="!blocks.length" class="doc-sheet is-odd" :class="{ 'is-antique': script === 'antique' }">
      <div class="doc-stage">
        <header class="doc-head">
          <h2 class="doc-volume">{{ title }}</h2>
        </header>
        <p class="doc-empty">{{ emptyText }}</p>
      </div>
      <p class="doc-foot">第 1 页 / 共 1 页</p>
    </section>
    <section
      v-for="(page, pageIndex) in displayPages"
      :key="pageIndex"
      class="doc-sheet"
      :class="{
        'is-even': pageIndex % 2 === 1,
        'is-odd': pageIndex % 2 === 0,
        'is-open': openPages[pageIndex],
        'is-antique': script === 'antique',
      }"
    >
      <div class="doc-stage" :ref="(element) => bindStage(pageIndex, element)">
        <header v-if="pageIndex === 0" class="doc-head" :ref="(element) => bindHead(pageIndex, element)">
          <h2 class="doc-volume">{{ title }}</h2>
        </header>
        <div
          v-for="(block, blockIndex) in page"
          :key="blockIndex"
          class="doc-block"
          v-html="block"
        />
      </div>
      <p class="doc-foot">第 {{ pageIndex + 1 }} 页 / 共 {{ displayPages.length }} 页</p>
    </section>
  </div>
</template>

<style scoped>
.doc-book {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  gap: 18px 22px;
}

.doc-book.is-measuring {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}

.doc-sheet {
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
  box-shadow: 0 10px 24px rgba(40, 32, 18, 0.12);
  font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
  color: #1a1a1a;
}

.doc-sheet.is-even {
  padding: 30mm 20mm 25mm 15mm;
}

.doc-sheet.is-open {
  height: auto;
  min-height: 297mm;
  overflow: visible;
}

.doc-stage {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}

.doc-volume {
  margin: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.28em;
}

.doc-head {
  margin: 0 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #c4bba8;
}

.doc-empty {
  margin: 18px 0;
  text-align: center;
  font-size: 14px;
  line-height: 1.8;
  color: #666;
}

.doc-block {
  line-height: 1.9;
  font-size: 15px;
  text-indent: 2em;
}

.doc-block + .doc-block {
  margin-top: 8px;
}

.doc-block :deep(h1),
.doc-block :deep(h2),
.doc-block :deep(h3),
.doc-block :deep(h4),
.doc-block :deep(h5),
.doc-block :deep(h6) {
  text-indent: 0;
  text-align: center;
  font-size: 16px;
  margin: 0 0 6px;
}

.doc-block :deep(p) {
  margin: 0;
}

.doc-block :deep(p.poem-line),
.doc-block :deep(p.poem-meta),
.doc-block :deep(p[style*="text-align:center"]),
.doc-block :deep(p[style*="text-align: center"]) {
  text-indent: 0;
  text-align: center;
}

.doc-block :deep(p.poem-meta) {
  margin: 0 0 2px;
  font-size: 13px;
  color: #666;
}

.doc-block:has(> .poem-line) + .doc-block:has(> .poem-line),
.doc-block:has(> .poem-meta),
.doc-block:has(> .poem-meta) + .doc-block:has(> .poem-line) {
  margin-top: 0;
}

.doc-block :deep(img) {
  display: block;
  max-width: 100%;
  max-height: 120mm;
  margin: 4px auto;
  object-fit: contain;
}

.doc-block :deep(ul),
.doc-block :deep(ol) {
  text-indent: 0;
  margin: 0;
  padding-left: 1.4em;
}

.doc-foot {
  flex: 0 0 auto;
  margin: 4mm 0 0;
  text-align: center;
  font-size: 12px;
  color: #888;
}

.doc-book.is-antique .doc-head {
  display: flex;
  justify-content: flex-end;
  border-bottom: 0;
  margin: 0 0 4mm auto;
}

.doc-book.is-antique .doc-volume,
.doc-book.is-antique .doc-empty,
.doc-book.is-antique .doc-block {
  writing-mode: vertical-rl;
  text-orientation: upright;
  text-indent: 0;
}

.doc-book.is-antique .doc-volume {
  max-height: 46mm;
  letter-spacing: 0.2em;
}

.doc-book.is-antique .doc-block :deep(img) {
  writing-mode: horizontal-tb;
}

.doc-book.is-antique .doc-foot {
  writing-mode: horizontal-tb;
  font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
}

@media print {
  .doc-book { display: block; gap: 0; }
  .doc-sheet { box-shadow: none; break-after: page; page-break-after: always; }
}
</style>
