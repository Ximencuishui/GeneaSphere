<script setup lang="ts">
/**
 * 苏式垂珠的一板。
 * 父子用竖线串联，同父兄弟横向分列，每个兄弟再向下拉自己的垂珠。
 * 版本A长房在左、文字在线右；版本B长房在右、文字在线左。人物文字一律横排。
 * 关掉垂珠时只拿掉竖线、横线和圆圈，板位与文字不动。
 */
import { computed } from 'vue';
import {
  placeSuChart,
  type SuBeadNode,
  type SuChart,
  type SuGenerationBand,
  type SuMarkBox,
  type SuPlacedPerson,
  type SuRule,
} from '@/utils/su-chart';
import type { EuropeanPersonCaption } from '@/utils/european-chart-source';
import { formatLifeYears } from '@/utils/genealogy-card';

const props = withDefaults(defineProps<{
  nodes: SuBeadNode[];
  beadLines?: boolean;
  antique?: boolean;
  captions?: Record<string, EuropeanPersonCaption>;
  selectedId?: string | number | null;
  chart: SuChart;
}>(), {
  beadLines: false,
  antique: false,
});

const emit = defineEmits<{
  (e: 'select', personId: string): void;
  (e: 'open-bio', payload: { personId: string; name: string; chartNo: number; citeBook?: '人物传' | '闺秀录'; anchorId: string }): void;
}>();

const BRIEF_LIMIT = 18;

const place = computed(() => placeSuChart(props.nodes, props.antique ? 'antique' : 'horizontal'));
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
  return {
    left: `${person.textX}mm`,
    top: `${person.textY}mm`,
    width: `${person.textW}mm`,
    height: `${person.textH}mm`,
    writingMode: 'horizontal-tb',
  };
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
  return {
    left: `${band.x}mm`,
    top: `${band.y}mm`,
    width: `${band.w}mm`,
    height: `${band.h}mm`,
    writingMode: band.boxed ? 'vertical-rl' : 'horizontal-tb',
    textOrientation: band.boxed ? 'upright' : 'mixed',
  };
}

function seamStyle(seam: SuMarkBox): Record<string, string> {
  return {
    left: `${seam.x}mm`,
    top: `${seam.y}mm`,
    width: `${seam.w}mm`,
    height: `${seam.h}mm`,
    writingMode: props.antique ? 'vertical-rl' : 'horizontal-tb',
    textOrientation: props.antique ? 'upright' : 'mixed',
  };
}

function courtesyText(node: SuBeadNode): string {
  const caption = props.captions?.[node.block.personId];
  const parts: string[] = [];
  if (caption?.courtesyName) parts.push(`字${caption.courtesyName}`);
  if (caption?.artName) parts.push(`号${caption.artName}`);
  return parts.join('，');
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
    >{{ band.label }}</div>
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
    <span
      v-for="seam in place.seams"
      :key="`seam-${seam.index}-${seam.kind}`"
      class="su-seam"
      :class="seam.kind === 'in' ? 'is-in' : 'is-out'"
      :style="seamStyle(seam)"
    >{{ seam.kind === 'in' ? '接上' : '接下' }}</span>
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
        <div class="su-body">
          <div class="su-name-row">
            <span class="su-name">{{ nodeOf(person.index)!.block.name }}</span>
            <span v-if="courtesyText(nodeOf(person.index)!)" class="su-courtesy">（{{ courtesyText(nodeOf(person.index)!) }}）</span>
          </div>
          <p v-if="yearsText(nodeOf(person.index)!)" class="su-years">{{ yearsText(nodeOf(person.index)!) }}</p>
          <p v-if="nodeOf(person.index)!.block.spouseText" class="su-kin">{{ nodeOf(person.index)!.block.spouseText }}</p>
          <p v-if="burialText(nodeOf(person.index)!)" class="su-kin">{{ burialText(nodeOf(person.index)!) }}</p>
          <p v-if="nodeOf(person.index)!.block.mark" class="su-mark">{{ nodeOf(person.index)!.block.mark }}</p>
          <a
            v-if="hasBiography(nodeOf(person.index)!)"
            class="su-jump"
            :href="`#${bioAnchor(nodeOf(person.index)!)}`"
            :title="`跳转到${citeBook(nodeOf(person.index)!)}：${nodeOf(person.index)!.block.name}`"
            @click.stop.prevent="openBiography(nodeOf(person.index)!)"
          >详见人物传</a>
          <p v-if="briefText(nodeOf(person.index)!)" class="su-brief">{{ briefText(nodeOf(person.index)!) }}</p>
        </div>
        <span v-if="beadLines && nodeOf(person.index)!.omitBeads" class="su-omit">支繁，略垂珠线</span>
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
  border: 0.7px solid #1c140c;
  background: transparent;
  font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
}

.su-band {
  position: absolute;
  left: 0;
  right: 14mm;
  z-index: 1;
  height: 0;
  border-top: 0.6px solid #1c140c;
  pointer-events: none;
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
  border: 1px solid #1a1208;
  background: #f4e7c8;
  color: #1a1208;
  font-size: 13px;
  line-height: 1;
  letter-spacing: 0.14em;
  text-align: center;
}

.su-rule {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  background: #2a241c;
}

.su-rule.is-v {
  width: 0.7px;
}

.su-rule.is-h {
  height: 0.7px;
}

.su-plate.is-antique .su-rule {
  background: #1a1208;
}

.su-bead {
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
  width: 2.6mm;
  height: 2.6mm;
  margin-left: -1.3mm;
  margin-top: -1.3mm;
  border: 0.8px solid #1a1208;
  border-radius: 50%;
  background: transparent;
  pointer-events: none;
}

.su-seam {
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

.su-person {
  position: absolute;
  z-index: 3;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
  cursor: pointer;
}

.su-person.is-selected {
  background: rgba(138, 100, 22, 0.08);
  box-shadow: inset 0 0 0 1px #8a6416;
}

.su-name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px;
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

.su-plate.is-antique .su-name,
.su-plate.is-antique .su-courtesy,
.su-plate.is-antique .su-years,
.su-plate.is-antique .su-kin,
.su-plate.is-antique .su-mark,
.su-plate.is-antique .su-brief {
  color: #1a1208;
}

.su-plate.is-antique .su-jump {
  color: #1a1208;
  text-decoration: none;
  border-bottom: 0.4px solid #1a1208;
}

@media print {
  .su-jump {
    color: #333;
  }
}
</style>
