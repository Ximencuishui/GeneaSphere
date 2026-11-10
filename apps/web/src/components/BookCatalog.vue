<script setup lang="ts">
/**
 * 册谱总目录。横排左对齐；仿古竖排从右往左。
 */
import type { CatalogEntry } from '@/utils/book-catalog';

withDefaults(defineProps<{
  entries: CatalogEntry[];
  script?: 'horizontal' | 'antique';
}>(), {
  script: 'horizontal',
});

const emit = defineEmits<{
  (e: 'open', entry: CatalogEntry): void;
}>();

function line(entry: CatalogEntry): string {
  if (entry.marker === 'last') return `└ ${entry.text}`;
  if (entry.marker === 'mid') return `├ ${entry.text}`;
  return entry.text;
}
</script>

<template>
  <div id="book-catalog" class="toc-book" :class="{ 'is-antique': script === 'antique' }">
    <section class="toc-sheet is-odd" :class="{ 'is-antique': script === 'antique' }">
      <div class="toc-stage">
        <header class="toc-head">
          <h2 class="toc-title">总目录</h2>
        </header>
        <ol class="toc-list">
          <li
            v-for="entry in entries"
            :key="entry.key"
            class="toc-item"
            :class="{ 'is-child': entry.depth > 0, 'is-group': entry.kind === 'group' }"
          >
            <span v-if="entry.tag" class="toc-tag">{{ entry.tag }}</span>
            <span v-if="entry.kind === 'group'" class="toc-label">{{ line(entry) }}</span>
            <a
              v-else
              class="toc-jump"
              :href="`#${entry.anchor}`"
              @click.prevent="emit('open', entry)"
            >{{ line(entry) }}</a>
          </li>
        </ol>
      </div>
      <p class="toc-foot">目录</p>
    </section>
  </div>
</template>

<style scoped>
.toc-book { display: flex; justify-content: center; }
.toc-sheet {
  position: relative;
  width: 210mm;
  height: 297mm;
  padding: 30mm 15mm 25mm 20mm;
  box-sizing: border-box;
  background: #fff;
  box-shadow: 0 8px 28px rgba(60, 40, 20, 0.12);
  overflow: hidden;
  font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
  color: #1a1a1a;
}
.toc-title { margin: 0 0 8mm; text-align: left; font-size: 22px; font-weight: 600; letter-spacing: 0.2em; }
.toc-list { list-style: none; margin: 0; padding: 0; text-align: left; }
.toc-item { display: flex; align-items: baseline; gap: 8px; margin: 0 0 3.2mm; font-size: 16px; line-height: 1.6; }
.toc-item.is-child { padding-left: 1.8em; font-size: 15px; }
.toc-tag {
  flex: 0 0 auto;
  min-width: 2.6em;
  padding: 0 4px;
  border: 1px solid #c4bba8;
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  color: #6d6458;
}
.toc-jump { color: #1a56c4; text-decoration: underline; cursor: pointer; }
.toc-label { color: inherit; }
.toc-foot {
  position: absolute; left: 0; right: 0; bottom: 8mm; margin: 0;
  text-align: center; font-size: 12px; letter-spacing: 0.14em; color: #6d6458;
}
.toc-book.is-antique .toc-sheet { font-family: 'SimSun', 'NSimSun', 'Songti SC', serif; }
.toc-book.is-antique .toc-stage { display: flex; flex-direction: column; height: 100%; }
.toc-book.is-antique .toc-head { align-self: flex-end; margin: 0 0 4mm auto; }
.toc-book.is-antique .toc-title {
  writing-mode: vertical-rl; text-orientation: upright; text-align: start;
  max-height: 46mm; margin: 0;
}
.toc-book.is-antique .toc-list {
  display: flex; flex-direction: row-reverse; align-items: flex-start;
  flex: 1 1 auto; height: 0; min-height: 0; width: 100%; gap: 4mm;
}
.toc-book.is-antique .toc-item {
  writing-mode: vertical-rl; text-orientation: upright;
  display: block; height: 100%; width: max-content; margin: 0; padding: 0;
}
.toc-book.is-antique .toc-item.is-child { padding: 0; }
.toc-book.is-antique .toc-tag { writing-mode: vertical-rl; display: inline; border: 0; padding: 0 0 2mm; }
.toc-book.is-antique .toc-foot { writing-mode: horizontal-tb; font-family: 'SimSun', 'NSimSun', 'Songti SC', serif; }
@media print {
  .toc-book { display: block; }
  .toc-sheet { box-shadow: none; }
  .toc-jump { color: inherit; text-decoration: none; }
}
</style>
