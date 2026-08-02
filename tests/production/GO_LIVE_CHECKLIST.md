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

## 总结

- [ ] **A 技术 103 项 / B 业务 8 项 / C 合规 7 项 / D 灾备 6 项 / E 跟踪 6 项 = 130 项**
- 当前通过：___ / 130
- 阻塞项：___
- 豁免项：___（附豁免单）

---

**Go-Live 决议**：⬜ GO ⬜ NO-GO ⬜ GO-WITH-EXCEPTION

**签字**：
- 技术负责人：________
- 业务负责人：________
- 法务合规：________
- 日期：________
