<template>
  <div class="countdown-bar" :class="{ 'is-warning': percent < 30, 'is-danger': percent < 10 }">
    <div class="countdown-bar__text">
      <span v-if="title">{{ title }}</span>
      <span class="countdown-bar__time">{{ formatted }}</span>
    </div>
    <div class="countdown-bar__track">
      <div class="countdown-bar__fill" :style="{ width: percent + '%' }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCountdown } from '@/composables/useCountdown'

const props = withDefaults(
  defineProps<{
    expireAt?: string | Date | null
    title?: string
    onExpire?: () => void
  }>(),
  { title: '剩余时间' },
)

const { formatted, percent } = useCountdown(props.expireAt, props.onExpire)
</script>

<style scoped>
.countdown-bar {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid #e4e7ed;
  transition: all 0.2s;
}
.countdown-bar.is-warning {
  background: #fdf6ec;
  border-color: #faecd8;
  color: #e6a23c;
}
.countdown-bar.is-danger {
  background: #fef0f0;
  border-color: #fde2e2;
  color: #f56c6c;
}
.countdown-bar__text {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}
.countdown-bar__time {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.countdown-bar__track {
  height: 4px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 2px;
  overflow: hidden;
}
.countdown-bar__fill {
  height: 100%;
  background: #409eff;
  transition: width 0.4s linear, background 0.2s;
}
.is-warning .countdown-bar__fill {
  background: #e6a23c;
}
.is-danger .countdown-bar__fill {
  background: #f56c6c;
}
</style>
