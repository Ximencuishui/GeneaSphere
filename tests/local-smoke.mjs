#!/usr/bin/env node
/**
 * 本地冒烟测试：对本地构建产物（scripts/local-preview.mjs 静态服务）验证
 * - 家族后台：8 组新分组渲染、搜索过滤、多组展开、高亮
 * - 用户中心：4 组渲染、搜索、移动端通知抽屉
 * - 平台后台：8 组渲染、图标渲染、移动端汉堡菜单
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'temp', 'local-smoke.json')
const BASE = 'http://127.0.0.1:4174'
const report = { checks: [] }

// 构造带有效 exp 的假 token（客户端守卫只校验格式/exp/role，不验签）
function fakeToken(role) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ sub: 'local', phone: '13800000000', role, exp: Math.floor(Date.now() / 1000) + 3600 }))
  const b64url = (s) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64url(header)}.${b64url(payload)}.sig`
}
function fakePlatformToken() {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ sub: '1', username: 'platform_admin', role: 'super', exp: Math.floor(Date.now() / 1000) + 3600 }))
  const b64url = (s) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64url(header)}.${b64url(payload)}.sig`
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })

async function ctxWithToken(key, token) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(([k, t]) => {
    localStorage.setItem(k, t)
    if (k === 'geneasphere_token') localStorage.setItem('demo_clan_slug', 'zhuxi-demo')
  }, [key, token])
  return ctx
}

// ===== 1. 家族后台 =====
{
  const ctx = await ctxWithToken('geneasphere_token', fakeToken('OWNER'))
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)))
  await page.goto(`${BASE}/zupu/zhuxi-demo`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.admin-menu', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
  // 展开所有分组后收集组名
  const groups = page.locator('.admin-menu .el-sub-menu__title')
  const g = await groups.count()
  const groupNames = []
  for (let i = 0; i < g; i++) {
    await groups.nth(i).click().catch(() => {})
    groupNames.push(((await groups.nth(i).innerText()) || '').trim())
  }
  await page.waitForTimeout(500)
  const items = await page.locator('.admin-menu .el-menu-item').count()
  // 搜索框
  const searchVisible = await page.locator('.menu-search-input').count()
  await page.locator('.menu-search-input input').fill('统计')
  await page.waitForTimeout(500)
  const visibleItemsAfterSearch = []
  for (let i = 0; i < (await page.locator('.admin-menu .el-menu-item').count()); i++) {
    visibleItemsAfterSearch.push(((await page.locator('.admin-menu .el-menu-item').nth(i).innerText()) || '').trim())
  }
  await page.locator('.menu-search-input input').fill('')
  await page.waitForTimeout(300)
  // 多组展开验证：展开两个不同组
  const subTitles = page.locator('.admin-menu .el-sub-menu__title')
  const first = await subTitles.nth(0).getAttribute('class') || ''
  await subTitles.nth(1).click().catch(() => {})
  await page.waitForTimeout(300)
  const openedCount = await page.locator('.admin-menu .el-sub-menu.is-opened').count()
  report.checks.push({
    scope: 'admin-layout',
    groups: g, groupNames, items, searchVisible,
    searchResult: visibleItemsAfterSearch,
    multiOpenedCount: openedCount,
    firstOpenedBefore: first.includes('is-opened'),
    pageErrors: errs,
  })
  // 菜单点击 → 路由 + 高亮
  await page.locator('.admin-menu .el-menu-item', { hasText: '成员列表' }).first().click().catch(() => {})
  await page.waitForTimeout(1200)
  report.checks.push({ scope: 'admin-nav', url: page.url(), finalUrl: page.url() })
  await ctx.close()
}

// ===== 2. 用户中心 =====
{
  const ctx = await ctxWithToken('geneasphere_token', fakeToken('EDITOR'))
  const page = await ctx.newPage()
  await page.goto(`${BASE}/user-center/profile`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.side-menu', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const groups = page.locator('.side-menu .el-sub-menu__title')
  const g = await groups.count()
  const groupNames = []
  for (let i = 0; i < g; i++) groupNames.push(((await groups.nth(i).innerText()) || '').trim())
  // 搜索
  await page.locator('.menu-search input').fill('图册')
  await page.waitForTimeout(400)
  const searchItems = []
  for (let i = 0; i < (await page.locator('.side-menu .el-menu-item').count()); i++) {
    searchItems.push(((await page.locator('.side-menu .el-menu-item').nth(i).innerText()) || '').trim())
  }
  await page.locator('.menu-search input').fill('')
  await page.waitForTimeout(300)
  // 移动端通知抽屉
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(800)
  await page.locator('.mobile-topbar .el-button').nth(1).click().catch(() => {})
  await page.waitForTimeout(800)
  const notifyDrawerVisible = await page.locator('.el-drawer:visible').count()
  report.checks.push({ scope: 'user-layout', groups: g, groupNames, searchItems, notifyDrawerVisible })
  await ctx.close()
}

// ===== 3. 平台后台 =====
{
  const ctx = await ctxWithToken('geneasphere_platform_token', fakePlatformToken())
  const page = await ctx.newPage()
  await page.goto(`${BASE}/platform-admin/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.platform-layout .el-sub-menu__title', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const groups = page.locator('.platform-layout .el-sub-menu__title')
  const g = await groups.count()
  const groupIcons = []
  for (let i = 0; i < g; i++) {
    const svg = await groups.nth(i).locator('svg').count()
    groupIcons.push(svg)
  }
  // 移动端汉堡菜单
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(800)
  const hamburgerVisible = await page.locator('.platform-layout .mobile-menu-btn').count()
  await page.locator('.platform-layout .mobile-menu-btn').click().catch(() => {})
  await page.waitForTimeout(800)
  const sidebarVisible = (await page.locator('.platform-layout .sidebar').getAttribute('class') || '').includes('visible')
  report.checks.push({ scope: 'platform-layout', groups: g, groupIcons, hamburgerVisible, sidebarVisible })
  await ctx.close()
}

writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))
await browser.close()
