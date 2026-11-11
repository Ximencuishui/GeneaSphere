<script setup lang="ts">
/**
 * 欧谱的一张五世表。册谱和树谱共用，行传只在册谱格子里展开。
 */
import { computed } from 'vue';
import { EUROPEAN_GENERATIONS_PER_CHART, type EuropeanCell, type EuropeanChart } from '@/utils/european-chart';
import { biographyAnchorId } from '@/utils/biography-index';
import type { EuropeanPersonCaption } from '@/utils/european-chart-source';
import { formatLifeYears } from '@/utils/genealogy-card';
import { continueNoteMode, formatContinueNote, type ContinueNote, type ContinueNoteMode } from '@/utils/continue-note';

const props = withDefaults(defineProps<{
  chart: EuropeanChart;
  /** 同一页上的多张短图。不传时只画 chart 这一张。 */
  charts?: EuropeanChart[];
  chartIndex: number;
  captions?: Record<string, EuropeanPersonCaption>;
  selectedId?: string | number | null;
  variant?: 'canvas' | 'book';
  showTitle?: boolean;
  withAnchor?: boolean;
  pageNumber?: number;
  pageCount?: number;
  /** 册谱：表格矮于版心时，在版心内垂直居中。 */
  center?: boolean;
  /** horizontal 是横排简体（版本 A）。antique 是仿古竖排线装（版本 B）。 */
  script?: 'horizontal' | 'antique';
  /** 仿古时标题改为竖排居右。默认仍是横排居中。 */
  titleVertical?: boolean;
  chartPages?: Record<number, number>;
  continueNote?: ContinueNoteMode | null;
}>(), {
  variant: 'canvas',
  showTitle: true,
  withAnchor: true,
  center: false,
  script: 'horizontal',
  titleVertical: false,
  continueNote: null,
});

const emit = defineEmits<{
  (e: 'select', personId: string): void;
  (e: 'open-bio', payload: { personId: string; name: string; chartNo: number; citeBook?: '人物传' | '闺秀录' }): void;
}>();

const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

function chineseGeneration(generation: number): string {
  const value = Math.floor(generation);
  if (value <= 0) return String(generation);
  if (value < 10) return CN_DIGIT[value];
  if (value === 10) return '十';
  if (value < 20) return `十${CN_DIGIT[value - 10]}`;
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return `${CN_DIGIT[tens]}十${ones ? CN_DIGIT[ones] : ''}`;
  }
  return String(value);
}

function generationTitle(generation: number): string {
  return `第${chineseGeneration(generation)}世`;
}

function chartTitle(chart: EuropeanChart): string {
  const from = generationTitle(chart.generationFrom);
  const toGen = props.variant === 'book'
    ? chart.generationFrom + EUROPEAN_GENERATIONS_PER_CHART - 1
    : chart.generationTo;
  const to = generationTitle(toGen);
  const range = chart.generationFrom === toGen ? from : `${from}至${to}`;
  return `第${chart.index + 1}图 · ${range}`;
}

function columnsOf(chart: EuropeanChart): number[] {
  const count = props.variant === 'book'
    ? EUROPEAN_GENERATIONS_PER_CHART
    : Math.max(0, chart.generationTo - chart.generationFrom + 1);
  return Array.from({ length: count }, (_, index) => index);
}

function displayColumns(chart: EuropeanChart): number[] {
  const cols = columnsOf(chart);
  return props.variant === 'book' ? [...cols].reverse() : cols;
}

function rowsOf(chart: EuropeanChart): number[] {
  return Array.from({ length: Math.max(0, chart.rowCount) }, (_, index) => index);
}

const pageCharts = computed(() => (props.charts && props.charts.length ? props.charts : [props.chart]));

function cellAt(chart: EuropeanChart, col: number, row: number): EuropeanCell | undefined {
  return chart.cells.find((cell) => cell.col === col && cell.row === row);
}

function coveredBySpan(chart: EuropeanChart, col: number, row: number): boolean {
  return chart.cells.some((cell) => cell.col === col && cell.row < row && row < cell.row + cell.rowSpan);
}

function slotsFor(chart: EuropeanChart, row: number): Array<{ col: number; cell?: EuropeanCell }> {
  const slots: Array<{ col: number; cell?: EuropeanCell }> = [];
  for (const col of displayColumns(chart)) {
    const cell = cellAt(chart, col, row);
    if (cell) slots.push({ col, cell });
    else if (!coveredBySpan(chart, col, row)) slots.push({ col });
  }
  return slots;
}

function kinText(cell: EuropeanCell): string {
  return [spouseLine(cell), burialLine(cell)].filter(Boolean).join('');
}

function metaLines(cell: EuropeanCell): string[] {
  const caption = props.captions?.[cell.personId];
  const lines: string[] = [];
  if (cell.mark) lines.push(cell.mark);
  if (caption?.courtesyName) lines.push(`字${caption.courtesyName}`);
  if (caption?.artName) lines.push(`号${caption.artName}`);
  if (!caption?.courtesyName && !caption?.artName && caption?.generationWord) {
    lines.push(`${caption.generationWord.replace(/辈$/, '')}辈`);
  }
  const years = formatLifeYears(caption?.birthYear, caption?.deathYear, caption?.isLiving);
  if (years) lines.push(years);
  if (cell.spouseText) lines.push(cell.spouseText);
  if (caption?.burialPlace) lines.push(`葬${caption.burialPlace}`);
  return lines;
}

const RECORD_LIMIT = 16;

function courtesyText(cell: EuropeanCell): string {
  const caption = props.captions?.[cell.personId];
  const lines: string[] = [];
  if (cell.mark) lines.push(cell.mark);
  if (caption?.courtesyName) lines.push(`字${caption.courtesyName}`);
  if (caption?.artName) lines.push(`号${caption.artName}`);
  if (!caption?.courtesyName && !caption?.artName && caption?.generationWord) {
    lines.push(`${caption.generationWord.replace(/辈$/, '')}辈`);
  }
  return lines.join('');
}

function yearsText(cell: EuropeanCell): string {
  const caption = props.captions?.[cell.personId];
  return formatLifeYears(caption?.birthYear, caption?.deathYear, caption?.isLiving);
}

function spouseLine(cell: EuropeanCell): string {
  return cell.spouseText;
}

function burialLine(cell: EuropeanCell): string {
  const place = props.captions?.[cell.personId]?.burialPlace;
  return place ? `葬${place}` : '';
}

/** 行传只留简述，字号最小，排在字号、生卒、配葬之后。 */
function recordText(cell: EuropeanCell): string {
  const caption = props.captions?.[cell.personId];
  if (!caption || props.variant !== 'book') return '';
  const parts: string[] = [];
  if (caption.nativePlace) parts.push(`籍${caption.nativePlace}`);
  if (caption.offspring) parts.push(`子${caption.offspring}`);
  if (caption.achievements) parts.push(caption.achievements);
  if (caption.biography) parts.push(caption.biography);
  if (caption.anecdotes) parts.push(caption.anecdotes);
  if (caption.adoptionNote) parts.push(caption.adoptionNote);
  const text = parts.join('。').replace(/。{2,}/g, '。');
  if (text.length <= RECORD_LIMIT) return text;
  return `${text.slice(0, RECORD_LIMIT)}…`;
}

function xrefLabel(cell: EuropeanCell, chart: EuropeanChart): string {
  if (props.variant !== 'book') return '';
  const biography = props.captions?.[cell.personId]?.biography;
  if (!biography?.trim()) return '';
  const book = props.captions?.[cell.personId]?.citeBook === '闺秀录' ? '闺秀录' : '人物传';
  return `详见${book}·第${chart.index + 1}图｜${cell.name}`;
}

function openBiography(cell: EuropeanCell, chart: EuropeanChart) {
  const chartNo = chart.index + 1;
  emit('open-bio', {
    personId: cell.personId,
    name: cell.name,
    chartNo,
    citeBook: props.captions?.[cell.personId]?.citeBook === '闺秀录' ? '闺秀录' : '人物传',
  });
}

function continueNotes(cell: EuropeanCell) {
  const mode = continueNoteMode(props.continueNote, props.script);
  const notes: ContinueNote[] = [];
  for (const chartNo of cell.cutChartNos ?? []) notes.push({ kind: 'cut', chartNo, pageNo: props.chartPages?.[chartNo] ?? null });
  const resumeNo = cell.resumeChartNo ?? null;
  if (resumeNo) {
    notes.push({
      kind: 'resume',
      chartNo: resumeNo,
      pageNo: props.chartPages?.[resumeNo] ?? null,
      fatherName: cell.resumeFatherName || cell.parentName || cell.name,
    });
  }
  return notes.map((note) => ({ ...formatContinueNote(note, mode), href: `#tree-${note.chartNo}` }));
}

function linePieces(line: string): Array<{ text: string; kind: 'text' | 'num' | 'dash' }> {
  const pieces: Array<{ text: string; kind: 'text' | 'num' | 'dash' }> = [];
  const matcher = /(\d+|-)/g;
  let cursor = 0;
  for (const match of line.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > cursor) pieces.push({ text: line.slice(cursor, index), kind: 'text' });
    const token = match[1] ?? '';
    pieces.push({ text: token, kind: token.includes('-') ? 'dash' : 'num' });
    cursor = index + token.length;
  }
  if (cursor < line.length) pieces.push({ text: line.slice(cursor), kind: 'text' });
  if (pieces.length === 0 && line) pieces.push({ text: line, kind: 'text' });
  return pieces;
}

function isSelected(personId: string): boolean {
  return props.selectedId != null && String(props.selectedId) === personId;
}

function anchorId(cell: EuropeanCell): string | undefined {
  if (!props.withAnchor || props.variant !== 'book' || cell.role === 'carried-in') return undefined;
  return `shilu-${cell.personId}`;
}
</script>

<template>
  <section
    class="ou-sheet"
    :class="{
      'is-book': variant === 'book',
      'is-even': variant === 'book' && !!pageNumber && pageNumber % 2 === 0,
      'is-centered': variant === 'book' && center,
      'is-antique': variant === 'book' && script === 'antique',
      'is-title-vertical': variant === 'book' && script === 'antique' && titleVertical,
    }"
    :data-chart-index="chartIndex"
  >
    <template v-if="pageCharts.length === 1">
      <a v-if="variant === 'book'" :id="`tree-${pageCharts[0].index + 1}`" class="ou-tree-anchor"></a>
      <h2 v-if="showTitle" class="ou-sheet-title">{{ chartTitle(pageCharts[0]) }}</h2>
    </template>
    <div class="ou-stage">
    <div v-for="sheet in pageCharts" :key="`${sheet.index}-${sheet.generationFrom}`" class="ou-block">
    <template v-if="pageCharts.length > 1">
      <a v-if="variant === 'book'" :id="`tree-${sheet.index + 1}`" class="ou-tree-anchor"></a>
      <h2 v-if="showTitle" class="ou-sheet-title">{{ chartTitle(sheet) }}</h2>
    </template>
    <div class="ou-frame">
      <table class="ou-table">
        <thead>
          <tr>
            <th v-for="col in displayColumns(sheet)" :key="col" scope="col">
              {{ generationTitle(sheet.generationFrom + col) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rowsOf(sheet)" :key="row">
            <template v-for="entry in slotsFor(sheet, row)" :key="entry.col">
              <td
                v-if="entry.cell"
                :rowspan="entry.cell.rowSpan"
                :class="{
                  'is-selected': isSelected(entry.cell.personId),
                  'is-carried-in': entry.cell.role === 'carried-in',
                  'is-carried-out': entry.cell.role === 'carried-out',
                  'is-root-gen': variant === 'book' && entry.cell.col === 0,
                }"
              >
                <component
                  :is="variant === 'book' ? 'div' : 'button'"
                  :type="variant === 'book' ? undefined : 'button'"
                  class="ou-person"
                  :class="{ 'is-span': entry.cell.rowSpan > 1 }"
                  :id="anchorId(entry.cell)"
                  :data-person-id="entry.cell.personId"
                  @click="emit('select', entry.cell.personId)"
                >
                  <span v-if="variant === 'book' && script === 'antique'" class="ou-flow ou-flow-antique">
                    <span class="ou-name">{{ entry.cell.name }}</span>
                    <span v-if="courtesyText(entry.cell)" class="ou-courtesy">{{ courtesyText(entry.cell) }}</span>
                    <span v-if="yearsText(entry.cell)" class="ou-years">{{ yearsText(entry.cell) }}</span>
                    <span v-if="kinText(entry.cell)" class="ou-kin">{{ kinText(entry.cell) }}</span>
                    <span v-if="recordText(entry.cell)" class="ou-bio">{{ recordText(entry.cell) }}</span>
                    <span v-if="continueNotes(entry.cell).length" class="ou-seam" @click.stop>
                      <span v-for="(note, noteIndex) in continueNotes(entry.cell)" :key="noteIndex">
                        {{ note.lead }}<a class="ou-continue-link" :href="note.href">{{ note.linkText }}</a>{{ note.tail }}
                      </span>
                    </span>
                    <a
                      v-if="xrefLabel(entry.cell, sheet)"
                      class="ou-jump"
                      :href="`#${biographyAnchorId(entry.cell.name, sheet.index + 1)}`"
                      :title="`跳转到人物传：${entry.cell.name}，第${sheet.index + 1}图`"
                      @click.stop.prevent="openBiography(entry.cell, sheet)"
                    >{{ xrefLabel(entry.cell, sheet) }}</a>
                  </span>
                  <span v-else class="ou-flow">
                    <span class="ou-name">{{ entry.cell.name }}</span>
                    <template v-if="variant === 'book'">
                      <span v-if="yearsText(entry.cell)" class="ou-years"><template v-for="(piece, pieceIndex) in linePieces(yearsText(entry.cell))" :key="pieceIndex"><span v-if="piece.kind === 'num'" class="ou-num">{{ piece.text }}</span><span v-else-if="piece.kind === 'dash'" class="ou-dash">{{ piece.text }}</span><span v-else>{{ piece.text }}</span></template></span>
                      <span v-if="spouseLine(entry.cell)" class="ou-kin">{{ spouseLine(entry.cell) }}</span>
                      <span v-if="burialLine(entry.cell)" class="ou-kin">{{ burialLine(entry.cell) }}</span>
                      <span v-if="courtesyText(entry.cell)" class="ou-courtesy">{{ courtesyText(entry.cell) }}</span>
                      <span v-if="recordText(entry.cell)" class="ou-bio">{{ recordText(entry.cell) }}</span>
                      <span v-if="continueNotes(entry.cell).length" class="ou-seam" @click.stop>
                        <span v-for="(note, noteIndex) in continueNotes(entry.cell)" :key="noteIndex">
                          {{ note.lead }}<a class="ou-continue-link" :href="note.href">{{ note.linkText }}</a>{{ note.tail }}
                        </span>
                      </span>
                      <a
                        v-if="xrefLabel(entry.cell, sheet)"
                        class="ou-jump"
                        :href="`#${biographyAnchorId(entry.cell.name, sheet.index + 1)}`"
                        :title="`跳转到人物传：${entry.cell.name}，第${sheet.index + 1}图`"
                        @click.stop.prevent="openBiography(entry.cell, sheet)"
                      >{{ xrefLabel(entry.cell, sheet) }}</a>
                    </template>
                    <span v-else-if="metaLines(entry.cell).length" class="ou-notes">
                      <span
                        v-for="(line, lineIndex) in metaLines(entry.cell)"
                        :key="lineIndex"
                        class="ou-meta"
                      ><template v-for="(piece, pieceIndex) in linePieces(line)" :key="pieceIndex"><span v-if="piece.kind === 'num'" class="ou-num">{{ piece.text }}</span><span v-else-if="piece.kind === 'dash'" class="ou-dash">{{ piece.text }}</span><span v-else>{{ piece.text }}</span></template></span>
                    </span>
                    <span v-if="variant !== 'book' && continueNotes(entry.cell).length" class="ou-seam" @click.stop>
                      <span v-for="(note, noteIndex) in continueNotes(entry.cell)" :key="noteIndex">
                        {{ note.lead }}<a class="ou-continue-link" :href="note.href">{{ note.linkText }}</a>{{ note.tail }}
                      </span>
                    </span>
                  </span>
                </component>
              </td>
              <td v-else class="ou-blank" />
            </template>
          </tr>
        </tbody>
      </table>
    </div>
    </div>
    </div>
    <p v-if="variant === 'book' && pageNumber && pageCount" class="ou-sheet-foot">第 {{ pageNumber }} 页 / 共 {{ pageCount }} 页</p>
  </section>
</template>

<style scoped>
.ou-sheet {
  width: max-content;
  max-width: 100%;
  margin: 0 auto 28px;
}

.ou-sheet-title {
  margin: 0 0 10px;
  text-align: center;
  font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.42em;
  color: #2a241c;
}

.ou-frame {
  border: 3px solid #141414;
  background: #fbf7ee;
  box-shadow:
    0 0 0 1px #fbf7ee,
    0 0 0 2px #141414;
}

.ou-table {
  border-collapse: collapse;
  border-spacing: 0;
  font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
  color: #1a1a1a;
}

.ou-table th,
.ou-table td {
  border: 1px solid #3a3a3a;
  text-align: center;
  vertical-align: middle;
  background: #fbf7ee;
}

.ou-table th {
  padding: 8px 18px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.38em;
  background: #f1e6cf;
  white-space: nowrap;
}

.ou-table td {
  position: relative;
  padding: 0;
  min-width: 64px;
  vertical-align: top;
}

.ou-table td.is-selected {
  background: #fff4cc;
  box-shadow: inset 0 0 0 2px #8a6416;
}

.ou-table td.is-carried-in {
  background: #f7f1e4;
}

.ou-table tbody tr {
  height: 128px;
}

.ou-blank {
  min-height: 128px;
}

.ou-person {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  width: 100%;
  min-height: 108px;
  margin: 0;
  padding: 16px 8px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  cursor: pointer;
  box-sizing: border-box;
}

.ou-person.is-span {
  position: absolute;
  inset: 0;
  width: auto;
  min-height: 0;
  padding: 22px 8px 18px;
}

.ou-flow {
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-start;
  justify-content: center;
  gap: 6px;
  max-width: 100%;
}

.ou-person.is-span .ou-flow {
  flex: 0 0 auto;
  gap: 8px;
}

.ou-person:hover {
  background: rgba(138, 100, 22, 0.06);
}

.ou-person:focus-visible {
  outline: 2px solid #8a6416;
  outline-offset: -3px;
}

.ou-name,
.ou-notes {
  writing-mode: vertical-rl;
  text-orientation: upright;
  flex: 0 0 auto;
  white-space: nowrap;
}

.ou-name {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.22em;
  line-height: 1.05;
  color: #141414;
}

.ou-person.is-span .ou-name {
  letter-spacing: 0.28em;
}

.ou-notes {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.15;
  letter-spacing: 0.06em;
  color: #9a9186;
}

.ou-person.is-span .ou-notes {
  letter-spacing: 0.1em;
}

.ou-meta {
  margin-inline: 0.12em;
}

.ou-num,
.ou-dash {
  writing-mode: horizontal-tb;
  text-orientation: mixed;
  text-combine-upright: none;
  display: inline-block;
  letter-spacing: 0;
  line-height: 1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.ou-seam {
  writing-mode: horizontal-tb;
  flex: 0 0 auto;
  align-self: center;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: #8a3b2a;
}

.is-book.ou-sheet {
  position: relative;
  width: 210mm;
  height: 297mm;
  margin: 0;
  /* 奇数页：装订在左。天头 30，地脚 25，内边 20，外边 15。 */
  padding: 30mm 15mm 25mm 20mm;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: #fff;
  box-shadow: 0 10px 24px rgba(40, 32, 18, 0.12);
  overflow: hidden;
  break-after: page;
  page-break-after: always;
  break-inside: avoid;
  page-break-inside: avoid;
}

.is-book.ou-sheet.is-even {
  padding: 30mm 20mm 25mm 15mm;
}

.is-book .ou-stage {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
}

.is-book .ou-block {
  flex: 0 0 auto;
  width: 100%;
  padding: 4mm 0;
  box-sizing: border-box;
}

.is-book.is-centered .ou-block {
  margin-top: auto;
  margin-bottom: auto;
}

.is-book .ou-tree-anchor {
  display: block;
  width: 0;
  height: 0;
  overflow: hidden;
}

.is-book .ou-sheet-title {
  flex: none;
  margin: 0;
  font-family: 'Songti SC', 'STSong', 'Source Han Serif SC', 'Noto Serif SC', serif;
  font-size: 16px;
  letter-spacing: 0.28em;
}

.is-book .ou-sheet-foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8mm;
  margin: 0;
  text-align: center;
  font-family: 'Songti SC', 'STSong', 'Source Han Serif SC', 'Noto Serif SC', serif;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: #6d6458;
}

.is-book .ou-frame {
  flex: 0 0 auto;
  width: 100%;
  border-width: 2px;
  box-shadow: none;
  background: #fff;
}

.is-book .ou-table {
  width: 100%;
  table-layout: fixed;
  background: #fff;
  font-family: 'Songti SC', 'STSong', 'Source Han Serif SC', 'Noto Serif SC', serif;
}

.is-book .ou-table th,
.is-book .ou-table td {
  min-width: 0;
  background: #fff;
  border-color: #222;
  vertical-align: top;
}

.is-book .ou-table th {
  background: #f4f1e8;
  font-size: 15px;
  letter-spacing: 0.12em;
  padding: 6px 4px;
  text-align: center;
  writing-mode: horizontal-tb;
}

.is-book .ou-table td.is-root-gen,
.is-book .ou-table td.is-root-gen .ou-person {
  background: #f6efd8;
}

.is-book .ou-table tbody tr {
  height: auto;
}

.is-book .ou-blank {
  min-height: 0;
}

.is-book .ou-person,
.is-book .ou-person.is-span {
  position: relative;
  inset: auto;
  width: 100%;
  height: auto;
  min-height: 0;
  min-width: 0;
  padding: 14px 4px 8px;
}

.is-book .ou-flow,
.is-book .ou-person.is-span .ou-flow {
  display: flex;
  flex-direction: column;
  direction: ltr;
  align-items: stretch;
  justify-content: flex-start;
  gap: 2px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.is-book .ou-name,
.is-book .ou-courtesy,
.is-book .ou-years,
.is-book .ou-kin,
.is-book .ou-bio,
.is-book .ou-xref,
.is-book a.ou-jump {
  writing-mode: horizontal-tb;
  text-orientation: mixed;
  direction: ltr;
  width: 100%;
  max-width: 100%;
  text-align: right;
  white-space: normal;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.is-book .ou-name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #111;
  white-space: nowrap;
  word-break: keep-all;
}

.is-book .ou-courtesy {
  font-size: 13px;
  font-weight: 600;
  color: #222;
}

.is-book .ou-years {
  font-size: 12px;
  color: #333;
}

.is-book .ou-kin {
  font-size: 11px;
  color: #444;
}

.is-book .ou-bio {
  font-size: 10px;
  font-weight: 400;
  line-height: 1.4;
  letter-spacing: 0;
  color: #555;
}

.is-book .ou-xref {
  font-size: 10px;
  font-weight: 400;
  line-height: 1.4;
  letter-spacing: 0;
  color: #888;
}

.is-book a.ou-jump {
  color: #1a56c4;
  font-size: 10px;
  font-weight: 400;
  line-height: 1.4;
  text-decoration: underline;
  cursor: pointer;
}

@media print {
  .is-book a.ou-jump {
    color: #888;
    text-decoration: none;
  }
}

.is-book .ou-seam {
  position: static;
  display: block;
  margin-top: 1mm;
  align-self: auto;
  color: #c0392b;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.35;
  writing-mode: horizontal-tb;
}

.is-book .ou-continue-link {
  color: #c0392b;
  text-decoration: underline;
}

.is-book.is-antique,
.is-book.is-antique .ou-table,
.is-book.is-antique .ou-sheet-title,
.is-book.is-antique .ou-sheet-foot {
  font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
}

.is-book.is-antique .ou-sheet-title {
  font-size: 18px;
}

.is-book.is-antique.is-title-vertical .ou-sheet-title {
  writing-mode: vertical-rl;
  text-orientation: upright;
  width: max-content;
  margin-left: auto;
  margin-right: 0;
  text-align: start;
  letter-spacing: 0.22em;
}

.is-book.is-antique .ou-table th {
  writing-mode: vertical-rl;
  text-orientation: upright;
  height: 64px;
  letter-spacing: 0.18em;
}

.is-book.is-antique .ou-flow,
.is-book.is-antique .ou-person.is-span .ou-flow {
  flex-direction: row-reverse;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 3px;
  width: auto;
  max-width: 100%;
  height: 100%;
}

.is-book.is-antique .ou-name,
.is-book.is-antique .ou-courtesy,
.is-book.is-antique .ou-years,
.is-book.is-antique .ou-kin,
.is-book.is-antique .ou-bio,
.is-book.is-antique .ou-xref,
.is-book.is-antique a.ou-jump {
  writing-mode: vertical-rl;
  text-orientation: upright;
  direction: ltr;
  width: auto;
  max-width: none;
  text-align: start;
  word-break: keep-all;
}

.is-book.is-antique .ou-name {
  font-size: 18px;
  white-space: nowrap;
}

.is-book.is-antique .ou-courtesy { font-size: 13px; }
.is-book.is-antique .ou-years { font-size: 12px; }
.is-book.is-antique .ou-kin { font-size: 11px; }

.is-book.is-antique .ou-courtesy,
.is-book.is-antique .ou-years,
.is-book.is-antique .ou-kin,
.is-book.is-antique .ou-bio,
.is-book.is-antique .ou-xref,
.is-book.is-antique a.ou-jump {
  white-space: normal;
  max-height: 100%;
}

.is-book.is-antique .ou-bio,
.is-book.is-antique .ou-xref,
.is-book.is-antique a.ou-jump {
  font-size: 10px;
}

.is-book.is-antique .ou-seam {
  writing-mode: horizontal-tb;
  text-orientation: mixed;
}

.is-book.is-antique .ou-sheet-foot {
  writing-mode: horizontal-tb;
}

.is-book.is-antique .ou-blank {
  color: transparent;
}
</style>
