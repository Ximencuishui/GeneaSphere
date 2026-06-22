<template>
  <div id="app">
    <router-view />
    
    <!-- 背景音乐组件 -->
    <div class="music-container">
      <MusicButton />
      <MusicControl />
    </div>
  </div>
</template>

<script setup lang="ts">
import MusicButton from '@/components/BackgroundMusic/MusicButton.vue'
import MusicControl from '@/components/BackgroundMusic/MusicControl.vue'
</script>

<style>
/* 全局样式 */
#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 背景音乐容器 - 固定在右下角 */
.music-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .music-container {
    bottom: 12px;
    right: 12px;
  }
}
</style>