# tests/production

> 生产环境上线决策文档目录。

## 文件清单

| 文件 | 用途 | 维护方 |
|------|------|--------|
| [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md) | 上线前 127 项技术/业务/合规/灾备清单 | 技术 |
| [GO_NO_GO_DECISION.md](GO_NO_GO_DECISION.md) | Go/No-Go 决策模板（Round 5-9 完成后回填） | 技术 + 业务 |
| [backup-drill.sh](backup-drill.sh) | Round 8 D8-05 数据库备份演练 | 运维 |
| [restore.sh](restore.sh) | Round 8 D8-07/D8-08 备份恢复脚本 | 运维 |

## 使用流程

```
Round 5-9 实测
  ├─ Round 5 (k6 + Browser MCP)         → tests/load/results/
  ├─ Round 6 (渗透 + npm audit)         → tests/security/results/
  ├─ Round 7 (Playwright 浏览器矩阵)    → tests/e2e/screenshots/round7-*.png
  ├─ Round 8 (backup-drill.sh + restore.sh) → tests/production/logs/
  └─ Round 9 (Prometheus + 告警)        → tests/production/logs/
            ↓
填充 GO_LIVE_CHECKLIST.md（127 项核对）
            ↓
填充 GO_NO_GO_DECISION.md（决议 + 签字）
            ↓
通知运维 + DBA 准备发布
```

## 关联目录

- [tests/e2e/PRODUCTION_READINESS_PLAN.md](../e2e/PRODUCTION_READINESS_PLAN.md) — 主计划
- [tests/load/](../load/) — Round 5 压测脚本
- [tests/security/](../security/) — Round 6 渗透脚本
- [tests/test-results/](../../test-results/) — Round 0-4 历史报告
