/**
 * 交互验证 v3：精确命中节点内部（密度最大格中心）→ 拖动 → 区分 drag-element/drag-canvas
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

// 返回簇列表，每簇附带 densest 点（内容像素最密的坐标）
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
      let densest = null, densestVal = -1;
      for (const cc of cells) {
        const n = grid[cc];
        sx += (cc % gw) * cell * n; sy += ((cc / gw) | 0) * cell * n; sum += n;
        if (n > densestVal) { densestVal = n; densest = { x: (cc % gw) * cell + cell / 2, y: ((cc / gw) | 0) * cell + cell / 2 }; }
      }
      clusters.push({ x: Math.round(sx / sum), y: Math.round(sy / sum), densest, cellCount: cells.length, density: sum });
    }
  }
  return clusters.sort((a, b) => b.density - a.density).slice(0, 12);
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
  for (let i = 0; i < 3; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -400); await page.waitForTimeout(150); }
  await page.waitForTimeout(1500);

  let clusters = await findClusters(page);
  step('node-clusters', clusters);

  // ── 初始防重叠（修正 dy 笔误）──
  if (clusters.length >= 2) {
    const close = [];
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const ddx = Math.abs(clusters[i].x - clusters[j].x);
        const ddy = Math.abs(clusters[i].y - clusters[j].y);
        // detailed 节点在 1.35x 下约 46x108 px；间距 < 节点尺寸视为可疑
        if (ddx < 60 && ddy < 120) close.push({ a: clusters[i], b: clusters[j], dx: ddx, dy: ddy });
      }
    }
    step('overlap-check-initial', { clusterCount: clusters.length, closePairs: close });
  }

  // ── 拖动：取密度最大簇的 densest 点 ──
  if (clusters.length) {
    const t = clusters[0];
    const grabX = t.densest ? t.densest.x : t.x;
    const grabY = t.densest ? t.densest.y : t.y;
    const sx = box.x + grabX, sy = box.y + grabY;
    const dx = 80, dy = 0;

    // 确认命中点有内容
    const hitCheck = await page.evaluate(({ grabX, grabY }) => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(grabX | 0, grabY | 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    }, { grabX, grabY });
    step('grab-point-content', { grabX, grabY, hitCheck });

    // 参考点（其他簇）用于区分 drag-element vs drag-canvas
    const refPoints = clusters.slice(1, 4).map((c2) => ({ x: c2.densest ? c2.densest.x : c2.x, y: c2.densest ? c2.densest.y : c2.y }));
    const beforeRefs = [];
    for (const rp of refPoints) {
      beforeRefs.push(await page.evaluate(({ x, y }) => {
        const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(x | 0, y | 0, 1, 1).data;
        return { x, y, a: d[3] };
      }, rp));
    }

    // 目标节点附近采样：节点中心、上方（父边方向）、下方（子边方向）
    const tCenter = await page.evaluate(({ x, y }) => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(x | 0, y | 0, 1, 1).data;
      return { x, y, a: d[3], rgb: [d[0], d[1], d[2]] };
    }, { x: grabX, y: grabY });
    const tUp = await page.evaluate(({ x, y }) => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(x | 0, y | 0, 1, 1).data;
      return { a: d[3], rgb: [d[0], d[1], d[2]] };
    }, { x: grabX, y: grabY - 50 });
    const tDown = await page.evaluate(({ x, y }) => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(x | 0, y | 0, 1, 1).data;
      return { a: d[3], rgb: [d[0], d[1], d[2]] };
    }, { x: grabX, y: grabY + 50 });

    // 执行拖动
    await page.mouse.move(sx, sy);
    await page.waitForTimeout(250);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(sx + dx, sy + dy, { steps: 15 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(1000);

    // 拖动后：目标新位置、旧位置、参考点新位置
    const afterCenter = await page.evaluate(({ x, y }) => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(x | 0, y | 0, 1, 1).data;
      return { a: d[3], rgb: [d[0], d[1], d[2]] };
    }, { x: grabX + dx, y: grabY + dy });
    const afterOld = await page.evaluate(({ x, y }) => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(x | 0, y | 0, 1, 1).data;
      return { a: d[3], rgb: [d[0], d[1], d[2]] };
    }, { x: grabX, y: grabY });
    const afterUp = await page.evaluate(({ x, y }) => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(x | 0, y | 0, 1, 1).data;
      return { a: d[3], rgb: [d[0], d[1], d[2]] };
    }, { x: grabX + dx, y: grabY - 50 + dy });
    const afterDown = await page.evaluate(({ x, y }) => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(x | 0, y | 0, 1, 1).data;
      return { a: d[3], rgb: [d[0], d[1], d[2]] };
    }, { x: grabX + dx, y: grabY + 50 + dy });
    const afterRefs = [];
    for (const rp of refPoints) {
      afterRefs.push(await page.evaluate(({ x, y }) => {
        const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(x | 0, y | 0, 1, 1).data;
        return { x, y, a: d[3] };
      }, rp));
    }

    step('drag-test', {
      grab: { grabX, grabY },
      before: { center: tCenter, up: tUp, down: tDown, refs: beforeRefs },
      after: { newCenter: afterCenter, oldPos: afterOld, up: afterUp, down: afterDown, refs: afterRefs },
    });
    await page.screenshot({ path: resolve(OUT, '93-after-drag.png') });

    // 拖动后防重叠
    const clusters2 = await findClusters(page);
    if (clusters2.length >= 2) {
      const close2 = [];
      for (let i = 0; i < clusters2.length; i++) {
        for (let j = i + 1; j < clusters2.length; j++) {
          const ddx = Math.abs(clusters2[i].x - clusters2[j].x);
          const ddy = Math.abs(clusters2[i].y - clusters2[j].y);
          if (ddx < 60 && ddy < 120) close2.push({ a: clusters2[i], b: clusters2[j], dx: ddx, dy: ddy });
        }
      }
      step('overlap-check-after-drag', { clusterCount: clusters2.length, closePairs: close2 });
    }
  }

  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal11.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results11.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results11.json'));
