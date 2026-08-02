# Round 2 — 族员角色（用户中心）真实测试结果

> 测试时间：2026-08-01
> 测试执行：Qoder AI Agent
> 测试角色：member（手机号 13800000001，JWT role=EDITOR）
> 目标路由前缀：`/user-center/*`

## 环境

| 项 | 状态 | 备注 |
|---|---|---|
| 前端 5173 | ✅ UP | |
| 后端 3101 | ✅ UP | |
| demo-member-login | ✅ 201 | JWT role=EDITOR ✅ |
| 关联 Person | ✅ | 朱小小（演示族员） |

## 关键修复验证

| 编号 | 修复 | 验证 | 结果 |
|---|---|---|---|
| P1 | 13800000001 仍然是 EDITOR | JWT 解码 role=EDITOR，跳 /user-center/profile | ✅ PASS |

## 用例执行

| # | 用例 | 期望 | 实际 | 结果 |
|---|---|---|---|---|
| R2-M1 | 一键登录族员 | 跳 /user-center/profile，role=EDITOR | ✅ 落到 /user-center/profile | ✅ PASS |
| R2-M2 | Profile 个人资料 | 看到昵称/手机号/邮箱/性别等表单 | 头像上传 + 8 字段 + "前往维护" 家庭关系 | ✅ PASS |
| R2-M3 | Videos 我的音像墙 | 空态 + "生成第一个视频" CTA | "暂无音像墙视频" + CTA 按钮 | ✅ PASS |
| R2-M4 | Toolbox 我的工具箱 | 14 个 AI 工具卡片 | 14 cards，老照片修复/AI上色/AI扩图... | ✅ PASS |
| R2-M5 | Buddies 寻找儿时伙伴 | 童年地点 + 时间段筛选 | 完整匹配表单 + "暂无结果" 引导 | ✅ PASS |
| R2-M6 | Family-relation 家庭关系维护 | 3 类变更选项 | 婚姻 / 子女 / 配偶 三个 CTA | ✅ PASS |
| R2-M7 | Groups 我的小组 | 列表 + 创建小组 | "暂未加入任何小组" + 创建 CTA | ✅ PASS |
| R2-M8 | Settings 设置 | 隐私 / 通知 / 账号安全 | 4 隐私开关 + 2 通知开关 + 修改密码/绑定/注销 | ✅ PASS-WITH-FINDING |

## P2 退出登录按钮复测（2026-08-01 修正）

> 原报告将 P2 判定为"仍然存在（设计取舍）"实属**误判**。
> 经核对源码 + 真实浏览器验证，"退出登录"按钮**已经实现**，
> 只是位置在 Layout 顶部用户头像下拉菜单中，而非 SettingsPage 内。

| 位置 | 实现状态 | 引用 |
|---|---|---|
| `apps/web/src/layouts/UserCenterLayout.vue` 行 571-576 | ✅ 已实现 | `<ElDropdownItem divided @click="handleLogout">退出登录</ElDropdownItem>` |
| `handleLogout` 函数（行 154-157） | ✅ 已实现 | `userStore.reset() + authStore.logout()` |
| `SettingsPage.vue` 设置页 | ✅ 保留"注销账号" | 强删除意图，不混入"退出登录" |

**结论**：P2 不再是 finding，按钮位置设计合理（顶部下拉 vs 设置页底部是常见 UX 模式）。
详细验证见 R2-P2-fix 章节。

## API 调用快照

```
POST /api/auth/demo-member-login      201  (R2 入场)
GET  /api/auth/me/demo-person         200  (Profile 隐式)
GET  /api/user/videos                 200  (Videos)
GET  /api/user/toolbox                200  (Toolbox)
GET  /api/user/buddies                200  (Buddies)
GET  /api/user/family-relation        200  (Family-relation)
GET  /api/user/groups                 200  (Groups)
GET  /api/user/settings               200  (Settings)
```

## 控制台错误

- 0 error / 0 warn（全程）

## 总结

- 通过：**8 / 8** 关键页面
- 失败：0
- 阻塞：否
- ~~P2 长期 UX 待办~~ → **已实现**（见上方 P2 复测章节）

## 备注

- R2 仅测核心 8 个页面（覆盖 03-member-test-cases.md 中的标号 §0-§8 + 部分 §9-§18）。
- 族员无法访问 /zupu/* 家族后台（被路由守卫拦截，已在 R3 验证）。
- 族员可以访问 /user-center/* 下所有 25+ 子路由（按需展开）。

## 下一步

1. 可选：补全 36 个未深入用户中心子页面（按需）
2. 转入 R3 跨角色权限矩阵 ✔
3. ~~补做 P2 退出登录按钮~~ → 已通过源码核查确认实现 ✔
