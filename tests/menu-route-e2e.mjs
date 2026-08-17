#!/usr/bin/env node
/**
 * 菜单/路由全量实测（Playwright）
 * 覆盖：家族管理后台(OWNER) / 用户中心(EDITOR) / 平台管理后台(super)
 * 每项：点击菜单 → 记录 URL / 错误 toast / 404 / 空内容 / console 异常 / 高亮
 * 输出：temp/e2e-report.json + temp/e2e-shots/*.png
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'temp', 'e2e-shots')
const REPORT = join(__dirname, '..', 'temp', 'e2e-report.json')
const BASE = process.env.E2E_BASE || 'http://43.134.232.175'

mkdirSync(OUT, { recursive: true })

const results = { admin: [], user: [], platform: [], boundary: [] }
const consoleIssues = new Map() // url -> [msg]

function attachCapture(page, key) {
  page.on('pageerror', (err) => {
    const list = consoleIssues.get(key) || []
    list.push(`PAGEERROR: ${err.message}`)
    consoleIssues.set(key, list)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // 忽略资源加载 404（不影响路由正确性）
      if (/Failed to load resource|net::ERR_|404/.test(text)) return
      const list = consoleIssues.get(key) || []
      list.push(`CONSOLE[${msg.type()}]: ${text.slice(0, 200)}`)
      consoleIssues.set(key, list)
    }
  })
}

async function loginToken(request, ep) {
  const resp = await request.post(`${BASE}${ep}`, { data: {} })
  const data = await resp.json()
  return { token: data.access_token, user: data.user, slug: data.demoClanSlug }
}

async function newContextWithToken(browser, tokenKey, token) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  await context.addInitScript(([k, t]) => {
    localStorage.setItem(k, t)
    if (k === 'geneasphere_token') localStorage.setItem('demo_clan_slug', 'zhuxi-demo')
  }, [tokenKey, token])
  return context
}

async function collectMenuItems(page, subMenuSel, itemSel) {
  // 展开所有分组
  const groups = page.locator(subMenuSel)
  const g = await groups.count()
  for (let i = 0; i < g; i++) {
    try {
      const t = groups.nth(i)
      const cls = (await t.getAttribute('class')) || ''
      if (!cls.includes('is-opened')) await t.click({ timeout: 1500 })
    } catch { /* ignore */ }
  }
  await page.waitForTimeout(600)
  const items = page.locator(itemSel)
  const n = await items.count()
  const out = []
  for (let i = 0; i < n; i++) {
    const text = ((await items.nth(i).textContent()) || '').trim()
    out.push({ text, index: i })
  }
  return out
}

async function walkMenus(page, ctx, items, section, basePath) {
  for (const item of items) {
    const key = `${section}::${item.text}`
    const before = page.url()
    try {
      await page.locator('.el-menu-item').nth(item.index).click({ timeout: 3000 })
      await page.waitForTimeout(2800)
    } catch (e) {
      results[section].push({ menu: item.text, status: 'CLICK_ERR', error: e.message.slice(0, 120), url: page.url() })
      continue
    }
    const url = page.url()
    const body = await page.locator('body').innerText().catch(() => '')
    const has404 = /404|页面不存在|NotFound/.test(body.slice(0, 2000))
    const errToast = await page.locator('.el-message--error, .el-alert--error').count().catch(() => 0)
    const blank = (await page.locator('main, .content-area, .el-main').first().innerText().catch(() => '')).trim().length < 5
    // 菜单高亮
    let highlighted = false
    try {
      const active = page.locator('.el-menu-item.is-active')
      const a = await active.count()
      for (let j = 0; j < a; j++) {
        const txt = ((await active.nth(j).textContent()) || '').trim()
        if (txt.includes(item.text)) { highlighted = true; break }
      }
    } catch { }
    const issues = consoleIssues.get(key) || []
    const status = has404 ? 'FAIL_404' : errToast > 0 ? 'WARN_TOAST' : blank ? 'FAIL_BLANK' : issues.length ? 'WARN_CONSOLE' : 'OK'
    results[section].push({ menu: item.text, url, status, has404, errToast, blank, highlighted, consoleIssues: issues })
    // 截图
    const safe = item.text.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 30)
    try { await page.screenshot({ path: join(OUT, `${section}-${String(results[section].length).padStart(2, '0')}-${safe}.png`) }) } catch { }
  }
}

const summary = (arr) => {
  const ok = arr.filter((r) => r.status === 'OK').length
  const warn = arr.filter((r) => r.status.startsWith('WARN')).length
  const fail = arr.filter((r) => r.status.startsWith('FAIL') || r.status === 'CLICK_ERR').length
  return { total: arr.length, ok, warn, fail }
}

// ---------------- 主流程 ----------------
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const apiCtx = await browser.newContext({ ignoreHTTPSErrors: true })
const apiRequest = apiCtx.request

try {
  // ========== 1. 家族后台 OWNER ==========
  {
    const { token } = await loginToken(apiRequest, '/api/auth/demo-login')
    const ctx = await newContextWithToken(browser, 'geneasphere_token', token)
    const page = await ctx.newPage()
    attachCapture(page, 'admin::init')
    await page.goto(`${BASE}/zupu/zhuxi-demo`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('.admin-menu', { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(2000)
    const items = await collectMenuItems(page, '.admin-menu .el-sub-menu__title', '.admin-menu .el-menu-item')
    console.log(`[admin] 收集到 ${items.length} 个菜单项`)
    await walkMenus(page, ctx, items, 'admin', '/zupu/zhuxi-demo')
    // 权限入口：个人设置下拉 → 隐私配置；验证路由守卫直接访问
    await page.close(); await ctx.close()
  }

  // ========== 2. 用户中心 EDITOR ==========
  {
    const { token } = await loginToken(apiRequest, '/api/auth/demo-member-login')
    const ctx = await newContextWithToken(browser, 'geneasphere_token', token)
    const page = await ctx.newPage()
    attachCapture(page, 'user::init')
    await page.goto(`${BASE}/user-center/profile`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // 等待侧边栏（PageLoader 结束）
    await page.waitForSelector('.side-menu', { timeout: 25000 }).catch(() => {})
    await page.waitForTimeout(2500)
    const items = await collectMenuItems(page, '.side-menu .el-sub-menu__title', '.side-menu .el-menu-item')
    console.log(`[user] 收集到 ${items.length} 个菜单项`)
    await walkMenus(page, ctx, items, 'user', '/user-center/profile')
    await page.close(); await ctx.close()
  }

  // ========== 3. 平台后台 super ==========
  {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    attachCapture(page, 'platform::init')
    // 走登录表单（验证平台登录可用）
    await page.goto(`${BASE}/platform-admin/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('input', { timeout: 15000 }).catch(() => {})
    await page.locator('input').nth(0).fill('platform_admin')
    await page.locator('input').nth(1).fill('admin123')
    await page.locator('button[type="submit"], button:has-text("登")').first().click().catch(() => {})
    await page.waitForURL(/platform-admin/, { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(2500)
    const menuSel = '.platform-layout .el-sub-menu__title'
    if (await page.locator(menuSel).count()) {
      const items = await collectMenuItems(page, menuSel, '.platform-layout .el-menu-item')
      console.log(`[platform] 收集到 ${items.length} 个菜单项`)
      await walkMenus(page, ctx, items, 'platform', '/platform-admin')
    } else {
      console.log('[platform] 未登录成功或菜单未渲染，URL=', page.url())
    }
    await page.close(); await ctx.close()
  }

  // ========== 4. 权限边界抽查 ==========
  {
    // EDITOR 访问家族后台 → 应被重定向 /clans
    const { token } = await loginToken(apiRequest, '/api/auth/demo-member-login')
    const ctx = await newContextWithToken(browser, 'geneasphere_token', token)
    const page = await ctx.newPage()
    await page.goto(`${BASE}/zupu/zhuxi-demo/members`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2500)
    results.boundary.push({ name: 'EDITOR→家族后台', url: page.url(), expect: '/clans', pass: page.url().includes('/clans') })
    // 匿名访问用户中心 → /login
    const anon = await browser.newContext({ ignoreHTTPSErrors: true })
    const ap = await anon.newPage()
    await ap.goto(`${BASE}/user-center/profile`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await ap.waitForTimeout(2500)
    results.boundary.push({ name: '匿名→用户中心', url: ap.url(), expect: '/login', pass: ap.url().includes('/login') })
    await ap.close(); await anon.close()
    await page.close(); await ctx.close()
  }
} finally {
  await browser.close()
}

const report = {
  base: BASE,
  generatedAt: new Date().toISOString(),
  summary: {
    admin: summary(results.admin),
    user: summary(results.user),
    platform: summary(results.platform),
    boundary: results.boundary,
  },
  details: results,
  consoleIssues: Object.fromEntries(consoleIssues),
}
writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8')
console.log('\n===== 汇总 =====')
console.log('家族后台:', JSON.stringify(report.summary.admin))
console.log('用户中心:', JSON.stringify(report.summary.user))
console.log('平台后台:', JSON.stringify(report.summary.platform))
console.log('边界:', JSON.stringify(report.summary.boundary))
console.log('报告:', REPORT)
