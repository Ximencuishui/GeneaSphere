# Round 6 / Round 8 / Round 9 当前环境执行报告

> 执行时间：2026-08-02
> 环境：Local Dev，后端 `http://localhost:3101`

## Round 6 安全专项

| 项目 | 结果 | 证据 |
|---|---|---|
| JWT 攻击脚本 | 未形成完整报告 | 脚本在首个 `((PASS++))` 后因 Bash `set -e` 提前退出 |
| SQL 注入脚本 | 未形成完整报告 | 同上，脚本提前退出 |
| XSS | 未通过/需复核 | 脚本报告公告 payload 原样存储 |
| CORS/安全响应头 | 未形成完整报告 | 脚本在首个通过项后提前退出 |
| 上传绕过 | 脚本执行失败 | Windows/Git Bash 下 Python payload 引号解析错误 |
| 依赖漏洞 | 未通过 | `pnpm audit --audit-level high` 发现 45 个漏洞：2 low、16 moderate、23 high、4 critical |

## Round 8 灾备

- `POST /api/admin/backup/trigger?clanSlug=zhuxi-demo` 返回 `404 NOT_FOUND`。
- 未能触发备份，未取得 COS 备份对象、恢复日志、RTO/RPO 数据。
- 灾备准入失败，需先确认实际备份 API 或补齐端点后重测。

## Round 9 监控告警

基础端点已通过手工请求：

- `/api/health`：200
- `/api/health/ready`：200，数据库 `ok: true`
- `/metrics`：200
- 已确认 `family_count`、`person_count`、`active_users`、`http_requests_total`、`prisma_query_duration_seconds` 等指标存在。

脚本状态：未形成正式 PASS 报告。`round9-monitoring.sh` 使用 `set -e` 和 `((PASS++))`，在首个通过项后提前退出；`DINGTALK_WEBHOOK` 未配置，告警通道未演练。

## 当前结论

深层路由 Token 守卫、三种 Token browser MCP 回归、真实统计 API 和基础健康指标已完成；Round 5/6/7/8/9 仍存在未完成或失败项，当前继续保持 **NO-GO**。
