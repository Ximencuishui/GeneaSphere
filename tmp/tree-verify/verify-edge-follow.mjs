/**
 * 连接线跟随验证：找到带子节点的节点 → 采样"父节点下方边缘线上的点" → 拖动 → 检查边线是否跟着移到新 x
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

const px = (page, x, y) => page.evaluate(({ x, y }) => {
  const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(Math.max(0, x | 0), Math.max(0, y | 0), 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] };
}, { x, y });

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

  // 找节点簇 + densest 点
  const clusters = await page.evaluate(() => {
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
  step('clusters', clusters.map((c2) => ({ x: c2.x, y: c2.y, d: c2.densest })));

  if (!clusters.length) { step('no-clusters', {}); } else {
    // 选一个"上方/下方都有内容"的节点（有父子边）
    const t = clusters.find((c2) => c2.densest.y > 100 && c2.densest.y < box.height - 100) || clusters[0];
    const gx = t.densest.x, gy = t.densest.y;
    const sx = box.x + gx, sy = box.y + gy;
    const dx = 90, dy = 0;

    // 找节点垂直范围：从 densest 向上/向下扫到透明
    const scan = await page.evaluate(({ gx, gy }) => {
      const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;
      const isContent = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return false;
        const d = ctx.getImageData(x, y, 1, 1).data;
        return d[3] > 30;
      };
      let top = gy, bottom = gy;
      while (top > 0 && isContent(gx, top)) top--;
      while (bottom < h - 1 && isContent(gx, bottom)) bottom++;
      return { top, bottom, nodeHeight: bottom - top };
    }, { gx, gy });
    step('node-extent', scan);

    // 边线采样点：节点底部下方 10~50px（竖直子边）与节点顶部上方（父边）
    const edgeY = scan.bottom + 25;
    const edgeBefore = await px(page, gx, edgeY);
    const edgeY2 = Math.max(0, scan.top - 25);
    const edgeTopBefore = await px(page, gx, edgeY2);

    // 拖动
    await page.mouse.move(sx, sy);
    await page.waitForTimeout(250);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(sx + dx, sy + dy, { steps: 15 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(1000);

    // 拖动后：新 x 位置上的边线、旧 x 位置上的边线
    const edgeAfter = await px(page, gx + dx, edgeY + dy);
    const edgeOldAfter = await px(page, gx, edgeY);
    const edgeTopAfter = await px(page, gx + dx, edgeY2 + dy);
    const newCenter = await px(page, gx + dx, gy + dy);

    step('edge-follow-test', {
      node: { gx, gy, extent: scan },
      edgeSampleY: edgeY,
      before: { edgeBelow: edgeBefore, edgeTop: edgeTopBefore },
      after: { edgeBelowAtNewX: edgeAfter, edgeBelowAtOldX: edgeOldAfter, edgeTopAtNewX: edgeTopAfter, nodeAtNewX: newCenter },
    });
    await page.screenshot({ path: resolve(OUT, '94-edge-follow.png') });
  }

  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal12.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results12.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results12.json'));
