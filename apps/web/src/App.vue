<template>
  <ElConfigProvider :locale="zhCn">
    <div id="app">
      <router-view />

      <!-- 背景音乐组件 -->
      <div class="music-container">
        <MusicButton />
        <MusicControl />
      </div>
    </div>
  </ElConfigProvider>
</template>

<script setup lang="ts">
/**
 * 显式 import 的原因：
 * - ElConfigProvider 由 unplugin-vue-components 自动注册（模板里写 <ElConfigProvider> 即可），
 *   这里 script 中不写 import 也行；但为了 TS 类型提示（避免 vue-tsc 报未注册组件），
 *   此处保留显式 import（resolver 会去重，不会真重复打包）。
 * - zhCn 是 locale 文案，纯 ESM 子模块，必须显式 import 才有 TS 类型。
 */
import { ElConfigProvider } from "element-plus"
import zhCn from "element-plus/es/locale/lang/zh-cn"
import MusicButton from "@/components/BackgroundMusic/MusicButton.vue"
import MusicControl from "@/components/BackgroundMusic/MusicControl.vue"
</script>

<style>
/* 全局样式 */
#app {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
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
