/**
 * 交互验证 v2：修正像素簇阈值（8px 格子 2px 采样 → 每格最多 16 点，阈值应为 5-6）
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

const findClusters = (page) => page.evaluate(() => {
  const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  const cell = 8, gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const grid = new Array(gw * gh).fill(0);
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const p = (y * w + x) * 4;
      if (data[p + 3] > 30) grid[(y / cell | 0) * gw + (x / cell | 0)]++;
    }
  }
  const clusters = []; const visited = new Set();
  for (let idx = 0; idx < grid.length; idx++) {
    if (grid[idx] < 5 || visited.has(idx)) continue;
    const stack = [idx]; const cells = []; visited.add(idx);
    while (stack.length) {
      const cur = stack.pop(); cells.push(cur);
      const cx2 = cur % gw, cy2 = (cur / gw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx2 + dx, ny = cy2 + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx;
        if (grid[ni] >= 3 && !visited.has(ni)) { visited.add(ni); stack.push(ni); }
      }
    }
    if (cells.length >= 4) {
      let sx = 0, sy = 0, sum = 0;
      for (const cc of cells) { const n = grid[cc]; sx += (cc % gw) * cell * n; sy += ((cc / gw) | 0) * cell * n; sum += n; }
      clusters.push({ x: Math.round(sx / sum), y: Math.round(sy / sum), cellCount: cells.length, density: sum });
    }
  }
  return clusters.sort((a, b) => b.density - a.density).slice(0, 15);
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.click('.btn-demo-admin');
  await page.waitForURL(/\/zupu\/zhuxi-demo/, { timeout: 60000 });
  await page.goto(`${BASE}/tree/zhuxi-demo`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.tree-stats', { timeout: 240000 }).catch(() => {});
  await page.waitForSelector('.tree-loading', { state: 'detached', timeout: 240000 }).catch(() => {});
  await page.waitForSelector('.genealogy-tree-canvas', { state: 'visible', timeout: 240000 });
  await page.waitForTimeout(5000);

  const box = await page.locator('.genealogy-tree-canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  // 放大到 ~1.5x
  for (let i = 0; i < 3; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -400); await page.waitForTimeout(150); }
  await page.waitForTimeout(1500);
  const zoom0 = await page.evaluate(() => document.querySelector('.perf-overlay')?.innerText?.replace(/\s+/g, ' ').trim() || null);
  step('zoom-start', { zoom0 });

  const clusters = await findClusters(page);
  step('node-clusters', clusters);

  // ── 防重叠（初始布局）──
  if (clusters.length >= 2) {
    const close = [];
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const dx = Math.abs(clusters[i].x - clusters[j].x);
        const dy = Math.abs(clusters[j].y - clusters[j].y);
        if (dx < 50 && dy < 70) close.push({ a: clusters[i], b: clusters[j], dx, dy });
      }
    }
    step('overlap-check-initial', { clusterCount: clusters.length, closePairs: close });
  }

  // ── 拖动测试 ──
  if (clusters.length) {
    const t = clusters[0];
    const sx = box.x + t.x, sy = box.y + t.y;
    const dx = 90, dy = 0;
    // 拖动前抓取节点及其上方（父边）附近像素
    const grab = (ox, oy) => page.evaluate(({ ox, oy }) => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;
      const R = 6;
      const hits = [];
      for (let y = Math.max(0, oy - R); y <= Math.min(h - 1, oy + R); y += 1) {
        for (let x = Math.max(0, ox - R); x <= Math.min(w - 1, ox + R); x += 1) {
          const p = (y * w + x) * 4;
          if (dataNaN(p) || false) {}
          const d2 = ctx.getImageData(x, y, 1, 1).data;
          if (d2[3] > 30) hits.push([x, y, d2[0], d2[1], d2[2]]);
        }
      }
      return hits.slice(0, 60);
    }, { ox, oy });
    // 简化：只记录指定点颜色
    const px = (ox, oy) => page.evaluate(({ ox, oy }) => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      if (!c) return null;
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(Math.max(0, ox | 0), Math.max(0, oy | 0), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    }, { ox, oy });

    const samplePoints = {
      nodeCenter: { x: t.x, y: t.y },
      up30: { x: t.x, y: t.y - 30 },
      down30: { x: t.x, y: t.y + 30 },
      right25: { x: t.x + 25, y: t.y },
      up60: { x: t.x, y: t.y - 60 },
    };
    const before = {};
    for (const [k, pt] of Object.entries(samplePoints)) before[k] = await px(pt.x, pt.y);

    await page.mouse.move(sx, sy);
    await page.waitForTimeout(250);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(sx + dx, sy + dy, { steps: 15 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(1000);

    const after = {};
    for (const [k, pt] of Object.entries(samplePoints)) {
      after[k] = await px(pt.x + (k === 'nodeCenter' || k === 'up30' || k === 'down30' || k === 'right25' || k === 'up60' ? dx : 0), pt.y + dy);
    }
    // 旧位置是否清空
    const oldPos = await px(t.x, t.y);

    step('drag-test', {
      from: { x: t.x, y: t.y }, delta: { dx, dy },
      before,
      after,
      oldPosAfter: oldPos,
    });
    await page.screenshot({ path: resolve(OUT, '92-after-drag.png') });

    // 拖动后防重叠
    const clusters2 = await findClusters(page);
    if (clusters2.length >= 2) {
      const close2 = [];
      for (let i = 0; i < clusters2.length; i++) {
        for (let j = i + 1; j < clusters2.length; j++) {
          const ddx = Math.abs(clusters2[i].x - clusters2[j].x);
          const ddy = Math.abs(clusters2[j].y - clusters2[j].y);
          if (ddx < 50 && ddy < 70) close2.push({ a: clusters2[i], b: clusters2[j], dx: ddx, dy: ddy });
        }
      }
      step('overlap-check-after-drag', { clusterCount: clusters2.length, closePairs: close2 });
    }
  }

  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal10.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results10.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results10.json'));
