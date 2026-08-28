#!/bin/bash
# GeneaSphere Lighthouse 重部署修复脚本
# 原因：pnpm install --prefer-offline 错误裁掉 167 个包，导致 nest/vite CLI 丢失
set -e
cd /opt/geneasphere

echo "=========================================="
echo "STEP 0: 清理（删除所有 node_modules）"
echo "=========================================="
rm -rf node_modules apps/*/node_modules .pnpm-store 2>/dev/null || true
echo "清理完成"

echo ""
echo "=========================================="
echo "STEP 1: git pull"
echo "=========================================="
git pull --ff-only 2>&1 | tail -5

echo ""
echo "=========================================="
echo "STEP 2: pnpm install（完整重装）"
echo "=========================================="
pnpm install 2>&1 | tail -15

echo ""
echo "=========================================="
echo "STEP 3: 验证 CLI"
echo "=========================================="
ls node_modules/.bin/nest node_modules/.bin/vite 2>&1

echo "=========================================="
echo "STEP 3.6: 构建 packages/db (prisma generate)"
echo "=========================================="
# 原因：packages/db 包含 Prisma schema，新增 model（admin-report 依赖 mediaArchive /
# bioReview / searchPost 等）后必须在 nest build 前重新生成 Prisma Client；
# 否则 app server 中的 PrismaService 类型不带这些属性，编译报 1213 TS 错误。
# build 脚本：prisma generate --schema=prisma/schema.prisma && tsc
export PATH="/opt/geneasphere/node_modules/.bin:$PATH"
pnpm --filter @geneasphere/db build 2>&1 | tail -15

echo "=========================================="
echo "STEP 3.5: 配置 PATH (pnpm workspace 拓扑)"
echo "=========================================="
# pnpm workspace 把 nest/vite 装在根目录 node_modules/.bin，
# apps/{server,web}/node_modules/.bin 不会有这些 CLI。
# 必须在 pnpm --filter 前把根 .bin 加到 PATH。
export PATH="/opt/geneasphere/node_modules/.bin:$PATH"
which nest
which vite

echo ""
echo "=========================================="
echo "STEP 4: nest build (backend)"
echo "=========================================="
pnpm --filter server build 2>&1 | tail -15

echo ""
echo "=========================================="
echo "STEP 5: vite build (frontend)"
echo "=========================================="
# 服务器仅 1.7GB 物理内存 + 2GB swap，限制 Node 堆避免 Vite 内部 worker OOM
export NODE_OPTIONS="--max-old-space-size=1280"
pnpm --filter web build 2>&1 | tail -20

echo ""
echo "=========================================="
echo "STEP 6: pm2 restart"
echo "=========================================="
pm2 restart geneasphere-server --update-env 2>&1 || pm2 restart all 2>&1
sleep 5
pm2 status

echo ""
echo "=========================================="
echo "STEP 7: 健康检查"
echo "=========================================="
sleep 3
echo "--- 服务器监听 ---"
ss -tlnp 2>/dev/null | grep -E ':(3001|80|443)' | head -5
echo "--- 健康检查 ---"
curl -s -o /dev/null -w "HTTP %{http_code} | %{time_total}s\n" http://localhost:3001/api/v1/health 2>&1 || true

echo ""
echo "=========================================="
echo "DONE: $(date)"
echo "=========================================="