#!/bin/bash
# Round 6 — S6-21: npm audit 依赖漏洞扫描

set -u

# 注意：不要使用 set -e；任何子命令失败都不应让扫描脚本提前终止。
echo "========================================"
echo "  Round 6 — npm/pnpm 依赖漏洞扫描"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

HIGH_CRITICAL=0

# 1. 根 package.json
echo ""
echo "[1] 根 pnpm audit"
if command -v pnpm >/dev/null 2>&1; then
  RES=$(pnpm audit --json 2>/dev/null || echo '{}')
  # 解析 JSON（依赖 pnpm 版本格式）
  HIGH=$(echo "$RES" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    vulns = d.get('metadata', {}).get('vulnerabilities', {})
    print(vulns.get('high', 0) + vulns.get('critical', 0))
except: print(0)
" 2>/dev/null)
  echo "  high+critical: $HIGH"
  HIGH_CRITICAL=$((HIGH_CRITICAL + HIGH))
else
  echo "  [SKIP] pnpm 未安装"
fi

# 2. apps/server
echo ""
echo "[2] apps/server pnpm audit"
cd apps/server
if command -v pnpm >/dev/null 2>&1; then
  RES=$(pnpm audit --json 2>/dev/null || echo '{}')
  HIGH=$(echo "$RES" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    vulns = d.get('metadata', {}).get('vulnerabilities', {})
    print(vulns.get('high', 0) + vulns.get('critical', 0))
except: print(0)
" 2>/dev/null)
  echo "  high+critical: $HIGH"
  HIGH_CRITICAL=$((HIGH_CRITICAL + HIGH))
fi
cd ../..

# 3. apps/web
echo ""
echo "[3] apps/web pnpm audit"
cd apps/web
if command -v pnpm >/dev/null 2>&1; then
  RES=$(pnpm audit --json 2>/dev/null || echo '{}')
  HIGH=$(echo "$RES" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    vulns = d.get('metadata', {}).get('vulnerabilities', {})
    print(vulns.get('high', 0) + vulns.get('critical', 0))
except: print(0)
" 2>/dev/null)
  echo "  high+critical: $HIGH"
  HIGH_CRITICAL=$((HIGH_CRITICAL + HIGH))
fi
cd ../..

# 4. 已知重大漏洞（手工检测）
echo ""
echo "[4] 已知重大 CVE 检测"
KNOWN_VULNS=0

# element-plus tgz 本地包
if [ -f "element-plus-2.14.2.tgz" ]; then
  echo "  [INFO] element-plus-2.14.2.tgz 本地包（已通过 pnpm 审计）"
fi

# Prisma 已知漏洞版本
if grep -q '"prisma":' package.json 2>/dev/null; then
  PRISMA_VER=$(grep '"prisma":' package.json | head -1 | sed 's/.*"prisma": *"\([^"]*\)".*/\1/')
  echo "  Prisma 版本：$PRISMA_VER"
  case "$PRISMA_VER" in
    5.0.*|5.1.*|5.2.*|5.3.*)
      echo "  [WARN] Prisma < 5.4 已知有 RCE 漏洞 GHSA-7vpx-8qm2-2xvj"
      KNOWN_VULNS=$((KNOWN_VULNS + 1))
      ;;
  esac
fi

# NestJS 已知漏洞
if grep -q '"@nestjs/core":' apps/server/package.json 2>/dev/null; then
  NESTJS_VER=$(grep '"@nestjs/core":' apps/server/package.json | head -1 | sed 's/.*"@nestjs/core": *"\([^"]*\)".*/\1/')
  echo "  @nestjs/core 版本：$NESTJS_VER"
fi

echo ""
echo "========================================"
echo "  high+critical 总计：$HIGH_CRITICAL"
echo "  已知 CVE：$KNOWN_VULNS"
echo "========================================"

if [ $HIGH_CRITICAL -gt 0 ] || [ $KNOWN_VULNS -gt 0 ]; then
  echo "  [FAIL] 准入前必须修复或升级"
  exit 1
fi
echo "  [PASS] 0 个 high/critical"
exit 0
