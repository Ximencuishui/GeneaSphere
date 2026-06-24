import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

/**
 * Vite 构建配置
 *
 * 关键优化：manualChunks 把第三方重库（xlsx、html2canvas、antv/g6 等）
 * 拆分为独立 chunk，避免单个主 chunk 超过 500KB 的告警，同时提升首屏加载性能。
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth/, '/auth'),
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // 提高 chunk 警告阈值（原 500kB），并将大体量依赖独立拆包
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          // Element Plus 与 Vue 生态
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-element-plus': ['element-plus', '@element-plus/icons-vue'],

          // 重型第三方库（按需懒加载页面才会命中）
          'vendor-xlsx': ['xlsx'],
          'vendor-html2canvas': ['html2canvas'],
          'vendor-antv': ['@antv/g6'],
          'vendor-pdfjs': ['pdfjs-dist'],

          // axios + 业务工具
          'vendor-utils': ['axios'],
        },
      },
    },
  },
})
