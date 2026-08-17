/**
 * 修复后验证：传承路径代际 / 女标签 / 节点数与配偶 / 控制台错误 / 布局
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
  await page.waitForSelector('.tree-stats', { timeout: 240000 }).catch(() => {});
  await page.waitForSelector('.tree-loading', { state: 'detached', timeout: 240000 }).catch(() => {});
  await page.waitForSelector('.genealogy-tree-canvas', { state: 'visible', timeout: 240000 });
  await page.waitForTimeout(6000);

  const metrics = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    return {
      lineageChip: q('.lineage-chip')?.textContent?.replace(/\s+/g, ' ').trim() || null,
      stats: q('.tree-stats')?.innerText?.replace(/\s+/g, ' ').trim() || null,
      perf: q('.perf-overlay')?.innerText?.replace(/\s+/g, ' ').trim() || null,
      toolbar: q('.tree-toolbar')?.innerText?.replace(/\s+/g, ' ').trim() || null,
      filterOptions: Array.from(document.querySelectorAll('.tree-toolbar .el-select .el-select__selected-item, .tree-toolbar .el-select input')).map((i) => i.getAttribute('placeholder') || i.value).filter(Boolean),
      errorPlaceholder: q('.tree-error-placeholder')?.innerText?.trim() || null,
      canvasLayers: Array.from(document.querySelectorAll('.genealogy-tree-canvas canvas')).map((c) => ({ w: c.width, h: c.height })),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  });
  step('tree-metrics-after-fix', metrics);
  await page.screenshot({ path: resolve(OUT, '80-after-fix-default.png') });

  // 打开性别筛选下拉，确认"女"标签
  const filterSelect = page.locator('.tree-toolbar .el-select').first();
  if (await filterSelect.count()) {
    await filterSelect.click();
    await page.waitForTimeout(800);
    const options = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.el-select-dropdown__item')).map((o) => o.textContent.trim()).filter(Boolean));
    step('gender-filter-options', { options });
    await page.screenshot({ path: resolve(OUT, '81-filter-female-label.png') });
    await page.keyboard.press('Escape');
  }

  // 画布像素密度（确认绘制内容）
  const pixel = await page.evaluate(() => {
    const cs = Array.from(document.querySelectorAll('.genealogy-tree-canvas canvas'));
    return cs.map((c, i) => {
      try {
        const ctx = c.getContext('2d');
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let nonBg = 0;
        for (let p = 0; p < data.length; p += 4 * 150) { if (data[p + 3] > 10) nonBg++; }
        return { layer: i, nonBg };
      } catch (e) { return { layer: i, error: e.message }; }
    });
  });
  step('canvas-density', pixel);

  // 放大后看配偶节点（红粉实线）与金色主脉
  const box = await page.locator('.genealogy-tree-canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (let i = 0; i < 5; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -400); await page.waitForTimeout(150); }
  await page.waitForTimeout(1500);
  const zoomPerf = await page.evaluate(() => document.querySelector('.perf-overlay')?.innerText?.replace(/\s+/g, ' ').trim() || null);
  step('zoomed-perf', { zoomPerf });
  await page.screenshot({ path: resolve(OUT, '82-after-fix-zoomed.png') });

  // 悬停探测（#g6-tooltip）验证节点可交互
  let tooltipSeen = null;
  const y0 = 80, y1 = box.height - 80;
  outer:
  for (let y = y0; y <= y1; y += 60) {
    for (let x = 40; x <= box.width - 40; x += 60) {
      await page.mouse.move(box.x + x, box.y + y);
      await page.waitForTimeout(150);
      const t = await page.evaluate(() => {
        const el = document.getElementById('g6-tooltip');
        if (!el) return null;
        const txt = (el.innerText || '').trim();
        return txt ? txt.slice(0, 60) : null;
      });
      if (t) { tooltipSeen = { x, y, text: t }; break outer; }
    }
  }
  step('tooltip-scan', { tooltipSeen });

  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal8.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results8.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results8.json'));
