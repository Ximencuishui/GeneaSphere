#!/usr/bin/env node
/** 平台后台侧边栏图标 DOM 检查 + 用户中心移动端通知按钮检查 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'temp', 'icon-probe.json')
const BASE = 'http://43.134.232.175'
const report = {}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const apiCtx = await browser.newContext()
const r = await apiCtx.request.post(`${BASE}/api/platform/auth/login`, { data: { username: 'platform_admin', password: 'admin123' } })
const pToken = (await r.json()).access_token

// 平台侧边栏
{
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript((t) => localStorage.setItem('geneasphere_platform_token', t), pToken)
  const page = await ctx.newPage()
  const warns = []
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warns.push(`${m.type()}: ${m.text().slice(0, 160)}`) })
  await page.goto(`${BASE}/platform-admin/dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('.platform-layout .el-sub-menu__title', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)
  // 展开分组后统计每个子菜单标题的 svg 图标
  const groups = page.locator('.platform-layout .el-sub-menu__title')
  const g = await groups.count()
  const groupIcons = []
  for (let i = 0; i < g; i++) {
    const el = groups.nth(i)
    const svg = await el.locator('svg').count()
    groupIcons.push({ group: ((await el.innerText()) || '').trim(), svgCount: svg })
  }
  report.platformSidebar = { groups: g, groupIcons, consoleWarns: warns.slice(0, 12) }
  await ctx.close()
}

// 用户中心侧边栏（对照组）
{
  const r2 = await apiCtx.request.post(`${BASE}/api/auth/demo-member-login`, { data: {} })
  const mToken = (await r2.json()).access_token
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript((t) => { localStorage.setItem('geneasphere_token', t); localStorage.setItem('demo_clan_slug', 'zhuxi-demo') }, mToken)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/user-center/profile`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('.side-menu', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const groupIcons = []
  const groups = page.locator('.side-menu .el-sub-menu__title')
  const g = await groups.count()
  for (let i = 0; i < g; i++) {
    const svg = await groups.nth(i).locator('svg').count()
    groupIcons.push({ group: ((await groups.nth(i).innerText()) || '').trim(), svgCount: svg })
  }
  // 移动端顶栏通知按钮是否有点击行为（无 @click 时点击无效）
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(800)
  const mobileTopbar = await page.locator('.mobile-topbar').count()
  const mobileBell = await page.locator('.mobile-topbar .el-button').count()
  report.userSidebar = { groups: g, groupIcons, mobileTopbarVisible: mobileTopbar > 0, mobileButtons: mobileBell }
  await ctx.close()
}

writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))
await browser.close()
