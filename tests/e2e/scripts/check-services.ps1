# GeneaSphere 服务健康检查脚本
#
# 用法：.\tests\e2e\scripts\check-services.ps1
# 退出码：0=全部OK，其他=存在失败项
#
# 检查项：
#   1. SSH 隧道端口 15432 可达
#   2. 后端端口 3101 可达
#   3. 前端端口 5173 可达
#   4. 后端演示登录接口可用
#   5. 关键依赖（OCR/COS）启动状态（从日志读取）

param([switch]$Quiet)

$ErrorActionPreference = 'Continue'
$baseResult = $true

function Check-Ok([string]$name, [bool]$ok, [string]$detail = '') {
    $mark = if ($ok) { "[PASS]" } else { "[FAIL]"; $script:baseResult = $false }
    Write-Host "  $mark $name" -NoNewline
    if ($detail) { Write-Host "  -- $detail" -ForegroundColor Gray }
}

function Check-Warn([string]$name, [string]$detail) {
    Write-Host "  [WARN] $name  -- $detail" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  GeneaSphere 服务健康检查"
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 1. SSH 隧道
Write-Host "[1] SSH 隧道 → Lighthouse PostgreSQL"
$dbOk = Test-NetConnection 127.0.0.1 -Port 15432 -WarningAction SilentlyContinue -InformationLevel Quiet
Check-Ok "本地端口 15432 (隧道端)" $dbOk "ssh -L 15432:127.0.0.1:5432 root@43.134.232.175"

# 2. 后端端口
Write-Host ""
Write-Host "[2] 后端 NestJS 服务"
$beOk = Test-NetConnection 127.0.0.1 -Port 3101 -WarningAction SilentlyContinue -InformationLevel Quiet
Check-Ok "localhost:3101" $beOk

# 3. 前端端口
Write-Host ""
Write-Host "[3] 前端 Vite 服务"
$feOk = Test-NetConnection 127.0.0.1 -Port 5173 -WarningAction SilentlyContinue -InformationLevel Quiet
Check-Ok "localhost:5173" $feOk

# 4. 后端演示登录
Write-Host ""
Write-Host "[4] 后端演示登录接口"
try {
    $r = Invoke-RestMethod -Uri 'http://localhost:3101/api/auth/demo-login' -Method Post -TimeoutSec 15 -ContentType 'application/json' -Body '{}'
    $ok = $r.access_token -and $r.user.phone
    Check-Ok "POST /api/auth/demo-login" $ok "phone=$($r.user.phone), role=$($r.user.role), clan=$($r.demoClanSlug)"
} catch {
    Check-Ok "POST /api/auth/demo-login" $false $_.Exception.Message
}

try {
    $r = Invoke-RestMethod -Uri 'http://localhost:3101/api/auth/demo-member-login' -Method Post -TimeoutSec 15 -ContentType 'application/json' -Body '{}'
    $ok = $r.access_token -and $r.user.phone
    Check-Ok "POST /api/auth/demo-member-login" $ok "phone=$($r.user.phone), role=$($r.user.role)"
} catch {
    Check-Ok "POST /api/auth/demo-member-login" $false $_.Exception.Message
}

# 5. 启动标志（从进程 / 日志推断）
Write-Host ""
Write-Host "[5] 关键启动标志（进程列表）"
$nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcs) {
    Check-Ok "Node 进程数: $($nodeProcs.Count)" $true
} else {
    Check-Ok "Node 进程数: 0" $false "前后端未启动"
}

# 总结
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
if ($baseResult) {
    Write-Host "  [OK] All checks passed - ready for testing" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Some checks failed - please fix before testing" -ForegroundColor Red
}
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

exit $(if ($baseResult) { 0 } else { 1 })
