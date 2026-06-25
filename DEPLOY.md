# GeneaSphere（寻根路）部署指南

## 项目结构

```
GeneaSphere/
├── apps/
│   ├── server/          # NestJS 后端（端口 3001）
│   └── web/             # Vue 3 + Vite 前端（端口 80 via Nginx）
├── packages/db/         # Prisma 数据库层
├── deploy.sh            # Linux 服务器一键部署脚本
├── deploy.ps1           # Windows 本地部署脚本
├── deploy-pack.sh       # macOS/Linux 本地打包上传脚本
├── Dockerfile           # 后端 Docker 镜像
├── Dockerfile.web       # 前端 Nginx Docker 镜像
└── docker-compose.yml   # Docker 编排
```

## 方式一：一键部署脚本（推荐）

### Linux/macOS 本地 → 远程服务器

```bash
# 1. 赋予执行权限
chmod +x deploy-pack.sh

# 2. 执行部署（替换为你的服务器 IP）
bash deploy-pack.sh 43.134.232.175
```

### Windows 本地 → 远程服务器

```powershell
# PowerShell 中执行
.\deploy.ps1 -ServerIP "43.134.232.175"

# 跳过构建直接部署（已构建过）
.\deploy.ps1 -ServerIP "43.134.232.175" -SkipBuild

# 仅本地构建不上传
.\deploy.ps1 -ServerIP "43.134.232.175" -BuildOnly
```

### 直接在服务器上执行

```bash
# 1. SSH 登录服务器
ssh root@你的服务器IP

# 2. 克隆项目或上传文件后
cd /opt/geneasphere
bash deploy.sh
```

## 方式二：手动部署

### 1. 服务器环境准备

```bash
# 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 安装 pnpm
npm install -g pnpm@9 pm2

# 安装 Nginx
apt-get install -y nginx

# 创建 swap（内存 < 2GB 时需要）
dd if=/dev/zero of=/swapfile bs=1M count=2048
chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
```

### 2. 上传项目文件

```bash
# rsync 方式（推荐）
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'temp' \
    ./ root@服务器IP:/opt/geneasphere/

# 或 scp 打包方式
tar czf deploy.tar.gz --exclude='node_modules' --exclude='.git' .
scp deploy.tar.gz root@服务器IP:/opt/geneasphere/
ssh root@服务器IP "cd /opt/geneasphere && tar xzf deploy.tar.gz"
```

### 3. 构建项目

```bash
cd /opt/geneasphere

# 安装依赖
pnpm install --frozen-lockfile

# 生成 Prisma Client
npx prisma generate

# 构建后端
pnpm --filter server build

# 构建前端
cd apps/web
NODE_OPTIONS='--max-old-space-size=1024' npx vite build
cd ../..
```

### 4. 配置环境变量

```bash
# 编辑 .env 文件
nano /opt/geneasphere/.env
```

必需的环境变量：

```env
DATABASE_URL="postgresql://用户:密码@主机:端口/数据库"
JWT_SECRET="your-jwt-secret"
JWT_PLATFORM_SECRET="your-platform-secret"

# DeepSeek AI
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-v4-flash"

# 腾讯云 OCR（可选）
TENCENT_OCR_SECRET_ID=your_id
TENCENT_OCR_SECRET_KEY=your_key
TENCENT_OCR_REGION=ap-guangzhou
OCR_PROVIDER=tencent
```

### 5. 配置 Nginx

```bash
cat > /etc/nginx/conf.d/geneasphere.conf << 'EOF'
server {
    listen 80;
    server_name _;

    root /opt/geneasphere/apps/web/dist;
    index index.html;

    # ⚠ proxy_pass 末尾不要带 /，否则会剥离 /api/ 前缀，
    # 导致 @Controller('api/xxx') 形式的接口全部 404。
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

nginx -t && systemctl restart nginx && systemctl enable nginx
```

### 6. 启动后端

```bash
cd /opt/geneasphere

# 确保 .env 在根目录
cp apps/server/.env .env 2>/dev/null || true

# PM2 启动
pm2 start apps/server/dist/main.js \
    --name geneasphere-server \
    --node-args='--max-old-space-size=512'

# 保存并开机自启
pm2 save
pm2 startup systemd -u root --hp /root
```

### 7. 验证

```bash
# 检查前端
curl -o /dev/null -w '%{http_code}' http://localhost/

# 检查 API
curl -X POST http://localhost/api/auth/demo-login

# 检查进程
pm2 status

# 查看日志
pm2 logs geneasphere-server
```

## 方式三：Docker 部署

```bash
# 构建并启动
docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

## 常用命令速查

| 操作 | 命令 |
|------|------|
| 重启后端 | `pm2 restart geneasphere-server` |
| 查看后端日志 | `pm2 logs geneasphere-server` |
| 重载 Nginx | `systemctl reload nginx` |
| 查看端口 | `ss -tlnp \| grep -E ':(80\|3001)'` |
| 检查 API | `curl -X POST http://localhost/api/auth/demo-login` |
| 重新构建前端 | `cd apps/web && npx vite build` |
| 重新构建后端 | `pnpm --filter server build && pm2 restart geneasphere-server` |
| 更新 .env 后重启 | `cp apps/server/.env .env && pm2 restart geneasphere-server --update-env` |

## 故障排查

### 前端 404 或 API 调用失败
- 检查 Nginx 配置：`nginx -t`
- 确认 `proxy_pass` 末尾有 `/`（剥离 /api/ 前缀）
- 确认 `.env.production` 中 `VITE_API_BASE_URL` 为空

### 后端启动失败
- 查看日志：`pm2 logs geneasphere-server --err`
- 检查 `.env` 文件是否在项目根目录
- 确认 `DATABASE_URL` 是否正确

### 内存不足
- 创建 swap：`dd if=/dev/zero of=/swapfile bs=1M count=2048 && mkswap /swapfile && swapon /swapfile`
- 限制 Node 内存：`NODE_OPTIONS='--max-old-space-size=1024'`

### 端口被占用
- 查看：`ss -tlnp | grep :80`
- 停止占用进程：`fuser -k 80/tcp`
