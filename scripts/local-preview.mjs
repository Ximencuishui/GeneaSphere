#!/usr/bin/env node
/** 本地构建产物静态预览服务器（SPA history fallback），供 Playwright 冒烟测试使用 */
import { createServer } from 'node:http'
import { readFileSync, statSync, existsSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', 'apps', 'web', 'dist')
const PORT = Number(process.env.PORT || 4174)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
}

createServer((req, res) => {
  let urlPath
  try {
    urlPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
  } catch {
    urlPath = '/'
  }
  // API 请求在本地无后端，返回 404 JSON（避免把 index.html 当接口返回）。
  // 注意：code 用 LOCAL_PREVIEW，避免触发前端"家族不存在(NOT_FOUND)→跳 /clans"的业务逻辑
  if (urlPath.startsWith('/api/')) {
    // 平台后台挂载时会拉取 profile，404 会触发 logout → 跳登录；返回最小可用结构以便冒烟
    if (urlPath === '/api/platform/auth/profile') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ id: '1', username: 'platform_admin', real_name: '本地冒烟', role: 'super' }))
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ code: 'LOCAL_PREVIEW', message: 'local preview: no backend' }))
    return
  }
  let fp = join(ROOT, normalize(urlPath).replace(/^[/\\]+/, ''))
  if (!existsSync(fp) || statSync(fp).isDirectory()) {
    fp = join(ROOT, 'index.html')
  }
  const ext = extname(fp).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  res.end(readFileSync(fp))
}).listen(PORT, '127.0.0.1', () => {
  console.log(`local preview: http://127.0.0.1:${PORT}`)
})
