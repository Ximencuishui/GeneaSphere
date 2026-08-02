#!/bin/bash
# Round 8 — D8-05: 数据库备份手动触发 + 验证
#
# 用法：
#   bash tests/production/backup-drill.sh [staging|prod]
#
# 步骤：
#   1. 通过管理 API 触发手动备份
#   2. 验证 COS 中出现 backup/db/{date}/dump.sql.gz
#   3. 下载并校验文件大小（≥ 1MB）
#   4. 输出 RPO 评估

set -e

ENV="${1:-staging}"
BASE_URL="${BASE_URL:-http://localhost:3101}"
CLAN_SLUG="zhuxi-demo"
PASS=0
FAIL=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  [PASS] $name"
    ((PASS++))
  else
    echo "  [FAIL] $name → 期望: $expected, 实际: $actual"
    ((FAIL++))
  fi
}

echo "========================================"
echo "  Round 8 — 数据库备份演练（$ENV）"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# 1. 登录管理员
echo ""
echo "[1] 登录管理员"
LOGIN_RES=$(curl -s -X POST "$BASE_URL/api/auth/demo-login" \
  -H 'Content-Type: application/json' -d '{}')
TOKEN=$(echo "$LOGIN_RES" | python -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "  [FAIL] 无法获取 token"
  exit 1
fi
echo "  [OK] 已获取 token"
AUTH="Authorization: Bearer $TOKEN"

# 2. 触发手动备份
echo ""
echo "[2] 触发手动备份（POST /api/admin/backup/trigger）"
TRIGGER_RES=$(curl -s -X POST -H "$AUTH" "$BASE_URL/api/admin/backup/trigger?clanSlug=$CLAN_SLUG")
echo "  响应: $TRIGGER_RES"

TRIGGER_OK=$(echo "$TRIGGER_RES" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('success', d.get('ok', False)))" 2>/dev/null)
if [ "$TRIGGER_OK" = "True" ] || [ "$TRIGGER_OK" = "true" ]; then
  echo "  [PASS] 备份触发成功"
  ((PASS++))
else
  echo "  [FAIL] 备份触发失败或 API 不存在（需在 D8-05 补全端点）"
  ((FAIL++))
fi

# 3. 验证备份出现在 COS
echo ""
echo "[3] 验证 COS 备份文件"
DATE_STR=$(date -u +%Y-%m-%d)
BACKUP_KEY="backup/db/${DATE_STR}/dump.sql.gz"
echo "  预期 key: $BACKUP_KEY"
echo "  [INFO] 请使用以下命令在服务器上验证："
echo "    coscli ls cos://xungenlu-cold/backup/db/${DATE_STR}/"
echo "    或在控制台查看：https://console.cloud.tencent.com/cos/bucket"

# 4. 验证 cron 配置
echo ""
echo "[4] 验证定时任务（每日 3:00 备份）"
echo "  [INFO] DatabaseBackupService 已配置 @Cron(CronExpression.EVERY_DAY_AT_3AM)"
echo "  请在生产服务器执行：pm2 logs geneasphere-server | grep '数据库备份'"

# 5. 旧备份清理验证（仅生产）
echo ""
echo "[5] 30 天前备份自动清理（生产环境）"
echo "  [INFO] 清理逻辑在 cleanOldBackups()，DB_BACKUP_RETENTION_DAYS=30"
echo "  演练：将系统时间快进到第 31 天，触发备份 → 验证过期目录被删除"

# 总结
echo ""
echo "========================================"
echo "  通过：$PASS / 失败：$FAIL"
echo "  剩余步骤："
echo "    1. 在 $ENV 服务器执行 R8 演练"
echo "    2. 验证 COS 中实际出现 backup key"
echo "    3. 记录 RPO：上次备份到现在的最大数据丢失窗口"
echo "========================================"

exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
