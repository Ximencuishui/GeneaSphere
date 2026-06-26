#!/bin/bash
set -e
cd /opt/geneasphere

echo "=========================================="
echo "STEP 1: git pull"
echo "=========================================="
git pull --ff-only 2>&1 | tail -20

echo ""
echo "=========================================="
echo "STEP 2: pnpm install"
echo "=========================================="
pnpm install --prefer-offline 2>&1 | tail -10

echo ""
echo "=========================================="
echo "STEP 3: nest build (backend)"
echo "=========================================="
pnpm --filter server build 2>&1 | tail -15

echo ""
echo "=========================================="
echo "STEP 4: vite build (frontend)"
echo "=========================================="
# 服务器仅 1.7GB 内存，限制 Node 堆以免 OOM
export NODE_OPTIONS="--max-old-space-size=768"
pnpm --filter web build 2>&1 | tail -20

echo ""
echo "=========================================="
echo "STEP 5: pm2 restart"
echo "=========================================="
if pm2 restart ecosystem.config.cjs 2>&1; then
  echo "ecosystem restart ok"
else
  pm2 restart all 2>&1
fi
sleep 3
pm2 status

echo ""
echo "=========================================="
echo "DONE: $(date)"
echo "=========================================="
