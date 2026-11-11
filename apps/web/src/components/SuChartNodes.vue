<script setup lang="ts">
/**
 * 苏式垂珠的一板。
 * 版本A：文字横排在线右，兄弟横线贴在诸子圆圈下沿。
 * 版本B：文字竖排在线左，只留各支向下的垂线，不画兄弟横线，也不画斜线。
 * 珠圈圆心落在垂线节点上。关掉垂珠时只拿掉竖线和圆圈，板位与文字不动。
 */
import { computed, ref } from 'vue';
import {
  placeSuChart,
  type SuAntiqueMeasure,
  type SuBeadNode,
  type SuChart,
  type SuGenerationBand,
  type SuPlacedPerson,
  type SuRule,
} from '@/utils/su-chart';
import type { EuropeanPersonCaption } from '@/utils/european-chart-source';
import { formatLifeYears } from '@/utils/genealogy-card';
import { continueNoteMode, formatContinueNote, type ContinueNote, type ContinueNoteMode } from '@/utils/continue-note';
import { chartPortraitUrl } from '@/utils/chart-portrait';

const props = withDefaults(defineProps<{
  nodes: SuBeadNode[];
  beadLines?: boolean;
  antique?: boolean;
  captions?: Record<string, EuropeanPersonCaption>;
  selectedId?: string | number | null;
  chart: SuChart;
  /** 图号 → 页码。新式详注用来补「第Y页」。 */
  chartPages?: Record<number, number>;
  continueNote?: ContinueNoteMode | null;
  /** 版本A才画头像。仿古版即使传入也不渲染。 */
  showAvatars?: boolean;
}>(), {
  beadLines: false,
  antique: false,
  continueNote: null,
  showAvatars: true,
});

const emit = defineEmits<{
  (e: 'select', personId: string): void;
  (e: 'open-bio', payload: { personId: string; name: string; chartNo: number; citeBook?: '人物传' | '闺秀录'; anchorId: string }): void;
}>();

const BRIEF_LIMIT = 18;

const place = computed(() => {
  if (!props.antique) return placeSuChart(props.nodes, 'horizontal');
  const measures: SuAntiqueMeasure[] = [];
  const visit = (node: SuBeadNode) => {
    measures.push({ index: node.index, chars: antiqueCharCount(node) });
    node.children.forEach(visit);
  };
  props.nodes.forEach(visit);
  return placeSuChart(props.nodes, 'antique', measures);
});
const noteMode = computed(() => continueNoteMode(props.continueNote, props.antique ? 'antique' : 'horizontal'));
const hiddenPortraits = ref(new Set<string>());

function portraitUrl(node: SuBeadNode): string {
  if (props.antique || props.showAvatars === false) return '';
  if (hiddenPortraits.value.has(node.block.personId)) return '';
  return chartPortraitUrl(props.captions?.[node.block.personId]?.avatarUrl);
}

function hidePortrait(personId: string) {
  const next = new Set(hiddenPortraits.value);
  next.add(personId);
  hiddenPortraits.value = next;
}
const byIndex = computed(() => {
  const map = new Map<number, SuBeadNode>();
  const visit = (node: SuBeadNode) => {
    map.set(node.index, node);
    node.children.forEach(visit);
  };
  props.nodes.forEach(visit);
  return map;
});

function nodeOf(index: number): SuBeadNode | undefined {
  return byIndex.value.get(index);
}

function plateStyle(): Record<string, string> {
  return {
    width: `${place.value.width}mm`,
    height: `${place.value.height}mm`,
    writingMode: 'horizontal-tb',
  };
}

function personStyle(person: SuPlacedPerson): Record<string, string> {
  const style: Record<string, string> = {
    left: `${person.textX}mm`,
    top: `${person.textY}mm`,
    width: `${person.textW}mm`,
    height: `${person.textH}mm`,
    writingMode: props.antique ? 'vertical-rl' : 'horizontal-tb',
    textOrientation: props.antique ? 'upright' : 'mixed',
  };
  if (!props.antique) return style;
  style.background = 'transparent';
  style.color = '#000';
  style.border = '0';
  style.boxShadow = 'none';
  if (person.textScale < 0.999) style['--su-fit'] = String(person.textScale);
  return style;
}

function ruleStyle(rule: SuRule): Record<string, string> {
  if (rule.axis === 'h') {
    return { left: `${rule.x}mm`, top: `${rule.y}mm`, width: `${rule.length}mm` };
  }
  return { left: `${rule.x}mm`, top: `${rule.y}mm`, height: `${rule.length}mm` };
}

function beadStyle(mark: { x: number; y: number }): Record<string, string> {
  return { left: `${mark.x}mm`, top: `${mark.y}mm` };
}

function bandStyle(y: number): Record<string, string> {
  return { top: `${y}mm` };
}

function genStyle(band: SuGenerationBand): Record<string, string> {
  const style: Record<string, string> = {
    left: `${band.x}mm`,
    top: `${band.y}mm`,
    width: `${band.w}mm`,
    height: `${band.h}mm`,
    writingMode: band.boxed ? 'vertical-rl' : 'horizontal-tb',
    textOrientation: band.boxed ? 'upright' : 'mixed',
  };
  if (!band.boxed) return style;
  style.background = '#000';
  style.color = '#fff';
  style.border = '0';
  style.borderRadius = '0';
  style.boxShadow = 'none';
  style.outline = 'none';
  return style;
}

function antiqueCharCount(node: SuBeadNode): number {
  const fields = antiqueFields(node).reduce((sum, field) => sum + field.length, 0);
  const notes = personNotes(node).reduce((sum, note) => sum + note.text.length, 0);
  const bio = hasBiography(node) ? 5 : 0;
  return Math.max(1, node.block.name.length + fields + notes + bio);
}

function personNotes(node: SuBeadNode): Array<ReturnType<typeof formatContinueNote> & { href: string }> {
  const block = node.block;
  const notes: ContinueNote[] = [];
  for (const chartNo of block.cutChartNos ?? []) {
    notes.push({ kind: 'cut', chartNo, pageNo: props.chartPages?.[chartNo] ?? null });
  }
  if (block.resumeChartNo) {
    notes.push({
      kind: 'resume',
      chartNo: block.resumeChartNo,
      pageNo: props.chartPages?.[block.resumeChartNo] ?? null,
      fatherName: block.resumeFatherName || block.parentName || block.name,
    });
  }
  return notes.map((note) => ({
    ...formatContinueNote(note, noteMode.value),
    href: `#tree-su-${note.chartNo}`,
  }));
}

function courtesyText(node: SuBeadNode): string {
  const caption = props.captions?.[node.block.personId];
  const parts: string[] = [];
  if (caption?.courtesyName) parts.push(`字${caption.courtesyName}`);
  if (caption?.artName) parts.push(`号${caption.artName}`);
  return parts.join('，');
}

function antiqueFields(node: SuBeadNode): string[] {
  const caption = props.captions?.[node.block.personId];
  const fields: string[] = [];
  if (caption?.courtesyName) fields.push(`字${caption.courtesyName}`);
  if (caption?.artName) fields.push(`号${caption.artName}`);
  const years = yearsText(node);
  if (years) fields.push(years);
  if (node.block.spouseText) fields.push(node.block.spouseText);
  const burial = burialText(node);
  if (burial) fields.push(burial);
  if (node.block.mark) fields.push(node.block.mark);
  return fields;
}

function yearsText(node: SuBeadNode): string {
  const caption = props.captions?.[node.block.personId];
  return formatLifeYears(caption?.birthYear, caption?.deathYear, caption?.isLiving);
}

function burialText(node: SuBeadNode): string {
  const placeName = props.captions?.[node.block.personId]?.burialPlace;
  return placeName ? `葬${placeName}` : '';
}

function briefText(node: SuBeadNode): string {
  const text = props.captions?.[node.block.personId]?.achievements?.trim() || '';
  if (!text) return '';
  return text.length <= BRIEF_LIMIT ? text : `${text.slice(0, BRIEF_LIMIT)}…`;
}

function hasBiography(node: SuBeadNode): boolean {
  return Boolean(props.captions?.[node.block.personId]?.biography?.trim());
}

function citeBook(node: SuBeadNode): '人物传' | '闺秀录' {
  return props.captions?.[node.block.personId]?.citeBook === '闺秀录' ? '闺秀录' : '人物传';
}

function bioAnchor(node: SuBeadNode): string {
  return `bio-su-${node.block.name.trim()}-${props.chart.index + 1}`;
}

function blockAnchor(node: SuBeadNode): string | undefined {
  if (node.block.role === 'carried-in' || node.block.role === 'bridge') return undefined;
  return `shilu-${node.block.personId}`;
}

function openBiography(node: SuBeadNode) {
  emit('open-bio', {
    personId: node.block.personId,
    name: node.block.name,
    chartNo: props.chart.index + 1,
    citeBook: citeBook(node),
    anchorId: bioAnchor(node),
  });
}

function isSelected(personId: string): boolean {
  return props.selectedId != null && String(props.selectedId) === personId;
}
</script>

<template>
  <div
    class="su-plate"
    :class="{ 'is-antique': antique, 'is-beads': beadLines }"
    :data-reading="place.reading"
    :style="plateStyle()"
  >
    <span
      v-for="line in place.underlines"
      :key="`ul-${line.index}`"
      class="su-person-rule"
      :style="{ left: `${line.x}mm`, top: `${line.y}mm`, width: `${line.w}mm` }"
    ></span>
    <span
      v-for="y in place.bands"
      :key="`band-${y}`"
      class="su-band"
      :style="bandStyle(y)"
    ></span>
    <div
      v-for="band in place.generations"
      :key="`gen-${band.row}`"
      class="su-gen"
      :class="{ 'is-boxed': band.boxed }"
      :style="genStyle(band)"
    ><span class="su-gen-label">{{ band.label }}</span></div>
    <template v-if="beadLines">
      <span
        v-for="(rule, ruleIndex) in place.lines"
        :key="`line-${rule.parentId}-${rule.axis}-${ruleIndex}`"
        class="su-rule"
        :class="rule.axis === 'h' ? 'is-h' : 'is-v'"
        :data-parent-id="rule.parentId"
        :style="ruleStyle(rule)"
      ></span>
      <span
        v-for="bead in place.beads"
        :key="`bead-${bead.index}`"
        class="su-bead"
        :data-person-id="bead.personId"
        :style="beadStyle(bead)"
      ></span>
    </template>
    <article
      v-for="person in place.people"
      :key="`${person.index}-${person.personId}`"
      class="su-person"
      :class="{
        'is-selected': isSelected(person.personId),
        'is-head': person.row === 0,
      }"
      :id="nodeOf(person.index) ? blockAnchor(nodeOf(person.index)!) : undefined"
      :data-person-id="person.personId"
      :data-col="person.col"
      :data-row="person.row"
      :data-depth="nodeOf(person.index)?.block.depth"
      :style="personStyle(person)"
      @click="emit('select', person.personId)"
    >
      <template v-if="nodeOf(person.index)">
        <div v-if="antique" class="su-vrun">
          <span class="su-name">{{ nodeOf(person.index)!.block.name }}</span>
          <span v-for="(field, fieldIndex) in antiqueFields(nodeOf(person.index)!)" :key="fieldIndex" class="su-meta">{{ field }}</span>
          <span v-if="personNotes(nodeOf(person.index)!).length" class="su-seam">
            <span v-for="(note, noteIndex) in personNotes(nodeOf(person.index)!)" :key="noteIndex" class="su-continue">
              {{ note.lead }}<a class="su-continue-link" :href="note.href" @click.stop>{{ note.linkText }}</a>{{ note.tail }}
            </span>
          </span>
          <a
            v-if="hasBiography(nodeOf(person.index)!)"
            class="su-jump"
            :href="`#${bioAnchor(nodeOf(person.index)!)}`"
            :title="`跳转到${citeBook(nodeOf(person.index)!)}：${nodeOf(person.index)!.block.name}`"
            @click.stop.prevent="openBiography(nodeOf(person.index)!)"
          >详见人物传</a>
        </div>
        <div v-else class="su-body">
          <div class="su-name-row">
            <img
              v-if="portraitUrl(nodeOf(person.index)!)"
              class="su-avatar"
              :src="portraitUrl(nodeOf(person.index)!)"
              alt=""
              @error="hidePortrait(nodeOf(person.index)!.block.personId)"
              @click.stop
            />
            <span class="su-name">{{ nodeOf(person.index)!.block.name }}</span>
            <span v-if="courtesyText(nodeOf(person.index)!)" class="su-courtesy">（{{ courtesyText(nodeOf(person.index)!) }}）</span>
          </div>
          <p v-if="yearsText(nodeOf(person.index)!)" class="su-years">{{ yearsText(nodeOf(person.index)!) }}</p>
          <p v-if="nodeOf(person.index)!.block.spouseText" class="su-kin">{{ nodeOf(person.index)!.block.spouseText }}</p>
          <p v-if="burialText(nodeOf(person.index)!)" class="su-kin">{{ burialText(nodeOf(person.index)!) }}</p>
          <p v-if="nodeOf(person.index)!.block.mark" class="su-mark">{{ nodeOf(person.index)!.block.mark }}</p>
          <p v-if="briefText(nodeOf(person.index)!)" class="su-brief">{{ briefText(nodeOf(person.index)!) }}</p>
          <p v-if="personNotes(nodeOf(person.index)!).length" class="su-seam">
            <span v-for="(note, noteIndex) in personNotes(nodeOf(person.index)!)" :key="noteIndex" class="su-continue">
              {{ note.lead }}<a class="su-continue-link" :href="note.href" @click.stop>{{ note.linkText }}</a>{{ note.tail }}
            </span>
          </p>
          <a
            v-if="hasBiography(nodeOf(person.index)!)"
            class="su-jump"
            :href="`#${bioAnchor(nodeOf(person.index)!)}`"
            :title="`跳转到${citeBook(nodeOf(person.index)!)}：${nodeOf(person.index)!.block.name}`"
            @click.stop.prevent="openBiography(nodeOf(person.index)!)"
          >详见人物传</a>
        </div>
      </template>
    </article>
  </div>
</template>

<style scoped>
.su-plate {
  position: relative;
  margin: 0 auto;
  color: #1a1a1a;
  font-family: 'Songti SC', 'STSong', 'Source Han Serif SC', 'Noto Serif SC', serif;
}

.su-plate.is-antique {
  margin-right: 0;
  margin-left: auto;
  border: none;
  background: transparent;
  color: #000;
  font-family: 'FangSong', 'STFangsong', 'FangSong_GB2312', 'Songti SC', 'SimSun', serif;
}

.su-rail {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 1;
  width: var(--su-divider-pt, 1pt);
  background: #000;
  pointer-events: none;
}

.su-person-rule {
  position: absolute;
  z-index: 1;
  height: var(--su-person-rule-pt, 0.5pt);
  border: 0;
  background: #000;
  pointer-events: none;
}

.su-band {
  position: absolute;
  left: 0;
  right: 14mm;
  z-index: 1;
  height: 0;
  border-top: 0.8pt solid #000;
  pointer-events: none;
}

.su-plate.is-antique .su-band {
  left: auto;
  right: 20mm;
  width: 4mm;
}

.su-gen {
  position: absolute;
  z-index: 3;
  overflow: hidden;
  color: #5c564c;
  font-size: 11px;
  line-height: 1.2;
  letter-spacing: 0.06em;
  pointer-events: none;
}

.su-gen.is-boxed {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0;
  outline: none;
  box-shadow: none;
  background: #000;
  color: #fff;
  font-size: 8pt;
  font-weight: 500;
  line-height: 1.05;
  letter-spacing: 0.02em;
  text-align: center;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.su-gen.is-boxed .su-gen-label {
  margin: auto;
  background: transparent;
  color: #fff;
}

.su-rule {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  background: #000;
}

.su-rule.is-v {
  width: var(--su-bead-pt, 1pt);
  transform: translateX(-0.5pt);
}

.su-plate.is-antique .su-rule.is-v {
  width: var(--su-bead-pt, 1pt);
  transform: translateX(-0.5pt);
}

.su-rule.is-h {
  height: 0.4pt;
  transform: translateY(-0.2pt);
}

.su-bead {
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
  width: 2.4mm;
  height: 2.4mm;
  margin-left: -1.2mm;
  margin-top: -1.2mm;
  border: var(--su-bead-pt, 1pt) solid #000;
  border-radius: 50%;
  background: #fff;
  pointer-events: none;
}

.su-plate.is-antique .su-bead {
  border-width: var(--su-bead-pt, 1pt);
}

.su-person .su-seam {
  position: static;
  z-index: 3;
  display: block;
  margin: 0.4mm 0 0;
  width: auto;
  height: auto;
  overflow: visible;
  color: #c0392b;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0.02em;
  white-space: normal;
}

.su-plate.is-antique .su-vrun .su-seam,
.su-plate.is-antique .su-continue,
.su-plate.is-antique .su-continue-link,
.su-plate.is-antique .su-jump,
.su-plate.is-antique .su-meta,
.su-plate.is-antique .su-name {
  display: inline;
  background: transparent;
  box-shadow: none;
}

.su-continue {
  display: block;
}

.su-continue-link {
  color: #c0392b;
  text-decoration: underline;
}

.su-seam-legacy {
  position: absolute;
  z-index: 4;
  overflow: hidden;
  color: #c0392b;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.04em;
  pointer-events: none;
}

.su-seam.is-off {
  letter-spacing: 0;
  white-space: nowrap;
}

.su-person {
  position: absolute;
  z-index: 4;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
  border: 0;
  box-shadow: none;
  cursor: pointer;
}

.su-person.is-selected .su-name {
  color: #8a6416;
}

.su-vrun {
  margin: 0;
  line-height: 1.15;
}

.su-name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
}

.su-avatar {
  flex: 0 0 auto;
  width: 6.4mm;
  height: 6.4mm;
  margin: 0 1.2mm 0 0;
  border-radius: 50%;
  object-fit: cover;
  background: transparent;
}

.su-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.25;
  color: #111;
}

.su-courtesy {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  color: #222;
}

.su-years,
.su-kin,
.su-mark,
.su-brief,
.su-jump,
.su-omit {
  margin: 0;
  line-height: 1.35;
}

.su-years {
  font-size: 11px;
  color: #333;
}

.su-kin,
.su-mark {
  font-size: 11px;
  color: #444;
}

.su-brief,
.su-omit {
  font-size: 10px;
  color: #666;
}

.su-jump {
  display: inline-block;
  color: #1a56c4;
  font-size: 10px;
  text-decoration: underline;
}

.su-plate.is-antique .su-person,
.su-plate.is-antique .su-vrun,
.su-plate.is-antique .su-name,
.su-plate.is-antique .su-meta,
.su-plate.is-antique .su-courtesy,
.su-plate.is-antique .su-years,
.su-plate.is-antique .su-kin,
.su-plate.is-antique .su-mark,
.su-plate.is-antique .su-brief,
.su-plate.is-antique .su-jump {
  background: transparent;
  color: #000;
  border: 0;
  box-shadow: none;
}

.su-plate.is-antique .su-name {
  font-size: calc(14pt * var(--su-fit, 1));
  font-weight: 500;
}
.su-plate.is-antique .su-meta,
.su-plate.is-antique .su-courtesy,
.su-plate.is-antique .su-years,
.su-plate.is-antique .su-kin,
.su-plate.is-antique .su-mark {
  font-size: calc(9pt * var(--su-fit, 1));
  font-weight: 400;
}
.su-plate.is-antique .su-seam,
.su-plate.is-antique .su-continue,
.su-plate.is-antique .su-continue-link {
  font-size: calc(8pt * var(--su-fit, 1));
  font-weight: 400;
}
.su-plate.is-antique .su-jump {
  font-size: calc(7.5pt * var(--su-fit, 1));
  font-weight: 400;
}

.su-plate.is-antique .su-seam,
.su-plate.is-antique .su-continue,
.su-plate.is-antique .su-continue-link {
  background: transparent;
  color: #c0392b;
}

.su-meta {
  font-size: 11px;
  line-height: 1.2;
}

.su-plate.is-antique .su-jump {
  color: #000;
  text-decoration: underline;
  text-underline-offset: 1px;
  border: 0;
}

@media print {
  .su-jump {
    color: #333;
  }
}
</style>
