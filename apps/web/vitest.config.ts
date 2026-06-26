import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

/**
 * Vitest 配置
 *
 * 覆盖范围：
 * - 单元测试：components/landing/DemoRoleModal.vue 等关键 Vue SFC
 * - 环境：jsdom（模拟 DOM，与 vite 构建产物兼容）
 * - 路径别名：复用 vite.config.ts 的 '@' → 'src'
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx,js}'],
    // Element Plus 内部会调用 document 全局 API，jsdom 已提供
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
