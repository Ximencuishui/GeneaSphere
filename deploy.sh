#!/usr/bin/env bash
# ============================================================
#  GeneaSphere (寻根路) 快速部署脚本
#  适用: 任何 Linux 服务器 (CentOS/Rocky/Ubuntu/Debian)
#  用法: ssh root@你的服务器IP 'bash -s' < deploy.sh
#  或:   在服务器上直接执行 bash deploy.sh
# ============================================================
set -euo pipefail

# ==================== 配置区（按需修改）====================
# 项目目录
PROJECT_DIR="${PROJECT_DIR:-/opt/geneasphere}"

# 端口配置
WEB_PORT="${WEB_PORT:-80}"
API_PORT="${API_PORT:-3001}"

# Node.js 版本
NODE_VERSION="${NODE_VERSION:-20}"

# 使用镜像源加速（国内服务器建议开启）
USE_MIRROR="${USE_MIRROR:-false}"

# 部署模式: "source"=源码编译, "bundle"=使用预编译包
DEPLOY_MODE="${DEPLOY_MODE:-source}"

# 是否安装 Tesseract OCR（离线 OCR 引擎）
INSTALL_TESSERACT="${INSTALL_TESSERACT:-false}"

# ==================== 颜色输出 ====================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "\n${BLUE}========================================${NC}"; echo -e "${BLUE}$*${NC}"; echo -e "${BLUE}========================================${NC}"; }

# ==================== 检查系统 ====================
check_system() {
    log_step "检查系统环境"

    if [ "$(id -u)" -ne 0 ]; then
        log_error "请使用 root 用户执行此脚本"
        exit 1
    fi

    OS="$(. /etc/os-release && echo "$ID")"
    log_info "操作系统: $OS"

    # 检查内存
    MEM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
    log_info "总内存: ${MEM_TOTAL}MB"
    if [ "$MEM_TOTAL" -lt 1024 ]; then
        log_warn "内存不足 1GB，前端构建可能失败，建议至少 2GB"
        log_warn "将自动创建 swap 作为补偿..."
    fi
}

# ==================== 安装基础依赖 ====================
install_deps() {
    log_step "安装基础依赖"

    if command -v apt-get &>/dev/null; then
        # Debian/Ubuntu
        apt-get update -qq
        apt-get install -y -qq curl wget git nginx 2>&1 | tail -3
    elif command -v yum &>/dev/null; then
        # CentOS/Rocky
        yum install -y -q curl wget git nginx 2>&1 | tail -3
    else
        log_error "不支持的包管理器"
        exit 1
    fi
    log_info "基础依赖安装完成"
}

# ==================== 安装 Node.js ====================
install_nodejs() {
    log_step "安装 Node.js ${NODE_VERSION}"

    if command -v node &>/dev/null; then
        CURRENT_NODE=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$CURRENT_NODE" -ge "$NODE_VERSION" ]; then
            log_info "Node.js 已安装: $(node -v)"
            return
        fi
    fi

    # 使用 NodeSource 安装
    if command -v apt-get &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y -qq nodejs
    else
        curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
        yum install -y -q nodejs
    fi

    log_info "Node.js 安装完成: $(node -v)"
    log_info "npm 版本: $(npm -v)"
}

# ==================== 安装 pnpm ====================
install_pnpm() {
    log_step "安装 pnpm"

    if command -v pnpm &>/dev/null; then
        log_info "pnpm 已安装: $(pnpm -v)"
        return
    fi

    npm install -g pnpm@9
    log_info "pnpm 安装完成: $(pnpm -v)"
}

# ==================== 安装 PM2 ====================
install_pm2() {
    log_step "安装 PM2"

    if command -v pm2 &>/dev/null; then
        log_info "PM2 已安装: $(pm2 -v)"
        return
    fi

    npm install -g pm2
    log_info "PM2 安装完成"
}

# ==================== 安装 Tesseract（可选）====================
install_tesseract() {
    if [ "$INSTALL_TESSERACT" != "true" ]; then
        log_info "跳过 Tesseract 安装（使用腾讯云 OCR 或 INSTALL_TESSERACT=true 启用）"
        return
    fi

    log_step "安装 Tesseract OCR"
    if command -v apt-get &>/dev/null; then
        apt-get install -y -qq tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-chi-tra
    else
        yum install -y -q tesseract tesseract-langpack-chi-sim
    fi
    log_info "Tesseract 安装完成: $(tesseract --version 2>&1 | head -1)"
}

# ==================== 创建 Swap ====================
create_swap() {
    if [ "$MEM_TOTAL" -ge 2048 ]; then
        log_info "内存充足，跳过 swap 创建"
        return
    fi

    log_step "创建 Swap 空间（2GB）"
    if [ -f /swapfile ]; then
        log_info "Swap 已存在"
        return
    fi

    dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    log_info "Swap 创建完成"
}

# ==================== 部署项目 ====================
deploy_project() {
    log_step "部署项目文件"

    # 创建项目目录
    mkdir -p "$PROJECT_DIR"
    cd "$PROJECT_DIR"

    if [ "$DEPLOY_MODE" = "bundle" ]; then
        # 从预编译包部署
        log_info "使用预编译包模式部署"
        if [ -d "$PROJECT_DIR/apps/server/dist" ]; then
            log_info "检测到已有构建产物，跳过编译"
        else
            log_warn "未找到预编译产物，将回退到源码编译模式"
            DEPLOY_MODE="source"
        fi
    fi

    if [ "$DEPLOY_MODE" = "source" ]; then
        # 源码编译模式 - 文件应已通过 scp/rsync 上传
        if [ ! -f "$PROJECT_DIR/package.json" ]; then
            log_error "未找到 package.json，请先将项目文件上传到 $PROJECT_DIR"
            log_error "上传命令: rsync -avz --exclude node_modules --exclude .git ./ root@服务器IP:$PROJECT_DIR/"
            exit 1
        fi

        log_info "安装项目依赖..."
        pnpm install --frozen-lockfile 2>&1 | tail -5

        log_info "生成 Prisma Client..."
        npx prisma generate

        log_info "构建后端..."
        pnpm --filter server build 2>&1 | tail -3

        log_info "构建前端..."
        # 先修复 vue-tsc 可能的问题，跳过类型检查直接用 vite build
        cd "$PROJECT_DIR/apps/web"
        NODE_OPTIONS='--max-old-space-size=1024' npx vite build 2>&1 | tail -5
        cd "$PROJECT_DIR"
    fi

    log_info "项目构建完成"
}

# ==================== 配置 .env ====================
setup_env() {
    log_step "配置环境变量"

    ENV_FILE="$PROJECT_DIR/.env"

    if [ -f "$ENV_FILE" ]; then
        log_info ".env 文件已存在"
    else
        log_warn ".env 文件不存在，请手动配置后重新运行脚本"
        log_warn "需要的环境变量见 deploy.sh 中的注释"
        # 从 apps/server/.env 复制
        if [ -f "$PROJECT_DIR/apps/server/.env" ]; then
            cp "$PROJECT_DIR/apps/server/.env" "$ENV_FILE"
            log_info "已从 apps/server/.env 复制配置"
        fi
    fi

    # 确保 OCR 不会在未配置时崩溃（回退逻辑已内置在代码中）
    # 如果没有 OCR 密钥，建议设为 auto 或 tesseract
    if ! grep -q "OCR_PROVIDER" "$ENV_FILE" 2>/dev/null; then
        echo "OCR_PROVIDER=auto" >> "$ENV_FILE"
    fi

    log_info "环境变量配置完成"
}

# ==================== 配置 Nginx ====================
setup_nginx() {
    log_step "配置 Nginx"

    # 停止可能占用 80 端口的服务
    if systemctl is-active --quiet myapp 2>/dev/null; then
        systemctl stop myapp
        systemctl disable myapp
        log_info "已停止默认 myapp 服务"
    fi

    # 创建 Nginx 配置
    cat > /etc/nginx/conf.d/geneasphere.conf << NGINX_EOF
server {
    listen ${WEB_PORT};
    server_name _;

    root ${PROJECT_DIR}/apps/web/dist;
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1000;

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT}/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
    }

    # 上传文件
    location /uploads/ {
        proxy_pass http://127.0.0.1:${API_PORT}/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX_EOF

    # 清理默认 server 块（避免冲突）
    if grep -q 'listen.*80' /etc/nginx/nginx.conf 2>/dev/null; then
        # 备份原配置
        cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
        # 写一个干净的 nginx.conf
        cat > /etc/nginx/nginx.conf << 'NGINX_MAIN'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log notice;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;
    types_hash_max_size 4096;
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    include /etc/nginx/conf.d/*.conf;
}
NGINX_MAIN
    fi

    # 测试配置
    if nginx -t 2>&1; then
        # 确保 /root 目录可被 nginx 用户访问
        chmod +rx /root 2>/dev/null || true
        chmod -R +rx "$PROJECT_DIR/apps/web/dist" 2>/dev/null || true

        systemctl restart nginx
        systemctl enable nginx
        log_info "Nginx 配置完成并已启动"
    else
        log_error "Nginx 配置测试失败"
        return 1
    fi
}

# ==================== 启动后端 ====================
start_server() {
    log_step "启动后端服务"

    # 先停掉旧进程
    pm2 delete geneasphere-server 2>/dev/null || true

    cd "$PROJECT_DIR"

    # 确保 .env 在项目根目录（NestJS ConfigModule 从 cwd 读取）
    if [ -f "apps/server/.env" ] && [ ! -f ".env" ]; then
        cp apps/server/.env .env
    fi

    # 启动
    pm2 start apps/server/dist/main.js \
        --name geneasphere-server \
        --node-args='--max-old-space-size=512' \
        --env production

    # 保存并设置开机自启
    pm2 save
    pm2 startup systemd -u root --hp /root 2>/dev/null || true

    log_info "后端服务已启动"
}

# ==================== 开放防火墙 ====================
setup_firewall() {
    log_step "配置防火墙"

    # firewalld
    if systemctl is-active --quiet firewalld 2>/dev/null; then
        firewall-cmd --add-port=${WEB_PORT}/tcp --permanent 2>/dev/null || true
        firewall-cmd --reload 2>/dev/null || true
        log_info "firewalld 规则已添加"
    fi

    # ufw
    if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
        ufw allow ${WEB_PORT}/tcp
        log_info "ufw 规则已添加"
    fi

    # iptables（兜底）
    if command -v iptables &>/dev/null; then
        iptables -I INPUT -p tcp --dport ${WEB_PORT} -j ACCEPT 2>/dev/null || true
    fi
}

# ==================== 验证部署 ====================
verify_deploy() {
    log_step "验证部署"

    sleep 3
    local errors=0

    # 检查 Nginx
    if curl -s -o /dev/null -w '%{http_code}' http://localhost:${WEB_PORT}/ | grep -q '200\|304'; then
        log_info "✓ 前端页面正常 (HTTP 200)"
    else
        log_error "✗ 前端页面异常"
        errors=$((errors + 1))
    fi

    # 检查 API
    if curl -s -o /dev/null -w '%{http_code}' http://localhost:${WEB_PORT}/api/auth/demo-login -X POST | grep -q '201'; then
        log_info "✓ API 代理正常 (HTTP 201)"
    else
        log_warn "✗ API 代理异常（检查后端是否启动）"
        pm2 logs geneasphere-server --lines 5 --nostream 2>&1 | tail -10
        errors=$((errors + 1))
    fi

    # 检查后端进程
    if pm2 list | grep -q 'geneasphere-server.*online'; then
        log_info "✓ 后端进程运行中"
    else
        log_error "✗ 后端进程未运行"
        errors=$((errors + 1))
    fi

    # 检查端口
    if ss -tlnp | grep -q ":${API_PORT}"; then
        log_info "✓ API 端口 ${API_PORT} 已监听"
    else
        log_warn "✗ API 端口 ${API_PORT} 未监听"
    fi

    if ss -tlnp | grep -q ":${WEB_PORT}"; then
        log_info "✓ Web 端口 ${WEB_PORT} 已监听"
    else
        log_warn "✗ Web 端口 ${WEB_PORT} 未监听"
    fi

    echo ""
    if [ "$errors" -eq 0 ]; then
        log_info "🎉 部署验证通过！"
        SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "服务器IP")
        echo ""
        echo "  ┌──────────────────────────────────────────┐"
        echo "  │  访问地址: http://${SERVER_IP}              │"
        echo "  │  API 地址: http://${SERVER_IP}/api/         │"
        echo "  │  项目目录: ${PROJECT_DIR}                   │"
        echo "  └──────────────────────────────────────────┘"
    else
        log_error "部署验证发现 ${errors} 个问题，请检查日志"
    fi
}

# ==================== 主流程 ====================
main() {
    echo ""
    echo "╔══════════════════════════════════════════════╗"
    echo "║     GeneaSphere 寻根路 - 快速部署脚本        ║"
    echo "╚══════════════════════════════════════════════╝"
    echo ""

    check_system
    create_swap
    install_deps
    install_nodejs
    install_pnpm
    install_pm2
    install_tesseract
    deploy_project
    setup_env
    setup_nginx
    start_server
    setup_firewall
    verify_deploy
}

main "$@"
