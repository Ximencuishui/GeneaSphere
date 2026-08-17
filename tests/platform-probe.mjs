#!/usr/bin/env node
/** 平台后台各子页面直连探测（带 platform token），确认 401 跳登录的影响范围 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'temp', 'platform-probe.json')
const BASE = 'http://43.134.232.175'
const report = { checks: [] }

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const apiCtx = await browser.newContext()
const r = await apiCtx.request.post(`${BASE}/api/platform/auth/login`, { data: { username: 'platform_admin', password: 'admin123' } })
const pToken = (await r.json()).access_token

const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
await ctx.addInitScript((t) => localStorage.setItem('geneasphere_platform_token', t), pToken)
const page = await ctx.newPage()
const issues = []
page.on('pageerror', (e) => issues.push(`PAGEERROR: ${e.message.slice(0, 150)}`))
page.on('console', (m) => { if (m.type() === 'error') issues.push(`CONSOLE: ${m.text().slice(0, 150)}`) })

for (const path of [
  '/platform-admin/orders/recharge',
  '/platform-admin/settings/pricing',
  '/platform-admin/settings/defaults',
  '/platform-admin/settings/switches',
  '/platform-admin/statistics',
  '/platform-admin/logs',
  '/platform-admin/reviews/posts',
  '/platform-admin/families',
]) {
  issues.length = 0
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => issues.push(`GOTO: ${e.message.slice(0, 80)}`))
  await page.waitForTimeout(4500)
  const finalUrl = page.url()
  const content = (await page.locator('.content-area').innerText().catch(() => '')).replace(/\n+/g, ' ').slice(0, 120)
  report.checks.push({ path, finalUrl, redirectedToLogin: finalUrl.includes('/platform-admin/login'), issues, content })
  writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8')
}
console.log(JSON.stringify(report, null, 2))
await browser.close()
