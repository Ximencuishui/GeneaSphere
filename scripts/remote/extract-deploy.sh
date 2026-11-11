#!/usr/bin/env bash
# 在服务器上解压部署包（由 deploy.ps1 上传并调用，避免 PowerShell 内联转义问题）
# 用法: bash extract-deploy.sh /opt/geneasphere
set -euo pipefail

REMOTE_DIR="${1:-/opt/geneasphere}"
cd "$REMOTE_DIR"

# 1) 前端 dist 先解压到 staging 并原子切换，避免 nginx 读到写了一半的文件
rm -rf .deploy-staging
mkdir -p .deploy-staging
if tar -tzf deploy.tar.gz | grep -q '^apps/web/dist/'; then
    tar -xzf deploy.tar.gz -C .deploy-staging apps/web/dist
    if [ -d apps/web/dist ]; then
        rm -rf apps/web/dist.old
        mv apps/web/dist apps/web/dist.old
    fi
    mv .deploy-staging/apps/web/dist apps/web/dist
    rm -rf apps/web/dist.old
fi
rm -rf .deploy-staging

# 2) 其余源码文件原地解压覆盖（不影响运行中的服务）
tar -xzf deploy.tar.gz --exclude='apps/web/dist'
rm -f deploy.tar.gz
echo 'Extract done'
