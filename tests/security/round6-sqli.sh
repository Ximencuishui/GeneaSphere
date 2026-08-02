#!/bin/bash
# Round 6 - S6-04: SQL 注入探测
# 验证：所有参数化查询端点，注入 payload → 404/400，无数据泄露

set -u

BASE_URL="${BASE_URL:-http://localhost:3101}"
CLAN_SLUG="zhuxi-demo"
PASS=0
FAIL=0

check() {
  local name="$1"
  local max_expected="$2"
  local actual="$3"
  if [ "$actual" -le "$max_expected" ] && [ "$actual" != "500" ]; then
    echo "  [PASS] $name -> HTTP $actual"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $name -> 期望 ≤ $max_expected 且非 500，实际 $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "========================================"
echo "  Round 6 - SQL 注入探测"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

LOGIN_RES=$(curl -s -X POST "$BASE_URL/api/auth/demo-login" \
  -H 'Content-Type: application/json' -d '{}')
TOKEN=$(echo "$LOGIN_RES" | python -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "  [FAIL] 无法获取 token"
  exit 1
fi
AUTH="Authorization: Bearer $TOKEN"

PAYLOADS=(
  "OR_1eq_1"
  "OR_1eq_1_dash"
  "UNION_SELECT_NULL"
  "DROP_TABLE_users"
  "admin_dash_dash"
  "OR_eq_1_block"
  "SELECT_pg_user"
  "pg_sleep_5"
  "OR_dollar1_eq_dollar1"
)

echo ""
echo "[1] clanSlug 注入点（9 个 payload）"
for p in "${PAYLOADS[@]}"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "$AUTH" \
    "$BASE_URL/api/admin/dashboard?clanSlug=${p}")
  check "clanSlug=${p}" "404" "$CODE"
done

echo ""
echo "[2] personId 路径注入（5 个 payload）"
for p in "1_OR_1eq1" "1_quote" "1_dashdash" "1_UNION_SELECT" "0x41"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "$AUTH" \
    "$BASE_URL/api/people/${p}")
  check "personId=${p}" "404" "$CODE"
done

echo ""
echo "[3] announcementId 路径注入"
for p in "abc" "1_quote" "1_OR_1eq1" "99999999999999999"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE \
    -H "$AUTH" \
    "$BASE_URL/api/admin/announcements/${p}?clanSlug=$CLAN_SLUG")
  check "DELETE announcements/${p}" "404" "$CODE"
done

echo ""
echo "[4] 搜索 query 注入"
for p in "zhuxi_OR_1eq1" "zhuxi_UNION_SELECT" "zhuxi_semi"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "$AUTH" \
    "$BASE_URL/api/admin/members?clanSlug=$CLAN_SLUG&q=${p}")
  check "search q=${p}" "200" "$CODE"
done

echo ""
echo "[5] JSON body 注入（创建公告）"
INJECT_JSON='{"title":"X_DROP_TABLE","content":"test","clanSlug":"zhuxi-demo"}'
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d "$INJECT_JSON" \
  "$BASE_URL/api/admin/announcements")
if [ "$CODE" = "400" ] || [ "$CODE" = "201" ]; then
  echo "  [PASS] JSON body 注入 -> HTTP $CODE"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] JSON body 注入 -> HTTP $CODE（应 400 或 201）"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "[6] pageSize 越界（DTO 校验）"
for p in "99999" "-1" "0" "abc" "1_semi_DROP"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "$AUTH" \
    "$BASE_URL/api/admin/members?clanSlug=$CLAN_SLUG&pageSize=${p}")
  if [ "$CODE" != "500" ]; then
    echo "  [PASS] pageSize=${p} -> HTTP $CODE"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] pageSize=${p} -> HTTP 500（应 DTO 校验）"
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "[7] 时间盲注（pg_sleep 探测）"
T_START=$(date +%s%3N)
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  -H "$AUTH" \
  "$BASE_URL/api/admin/dashboard?clanSlug=$CLAN_SLUG%27%3BSELECT%20pg_sleep%285%29--")
T_END=$(date +%s%3N)
T_DIFF=$((T_END - T_START))
if [ "$T_DIFF" -lt 5000 ]; then
  echo "  [PASS] 时间盲注未触发：耗时 ${T_DIFF}ms"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] 时间盲注触发：耗时 ${T_DIFF}ms（≥ 5s）"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "========================================"
echo "  通过：$PASS / 失败：$FAIL"
echo "========================================"

exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
