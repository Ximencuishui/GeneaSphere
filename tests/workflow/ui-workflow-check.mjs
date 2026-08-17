#!/usr/bin/env node
/**
 * 修谱工作流 UI 验证（Playwright + msedge）
 * 验证控制台与【修谱】功能顶部展示工作流条：
 *   1. /zupu/:slug（控制面板）顶部显示「修谱工作流」7 阶段 + 旧谱电子化子步骤
 *   2. /zupu/:slug/genealogy/history（修谱-历史版本）顶部显示
 *   3. /zupu/:slug/import（修谱-PDF 导入管理）顶部显示
 *   4. 当前阶段高亮（current 样式）、已完成阶段（done 样式）数量正确
 * 输出截图到 tests/workflow/screenshots/
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.WORKFLOW_UI_BASE || 'http://localhost:5174'
const API_BASE = process.env.WORKFLOW_UI_API || 'http://127.0.0.1:3102'
const SHOT_DIR = join(__dirname, 'screenshots')
mkdirSync(SHOT_DIR, { recursive: true })

const report = { base: BASE, checks: [], screenshots: [] }
let failed = 0
function check(name, ok, detail = '') {
  report.checks.push({ name, ok: !!ok, detail })
  if (!ok) failed++
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. 通过 API 获取真实 token
const login = await fetch(`${API_BASE}/api/auth/demo-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
})
const { access_token: token, demoClanSlug } = await login.json()
const slug = demoClanSlug || 'zhuxi-demo'

// 2. 获取工作流数据作为对照
const wfRes = await fetch(`${API_BASE}/api/genealogy-workflow/status?clanId=${slug}`, {
  headers: { Authorization: `Bearer ${token}` },
})
const wf = await wfRes.json()
console.log(`工作流 API：progress=${wf.progress}% current=${wf.current_label} 阶段数=${wf.stages.length}`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })

async function pageWithToken() {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
  })
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem('geneasphere_token', t)
      localStorage.setItem('demo_clan_slug', s)
    },
    [token, slug],
  )
  return ctx
}

async function assertWorkflowBar(page, label) {
  await page.waitForSelector('.genealogy-workflow-bar', { timeout: 20000 }).catch(() => {})
  const visible = (await page.locator('.genealogy-workflow-bar').count()) > 0
  check(`${label}：工作流条渲染`, visible)

  const title = visible ? (await page.locator('.genealogy-workflow-bar .wf-name').first().innerText().catch(() => '')) || '' : ''
  check(`${label}：标题为「修谱工作流」`, title.includes('修谱工作流'), title)

  const stageLabels = visible
    ? await page.locator('.genealogy-workflow-bar .wf-step .wf-label').allInnerTexts()
    : []
  const expectLabels = ['新建族谱', '旧谱电子化', '发通知族员', '族员自行更改', '审核', '新谱建成', '印刷出谱']
  const missing = expectLabels.filter((l) => !stageLabels.some((s) => s.includes(l)))
  check(`${label}：7 个阶段标签齐全`, missing.length === 0, `缺失=${missing.join(',') || '无'}`)

  const doneCount = visible ? await page.locator('.genealogy-workflow-bar .wf-step.done').count() : 0
  const currentCount = visible ? await page.locator('.genealogy-workflow-bar .wf-step.current').count() : 0
  check(`${label}：存在已完成与当前高亮阶段`, doneCount > 0 && currentCount > 0, `done=${doneCount} current=${currentCount}`)

  const substeps = visible ? await page.locator('.genealogy-workflow-bar .wf-substep').allInnerTexts() : []
  check(`${label}：旧谱电子化 4 子步骤展示`, substeps.length === 4, `子步骤=${substeps.length}`)

  const progressText = visible ? (await page.locator('.genealogy-workflow-bar .wf-progress-num').first().innerText().catch(() => '')) || '' : ''
  check(`${label}：进度百分比展示`, /%$/.test(progressText), progressText)
}

try {
  // ===== 控制面板 =====
  {
    const ctx = await pageWithToken()
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 200))
    })
    await page.goto(`${BASE}/zupu/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(6000)
    await assertWorkflowBar(page, '控制面板(/zupu/:slug)')
    check('控制面板：无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200))
    const shot = join(SHOT_DIR, '01-dashboard-workflow.png')
    await page.screenshot({ path: shot, fullPage: false })
    report.screenshots.push(shot)
    await ctx.close()
  }

  // ===== 修谱-历史版本 =====
  {
    const ctx = await pageWithToken()
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)))
    await page.goto(`${BASE}/zupu/${slug}/genealogy/history`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(5000)
    await assertWorkflowBar(page, '修谱-历史版本')
    check('修谱-历史版本：无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200))
    const shot = join(SHOT_DIR, '02-history-workflow.png')
    await page.screenshot({ path: shot, fullPage: false })
    report.screenshots.push(shot)
    await ctx.close()
  }

  // ===== 修谱-PDF 导入管理 =====
  {
    const ctx = await pageWithToken()
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)))
    await page.goto(`${BASE}/zupu/${slug}/import`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(5000)
    await assertWorkflowBar(page, '修谱-PDF导入管理')
    check('修谱-PDF导入管理：无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200))
    const shot = join(SHOT_DIR, '03-import-workflow.png')
    await page.screenshot({ path: shot, fullPage: false })
    report.screenshots.push(shot)
    await ctx.close()
  }
} catch (err) {
  console.error('UI 测试异常:', err)
  failed++
} finally {
  await browser.close().catch(() => {})
  report.passed = failed === 0
  const out = join(__dirname, 'reports', 'admin-genealogy-workflow-ui-report.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\n${failed === 0 ? '🎉 UI 验证全部通过' : `💥 ${failed} 项未通过`} → ${out}`)
  console.log(`截图目录：${SHOT_DIR}`)
  process.exit(failed === 0 ? 0 : 1)
}
