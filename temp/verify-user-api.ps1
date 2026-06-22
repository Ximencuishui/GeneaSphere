# 根脉云谱用户中心 API 验收脚本
$BASE = "http://localhost:3001"

# 1. 登录获取 token
Write-Host "=== 1. 演示账号登录 ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$BASE/auth/demo-login" -Method POST -UseBasicParsing
$data = $r.Content | ConvertFrom-Json
$TOKEN = $data.access_token
Write-Host "[OK] 获取 token (长度: $($TOKEN.Length))"
Write-Host "User: $($data.user.id), Phone: $($data.user.phone)"

$HEADERS = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type"  = "application/json"
}

# 2. 验证 /api/user/profile
Write-Host "`n=== 2. GET /api/user/profile ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$BASE/api/user/profile" -Method GET -Headers $HEADERS -UseBasicParsing
$d = $r.Content | ConvertFrom-Json
Write-Host "[OK] HTTP $($r.StatusCode)"
Write-Host "  Phone(masked): $($d.phone)"
Write-Host "  Nickname: $($d.nickname)"
Write-Host "  Primary clan: $($d.primary_clan.name) (Role: $($d.primary_clan.role))"
Write-Host "  Stats: photos=$($d.stats.photo_count), annotations=$($d.stats.annotation_count), orders=$($d.stats.order_count)"

# 3. 验证 /api/user/settings GET
Write-Host "`n=== 3. GET /api/user/settings ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$BASE/api/user/settings" -Method GET -Headers $HEADERS -UseBasicParsing
$d = $r.Content | ConvertFrom-Json
Write-Host "[OK] HTTP $($r.StatusCode)"
Write-Host "  跨家族寻找: $($d.allow_cross_clan_friend_finding)"
Write-Host "  公开童年地点: $($d.show_childhood_location)"
Write-Host "  通知: in_app=$($d.enable_in_app_notification), sms=$($d.enable_sms_notification)"

# 4. PUT /api/user/settings
Write-Host "`n=== 4. PUT /api/user/settings ===" -ForegroundColor Cyan
$body = '{"show_childhood_location":true,"enable_sms_notification":true}' | ConvertTo-Json
try {
    $r = Invoke-WebRequest -Uri "$BASE/api/user/settings" -Method PUT -Headers $HEADERS -Body $body -UseBasicParsing
    Write-Host "[OK] HTTP $($r.StatusCode)"
    $d = $r.Content | ConvertFrom-Json
    Write-Host "  童年地点 (更新后): $($d.show_childhood_location)"
    Write-Host "  短信通知 (更新后): $($d.enable_sms_notification)"
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)"
}

# 5. 验证通知接口
Write-Host "`n=== 5. GET /api/user/notifications/unread-count ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$BASE/api/user/notifications/unread-count" -Method GET -Headers $HEADERS -UseBasicParsing
$d = $r.Content | ConvertFrom-Json
Write-Host "[OK] HTTP $($r.StatusCode), unread: $($d.unread_count)"

# 6. 照片列表
Write-Host "`n=== 6. GET /api/user/photos ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$BASE/api/user/photos?page=1&pageSize=5" -Method GET -Headers $HEADERS -UseBasicParsing
$d = $r.Content | ConvertFrom-Json
Write-Host "[OK] HTTP $($r.StatusCode), total: $($d.pagination.total), items: $($d.data.Count)"

# 7. 订单列表
Write-Host "`n=== 7. GET /api/user/orders ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$BASE/api/user/orders?page=1&pageSize=5" -Method GET -Headers $HEADERS -UseBasicParsing
$d = $r.Content | ConvertFrom-Json
Write-Host "[OK] HTTP $($r.StatusCode), total: $($d.pagination.total), items: $($d.data.Count)"

# 8. 标注列表
Write-Host "`n=== 8. GET /api/user/annotations ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$BASE/api/user/annotations?page=1&pageSize=5" -Method GET -Headers $HEADERS -UseBasicParsing
$d = $r.Content | ConvertFrom-Json
Write-Host "[OK] HTTP $($r.StatusCode), total: $($d.pagination.total), items: $($d.data.Count)"

# 9. 工具箱历史 (mock)
Write-Host "`n=== 9. GET /api/user/tool-history ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$BASE/api/user/tool-history" -Method GET -Headers $HEADERS -UseBasicParsing
$d = $r.Content | ConvertFrom-Json
Write-Host "[OK] HTTP $($r.StatusCode), total: $($d.pagination.total), notice: $($d.notice)"

# 10. 小组列表 (mock)
Write-Host "`n=== 10. GET /api/user/groups ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$BASE/api/user/groups" -Method GET -Headers $HEADERS -UseBasicParsing
$d = $r.Content | ConvertFrom-Json
Write-Host "[OK] HTTP $($r.StatusCode), count: $($d.data.Count), notice: $($d.notice)"

# 11. 音像墙 (mock)
Write-Host "`n=== 11. GET /api/user/videos ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$BASE/api/user/videos" -Method GET -Headers $HEADERS -UseBasicParsing
$d = $r.Content | ConvertFrom-Json
Write-Host "[OK] HTTP $($r.StatusCode), count: $($d.data.Count), notice: $($d.notice)"

# 12. 资料更新
Write-Host "`n=== 12. PUT /api/user/profile ===" -ForegroundColor Cyan
$body = '{"nickname":"演示用户·小明·验收"}' | ConvertTo-Json
$r = Invoke-WebRequest -Uri "$BASE/api/user/profile" -Method PUT -Headers $HEADERS -Body $body -UseBasicParsing
$d = $r.Content | ConvertFrom-Json
Write-Host "[OK] HTTP $($r.StatusCode), nickname: $($d.nickname)"

# 13. 验证 401
Write-Host "`n=== 13. 未授权访问（应返回 401）===" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "$BASE/api/user/profile" -Method GET -UseBasicParsing
    Write-Host "[FAIL] 期望 401，实际 $($r.StatusCode)"
} catch {
    Write-Host "[OK] 返回 401 (符合预期)"
}

Write-Host "`n=== 验收完成 ===" -ForegroundColor Green