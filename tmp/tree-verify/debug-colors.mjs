import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.click('.btn-demo-admin');
  await page.waitForURL(/\/zupu\/zhuxi-demo/, { timeout: 60000 });
  await page.goto('http://localhost:5173/tree/zhuxi-demo', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.tree-stats', { timeout: 240000 }).catch(() => {});
  await page.waitForSelector('.tree-loading', { state: 'detached', timeout: 240000 }).catch(() => {});
  await page.waitForSelector('.genealogy-tree-canvas', { state: 'visible', timeout: 240000 });
  await page.waitForTimeout(5000);
  const box = await page.locator('.genealogy-tree-canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (let i = 0; i < 3; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -400); await page.waitForTimeout(150); }
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const cs = Array.from(document.querySelectorAll('.genealogy-tree-canvas canvas'));
    const res = [];
    for (let li = 0; li < cs.length; li++) {
      const c = cs[li];
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;
      const data = ctx.getImageData(0, 0, w, h).data;
      // 采样 10x10 网格，收集非透明像素颜色
      const colors = new Map();
      let nonTransparent = 0;
      for (let y = 0; y < h; y += 20) {
        for (let x = 0; x < w; x += 20) {
          const p = (y * w + x) * 4;
          if (data[p + 3] > 30) {
            nonTransparent++;
            const key = `${data[p]},${data[p + 1]},${data[p + 2]},${data[p + 3]}`;
            colors.set(key, (colors.get(key) || 0) + 1);
          }
        }
      }
      const top = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
      res.push({ layer: li, nonTransparent, top });
    }
    return res;
  });
  console.log(JSON.stringify(info, null, 2));
} catch (e) {
  console.log('FATAL', e.message);
} finally {
  await browser.close();
}
