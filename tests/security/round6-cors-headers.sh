#!/bin/bash
# Round 6 - S6-15/S6-24/S6-25: CORS + 安全响应头 + HSTS

set -u

# 注意：不要使用 set -e；计数自增和 if 失败都不应让脚本提前终止。

BASE_URL="${BASE_URL:-http://localhost:3101}"
PUBLIC_URL="${PUBLIC_URL:-https://xungenlu.cn}"
PASS=0
FAIL=0
WARN=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  [PASS] $name"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $name -> 期望: $expected, 实际: $actual"
    FAIL=$((FAIL + 1))
  fi
}

bump_warn() { WARN=$((WARN + 1)); }
bump_pass() { PASS=$((PASS + 1)); }
bump_fail() { FAIL=$((FAIL + 1)); }

echo "========================================"
echo "  Round 6 - CORS + 安全响应头"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# 1. 安全响应头（必要项）
echo ""
echo "[1] 必要安全响应头"
HEADERS=$(curl -s -I -X OPTIONS "$BASE_URL/api/auth/demo-login" -H 'Origin: http://evil.com' 2>/dev/null || \
         curl -s -I "$BASE_URL/api/health/ready")

for header in "X-Content-Type-Options" "X-Frame-Options" "Referrer-Policy" "Permissions-Policy" "Strict-Transport-Security" "Content-Security-Policy"; do
  if echo "$HEADERS" | grep -qi "^$header:"; then
    value=$(echo "$HEADERS" | grep -i "^$header:" | head -1 | sed "s/^[^:]*: *//" | tr -d '\r\n')
    echo "  [PASS] $header: $(echo $value | head -c 60)"
    bump_pass
  else
    echo "  [FAIL] 缺少 $header"
    bump_fail
  fi
done

# 2. CORS：任意 Origin 不应获得凭证
echo ""
echo "[2] CORS 跨域检查"
echo "  攻击 Origin: http://evil.com"
CORS_RES=$(curl -s -I -H "Origin: http://evil.com" -H "Access-Control-Request-Method: POST" \
  -X OPTIONS "$BASE_URL/api/auth/login")
ACA_ORIGIN=$(echo "$CORS_RES" | grep -i "^access-control-allow-origin:" | head -1 | sed "s/^[^:]*: *//" | tr -d '\r\n')
ACA_CREDENTIALS=$(echo "$CORS_RES" | grep -i "^access-control-allow-credentials:" | head -1 | sed "s/^[^:]*: *//" | tr -d '\r\n')

if [ "$ACA_ORIGIN" = "*" ] && [ "$ACA_CREDENTIALS" = "true" ]; then
  echo "  [FAIL] CORS 允许任意 Origin + 凭证（高危）"
  bump_fail
elif [ "$ACA_ORIGIN" = "http://evil.com" ]; then
  echo "  [FAIL] CORS 反射任意 Origin（高危）"
  bump_fail
else
  echo "  [PASS] CORS 未对 evil.com 开放：ACA-Origin='$ACA_ORIGIN'"
  bump_pass
fi

# 3. CORS：合法 Origin 应允许
echo ""
echo "[3] CORS 合法 Origin"
CORS_OK=$(curl -s -I -H "Origin: https://xungenlu.cn" -H "Access-Control-Request-Method: POST" \
  -X OPTIONS "$BASE_URL/api/auth/login")
ACA_ORIGIN_OK=$(echo "$CORS_OK" | grep -i "^access-control-allow-origin:" | head -1 | sed "s/^[^:]*: *//" | tr -d '\r\n')
if [ "$ACA_ORIGIN_OK" = "https://xungenlu.cn" ] || [ -z "$ACA_ORIGIN_OK" ]; then
  echo "  [PASS] 合法 Origin 处理正确: '$ACA_ORIGIN_OK'"
  bump_pass
else
  echo "  [WARN] 合法 Origin 应被允许: '$ACA_ORIGIN_OK'"
  bump_warn
fi

# 4. demo-login 在生产应禁用
echo ""
echo "[4] demo-login 在生产环境禁用检查"
if [ -n "$PUBLIC_URL" ] && [ "$PUBLIC_URL" != "http://localhost:3101" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$PUBLIC_URL/api/auth/demo-login" \
    -H 'Content-Type: application/json' -d '{}')
  if [ "$CODE" = "404" ] || [ "$CODE" = "403" ] || [ "$CODE" = "503" ]; then
    echo "  [PASS] 生产 demo-login 已禁用: HTTP $CODE"
    bump_pass
  elif [ "$CODE" = "201" ]; then
    echo "  [FAIL] 生产 demo-login 仍可访问（高危）"
    bump_fail
  else
    echo "  [INFO] 生产 demo-login -> HTTP $CODE（需人工确认）"
  fi
else
  echo "  [SKIP] 未配置 PUBLIC_URL，跳过生产探测"
fi

# 5. 错误信息泄露
echo ""
echo "[5] 错误信息泄露检查（生产应屏蔽堆栈）"
RES=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"invalid","password":"x"}')
if echo "$RES" | grep -qi "at Object\|node_modules\|prisma\|stack"; then
  echo "  [FAIL] 错误响应包含堆栈信息（信息泄露）"
  bump_fail
else
  echo "  [PASS] 错误响应无堆栈泄露"
  bump_pass
fi

# 6. Server 标识
echo ""
echo "[6] Server 标识（应最小化）"
SERVER_HEADER=$(echo "$HEADERS" | grep -i "^server:" | head -1 | sed "s/^[^:]*: *//" | tr -d '\r\n')
X_POWERED_BY=$(echo "$HEADERS" | grep -i "^x-powered-by:" | head -1 | sed "s/^[^:]*: *//" | tr -d '\r\n')
if [ -z "$SERVER_HEADER" ] || [ "$SERVER_HEADER" = "nginx" ]; then
  echo "  [PASS] Server 头：'${SERVER_HEADER:-空}'"
  bump_pass
else
  echo "  [WARN] Server 头暴露版本：'$SERVER_HEADER'"
  bump_warn
fi
if [ -z "$X_POWERED_BY" ]; then
  echo "  [PASS] X-Powered-By 不存在"
  bump_pass
else
  echo "  [WARN] X-Powered-By 暴露: '$X_POWERED_BY'"
  bump_warn
fi

echo ""
echo "========================================"
echo "  通过: $PASS / 失败: $FAIL / 警告: $WARN"
echo "========================================"

exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)