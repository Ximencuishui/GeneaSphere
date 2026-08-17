#!/usr/bin/env node
/**
 * 定向复验：对 E2E 中发现的可疑项逐一直连 URL 验证，精确捕获每页 console/toast
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'temp', 'verify-report.json')
const BASE = 'http://43.134.232.175'

async function login(request, ep) {
  const r = await request.post(`${BASE}${ep}`, { data: {} })
  const j = await r.json()
  return j.access_token
}

async function probe(browser, tokenKey, token, url, waitMs = 3500) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  await ctx.addInitScript(([k, t]) => { localStorage.setItem(k, t); if (k === 'geneasphere_token') localStorage.setItem('demo_clan_slug', 'zhuxi-demo') }, [tokenKey, token])
  const page = await ctx.newPage()
  const consoleErrs = []
  page.on('pageerror', (e) => consoleErrs.push(`PAGEERROR: ${e.message.slice(0, 300)}`))
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(`CONSOLE: ${m.text().slice(0, 300)}`) })
  const toasts = []
  page.on('console', (m) => {
    // element-plus ElMessage 渲染为 DOM，不在此捕获
  })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => consoleErrs.push(`GOTO: ${e.message.slice(0, 120)}`))
  await page.waitForTimeout(waitMs)
  const result = { url: url, finalUrl: page.url(), consoleErrs }
  // 页面上的错误 toast（el-message--error）
  try {
    result.errorToasts = await page.locator('.el-message--error').allInnerTexts().catch(() => [])
    result.errorAlerts = await page.locator('.el-alert--error, .el-alert--warning').allInnerTexts().catch(() => [])
    // 主体内容前 300 字（判断空白/异常页）
    const body = await page.locator('body').innerText().catch(() => '')
    result.bodyHead = body.replace(/\n+/g, ' ').slice(0, 300)
  } catch (e) { result.probeErr = e.message.slice(0, 120) }
  await ctx.close()
  return result
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const apiCtx = await browser.newContext({ ignoreHTTPSErrors: true })
const adminToken = await login(apiCtx.request, '/api/auth/demo-login')
const memberToken = await login(apiCtx.request, '/api/auth/demo-member-login')

const checks = []
const report = { generatedAt: new Date().toISOString(), checks }

// ---- 1. 家族后台疑点 ----
for (const url of [
  '/zupu/zhuxi-demo/toolbox-usage',          // AI工具使用记录（E2E 中未跳转）
  '/zupu/zhuxi-demo/family-relation/reviews', // 家庭关系变更审核（ReferenceError clanId）
  '/zupu/zhuxi-demo/invite/reviews',          // 信息修改审核（WARN_TOAST）
  '/zupu/zhuxi-demo/family-relation/disputes',// 子女归属争议（WARN_TOAST）
  '/zupu/zhuxi-demo/sms/send',                // 发送短信（WARN_TOAST）
  '/zupu/zhuxi-demo/media/albums',            // 相册管理（对照组）
]) {
  checks.push({ scope: 'admin', ...(await probe(browser, 'geneasphere_token', adminToken, BASE + url)) })
}

// ---- 2. 用户中心疑点 ----
for (const url of [
  '/user-center/verify',       // 我的验证（E2E 中未跳转）
  '/user-center/timeline',     // 我的时光（E2E 中点击落点错误）
  '/user-center/toolbox',      // 我的工具箱（3 个 toast）
  '/user-center/profile',      // 对照组
]) {
  checks.push({ scope: 'user', ...(await probe(browser, 'geneasphere_token', memberToken, BASE + url)) })
}

// ---- 3. 平台登录 ----
{
  const r = await apiCtx.request.post(`${BASE}/api/platform/auth/login`, { data: { username: 'platform_admin', password: 'admin123' } })
  checks.push({ scope: 'platform-login-api', status: r.status(), body: (await r.text()).slice(0, 200) })
}

// ---- 4. 权限边界 ----
checks.push({ scope: 'boundary', ...(await probe(browser, 'geneasphere_token', memberToken, BASE + '/zupu/zhuxi-demo/members', 3000)) })

writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))
await browser.close()
