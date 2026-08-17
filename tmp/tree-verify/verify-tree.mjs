/**
 * 族谱树（TreePage）前端显示效果验证脚本
 * 流程：演示账号一键登录 → 家族后台 → 族谱树 → 截图 + DOM 指标 + 控制台错误采集
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname);
const BASE = 'http://localhost:5173';

mkdirSync(OUT, { recursive: true });

const results = {
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  treeApi: {},
  steps: [],
};

function step(name, detail) {
  results.steps.push({ name, ...detail });
  console.log(`[step] ${name}: ${JSON.stringify(detail)}`);
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--disable-gpu', '--no-sandbox'],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', (msg) => {
  if (msg.type() === 'error') {
    results.consoleErrors.push({ text: msg.text(), location: msg.location() });
  }
});
page.on('pageerror', (err) => {
  results.pageErrors.push({ message: err.message, stack: String(err.stack).slice(0, 500) });
});
page.on('requestfailed', (req) => {
  results.failedRequests.push({
    url: req.url(),
    failure: req.failure()?.errorText || '',
  });
});
page.on('response', async (res) => {
  const url = res.url();
  if (url.includes('/api/tree/clan/') && url.includes('/full')) {
    results.treeApi = {
      url,
      status: res.status(),
      timingMs: (await res.serverTiming?.().catch(() => null)) || null,
      duration: Date.now() - (results.treeApiStart || Date.now()),
      contentLength: (await res.headerValue('content-length')) || null,
    };
  }
  if (url.includes('/api/tree/clan/') && url.includes('/full')) {
    results.treeApiStart = Date.now();
  }
});

try {
  // 1. 登录页
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.btn-demo-admin', { timeout: 30000 });
  step('login-page', { title: await page.title() });
  await page.screenshot({ path: resolve(OUT, '01-login.png'), fullPage: false });

  // 2. 一键体验族谱管理演示（演示账号管理员登录）
  await page.click('.btn-demo-admin');
  await page.waitForURL(/\/zupu\/zhuxi-demo/, { timeout: 60000 });
  step('demo-login', { url: page.url() });

  // 3. 家族后台仪表盘
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '02-zupu-dashboard.png'), fullPage: false });
  const dashText = (await page.locator('body').innerText()).slice(0, 800);
  step('dashboard-text', { snippet: dashText.replace(/\s+/g, ' ').slice(0, 400) });

  // 4. 点击“族谱树”入口
  const treeCard = page.locator('.stat-card', { hasText: '族谱树' }).first();
  if (await treeCard.count()) {
    await treeCard.click();
  } else {
    // 兜底：直接走菜单或 URL
    await page.goto(`${BASE}/tree/zhuxi-demo`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForURL(/\/tree\//, { timeout: 60000 });
  step('tree-route', { url: page.url() });

  // 5. 等待族谱树渲染（Suspense 异步组件 + G6 渲染 + 数据加载）
  await page.waitForSelector('.tree-navbar', { timeout: 90000 });
  // 等待加载遮罩消失
  await page.waitForSelector('.tree-loading', { state: 'detached', timeout: 180000 }).catch(() => {});
  // 等待画布容器出现（v-show 显示）
  await page.waitForSelector('.genealogy-tree-canvas', { state: 'visible', timeout: 180000 });
  // 等待 stats 出现（数据已加载）
  await page.waitForSelector('.tree-stats', { timeout: 180000 }).catch(() => {});
  // 再等渲染稳定
  await page.waitForTimeout(6000);

  // 6. DOM 指标采集
  const metrics = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const canvasLayers = Array.from(document.querySelectorAll('.genealogy-tree-canvas canvas')).map((c) => ({
      w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight,
    }));
    const stats = q('.tree-stats')?.innerText?.replace(/\s+/g, ' ').trim() || null;
    const perf = q('.perf-overlay')?.innerText?.replace(/\s+/g, ' ').trim() || null;
    const navbarTitle = q('.navbar-title .title-text')?.textContent?.trim() || null;
    const lineageChip = q('.lineage-chip')?.textContent?.replace(/\s+/g, ' ').trim() || null;
    const errorPlaceholder = q('.tree-error-placeholder')?.innerText?.trim() || null;
    const fallback = q('.tree-async-fallback')?.innerText?.trim() || null;
    const loading = q('.tree-loading')?.innerText?.replace(/\s+/g, ' ').trim() || null;
    const toolbar = q('.tree-toolbar')?.innerText?.replace(/\s+/g, ' ').trim() || null;
    const minimap = !!q('.tree-minimap');
    const slider = !!q('.generation-slider');
    const canvasBox = q('.genealogy-tree-canvas')?.getBoundingClientRect() || null;
    return {
      canvasLayers,
      stats,
      perf,
      navbarTitle,
      lineageChip,
      errorPlaceholder,
      fallback,
      loading,
      toolbar,
      minimap,
      slider,
      canvasBox: canvasBox ? { x: canvasBox.x, y: canvasBox.y, w: canvasBox.width, h: canvasBox.height } : null,
      scroll: { sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight },
    };
  });
  step('tree-dom-metrics', metrics);
  await page.screenshot({ path: resolve(OUT, '03-tree-full.png'), fullPage: false });

  // 6.1 画布区域截图
  const canvasEl = page.locator('.genealogy-tree-canvas').first();
  if (await canvasEl.count()) {
    await canvasEl.screenshot({ path: resolve(OUT, '04-tree-canvas.png') });
  }

  // 6.2 点击画布中心，测试节点点击 → 详情面板
  const box = await canvasEl.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1500);
    const detail = await page.evaluate(() => {
      const panel = document.querySelector('.detail-panel');
      if (!panel) return null;
      const name = panel.querySelector('.person-name')?.textContent?.trim() || null;
      const body = panel.innerText.replace(/\s+/g, ' ').trim().slice(0, 300);
      return { name, body };
    });
    step('node-click-detail', detail);
    await page.screenshot({ path: resolve(OUT, '05-tree-detail.png'), fullPage: false });
  }

  // 7. 交互：聚焦传承 / 三代亲属
  const focusBtn = page.locator('button', { hasText: '聚焦传承' }).first();
  if (await focusBtn.count()) { await focusBtn.click(); await page.waitForTimeout(2500); }
  await page.screenshot({ path: resolve(OUT, '06-tree-focus-lineage.png'), fullPage: false });

  const circleBtn = page.locator('button', { hasText: '三代亲属' }).first();
  if (await circleBtn.count()) { await circleBtn.click(); await page.waitForTimeout(2500); }
  await page.screenshot({ path: resolve(OUT, '07-tree-family-circle.png'), fullPage: false });

  // 8. 缩放测试（滚轮）
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(1500);
  const zoomPerf = await page.evaluate(() => document.querySelector('.perf-overlay')?.innerText?.replace(/\s+/g, ' ').trim() || null);
  step('after-wheel-zoom', { zoomPerf });
  await page.screenshot({ path: resolve(OUT, '08-tree-zoomed.png'), fullPage: false });

  // 9. 搜索人物（顶部搜索框）
  const searchInput = page.locator('.tree-toolbar input[type="text"], .tree-toolbar input').first();
  if (await searchInput.count()) {
    await searchInput.fill('朱熹');
    await page.waitForTimeout(1500);
    const dropdown = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.el-select-dropdown__item, .search-result-item, li')).map((li) => li.textContent?.trim()).filter(Boolean).slice(0, 8);
      return items;
    });
    step('search-dropdown', { items: dropdown });
    await page.screenshot({ path: resolve(OUT, '09-tree-search.png'), fullPage: false });
    await page.keyboard.press('Escape');
  }

  // 10. 页面滚动溢出检查 + 最终截图
  const overflow = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    hasHOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
  }));
  step('overflow-check', overflow);
  await page.screenshot({ path: resolve(OUT, '10-tree-final.png'), fullPage: false });

  // 11. 控制台错误统计
  const uniqConsoleErrors = [...new Set(results.consoleErrors.map((e) => e.text))];
  step('console-errors-summary', {
    total: results.consoleErrors.length,
    unique: uniqConsoleErrors.length,
    samples: uniqConsoleErrors.slice(0, 10),
  });
  step('page-errors-summary', {
    total: results.pageErrors.length,
    samples: results.pageErrors.slice(0, 5),
  });
  step('failed-requests-summary', {
    total: results.failedRequests.length,
    samples: results.failedRequests.slice(0, 10),
  });
} catch (e) {
  step('FATAL', { message: e.message, stack: String(e.stack).slice(0, 800) });
  await page.screenshot({ path: resolve(OUT, '99-fatal.png'), fullPage: false }).catch(() => {});
} finally {
  writeFileSync(resolve(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
console.log('DONE: ' + resolve(OUT, 'results.json'));
