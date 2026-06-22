<template>
  <div class="branch-selector">
    <el-select
      :model-value="modelValue || ''"
      placeholder="选择支系"
      clearable
      @change="onChange"
    >
      <el-option label="全部支系" value="">
        <div class="branch-option">
          <span class="branch-dot all"></span>
          <span>全部支系</span>
        </div>
      </el-option>
      <el-option
        v-for="branch in branches"
        :key="branch.name"
        :label="branch.name"
        :value="branch.name"
      >
        <div class="branch-option">
          <span class="branch-dot" :style="{ background: getBranchColor(branch.name) }"></span>
          <span>{{ branch.name }}</span>
        </div>
      </el-option>
    </el-select>
  </div>
</template>

<script setup lang="ts">
import type { Branch } from '@/types';

const props = defineProps<{
  modelValue?: string | null;
  branches: Branch[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
  (e: 'change', value: string | null): void;
}>();

// 支系配色（与地图保持一致）
const BRANCH_COLORS = ['#C53030', '#2B6CB0', '#2F855A', '#B7791F', '#6B46C1', '#0987A0'];
const colorMap = new Map<string, string>();

function getBranchColor(name: string): string {
  if (!colorMap.has(name)) {
    colorMap.set(name, BRANCH_COLORS[colorMap.size % BRANCH_COLORS.length]);
  }
  return colorMap.get(name)!;
}

function onChange(value: string) {
  const v = value || null;
  emit('update:modelValue', v);
  emit('change', v);
}
</script>

<style scoped>
.branch-selector {
  display: inline-block;
}

.branch-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.branch-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.branch-dot.all {
  background: linear-gradient(135deg, #C53030 25%, #2B6CB0 25%, #2B6CB0 50%, #2F855A 50%, #2F855A 75%, #B7791F 75%);
}
</style>
