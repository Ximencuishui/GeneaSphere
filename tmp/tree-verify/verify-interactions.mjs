/**
 * 交互验证：拖动跟随 / 防重叠 / 自适应
 * 1. 拖动节点 → 连接线是否跟随（像素级验证）
 * 2. 初始布局节点是否重叠（像素簇检测）
 * 3. resize 自适应（canvas 尺寸跟随窗口）
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

// 取第 main 层（index 1）画布上指定坐标点的像素颜色
const pxAt = (page, layer, x, y) => page.evaluate(({ layer, x, y }) => {
  const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[layer];
  if (!c) return null;
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(Math.max(0, x | 0), Math.max(0, y | 0), 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] };
}, { layer, x, y });

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

  // ── 0. 放大到 ~1.5x 让节点可操作 ──
  for (let i = 0; i < 3; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -400); await page.waitForTimeout(150); }
  await page.waitForTimeout(1500);
  const zoom0 = await page.evaluate(() => document.querySelector('.perf-overlay')?.innerText?.replace(/\s+/g, ' ').trim() || null);
  step('zoom-start', { zoom0 });

  // ── 1. 像素簇找节点（layer1 彩色矩形簇中心）──
  const nodes = await page.evaluate(() => {
    const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    const cell = 8, gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
    const grid = new Array(gw * gh).fill(0);
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const p = (y * w + x) * 4;
        const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
        // 节点填充：蓝色系(male 在世) / 粉色系(female 在世) / 金黄(main lineage)
        if (a > 120 && (b > 130 || (r > 200 && g > 180 && b < 180) || (r > 220 && g < 210 && b > 200))) {
          grid[(y / cell | 0) * gw + (x / cell | 0)]++;
        }
      }
    }
    // BFS 聚类
    const clusters = [];
    const visited = new Set();
    for (let idx = 0; idx < grid.length; idx++) {
      if (grid[idx] < 20 || visited.has(idx)) continue;
      const stack = [idx]; const cells = []; visited.add(idx);
      while (stack.length) {
        const cur = stack.pop(); cells.push(cur);
        const cx2 = cur % gw, cy2 = (cur / gw) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx2 + dx, ny = cy2 + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (grid[ni] >= 8 && !visited.has(ni)) { visited.add(ni); stack.push(ni); }
        }
      }
      if (cells.length >= 3) {
        let sx = 0, sy = 0, sum = 0;
        for (const cc of cells) { const n = grid[cc]; sx += (cc % gw) * cell * n; sy += ((cc / gw) | 0) * cell * n; sum += n; }
        clusters.push({ x: Math.round(sx / sum), y: Math.round(sy / sum), cellCount: cells.length, density: sum });
      }
    }
    return clusters.sort((a, b) => b.density - a.density).slice(0, 12);
  });
  step('node-clusters', nodes);

  // ── 2. 防重叠检测：聚类两两距离是否小于节点尺寸（34x80 detailed / 缩放）──
  if (nodes.length >= 2) {
    const overlaps = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = Math.abs(nodes[i].x - nodes[j].x);
        const dy = Math.abs(nodes[i].y - nodes[j].y);
        if (dx < 40 && dy < 60) overlaps.push({ a: nodes[i], b: nodes[j], dx, dy });
      }
    }
    step('overlap-check-initial', { clusterCount: nodes.length, closePairs: overlaps });
  }

  // ── 3. 拖动测试：选第一个簇中心，向 x+80 拖动 ──
  if (nodes.length) {
    const target = nodes[0];
    const sx = box.x + target.x, sy = box.y + target.y;
    const dx = 80, dy = 0;

    // 拖动前：采样该节点及"向上方(父方向)的边像素"
    const beforeNode = await pxAt(page, 1, target.x, target.y);
    const edgeUpBefore = await pxAt(page, 1, target.x, target.y - 40);
    const edgeSideBefore = await pxAt(page, 1, target.x + 25, target.y);

    await page.mouse.move(sx, sy);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.move(sx + dx, sy + dy, { steps: 12 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(800);

    // 拖动后：采样新位置
    const afterNode = await pxAt(page, 1, target.x + dx, target.y + dy);
    const edgeUpAfter = await pxAt(page, 1, target.x + dx, target.y + dy - 40);
    const oldPosAfter = await pxAt(page, 1, target.x, target.y);
    const edgeSideAfter = await pxAt(page, 1, target.x + dx + 25, target.y + dy);

    step('drag-test', {
      from: { x: target.x, y: target.y }, to: { x: target.x + dx, y: target.y + dy },
      before: { node: beforeNode, edgeUp: edgeUpBefore, edgeSide: edgeSideBefore },
      after: { node: afterNode, edgeUp: edgeUpAfter, edgeSide: edgeSideAfter, oldPos: oldPosAfter },
    });
    await page.screenshot({ path: resolve(OUT, '90-after-drag.png') });

    // 拖动后再次防重叠检测
    const nodes2 = await page.evaluate(() => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;
      const data = ctx.getImageData(0, 0, w, h).data;
      const cell = 8, gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
      const grid = new Array(gw * gh).fill(0);
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          const p = (y * w + x) * 4;
          const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
          if (a > 120 && (b > 130 || (r > 200 && g > 180 && b < 180) || (r > 220 && g < 210 && b > 200))) {
            grid[(y / cell | 0) * gw + (x / cell | 0)]++;
          }
        }
      }
      const clusters = []; const visited = new Set();
      for (let idx = 0; idx < grid.length; idx++) {
        if (grid[idx] < 20 || visited.has(idx)) continue;
        const stack = [idx]; const cells = []; visited.add(idx);
        while (stack.length) {
          const cur = stack.pop(); cells.push(cur);
          const cx2 = cur % gw, cy2 = (cur / gw) | 0;
          for (const [dx2, dy2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx2 + dx2, ny = cy2 + dy2;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
            const ni = ny * gw + nx;
            if (grid[ni] >= 8 && !visited.has(ni)) { visited.add(ni); stack.push(ni); }
          }
        }
        if (cells.length >= 3) {
          let sx2 = 0, sy2 = 0, sum = 0;
          for (const cc of cells) { const n = grid[cc]; sx2 += (cc % gw) * cell * n; sy2 += ((cc / gw) | 0) * cell * n; sum += n; }
          clusters.push({ x: Math.round(sx2 / sum), y: Math.round(sy2 / sum), cellCount: cells.length, density: sum });
        }
      }
      return clusters.sort((a, b) => b.density - a.density).slice(0, 12);
    });
    if (nodes2.length >= 2) {
      const overlaps2 = [];
      for (let i = 0; i < nodes2.length; i++) {
        for (let j = i + 1; j < nodes2.length; j++) {
          const ddx = Math.abs(nodes2[i].x - nodes2[j].x);
          const ddy = Math.abs(nodes2[i].y - nodes2[j].y);
          if (ddx < 40 && ddy < 60) overlaps2.push({ a: nodes2[i], b: nodes2[j], dx: ddx, dy: ddy });
        }
      }
      step('overlap-check-after-drag', { clusterCount: nodes2.length, closePairs: overlaps2 });
    }
  }

  // ── 4. resize 自适应 ──
  const beforeResize = await page.evaluate(() => {
    const c = document.querySelector('.genealogy-tree-canvas canvas');
    return { cw: c.clientWidth, ch: c.clientHeight, w: c.width, h: c.height };
  });
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(1500);
  const afterResize = await page.evaluate(() => {
    const c = document.querySelector('.genealogy-tree-canvas canvas');
    const r = document.querySelector('.genealogy-tree-canvas')?.getBoundingClientRect();
    return { cw: c.clientWidth, ch: c.clientHeight, w: c.width, h: c.height, container: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null };
  });
  step('resize-test', { before: beforeResize, after: afterResize });
  await page.screenshot({ path: resolve(OUT, '91-after-resize.png') });

  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal9.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results9.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results9.json'));
