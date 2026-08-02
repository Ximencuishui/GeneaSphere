# Round 0 — Smoke 测试报告模板

> 测试时间：____________
> 测试执行：Qoder AI Agent
> 测试角色：smoke（不区分角色）

## 环境

| 项 | 状态 | 备注 |
|---|---|---|
| 前端 5173 | ⬜ | |
| 后端 3101 | ⬜ | |
| 数据库隧道 | ⬜ | |
| demo-login API | ⬜ | |
| demo-member-login API | ⬜ | |

## 用例执行

| # | 用例 | 期望 | 实际 | 截图 | 结果 |
|---|---|---|---|---|---|
| R0-S1 | 访问登录页看到 2 个演示按钮 | ✅ | | round0-login-page.png | ⬜ |
| R0-S2 | 管理员一键登录跳转族谱后台 | ✅ | | round0-login-admin-success.png | ⬜ |
| R0-S3 | 族员一键登录跳转用户中心 | ✅ | | round0-login-member-success.png | ⬜ |
| R0-S4 | 退出登录后 localStorage 三键全清 | ✅ | | round0-after-logout.png | ⬜ |
| R0-S5 | 未登录访问受保护路由跳 /login | ✅ | | round0-anon-redirect.png | ⬜ |

## 总结

- 通过：__ /5
- 失败：__
- 阻塞：☐ 是 ☐ 否
- 下一步：____________
