<script setup lang="ts">
const props = defineProps<{
  surnames: { name: string; color: string; description: string }[]
  highlightedSurname: string | null
}>()

const emit = defineEmits<{
  (e: 'select', surname: string | null): void
}>()

function toggleSurname(name: string) {
  if (props.highlightedSurname === name) {
    emit('select', null)
  } else {
    emit('select', name)
  }
}
</script>

<template>
  <div class="surname-legend">
    <div class="legend-header">
      <span class="legend-title">百家姓迁徙</span>
      <span class="legend-hint">点击姓氏高亮迁徙路径</span>
    </div>
    <div class="legend-items">
      <div
        v-for="s in surnames"
        :key="s.name"
        class="legend-item"
        :class="{ active: highlightedSurname === s.name, dimmed: highlightedSurname !== null && highlightedSurname !== s.name }"
        @click="toggleSurname(s.name)"
      >
        <span class="item-dot" :style="{ background: s.color }" />
        <span class="item-name">{{ s.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.surname-legend {
  position: absolute;
  bottom: 24px;
  right: 24px;
  background: rgba(30, 28, 34, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(201, 169, 110, 0.2);
  border-radius: 12px;
  padding: 16px;
  min-width: 130px;
  z-index: 10;
}
.legend-header {
  margin-bottom: 12px;
}
.legend-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 2px;
}
.legend-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}
.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}
.legend-item:hover {
  border-color: rgba(201, 169, 110, 0.3);
  background: rgba(255, 255, 255, 0.05);
}
.legend-item.active {
  border-color: rgba(201, 169, 110, 0.5);
  background: rgba(201, 169, 110, 0.1);
}
.legend-item.dimmed {
  opacity: 0.35;
}
.item-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.item-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}
@media (max-width: 768px) {
  .surname-legend {
    display: none;
  }
}
</style>
