// 管理员端所有子页面自动化测试
async function testAdminPages(page) {
  const results = [];

  // 1. 先展开所有子菜单组
  const subMenus = page.locator('.el-sub-menu__title');
  const subCount = await subMenus.count();
  for (let i = 0; i < subCount; i++) {
    await subMenus.nth(i).click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(500);

  // 2. 获取所有可见菜单项
  const items = page.locator('.el-menu-item');
  const count = await items.count();

  for (let i = 0; i < count; i++) {
    try {
      const text = (await items.nth(i).textContent()).trim();
      const cls = (await items.nth(i).getAttribute('class')) || '';
      if (cls.includes('is-active')) continue; // 跳过当前页

      await items.nth(i).click();
      await page.waitForTimeout(2000);

      const url = page.url();

      // 检测错误
      let hasError = false;
      const err404 = await page.locator('h2:has-text("404"), h1:has-text("404")').count();
      const errMsg = await page.locator('.el-message--error, .el-alert--error').count();
      if (err404 > 0 || errMsg > 0) hasError = true;

      results.push({
        menu: text,
        url,
        status: hasError ? 'FAIL' : 'OK',
      });
    } catch (e) {
      results.push({
        menu: 'unknown',
        error: e.message,
        status: 'ERROR',
      });
    }
  }

  const ok = results.filter((r) => r.status === 'OK').length;
  const fails = results.filter((r) => r.status !== 'OK');

  return {
    total: results.length,
    ok,
    failCount: fails.length,
    fails,
    all: results,
  };
}

// 导出给 Playwright run-code 使用
module.exports = { testAdminPages };
