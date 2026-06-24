# GeneaSphere（寻根路）部署上下文 - 给其他 IDE/AI 的提示词

> 📌 本文件用于告诉其他 AI 助手：项目已部署、当前状态、以及如何继续部署/更新。
> 复制以下内容到新对话中即可。

---

## 项目概况

- **项目名**：GeneaSphere（寻根路 xungenlu.cn）
- **技术栈**：NestJS 后端 + Vue 3/Vite 前端 + Prisma ORM + PostgreSQL (Neon)
- **包管理**：pnpm monorepo（`apps/server`、`apps/web`、`packages/db`）
- **已部署**：✅ 生产环境运行中
- **访问地址**：http://43.134.232.175
- **部署方式**：Node.js 源码部署 + Nginx 反向代理 + PM2 进程管理

---

## 服务器信息

| 项目 | 值 |
|------|-----|
| **IP** | 43.134.232.175 |
| **地域** | ap-singapore（新加坡） |
| **实例 ID** | lhins-3r3twuvj |
| **OS** | OpenCloudOS（类 CentOS） |
| **内存** | 1.7 GB |
| **磁盘** | 40 GB |
| **项目路径** | `/opt/geneasphere` |
| **SSH** | `ssh root@43.134.232.175`（已配置公钥认证） |

---

## 当前运行状态

```
Nginx (80端口)  → 前端静态文件 apps/web/dist
               → /api/* 代理到 127.0.0.1:3001
               → /uploads/* 代理到 127.0.0.1:3001

PM2 (geneasphere-server)  → Node.js 后端 3001端口，online，~280MB 内存
```

---

## 已验证通过的服务

| 服务 | 状态 |
|------|------|
| SSH 公钥认证 | ✅ |
| 前端页面 (80端口) | ✅ HTTP 200 |
| API 直连 (3001端口) | ✅ HTTP 201 |
| Nginx API 代理 | ✅ HTTP 201 |
| Prisma 数据库连接 | ✅ PostgreSQL Neon |
| 腾讯云 OCR | ✅ 已初始化（OCR_PROVIDER=tencent） |
| 腾讯云 COS 存储 | ✅ 已初始化 |
| DeepSeek AI | ✅ 已配置 |
| PM2 开机自启 | ✅ systemd |

---

## 环境变量（服务器 /opt/geneasphere/.env）

```
DATABASE_URL="postgresql://neondb_owner:xxx@ep-bitter-night-aokheurp-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
JWT_SECRET="geneasphere-jwt-secret-key-2026"
JWT_PLATFORM_SECRET="geneasphere-platform-secret-2026"
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-v4-flash"
OCR_PROVIDER=tencent
OCR_FREE_PAGES=10
OCR_FREE_CHARS=1000
INTERNAL_API_KEY="geneasphere-internal-key-2026"
NODE_ENV=production
TENCENT_OCR_SECRET_ID=xxx
TENCENT_OCR_SECRET_KEY=xxx
TENCENT_OCR_REGION=ap-guangzhou
COS_ENABLED=true
STORAGE_DRIVER=cos
TENCENT_CLOUD_SECRET_ID=xxx
TENCENT_CLOUD_SECRET_KEY=xxx
TENCENT_CLOUD_REGION=ap-singapore
TENCENT_CLOUD_APPID=1305935217
COS_HOT_BUCKET=xungenlu-hot
COS_COLD_BUCKET=xungenlu-cold
CDN_DOMAIN=cdn.xungenlu.cn
STORAGE_PATH=./storage/media
```

---

## 部署更新流程

### 方法 1：通过 SSH 直接更新（推荐）

```bash
# 1. 上传源码到服务器
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'temp' \
    ./ root@43.134.232.175:/opt/geneasphere/

# 2. 在服务器上执行
ssh root@43.134.232.175
cd /opt/geneasphere

# 安装依赖（首次或依赖变更时）
pnpm install --no-frozen-lockfile

# 构建
pnpm --filter @geneasphere/db build
pnpm --filter server build
cd apps/web && npx vite build --mode production && cd ../..

# 重启后端
pm2 restart geneasphere-server

# 验证
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost/
curl -X POST http://localhost/api/auth/demo-login -s -o /dev/null -w "HTTP %{http_code}"
```

### 方法 2：通过 Lighthouse 集成部署

项目已接入腾讯云 Lighthouse 集成，可以直接在 IDE 中调用以下工具：
- `analyze_lighthouse_instances` → 查看地域
- `describe_running_instances` → 选择实例 `lhins-3r3twuvj`
- `deploy_project_preparation` → 上传文件
- `execute_command` → 在服务器执行命令
- `deploy_success` → 标记部署完成

### 方法 3：使用 deploy.ps1（Windows 本地）

```powershell
# 从 Windows 本地打包并部署
.\deploy.ps1 -ServerIP "43.134.232.175"

# 跳过构建（服务器上已有最新 dist）
.\deploy.ps1 -ServerIP "43.134.232.175" -SkipBuild
```

---

## 已知问题与修复记录

### 1. Prisma Client 版本冲突
**问题**：pnpm 解析出 `@prisma/client@5.22.0(prisma@6.19.3)` 导致运行时错误。
**修复**：`pnpm install --no-frozen-lockfile` 重新解析依赖。

### 2. OCR 模块初始化顺序
**问题**：NestJS `onModuleInit` 执行顺序不确定，`OcrService.selectProvider()` 在 `TencentOcrService.onModuleInit()` 之前执行，导致腾讯云 OCR 未就绪时崩溃。
**修复**：将 `selectProvider()` 改为 `selectProviderWithRetry()`，最多重试 10 次（500ms 间隔，共 5 秒），等待 `TencentOcrService` 初始化完成。
**文件**：`apps/server/src/import/ocr.service.ts`
**注意**：如果再次构建 dist，确保源码中的 `selectProviderWithRetry` 逻辑已更新。

### 3. packages/db 构建
**问题**：`packages/db` 的 src 和 tsconfig.json 未上传到服务器，导致 `pnpm --filter @geneasphere/db build` 失败。
**修复**：确保上传 `packages/db/src/` 和 `packages/db/tsconfig.json`。

---

## 快速诊断命令

```bash
# 检查服务状态
ssh root@43.134.232.175 "pm2 status && ss -tlnp | grep -E ':(80|3001) '"

# 检查后端日志
ssh root@43.134.232.175 "pm2 logs geneasphere-server --lines 20 --nostream"

# 检查错误日志
ssh root@43.134.232.175 "pm2 logs geneasphere-server --err --lines 10 --nostream"

# 测试 API
ssh root@43.134.232.175 "curl -X POST http://localhost:3001/auth/demo-login -s -o /dev/null -w 'HTTP %{http_code}\n'"

# 测试前端
ssh root@43.134.232.175 "curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost/"

# 检查内存
ssh root@43.134.232.175 "free -h"
```

---

## 给 AI 助手的提示词模板

> 复制以下内容粘贴到其他 IDE 的 AI 对话中：

```
我正在维护 GeneaSphere（寻根路）项目，已部署在腾讯云 Lighthouse 服务器上。

服务器：43.134.232.175（ap-singapore，实例 lhins-3r3twuvj）
项目路径：/opt/geneasphere
访问地址：http://43.134.232.175

技术栈：NestJS + Vue 3 + Prisma + PostgreSQL(Neon)
部署方式：Node.js 源码 + Nginx + PM2

当前状态：正常运行，后端 PM2 进程 online，OCR 已初始化。

如果你想通过 Lighthouse 集成操作服务器：
1. analyze_lighthouse_instances 查看地域
2. describe_running_instances（Region: ap-singapore）选择 lhins-3r3twuvj
3. execute_command 执行命令

详细的部署文档在 docs/AI-DEPLOY-CONTEXT.md 中。
请先阅读那个文件了解完整上下文后再操作。
```
