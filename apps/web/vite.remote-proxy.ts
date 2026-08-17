import { defineConfig } from 'vite'
import baseConfig from './vite.config'

/**
 * 本地验证专用配置：与正式 vite.config.ts 完全一致，
 * 仅把 /api 代理目标改为远程联调后端（本机无法建立数据库隧道时的替代）。
 * 用法: pnpm --filter web dev -- --config vite.remote-proxy.ts
 */
export default defineConfig({
  ...baseConfig,
  server: {
    ...(baseConfig.server || {}),
    proxy: {
      '/api': {
        target: process.env.REMOTE_API || 'http://43.134.232.175',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
    },
  },
})
