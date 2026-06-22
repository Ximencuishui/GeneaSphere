<template>
  <div class="photo-cluster">
    <div class="photo-cluster-header">
      <div class="cluster-title">
        <el-icon><Picture /></el-icon>
        <span class="cluster-location">{{ locationName }}</span>
      </div>
      <span class="cluster-count">{{ media.length }} 张照片</span>
    </div>

    <div class="photo-grid">
      <el-image
        v-for="(item, idx) in displayMedia"
        :key="item.id"
        :src="item.media.file_url"
        :alt="item.media.description || locationName"
        fit="cover"
        class="photo-item"
        :class="{ 'with-glow': true }"
        :preview-src-list="allImageUrls"
        :initial-index="idx"
        loading="lazy"
        @click="$emit('photo-click', item)"
      >
        <template #error>
          <div class="photo-error">
            <el-icon><Picture /></el-icon>
          </div>
        </template>
      </el-image>

      <div v-if="media.length > maxVisible" class="photo-more" @click="showAll = true">
        +{{ media.length - maxVisible }} 张
      </div>
    </div>

    <div v-if="showAll" class="photo-modal-mask" @click.self="showAll = false">
      <div class="photo-modal">
        <div class="photo-modal-header">
          <span>{{ locationName }} · 全部 {{ media.length }} 张照片</span>
          <el-button text size="small" @click="showAll = false">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
        <div class="photo-modal-grid">
          <el-image
            v-for="item in media"
            :key="item.id"
            :src="item.media.file_url"
            :alt="item.media.description || locationName"
            fit="cover"
            class="photo-item large"
            :preview-src-list="allImageUrls"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Picture, Close } from '@element-plus/icons-vue';
import type { LocationMediaItem } from '@/types';

const props = defineProps<{
  locationName: string;
  media: LocationMediaItem[];
  maxVisible?: number;
}>();

defineEmits<{
  (e: 'photo-click', item: LocationMediaItem): void;
}>();

const showAll = ref(false);

const maxVisible = computed(() => props.maxVisible ?? 9);

const displayMedia = computed(() => props.media.slice(0, maxVisible.value));

const allImageUrls = computed(() => props.media.map((m) => m.media.file_url));
</script>

<style scoped>
.photo-cluster {
  background: rgba(255, 255, 255, 0.97);
  border-radius: 8px;
  padding: 12px 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  width: 100%;
}

.photo-cluster-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
}

.cluster-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #2d3748;
}

.cluster-location {
  font-weight: 600;
}

.cluster-count {
  font-size: 12px;
  color: #718096;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.photo-item {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
}

.photo-item.with-glow {
  box-shadow:
    0 0 0 1px rgba(255, 215, 0, 0.3),
    0 0 12px rgba(255, 215, 0, 0.6),
    0 0 24px rgba(255, 215, 0, 0.35);
  animation: photoBreath 2.4s ease-in-out infinite;
  transition: transform 0.2s ease;
}

.photo-item.with-glow:hover {
  transform: scale(1.05);
  z-index: 2;
}

.photo-item.large {
  width: 100%;
  height: 140px;
}

.photo-error {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #edf2f7;
  color: #a0aec0;
  font-size: 18px;
}

.photo-more {
  grid-column: span 1;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
}

.photo-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.photo-modal {
  background: #fff;
  border-radius: 12px;
  max-width: 960px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.photo-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  font-weight: 600;
}

.photo-modal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  padding: 16px 20px;
  overflow-y: auto;
}

@keyframes photoBreath {
  0%, 100% {
    box-shadow:
      0 0 0 1px rgba(255, 215, 0, 0.3),
      0 0 8px rgba(255, 215, 0, 0.5),
      0 0 16px rgba(255, 215, 0, 0.3);
    transform: scale(1);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(255, 215, 0, 0.4),
      0 0 14px rgba(255, 215, 0, 0.7),
      0 0 28px rgba(255, 215, 0, 0.4);
    transform: scale(1.04);
  }
}
</style>
