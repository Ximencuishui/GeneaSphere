/**
 * 族谱树第六轮：放大后按金色像素聚类定位主传承节点 → 点击 → 详情面板验证
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

  // 放大到 ~1.5x
  for (let i = 0; i < 2; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -350); await page.waitForTimeout(150); }
  await page.waitForTimeout(1200);
  const zoom1 = await page.evaluate(() => document.querySelector('.perf-overlay')?.innerText?.replace(/\s+/g, ' ').trim() || null);
  step('zoom-level-1', { zoom1 });

  // 找到金色像素聚类中心（主传承节点）
  const goldClusters = await page.evaluate(() => {
    const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    // 聚类：按 10px 网格统计金色像素密度
    const cell = 10, gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
    const grid = new Array(gw * gh).fill(0);
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const p = (y * w + x) * 4;
        const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
        if (a > 120 && r > 150 && g > 110 && g < 210 && b < 150 && r >= g && g > b) {
          grid[(y / cell | 0) * gw + (x / cell | 0)]++;
        }
      }
    }
    // 找局部高密度块（>30 的 cell）聚类
    const clusters = [];
    const visited = new Set();
    for (let idx = 0; idx < grid.length; idx++) {
      if (grid[idx] < 25 || visited.has(idx)) continue;
      // BFS
      const stack = [idx];
      const cells = [];
      visited.add(idx);
      while (stack.length) {
        const cur = stack.pop();
        cells.push(cur);
        const cx2 = cur % gw, cy2 = (cur / gw) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx2 + dx, ny = cy2 + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (grid[ni] >= 10 && !visited.has(ni)) { visited.add(ni); stack.push(ni); }
        }
      }
      if (cells.length) {
        let sx = 0, sy = 0, sum = 0;
        for (const cc of cells) {
          const n = grid[cc];
          sx += (cc % gw) * cell * n; sy += ((cc / gw) | 0) * cell * n; sum += n;
        }
        clusters.push({ x: Math.round(sx / sum), y: Math.round(sy / sum), cellCount: cells.length, density: sum });
      }
    }
    return clusters.sort((a, b) => b.density - a.density).slice(0, 6);
  });
  step('gold-clusters', goldClusters);

  // 点击最大金色聚类中心
  let clicked = null;
  if (goldClusters.length) {
    const g = goldClusters[0];
    await page.mouse.click(box.x + g.x, box.y + g.y);
    await page.waitForTimeout(1800);
    clicked = await page.evaluate(() => {
      const panel = document.querySelector('.detail-panel');
      if (!panel) return null;
      const name = panel.querySelector('.person-name')?.textContent?.trim() || null;
      const meta = panel.querySelector('.person-meta')?.innerText?.replace(/\s+/g, ' ').trim() || null;
      const cards = panel.querySelector('.info-cards')?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 100) || null;
      return { name, meta, cards };
    });
    step('detail-after-gold-click', { at: { x: g.x, y: g.y }, detail: clicked });
    if (clicked) await page.screenshot({ path: resolve(OUT, '60-detail-gold.png') });
  }

  // 若金色不可点（可能命中边），退而用蓝色节点聚类（普通节点）
  if (!clicked) {
    const blueClusters = await page.evaluate(() => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;
      const data = ctx.getImageData(0, 0, w, h).data;
      const cell = 12, gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
      const grid = new Array(gw * gh).fill(0);
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          const p = (y * w + x) * 4;
          const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
          // 蓝色系节点（male 节点描边/填充）
          if (a > 120 && b > 100 && b > r && b >= g) {
            grid[(y / cell | 0) * gw + (x / cell | 0)]++;
          }
        }
      }
      const clusters = [];
      const visited = new Set();
      for (let idx = 0; idx < grid.length; idx++) {
        if (grid[idx] < 40 || visited.has(idx)) continue;
        const stack = [idx]; const cells = []; visited.add(idx);
        while (stack.length) {
          const cur = stack.pop(); cells.push(cur);
          const cx2 = cur % gw, cy2 = (cur / gw) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx2 + dx, ny = cy2 + dy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
            const ni = ny * gw + nx;
            if (grid[ni] >= 15 && !visited.has(ni)) { visited.add(ni); stack.push(ni); }
          }
        }
        if (cells.length) {
          let sx = 0, sy = 0, sum = 0;
          for (const cc of cells) { const n = grid[cc]; sx += (cc % gw) * cell * n; sy += ((cc / gw) | 0) * cell * n; sum += n; }
          clusters.push({ x: Math.round(sx / sum), y: Math.round(sy / sum), cellCount: cells.length, density: sum });
        }
      }
      return clusters.sort((a, b) => b.density - a.density).slice(0, 6);
    });
    step('blue-clusters', blueClusters);
    if (blueClusters.length) {
      const g = blueClusters[0];
      await page.mouse.click(box.x + g.x, box.y + g.y);
      await page.waitForTimeout(1800);
      clicked = await page.evaluate(() => {
        const panel = document.querySelector('.detail-panel');
        if (!panel) return null;
        const name = panel.querySelector('.person-name')?.textContent?.trim() || null;
        return { name };
      });
      step('detail-after-blue-click', { at: { x: g.x, y: g.y }, detail: clicked });
      if (clicked) await page.screenshot({ path: resolve(OUT, '61-detail-blue.png') });
    }
  }

  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal6.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results6.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results6.json'));
