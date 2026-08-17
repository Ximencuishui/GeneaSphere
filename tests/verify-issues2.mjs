#!/usr/bin/env node
/**
 * 复验 v2：耐心等待加载完成；平台后台用 API token 直登；捕获 console warning（图标解析警告）
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'temp', 'verify2-report.json')
const BASE = 'http://43.134.232.175'
const report = { generatedAt: new Date().toISOString(), checks: [] }

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const apiCtx = await browser.newContext({ ignoreHTTPSErrors: true })

async function login(ep) {
  const r = await apiCtx.request.post(`${BASE}${ep}`, { data: {} })
  return (await r.json()).access_token
}

async function ctxWithToken(key, token) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(([k, t]) => {
    localStorage.setItem(k, t)
    if (k === 'geneasphere_token') localStorage.setItem('demo_clan_slug', 'zhuxi-demo')
  }, [key, token])
  return ctx
}

async function openPage(ctx, url, waitSel, waitMs = 12000) {
  const page = await ctx.newPage()
  const issues = []
  page.on('pageerror', (e) => issues.push(`PAGEERROR: ${e.message.slice(0, 250)}`))
  page.on('console', (m) => {
    if (m.type() === 'error') issues.push(`CONSOLE-ERR: ${m.text().slice(0, 250)}`)
    else if (m.type() === 'warning' && /resolve component/i.test(m.text())) issues.push(`CONSOLE-WARN: ${m.text().slice(0, 200)}`)
  })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => issues.push(`GOTO: ${e.message.slice(0, 100)}`))
  if (waitSel) await page.waitForSelector(waitSel, { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(waitMs)
  return { page, issues }
}

// ---- 1. 家族后台 5 个疑点页（等待 .admin-menu + 内容渲染） ----
const adminToken = await login('/api/auth/demo-login')
{
  const ctx = await ctxWithToken('geneasphere_token', adminToken)
  for (const url of [
    '/zupu/zhuxi-demo/toolbox-usage',
    '/zupu/zhuxi-demo/family-relation/reviews',
    '/zupu/zhuxi-demo/invite/reviews',
    '/zupu/zhuxi-demo/family-relation/disputes',
    '/zupu/zhuxi-demo/sms/send',
  ]) {
    const { page, issues } = await openPage(ctx, BASE + url, '.admin-menu', 6000)
    const toasts = await page.locator('.el-message--error').allInnerTexts().catch(() => [])
    const content = (await page.locator('.content-area').innerText().catch(() => '')).replace(/\n+/g, ' ').slice(0, 200)
    report.checks.push({ scope: 'admin', url, finalUrl: page.url(), issues, toasts, content })
    writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8')
    await page.close()
  }
  await ctx.close()
}

// ---- 2. 用户中心（等待侧边栏渲染完成） ----
const memberToken = await login('/api/auth/demo-member-login')
{
  const ctx = await ctxWithToken('geneasphere_token', memberToken)
  for (const url of ['/user-center/verify', '/user-center/toolbox', '/user-center/timeline']) {
    const { page, issues } = await openPage(ctx, BASE + url, '.side-menu', 10000)
    const toasts = await page.locator('.el-message--error').allInnerTexts().catch(() => [])
    const content = (await page.locator('.content-area').innerText().catch(() => '')).replace(/\n+/g, ' ').slice(0, 250)
    report.checks.push({ scope: 'user', url, finalUrl: page.url(), issues, toasts, content })
    writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8')
    await page.close()
  }
  await ctx.close()
}

// ---- 3. 平台后台：API token 直登 + 全菜单遍历 ----
{
  const r = await apiCtx.request.post(`${BASE}/api/platform/auth/login`, { data: { username: 'platform_admin', password: 'admin123' } })
  const pToken = (await r.json()).access_token
  const ctx = await ctxWithToken('geneasphere_platform_token', pToken)
  const { page, issues: initIssues } = await openPage(ctx, `${BASE}/platform-admin/dashboard`, '.platform-layout .el-sub-menu__title', 5000)
  report.checks.push({ scope: 'platform', url: '/platform-admin/dashboard', finalUrl: page.url(), issues: initIssues })
  writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8')
  // 展开所有分组
  const groups = page.locator('.platform-layout .el-sub-menu__title')
  const g = await groups.count()
  for (let i = 0; i < g; i++) {
    try { const t = groups.nth(i); if (!((await t.getAttribute('class')) || '').includes('is-opened')) await t.click({ timeout: 2000 }) } catch { }
  }
  await page.waitForTimeout(800)
  // 收集全部菜单项（文本列表）
  const allItems = []
  {
    const items = page.locator('.platform-layout .el-menu-item')
    const n = await items.count()
    for (let i = 0; i < n; i++) allItems.push(((await items.nth(i).textContent()) || '').trim())
  }
  for (const text of allItems) {
    try {
      // 每次点击前重新定位（导航后 DOM 可能变化）
      const it = page.locator('.platform-layout .el-menu-item', { hasText: text })
      await it.first().click({ timeout: 4000 })
      await page.waitForTimeout(4000)
    } catch (e) {
      report.checks.push({ scope: 'platform', menu: text, status: 'CLICK_ERR', finalUrl: page.url(), err: e.message.slice(0, 100) })
      continue
    }
    const toasts = await page.locator('.el-message--error').allInnerTexts().catch(() => [])
    const content = (await page.locator('.content-area').innerText().catch(() => '')).replace(/\n+/g, ' ').slice(0, 150)
    report.checks.push({ scope: 'platform', menu: text, url: page.url(), finalUrl: page.url(), toasts, content })
  }
  await ctx.close()
}

// ---- 4. 边界：EDITOR → 家族后台 ----
{
  const ctx = await ctxWithToken('geneasphere_token', memberToken)
  const { page, issues } = await openPage(ctx, `${BASE}/zupu/zhuxi-demo/members`, null, 6000)
  const content = (await page.locator('body').innerText().catch(() => '')).replace(/\n+/g, ' ').slice(0, 250)
  report.checks.push({ scope: 'boundary', name: 'EDITOR→/zupu/zhuxi-demo/members', finalUrl: page.url(), issues, content })
  await ctx.close()
}

writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))
await browser.close()
