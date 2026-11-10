<script setup lang="ts">
/**
 * 标准宗谱的字辈索引。没有字辈时留空页，不挡整本目录。
 */
withDefaults(defineProps<{
  rows: { generation: number; character: string; note?: string | null }[];
  script?: 'horizontal' | 'antique';
}>(), {
  script: 'horizontal',
});
</script>

<template>
  <div id="book-generation" class="gen-book" :class="{ 'is-antique': script === 'antique' }">
    <section class="gen-sheet" :class="{ 'is-antique': script === 'antique' }">
      <div class="gen-stage">
        <header class="gen-head">
          <h2 class="gen-title">字辈索引</h2>
        </header>
        <p v-if="!rows.length" class="gen-empty">字辈尚未录入。</p>
        <p v-for="row in rows" :key="row.generation" class="gen-row">
          第{{ row.generation }}世｜{{ row.character }}<template v-if="row.note">｜{{ row.note }}</template>
        </p>
      </div>
      <p class="gen-foot">字辈</p>
    </section>
  </div>
</template>

<style scoped>
.gen-book { display: flex; justify-content: center; }
.gen-sheet {
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
.gen-title { margin: 0 0 8mm; text-align: left; font-size: 22px; letter-spacing: 0.2em; }
.gen-row, .gen-empty { margin: 0 0 2mm; font-size: 16px; line-height: 1.7; text-align: left; }
.gen-empty { color: #666; }
.gen-foot {
  position: absolute; left: 0; right: 0; bottom: 8mm; margin: 0;
  text-align: center; font-size: 12px; letter-spacing: 0.14em; color: #6d6458;
}
.gen-book.is-antique .gen-sheet { font-family: 'SimSun', 'NSimSun', 'Songti SC', serif; }
.gen-book.is-antique .gen-stage { display: flex; flex-direction: column; align-items: flex-end; height: 100%; }
.gen-book.is-antique .gen-head { margin: 0 0 4mm auto; }
.gen-book.is-antique .gen-title,
.gen-book.is-antique .gen-row,
.gen-book.is-antique .gen-empty {
  writing-mode: vertical-rl; text-orientation: upright; text-align: start; margin: 0 0 0 4mm;
}
.gen-book.is-antique .gen-title { max-height: 46mm; margin: 0 0 4mm 0; }
.gen-book.is-antique .gen-foot { writing-mode: horizontal-tb; font-family: 'SimSun', 'NSimSun', 'Songti SC', serif; }
</style>
