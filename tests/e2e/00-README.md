# GeneaSphere（寻根路）E2E 测试方案

> **项目**：寻根路 · xungenlu.cn  
> **测试目标**：使用 browser MCP 工具对登录页一键体验功能进行多轮端到端测试  
> **适用技术栈**：Vue 3.5 + Vite 5 + Element Plus 2.14（前端）/ NestJS 11 + Prisma 6 + PostgreSQL（后端）  
> **文档位置**：`tests/e2e/`  
> **最后更新**：2026-08-01

---

## 一、本地服务启动确认

| 服务 | 命令 | 端口 | 健康检查 |
|---|---|---|---|
| 前端 | `pnpm --filter web dev` | `5173` | `http://localhost:5173/` |
| 后端 | `pnpm --filter server dev` | `3101` | `GET /api/health/ready` |
| 数据库 | SSH 隧道 → Lighthouse PostgreSQL | `15432 → 5432` | `Test-NetConnection 127.0.0.1 -Port 15432` |
| SSH 隧道命令 | `ssh -o BatchMode=yes -o ExitOnForwardFailure=yes -i "$HOME/.ssh/id_ed25519" -L 127.0.0.1:15432:127.0.0.1:5432 root@43.134.232.175 -N` | — | — |

**验证脚本**（一次脚本可同时确认三项）：见 `tests/e2e/scripts/check-services.ps1`

### 启动成功的关键标志

- 前端：`VITE v5.4.21 ready in 3243 ms` + `Local: http://localhost:5173/`
- 后端：`Nest application successfully started` + `🚀 寻根路后端启动于 http://localhost:3101`
- 数据库：`[PrismaService] 数据库连接成功`
- OCR 引擎：`OCR 引擎：Tesseract.js（腾讯云未配置，已自动降级）` → `Tesseract 初始化成功`

---

## 二、测试账号矩阵（基于项目长期记忆）

| 角色 | 手机号 | 默认密码 | JWT 角色值 | 演示登录 Endpoint | 跳转目标 |
|---|---|---|---|---|---|
| 平台/家族管理员 | `13800000000` | `demo123` | `OWNER` | `POST /api/auth/demo-login` | `/zupu/{demoClanSlug}` 或 `/admin/dashboard` |
| 家族编辑者（朱小小） | `13800000001` | `demo123` | `EDITOR` | `POST /api/auth/demo-member-login` | `/user-center/profile` |

> **当前已验证**：`POST /api/auth/demo-login` 返回 `role: EDITOR, demoClanSlug: zhuxi-demo`（管理员用户被演示族谱中的 clan_member 记录覆盖为 EDITER 视角，符合 `demoLoginInternal()` 的二次查询逻辑）。

### 演示族谱数据规模

- 家族名：**朱熹族谱（演示）**
- 家族 slug：`zhuxi-demo`
- 人物：约 **1000 位**，**28 代**
- 数据存储：腾讯云 Lighthouse PostgreSQL（经 SSH 隧道访问 `127.0.0.1:15432`）

---

## 三、文档总目录

| 文件 | 用途 |
|---|---|
| **00-README.md** | 本文件：索引 + 服务启动 + 账号矩阵 |
| **01-test-framework.md** | 测试轮次设计、状态隔离规范、Browser MCP 调用约定 |
| **02-admin-test-cases.md** | 管理员角色（OWNER）功能测试用例全集 |
| **03-member-test-cases.md** | 族员角色（EDITOR）功能测试用例全集 |
| **04-cross-role-test-cases.md** | 跨角色权限边界、异常路径、防御性测试 |
| **05-browser-mcp-commands.md** | Browser MCP 工具调用命令清单（直接可复制） |
| **06-report-template.md** | 测试报告模板与截图归档规范 |
| **PRODUCTION_READINESS_PLAN.md** | 生产环境准入测试计划 v2026.08（Round 5-9 详细设计） |
| **scripts/check-services.ps1** | 本地服务健康检查脚本 |
| **scripts/run-round.ps1** | 单轮测试驱动器（封装 Browser MCP 调用顺序） |
| **../production/GO_LIVE_CHECKLIST.md** | 上线前 127 项核对清单 |
| **../production/GO_NO_GO_DECISION.md** | Go/No-Go 决策模板 |
| **../production/restore.sh** | 数据库备份恢复脚本 |
| **../load/round5-load.js** | Round 5 k6 压测脚本 |
| **../security/round6-*.sh** | Round 6 渗透测试脚本（7 个） |
| **../compatibility/round7-compatibility.sh** | Round 7 Playwright 跨浏览器/设备兼容矩阵 |
| **../observability/round9-monitoring.sh** | Round 9 Prometheus /metrics 与告警通道验证 |
| **../production/backup-drill.sh** | Round 8 手动备份演练脚本 |
| **reports/round-N-template.md** | 单轮报告模板（执行后填充） |
| **screenshots/** | 截图归档目录（按 `轮次-模块-步骤.png`） |

---

## 四、测试矩阵速查（按模块 × 角色）

下表是核心模块的测试覆盖索引，详细用例见对应章节文档。

| # | 业务模块 | 路由前缀 | 管理员 | 族员 | 章节 |
|---|---|---|---|---|---|
| 0 | 登录页双入口 | `/login` | ✅ | ✅ | 02 §0, 03 §0 |
| 1 | 营销页 Demo Modal | `/` | ✅ | ✅ | 02 §0.1, 03 §0.1 |
| 2 | 家族族谱树 | `/zupu/:slug/dashboard` `/tree/:clanId` | ✅ CRUD | ✅ 只读子树 | 02 §1, 03 §1 |
| 3 | 家族信息 | `/admin/clan-info` `/zupu/:slug/info` | ✅ | 🚫 无权限 | 02 §2 |
| 4 | 成员管理 | `/admin/members` | ✅ 增删改角色 | 🚫 | 02 §3 |
| 5 | 媒体库/审核 | `/admin/media-library` `/admin/reviews` | ✅ 审/批/退 | 🚫 | 02 §4 |
| 6 | 导入/族谱生成 | `/admin/import` `/admin/genealogy-generate` | ✅ | 🚫 | 02 §5 |
| 7 | 迁徙地图 | `/clans/:id/migration` | ✅ 编辑 | ✅ 只读 | 02 §6, 03 §6 |
| 8 | 家族事件 | `/admin/family-event` | ✅ | 🚫 | 02 §7 |
| 9 | 影像视频 | `/admin/event-video` `/user-center/videos` | ✅ 创建 | ✅ 个人 | 02 §8, 03 §8 |
| 10 | 公告 | `/admin/announcements` | ✅ | ✅ 阅读 | 02 §9, 03 §9 |
| 11 | 用户中心-个人资料 | `/user-center/profile` | 🚫 | ✅ | 03 §2 |
| 12 | 家谱册 | `/user-center/family-book` | 🚫 | ✅ | 03 §3 |
| 13 | 寻亲匹配 | `/user-center/buddies` | 🚫 | ✅ | 03 §4 |
| 14 | 寻亲邀请/扫码 | `/user-center/invite` `/user-center/verify` | 🚫 | ✅ | 03 §5 |
| 15 | 小组讨论 | `/user-center/groups` `/user-center/topics` | 🚫 | ✅ | 03 §7 |
| 16 | 童年地方 | `/user-center/childhood-places` | 🚫 | ✅ | 03 §10 |
| 17 | 个人图册/照片 | `/user-center/albums` | 🚫 | ✅ | 03 §11 |
| 18 | 家族关系（个人） | `/user-center/family-relation` | 🚫 | ✅ | 03 §12 |
| 19 | 时光轴 | `/timeline` `/user-center/timeline` | ✅ | ✅ | 02 §10, 03 §13 |
| 20 | 跨族搜索 | `/search` | ✅ | ✅ 受限 | 02 §11, 03 §14 |
| 21 | 印刷下单 | `/print` `/user-center/orders` | ✅ | ✅ 下单 | 02 §12, 03 §15 |
| 22 | 工具箱（个人） | `/user-center/toolbox` | 🚫 | ✅ | 03 §16 |
| 23 | 设置 | `/user-center/settings` | 🚫 | ✅ | 03 §17 |
| 24 | 平台管理后台 | `/platform-admin/*` | 🚫（需更高角色）| 🚫 | 02 §13 |

> 🚫 = **禁止访问** —— 应触发 401/403 或路由守卫重定向，这是权限边界的核心验证点。

详细用例见 §02–§04。

---

## 五、生产环境准入测试（Round 5-9，🔴 上线前必须完成）

> **完整计划**：[PRODUCTION_READINESS_PLAN.md](PRODUCTION_READINESS_PLAN.md)
> **Go-Live 清单**：[../production/GO_LIVE_CHECKLIST.md](../production/GO_LIVE_CHECKLIST.md)
> **Go/No-Go 决策**：[../production/GO_NO_GO_DECISION.md](../production/GO_NO_GO_DECISION.md)

在 Round 0-4（121 用例 / 95% 通过率）基础上，需补齐：

| 轮次 | 类型 | 阻塞 | 脚本 |
|------|------|------|------|
| Round 5 | 性能与负载压测（k6） | 🟠 | [../load/round5-load.js](../load/round5-load.js) |
| Round 6 | 安全渗透（JWT/SQLi/XSS/CORS/Upload/Headers/Audit） | 🟠 | [../security/round6-*.sh](../security/) |
| Round 7 | 浏览器/设备兼容（Playwright） | 🟡 | [../compatibility/round7-compatibility.sh](../compatibility/round7-compatibility.sh) |
| Round 8 | 备份与灾备（pg_dump → COS → restore） | 🟠 | [../production/restore.sh](../production/restore.sh) |
| Round 9 | 监控告警（Prometheus + 钉钉）| 🟠 | [../observability/round9-monitoring.sh](../observability/round9-monitoring.sh) |

**准入关键指标**：
- 🔴 1000 人族谱树首屏 < 5s
- 🔴 100 并发 demo-login QPS ≥ 200
- 🔴 JWT 篡改/SQL 注入 0 数据泄露
- 🔴 /metrics 端点 + 告警通道
- 🔴 RTO < 30 min, RPO < 24 h

详见 [PRODUCTION_READINESS_PLAN.md](PRODUCTION_READINESS_PLAN.md) §三-四。

## 七、多轮测试策略（高层：Round 0-4，已完成）

> Round 5-9 见 [PRODUCTION_READINESS_PLAN.md](PRODUCTION_READINESS_PLAN.md)

```
Round 0 — 冒烟（Smoke）
  ├─ 服务健康 + 一键登录两个角色 → 验证可达性
  └─ 截图：登录页、跳转落点

Round 1 — 管理员主流程
  ├─ 一键登录 OWNER → 全家族数据可见
  ├─ 9 个核心模块覆盖（族谱树、成员、媒体审核、导入、家族信息、家事件、迁徙、公告、订单）
  └─ 截图：每模块 1 张

Round 2 — 族员主流程
  ├─ 一键登录 EDITOR → 仅可见直系血脉子树
  ├─ 7 个核心模块（个人资料、图册、家谱册、寻亲、小组、童年地方、工具箱）
  └─ 截图：每模块 1 张

Round 3 — 跨角色权限边界
  ├─ EDITOR 访问 /admin/* → 期望 401/403
  ├─ OWNER 直接访问 /user-center/* → 期望重定向或降级视图
  ├─ 第三方匿名访问受保护路由 → 期望跳转 /login
  └─ 截图：每个失败场景

Round 4 — 回归与边界
  ├─ 重复点击同一按钮（防抖）
  ├─ 网络 502 / 401 时的 toast 提示
  ├─ Token 过期场景
  ├─ 1000 人 G6 节点渲染性能
  └─ 截图：异常 toast
```

详细轮次定义见 [01-test-framework.md](01-test-framework.md)。

---

## 八、生产环境测试快速开始

> **前置**：已完成 Round 0-4（参考 [TEST_REPORT.md](../../test-results/TEST_REPORT.md)），开始 Round 5-9

```powershell
# 1. 本地服务健康检查
.\tests\e2e\scripts\check-services.ps1

# 2. Round 5 性能压测（k6）
k6 run tests/load/round5-load.js -e TARGET=login     # 100 并发 demo-login
k6 run tests/load/round5-load.js -e TARGET=tree      # 50 并发族谱树
k6 run tests/load/round5-load.js -e TARGET=upload    # 4MB 上传

# 3. Round 6 安全渗透
bash tests/security/round6-jwt-attack.sh
bash tests/security/round6-sqli.sh
bash tests/security/round6-xss.sh
bash tests/security/round6-cors-headers.sh
bash tests/security/round6-upload.sh
bash tests/security/round6-bruteforce.sh
bash tests/security/round6-npm-audit.sh

# 4. Round 7 兼容性（需先 npx playwright install）
bash tests/compatibility/round7-compatibility.sh

# 5. Round 8 备份与灾备
bash tests/production/backup-drill.sh
bash tests/production/restore.sh backup/db/2026-08-01/dump.sql.gz

# 6. Round 9 监控告警（可设置 DINGTALK_WEBHOOK 验证告警通道）
bash tests/observability/round9-monitoring.sh

# 5. 填充决策
#    - tests/production/GO_LIVE_CHECKLIST.md（127 项）
#    - tests/production/GO_NO_GO_DECISION.md（决议）

# 6. 原 Round 0-4 浏览器测试（参考本节下方）
#    由 Agent 工具调用 browser-use server 的 navigate / click / snapshot 操作
#    执行脚本见 tests/e2e/05-browser-mcp-commands.md
#    复制模板：
Copy-Item tests\e2e\reports\round-N-template.md tests\e2e\reports\round-N-actual.md
```

---

## 九、关键业务约束（来自项目长期记忆）

- **家族后台路径**：项目强制 PAAS 多租户架构，家族管理后台统一使用 `/zupu/:slug/*` 路径，`/admin/*` 重定向至 `/platform-admin/*` 平台运营方后台。
- **演示账号视图**：管理员视角可见整个朱熹族谱（1001 人），主支自动选取代数最长支系；族员视角仅可见以当前用户为根节点的直系血脉子树。
- **数据清理事务+双轨兜底**：所有 demo 数据 reseed 必须用 `resetDemoClanData` 的事务+兜底逻辑，避免 familyUnit 残留。
- **Node 端 /uploads/ 代理**：上传类接口走 Nginx → /uploads/ 静态代理。
- **JWT 过期时间**：60 分钟；token refresh 走自动重定向登录。
- **演示账号 token**：持有 `demo_clan_slug` localStorage 时，跳转家族后台直接走 slug 路径。

详见各测试用例文档的具体引用。
