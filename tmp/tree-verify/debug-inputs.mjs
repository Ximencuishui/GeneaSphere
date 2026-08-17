import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
try {
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.click('.btn-demo-admin');
  await page.waitForURL(/\/zupu\/zhuxi-demo/, { timeout: 60000 });
  await page.goto('http://localhost:5173/tree/zhuxi-demo', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.tree-stats', { timeout: 180000 }).catch(() => {});
  await page.waitForSelector('.tree-loading', { state: 'detached', timeout: 180000 }).catch(() => {});
  await page.waitForSelector('.genealogy-tree-canvas', { state: 'visible', timeout: 180000 });
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
      placeholder: i.getAttribute('placeholder'),
      type: i.type,
      cls: i.className.slice(0, 60),
      visible: i.offsetParent !== null,
      rect: (() => { const r = i.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
    }));
    const toolbar = document.querySelector('.tree-toolbar');
    const toolbarHtml = toolbar ? toolbar.outerHTML.slice(0, 1200) : null;
    const toolbarClass = toolbar?.className || null;
    const collapsed = toolbar?.classList.contains('is-collapsed') || null;
    return { inputs, toolbarClass, collapsed, toolbarHtml };
  });
  console.log(JSON.stringify(info, null, 2));
  console.log('errors:', JSON.stringify(errors.slice(0, 5)));
} catch (e) {
  console.log('FATAL', e.message);
} finally {
  await browser.close();
}
