<script setup lang="ts">
/**
 * 苏谱的一页。
 * 版本A：竖向 A4，标题居中横排。
 * 版本B：横向 A4。单层版框，上下 4pt、左右 2pt。内部分隔竖线 1pt。图题竖排时靠在版框内最右侧。
 * 分页、接上接下和锚点不随垂珠开关改变。
 */
import { computed } from 'vue';
import type { EuropeanPersonCaption } from '@/utils/european-chart-source';
import { SU_ANTIQUE_BEAD_PT, SU_ANTIQUE_DIVIDER_PT, SU_ANTIQUE_FRAME_SIDE_PT, SU_ANTIQUE_FRAME_TOP_PT, SU_ANTIQUE_PERSON_RULE_PT, nestSuBlocks, suAntiqueColumn, suFrameWeightPt, type SuChart, type SuFrameWeightPt } from '@/utils/su-chart';
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
const antiqueRails = suAntiqueColumn();
const frameStyle = computed(() => (
  props.script === 'antique'
    ? {
      '--su-antique-top': `${SU_ANTIQUE_FRAME_TOP_PT}pt`,
      '--su-antique-side': `${SU_ANTIQUE_FRAME_SIDE_PT}pt`,
      '--su-divider-pt': `${SU_ANTIQUE_DIVIDER_PT}pt`,
      '--su-bead-pt': `${SU_ANTIQUE_BEAD_PT}pt`,
      '--su-person-rule-pt': `${SU_ANTIQUE_PERSON_RULE_PT}pt`,
    }
    : props.showFrame
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
      'is-title-vertical': script === 'antique' && titleVertical,
      'is-modern-frame': script !== 'antique' && showFrame,
    }"
    :style="frameStyle"
  >
    <div class="su-stage" :class="{ 'su-frame': script === 'antique' }">
      <template v-if="script === 'antique'">
        <span class="su-rail su-col-line" :style="{ right: `calc(var(--su-pad-right) + ${antiqueRails.leftFromRight}mm)` }"></span>
        <span class="su-rail su-col-line" :style="{ right: `calc(var(--su-pad-right) + ${antiqueRails.rightFromRight}mm)` }"></span>
      </template>
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
  min-width: 297mm;
  height: 210mm;
  min-height: 210mm;
  flex-shrink: 0;
  padding: 8mm 8mm 12mm;
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
  min-width: 297mm;
  flex-shrink: 0;
}

.su-sheet.is-antique {
  background: #fff;
  color: #000;
  font-family: 'FangSong', 'STFangsong', 'FangSong_GB2312', 'Songti SC', 'SimSun', serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.su-frame {
  position: relative;
  box-sizing: border-box;
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
  --su-pad-right: 15mm;
  padding: 4mm var(--su-pad-right) 4mm 4mm;
  overflow: hidden;
  background: #fff;
  border-style: solid;
  border-color: #000;
  border-radius: 0;
  border-top-width: var(--su-antique-top, 4pt);
  border-bottom-width: var(--su-antique-top, 4pt);
  border-left-width: var(--su-antique-side, 2pt);
  border-right-width: var(--su-antique-side, 2pt);
}

/* 1x 屏幕把 4pt、2pt 取成 5px、2px，比例不再是 2:1。屏幕用最接近的整像素 6px/3px，打印与 PDF 仍是 4pt/2pt。 */
@media screen {
  .su-frame {
    border-top-width: 6px;
    border-bottom-width: 6px;
    border-left-width: 3px;
    border-right-width: 3px;
  }
}

.su-col-line {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 6;
  width: var(--su-divider-pt, 1pt);
  background: #000;
  transform: translateX(0.5pt);
  pointer-events: none;
}

.su-sheet.is-flow .su-frame {
  height: auto;
}

.su-sheet.is-antique .su-branch {
  position: relative;
}

.su-sheet.is-antique .su-branch + .su-branch {
  margin-top: 4mm;
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
  background: transparent;
}

.is-antique .su-foot {
  font-size: 8pt;
  font-weight: 400;
  letter-spacing: 0.12em;
}

.is-antique .su-title {
  position: relative;
  width: auto;
  max-height: none;
  margin: 0 0 3mm;
  overflow: hidden;
  writing-mode: horizontal-tb;
  text-orientation: mixed;
  text-align: right;
  letter-spacing: 0.12em;
  line-height: 1.15;
  font-size: 18pt;
  font-weight: 500;
  background: transparent;
  color: #000;
  border: 0;
}

.is-antique.is-title-vertical .su-title {
  position: absolute;
  top: 2mm;
  right: -12.4mm;
  bottom: 2mm;
  z-index: 5;
  width: 7.2mm;
  max-height: none;
  margin: 0;
  writing-mode: vertical-rl;
  text-orientation: upright;
  text-align: start;
  letter-spacing: 0.06em;
  line-height: 1;
  font-size: 18pt;
  font-weight: 500;
  background: transparent;
  border: 0;
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
