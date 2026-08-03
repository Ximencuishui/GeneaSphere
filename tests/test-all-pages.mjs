import { chromium } from 'playwright';

const BASE = 'http://43.134.232.175';
const ADMIN_PAGES = [
  '/zupu/zhuxi-demo',
  '/zupu/zhuxi-demo/dashboard',
  '/zupu/zhuxi-demo/members',
  '/zupu/zhuxi-demo/invite/qrcodes',
  '/zupu/zhuxi-demo/invite/records',
  '/zupu/zhuxi-demo/invite/reviews',
  '/zupu/zhuxi-demo/reviews/media',
  '/zupu/zhuxi-demo/reviews/bio',
  '/zupu/zhuxi-demo/reviews/reports',
  '/zupu/zhuxi-demo/family-relation/reviews',
  '/zupu/zhuxi-demo/family-relation/disputes',
  '/zupu/zhuxi-demo/migration',
  '/zupu/zhuxi-demo/import',
  '/zupu/zhuxi-demo/memory/quizzes',
  '/zupu/zhuxi-demo/merge/applications',
  '/zupu/zhuxi-demo/announcements',
  '/zupu/zhuxi-demo/reports',
  '/zupu/zhuxi-demo/statistics',
  '/zupu/zhuxi-demo/trash',
  '/zupu/zhuxi-demo/media/library',
  '/zupu/zhuxi-demo/media/albums',
  '/zupu/zhuxi-demo/toolbox-usage',
  '/zupu/zhuxi-demo/family-albums',
  '/zupu/zhuxi-demo/settings/privacy',
  '/zupu/zhuxi-demo/settings/xipai',
  '/zupu/zhuxi-demo/settings/clan-info',
  '/zupu/zhuxi-demo/settings/storage',
  '/zupu/zhuxi-demo/settings/export',
  '/zupu/zhuxi-demo/orders',
  '/zupu/zhuxi-demo/genealogy/generate',
  '/zupu/zhuxi-demo/genealogy/history',
  '/zupu/zhuxi-demo/video/migration',
  '/zupu/zhuxi-demo/video/event',
  '/zupu/zhuxi-demo/family-events',
  '/zupu/zhuxi-demo/sms/send',
  '/zupu/zhuxi-demo/sms/balance',
  '/zupu/zhuxi-demo/logs',
];

async function loginAsAdmin(context) {
  const loginPage = await context.newPage();
  // First get a fresh token via API
  const resp = await loginPage.request.post(`${BASE}/api/auth/login`, {
    data: { phone: '13800000000', password: 'demo123' },
  });
  const data = await resp.json();
  console.log('Login response status:', resp.status());
  if (data.token) {
    await loginPage.goto(`${BASE}/zupu/zhuxi-demo?token=${data.token}`);
    await loginPage.waitForTimeout(2000);
  }
  return loginPage;
}

async function testPage(page, path) {
  try {
    await page.goto(BASE + path, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const url = page.url();
    const title = await page.title();
    // Check for common error indicators
    const errorCount = await page.locator('.el-message--error, .el-alert--error, h1:has-text("404"), h2:has-text("404")').count();
    const hasContent = await page.locator('main, .main-content, [class*="content"]').count() > 0;
    return { path, url, title: title.substring(0, 60), errorCount, hasContent, status: errorCount > 0 ? 'FAIL' : 'OK' };
  } catch (e) {
    return { path, error: e.message.substring(0, 80), status: 'ERROR' };
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });

  try {
    const page = await loginAsAdmin(context);
    console.log(`\n=== 管理员端页面测试 (${ADMIN_PAGES.length} pages) ===\n`);

    const results = [];
    for (const p of ADMIN_PAGES) {
      const r = await testPage(page, p);
      results.push(r);
      const icon = r.status === 'OK' ? '✅' : '❌';
      console.log(`${icon} ${r.status} | ${r.path} | ${r.title || (r.error || '')}`);
    }

    const ok = results.filter(r => r.status === 'OK').length;
    console.log(`\n=== 结果: ${ok}/${results.length} 通过 ===`);
  } catch (e) {
    console.error('Fatal error:', e.message);
  } finally {
    await browser.close();
  }
})();
