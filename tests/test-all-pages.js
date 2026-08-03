const { chromium } = require('playwright');

const BASE = 'http://43.134.232.175';
const ADMIN_PAGES = [
  ['成员列表', '/zupu/zhuxi-demo/members'],
  ['邀请二维码', '/zupu/zhuxi-demo/invite/qrcodes'],
  ['邀请记录', '/zupu/zhuxi-demo/invite/records'],
  ['邀请审核', '/zupu/zhuxi-demo/invite/reviews'],
  ['影像审核', '/zupu/zhuxi-demo/reviews/media'],
  ['生平审核', '/zupu/zhuxi-demo/reviews/bio'],
  ['举报管理', '/zupu/zhuxi-demo/reviews/reports'],
  ['家庭关系审核', '/zupu/zhuxi-demo/family-relation/reviews'],
  ['子女归属争议', '/zupu/zhuxi-demo/family-relation/disputes'],
  ['寻亲申请', '/zupu/zhuxi-demo/merge/applications'],
  ['寻亲帖管理', '/zupu/zhuxi-demo/merge/posts'],
  ['迁徙管理', '/zupu/zhuxi-demo/migration'],
  ['PDF导入', '/zupu/zhuxi-demo/import'],
  ['题库管理', '/zupu/zhuxi-demo/memory/quizzes'],
  ['公告管理', '/zupu/zhuxi-demo/announcements'],
  ['数据统计', '/zupu/zhuxi-demo/statistics'],
  ['回收站', '/zupu/zhuxi-demo/trash'],
  ['影像库', '/zupu/zhuxi-demo/media/library'],
  ['相册管理', '/zupu/zhuxi-demo/media/albums'],
  ['AI工具记录', '/zupu/zhuxi-demo/toolbox-usage'],
  ['家庭图册', '/zupu/zhuxi-demo/family-albums'],
  ['隐私配置', '/zupu/zhuxi-demo/settings/privacy'],
  ['字辈管理', '/zupu/zhuxi-demo/settings/xipai'],
  ['家族信息', '/zupu/zhuxi-demo/settings/clan-info'],
  ['云存储', '/zupu/zhuxi-demo/settings/storage'],
  ['数据导出', '/zupu/zhuxi-demo/settings/export'],
  ['订单管理', '/zupu/zhuxi-demo/orders'],
  ['生成族谱', '/zupu/zhuxi-demo/genealogy/generate'],
  ['历史版本', '/zupu/zhuxi-demo/genealogy/history'],
  ['迁徙视频', '/zupu/zhuxi-demo/video/migration'],
  ['事件视频', '/zupu/zhuxi-demo/video/event'],
  ['大事件管理', '/zupu/zhuxi-demo/family-events'],
  ['发送短信', '/zupu/zhuxi-demo/sms/send'],
  ['短信余额', '/zupu/zhuxi-demo/sms/balance'],
  ['操作日志', '/zupu/zhuxi-demo/logs'],
  ['控制面板', '/zupu/zhuxi-demo/dashboard'],
];

async function loginAsAdmin(browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  const resp = await page.request.post(`${BASE}/api/auth/login`, {
    data: { phone: '13800000000', password: 'demo123' },
  });
  const body = await resp.json();
  console.log(`登录: ${resp.status()} ${body.token ? 'OK' : 'FAIL'}`);

  await page.goto(`${BASE}/zupu/zhuxi-demo?token=${body.token}`, { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  return { ctx, page };
}

async function testPage(page, name, path) {
  try {
    const resp = await page.goto(BASE + path, { timeout: 20000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const url = page.url();
    const title = await page.title();
    const statusCode = resp.status();
    const isError = statusCode >= 400;
    return { name, path, statusCode, url: url.slice(0,80), title: title.slice(0,50), ok: !isError };
  } catch (e) {
    return { name, path, statusCode: 'ERR', error: e.message.slice(0,80), ok: false };
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { ctx, page } = await loginAsAdmin(browser);
    console.log(`\n=== 管理员端页面测试 (${ADMIN_PAGES.length}) ===\n`);

    const results = [];
    for (const [name, path] of ADMIN_PAGES) {
      const r = await testPage(page, name, path);
      results.push(r);
      const icon = r.ok ? '✅' : '❌';
      const extra = r.ok ? `(${r.statusCode})` : `(${r.statusCode} ${r.error||''})`;
      console.log(`${icon} ${r.name.padEnd(12)} ${extra}`);
    }

    const ok = results.filter(r => r.ok).length;
    const fails = results.filter(r => !r.ok);
    console.log(`\n=== 结果: ${ok}/${results.length} 通过 ===`);
    if (fails.length > 0) {
      console.log('失败页面:');
      fails.forEach(f => console.log(`  ❌ ${f.name}: ${f.path} (${f.statusCode})`));
    }
    await ctx.close();
  } catch (e) {
    console.error('Fatal:', e.message);
  } finally {
    await browser.close();
  }
})();
