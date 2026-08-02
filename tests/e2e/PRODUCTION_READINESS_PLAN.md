# GeneaSphere（寻根路）生产环境准入测试计划 v2026.08

> **目标**：在已完成 5 轮端到端测试（121 用例，通过率 95.0%；96/96 修复回归）的基础上，补齐生产环境专项测试，给出可量化的 Go/No-Go 决策依据。
>
> **文档位置**：`tests/e2e/PRODUCTION_READINESS_PLAN.md`
> **最后更新**：2026-08-01
> **Go/No-Go 决议产出**：`tests/production/GO_NO_GO_DECISION.md`

---

## 0. 关联文档索引

| 类别 | 路径 | 用途 |
|------|------|------|
| 测试报告 | [tests/test-results/TEST_REPORT.md](../../test-results/TEST_REPORT.md) | Round 0-4 实测 |
| 测试方案 | [tests/e2e/TEST_PLAN_AND_REPORT.md](TEST_PLAN_AND_REPORT.md) | 用例集 + 缺陷清单 |
| 测试框架 | [tests/e2e/00-README.md](00-README.md) | 服务启动 + 账号矩阵 |
| 报告模板 | [tests/e2e/06-report-template.md](06-report-template.md) | 单轮报告模板 |
| 修复回归 | [tests/e2e/REGRESSION_REPORT_AFTER_FIX.md](REGRESSION_REPORT_AFTER_FIX.md) | 9 项 P0/P1 修复回归 |
| 本地健康检查 | [tests/e2e/scripts/check-services.ps1](scripts/check-services.ps1) | 端口 + demo-login |
| 生产健康检查 | [scripts/health-check.sh](../../scripts/health-check.sh) | Nginx/PM2/磁盘/内存 |
| 部署文档 | [DEPLOY.md](../../DEPLOY.md) | PM2 + Nginx 一键部署 |
| 性能压测脚本 | [tests/load/](../load/) | Round 5 k6 脚本 |
| 安全渗透脚本 | [tests/security/](../security/) | Round 6 渗透脚本 |
| 灾备/合规 | [tests/production/](../production/) | Go-Live 清单 |

---

## 一、生产环境准入标准（Go-Live Acceptance Criteria）

> 准入不通过则禁止 `xungenlu.cn` 公网上线。每一项必须为绿/有书面豁免。

### 1.1 功能完整性（FUNCTIONAL）

| 编号 | 标准 | 验证来源 | 当前状态 | 准入阈值 |
|------|------|----------|----------|----------|
| F-1 | 管理员 36 个 `/zupu/:slug/*` 子路由全部 200 + 命中 h2 | Round 1 | ✅ 36/36 | 100% |
| F-2 | 族员 22 个 `/user-center/*` 路由全部 200 + 命中 h2 | Round 2 | ✅ 22/22 | 100% |
| F-3 | 平台管理员 6 个 `/platform-admin/*` 路由全部 200 | Round 4 | ✅ 6/6 | 100% |
| F-4 | 三层权限矩阵（OWNER/EDITOR/SUPER）UI + API 双层阻断 | Round 3 | ✅ 20/20 | 100% |
| F-5 | 演示族谱数据完整性：1002 人 / 28 代 / 0 孤儿 | Round 1 | ✅ | ≥1000 |
| F-6 | CRUD 主链路：announcement/info/order/member 写读 roundtrip | Round 4 | ✅ 2/2（P0-3 已修） | 100% |
| F-7 | 已知 P0/P1 缺陷全部修复并通过回归 | REGRESSION | ✅ 9/9 | 0 个未修复 P0/P1 |
| F-8 | 5 个非阻断性瑕疵（I-1 ~ I-5）有书面豁免 + 跟踪工单 | Round 4 §7 | ⚠️ 待登记 | 全部豁免/排期 |

### 1.2 性能指标（PERFORMANCE）

| 编号 | 指标 | 期望 | 当前实测 | 准入阈值 |
|------|------|------|----------|----------|
| P-1 | 登录页 TTFB + FCP | < 1.0s | 0.6s ✅ | < 1.5s |
| P-2 | **1000 人族谱树 G6 首屏**（含进度条） | < 3s | 6-9s ⚠️ | **< 5s** |
| P-3 | 路由切换（SPA 内部跳转）P95 | < 500ms | 未测 | < 800ms |
| P-4 | 常规 API（CRUD 列表/详情）P95 | < 300ms | 未测 | < 500ms |
| P-5 | 健康探针 `/api/health/ready` P95 | < 100ms | 未测 | < 200ms |
| P-6 | 前端首屏字节（gzipped） | < 2MB | 未测 | < 3MB |
| P-7 | 4MB 文件上传成功率 | 100% | 未测 | ≥ 99% |
| P-8 | 100 并发 `/api/auth/demo-login` 错误率 | 0% | 未测 | < 1% |
| P-9 | Lighthouse Performance 评分 | ≥ 90 | 未测 | ≥ 80 |
| P-10 | 内存增长（4h 长跑） | < 50MB | 未测 | < 100MB |

> **关键风险**：1000 人族谱树首次加载 6-9s 远超 3s 期望，必须在 Round 5（性能压测）量化是否符合准入，或补充分层/分代加载方案。

### 1.3 安全性（SECURITY）

| 编号 | 控制项 | 验证来源 | 准入阈值 |
|------|--------|----------|----------|
| S-1 | 6 类安全响应头全部存在（CSP/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy/HSTS） | [security-headers.middleware.ts](../../apps/server/src/common/security-headers.middleware.ts) | 100% |
| S-2 | JWT 篡改/过期/缺失 → 401 | Round 4 4/4 ✅ | 100% |
| S-3 | 越权访问（EDITOR 调 admin API）→ 403 | Round 3 8/8 ✅ | 100% |
| S-4 | SQL 注入（参数化查询）→ 404/400，无数据泄露 | Round 4 1/1 ✅ | 全覆盖 |
| S-5 | XSS 防护（CSP + Vue 默认转义）| 单元测试 + 渗透 | 全覆盖 |
| S-6 | 限流（登录/注册/短信）触发 429 + Retry-After | [rate-limit.middleware.spec.ts](../../apps/server/src/common/rate-limit.middleware.spec.ts) | 100% |
| S-7 | **CORS 白名单收紧** | 待补 | 仅 `xungenlu.cn` + `www.xungenlu.cn` |
| S-8 | 上传文件类型白名单（防 webshell 上传）| 待补 | 严格白名单 |
| S-9 | 敏感字段（手机号/身份证）脱敏显示 | 已有 `138****0001` ✅ | 100% |
| S-10 | 第三方依赖漏洞扫描（npm audit） | CI 已有 | 0 个 high/critical |
| S-11 | JWT_SECRET 强度（≥ 32 字节随机） | 待补 | 启动校验 |
| S-12 | demo-login 在生产禁用 | 待补 | `DISABLE_DEMO_LOGIN=true` |

### 1.4 稳定性与可用性（RELIABILITY）

| 编号 | 指标 | 准入阈值 |
|------|------|----------|
| R-1 | 7×24 小时稳定运行（PM2 进程不退出） | 0 次非预期退出 |
| R-2 | 单元测试 + 集成测试通过率 | 100% |
| R-3 | `video-processor.service.ts` 外层 try/catch（已修复 P0-1）| 复测通过 |
| R-4 | 数据库连接断开时优雅降级 | `/api/health/ready` 返回 degraded |
| R-5 | 临时文件/上传/备份残留清理 | `DatabaseBackupService` finally 块已覆盖 |
| R-6 | 内存泄漏（限流桶 10000 阈值 + evict）| 10000 桶上限 |
| R-7 | 数据库每日自动备份 + 30 天保留 | cron 3AM |
| R-8 | 备份恢复演练 RTO / RPO | RTO < 30 min, RPO < 24h |

### 1.5 可观测性（OBSERVABILITY）

| 编号 | 控制项 | 准入阈值 |
|------|--------|----------|
| O-1 | `/api/health`（存活）+ `/api/health/ready`（就绪+DB）双探针 | 200 OK |
| O-2 | 结构化日志（时间戳 + 级别 + 上下文） | main.ts 已配置 |
| O-3 | 关键事件 audit log（登录/审核/合并/打印）| `/api/admin/logs` 200 |
| O-4 | 错误码体系（INTERNAL_ERROR/BAD_REQUEST/UNAUTHORIZED...）| `GlobalHttpExceptionFilter` 覆盖 |
| O-5 | **Prometheus `/metrics` 端点** | [observability/round9-monitoring.sh](../observability/round9-monitoring.sh)（准入前必须补 nestjs-prometheus）|
| O-6 | **慢查询日志 + 阈值告警** | **待补**（>2s 记录） |
| O-7 | **告警通道（钉钉/企业微信/邮件）** | **待补**（生产必须） |

### 1.6 合规与隐私（COMPLIANCE）

| 编号 | 控制项 | 准入阈值 |
|------|--------|----------|
| C-1 | 隐私政策 + 用户协议页面 | 营销页底部链接 |
| C-2 | 用户数据导出（个保法要求）| `/zupu/:slug/settings/export` 已有 |
| C-3 | 账号注销路径 | 用户设置有"注销账号"按钮 |
| C-4 | Cookie 提示横幅（仅必要 Cookie）| JWT 存 localStorage，需评估 |
| C-5 | 实名认证链路（可选，依赖业务定位） | 短信验证码已具备 |

---

## 二、当前测试覆盖度评估

### 2.1 已覆盖（121 用例 / 95% 通过率）

| 维度 | 范围 | 状态 |
|------|------|------|
| 服务冒烟 | 端口监听、demo-login、健康探针、登录页 DOM | ✅ Round 0 |
| 管理员主流程 | 36 个 `/zupu/:slug/*` 子路由加载 + 视图切换 | ✅ Round 1 |
| 族员主流程 | 22 个 `/user-center/*` 路由加载 | ✅ Round 2 |
| 跨角色权限 | 13 个 UI 跳转 + 6 个 API 权限 + 退出清空 | ✅ Round 3 |
| 异常与回归 | Token 异常 4 + CRUD 写读 + 端点连通性 + 移动端 | ✅ Round 4 |
| 修复回归 | 9 项 P0/P1/P2 修复 + 96 用例 100% | ✅ REGRESSION |
| 单元测试 | rate-limit / global-http-exception / login-lock / tree / DemoRoleModal | ✅ 5 个 spec |

### 2.2 已识别但未修复的非阻断瑕疵

| 编号 | 描述 | 影响 | 建议处置 | 阻塞？ |
|------|------|------|----------|--------|
| I-1 | `/api/tree/clan/zhuxi-demo/full` 慢 SQL（curl 15s+）| 阻塞 P-2 准入 | 加索引 + 分代加载 + Redis 缓存 | 🟠 是 |
| I-2 | `/api/admin/announcements/{invalid-id}` 500 | UI 异常分支不友好 | 改 400/404 | 🟢 否 |
| I-3 | `/api/admin/members?pageSize=99999` 500 | 无分页上限 | 加 DTO 校验（`@Max(100)`） | 🟢 否 |
| I-4 | `/api/admin/permissions`、`/api/invite/records` 缺失 | 菜单点击 404 | 补端点或移除菜单 | 🟡 是 |
| I-5 | `family-relation.disputes` 慢查询 | 大家族加载慢 | 加复合索引 | 🟡 是 |
| I-6 | 单进程限流（多实例失效）| 多 PM2 实例下绕过 | 接入 Redis Throttler | 🟡 是 |
| I-7 | 无 Prometheus/metrics 端点 | 无法接入监控 | 准入前必须补 | 🟠 是 |
| I-8 | 无 CORS 白名单配置 | 当前全开放 | 收紧到 `xungenlu.cn` | 🟠 是 |

### 2.3 关键测试盲区（必须补齐）

| 盲区类别 | 缺失用例 | 风险等级 |
|----------|----------|----------|
| **负载压力** | 100 并发 demo-login、50 并发族谱树查询、长时稳态运行 | 🔴 高 |
| **安全渗透** | JWT 重放/撤销、SSRF、文件上传绕过、CORS 跨域、Header 注入 | 🔴 高 |
| **浏览器兼容** | Safari/Firefox/Edge/微信内置/钉钉内置/小窗 webview | 🟡 中 |
| **数据完整性** | 事务并发写、备份恢复演练、Prisma 迁移兼容性 | 🔴 高 |
| **可观测性** | /metrics 端点、慢查询告警、错误率看板 | 🟡 中 |
| **灾备回滚** | 蓝绿部署回滚、备份恢复 RTO/RPO 演练 | 🔴 高 |
| **第三方降级** | DeepSeek AI 限流/超时降级、OCR 切换 Tesseract 验证、腾讯云 COS 故障降级 | 🟡 中 |
| **移动端深度** | 100+ 真机/模拟器矩阵、横竖屏、虚拟键盘、3G/弱网 | 🟡 中 |

---

## 三、生产环境专项测试设计（Round 5-9）

> 每个 Round 独立可重入，遵循 [01-test-framework.md §二 状态隔离规范](01-test-framework.md)：每轮 `localStorage.clear()`。
> 输出到 `tests/e2e/reports/round{N}-actual.md`。

### 3.1 Round 5：性能与负载压测（预计 4-6h，🟠 阻塞准入）

| 用例 ID | 场景 | 工具 | 目标 | 通过标准 | 脚本 |
|---------|------|------|------|----------|------|
| P5-01 | 登录页加载（无缓存 + 清强缓存）| Lighthouse / WebPageTest | FCP / LCP / TTI | LCP < 2.5s | — |
| P5-02 | **1000 人族谱树冷启动** | Browser MCP + 计时 | first-paint → 进度条 100% | **< 5s**（P-2 准入） | [load/round5-tree.js](../load/round5-tree.js) |
| P5-03 | 100 人 G6 详细/紧凑视图切换 FPS | `requestAnimationFrame` | 帧率 | ≥ 50fps（详细）/ 60fps（紧凑） | — |
| P5-04 | 路由切换（SPA 内）P95 | Browser MCP 批量 50 次 | 耗时分布 | P95 < 800ms | — |
| P5-05 | API 列表查询 P95（10 类接口）| k6 | 响应时间 | P95 < 500ms | [load/round5-api-mix.js](../load/round5-api-mix.js) |
| P5-06 | **100 并发 demo-login** | k6 | 错误率 / QPS | 0% error，QPS ≥ 200 | [load/round5-login.js](../load/round5-login.js) |
| P5-07 | **50 并发族谱树查询** | k6 | 错误率 | 0% error，P95 < 3s | [load/round5-tree.js](../load/round5-tree.js) |
| P5-08 | 4MB 文件上传 20 并发 | k6 | 成功率 | ≥ 99% | [load/round5-upload.js](../load/round5-upload.js) |
| P5-09 | **长时稳态（PM2 运行 4h）** | PM2 + 监控 | 内存增长 | RSS 增长 < 50MB | — |
| P5-10 | 内存泄漏探针（限流桶 10000 上限）| Jest 单元 + 实际 | OOM | 不发生 OOM | — |
| P5-11 | 数据库连接池耗尽恢复 | 关 PG 30s 后恢复 | 重连耗时 | < 5s | — |
| P5-12 | 首屏 JS 字节 | `vite build --report` | gzipped | < 3MB | — |
| P5-13 | Lighthouse 评分（生产域名）| `lighthouse-ci` | Performance | ≥ 80 | — |
| P5-14 | Prisma 慢查询日志（>2s 记录）| `prisma:query` 钩子 | 输出 | 已记录 | — |

### 3.2 Round 6：安全渗透与漏洞扫描（预计 3-4h，🟠 阻塞准入）

| 用例 ID | 攻击向量 | 工具 | 期望 | 脚本 |
|---------|----------|------|------|------|
| S6-01 | JWT 篡改/签名替换/算法 none 攻击 | 自写脚本 | 401 | [security/round6-jwt-attack.sh](../security/round6-jwt-attack.sh) |
| S6-02 | JWT 重放（已签发 token 60min 内反复使用）| Burp / 自写 | 200 但有 audit log | 同上 |
| S6-03 | JWT 撤销（管理员踢出用户）| 业务接口 | 旧 token 立即 401 | — |
| S6-04 | SQL 注入（10+ 端点，参数化）| sqlmap + 自写 | 无数据泄露，全 400/404 | [security/round6-sqli.sh](../security/round6-sqli.sh) |
| S6-05 | NoSQL 注入（JSON body）| 自写 | 400 | — |
| S6-06 | XSS 反射（公告/姓名/描述）| 自写 | 输出转义，CSP 阻止 | [security/round6-xss.sh](../security/round6-xss.sh) |
| S6-07 | XSS 存储（提交 `<script>` 到数据库）| 自写 | 存储时转义或拒绝 | 同上 |
| S6-08 | CSRF（Cookie-based 与 Bearer 对比）| 自写 | 纯 Bearer 不受 CSRF | — |
| S6-09 | SSRF（上传/导入 PDF 远程 URL）| 自写 | 拒绝内网 IP | [security/round6-ssrf.sh](../security/round6-ssrf.sh) |
| S6-10 | 文件上传绕过（双扩展名、null 字节、webshell）| 自写 | 严格 MIME + 扩展名白名单 | [security/round6-upload.sh](../security/round6-upload.sh) |
| S6-11 | 越权读（族员读其他家族数据）| 自写 | 403/404 | — |
| S6-12 | 越权写（族员写其他家族数据）| 自写 | 403 | — |
| S6-13 | 暴力登录（同一 IP 1min 100 次）| 自写 | 429 + Retry-After | [security/round6-bruteforce.sh](../security/round6-bruteforce.sh) |
| S6-14 | 短信轰炸（同一手机号 1min 10 次）| 自写 | 429 | 同上 |
| S6-15 | **CORS 跨域（任意 Origin）** | curl | 仅 `xungenlu.cn` 允许凭证 | [security/round6-cors.sh](../security/round6-cors.sh) |
| S6-16 | HTTP 方法覆盖（GET → DELETE 通过 _method）| 自写 | 不支持 | — |
| S6-17 | Header 注入（CRLF in X-Forwarded-For）| 自写 | 解析正确 | — |
| S6-18 | 目录遍历（`/uploads/../../etc/passwd`）| 自写 | 404 | — |
| S6-19 | 大量 payload（100KB body）| 自写 | 413 Payload Too Large | — |
| S6-20 | 慢速攻击（slowloris）| 自写 | Nginx 超时保护 | — |
| S6-21 | **npm audit（前后端）** | `pnpm audit` | 0 high/critical | [security/round6-npm-audit.sh](../security/round6-npm-audit.sh) |
| S6-22 | 第三方依赖漏洞（前后端打包产物）| Snyk / Trivy | 0 high | — |
| S6-23 | Docker 镜像漏洞扫描 | Trivy | 0 high | — |
| S6-24 | **安全响应头（6 个）** | curl -I | 全存在 | [security/round6-headers.sh](../security/round6-headers.sh) |
| S6-25 | HTTPS 强制（HSTS）| curl -I | HSTS max-age ≥ 15552000 | 同上 |
| S6-26 | 密码强度策略（注册/修改）| 自写 | 弱密码拒绝 | — |
| S6-27 | 敏感字段脱敏（手机/身份证/邮箱）| API 响应检查 | `138****0001` 形式 | — |
| S6-28 | 审计日志完整性（关键操作必有日志）| DB 查询 | 100% | — |

### 3.3 Round 7：浏览器/设备兼容性（预计 4-6h，🟡 非阻塞）

| 用例 ID | 浏览器/设备 | 工具 | 验证点 |
|---------|-------------|------|--------|
| B7-01 | Chrome 120+ (Win/Mac/Linux) | Playwright | 全功能 | [compatibility/round7-compatibility.sh](../compatibility/round7-compatibility.sh) |
| B7-02 | Firefox 121+ | Playwright | 全功能 | 同上 |
| B7-03 | Safari 17+ (macOS/iOS) | Playwright / BrowserStack | 全功能 |
| B7-04 | Edge 120+ | Playwright | 全功能 |
| B7-05 | 微信内置浏览器（iOS/Android）| 微信开发者工具 | 关键页面 |
| B7-06 | 钉钉内置浏览器 | 钉钉开发者工具 | 关键页面 |
| B7-07 | 移动 Chrome（Android 13+）| BrowserStack | 关键页面 |
| B7-08 | 移动 Safari（iOS 17+）| BrowserStack | 关键页面 |
| B7-09 | 平板 iPad（横竖屏）| BrowserStack | 布局 |
| B7-10 | 桌面 1920×1080 / 1440×900 / 1280×720 | Playwright | 响应式 |
| B7-11 | 移动 375×667（iPhone SE）| Playwright | 响应式 |
| B7-12 | 移动 414×896（iPhone 11）| Playwright | 响应式 |
| B7-13 | 平板 768×1024（iPad）| Playwright | 响应式 |
| B7-14 | 弱网 3G/4G 模拟 | Playwright `networkConditions` | 加载完成 |
| B7-15 | 离线模式 → 重连 | Playwright | 重试机制 |
| B7-16 | 横竖屏切换 | Playwright | 不崩溃 |
| B7-17 | 虚拟键盘弹出（输入）| Playwright | UI 不被遮挡 |
| B7-18 | 高 DPI（Retina）截图 | Playwright | 清晰 |

### 3.4 Round 8：数据完整性、备份与灾备（预计 2-3h，🟠 阻塞准入）

| 用例 ID | 场景 | 步骤 | 期望 | 脚本 |
|---------|------|------|------|------|
| D8-01 | 事务原子性（创建成员+家族关系）| Prisma `$transaction` | 全部成功或全部回滚 | — |
| D8-02 | 并发写（10 个同时改同一成员）| 并发脚本 | 仅 1 成功，其余 409 | — |
| D8-03 | 软删除 + 回收站恢复 | E2E | 完整闭环 | — |
| D8-04 | 合并申请 + 快照回滚 | E2E | 可逆 | — |
| D8-05 | **数据库备份手动触发** | `POST /api/admin/backup/trigger` | COS 中出现 `backup/db/{date}/dump.sql.gz` | [production/backup-drill.sh](../production/backup-drill.sh) |
| D8-06 | 备份文件大小合理性 | `cos headObject` | ≥ 1MB（demo seed） | 同上 |
| D8-07 | **备份恢复（本地还原）** | `psql < dump.sql` | 数据完整，RTO < 30 min | [production/restore.sh](../production/restore.sh) |
| D8-08 | 备份恢复（远端还原到测试 PG）| 演练脚本 | 数据一致 | 同上 |
| D8-09 | 30 天前备份自动清理 | 时间快进 + 触发 | 过期备份删除 | — |
| D8-10 | Prisma 迁移兼容性（新 schema 不破坏旧数据）| `prisma migrate deploy` | 成功 | — |
| D8-11 | 大数据量导入（10000 人族谱）| 导入脚本 | 完成，无 OOM | — |
| D8-12 | 数据库连接断开（kill PG）| `pg_ctl stop` | `/api/health/ready` 返回 degraded | — |
| D8-13 | 存储空间满 | 模拟 | 写入失败有友好提示 | — |
| D8-14 | 软删除数据清理（Cron）| 检查 log | 90 天前已删除成员清理 | — |
| D8-15 | audit log 不被清空 | 验证 | 永久保留 | — |

### 3.5 Round 9：监控告警与可观测性（预计 1-2h，🟠 阻塞准入）

| 用例 ID | 控制项 | 验证 |
|---------|--------|------|
| M9-01 | `/api/health`（存活）| 200 |
| M9-02 | `/api/health/ready`（含 DB）| 200（DB 正常）/ degraded（DB 异常）|
| M9-03 | **Prometheus `/metrics` 端点** | 返回文本格式 metrics（**待补**）|
| M9-04 | 关键指标：HTTP 请求总数 / 错误率 / 响应时间直方图 | metrics 存在 |
| M9-05 | 业务指标：活跃用户数 / 家族数 / 树加载次数 | metrics 存在 |
| M9-06 | 慢查询告警（>2s）| 日志记录 |
| M9-07 | 错误日志（4xx/5xx）| 集中采集 |
| M9-08 | 关键事件 audit log | 写入 audit_log 表 |
| M9-09 | **告警通道（钉钉 webhook 5xx 持续 1 分钟触发）** | 演练通过 |
| M9-10 | 日志轮转（避免磁盘占满）| logrotate 配置 |
| M9-11 | Nginx access/error 日志 | `/var/log/nginx/` 持续输出 |
| M9-12 | PM2 日志（`pm2 logs`）| 持续输出 |
| M9-13 | 链路追踪（OpenTelemetry）| **可选**，可后续接入 |

---

## 四、测试执行策略

### 4.1 优先级与顺序

```
┌────────────────────────────────────────────────────────┐
│  🟠 阻塞准入：Round 5 (性能) + Round 6 (安全) + Round 8 (灾备) + Round 9 (监控) │
│  🟡 非阻塞：  Round 7 (兼容)                                       │
│  🟢 推荐：  现有 Round 0-4 完整回归                                  │
└────────────────────────────────────────────────────────┘
```

**推荐执行顺序**：
1. **Round 0-4 完整回归**（基线确认） — 2h
2. **Round 5 性能压测**（含 I-1 慢 SQL 优化） — 4-6h
3. **Round 6 安全渗透** — 3-4h
4. **Round 8 备份与灾备演练** — 2-3h
5. **Round 9 监控告警补齐与演练** — 1-2h
6. **Round 7 浏览器兼容**（可后台并行） — 4-6h
7. **修复 → 全部重测** — 2h

总预计：**18-25h**，建议 1 个工作日内 + 半日复测。

### 4.2 测试环境与账号矩阵

| 环境 | 用途 | 数据 | 与生产关系 |
|------|------|------|-----------|
| Local Dev（5173/3101）| 单元 + 集成 + E2E | 演示数据 | 镜像 |
| Staging（`staging.xungenlu.cn`）| 性能 + 安全 + 备份演练 | 生产快照（脱敏） | 同构 |
| Pre-Production（`pre.xungenlu.cn`）| 灰度 | 生产数据 | 同构 |
| Production（`xungenlu.cn`）| 监控 + 冒烟 | 真实数据 | 上线 |

**测试账号**（沿用 [00-README.md §二](00-README.md)）：

| 角色 | 账号 | 用途 |
|------|------|------|
| 平台管理员 | `platform_admin` / `admin123` | Round 4/9 |
| 家族管理员 | `13800000000` / `demo123` | Round 1/5/6/8 |
| 族员 | `13800000001` / `demo123` | Round 2/5/6/7/8 |
| 性能压测用 | `loadtest-{n}` × 100 | Round 5 |
| 安全测试用 | `sectest-{n}` × 20 | Round 6 |

> ⚠️ **生产环境绝对不能保留 demo-login 入口**。Round 5/6 完成后立即关闭 `POST /api/auth/demo-login`，仅保留 `POST /api/auth/login`（账号密码）和 `POST /api/auth/sms-login`（短信）。

### 4.3 通过标准

| 级别 | 标准 |
|------|------|
| **P0 阻塞** | 性能 P-2 / S-2 / S-3 / S-4 / R-1 / R-7 / O-5 任一不通过 → 禁止上线 |
| **P1 严重** | 浏览器兼容 3+ 失败、备份恢复 RTO > 30min、告警通道失效 → 阻塞 |
| **P2 中等** | 单一页面 UI 瑕疵、个别非核心接口慢 → 不阻塞但需 30 天内修复 |
| **P3 轻微** | 文案/排版/帮助文档 → 不阻塞，跟踪工单 |

### 4.4 报告输出位置

| 文档 | 路径 |
|------|------|
| Round 5 性能报告 | `tests/e2e/reports/round5-perf-actual.md` |
| Round 5 k6 脚本 | `tests/load/round5-*.js` |
| Round 6 安全报告 | `tests/e2e/reports/round6-security-actual.md` |
| Round 6 渗透脚本 | `tests/security/round6-*.sh` |
| Round 7 兼容矩阵 | `tests/e2e/reports/round7-compat-actual.md` |
| Round 7 截图 | `tests/e2e/screenshots/round7-{browser}-{page}.png` |
| Round 8 灾备报告 | `tests/e2e/reports/round8-dr-actual.md` |
| Round 9 监控报告 | `tests/e2e/reports/round9-observability-actual.md` |
| 最终准入决议 | `tests/production/GO_NO_GO_DECISION.md` |

---

## 五、风险评估与缓解措施

| 风险 ID | 风险描述 | 概率 | 影响 | 风险等级 | 缓解措施 | 回滚方案 |
|---------|----------|------|------|----------|----------|----------|
| **R-P0-1** | 1000 人族谱树首次加载 6-9s 不满足 < 5s | 高 | 高 | 🔴 P0 | ① 加 Prisma 索引（family_unit / family_child）② 实现分代加载（默认前 5 代）③ Redis 缓存全树查询结果 30min | 临时回退到旧版 |
| **R-P0-2** | 慢 SQL 在并发下导致连接池耗尽 | 中 | 高 | 🔴 P0 | 连接池监控 + 慢查询熔断（>5s 报错） | 临时扩容 PM2 实例 |
| **R-P0-3** | 单进程限流在多 PM2 实例下被绕过 | 高 | 中 | 🟠 P1 | 接入 Redis Throttler `@nest-lab/throttler-storage-redis` | 单实例 + 紧急扩容 |
| **R-P0-4** | 上传类接口在 50+ 并发下 502 | 中 | 中 | 🟠 P1 | Nginx 客户端 body 大小限制 + 上传到 OSS 直传 | 回退到分片上传 |
| **R-P0-5** | 备份恢复演练 RTO > 30min | 中 | 高 | 🟠 P1 | 编写自动化恢复脚本（[tests/production/restore.sh](../production/restore.sh)） | 紧急联系 DBA 手动恢复 |
| **R-P0-6** | 监控告警未及时接入 | 高 | 高 | 🔴 P0 | 准入前必须补齐 `/metrics` + 钉钉告警 | 临时邮件告警 |
| **R-P0-7** | 演示登录（demo-login）在生产残留 | 中 | 高 | 🔴 P0 | 上线前在 `auth.service.ts` 加 `NODE_ENV === 'production'` 禁用 | 紧急 Nginx 屏蔽 `/api/auth/demo-login` |
| **R-P0-8** | JWT_SECRET 弱密钥 | 低 | 极高 | 🔴 P0 | 强制 32 字节随机，启动校验 | 立即重签所有 token |
| **R-P0-9** | DeepSeek AI 限流导致业务失败 | 中 | 中 | 🟠 P1 | 接入 5xx 熔断 + 排队 + 降级文案 | 关闭 AI 工具入口 |
| **R-P0-10** | 腾讯云 COS 故障 | 低 | 中 | 🟡 P2 | 已支持 local storage 降级（`STORAGE_DRIVER=local`） | 切换到本地存储 |
| **R-P0-11** | 腾讯云 OCR 故障 | 中 | 中 | 🟡 P2 | 已支持 Tesseract.js 降级 | 关闭 PDF 导入 |
| **R-P0-12** | 短信服务故障 | 中 | 中 | 🟡 P2 | 队列重试 + UI 提示 | 关闭短信验证码登录 |
| **R-P0-13** | 前端 SPA 首屏白屏 | 中 | 中 | 🟠 P1 | 已有 [页面加载白屏问题及进度反馈需求] 记忆 | 回退到旧版 |
| **R-P0-14** | 第三方依赖（含 element-plus tgz）漏洞 | 中 | 中 | 🟠 P1 | `pnpm audit` 阻断高危 + Trivy 镜像扫描 | 临时锁定版本 |

### 5.1 部署风险缓解（具体动作）

| 动作 | 实施位置 | 时间 |
|------|----------|------|
| `demo-login` 生产禁用 | `apps/server/src/auth/auth.service.ts`：`@Cron` 巡检 + 环境变量 `DISABLE_DEMO_LOGIN` | 上线前 |
| JWT_SECRET 强度校验 | 启动脚本读 `.env`，长度 < 32 报错退出 | 上线前 |
| CORS 白名单 | `apps/server/src/main.ts`：`app.enableCors({ origin: ['https://xungenlu.cn', 'https://www.xungenlu.cn'] })` | 上线前 |
| HSTS 启用 | 移除 `HSTS_DISABLED=1`，启用 HSTS | 上线前 |
| Prometheus 接入 | 新增 `apps/server/src/metrics/metrics.controller.ts` + `prom-client` | 上线前 |
| 告警通道 | 钉钉/企业微信 webhook 接入 PM2 + Nginx 5xx 监控 | 上线前 |
| 备份自动化 | `DatabaseBackupService` 已 cron 3AM，需验证执行 | 上线后立即 |
| 蓝绿部署脚本 | `deploy.sh` 增加 `--canary` 10% 流量 | 上线时 |
| 回滚脚本 | `deploy.sh` 增加 `--rollback` 自动回退到上一版本 + 自动迁移回滚 | 上线时 |

---

## 六、回滚方案（Rollback Plan）

### 6.1 触发条件

| 级别 | 触发 | 时限 |
|------|------|------|
| **L1 紧急回滚** | 5xx 错误率 > 5% / 核心功能（登录/族谱树）不可用 | 5 分钟内 |
| **L2 计划回滚** | 性能严重不达标 / 安全高危漏洞 | 24 小时内 |
| **L3 灰度回滚** | 5% 金丝雀用户反馈异常 | 1 小时内 |

### 6.2 回滚步骤（PM2 + Nginx）

```bash
# 1. 切换 Nginx 流量到旧版本（保留 5 分钟用于健康检查）
ssh root@43.134.232.175
cd /opt/geneasphere
ln -sfn releases/v1.0.0 current
systemctl reload nginx

# 2. 重启 PM2 到旧版本
pm2 stop geneasphere-server
cd /opt/geneasphere/releases/v1.0.0
pm2 start apps/server/dist/main.js --name geneasphere-server
pm2 save

# 3. 健康检查
bash scripts/health-check.sh
curl -f http://localhost:3001/api/health/ready

# 4. 通知（钉钉）
./scripts/notify.sh "GeneaSphere 已回滚到 v1.0.0，原因：xxx"
```

### 6.3 数据迁移回滚

- **Prisma 迁移**：`prisma migrate resolve --rolled-back <migration>` 仅限"加列"安全；"删列"必须先用影子表策略
- **配置回滚**：`.env` 备份到 `releases/v1.0.0/.env`
- **数据库快照**：上线前 `pg_dump` 一份 `pre-prod-snapshot-{ts}.sql.gz`（手动触发 `DatabaseBackupService.triggerBackup()`）

---

## 七、上线前 Go-Live 清单（最终核对）

> 所有项必须为 ✅ 或有书面豁免。模板见 [tests/production/GO_LIVE_CHECKLIST.md](../production/GO_LIVE_CHECKLIST.md)。

### 7.1 技术清单

- [ ] 所有 [Round 0-4 实测](../../test-results/TEST_REPORT.md) 用例 100% 通过
- [ ] 8 个非阻断瑕疵（I-1 ~ I-8）已修复或豁免
- [ ] Round 5 性能压测通过（特别是 1000 人树 < 5s）
- [ ] Round 6 安全渗透 0 个高危
- [ ] Round 7 浏览器兼容 ≥ 95% 用例通过
- [ ] Round 8 备份恢复演练 RTO < 30 min, RPO < 24 h
- [ ] Round 9 监控告警通道验证通过
- [ ] `/metrics` 端点已上线
- [ ] demo-login 在生产禁用
- [ ] JWT_SECRET 强度校验通过
- [ ] CORS 白名单收紧
- [ ] HTTPS 证书 + HSTS 配置完成
- [ ] 5 个单元测试 spec 全绿
- [ ] CI 流水线（[ci.yml](../../.github/workflows/ci.yml)）全绿
- [ ] Docker 镜像构建并推送（如使用 Docker 部署）
- [ ] Nginx 配置检查（`proxy_pass` 末尾无 `/`，见 [DEPLOY.md §229-232](../../DEPLOY.md)）
- [ ] PM2 开机自启验证
- [ ] 备份服务 cron 3AM 验证（含远端 COS 桶）
- [ ] 监控大盘（Grafana）创建

### 7.2 业务清单

- [ ] 隐私政策 / 用户协议 法务审核
- [ ] 客服 FAQ 上线
- [ ] 应急联系方式（开发 / DBA / 运维 / 业务）
- [ ] 上线公告 + 灰度名单
- [ ] 旧版本下线时间点
- [ ] 7×24 值班表（首周）

### 7.3 法务与合规

- [ ] 域名 ICP 备案 + SSL 证书
- [ ] 用户协议 / 隐私政策上线
- [ ] 注销账号路径可用
- [ ] 数据导出功能可用
- [ ] 第三方服务协议（DeepSeek / 腾讯云 / 短信）合规

---

## 八、建议落地动作（按优先级）

### 8.1 立即可做（上线前必须）

1. ✅ **新建测试计划目录** `tests/production/` 与 `tests/load/` 与 `tests/security/`（本计划交付）
2. ✅ **编写 Round 5 k6 脚本**（demo-login 100 并发 + 族谱树 50 并发 + 4MB 上传）
3. ✅ **编写 Round 6 渗透脚本**（JWT 篡改 / SQL 注入 / 上传绕过 / CORS / 安全头）
4. 🔧 **修复 I-1 慢 SQL**（1000 人树 < 5s 准入线）
5. 🔧 **补充 `/metrics` 端点**（`prom-client` + `apps/server/src/metrics/`）
6. 🔧 **关闭 demo-login 生产入口**（环境变量 `DISABLE_DEMO_LOGIN=true`）
7. 🔧 **收紧 CORS**（仅 `xungenlu.cn` + `www.xungenlu.cn`）
8. 🔧 **JWT_SECRET 强度校验**（启动 < 32 字节报错）
9. 🔧 **编写蓝绿部署脚本**（`deploy.sh` 增加 `--canary` / `--rollback`）
10. ✅ **编写 `tests/production/restore.sh` 自动化恢复脚本**（本计划交付）

### 8.2 上线后第一周

1. 持续 Round 0-4 回归（每日 1 轮冒烟）
2. 监控大盘上线（Grafana + Prometheus + 钉钉告警）
3. 真实备份恢复演练（1 次）
4. 收集用户反馈，调整性能基线
5. 完善 Round 5-9 报告

### 8.3 上线后 30 天

1. 性能基线调优（基于真实流量）
2. Redis Throttler 接入（解决 I-6）
3. OpenTelemetry 链路追踪（可选）
4. Snyk 持续漏洞扫描

---

## 九、决策建议

| 维度 | 建议 |
|------|------|
| **是否可立即上 xungenlu.cn 公网？** | **否** — 必须先完成 Round 5/6/8/9 阻塞项，特别是 1000 人族谱树性能优化（I-1） |
| **是否可上 staging 灰度？** | **是** — 当前 95% 通过率已可支持内测，仅记录 P2 跟踪工单 |
| **是否可开放注册？** | **否** — demo-login 必须在生产禁用；正式注册链路 SMS/密码需 Round 6 安全测试通过 |
| **核心风险 Top 3** | ① 1000 人树慢 SQL ② 监控告警缺失 ③ demo-login 在生产残留 |
| **可立即获益的快速胜利** | ① 编写自动化备份恢复脚本 ② Prometheus `/metrics` 端点 ③ 关闭 demo-login |

---

*本计划 v2026.08 适用于 GeneaSphere 0.x 上线 xungenlu.cn 公网前的准入测试。建议在 Round 5 实测完成后，根据真实性能数据回写准入阈值 P-2（族谱树加载时间），并最终产出 [`tests/production/GO_NO_GO_DECISION.md`](../production/GO_NO_GO_DECISION.md) 作为发版审批的最终依据。*
