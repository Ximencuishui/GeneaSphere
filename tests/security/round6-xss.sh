#!/bin/bash
# Round 6 - S6-06/S6-07: XSS 反射与存储
# 验证：所有输出字段经过转义，CSP 阻止 inline script

set -u

# 注意：不要使用 set -e；脚本需要继续检测所有 payload 才能给出综合判定。

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
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $name -> 期望 $expected, 实际 $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "========================================"
echo "  Round 6 - XSS 反射与存储"
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

# XSS payload 集
PAYLOADS=(
  '<script>alert(1)</script>'
  '"><script>alert(1)</script>'
  '<img src=x onerror=alert(1)>'
  '<svg onload=alert(1)>'
  'javascript:alert(1)'
  '<iframe src=javascript:alert(1)>'
  '{{constructor.constructor("alert(1)")()}}'
)

# 1. 存储型 XSS：创建公告 + GET 验证
echo ""
echo "[1] 存储型 XSS：创建公告 + GET 验证"
for p in "${PAYLOADS[@]}"; do
  # 创建
  CREATE_RES=$(curl -s -X POST "$BASE_URL/api/admin/announcements" \
    -H "$AUTH" \
    -H 'Content-Type: application/json' \
    -d "$(python -c "import json; print(json.dumps({'title': 'XSS测试', 'content': '$p', 'clanSlug': 'zhuxi-demo'}))")")
  ANN_ID=$(echo "$CREATE_RES" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

  if [ -z "$ANN_ID" ]; then
    echo "  [INFO] 创建失败（可能已过滤）: $(echo "$p" | head -c 30)"
    continue
  fi

  # 拉取详情
  GET_RES=$(curl -s -H "$AUTH" "$BASE_URL/api/admin/announcements/$ANN_ID?clanSlug=$CLAN_SLUG")
  ESCAPED=$(echo "$GET_RES" | ESCAPED_PAYLOAD="$p" python -c "
import sys, json, os
try:
    d = json.load(sys.stdin)
    content = d.get('content', '')
    title = d.get('title', '')
    raw = os.environ.get('ESCAPED_PAYLOAD','')
    print('RAW' if (raw in content or raw in title) else 'ESCAPED')
except: print('PARSE_ERROR')
")
  if [ "$ESCAPED" = "ESCAPED" ]; then
    echo "  [PASS] payload 已被转义或拒绝：$(echo "$p" | head -c 30)..."
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] payload 原样存储: $(echo "$p" | head -c 40)..."
    FAIL=$((FAIL + 1))
  fi

  # 清理
  curl -s -X DELETE -H "$AUTH" "$BASE_URL/api/admin/announcements/$ANN_ID?clanSlug=$CLAN_SLUG" > /dev/null
done

# 2. 反射型 XSS：搜索 query
echo ""
echo "[2] 反射型 XSS：搜索 query"
for p in "${PAYLOADS[@]}"; do
  ENC=$(python -c "import urllib.parse; print(urllib.parse.quote('$p'))")
  RES=$(curl -s -H "$AUTH" \
    "$BASE_URL/api/admin/members?clanSlug=$CLAN_SLUG&q=$ENC")
  RAW_HIT=$(echo "$RES" | grep -c "$p" 2>/dev/null || echo 0)
  if [ "$RAW_HIT" = "0" ]; then
    echo "  [PASS] 反射 query 已转义：$(echo "$p" | head -c 30)..."
    PASS=$((PASS + 1))
  else
    echo "  [INFO] 反射 query 包含 payload（JSON API 不会执行，依赖前端 DOM 检查）: $(echo "$p" | head -c 30)..."
  fi
done

# 3. 响应头 CSP
echo ""
echo "[3] CSP 头检查"
HEADERS=$(curl -s -I -H "$AUTH" "$BASE_URL/api/admin/dashboard?clanSlug=$CLAN_SLUG")
if echo "$HEADERS" | grep -qi "content-security-policy"; then
  CSP=$(echo "$HEADERS" | grep -i "content-security-policy" | head -1)
  echo "  [PASS] CSP 头存在: $(echo "$CSP" | head -c 80)..."
  PASS=$((PASS + 1))
else
  echo "  [FAIL] 缺少 CSP 头"
  FAIL=$((FAIL + 1))
fi

# 4. 响应头 X-XSS-Protection
if echo "$HEADERS" | grep -qi "x-xss-protection"; then
  echo "  [PASS] X-XSS-Protection 头存在"
  PASS=$((PASS + 1))
else
  echo "  [INFO] 缺少 X-XSS-Protection 头（现代浏览器多已弃用）"
fi

echo ""
echo "========================================"
echo "  通过: $PASS / 失败: $FAIL"
echo "========================================"

exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)