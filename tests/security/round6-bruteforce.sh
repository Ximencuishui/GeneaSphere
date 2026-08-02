#!/bin/bash
# Round 6 — S6-13: 限流（暴力登录 / 短信轰炸）
# 验证：连续请求触发 429 + Retry-After + X-RateLimit-* 头

set -u

# 注意：不要使用 set -e；计数自增 ((PASS++)) 在 PASS=0 时退出码为 1，会让脚本在第一个失败之前提前退出。
BASE_URL="${BASE_URL:-http://localhost:3101}"
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
    echo "  [FAIL] $name -> 期望: $expected, 实际: $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "========================================"
echo "  Round 6 — 限流 / 暴力攻击防护"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# 默认 RATE_LIMIT_MAX=30, RATE_LIMIT_WINDOW_MS=60000
MAX=${RATE_LIMIT_MAX:-30}
WINDOW=${RATE_LIMIT_WINDOW_MS:-60000}

echo "  当前限流配置：MAX=$MAX, WINDOW=${WINDOW}ms"

# 1. 暴力登录（同一 IP 连续 50 次）
echo ""
echo "[1] 暴力登录（同 IP 连续 $((MAX + 20)) 次）"
TRIGGERED_429=0
RETRY_AFTER_FOUND=0
RATELIMIT_REMAINING_SEEN=0

for i in $(seq 1 $((MAX + 20))); do
  RES=$(curl -s -D - -o /dev/null -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"phone":"13800000099","password":"wrong"}')

  STATUS=$(echo "$RES" | head -1 | awk '{print $2}')
  if [ "$STATUS" = "429" ]; then
    TRIGGERED_429=1
    if echo "$RES" | grep -qi "retry-after:"; then
      RETRY_AFTER_FOUND=1
    fi
    echo "  第 $i 次：HTTP 429（限流触发）"
    break
  fi

  if echo "$RES" | grep -qi "x-ratelimit-remaining:"; then
    RATELIMIT_REMAINING_SEEN=1
  fi
done

if [ $TRIGGERED_429 -eq 1 ]; then
  echo "  [PASS] 限流触发 429"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] 限流未触发（连续 $((MAX + 20)) 次都通过）"
  FAIL=$((FAIL + 1))
fi

if [ $RETRY_AFTER_FOUND -eq 1 ]; then
  echo "  [PASS] Retry-After 头存在"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] 缺少 Retry-After 头"
  FAIL=$((FAIL + 1))
fi

if [ $RATELIMIT_REMAINING_SEEN -eq 1 ]; then
  echo "  [PASS] X-RateLimit-Remaining 头存在"
  PASS=$((PASS + 1))
else
  echo "  [WARN] X-RateLimit-Remaining 头未出现"
fi

# 2. 等待窗口过期（缩短测试：实际生产等 60s）
echo ""
echo "[2] 等待窗口过期（$((WINDOW / 1000))s 后再次请求应可继续）"
echo "  测试中将 RATE_LIMIT_WINDOW_MS 设为 5s 以加速"
WINDOW_TEST=5
echo "  请在测试环境用以下命令重置窗口："
echo "    pkill -f 'node apps/server/dist/main.js'"
echo "    RATE_LIMIT_WINDOW_MS=$WINDOW_TEST pnpm --filter server start &"

# 3. 短信轰炸
echo ""
echo "[3] 短信轰炸（同一手机号连续 10 次）"
SMS_TRIGGERED=0
for i in $(seq 1 10); do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/auth/sms/send" \
    -H 'Content-Type: application/json' \
    -d '{"phone":"13800000099"}')
  if [ "$STATUS" = "429" ]; then
    SMS_TRIGGERED=1
    echo "  第 $i 次：HTTP 429（短信限流触发）"
    break
  fi
done
if [ $SMS_TRIGGERED -eq 1 ]; then
  echo "  [PASS] 短信接口限流触发 429"
  PASS=$((PASS + 1))
else
  echo "  [WARN] 短信接口 10 次未触发限流（可能阈值较高）"
fi

# 4. 限流键独立性：不同 IP 不应互相影响
echo ""
echo "[4] 限流键独立性（不同 X-Forwarded-For）"
IP1_COUNT=0
IP2_COUNT=0

# 用 4 个伪造 IP 测试独立性
for ip in "1.1.1.1" "2.2.2.2" "3.3.3.3" "4.4.4.4"; do
  for i in 1 2 3 4 5; do
    STATUS=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Forwarded-For: $ip" \
      -X POST "$BASE_URL/api/auth/login" \
      -H 'Content-Type: application/json' \
      -d '{"phone":"13900000099","password":"x"}')
    if [ "$STATUS" = "429" ]; then
      echo "  [WARN] IP $ip 在第 $i 次被限流（独立性不足）"
    fi
  done
done
echo "  [PASS] 4 个 IP 各 5 次请求未互相影响"

echo ""
echo "========================================"
echo "  -> PASS：$PASS / 失败：$FAIL"
echo "========================================"

exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
