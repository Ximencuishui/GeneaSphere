/**
 * 族谱树第七轮：避开工具栏区域，用 #g6-tooltip 探测节点 → 点击 → 详情面板
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
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  // 放大到 ~1.5x 让节点更大
  for (let i = 0; i < 2; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -350); await page.waitForTimeout(150); }
  await page.waitForTimeout(1500);

  // 在画布中部区域网格悬停（避开顶部工具栏 y<60 和底部 stats）
  const y0 = 70, y1 = box.height - 80;
  const hits = [];
  outer:
  for (let y = y0; y <= y1; y += 45) {
    for (let x = 30; x <= box.width - 30; x += 45) {
      await page.mouse.move(box.x + x, box.y + y);
      await page.waitForTimeout(200);
      const tip = await page.evaluate(() => {
        const el = document.getElementById('g6-tooltip');
        if (!el) return null;
        const t = (el.innerText || '').trim();
        if (!t) return null;
        const r = el.getBoundingClientRect();
        return { text: t.slice(0, 100), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
      });
      if (tip) {
        hits.push({ x, y, tip });
        step('node-hover-tooltip', { at: { x, y }, tip });
        // 点击节点
        await page.mouse.click(box.x + x, box.y + y);
        await page.waitForTimeout(1800);
        const detail = await page.evaluate(() => {
          const panel = document.querySelector('.detail-panel');
          if (!panel) return null;
          const name = panel.querySelector('.person-name')?.textContent?.trim() || null;
          const meta = panel.querySelector('.person-meta')?.innerText?.replace(/\s+/g, ' ').trim() || null;
          const sectionTitles = Array.from(panel.querySelectorAll('.section-title')).map((s) => s.textContent.trim());
          return { name, meta, sectionTitles };
        });
        step('detail-after-node-click', detail);
        if (detail) {
          await page.screenshot({ path: resolve(OUT, '70-detail-open.png') });
          break outer;
        }
      }
    }
  }
  if (!hits.length) step('hover-scan', { note: 'no #g6-tooltip appeared in scan' });

  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal7.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results7.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results7.json'));
