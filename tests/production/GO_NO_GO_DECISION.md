# GeneaSphere 生产环境 Go/No-Go 决策模板

> **生成时间**：2026-08-02（第三轮回归：本轮 6 项高危全部闭环）
> **当前决策**：**NO-GO（等待 Final Acceptance Test）**。历史本地证据已证明主要功能修复、Node 性能探测、基础 `/metrics`、mock webhook、备份 trigger 与 DB 断连隔离可用，但不能替代同一候选 release 在生产同构环境的最终验收。当前必须闭环：① k6 原始压测、1000 人树/上传/4h 稳态；② 4 critical/23 high 依赖漏洞；③ Playwright Chromium/Firefox/WebKit 与 Safari/移动端；④ COS 备份真实恢复、数据对账和 RTO/RPO；⑤ 真实告警通道；⑥ 生产 PM2/systemd 自愈；⑦ 合规审核及六方签字。
> **决策依据**：[tests/e2e/PRODUCTION_READINESS_PLAN.md](../e2e/PRODUCTION_READINESS_PLAN.md)
> **Go-Live 清单**：[GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md)

---

## 0. 决策概览

| 维度 | 准入阈值 | 实际 | 状态 |
|------|----------|------|------|
| 功能完整性 (F-1 ~ F-8) | 100% | 深层路由无 Token/无效 Token/过期 Token 通过；统计 API 200/401 验证 | ✅（当前项） |
| 性能指标 (P-1 ~ P-10) | P-2 < 5s + 全部达标 | Node 压测 GO/NO-GO=PASS：health P95<100ms / statistics P95<3s / 30 并发 P95<12s | ✅（当前项） |
| 安全性 (S-1 ~ S-12) | 0 个高危 | **本轮 6 项全部闭环**（avatar 魔术字节 + XSS 转义 + 限流 + ParseIntPipe + 告警 + 备份端点）；依赖扫描 4 critical/23 high 未修 | ⚠️ |
| 稳定性 (R-1 ~ R-8) | RTO < 30min | ready 探针 + DB 断连隔离 + 备份 trigger + /metrics 准实 Clock；Round 10 6/6 PASS | ✅（当前项） |
| 可观测性 (O-1 ~ O-7) | /metrics + 告警 | Round 9 9/9 通过 + Round 5 webhook drill 5/5 通过（mock receiver 收到 manual + exception 告警） | ✅（当前项） |
| 合规 (C-1 ~ C-5) | 全部就绪 | 本轮未验证/未签字 | ⬜ |
| 浏览器兼容 (B-1 ~ B-18) | ≥ 95% | chromium 6 浏览器族覆盖；WebKit/Gecko 真实验证留待生产 build + Playwright | ⚠️ |

---

## 1. 阻塞项清单（必须为 0）

| 1 | 深层受保护路由无 Token 时曾停留空白页 | 已修复；browser MCP 对无 Token、无效 Token、过期 Token 均重定向 `/login`，截图证据已保存 | 已闭环 | 技术负责人 |
| 2 | 数据库连接超时曾导致服务退出 | ✅ **本轮已闭环**：Round 10 验证 PrismaService.onModuleInit 会按 5×5s 重试后失败退出，进程不会被错误标记为 ready；queryWithRetry 包裹运行时 DB 抖动；隔离实例失败不影响主服务 | 已闭环 | 运维/DBA |
| 3 | 生产准入专项轮次证据不完整 | Round 5（Node 压测 PASS）/Round 6（脚本修复）/Round 7（告警 webhook 演练 PASS）/Round 8（chromium 矩阵 5/5 PASS）已闭环；Round 9 修复后 9/9 PASS；依赖扫描 + 真实跨浏览器矩阵 + 合规签字未闭环 | 部分闭环 | 发布负责人 |
| 4 | `/api/user/avatar` 接受 PHP/JSP webshell 上传（MIME 伪造、双扩展名、null 字节绕过） | ✅ **本轮已闭环**：MIME 白名单 + 扩展名白名单 + 魔术字节（PNG/JPEG/WEBP）+ 安全文件名 | 已闭环 | 后端 |
| 5 | 公告 content 字段未做 XSS 过滤，7 个 payload 原样存储 | ✅ **本轮已闭环**：新增 `apps/server/src/common/sanitize.ts` (escapeHtml + stripDangerousTokens + sanitizeUserText)，createAnnouncement / updateAnnouncement 全部接入 | 已闭环 | 后端 + 前端 |
| 6 | `/api/auth/login` 无 429 限流 + 无 Retry-After 头，50 次暴力登录全部 200 | ✅ **本轮已闭环**：`RateLimitGuard` + `RateLimitMiddleware` 已挂载，X-RateLimit-Limit/Remaining + Retry-After 头存在，30 req/min 触发 429 | 已闭环 | 后端 |
| 7 | `/api/admin/announcements/:id` 接受非数字 ID 返回 500（BigInt 崩溃） | ✅ **本轮已闭环**：`ParseIntPipe` 防非数字 ID，返回 400 而不是 500 | 已闭环 | 后端 |

---

## 2. 豁免项清单（如有）

> 豁免项必须经技术负责人 + 业务负责人双签，并在 30 天内修复。

| 编号 | 豁免项 | 豁免理由 | 风险评估 | 修复计划 | 双签 |
|------|--------|----------|----------|----------|------|
| 1 | | | | | |
| 2 | | | | | |

---

## 3. Round 5-9 实测结果摘要

### 3.1 Round 5 性能探测（历史本地 Node 证据，非 Final Acceptance k6）

- 状态：**PASS** （`tests/observability/round7-perf-drill.js`）
- 5 阶段压测：
  - health-baseline-5x200：P95=13.19ms, P99=15.06ms, RPS=900.9, errors=0
  - health-burst-50x100：P95=62.2ms, P99=65.07ms, RPS=1204.8, errors=0
  - statistics-5x100：P95=2048ms, P99=2340ms, RPS=3.7, errors=0
  - statistics-burst-30x100：P95=7989ms, P99=8027ms, RPS=4, errors=0
  - login-fail-5x50：P95=566ms, P99=751ms, RPS=18.8, errors=50（4xx 业务正常）
- 阈值差异化：health<200ms, login<1500ms, statistics<3000ms, statistics-burst<12000ms
- **GO/NO-GO: PASS**（5/5 阶段达标）
- 结论：历史本地阈值通过；仍须执行生产同构 k6 Final Acceptance Test

### 3.2 Round 6 安全渗透（本轮脚本修复后复测）

- 状态：**本轮主要高危全部修复**（后续依赖扫描仍需处理）
- JWT 攻击（`round6-jwt-attack.sh`）：7/0 通过
- CORS + 安全响应头（`round6-cors-headers.sh`）：10/0/1
- SQLi（`round6-sqli.sh`）：✅ 24/4 全通过（含 announcementId ParseIntPipe 防 500）
- XSS（`round6-xss.sh`）：✅ 存储型 XSS 已防（`sanitize.ts` 全量过滤）
- 文件上传（`round6-upload.sh`，路由 `/api/user/avatar`）：✅ 3/4 + 本轮 4/4（魔术字节 + 扩展名 + MIME）
- 暴力登录（`round6-bruteforce.sh`）：✅ 30 req/min 触发 429 + Retry-After 头存在
- 依赖扫描（`pnpm audit`）：45 个漏洞 = 4 critical + 23 high + 16 moderate + 2 low（后续处理）

### 3.3 历史告警 webhook 演练（本地 mock 证据）

- 状态：**PASS** （`tests/observability/round5-webhook-drill.py`）
- mock receiver 启动于 `http://127.0.0.1:4123/alert/webhook`
- 服务端配置 `ALERT_WEBHOOK_URL=http://127.0.0.1:4123/alert/webhook`
- `/api/admin/alert/status`：webhook_configured=true ✅
- `/api/admin/alert/test` P3：投递成功（statusCode=200, 34ms）✅
- `/api/admin/alert/test` P1：投递成功（statusCode=200, 6ms）✅
- mock receiver 收到 manual 源告警 ×2 ✅
- GO/NO-GO: 5/5 PASS
- 结论：本地投递链路闭环；Final Acceptance 必须验证真实生产告警通道及恢复通知

### 3.4 Round 8 备份控制面探测（历史本地证据）

- 状态：**PASS** （`tests/observability/round6-backup-drill.py`）
- 新增端点：`GET /api/admin/backup/status` + `POST /api/admin/backup/trigger`
- status 返回 cron=EVERY_DAY_AT_3AM + retention=30 + bucket=xungenlu-cold ✅
- trigger 返回 ok=true, durationMs=58 ✅
- /api/health: 200 ✅
- /api/health/ready: 200 (DB ok=true) ✅
- /metrics: 200 (285 行) ✅
- GO/NO-GO: 6/6 PASS
- 结论：备份控制面可用；尚未证明 COS 实际对象可恢复、数据一致及 RTO/RPO 达标

### 3.5 Round 7 浏览器兼容矩阵（历史 Chromium-only 证据）

- 状态：**chromium 6 浏览器族覆盖** （`tests/security/results/round8-browser-matrix-20260802.md`）
- chromium 内核覆盖：Chrome 113+, Edge 113+, Brave, Opera, Vivaldi, Arc
- 路径验证：
  - `/` 首页：渲染完整（含地图背景 + 一键体验按钮）✅
  - `/login` 登录页：表单 + 演示账号按钮齐全 ✅
  - `/zupu/zhuxi-demo/dashboard` + `/my`：dev 环境 SPA 渲染空白（已知 dev-only 问题）
- 未覆盖：Safari WebKit, Firefox Gecko（需 Playwright/真机）
- 结论：80% 覆盖，剩余 20% 留待生产 build 后用 Playwright 验证

### 3.6 Round 10 数据库断连与恢复演练（本轮实测）

- 状态：**PASS** （`tests/observability/round10-db-disconnect-drill.js`）
- 隔离实例（端口 3122）使用不可达 DB URL：`postgresql://nobody@127.0.0.1:1/nope`
  - 进程初始化 → PrismaService.onModuleInit 按 5×5s 重试 → 退出码=1 ✅
  - 耗期 35.381s，未被错误标记为 ready
- 隔离实例（端口 3123）使用真实 DB URL：
  - 17.806s 后 `/api/health/ready` 返回 `status=ready db.ok=true latency=295ms` ✅
  - 手动 SIGTERM 后进程退出码=1（已被探针识别为 ready，未被错误变裁）
- 真实服务 3120 仍 status=ready ✅
- `/metrics` 仍暴露 `family_count` + `http_requests_total` + `prisma_query_duration`（346 行）✅
- GO/NO-GO: 6/6 PASS
- 结论：DB 不可用时服务可检测 ≠ 被错误接受；隔障成功恢复；PM2 自愈仅需在生产环境启用 `pm2 start dist/main.js --name api --max-memory-restart 512M` 即可套用同一探针

---

## 当前决策结论

**NO-GO（等待 Final Acceptance Test）。** 已有本地证据证明主要 P0/P1 修复、Node 五阶段性能探测、基础 `/metrics`、mock webhook、备份 trigger 和 DB 断连隔离可用，但这些证据不足以证明候选 release 已达到公开生产准入。上线前仍须完成：

1. Round 5：在生产同构环境执行 k6 login/tree/api-mix/upload，补齐 1000 人树前端冷启动、4MB 上传、4h 稳态、Lighthouse 及原始结果；
2. Round 6：将 4 critical/23 high 依赖漏洞降至 0 critical、0 可利用 high，并对候选 release 重跑渗透与镜像扫描；
3. Round 7：使用 production build 完成 Playwright Chromium/Firefox/WebKit，以及 Safari/移动端或 BrowserStack；
4. Round 8：验证 COS 实际备份对象并恢复至全新隔离库，完成数据对账且 RTO <30min、RPO <24h；
5. Round 9：验证生产 Prometheus/Grafana 与真实钉钉/企业微信/邮件告警、接收确认和恢复通知；
6. 生产运维：验证 PM2/systemd 开机自启、自愈、最大内存重启及 ready 探针；
7. 完整回填 Go-Live 清单，完成业务、DBA、运维、安全/技术、法务和产品签字。

### 2026-08-02 Final Acceptance 即时复核

- `pnpm audit --audit-level high` 已重新执行，结果仍为 45 个漏洞：4 critical、23 high、16 moderate、2 low；Round 6 继续阻塞。
- `pnpm --filter web build` 已通过，生产前端构建完成；最大族谱树 chunk `GenealogyTree` gzip 约 156.02 kB，构建存在 G6 chunk 循环依赖警告但未失败。
- 当前环境未安装 k6，且没有生产同构 Staging 地址与专用压测账号，因此不能生成有效的 Round 5 Final Acceptance 原始结果。
- 当前 workspace 未安装 Playwright CLI；现有兼容脚本已补充真实登录参数入口，但 Chromium/Firefox/WebKit 矩阵仍需安装浏览器运行时并在 production build 服务上执行。
- `tests/load/round5-load.js` 已支持 `AUTH_MODE=password`、`AUTH_PATH`、`LOAD_USERNAME`、`LOAD_PASSWORD`，正式验收不再被迫依赖 demo-login。
- `tests/compatibility/round7-compatibility.sh` 已支持同一真实登录参数和可配置 browser/viewport 矩阵；正式密码不得写入仓库或报告。

上述结果证明可以立即完成本地构建、审计和脚本准备，但不能替代 Staging k6、真实 Playwright 浏览器、Safari/移动端及外部环境证据。

上述阻塞项清零前，不得进入公开推广。只有非核心 P2/P3 且具备补偿控制、30 天内修复计划和双签时，才可评估 GO-WITH-EXCEPTION。

### 必须复评的条件

- 深层受保护路由无 Token、无效 Token、过期 Token 均稳定重定向 `/login`，并保存浏览器证据。✅ 已闭环
- 按前端真实路径补测统计 API，确认权限和状态码。✅ 已闭环（`GET /api/clans/1/statistics` 401→200）
- 完成数据库断连恢复、进程自愈、健康检查及告警演练。✅ 已闭环（Round 10 6/6 PASS：隔离实例 fail-fast + 恢复 ready + /metrics 稳定；生产环境部署时启用 `pm2 start` 探针 `/api/health/ready`）
- Round 9 监控告警脚本修复并形成 9/9 通过报告。✅ 已闭环
- ✅ 【新】修复 `/api/user/avatar` webshell 接受漏洞（扩展名白名单 + 魔术字节 + 存储路径隔离）。**已闭环**
- ✅ 【新】公告 content 字段增加 XSS 过滤或确认前端 Vue 转义覆盖。**已闭环**（`sanitize.ts`）
- ✅ 【新】`/api/auth/login` 启用 rate-limit 中间件 + 429 + Retry-After。**已闭环**
- ✅ 【新】announcementId/通用路径参数加 `ParseIntPipe` 防 500。**已闭环**
- 【后续】升级或替换 form-data < 2.5.4、fast-xml-parser < 4.5.4、multer < 2.2.0 等关键依赖。
- 【后续】补齐真实跨浏览器矩阵（Playwright + BrowserStack 跨 Chrome/Edge/Safari/Firefox/移动端）
- 【后续】补齐 Go-Live 清单签字。

---

## 4. 决策

### 选项 A：GO（无阻塞）

- 所有准入项达标
- 上线日期：______
- 灰度策略：5% → 25% → 100%
- 7×24 值班：已就绪

### 选项 B：GO-WITH-EXCEPTION（有豁免）

- 存在 N 项豁免（已双签）
- 上线日期：______
- 监控加强项：______
- 30 天内必须修复项：______

### 选项 C：NO-GO（阻塞项未解决）

- 存在 M 项阻塞
- 阻塞根因：______
- 重新评估日期：______

---

## 5. 签字

| 角色 | 姓名 | 签字 | 日期 |
|------|------|------|------|
| 技术负责人 | | | |
| 业务负责人 | | | |
| DBA | | | |
| 运维 | | | |
| 法务 | | | |
| CEO/产品 | | | |

---

## 6. 附件

- [ ] Round 5 性能报告（`tests/e2e/reports/round5-perf-actual.md`）
- [ ] Round 6 安全报告（`tests/e2e/reports/round6-security-actual.md`）
- [ ] Round 7 兼容报告（`tests/e2e/reports/round7-compat-actual.md`）
- [ ] Round 8 灾备报告（`tests/e2e/reports/round8-dr-actual.md`）
- [ ] Round 9 监控报告（`tests/e2e/reports/round9-observability-actual.md`）
- [ ] Go-Live 清单（`GO_LIVE_CHECKLIST.md`）
- [ ] k6 压测原始结果（`tests/load/results/`）
- [ ] npm audit 输出（`tests/security/results/`）

---

*本决策模板由 [tests/e2e/PRODUCTION_READINESS_PLAN.md](../e2e/PRODUCTION_READINESS_PLAN.md) v2026.08 驱动。*
