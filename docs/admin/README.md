# 寻根路 Admin 管理后台 · 文档索引

> 范围：平台管理后台（家族管理员 / 平台管理员）的需求、设计与验收文档
> 文档版本：v1.0 · 2026-06-23

## 需求文档

| 文档 | 说明 |
| --- | --- |
| [《Admin 管理后台需求文档 v1.0》](../../../寻根路（xungenlu.cn）Admin%20管理后台需求文档%20v1.0.md) | 角色权限、控制台首页、家族/用户/内容/寻亲管理、系统设置、印刷订单、短信通知、日志审计、数据统计等 7 大模块完整需求 |

## 设计与实施文档

| 文档 | 说明 |
| --- | --- |
| [《日志保留策略》](./日志保留策略.md) | `AuditLog` 与 `PlatformOperationLog` 的 1 年保留策略、索引设计、归档 SQL 与应急解锁 |
| [《验收清单 v1.0》](./验收清单-v1.0.md) | §7 验收标准 + 补缺模块（登录锁定 / PDF 报表 / 证件上传 / 再次购买 / 工具排行）的逐项核对、构建验证记录 |

## 数据库 Schema

| 文档 | 说明 |
| --- | --- |
| [`packages/db/prisma/schema.prisma`](../../../packages/db/prisma/schema.prisma) | Prisma 数据模型；本后台相关的关键模型：`PlatformAdmin`、`PlatformOperationLog`、`GlobalSetting`、`ClanReviewAttachment`、`LoginAttempt`、`PrintOrder`、`SmsSendRecord`、`ToolUsageLog`、`Clan.id_card_url` |

## 关键 API 端点

| 模块 | 路径前缀 | 主要端点 |
| --- | --- | --- |
| 家族管理员 | `apps/server/src/admin/*` | `members / reviews / settings / orders / logs / merge / sms` |
| 平台管理员 | `apps/server/src/platform/*` | `auth / dashboard / families / users / reviews / orders / settings / statistics / logs` |
| 健康检查 | `apps/server/src/app.controller.ts` | `GET /health` · `GET /health/ready`（含 DB 连通性） |

## 端到端验收脚本

| 文件 | 用途 |
| --- | --- |
| [`scripts/verify-admin-v1.mjs`](../../scripts/verify-admin-v1.mjs) | 自动验收 10 项关键流程：服务存活、数据库连通、平台登录、家族/用户/订单/统计/工具、登录锁定、再次购买 |

## 相关规范

- **登录锁定**：连续 5 次密码错误 → 锁定 30 分钟；详见 [日志保留策略 §5 应急解锁](./日志保留策略.md#5-应急解锁误锁账号)
- **多租户隔离**：家族管理员接口强制校验 `clan_id` 与当前管理员所属家族一致（`AdminService.requireAdmin`）
- **日志不可篡改**：API 层无 `delete` / `update` 日志表入口；详见 [日志保留策略 §1 总体策略](./日志保留策略.md)
- **构建优化**：主入口 chunk 从 1.1MB 拆为 35KB；详见 [验收清单 §4.1](./验收清单-v1.0.md#41-主-chunk-优化对比)

## 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-06-23 | 建立索引，补缺实施完成（登录锁定 / PDF 报表 / 证件上传 / 再次购买 / 工具排行 / 健康检查 / 验收脚本 / 构建优化） |