/**
 * 族谱树第三轮：搜索定位 + 节点点击详情 + 画布绘制密度 + 金色高亮像素
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

  // A. 画布像素密度（4 层 canvas 是否真有内容）
  const pixel = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('.genealogy-tree-canvas canvas'));
    return canvases.map((c, i) => {
      try {
        const ctx = c.getContext('2d');
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let nonBg = 0, colored = 0;
        for (let p = 0; p < data.length; p += 4 * 300) {
          const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
          if (a > 10) { nonBg++; if (!(Math.abs(r - g) < 12 && Math.abs(g - b) < 12)) colored++; }
        }
        return { layer: i, nonBg, colored };
      } catch (e) { return { layer: i, error: e.message }; }
    });
  });
  step('canvas-pixel-density', pixel);

  // B. 搜索 朱熹（正确选择器：工具栏 el-input）
  const searchInput = page.locator('.tree-toolbar input.el-input__inner').first();
  await searchInput.fill('朱熹');
  await page.waitForTimeout(1200);
  const toasts = await page.evaluate(() => Array.from(document.querySelectorAll('.el-message')).map((m) => m.textContent.trim()).slice(0, 5));
  step('search-toasts', { toasts });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(OUT, '30-search-zhuxi.png') });

  // 搜索后 placeholder 变化（找到 N 个结果）
  const phAfter = await searchInput.getAttribute('placeholder');
  step('placeholder-after-search', { phAfter });

  // C. 点击画布中心（聚焦节点应在中心附近）
  const box = await page.locator('.genealogy-tree-canvas').boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(2000);
    const detail = await page.evaluate(() => {
      const panel = document.querySelector('.detail-panel');
      if (!panel) return null;
      const name = panel.querySelector('.person-name')?.textContent?.trim() || null;
      const meta = panel.querySelector('.person-meta')?.innerText?.replace(/\s+/g, ' ').trim() || null;
      const hasActions = !!panel.querySelector('.person-actions');
      return { name, meta, hasActions };
    });
    step('detail-panel-after-click', detail);
    await page.screenshot({ path: resolve(OUT, '31-detail-panel.png') });
  }

  // D. 金色高亮像素：聚焦传承前 vs 后
  const goldCount = () => page.evaluate(() => {
    const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[2];
    if (!c) return null;
    const ctx = c.getContext('2d');
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let gold = 0;
    for (let p = 0; p < data.length; p += 4 * 300) {
      const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
      if (a > 100 && r > 150 && g > 110 && g < 210 && b < 140 && r >= g && g > b) gold++;
    }
    return gold;
  });
  step('gold-before-focus', { count: await goldCount() });
  const focusBtn = page.locator('button', { hasText: '聚焦传承' }).first();
  if (await focusBtn.count()) {
    await focusBtn.click();
    await page.waitForTimeout(3000);
    step('gold-after-focus', { count: await goldCount() });
    await page.screenshot({ path: resolve(OUT, '32-focus-lineage.png') });
  }

  // E. 三代亲属
  const circleBtn = page.locator('button', { hasText: '三代亲属' }).first();
  if (await circleBtn.count()) {
    await circleBtn.click();
    await page.waitForTimeout(2500);
    step('gold-after-family-circle', { count: await goldCount() });
    await page.screenshot({ path: resolve(OUT, '33-family-circle.png') });
  }

  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal3.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results3.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results3.json'));
