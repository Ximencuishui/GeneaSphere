$urls = @(
  @{n="合并申请"; u="/zupu/zhuxi-demo/merge/applications"},
  @{n="迁移管理"; u="/zupu/zhuxi-demo/migration"},
  @{n="PDF导入"; u="/zupu/zhuxi-demo/import"},
  @{n="题库管理"; u="/zupu/zhuxi-demo/memory/quizzes"},
  @{n="公告管理"; u="/zupu/zhuxi-demo/announcements"},
  @{n="数据统计"; u="/zupu/zhuxi-demo/statistics"},
  @{n="回收站"; u="/zupu/zhuxi-demo/trash"},
  @{n="影像库"; u="/zupu/zhuxi-demo/media/library"},
  @{n="相册管理"; u="/zupu/zhuxi-demo/media/albums"},
  @{n="AI工具记录"; u="/zupu/zhuxi-demo/toolbox-usage"},
  @{n="家庭图册"; u="/zupu/zhuxi-demo/family-albums"},
  @{n="隐私配置"; u="/zupu/zhuxi-demo/settings/privacy"},
  @{n="字辈管理"; u="/zupu/zhuxi-demo/settings/xipai"},
  @{n="家族信息"; u="/zupu/zhuxi-demo/settings/clan-info"},
  @{n="云存储"; u="/zupu/zhuxi-demo/settings/storage"},
  @{n="数据导出"; u="/zupu/zhuxi-demo/settings/export"},
  @{n="订单管理"; u="/zupu/zhuxi-demo/orders"},
  @{n="生成族谱"; u="/zupu/zhuxi-demo/genealogy/generate"},
  @{n="历史版本"; u="/zupu/zhuxi-demo/genealogy/history"},
  @{n="迁徙视频"; u="/zupu/zhuxi-demo/video/migration"},
  @{n="事件视频"; u="/zupu/zhuxi-demo/video/event"},
  @{n="大事件"; u="/zupu/zhuxi-demo/family-events"},
  @{n="发送短信"; u="/zupu/zhuxi-demo/sms/send"},
  @{n="短信余额"; u="/zupu/zhuxi-demo/sms/balance"},
  @{n="操作日志"; u="/zupu/zhuxi-demo/logs"}
)

$BASE = "http://43.134.232.175"
$ok = 0; $fail = 0

foreach ($p in $urls) {
  $url = "$BASE$($p.u)"
  $result = playwright-cli run-code "async (page) => { await page.goto('$url', {timeout:15000,waitUntil:'domcontentloaded'}); await page.waitForTimeout(1000); const err404 = await page.locator('h1:has-text(`404`),h2:has-text(`404`)').count(); return {title: await page.title(), has404: err404 > 0}; }"
  if ($result -match '"has404":false' -or $result -match '"has404": false') {
    Write-Host "✅ $($p.n) - OK"
    $ok++
  } else {
    Write-Host "❌ $($p.n) - FAIL"
    $fail++
  }
  Start-Sleep -Seconds 0.5
}

Write-Host ""
Write-Host "=== 结果: $ok/$($urls.Count) 通过, $fail 失败 ==="
