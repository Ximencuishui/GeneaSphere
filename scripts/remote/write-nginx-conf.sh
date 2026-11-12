#!/usr/bin/env bash
# 生成 Nginx 站点配置并输出到 stdout（由 deploy.sh 的 setup_nginx 调用）
# 若存在 SSL 证书，则同时输出 80 与 443 两个 server 块，避免部署时把 HTTPS 配置覆盖掉
# （生产事故 2026-11-12：deploy.sh 旧版只写 80，重部署后 https://xungenlu.cn 直接不可用）
#
# 用法: PROJECT_DIR=/opt/geneasphere WEB_PORT=80 API_PORT=3101 bash write-nginx-conf.sh
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/geneasphere}"
WEB_PORT="${WEB_PORT:-80}"
API_PORT="${API_PORT:-3101}"
SSL_CERT="${SSL_CERT:-/etc/nginx/ssl/xungenlu.crt}"
SSL_KEY="${SSL_KEY:-/etc/nginx/ssl/xungenlu.key}"
SERVER_NAME="${SERVER_NAME:-xungenlu.cn www.xungenlu.cn _}"

emit_common() {
    cat << EOF
    root ${PROJECT_DIR}/apps/web/dist;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1000;

    # API 反向代理：proxy_pass 末尾不要带 /，否则会剥离 /api/ 前缀导致 404
    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
    }

    # 上传文件
    location /uploads/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }
EOF
}

cat << EOF
server {
    listen ${WEB_PORT};
    server_name ${SERVER_NAME};
EOF
emit_common
cat << EOF
}
EOF

if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
    cat << EOF

server {
    listen 443 ssl;
    server_name ${SERVER_NAME% _};

    ssl_certificate     ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;
EOF
    emit_common
    cat << EOF
}
EOF
fi
