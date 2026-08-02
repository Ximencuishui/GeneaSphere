# GeneaSphere 上线前 Go-Live 清单

> **生成时间**：2026-08-01
> **关联计划**：[tests/e2e/PRODUCTION_READINESS_PLAN.md](../e2e/PRODUCTION_READINESS_PLAN.md)
> **关联决策**：[GO_NO_GO_DECISION.md](GO_NO_GO_DECISION.md)

所有项必须为 ✅ 或有书面豁免。每一项需有可追溯的证据（截图、链接、报告）。

---

## A. 技术清单（必须 100% 通过）

### A.1 服务可用性

- [ ] A-1.1 前端 `https://xungenlu.cn` 200 OK（curl 验证）
- [ ] A-1.2 后端 `/api/health` 200 OK（[apps/server/src/app.controller.ts](../../apps/server/src/app.controller.ts)）
- [ ] A-1.3 后端 `/api/health/ready` 200 OK（DB 连通）
- [ ] A-1.4 前端 dist 静态资源 ≥ 100 个文件
- [ ] A-1.5 Nginx 配置语法正确（`nginx -t`）
- [ ] A-1.6 PM2 进程 online（`pm2 status`）
- [ ] A-1.7 公网 IP `43.134.232.175` 可达

### A.2 测试覆盖（[Round 0-4](../../test-results/TEST_REPORT.md)）

- [ ] A-2.1 Round 0 冒烟 5/5 通过
- [ ] A-2.2 Round 1 管理员 36/36 路由 200
- [ ] A-2.3 Round 2 族员 22/22 路由 200
- [ ] A-2.4 Round 3 跨角色权限 20/20 通过
- [ ] A-2.5 Round 4 异常回归 8/8 通过
- [ ] A-2.6 修复回归 96/96 通过（[REGRESSION_REPORT_AFTER_FIX.md](../e2e/REGRESSION_REPORT_AFTER_FIX.md)）
- [ ] A-2.7 单元测试 5/5 spec 全绿（rate-limit / global-http-exception / login-lock / tree / DemoRoleModal）

### A.3 性能指标（Round 5 阻塞）

- [ ] A-3.1 登录页 FCP < 1.5s（[P5-01](../load/round5-load.js)）
- [ ] A-3.2 **1000 人族谱树首屏 < 5s**（P5-02，🔴 阻塞）
- [ ] A-3.3 100 并发 demo-login QPS ≥ 200，0% error
- [ ] A-3.4 50 并发族谱树查询 0% error
- [ ] A-3.5 4MB 文件上传成功率 ≥ 99%
- [ ] A-3.6 长时 4h 内存增长 < 50MB
- [ ] A-3.7 Lighthouse Performance ≥ 80
- [ ] A-3.8 首屏 JS gzipped < 3MB

### A.4 安全指标（Round 6 阻塞）

- [ ] A-4.1 6 项安全响应头全存在（[round6-cors-headers.sh](../security/round6-cors-headers.sh)）
- [ ] A-4.2 JWT 篡改/过期/alg=none 全部 401（[round6-jwt-attack.sh](../security/round6-jwt-attack.sh)）
- [ ] A-4.3 SQL 注入 9+ 端点无 500/数据泄露（[round6-sqli.sh](../security/round6-sqli.sh)）
- [ ] A-4.4 XSS payload 全部转义或拒绝（[round6-xss.sh](../security/round6-xss.sh)）
- [ ] A-4.5 CORS 仅允许 `xungenlu.cn` + `www.xungenlu.cn`
- [ ] A-4.6 文件上传 webshell/双扩展名/null 字节 全部 4xx（[round6-upload.sh](../security/round6-upload.sh)）
- [ ] A-4.7 限流 30 req/60s 触发 429 + Retry-After（[round6-bruteforce.sh](../security/round6-bruteforce.sh)）
- [ ] A-4.8 npm audit 0 个 high/critical（[round6-npm-audit.sh](../security/round6-npm-audit.sh)）
- [ ] A-4.9 HSTS max-age ≥ 15552000
- [ ] A-4.10 生产 demo-login 404/403（`DISABLE_DEMO_LOGIN=true`）
- [ ] A-4.11 JWT_SECRET 长度 ≥ 32 字节随机（启动校验）
- [ ] A-4.12 错误响应不暴露堆栈（生产模式）

### A.5 数据完整性（Round 8 阻塞）

- [ ] A-5.1 数据库每日 3AM 备份已配置（[DatabaseBackupService](../../apps/server/src/cos/database-backup.service.ts)）
- [ ] A-5.2 备份文件大小合理（≥ 1MB，演示数据）
- [ ] A-5.3 30 天前备份自动清理
- [ ] A-5.4 **RTO < 30 min**（[tests/production/restore.sh](restore.sh) 演练）
- [ ] A-5.5 RPO < 24h（每日 3AM 备份）
- [ ] A-5.6 Prisma 迁移兼容性（`prisma migrate deploy` 成功）
- [ ] A-5.7 软删除 + 回收站 + 合并回滚 闭环

### A.6 监控告警（Round 9 阻塞）

- [ ] A-6.1 `/api/health`（存活）+ `/api/health/ready`（就绪）双探针
- [ ] A-6.2 **Prometheus `/metrics` 端点**（🔴 准入前必须补）[../observability/round9-monitoring.sh](../observability/round9-monitoring.sh) 验证
- [ ] A-6.3 关键业务指标（活跃用户/家族数/树加载）
- [ ] A-6.4 慢查询告警（>2s 记录）
- [ ] A-6.5 钉钉/企业微信 5xx 告警通道
- [ ] A-6.6 日志轮转配置（logrotate）
- [ ] A-6.7 audit log 关键操作必有记录

### A.7 部署与配置

- [ ] A-7.1 CI 流水线（[.github/workflows/ci.yml](../../.github/workflows/ci.yml)）全绿
- [ ] A-7.2 Docker 镜像构建并推送（如使用 Docker）
- [ ] A-7.3 Nginx `proxy_pass` 末尾无 `/`（见 [DEPLOY.md §229-232](../../DEPLOY.md)）
- [ ] A-7.4 PM2 开机自启（`pm2 startup`）
- [ ] A-7.5 `.env` 完整（DATABASE_URL/JWT_SECRET/JWT_PLATFORM_SECRET/DEEPSEEK/COS）
- [ ] A-7.6 HTTPS 证书 + HSTS
- [ ] A-7.7 域名 ICP 备案

### A.8 缺陷跟踪

- [ ] A-8.1 9 项 P0/P1 修复全部回归通过
- [ ] A-8.2 8 项非阻断瑕疵（I-1 ~ I-8）有书面豁免或修复工单
  - [ ] I-1 1000 人树慢 SQL（🔴 阻塞，已登记）
  - [ ] I-2/I-3 错误状态码
  - [ ] I-4 端点缺失
  - [ ] I-5 family-relation 慢查询
  - [ ] I-6 单进程限流（多实例失效）
  - [ ] I-7 无 Prometheus/metrics
  - [ ] I-8 无 CORS 白名单

### A.9 兼容性与前端

- [ ] A-9.1 Chromium / Firefox / WebKit × desktop+tablet+mobile 全部通过（[../compatibility/round7-compatibility.sh](../compatibility/round7-compatibility.sh)）

---

## B. 业务清单

- [ ] B-1 隐私政策 / 用户协议 法务审核通过
- [ ] B-2 客服 FAQ 上线
- [ ] B-3 应急联系方式确认（开发/DBA/运维/业务）
- [ ] B-4 上线公告文案
- [ ] B-5 灰度名单（5% 金丝雀）
- [ ] B-6 旧版本下线时间点
- [ ] B-7 7×24 值班表（首周）
- [ ] B-8 性能基线文档

---

## C. 法务与合规

- [ ] C-1 域名 ICP 备案 + SSL 证书
- [ ] C-2 用户协议 / 隐私政策上线
- [ ] C-3 注销账号路径可用
- [ ] C-4 数据导出功能可用
- [ ] C-5 第三方服务协议（DeepSeek / 腾讯云 / 短信）合规
- [ ] C-6 Cookie 提示横幅（仅必要 Cookie）
- [ ] C-7 实名认证链路（可选）

---

## D. 回滚与灾备

- [ ] D-1 蓝绿部署脚本就绪（`deploy.sh --canary 10`）
- [ ] D-2 回滚脚本就绪（`deploy.sh --rollback`）
- [ ] D-3 数据库快照（`pg_dump` 一份 `pre-prod-snapshot-{ts}.sql.gz`）
- [ ] D-4 上线前备份验证（[backup-drill.sh](backup-drill.sh)）
- [ ] D-5 5xx 错误率告警触发 5 分钟内回滚
- [ ] D-6 7×24 应急联系方式分发

---

## E. 上线后 7 天跟踪

- [ ] E-1 每日 Round 0-4 冒烟回归
- [ ] E-2 监控大盘每日 review
- [ ] E-3 用户反馈跟踪表
- [ ] E-4 性能基线回写
- [ ] E-5 备份恢复演练 1 次
- [ ] E-6 真实流量压测（k6 staging）

---

## F. Final Acceptance Test 上线前必做动作

> 本节把 Final Acceptance Test 转换为可签字的上线动作。每项必须填写负责人、完成时间和证据链接；仅口头确认、开发环境结果或 mock 通道结果不得标记完成。

### F.1 技术与生产配置

- [ ] F-1.1 冻结唯一 release/tag，保存构建包 checksum 或镜像 digest。
- [ ] F-1.2 在生产同构环境部署 production build，记录 Node/PostgreSQL/Nginx/PM2 版本及资源配置。
- [ ] F-1.3 CI、单元/集成测试、Round 0-4 最终冒烟全绿。
- [ ] F-1.4 k6 完成 login/tree/api-mix/upload，并归档原始 JSON、阈值结果和监控曲线。
- [ ] F-1.5 1000 人树首屏、4h 稳态、Lighthouse、首屏包体达到 Round 5 门槛。
- [ ] F-1.6 生产 `demo-login` 已关闭，JWT/JWT_PLATFORM 密钥各自强随机且非默认值。
- [ ] F-1.7 CORS、HTTPS/HSTS、安全响应头、上传白名单、请求体/超时限制生效。
- [ ] F-1.8 多实例限流使用共享存储或有经验证的等效控制。
- [ ] F-1.9 PM2/systemd 开机自启、自愈、最大内存重启及 ready 探针在生产环境验证。
- [ ] F-1.10 Prisma migration 已在生产快照副本预演，配置变更和向前兼容策略已审核。

### F.2 安全加固

- [ ] F-2.1 JWT/越权/SQLi/XSS/CORS/上传/SSRF/限流对候选 release 全量复测。
- [ ] F-2.2 `pnpm audit` 与镜像扫描为 0 critical、0 可利用 high。
- [ ] F-2.3 管理接口受 VPN/IP 白名单或等效访问控制保护。
- [ ] F-2.4 生产错误无堆栈/SQL/内部路径泄露，source map 不公开。
- [ ] F-2.5 轮换验收期间使用的密钥、Token，清理安全账号、恶意 payload 和上传样本。

### F.3 监控与运维

- [ ] F-3.1 Prometheus 实际抓取 `/metrics`，Grafana 系统与业务大盘可用。
- [ ] F-3.2 5xx、延迟、DB、进程、内存、磁盘、备份、证书及第三方故障告警已配置。
- [ ] F-3.3 真实钉钉/企业微信/邮件完成告警、接收确认和恢复通知演练。
- [ ] F-3.4 应用/Nginx/PM2/PostgreSQL/audit 日志集中采集并启用轮转。
- [ ] F-3.5 告警负责人、升级链、MTTD/MTTA 目标及首周 7×24 值班表已发布。

### F.4 业务与数据准备

- [ ] F-4.1 清理演示、压测、安全测试数据和临时账号。
- [ ] F-4.2 生产初始数据、管理员/运营账号、角色权限及数据迁移对账完成。
- [ ] F-4.3 上线公告、维护/故障通知模板、客服 FAQ 和反馈台账就绪。
- [ ] F-4.4 5% 金丝雀名单及 5%→25%→100% 放量门槛经业务确认。
- [ ] F-4.5 旧版本下线时间、用户迁移方式和客服升级流程已确认。

### F.5 合规与法务

- [ ] F-5.1 ICP、域名主体、SSL 及证书到期告警完成。
- [ ] F-5.2 用户协议、隐私政策经法务审核并可从页面访问。
- [ ] F-5.3 隐私政策覆盖敏感个人信息、未成年人、保存期限、第三方共享和投诉渠道。
- [ ] F-5.4 数据导出、账号注销、删除及备份保留规则形成可验证闭环。
- [ ] F-5.5 DeepSeek、腾讯云 COS/OCR、短信等第三方数据处理协议与存储地域完成审查。
- [ ] F-5.6 Cookie/localStorage JWT 使用方式完成合规与安全评估。

### F.6 灾备、回滚与应急

- [ ] F-6.1 上线前完整快照可下载、可解压、checksum 正确。
- [ ] F-6.2 同一备份已恢复至全新隔离库，数据对账和核心业务冒烟通过。
- [ ] F-6.3 RTO <30min、RPO <24h，有起止时间和恢复日志证据。
- [ ] F-6.4 当前版与上一版构建包、配置、数据库兼容策略均可取用。
- [ ] F-6.5 蓝绿/金丝雀切流和应用回滚完成演练；不可逆 migration 不依赖直接向下回滚。
- [ ] F-6.6 5xx >5%、登录/族谱树不可用、数据错误、越权或高危漏洞的回滚阈值已配置。
- [ ] F-6.7 L1 事件 5 分钟内启动回滚的 Runbook、事件指挥官和通讯录已发布。

### F.7 证据与签字台账

| 项目 | 状态 | 负责人 | 完成时间 | 证据/报告 | 缺陷或豁免单 |
|------|------|--------|----------|-----------|--------------|
| Round 5 k6 性能 | ⬜ | | | `tests/e2e/reports/round5-perf-actual.md` | |
| Round 6 安全 | ⬜ | | | `tests/e2e/reports/round6-security-actual.md` | |
| Round 7 Playwright | ⬜ | | | `tests/e2e/reports/round7-compat-actual.md` | |
| Round 8 灾备恢复 | ⬜ | | | `tests/e2e/reports/round8-dr-actual.md` | |
| Round 9 监控告警 | ⬜ | | | `tests/e2e/reports/round9-observability-actual.md` | |
| 业务与数据 | ⬜ | | | | |
| 法务与合规 | ⬜ | | | | |
| 回滚与应急 | ⬜ | | | | |

---

## 总结

- 当前通过：___ / ___（以实际复核后的原子检查项为准）
- 阻塞项：___
- 豁免项：___（附豁免单；仅限 P2/P3，期限不超过 30 天）
- Final Acceptance Test release：___
- Final Acceptance Test 环境：___

---

**Go-Live 决议**：⬜ GO ⬜ NO-GO ⬜ GO-WITH-EXCEPTION

**签字**：
- 技术负责人：________
- 业务负责人：________
- 法务合规：________
- 日期：________
