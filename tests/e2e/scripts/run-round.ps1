# 单轮测试驱动器
#
# 用途：
#   提供一个集中入口，按轮次组织 Browser MCP 调用的语义清单。
#   由 Qoder AI 读取本文件后通过 mcp__browser-use__* 系列工具执行。
#
# 用法：
#   # 仅打印待执行清单
#   .\tests\e2e\scripts\run-round.ps1 -Round 0 -Role smoke
#   # 仅做状态清理（注入 Browser MCP execute_script 命令参考）
#   .\tests\e2e\scripts\run-round.ps1 -Round 0 -OnlyReset

param(
    [ValidateSet(0,1,2,3,4)]
    [int]$Round = 0,
    [ValidateSet('admin','member','boundary','smoke','perf')]
    [string]$Role = 'smoke',
    [switch]$OnlyReset
)

$base = $PSScriptRoot
$reportsDir = Join-Path $base '..\reports'
$screenshotsDir = Join-Path $base '..\screenshots\round$Round'

# 报告模板
$templateMap = @{
    0 = 'round0-smoke.md'
    1 = 'round1-admin.md'
    2 = 'round2-member.md'
    3 = 'round3-boundary.md'
    4 = 'round4-regression.md'
}

Write-Host ""
Write-Host "========================================"
Write-Host "  Round $Round - $Role"
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "========================================"

# 1. 服务检查
Write-Host ""
Write-Host "[Pre] 服务健康检查 ..."
& (Join-Path $base 'check-services.ps1') -Quiet

if ($OnlyReset) {
    Write-Host ""
    Write-Host "[OnlyReset] 清理状态："
    Write-Host '  mcp__browser-use__evaluate_script(function="() => { localStorage.clear(); sessionStorage.clear(); return true; }")'
    exit 0
}

# 2. 准备报告文件
$reportName = $templateMap[$Round] -replace '\.md$', '-actual.md'
$reportPath = Join-Path $reportsDir $reportName
$templatePath = Join-Path $reportsDir $templateMap[$Round]

if (Test-Path $templatePath) {
    if (-not (Test-Path $reportPath)) {
        Copy-Item $templatePath $reportPath
        Write-Host "[Setup] 已复制模板到 $reportPath"
    } else {
        Write-Host "[Setup] 报告已存在: $reportPath"
    }
} else {
    New-Item -ItemType File -Path $reportPath -Force | Out-Null
    Write-Host "[Setup] 创建新报告: $reportPath"
}

# 3. 准备截图目录
if (-not (Test-Path $screenshotsDir)) {
    New-Item -ItemType Directory -Path $screenshotsDir -Force | Out-Null
    Write-Host "[Setup] 创建截图目录: $screenshotsDir"
}

# 4. 输出 Browser MCP 调用清单（按章节）
Write-Host ""
Write-Host "========================================"
Write-Host "[Plan] Round $Round ($Role) Browser MCP 调用清单"
Write-Host "========================================"

switch ($Round) {
    0 {
        Write-Host "  R0-S1 访问登录页"
        Write-Host "    - mcp__browser-use__evaluate_script (clear localStorage)"
        Write-Host "    - mcp__browser-use__navigate_page (url=/login)"
        Write-Host "    - mcp__browser-use__wait_for (text=一键体验)"
        Write-Host "    - mcp__browser-use__take_snapshot"
        Write-Host "    - mcp__browser-use__take_screenshot (round0-login-page.png)"
        Write-Host ""
        Write-Host "  R0-S2 管理员一键登录"
        Write-Host "    - mcp__browser-use__click (一键体验族谱管理演示)"
        Write-Host "    - mcp__browser-use__wait_for (text=朱熹族谱（演示）)"
        Write-Host "    - mcp__browser-use__list_network_requests (校验 /api/auth/demo-login)"
        Write-Host "    - mcp__browser-use__take_screenshot (round0-login-admin-success.png)"
        Write-Host ""
        Write-Host "  R0-S3 族员一键登录"
        Write-Host "    - 同 R0-S2，但 uid 是另一按钮"
        Write-Host ""
        Write-Host "  R0-S4 退出登录"
        Write-Host "    - find avatar menu -> click logout"
        Write-Host "    - 验证 localStorage 三键被清"
        Write-Host ""
        Write-Host "  R0-S5 未登录访问受保护路由"
        Write-Host "    - mcp__browser-use__navigate_page (url=/admin/members)"
        Write-Host "    - 验证跳 /login"
    }
    1 {
        Write-Host "  完整清单见 tests\e2e\02-admin-test-cases.md（共 35 用例）"
        Write-Host "  关键起始步骤："
        Write-Host "    - mcp__browser-use__evaluate_script (clear localStorage)"
        Write-Host "    - mcp__browser-use__navigate_page (url=/login)"
        Write-Host "    - mcp__browser-use__click (管理员一键登录)"
        Write-Host "    - 然后逐个 navigate_page 到 §A1..A13 模块"
    }
    2 {
        Write-Host "  完整清单见 tests\e2e\03-member-test-cases.md（共 44 用例）"
        Write-Host "  关键起始步骤："
        Write-Host "    - mcp__browser-use__evaluate_script (clear localStorage)"
        Write-Host "    - mcp__browser-use__navigate_page (url=/login)"
        Write-Host "    - mcp__browser-use__click (族员一键登录)"
        Write-Host "    - 然后逐个 navigate_page 到 §1..18 模块"
    }
    3 {
        Write-Host "  完整清单见 tests\e2e\04-cross-role-test-cases.md（共 23 用例）"
        Write-Host "  重点是 §B1..B22 跨角色权限矩阵"
        Write-Host "  每个用例之前都需要 evaluate_script 清 localStorage"
    }
    4 {
        Write-Host "  完整清单见 tests\e2e\01-test-framework.md §六 Round 4"
        Write-Host "  包括 1000 人 G6 性能、token 过期、长耗时进度条"
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "  报告路径: $reportPath"
Write-Host "  截图路径: $screenshotsDir"
Write-Host "========================================"
