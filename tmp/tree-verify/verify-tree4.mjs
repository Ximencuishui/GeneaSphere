/**
 * 族谱树第四轮：通过悬停 tooltip 探测节点真实位置 → 点击 → 验证详情面板
 * 同时做：画布内容包围盒、缩放后重采样、金色像素（放大后）
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

const tooltipVisible = () => page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('body *')).filter((el) => {
    const t = (el.textContent || '').trim();
    return t.length > 0 && t.length < 30 && /[\u4e00-\u9fa5]/.test(t);
  });
  // 找可见的浮动层（有 zh 文本、fixed/absolute 定位、出现在画布上方）
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'absolute') {
      const r = el.getBoundingClientRect();
      if (r.width > 20 && r.width < 320 && r.height > 16 && r.height < 200) {
        return { text: t.slice(0, 60), tag: el.tagName, cls: el.className, x: Math.round(r.x), y: Math.round(r.y) };
      }
    }
  }
  return null;
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.click('.btn-demo-admin');
  await page.waitForURL(/\/zupu\/zhuxi-demo/, { timeout: 60000 });
  await page.goto(`${BASE}/tree/zhuxi-demo`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.tree-stats', { timeout: 180000 }).catch(() => {});
  await page.waitForSelector('.tree-loading', { state: 'detached', timeout: 180000 }).catch(() => {});
  await page.waitForSelector('.genealogy-tree-canvas', { state: 'visible', timeout: 180000 });
  await page.waitForTimeout(4000);

  const box = await page.locator('.genealogy-tree-canvas').boundingBox();
  step('canvas-box', box);

  // A. 内容包围盒（密集扫描 layer1）
  const contentBBox = await page.evaluate(() => {
    const cs = document.querySelectorAll('.genealogy-tree-canvas canvas');
    let main = null;
    for (const c of cs) { if (c.width > 0 && c.height > 0) { main = c; break; } }
    if (!main) return null;
    const ctx = main.getContext('2d');
    const w = main.width, h = main.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const p = (y * w + x) * 4;
        if (data[p + 3] > 10) {
          count++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    return { minX, minY, maxX, maxY, sampledCount: count };
  });
  step('content-bbox', contentBBox);

  // B. 悬停探测节点（在内容 bbox 内按网格移动鼠标，找 tooltip）
  const found = [];
  if (contentBBox && contentBBox.maxX > 0) {
    const { minX, minY, maxX, maxY } = contentBBox;
    const stepX = Math.max(24, Math.floor((maxX - minX) / 30));
    const stepY = Math.max(24, Math.floor((maxY - minY) / 30));
    outer:
    for (let y = minY; y <= maxY; y += stepY) {
      for (let x = minX; x <= maxX; x += stepX) {
        await page.mouse.move(box.x + x, box.y + y);
        await page.waitForTimeout(120);
        const t = await tooltipVisible();
        if (t) {
          found.push({ x, y, tooltip: t });
          step('tooltip-found', { x, y, tooltip: t });
          // 点击该节点
          await page.mouse.click(box.x + x, box.y + y);
          await page.waitForTimeout(1500);
          const detail = await page.evaluate(() => {
            const panel = document.querySelector('.detail-panel');
            if (!panel) return null;
            const name = panel.querySelector('.person-name')?.textContent?.trim() || null;
            const meta = panel.querySelector('.person-meta')?.innerText?.replace(/\s+/g, ' ').trim() || null;
            return { name, meta };
          });
          step('detail-after-node-click', detail);
          if (detail) {
            await page.screenshot({ path: resolve(OUT, '40-detail-open.png') });
            break outer;
          }
        }
      }
    }
    if (!found.length) step('tooltip-scan', { note: 'no tooltip found in grid scan' });
  }

  // C. 放大后重采样金色像素
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (let i = 0; i < 6; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -400); await page.waitForTimeout(150); }
  await page.waitForTimeout(1200);
  const zoomed = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('.genealogy-tree-canvas canvas'));
    const res = canvases.map((c, i) => {
      try {
        const ctx = c.getContext('2d');
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let nonBg = 0, colored = 0, gold = 0;
        for (let p = 0; p < data.length; p += 4 * 150) {
          const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
          if (a > 30) { nonBg++; if (!(Math.abs(r - g) < 12 && Math.abs(g - b) < 12)) colored++; }
          if (a > 100 && r > 150 && g > 110 && g < 210 && b < 140 && r >= g && g > b) gold++;
        }
        return { layer: i, nonBg, colored, gold };
      } catch (e) { return { layer: i, error: e.message }; }
    });
    const perf = document.querySelector('.perf-overlay')?.innerText?.replace(/\s+/g, ' ').trim() || null;
    return { res, perf };
  });
  step('zoomed-sampling', zoomed);
  await page.screenshot({ path: resolve(OUT, '41-zoomed.png') });

  // D. 聚焦传承（放大后金色应更明显）
  const focusBtn = page.locator('button', { hasText: '聚焦传承' }).first();
  if (await focusBtn.count()) {
    await focusBtn.click();
    await page.waitForTimeout(2500);
    const gold = await page.evaluate(() => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let gold = 0;
      for (let p = 0; p < data.length; p += 4 * 150) {
        const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
        if (a > 100 && r > 150 && g > 110 && g < 210 && b < 140 && r >= g && g > b) gold++;
      }
      return gold;
    });
    step('gold-after-focus-zoomed', { gold });
    await page.screenshot({ path: resolve(OUT, '42-focus-zoomed.png') });
  }

  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal4.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results4.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results4.json'));
