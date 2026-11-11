<script setup lang="ts">
/**
 * 苏谱的一页。
 * 版本A：标题居中横排，长房在左。
 * 版本B：米黄底、右缘世代黑框；标题竖排居右由开关控制。
 * 分页、接上接下和锚点不随垂珠开关改变。
 */
import { computed } from 'vue';
import type { EuropeanPersonCaption } from '@/utils/european-chart-source';
import { nestSuBlocks, type SuChart } from '@/utils/su-chart';
import SuChartNodes from '@/components/SuChartNodes.vue';

const props = withDefaults(defineProps<{
  charts: SuChart[];
  captions?: Record<string, EuropeanPersonCaption>;
  selectedId?: string | number | null;
  script?: 'horizontal' | 'antique';
  titleVertical?: boolean;
  pageNumber?: number;
  pageCount?: number;
  flow?: boolean;
  beadLines?: boolean;
}>(), {
  script: 'horizontal',
  titleVertical: false,
  flow: false,
  beadLines: false,
});

const emit = defineEmits<{
  (e: 'select', personId: string): void;
  (e: 'open-bio', payload: { personId: string; name: string; chartNo: number; citeBook?: '人物传' | '闺秀录'; anchorId: string }): void;
}>();

const trees = computed(() => props.charts.map((chart) => ({
  chart,
  nodes: nestSuBlocks(chart.blocks),
})));

function chartTitle(chart: SuChart): string {
  return `第${chart.index + 1}图 · ${chart.branchName}`;
}
</script>

<template>
  <section
    class="su-sheet"
    :class="{
      'is-book': !flow,
      'is-flow': flow,
      'is-even': !flow && !!pageNumber && pageNumber % 2 === 0,
      'is-antique': script === 'antique',
      'is-title-vertical': script === 'antique' && titleVertical,
    }"
  >
    <div class="su-stage">
      <div v-for="tree in trees" :key="tree.chart.index" class="su-branch">
        <a :id="`tree-su-${tree.chart.index + 1}`" class="su-anchor"></a>
        <h2 class="su-title">{{ chartTitle(tree.chart) }}</h2>
        <SuChartNodes
          :nodes="tree.nodes"
          :bead-lines="beadLines"
          :antique="script === 'antique'"
          :captions="captions"
          :selected-id="selectedId"
          :chart="tree.chart"
          @select="emit('select', $event)"
          @open-bio="emit('open-bio', $event)"
        />
      </div>
    </div>
    <p v-if="!flow && pageNumber && pageCount" class="su-foot">第 {{ pageNumber }} 页 / 共 {{ pageCount }} 页</p>
  </section>
</template>

<style scoped>
.su-sheet {
  position: relative;
  box-sizing: border-box;
  background: #fff;
  color: #1a1a1a;
  font-family: 'Songti SC', 'STSong', 'Source Han Serif SC', 'Noto Serif SC', serif;
}

.su-sheet.is-book {
  width: 210mm;
  height: 297mm;
  margin: 0;
  padding: 18mm 12mm 16mm 14mm;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(40, 32, 18, 0.12);
  break-after: page;
  page-break-after: always;
  break-inside: avoid;
  page-break-inside: avoid;
}

.su-sheet.is-book.is-even {
  padding: 18mm 14mm 16mm 12mm;
}

.su-sheet.is-flow {
  width: 210mm;
  height: auto;
  min-height: 0;
  padding: 12mm 14mm 16mm;
  box-shadow: none;
}

.su-sheet.is-antique {
  background: #f4e7c8;
  color: #1a1208;
  font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.su-sheet.is-antique.is-title-vertical {
  padding-right: 22mm;
}

.su-sheet.is-antique.is-title-vertical.is-even {
  padding-right: 24mm;
  padding-left: 12mm;
}

.su-stage {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}

.su-branch + .su-branch {
  margin-top: 8mm;
}

.su-anchor {
  display: block;
  width: 0;
  height: 0;
  overflow: hidden;
}

.su-title {
  margin: 0 0 4mm;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.28em;
  color: #2a241c;
  writing-mode: horizontal-tb;
}

.is-antique .su-title,
.is-antique .su-foot {
  color: #1a1208;
}

.is-antique.is-title-vertical .su-title {
  position: absolute;
  top: 16mm;
  right: 5mm;
  z-index: 5;
  width: 8mm;
  max-height: 78mm;
  margin: 0;
  overflow: hidden;
  writing-mode: vertical-rl;
  text-orientation: upright;
  text-align: start;
  letter-spacing: 0.18em;
  line-height: 1.15;
  font-size: 15px;
}

.su-foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 6mm;
  margin: 0;
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: #6d6458;
  writing-mode: horizontal-tb;
}

@media print {
  .su-sheet.is-book {
    box-shadow: none;
  }
}
</style>
