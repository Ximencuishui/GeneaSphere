<script setup lang="ts">
/**
 * 册谱封面。独立一页，不画垂珠、世代墨块、人物。
 * 外框 2pt，内部分隔线 1pt。六套模板，横版三套、竖版三套。
 */
import { computed, ref, watch } from 'vue';

const FRAME_PT = 2;
const DIVIDER_PT = 1;
const STORAGE_KEY = 'cepu-cover-template';

const TEMPLATES = [
  { id: 'land-formal', label: '横版 · 正式仿古' },
  { id: 'land-plain', label: '横版 · 简约居中' },
  { id: 'land-ruled', label: '横版 · 栏线古籍' },
  { id: 'port-classic', label: '竖版 · 线装封面' },
  { id: 'port-blank', label: '竖版 · 素雅扉页' },
  { id: 'port-split', label: '竖版 · 双栏界栏' },
] as const;

export type CoverTemplateId = (typeof TEMPLATES)[number]['id'];

const props = withDefaults(defineProps<{
  name?: string;
  hall?: string;
  volume?: string;
  year?: string;
  place?: string;
  template?: CoverTemplateId | '';
}>(), {
  name: '族谱',
  hall: '',
  volume: '全卷',
  year: '',
  place: '',
  template: '',
});

const emit = defineEmits<{
  (e: 'update:template', value: CoverTemplateId): void;
}>();

function isTemplate(value: string | null): value is CoverTemplateId {
  return TEMPLATES.some((item) => item.id === value);
}

function readStored(): CoverTemplateId {
  if (typeof localStorage === 'undefined') return 'land-formal';
  const saved = localStorage.getItem(STORAGE_KEY);
  return isTemplate(saved) ? saved : 'land-formal';
}

const stored = ref<CoverTemplateId>(readStored());
const current = computed<CoverTemplateId>(() => (isTemplate(props.template) ? props.template : stored.value));
const landscape = computed(() => current.value.startsWith('land-'));
const framed = computed(() => current.value !== 'land-plain' && current.value !== 'port-blank');
const frameStyle = computed(() => (
  framed.value
    ? { borderWidth: `${FRAME_PT}pt` }
    : undefined
));
const dividerStyle = computed(() => ({ borderTopWidth: `${DIVIDER_PT}pt` }));
const splitRuleStyle = computed(() => ({ width: `${DIVIDER_PT}pt` }));

watch(stored, (value) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, value);
});

function choose(id: CoverTemplateId) {
  stored.value = id;
  emit('update:template', id);
}

const footLine = computed(() => [props.year, props.place].filter(Boolean).join(' '));
</script>

<template>
  <div class="cover-book">
    <div class="cover-picker" role="radiogroup" aria-label="封面模板">
      <button
        v-for="item in TEMPLATES"
        :key="item.id"
        type="button"
        :class="{ 'is-active': current === item.id }"
        :aria-pressed="current === item.id"
        @click="choose(item.id)"
      >{{ item.label }}</button>
    </div>

    <section
      class="cover-sheet"
      :class="[landscape ? 'is-land' : 'is-port', `is-${current}`]"
      :data-template="current"
    >
      <!-- 模板1：横版正式仿古。竖排从右往左，底部横排年份地点。 -->
      <div v-if="current === 'land-formal'" class="frame" :style="frameStyle">
        <div class="cols">
          <p class="vcol name size-42">{{ name }}</p>
          <p v-if="hall" class="vcol hall size-24">{{ hall }}</p>
          <p class="vcol volume size-20">{{ volume }}</p>
        </div>
        <p v-if="footLine" class="foot size-14">{{ footLine }}</p>
      </div>

      <!-- 模板2：横版简约，无外框，文字横排居中。 -->
      <div v-else-if="current === 'land-plain'" class="plain">
        <p class="h-name size-44">{{ name }}</p>
        <p v-if="hall" class="h-hall size-26">{{ hall }}</p>
        <p class="h-volume size-22">{{ volume }}</p>
        <p v-if="year" class="foot size-16">{{ year }}</p>
      </div>

      <!-- 模板3：横版栏线。两条 1pt 横线夹住竖排标题。 -->
      <div v-else-if="current === 'land-ruled'" class="frame" :style="frameStyle">
        <span class="hbar" :style="dividerStyle"></span>
        <div class="cols">
          <p class="vcol name size-40">{{ name }}</p>
          <p v-if="hall" class="vcol hall size-22">{{ hall }}</p>
          <p class="vcol volume size-20">{{ volume }}</p>
        </div>
        <span class="hbar" :style="dividerStyle"></span>
        <p v-if="year" class="foot size-14">{{ year }}</p>
      </div>

      <!-- 模板4：竖版线装。谱名靠右，年份在左下竖排。 -->
      <div v-else-if="current === 'port-classic'" class="frame" :style="frameStyle">
        <div class="cols is-right">
          <p class="vcol name size-48">{{ name }}</p>
          <p v-if="hall" class="vcol hall size-24">{{ hall }}</p>
          <p class="vcol volume size-20">{{ volume }}</p>
        </div>
        <p v-if="year" class="corner size-14">{{ year }}</p>
      </div>

      <!-- 模板5：竖版扉页。无框，谱名下接堂号，左下卷次与年份。 -->
      <div v-else-if="current === 'port-blank'" class="blank">
        <p class="right-stack">
          <span class="name size-44">{{ name }}</span><span v-if="hall" class="hall size-24">{{ hall }}</span>
        </p>
        <p class="corner size-16">
          <span>{{ volume }}</span><span v-if="year" class="after">{{ year }}</span>
        </p>
      </div>

      <!-- 模板6：竖版双栏。右栏谱名堂号，左栏卷次年份地点，中缝 1pt。 -->
      <div v-else class="frame split" :style="frameStyle">
        <div class="side">
          <p class="vflow size-18">
            <span>{{ volume }}</span><span v-if="year" class="after">{{ year }}</span><span v-if="place" class="after">{{ place }}</span>
          </p>
        </div>
        <span class="split-rule" :style="splitRuleStyle"></span>
        <div class="main">
          <p class="vflow">
            <span class="name size-42">{{ name }}</span><span v-if="hall" class="hall size-22 after">{{ hall }}</span>
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.cover-book {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.cover-picker {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 297mm;
}

.cover-picker button {
  font-family: 'Songti SC', 'SimSun', serif;
  font-size: 13px;
  color: #3e3a35;
  background: #fff;
  border: 1px solid #d2c6b2;
  border-radius: 0;
  padding: 4px 10px;
  cursor: pointer;
}

.cover-picker button.is-active {
  color: #fff;
  background: #2a241c;
  border-color: #2a241c;
}

.cover-sheet {
  position: relative;
  box-sizing: border-box;
  margin: 0;
  overflow: hidden;
  background: #fff;
  color: #000;
  font-family: 'FangSong', 'STFangsong', 'FangSong_GB2312', 'Songti SC', 'SimSun', serif;
  font-weight: 700;
}

.cover-sheet.is-land {
  width: 297mm;
  height: 210mm;
}

.cover-sheet.is-port {
  width: 210mm;
  height: 297mm;
}

.frame,
.plain,
.blank {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  background: #fff;
  border-radius: 0;
}

.frame {
  display: flex;
  flex-direction: column;
  border-style: solid;
  border-color: #000;
  padding: 12mm 16mm 10mm;
}

.plain {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 18mm 20mm 22mm;
  text-align: center;
}

.blank {
  position: relative;
}

.cols {
  display: flex;
  flex: 1 1 auto;
  flex-direction: row-reverse;
  align-items: center;
  justify-content: center;
  min-height: 0;
  gap: 14mm;
}

.cols.is-right {
  justify-content: flex-end;
  padding-right: 8mm;
  padding-bottom: 18mm;
}

.vcol {
  margin: 0;
  max-height: 100%;
  overflow: hidden;
  writing-mode: vertical-rl;
  text-orientation: upright;
  line-height: 1;
  letter-spacing: 0.12em;
}

.name,
.hall,
.volume,
.foot,
.corner,
.side { font-weight: 700; }

.size-48 { font-size: 48pt; }
.size-44 { font-size: 44pt; }
.size-42 { font-size: 42pt; }
.size-40 { font-size: 40pt; }
.size-26 { font-size: 26pt; }
.size-24 { font-size: 24pt; }
.size-22 { font-size: 22pt; }
.size-20 { font-size: 20pt; }
.size-18 { font-size: 18pt; }
.size-16 { font-size: 16pt; }
.size-14 { font-size: 14pt; }

.h-name,
.h-hall,
.h-volume {
  margin: 0;
  line-height: 1.25;
  letter-spacing: 0.18em;
}

.h-name,
.h-hall,
.h-volume { font-weight: 700; }
.h-hall { margin-top: 8mm; }
.h-volume { margin-top: 6mm; }

.plain .foot {
  position: absolute;
  left: 16mm;
  right: 16mm;
  bottom: 14mm;
}

.foot {
  flex: 0 0 auto;
  margin: 4mm 0 0;
  text-align: center;
  letter-spacing: 0.14em;
  writing-mode: horizontal-tb;
}

.hbar {
  display: block;
  flex: 0 0 auto;
  height: 0;
  margin: 0 4mm;
  border-top-style: solid;
  border-top-color: #000;
}

.corner {
  position: absolute;
  left: 14mm;
  bottom: 14mm;
  margin: 0;
  max-height: 36%;
  overflow: hidden;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 0.08em;
  line-height: 1;
}

.right-stack {
  position: absolute;
  top: 16mm;
  right: 18mm;
  bottom: 16mm;
  margin: 0;
  overflow: hidden;
  writing-mode: vertical-rl;
  text-orientation: upright;
  line-height: 1;
  letter-spacing: 0.1em;
}

.right-stack .hall {
  margin-inline-start: 3mm;
}

.after {
  margin-inline-start: 4mm;
}

.split {
  display: grid;
  grid-template-columns: 1fr auto 1.4fr;
  padding: 12mm 0;
}

.side,
.main {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.vflow {
  margin: 0;
  max-height: 100%;
  overflow: hidden;
  writing-mode: vertical-rl;
  text-orientation: upright;
  line-height: 1;
  letter-spacing: 0.1em;
}

.split-rule {
  background: #000;
}

@media print {
  .cover-picker { display: none; }
  .cover-sheet { box-shadow: none; }
}
</style>
