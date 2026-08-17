/**
 * 族谱树第二轮验证：搜索定位 + 节点点击 + 金色高亮像素统计 + 画布绘制密度
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname);
const BASE = 'http://localhost:5173';
mkdirSync(OUT, { recursive: true });

const out = { steps: [] };
const step = (name, detail) => { out.steps.push({ name, ...detail }); console.log(`[step] ${name}: ${JSON.stringify(detail)}`); };

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.click('.btn-demo-admin');
  await page.waitForURL(/\/zupu\/zhuxi-demo/, { timeout: 60000 });
  await page.goto(`${BASE}/tree/zhuxi-demo`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.tree-stats', { timeout: 180000 }).catch(() => {});
  await page.waitForSelector('.tree-loading', { state: 'detached', timeout: 180000 }).catch(() => {});
  await page.waitForSelector('.genealogy-tree-canvas', { state: 'visible', timeout: 180000 });
  await page.waitForTimeout(5000);

  // ── A. 搜索：真正的搜索框 placeholder="搜索姓名…" ──
  const searchInput = page.locator('input[placeholder*="搜索姓名"]').first();
  if (await searchInput.count()) {
    await searchInput.fill('朱熹');
    await page.waitForTimeout(2000);
    const dropdownText = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.search-result-item, .search-dropdown-item, .el-select-dropdown__item'))
        .map((el) => el.textContent.trim()).filter(Boolean).slice(0, 10);
      const visiblePop = Array.from(document.querySelectorAll('.el-popover, .el-popper, [class*="search"], [class*="dropdown"], [class*="result"]'))
        .filter((el) => el.offsetParent !== null)
        .map((el) => el.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 5);
      return { items, visiblePop };
    });
    step('search-zhu-xi', dropdownText);
    await page.screenshot({ path: resolve(OUT, '20-search.png') });

    // 尝试点击第一个搜索联想结果
    const firstResult = page.locator('.search-result-item').first();
    if (await firstResult.count()) {
      await firstResult.click();
      await page.waitForTimeout(2500);
      step('search-result-clicked', { url: page.url() });
      await page.screenshot({ path: resolve(OUT, '21-search-focused.png') });
      // 聚焦后点击画布中心（节点应在中心）
      const box = await page.locator('.genealogy-tree-canvas').boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(1800);
      }
    } else {
      // 无联想列表 → 尝试键盘 Enter
      await searchInput.press('Enter');
      await page.waitForTimeout(2500);
    }
  } else {
    step('search-input-not-found', { toolbarText: await page.locator('.tree-toolbar').innerText().catch(() => '') });
  }

  // ── B. 详情面板（点击后）──
  const detail = await page.evaluate(() => {
    const panel = document.querySelector('.detail-panel');
    if (!panel) return null;
    const name = panel.querySelector('.person-name')?.textContent?.trim() || null;
    const meta = panel.querySelector('.person-meta')?.innerText?.replace(/\s+/g, ' ').trim() || null;
    return { visible: true, name, meta };
  });
  step('detail-panel-after-search', detail);
  await page.screenshot({ path: resolve(OUT, '22-detail-panel.png') });

  // ── C. 画布像素密度（确认真实绘制，非白屏）──
  const pixel = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('.genealogy-tree-canvas canvas'));
    const res = [];
    for (let i = 0; i < canvases.length; i++) {
      const c = canvases[i];
      try {
        const ctx = c.getContext('2d');
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let nonBg = 0; let colored = 0; const sample = {};
        const step = 400; // 采样步长（像素）
        for (let p = 0; p < data.length; p += 4 * step) {
          const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
          if (a > 10) {
            nonBg++;
            if (!(Math.abs(r - g) < 12 && Math.abs(g - b) < 12)) colored++; // 非灰 → 有颜色内容
          }
        }
        res.push({ layer: i, w: c.width, h: c.height, sampledNonBg: nonBg, sampledColored: colored });
      } catch (e) {
        res.push({ layer: i, error: e.message });
      }
    }
    return res;
  });
  step('canvas-pixel-density', pixel);

  // ── D. 聚焦传承：统计金色高亮节点像素 ──
  const before = await page.evaluate(() => {
    const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[2];
    if (!c) return null;
    const ctx = c.getContext('2d');
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let gold = 0;
    for (let p = 0; p < data.length; p += 400 * 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
      if (a > 100 && r > 150 && g > 110 && g < 200 && b < 130 && r > g && g > b) gold++;
    }
    return gold;
  });
  step('gold-pixels-before-focus', { sampledGold: before });

  const focusBtn = page.locator('button', { hasText: '聚焦传承' }).first();
  if (await focusBtn.count()) {
    await focusBtn.click();
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[2];
      if (!c) return null;
      const ctx = c.getContext('2d');
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let gold = 0;
      for (let p = 0; p < data.length; p += 400 * 4) {
        const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
        if (a > 100 && r > 150 && g > 110 && g < 200 && b < 130 && r > g && g > b) gold++;
      }
      return gold;
    });
    step('gold-pixels-after-focus', { sampledGold: after });
    await page.screenshot({ path: resolve(OUT, '23-focus-lineage.png') });
  }

  // ── E. 三代亲属 ──
  const circleBtn = page.locator('button', { hasText: '三代亲属' }).first();
  if (await circleBtn.count()) {
    await circleBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: resolve(OUT, '24-family-circle.png') });
    const hint = await page.evaluate(() => {
      const h = document.querySelector('[class*="highlight-hint"], .el-alert, [class*="family-circle"]');
      return h ? h.innerText.trim() : null;
    });
    step('family-circle-hint', { hint });
  }

  // ── F. 切换视图模式（如果存在按钮）──
  const viewBtns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.tree-toolbar button, .tree-toolbar [class*="view"], [class*="mode"]'))
      .map((b) => b.textContent.trim()).filter(Boolean).slice(0, 12);
  });
  step('view-buttons', { viewBtns });

  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal2.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results2.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results2.json'));
