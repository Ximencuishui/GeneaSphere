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
 *
 * [W3 2026-09-01] LayoutEngine v6 elkjs 异步路径：
 *   - elkjs 内部依赖 web worker，jsdom 测试环境无原生 worker 支持
 *   - 加入 @vitest/web-worker 到 setupFiles，使 elkjs 在 vitest 中可用
 *   - 缺失时 elkjs 会降级到非 worker 路径（elkjs-layout.ts 内部处理）
 *   - 也用于测试 elkjs-layout.worker.ts 自身的逻辑
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
    setupFiles: [
      './src/test/setup.ts',
      // [W3 2026-09-01] elkjs 在 jsdom 中模拟 web worker（polyfill）
      '@vitest/web-worker',
    ],
    css: false,
  },
})
