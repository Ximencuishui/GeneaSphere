<script setup lang="ts">
import type { MemoryBadge } from '@/types/memory'

defineProps<{
  badges: MemoryBadge[]
}>()

const badgeConfig: Record<string, { emoji: string; color: string }> = {
  '地方记忆守护者': { emoji: '&#128737;', color: '#C9A96E' },
  '姓氏源头探索者': { emoji: '&#128214;', color: '#85C1A9' },
  '寻根引路人': { emoji: '&#128204;', color: '#7FB3D8' },
}
</script>

<template>
  <div class="badge-display">
    <div
      v-for="badge in badges"
      :key="badge.id"
      class="badge-item"
      :style="{ borderColor: (badgeConfig[badge.badge_type]?.color || '#C9A96E') + '40' }"
    >
      <div
        class="badge-icon"
        :style="{ background: (badgeConfig[badge.badge_type]?.color || '#C9A96E') + '15' }"
        v-html="badgeConfig[badge.badge_type]?.emoji || '&#127775;'"
      />
      <div class="badge-info">
        <span class="badge-name">{{ badge.badge_type }}</span>
        <span v-if="badge.description" class="badge-desc">{{ badge.description }}</span>
      </div>
    </div>
    <div v-if="badges.length === 0" class="badge-empty">
      暂无徽章
    </div>
  </div>
</template>

<style scoped>
.badge-display {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.badge-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border: 1px solid #e8e0d8;
  border-radius: 10px;
  background: white;
  min-width: 140px;
}
.badge-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}
.badge-info {
  display: flex;
  flex-direction: column;
}
.badge-name {
  font-size: 13px;
  font-weight: 600;
  color: #2c3e50;
}
.badge-desc {
  font-size: 11px;
  color: #94a3b8;
}
.badge-empty {
  font-size: 13px;
  color: #94a3b8;
  padding: 8px 0;
}
</style>
