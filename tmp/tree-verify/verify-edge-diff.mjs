/**
 * 连接线跟随验证 v2：拖动节点前后，对"节点上下区域"做像素列对比
 * 若节点及其连接边整体平移 +dx，则该区域内非透明像素列也整体平移 +dx
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

// 采集某水平条带内每列的非透明像素数
const columnProfile = (page, y0, y1) => page.evaluate(({ y0, y1 }) => {
  const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const prof = new Array(w).fill(0);
  for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y += 2) {
    const row = ctx.getImageData(0, y, w, 1).data;
    for (let x = 0; x < w; x += 2) {
      if (row[x * 4 + 3] > 30) prof[x]++;
    }
  }
  return prof;
}, { y0, y1 });

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

  // 找最大簇（主脉链）中的"中间节点"：densest 往下找第二个节点块
  const info = await page.evaluate(() => {
    const c = document.querySelectorAll('.genealogy-tree-canvas canvas')[1];
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    // 找 x≈700 主脉列上的内容行范围
    const xcol = 700;
    const rows = [];
    for (let y = 0; y < h; y += 2) {
      const p = (y * w + xcol) * 4;
      if (data[p + 3] > 30) rows.push(y);
    }
    // 分段：连续行成块
    const blocks = [];
    let start = -1, prev = -2;
    for (const y of rows) {
      if (y - prev > 6) { if (start >= 0) blocks.push([start, prev]); start = y; }
      prev = y;
    }
    if (start >= 0) blocks.push([start, prev]);
    return { xcol, blocks: blocks.slice(0, 10), totalRows: rows.length };
  });
  step('mainline-column-blocks', info);

  // 选第 2 个块的中心作为拖动点（该节点上下都有边）
  let gx = 700, gy = 0;
  if (info.blocks && info.blocks.length >= 2) {
    const b = info.blocks[1];
    gy = Math.round((b[0] + b[1]) / 2);
    gx = info.xcol;
  } else if (info.blocks && info.blocks.length === 1) {
    const b = info.blocks[0];
    gy = Math.round((b[0] + b[1]) / 2);
  } else {
    step('no-blocks', {}); gx = 700; gy = 300;
  }
  const y0 = Math.max(0, gy - 90), y1 = gy + 90;
  step('drag-target', { gx, gy, bandY: [y0, y1] });

  const beforeProf = await columnProfile(page, y0, y1);

  // 拖动
  const dx = 90, dy = 0;
  await page.mouse.move(box.x + gx, box.y + gy);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(box.x + gx + dx, box.y + gy + dy, { steps: 15 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(1000);

  const afterProf = await columnProfile(page, y0, y1);

  // 分析：条带内内容列的平移量
  const analyze = (prof) => {
    const cols = [];
    for (let x = 0; x < prof.length; x++) if (prof[x] > 0) cols.push(x);
    // 聚类列
    const blocks = [];
    let start = -1, prev = -2;
    for (const x of cols) {
      if (x - prev > 6) { if (start >= 0) blocks.push([start, prev]); start = x; }
      prev = x;
    }
    if (start >= 0) blocks.push([start, prev]);
    return { colCount: cols.length, blocks: blocks.slice(0, 20), sample: cols.slice(0, 30) };
  };
  const before = analyze(beforeProf);
  const after = analyze(afterProf);
  step('column-profile', { before, after });

  // 平移匹配：把 after 的列块整体 -dx 与 before 对比，计算重叠率
  let matched = 0, total = 0;
  for (let x = 0; x < beforeProf.length; x++) {
    if (beforeProf[x] > 0) {
      total++;
      if (afterProf[x + dx] > 0) matched++;
    }
  }
  step('edge-follow-shift-match', { dx, totalCols: total, matchedCols: matched, ratio: total ? (matched / total).toFixed(3) : 0 });

  await page.screenshot({ path: resolve(OUT, '95-edge-follow-diff.png') });
  step('console-errors', { total: consoleErrors.length, samples: consoleErrors.slice(0, 8) });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 600) });
  await page.screenshot({ path: resolve(OUT, '99-fatal13.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results13.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results13.json'));
