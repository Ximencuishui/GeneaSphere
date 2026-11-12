<template>
  <div
    v-if="!musicStore.isWidgetHidden"
    class="music-button-wrapper"
  >
    <div class="hover-actions">
      <button
        type="button"
        class="action-btn"
        title="隐藏"
        @click="handleHide"
      >
        <ElIcon :size="16"><Hide /></ElIcon>
      </button>
      <button
        type="button"
        class="action-btn"
        title="关闭音乐"
        @click="handleClose"
      >
        <ElIcon :size="16"><Close /></ElIcon>
      </button>
    </div>

    <button
      type="button"
      class="music-button"
      :class="{ 'is-playing': musicStore.isPlaying }"
      :title="musicStore.isPlaying ? '背景音乐播放中' : '背景音乐'"
      @click="handleClick"
    >
      <svg class="speaker-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path
          v-if="musicStore.isPlaying"
          class="wave wave-1"
          d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
        />
        <path
          v-if="musicStore.isPlaying"
          class="wave wave-2"
          d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
        />
      </svg>
    </button>
  </div>

  <button
    v-else
    type="button"
    class="music-restore"
    title="显示背景音乐"
    @click="musicStore.showWidget()"
  >
    <svg class="speaker-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
  </button>
</template>

<script setup lang="ts">
import { Close, Hide } from '@element-plus/icons-vue'
import { useMusicStore } from '@/stores/music'

const musicStore = useMusicStore()

function handleClick() {
  if (!musicStore.isControlVisible) {
    musicStore.toggleControl()
    if (!musicStore.isPlaying) {
      musicStore.togglePlay()
    }
  } else {
    musicStore.togglePlay()
  }
}

function handleClose() {
  if (musicStore.isPlaying) {
    musicStore.togglePlay()
  }
  musicStore.closeControl()
}

function handleHide() {
  musicStore.hideWidget()
}
</script>

<style scoped>
.music-button-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.hover-actions {
  position: absolute;
  right: 52px;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  transform: translateY(-50%) translateX(8px);
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.music-button-wrapper:hover .hover-actions,
.music-button-wrapper:focus-within .hover-actions {
  opacity: 1;
  transform: translateY(-50%);
  pointer-events: auto;
}

.action-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #d7ccc8;
  border-radius: 50%;
  background: #fff;
  color: #4e342e;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(62, 39, 35, 0.22);
}

.action-btn:hover {
  background: #fff8f3;
  color: #3e2723;
}

.music-button,
.music-restore {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: #5d4037;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(93, 64, 55, 0.28);
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.music-button:hover,
.music-restore:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(93, 64, 55, 0.34);
}

.music-button.is-playing {
  background: #8d6e63;
}

.music-restore {
  width: 36px;
  height: 36px;
  background: rgba(93, 64, 55, 0.55);
  box-shadow: none;
}

.speaker-icon {
  width: 22px;
  height: 22px;
  fill: currentColor;
}

.wave {
  fill: currentColor;
}

.wave-1 {
  animation: wave-pulse 1.2s ease-in-out infinite;
}

.wave-2 {
  animation: wave-pulse 1.2s ease-in-out 0.2s infinite;
}

@keyframes wave-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

@media (max-width: 768px) {
  .music-button {
    width: 40px;
    height: 40px;
  }

  .hover-actions {
    right: 48px;
  }
}
</style>
