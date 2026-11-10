<script setup lang="ts">
/**
 * 卷三人物传。A4 竖版，一条传记不拆页，图号指向欧式世系表。
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  BIO_ENTRY_GAP_PX,
  biographyAnchorId,
  buildBiographyEntries,
  packBiographyPages,
  treeAnchorId,
  type BiographyEntry,
  type BiographySource,
} from '@/utils/biography-index';

const props = withDefaults(defineProps<{
  entries: BiographySource[];
  /** 闺秀录对照世系录的图号。不传时按本卷人物自己排图。 */
  lineageEntries?: BiographySource[];
  volumeTitle?: string;
  lead?: string;
  anchorId?: string;
  script?: 'horizontal' | 'antique';
}>(), {
  volumeTitle: '人物传',
  lead: '本卷收录族人完整行传；世系表内标注【详见人物传】者，在此查阅全文。',
  anchorId: 'book-biography',
  script: 'horizontal',
});

const emit = defineEmits<{
  (e: 'select', personId: string): void;
  (e: 'open-chart', chartNo: number): void;
}>();

const ordered = computed(() => buildBiographyEntries(props.entries, props.lineageEntries));
const pages = ref<BiographyEntry[][]>([]);
const openPages = ref<boolean[]>([]);
const measuring = ref(true);
const stageRef = ref<HTMLElement | null>(null);
const headRef = ref<HTMLElement | null>(null);
let measureTries = 0;

const displayPages = computed(() => {
  if (!ordered.value.length) return [];
  if (measuring.value || !pages.value.length) return [ordered.value];
  return pages.value;
});

watch([ordered, () => props.script, () => props.volumeTitle], async () => {
  measuring.value = true;
  pages.value = [];
  openPages.value = [];
  await nextTick();
  measure();
}, { immediate: true });

async function measure() {
  const stage = stageRef.value;
  if (!stage || !ordered.value.length) {
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
  const nodes = [...stage.querySelectorAll<HTMLElement>('.bio-entry')];
  const heights = nodes.map((node) => node.offsetHeight);
  const indexes = packBiographyPages(heights, firstBudget, budget);
  pages.value = indexes.map((group) => group.map((index) => ordered.value[index]));
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

function infoLine(entry: BiographyEntry): string {
  const parts: string[] = [];
  if (entry.courtesy) parts.push(`字：${entry.courtesy}`);
  if (entry.artName) parts.push(`号：${entry.artName}`);
  if (entry.years) parts.push(`生卒：${entry.years}`);
  if (entry.spouses) parts.push(`配偶：${entry.spouses}`);
  if (entry.father) parts.push(`父：${entry.father}`);
  parts.push(`世代：${entry.generationLabel}`);
  return parts.join('｜');
}

function bindStage(pageIndex: number, element: unknown) {
  if (pageIndex === 0) stageRef.value = element as HTMLElement | null;
}

function bindHead(pageIndex: number, element: unknown) {
  if (pageIndex === 0) headRef.value = element as HTMLElement | null;
}
</script>

<template>
  <div :id="anchorId" class="bio-book" :class="{ 'is-measuring': measuring && ordered.length, 'is-antique': script === 'antique' }">
    <section v-if="!ordered.length" class="bio-sheet is-odd" :class="{ 'is-antique': script === 'antique' }">
      <div class="bio-stage">
        <header class="bio-head">
          <h2 class="bio-volume">{{ volumeTitle }}</h2>
          <p class="bio-lead">{{ lead }}</p>
        </header>
        <p class="bio-empty">本卷暂无已录入完整行传的族人。</p>
      </div>
      <p class="bio-foot">第 1 页 / 共 1 页</p>
    </section>
    <section
      v-for="(page, pageIndex) in displayPages"
      :key="pageIndex"
      class="bio-sheet"
      :class="{
        'is-even': pageIndex % 2 === 1,
        'is-odd': pageIndex % 2 === 0,
        'is-open': openPages[pageIndex],
        'is-antique': script === 'antique',
      }"
    >
      <div class="bio-stage" :ref="(element) => bindStage(pageIndex, element)">
        <header v-if="pageIndex === 0" class="bio-head" :ref="(element) => bindHead(pageIndex, element)">
          <h2 class="bio-volume">{{ volumeTitle }}</h2>
          <p class="bio-lead">{{ lead }}</p>
        </header>
        <article v-for="entry in page" :key="entry.personId" class="bio-entry" :id="biographyAnchorId(entry.name, entry.chartNo)">
          <span
            v-for="chartNo in entry.chartNos.filter((item) => item !== entry.chartNo)"
            :id="biographyAnchorId(entry.name, chartNo)"
            :key="chartNo"
            class="bio-anchor"
          />
          <aside v-if="entry.figures.length" class="bio-figures">
            <figure v-for="(figure, figureIndex) in entry.figures" :key="figure.url + figureIndex" class="bio-figure">
              <img :src="figure.url" :alt="figure.caption" />
              <figcaption>图：{{ figure.caption }}</figcaption>
            </figure>
          </aside>
          <div class="bio-main">
            <h3 class="bio-title">
              <span class="bio-name" @click="emit('select', entry.personId)">{{ entry.name }}</span><template v-if="entry.chartNo">｜<a
                class="bio-jump"
                :href="`#${treeAnchorId(entry.chartNo)}`"
                :title="`跳转到世系第${entry.chartNo}图`"
                @click.prevent="emit('open-chart', entry.chartNo)"
              >见世系第{{ entry.chartNo }}图</a></template>
            </h3>
            <p class="bio-info">{{ infoLine(entry) }}</p>
            <p v-if="entry.nativePlace" class="bio-native">籍贯/迁居：{{ entry.nativePlace }}</p>
            <div class="bio-body">
              <p v-for="(paragraph, paragraphIndex) in entry.paragraphs" :key="paragraphIndex">{{ paragraph }}</p>
            </div>
            <p v-if="entry.note" class="bio-note">附：{{ entry.note }}</p>
          </div>
        </article>
      </div>
      <p class="bio-foot">第 {{ pageIndex + 1 }} 页 / 共 {{ displayPages.length }} 页</p>
    </section>
  </div>
</template>

<style scoped>
.bio-book {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  gap: 18px 22px;
}

.bio-book.is-measuring {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}

.bio-sheet {
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

.bio-sheet.is-even {
  padding: 30mm 20mm 25mm 15mm;
}

.bio-sheet.is-open {
  height: auto;
  min-height: 297mm;
  overflow: visible;
}

.bio-stage {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}

.bio-volume {
  margin: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.28em;
}

.bio-lead {
  margin: 6px 0 8px;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: #666;
}

.bio-empty {
  margin: 12px 0;
  text-align: center;
  font-size: 12px;
  color: #888;
}

.bio-entry {
  overflow: hidden;
  break-inside: avoid;
  page-break-inside: avoid;
}

.bio-entry + .bio-entry {
  border-top: 1px solid #ccc;
  margin-top: 8px;
  padding-top: 8px;
}

.bio-anchor {
  display: block;
  height: 0;
  overflow: hidden;
}

.bio-figures {
  float: right;
  width: calc(35mm + 4mm);
  margin: 0 0 2mm 3mm;
}

.bio-figure {
  margin: 0 0 2mm;
  padding: 1.5mm;
}

.bio-figure img {
  display: block;
  width: auto;
  height: auto;
  max-width: 35mm;
  max-height: 50mm;
  margin: 0 auto;
  object-fit: contain;
}

.bio-figure figcaption {
  margin-top: 1mm;
  font-size: 10px;
  line-height: 1.4;
  color: #888;
  text-align: center;
}

.bio-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.5;
}

.bio-name {
  cursor: pointer;
}

.bio-name:hover {
  color: #8a6416;
}

.bio-jump {
  color: #1a56c4;
  text-decoration: underline;
  cursor: pointer;
}

.bio-info,
.bio-native {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.bio-body {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.6;
  font-weight: 400;
}

.bio-body p {
  margin: 0 0 4px;
  white-space: normal;
}

.bio-note {
  margin: 4px 0 0;
  font-size: 10px;
  line-height: 1.5;
  color: #888;
}

.bio-foot {
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

.bio-book.is-antique .bio-sheet {
  font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
}

.bio-book.is-antique .bio-stage {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  height: 100%;
  writing-mode: horizontal-tb;
}

.bio-book.is-antique .bio-head {
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-start;
  align-self: flex-end;
  gap: 3mm;
  width: auto;
  height: auto;
  margin: 0 0 4mm auto;
  writing-mode: horizontal-tb;
}

.bio-book.is-antique .bio-volume,
.bio-book.is-antique .bio-lead,
.bio-book.is-antique .bio-empty {
  writing-mode: vertical-rl;
  text-orientation: upright;
  height: auto;
  max-height: 46mm;
  margin: 0;
  text-align: start;
}

.bio-book.is-antique .bio-entry {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  width: 100%;
  height: auto;
  max-height: none;
  overflow: visible;
  border: 0;
  margin: 0;
  padding: 0;
}

.bio-book.is-antique .bio-entry + .bio-entry {
  border-top: 1px solid #c4bba8;
  border-right: 0;
  margin-top: 3.5mm;
  padding-top: 3.5mm;
}

.bio-book.is-antique .bio-anchor {
  position: absolute;
  width: 0;
  height: 0;
}

.bio-book.is-antique .bio-main {
  writing-mode: vertical-rl;
  text-orientation: upright;
  flex: 1 1 auto;
  min-width: 0;
  max-height: 168mm;
}

.bio-book.is-antique .bio-title,
.bio-book.is-antique .bio-info,
.bio-book.is-antique .bio-native,
.bio-book.is-antique .bio-body,
.bio-book.is-antique .bio-note {
  writing-mode: vertical-rl;
  text-orientation: upright;
}

.bio-book.is-antique .bio-figures {
  float: none;
  order: -1;
  flex: 0 0 39mm;
  width: 39mm;
  margin: 0 3mm 0 0;
  writing-mode: horizontal-tb;
}

.bio-book.is-antique .bio-figure {
  writing-mode: horizontal-tb;
}

.bio-book.is-antique .bio-figure img {
  max-width: 35mm;
  max-height: 50mm;
}

.bio-book.is-antique .bio-figure figcaption {
  writing-mode: vertical-rl;
  text-orientation: upright;
  text-align: start;
  max-height: 36mm;
  margin-top: 1mm;
}

.bio-book.is-antique .bio-foot {
  writing-mode: horizontal-tb;
  font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
}

@media print {
  .bio-book { display: block; gap: 0; }
  .bio-sheet { box-shadow: none; break-after: page; page-break-after: always; }
  .bio-jump { color: inherit; text-decoration: none; }
}
</style>
