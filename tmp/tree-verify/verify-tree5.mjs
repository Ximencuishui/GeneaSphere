/**
 * 族谱树第五轮：正确扫描 layer1 内容包围盒 → 悬停 tooltip → 点击节点 → 详情面板
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
  await page.waitForTimeout(4000);

  const box = await page.locator('.genealogy-tree-canvas').boundingBox();

  // A. 内容包围盒（扫描所有 canvas，取有内容的那个）
  const bbox = await page.evaluate(() => {
    const cs = Array.from(document.querySelectorAll('.genealogy-tree-canvas canvas'));
    let best = null;
    for (const c of cs) {
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;
      if (!w || !h) continue;
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
      if (count > 0) best = { layer: cs.indexOf(c), minX, minY, maxX, maxY, count };
    }
    return best;
  });
  step('content-bbox-layer1', bbox);

  // B. 悬停探测 tooltip → 点击
  let clicked = null;
  if (bbox) {
    const { minX, minY, maxX, maxY } = bbox;
    const w = maxX - minX, h = maxY - minY;
    const gridX = Math.max(3, Math.round(w / 90));
    const gridY = Math.max(3, Math.round(h / 90));
    const xStep = w / gridX, yStep = h / gridY;
    outer:
    for (let iy = 0; iy <= gridY; iy++) {
      for (let ix = 0; ix <= gridX; ix++) {
        const x = Math.round(minX + ix * xStep);
        const y = Math.round(minY + iy * yStep);
        await page.mouse.move(box.x + x, box.y + y);
        await page.waitForTimeout(100);
        const t = await page.evaluate(() => {
          // G6 tooltip 可能是自定义 HTML div（tooltip-x）
          const cands = Array.from(document.querySelectorAll('[class*="tooltip"], [class*="Tooltip"]'));
          for (const el of cands) {
            const cs = getComputedStyle(el);
            if (cs.visibility === 'visible' && cs.display !== 'none' && el.offsetParent !== null) {
              const r = el.getBoundingClientRect();
              if (r.width > 10 && r.height > 10) return { cls: el.className, text: el.innerText.trim().slice(0, 80), x: Math.round(r.x), y: Math.round(r.y) };
            }
          }
          return null;
        });
        if (t) {
          step('tooltip-at', { x, y, tooltip: t });
          await page.mouse.click(box.x + x, box.y + y);
          await page.waitForTimeout(1600);
          const detail = await page.evaluate(() => {
            const panel = document.querySelector('.detail-panel');
            if (!panel) return null;
            const name = panel.querySelector('.person-name')?.textContent?.trim() || null;
            const meta = panel.querySelector('.person-meta')?.innerText?.replace(/\s+/g, ' ').trim() || null;
            const info = panel.querySelector('.info-cards')?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 120) || null;
            return { name, meta, info };
          });
          step('detail-after-click', detail);
          if (detail) {
            clicked = detail;
            await page.screenshot({ path: resolve(OUT, '50-detail-open.png') });
            break outer;
          }
        }
      }
    }
    if (!clicked) step('node-click-scan', { note: 'tooltip not found; click scan finished' });
  }

  // C. 缩回 1x 后看全貌 + 截图
  const cxx = box.x + box.width / 2, cyy = box.y + box.height / 2;
  for (let i = 0; i < 6; i++) { await page.mouse.move(cxx, cyy); await page.mouse.wheel(0, 500); await page.waitForTimeout(120); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '51-overview.png') });

  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal5.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results5.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results5.json'));
