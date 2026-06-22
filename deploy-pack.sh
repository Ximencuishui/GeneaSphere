#!/usr/bin/env bash
# ============================================================
#  本地打包脚本 - 将项目打包并通过 scp 上传到服务器
#  用法: bash deploy-pack.sh 服务器IP [SSH端口]
# ============================================================
set -euo pipefail

SERVER_IP="${1:-}"
SSH_PORT="${2:-22}"

if [ -z "$SERVER_IP" ]; then
    echo "用法: bash deploy-pack.sh <服务器IP> [SSH端口]"
    echo "示例: bash deploy-pack.sh 43.134.232.175"
    exit 1
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="/opt/geneasphere"

log_info "项目目录: $PROJECT_DIR"
log_info "目标服务器: $SERVER_IP:$SSH_PORT"

# 构建前端（如果还没构建）
if [ ! -d "$PROJECT_DIR/apps/web/dist" ]; then
    log_info "前端未构建，开始构建..."
    cd "$PROJECT_DIR/apps/web"
    npx vite build --mode production
    cd "$PROJECT_DIR"
    log_info "前端构建完成"
fi

# 构建后端（如果还没构建）
if [ ! -d "$PROJECT_DIR/apps/server/dist" ]; then
    log_info "后端未构建，开始构建..."
    cd "$PROJECT_DIR"
    pnpm --filter server build
    log_info "后端构建完成"
fi

# 上传项目文件
log_info "上传项目文件到服务器..."
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'temp' \
    --exclude 'storage' \
    --exclude 'uploads' \
    --exclude 'worker' \
    --exclude '*.7z' \
    --exclude '*.tgz' \
    --exclude '*.tar.gz' \
    --exclude 'install_output.txt' \
    --exclude 'create-schema.ps1' \
    --exclude 'run_pnpm.bat' \
    --exclude 'GraphicsMagick-*' \
    -e "ssh -p $SSH_PORT" \
    "$PROJECT_DIR/" "root@$SERVER_IP:$DEPLOY_DIR/"

log_info "文件上传完成！"

# 执行远程部署脚本
log_info "开始在服务器上执行部署..."
ssh -p "$SSH_PORT" "root@$SERVER_IP" "bash $DEPLOY_DIR/deploy.sh"

log_info "部署完成！"
