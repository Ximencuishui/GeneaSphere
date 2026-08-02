#!/bin/bash
# Round 6 - S6-01: JWT 篡改/过期/签名替换/算法 none 攻击
#
# 用法：bash tests/security/round6-jwt-attack.sh
# 前置：后端运行在 :3101
# 期望：所有异常 token → 401

set -u

BASE_URL="${BASE_URL:-http://localhost:3101}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  [PASS] $name -> HTTP $actual"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $name -> 期望 $expected, 实际 $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "========================================"
echo "  Round 6 - JWT 攻击向量测试"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

echo ""
echo "[0] 获取合法 token"
LOGIN_RES=$(curl -s -X POST "$BASE_URL/api/auth/demo-login" \
  -H 'Content-Type: application/json' -d '{}')
GOOD_TOKEN=$(echo "$LOGIN_RES" | python -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
if [ -z "$GOOD_TOKEN" ]; then
  echo "  [FAIL] 无法获取 token"
  exit 1
fi
echo "  [OK] 合法 token 长度：${#GOOD_TOKEN}"

ENDPOINT="$BASE_URL/api/admin/dashboard?clanSlug=zhuxi-demo"

echo ""
echo "[1] 无 Authorization 头"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$ENDPOINT")
check "无 Authorization" "401" "$CODE"

echo ""
echo "[2] Authorization: Bearer invalid"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer invalid' "$ENDPOINT")
check "Bearer invalid" "401" "$CODE"

echo ""
echo "[3] Bearer 篡改签名（修改最后 5 字符）"
TAMPERED="${GOOD_TOKEN%??????}XXXXX"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TAMPERED" "$ENDPOINT")
check "Bearer 篡改签名" "401" "$CODE"

echo ""
echo "[4] 过期 token（1 小时前过期）"
EXPIRED_TOKEN=$(python -c "
import base64, json, time
header = base64.urlsafe_b64encode(json.dumps({'alg':'HS256','typ':'JWT'}).encode()).rstrip(b'=').decode()
payload = base64.urlsafe_b64encode(json.dumps({
    'sub': '13800000000',
    'role': 'OWNER',
    'exp': int(time.time()) - 3600,
    'iat': int(time.time()) - 7200,
}).encode()).rstrip(b'=').decode()
sig = base64.urlsafe_b64encode(b'fake-signature').rstrip(b'=').decode()
print(f'{header}.{payload}.{sig}')
")
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $EXPIRED_TOKEN" "$ENDPOINT")
check "Expired token" "401" "$CODE"

echo ""
echo "[5] alg=none 攻击"
NONE_TOKEN=$(python -c "
import base64, json
header = base64.urlsafe_b64encode(json.dumps({'alg':'none','typ':'JWT'}).encode()).rstrip(b'=').decode()
payload = base64.urlsafe_b64encode(json.dumps({
    'sub': '13800000000',
    'role': 'OWNER',
    'exp': 9999999999,
}).encode()).rstrip(b'=').decode()
print(f'{header}.{payload}.')
")
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $NONE_TOKEN" "$ENDPOINT")
check "alg=none" "401" "$CODE"

echo ""
echo "[6] 算法混淆（保留 token，修改 alg）"
RS_TOKEN=$(python -c "
import base64, json
header = base64.urlsafe_b64encode(json.dumps({'alg':'none','typ':'JWT'}).encode()).rstrip(b'=').decode()
parts = '$GOOD_TOKEN'.split('.')
print(f'{header}.{parts[1]}.')
")
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $RS_TOKEN" "$ENDPOINT")
check "算法混淆" "401" "$CODE"

echo ""
echo "[7] Authorization: Bearer （空 token）"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer ' "$ENDPOINT")
check "空 Bearer" "401" "$CODE"

echo ""
echo "[8] 双重 Authorization 头"
CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $GOOD_TOKEN" \
  -H "Authorization: Bearer invalid" \
  "$ENDPOINT")
echo "  [INFO] 双重 Authorization 头 -> HTTP $CODE（实现相关）"

echo ""
echo "[9] EDITOR token 调 admin API（应 403）"
EDITOR_LOGIN=$(curl -s -X POST "$BASE_URL/api/auth/demo-member-login" \
  -H 'Content-Type: application/json' -d '{}')
EDITOR_TOKEN=$(echo "$EDITOR_LOGIN" | python -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
if [ -n "$EDITOR_TOKEN" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $EDITOR_TOKEN" "$ENDPOINT")
  check "EDITOR 调 admin" "403" "$CODE"
else
  echo "  [SKIP] 无法获取 EDITOR token"
fi

echo ""
echo "[10] 仅有 token，无 Bearer 前缀"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: $GOOD_TOKEN" "$ENDPOINT")
echo "  [INFO] 仅 token 无 Bearer -> HTTP $CODE（视 NestJS AuthGuard 行为）"

echo ""
echo "========================================"
echo "  通过：$PASS / 失败：$FAIL"
echo "========================================"

exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
