<template>
  <div class="music-button-wrapper">
    <button 
      class="music-button" 
      :class="{ 'is-playing': musicStore.isPlaying }"
      @click="handleClick"
      :title="musicStore.isPlaying ? '背景音乐播放中' : '添加背景音乐'"
    >
      <span class="music-icon">
        {{ musicStore.isPlaying ? '🎵' : '🔇' }}
      </span>
      <span class="button-text">
        {{ musicStore.isPlaying ? '播放中' : '背景音乐' }}
      </span>
    </button>

    <!-- 播放状态指示器 -->
    <div v-if="musicStore.isPlaying" class="playing-indicator">
      <span class="bar bar-1"></span>
      <span class="bar bar-2"></span>
      <span class="bar bar-3"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMusicStore } from '@/stores/music'

const musicStore = useMusicStore()

function handleClick() {
  if (!musicStore.isControlVisible) {
    // 首次点击，打开控制面板并开始播放
    musicStore.toggleControl()
    if (!musicStore.isPlaying) {
      musicStore.togglePlay()
    }
  } else {
    // 面板已打开，切换播放状态
    musicStore.togglePlay()
  }
}
</script>

<style scoped>
.music-button-wrapper {
  position: relative;
}

.music-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  transition: all 0.3s ease;
  white-space: nowrap;
}

.music-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.music-button:active {
  transform: translateY(0);
}

.music-button.is-playing {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  box-shadow: 0 4px 12px rgba(245, 87, 108, 0.3);
}

.music-button.is-playing:hover {
  box-shadow: 0 6px 16px rgba(245, 87, 108, 0.4);
}

.music-icon {
  font-size: 18px;
  display: flex;
  align-items: center;
}

.button-text {
  font-size: 13px;
}

/* 播放状态指示器动画 */
.playing-indicator {
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 3px;
  align-items: flex-end;
  height: 12px;
}

.bar {
  display: block;
  width: 3px;
  background: #f5576c;
  border-radius: 2px;
  animation: sound-wave 1.2s ease-in-out infinite;
}

.bar-1 {
  height: 6px;
  animation-delay: 0s;
}

.bar-2 {
  height: 10px;
  animation-delay: 0.2s;
}

.bar-3 {
  height: 8px;
  animation-delay: 0.4s;
}

@keyframes sound-wave {
  0%, 100% {
    transform: scaleY(0.5);
  }
  50% {
    transform: scaleY(1.5);
  }
}

/* 移动端适配 */
@media (max-width: 768px) {
  .music-button {
    padding: 8px 12px;
    font-size: 12px;
  }

  .music-icon {
    font-size: 16px;
  }

  .button-text {
    font-size: 12px;
  }
}
</style>
