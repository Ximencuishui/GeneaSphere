<script setup lang="ts">
/**
 * 苏谱的一页。
 * 版本A：竖向 A4，标题居中横排。
 * 版本B：横向 A4，单层版框，图题竖排在最右侧。
 * 分页、接上接下和锚点不随垂珠开关改变。
 */
import { computed } from 'vue';
import type { EuropeanPersonCaption } from '@/utils/european-chart-source';
import { nestSuBlocks, suFrameWeightPt, type SuChart, type SuFrameWeightPt } from '@/utils/su-chart';
import type { ContinueNoteMode } from '@/utils/continue-note';
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
  /** 版本A均匀细线版框。仿古版忽略。 */
  showFrame?: boolean;
  /** 版本A版框线宽，四边同一数值。 */
  framePt?: SuFrameWeightPt | number;
  chartPages?: Record<number, number>;
  continueNote?: ContinueNoteMode | null;
  showAvatars?: boolean;
}>(), {
  script: 'horizontal',
  titleVertical: false,
  flow: false,
  beadLines: false,
  showFrame: false,
  framePt: 4,
  continueNote: null,
  showAvatars: true,
});

const emit = defineEmits<{
  (e: 'select', personId: string): void;
  (e: 'open-bio', payload: { personId: string; name: string; chartNo: number; citeBook?: '人物传' | '闺秀录'; anchorId: string }): void;
}>();

const trees = computed(() => props.charts.map((chart) => ({
  chart,
  nodes: nestSuBlocks(chart.blocks),
})));

const frameWeight = computed(() => suFrameWeightPt(props.framePt));
const frameStyle = computed(() => (
  props.script !== 'antique' && props.showFrame
    ? { '--su-frame-pt': `${frameWeight.value}pt` }
    : undefined
));

function chartTitle(chart: SuChart): string {
  const name = props.script === 'antique'
    ? chart.branchName.replace(/支世系$/, '支派')
    : chart.branchName;
  return `第${chart.index + 1}图 · ${name}`;
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
      'is-landscape': script === 'antique',
      'is-title-vertical': script === 'antique',
      'is-modern-frame': script !== 'antique' && showFrame,
    }"
    :style="frameStyle"
  >
    <div class="su-stage" :class="{ 'su-frame': script === 'antique' }">
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
          :chart-pages="chartPages"
          :continue-note="continueNote"
          :show-avatars="script !== 'antique' && showAvatars"
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

.su-sheet.is-book.is-landscape {
  width: 297mm;
  height: 210mm;
  padding: 8mm 8mm 10mm;
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

.su-sheet.is-flow.is-landscape {
  width: 297mm;
}

.su-sheet.is-antique {
  background: #fff;
  color: #000;
  font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.su-frame {
  position: relative;
  box-sizing: border-box;
  height: 100%;
  padding: 3mm 16mm 3mm 3mm;
  border-top: 1.2pt solid #000;
  border-bottom: 1.2pt solid #000;
  border-left: 0.6pt solid #000;
  border-right: 0.6pt solid #000;
}

.su-sheet.is-flow .su-frame {
  height: auto;
}

.su-sheet.is-modern-frame::before {
  content: '';
  position: absolute;
  z-index: 6;
  top: 10mm;
  right: 8mm;
  bottom: 12mm;
  left: 8mm;
  border-style: solid;
  border-color: #000;
  border-width: var(--su-frame-pt, 4pt);
  pointer-events: none;
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
  color: #000;
}

.is-antique .su-title {
  position: absolute;
  top: 4mm;
  right: 3mm;
  z-index: 5;
  width: 10mm;
  max-height: 160mm;
  margin: 0;
  overflow: hidden;
  writing-mode: vertical-rl;
  text-orientation: upright;
  text-align: start;
  letter-spacing: 0.16em;
  line-height: 1.15;
  font-size: 14px;
  font-weight: 600;
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
