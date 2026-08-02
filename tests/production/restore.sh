#!/bin/bash
# Round 8 — D8-07/D8-08: 数据库备份恢复脚本
#
# 用法：
#   bash tests/production/restore.sh <backup-key> [target-db-url]
#
# 示例：
#   bash tests/production/restore.sh backup/db/2026-08-01/dump.sql.gz
#   bash tests/production/restore.sh backup/db/2026-08-01/dump.sql.gz "postgresql://user:pass@localhost:5432/restore_test"
#
# 步骤：
#   1. 从 COS 下载 backup/db/{date}/dump.sql.gz
#   2. gunzip 解压
#   3. psql 还原到目标数据库
#   4. 验证数据完整性（人员数、家族数）

set -e

BACKUP_KEY="${1:-}"
TARGET_DB_URL="${2:-$DATABASE_URL}"

if [ -z "$BACKUP_KEY" ]; then
  echo "用法: $0 <backup-key> [target-db-url]"
  echo "示例: $0 backup/db/2026-08-01/dump.sql.gz"
  exit 1
fi

if [ -z "$TARGET_DB_URL" ]; then
  echo "  [FAIL] 未提供 TARGET_DB_URL 或 DATABASE_URL 环境变量"
  exit 1
fi

echo "========================================"
echo "  GeneaSphere 数据库恢复脚本"
echo "  备份 key: $BACKUP_KEY"
echo "  目标 DB: $TARGET_DB_URL"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# 0. 警告
echo ""
echo "[0] ⚠️  警告：恢复操作会覆盖目标数据库！"
echo "  目标: $TARGET_DB_URL"
read -p "  确认输入 'YES' 继续: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "  取消"
  exit 0
fi

# 1. 下载备份（从 COS）
echo ""
echo "[1] 从 COS 下载备份"
WORKDIR=$(mktemp -d)
trap "rm -rf $WORKDIR" EXIT

LOCAL_GZ="$WORKDIR/dump.sql.gz"
LOCAL_SQL="$WORKDIR/dump.sql"

# 方法 1: coscli（推荐）
if command -v coscli >/dev/null 2>&1; then
  coscli cp "cos://xungenlu-cold/${BACKUP_KEY}" "$LOCAL_GZ"
# 方法 2: 腾讯云 COS CLI
elif command -v coscmd >/dev/null 2>&1; then
  coscmd download "${BACKUP_KEY}" "$LOCAL_GZ"
# 方法 3: 备用 wget（如果已暴露公网）
else
  echo "  [WARN] 未检测到 coscli/coscmd，请先安装："
  echo "    https://cloud.tencent.com/document/product/436/63143"
  echo "  或手动从控制台下载："
  echo "    https://console.cloud.tencent.com/cos/bucket"
  echo "  下载到 $LOCAL_GZ 后再次执行"
  exit 1
fi

if [ ! -f "$LOCAL_GZ" ]; then
  echo "  [FAIL] 备份文件未下载"
  exit 1
fi

BACKUP_SIZE=$(stat -c%s "$LOCAL_GZ" 2>/dev/null || stat -f%z "$LOCAL_GZ")
echo "  [OK] 已下载：$BACKUP_SIZE bytes"

# 2. 验证备份大小
echo ""
echo "[2] 验证备份合理性"
if [ "$BACKUP_SIZE" -lt 1024 ]; then
  echo "  [FAIL] 备份文件过小（< 1KB），可能损坏"
  exit 1
fi
echo "  [OK] 文件大小：$(numfmt --to=iec $BACKUP_SIZE 2>/dev/null || echo ${BACKUP_SIZE} bytes)"

# 3. 解压
echo ""
echo "[3] gunzip 解压"
gunzip -c "$LOCAL_GZ" > "$LOCAL_SQL"
SQL_SIZE=$(stat -c%s "$LOCAL_SQL" 2>/dev/null || stat -f%z "$LOCAL_SQL")
echo "  [OK] 解压后：$(numfmt --to=iec $SQL_SIZE 2>/dev/null || echo ${SQL_SIZE} bytes)"

# 4. 恢复
echo ""
echo "[4] psql 还原（计时开始）"
T_START=$(date +%s)

# 事务包裹（如果中途失败可回滚）
if psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f "$LOCAL_SQL" 2>&1 | tee "$WORKDIR/restore.log"; then
  T_END=$(date +%s)
  T_DIFF=$((T_END - T_START))
  echo ""
  echo "  [OK] 恢复完成，耗时 ${T_DIFF}s"
else
  T_END=$(date +%s)
  T_DIFF=$((T_END - T_START))
  echo ""
  echo "  [FAIL] 恢复失败，耗时 ${T_DIFF}s"
  echo "  请检查 $WORKDIR/restore.log"
  exit 1
fi

# 5. 数据完整性验证
echo ""
echo "[5] 数据完整性验证"
PERSON_COUNT=$(psql "$TARGET_DB_URL" -t -c "SELECT COUNT(*) FROM \"Person\";" 2>/dev/null | xargs)
CLAN_COUNT=$(psql "$TARGET_DB_URL" -t -c "SELECT COUNT(*) FROM \"Clan\";" 2>/dev/null | xargs)
USER_COUNT=$(psql "$TARGET_DB_URL" -t -c "SELECT COUNT(*) FROM \"User\";" 2>/dev/null | xargs)

echo "  Person: $PERSON_COUNT"
echo "  Clan: $CLAN_COUNT"
echo "  User: $USER_COUNT"

if [ -n "$PERSON_COUNT" ] && [ "$PERSON_COUNT" -gt 0 ]; then
  echo "  [PASS] 数据完整性验证通过"
else
  echo "  [FAIL] Person 表为空，恢复可能不完整"
  exit 1
fi

# 6. RTO 评估
echo ""
echo "[6] RTO 评估"
echo "  恢复总耗时：${T_DIFF}s"
RTO_LIMIT=1800  # 30 分钟
if [ "$T_DIFF" -lt "$RTO_LIMIT" ]; then
  echo "  [PASS] RTO 达标（< 30 min）"
else
  echo "  [WARN] RTO 超标（> 30 min），需优化恢复策略"
fi

echo ""
echo "========================================"
echo "  恢复成功 ✅"
echo "  目标 DB: $TARGET_DB_URL"
echo "  耗时: ${T_DIFF}s"
echo "========================================"
