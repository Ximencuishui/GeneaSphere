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
# 服务器仅 1.7GB 物理内存 + 2GB swap，限制 Node 堆避免 Vite 内部 worker OOM
# 1280MB：留出 ~420MB 给 PM2/SSH/系统；超过则交给 swap 交换
export NODE_OPTIONS="--max-old-space-size=1280"
pnpm --filter web build 2>&1 | tail -20

echo ""
echo "=========================================="
echo "STEP 5: pm2 restart"
echo "=========================================="
# 项目未携带 ecosystem.config.cjs，直接用 process name 重启
# --update-env 确保重新加载 .env 中的环境变量
pm2 restart geneasphere-server --update-env 2>&1 || pm2 restart all 2>&1
sleep 3
pm2 status

echo ""
echo "=========================================="
echo "DONE: $(date)"
echo "=========================================="
