#!/bin/bash
# Round 9 — M9-01 ~ M9-05: 监控告警 & 可观测性验证
#
# 用法：
#   bash tests/observability/round9-monitoring.sh
#
# 验证清单：
#   M9-01 Prometheus /metrics 端点返回 200 + 关键指标存在
#   M9-02 健康探针 /api/health 与 /api/health/ready 双探针
#   M9-03 关键业务指标（family_count, person_count, active_users）暴露
#   M9-04 慢查询指标（prisma_query_duration_seconds）暴露
#   M9-05 钉钉/企业微信 webhook 通道可达（干跑：发送测试消息）

set -u

BASE_URL="${BASE_URL:-http://localhost:3101}"
METRICS_URL="${METRICS_URL:-${BASE_URL}/metrics}"
DINGTALK_WEBHOOK="${DINGTALK_WEBHOOK:-}"  # 可选
PASS=0
FAIL=0

bump_pass() { PASS=$((PASS + 1)); }
bump_fail() { FAIL=$((FAIL + 1)); }

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  [PASS] $name → $actual"
    bump_pass
  else
    echo "  [FAIL] $name → 期望 $expected, 实际 $actual"
    bump_fail
  fi
}

check_contains() {
  local name="$1"
  local needle="$2"
  local haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "  [PASS] $name → 包含 $needle"
    bump_pass
  else
    echo "  [FAIL] $name → 缺少 $needle"
    bump_fail
  fi
}

echo "========================================"
echo "  Round 9 — 监控告警验证"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# M9-02 健康探针（必过）
echo ""
echo "[M9-02] 健康探针"
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/health")
check "GET /api/health → 200" "200" "$HEALTH"

READY=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/health/ready")
check "GET /api/health/ready → 200" "200" "$READY"

# M9-01 Prometheus /metrics 端点
echo ""
echo "[M9-01] Prometheus /metrics 端点"
METRICS_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$METRICS_URL")
if [ "$METRICS_CODE" = "200" ]; then
  echo "  [PASS] /metrics → 200"
  bump_pass
  # 抓取指标内容
  METRICS_BODY=$(curl -s "$METRICS_URL")
else
  echo "  [FAIL] /metrics → 实际 $METRICS_CODE（🔴 准入前必须补 nestjs-prometheus）"
  echo "         补救：在 apps/server/src/main.ts 添加："
  echo "           import { PrometheusModule } from '@willsoto/nestjs-prometheus'"
  echo "           PrometheusModule.register({ defaultMetrics: { enabled: true } })"
  bump_fail
fi

if [ -n "$METRICS_BODY" ]; then
  # M9-03 业务指标
  echo ""
  echo "[M9-03] 关键业务指标"
  check_contains "family_count" "family_count" "$METRICS_BODY"
  check_contains "person_count" "person_count" "$METRICS_BODY"
  check_contains "active_users" "active_users" "$METRICS_BODY"
  check_contains "http_requests_total" "http_requests_total" "$METRICS_BODY"

  # M9-04 慢查询
  echo ""
  echo "[M9-04] 慢查询指标"
  check_contains "prisma_query_duration" "prisma_query_duration" "$METRICS_BODY"
  check_contains "process_resident_memory_bytes" "process_resident_memory_bytes" "$METRICS_BODY"
fi

# M9-05 钉钉 webhook（可选）
echo ""
echo "[M9-05] 钉钉 webhook 通道"
if [ -z "$DINGTALK_WEBHOOK" ]; then
  echo "  [INFO] DINGTALK_WEBHOOK 未设置，跳过（设置方式："
  echo "         export DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=XXX）"
else
  RES=$(curl -s -X POST "$DINGTALK_WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d '{"msgtype":"text","text":{"content":"[GeneaSphere] Round 9 告警通道干跑测试"}}')
  ERRCODE=$(echo "$RES" | python -c "import sys,json; print(json.load(sys.stdin).get('errcode',-1))" 2>/dev/null)
  check "DingTalk webhook errcode=0" "0" "$ERRCODE"
fi

# 总结
echo ""
echo "========================================"
echo "  Round 9 — 通过：$PASS / 失败：$FAIL"
echo "========================================"

exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)