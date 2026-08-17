/**
 * 连接线跟随验证 v3：全画布 diff
 * 拖动节点后，diff 区域应集中在"节点旧位置→新位置 + 连接边路径"，其他区域不变
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

const snapshot = (page) => page.evaluate(() => {
  const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  const step = 4;
  const out = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const p = (y * w + x) * 4;
      if (data[p + 3] > 30) out.push([x, y, data[p], data[p + 1], data[p + 2]]);
    }
  }
  return out;
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

  // 找主脉列（x≈700）上的节点块
  const blocks = await page.evaluate(() => {
    const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    const xcol = 700;
    const rows = [];
    for (let y = 0; y < h; y += 2) {
      const d = ctx.getImageData(xcol, y, 1, 1).data;
      if (d[3] > 30) rows.push(y);
    }
    const blocks = [];
    let start = -1, prev = -2;
    for (const y of rows) {
      if (y - prev > 6) { if (start >= 0) blocks.push([start, prev]); start = y; }
      prev = y;
    }
    if (start >= 0) blocks.push([start, prev]);
    return blocks;
  });
  step('blocks-at-700', blocks);

  const gy = blocks.length >= 2 ? Math.round((blocks[1][0] + blocks[1][1]) / 2) : (blocks.length ? Math.round((blocks[0][0] + blocks[0][1]) / 2) : 300);
  const gx = 700;
  const dx = 90, dy = 0;

  const before = await snapshot(page);
  step('snapshot-before', { points: before.length });

  await page.mouse.move(box.x + gx, box.y + gy);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(box.x + gx + dx, box.y + gy + dy, { steps: 15 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(1000);

  const after = await snapshot(page);
  step('snapshot-after', { points: after.length });

  // diff
  const key = (p) => `${p[0]},${p[1]}`;
  const beforeMap = new Map(before.map((p) => [key(p), p]));
  const afterMap = new Map(after.map((p) => [key(p), p]));
  const removed = before.filter((p) => !afterMap.has(key(p)));
  const added = after.filter((p) => !beforeMap.has(key(p)));
  step('diff', { removed: removed.length, added: added.length });

  // diff 包围盒
  const boxOf = (pts) => {
    if (!pts.length) return null;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (const p of pts) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    return { minX, minY, maxX, maxY };
  };
  const remBox = boxOf(removed);
  const addBox = boxOf(added);
  step('diff-bbox', {
    removed: remBox, added: addBox,
    nodeOld: { x: gx, y: gy }, nodeNew: { x: gx + dx, y: gy + dy },
    canvas: { w: box.width, h: box.height },
    removedLocalized: remBox ? (remBox.maxX - remBox.minX) < 400 && (remBox.maxY - remBox.minY) < 400 : null,
  });

  await page.screenshot({ path: resolve(OUT, '96-edge-follow-diff2.png') });
  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal14.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results14.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results14.json'));
