# Round 0 — 冒烟（Smoke）测试报告

> 测试时间：2026-08-01 22:30 CST
> 测试环境：本地前端 5173 + 后端 3101 + 数据库 15432
> 浏览器：Chromium（Playwright via browser-use MCP）

## 0. 前置健康检查

| 检查项 | 实测 | 期望 | 状态 |
|--------|------|------|------|
| 前端 5173 | HTTP 200 | 200 | ✅ |
| 后端 /api/health/ready | HTTP 200 | 200 | ✅ |
| 后端 /api/auth/demo-login | HTTP 201 | 201 | ✅ |
| 数据库 SSH 隧道 | 15432 TCP 通 | UP | ✅ |
| Token 长度 | 237 bytes (admin) / 239 (member) | 有效 | ✅ |

## 1. 用例明细

### 0.1 登录页 UI 验证
- **步骤**：`navigate_page(http://localhost:5173/login)` → `take_snapshot`
- **实际**：标题"登录寻根路"+ 两个 Tab + 表单 + **2 个一键演示按钮**（▶ 族谱管理 / ● 族员个人页面）+ 注册链接 + 返回首页链接
- **截图**：`round0-01-login-page.png`
- **结果**：✅ PASS

### 0.2 一键登录管理员（OWNER）
- **步骤**：点击 `uid=1_11` ▶ 一键体验族谱管理演示
- **API**：`POST /api/auth/demo-login` → 201
- **localStorage**：`geneasphere_token` (237 bytes), `demo_clan_slug=zhuxi-demo`
- **JWT payload**：`{role: "OWNER", sub: "f7796899-aedc-4282-a881-91b0b6..."}`
- **跳转**：`/zupu/zhuxi-demo`
- **控制台错误**：无
- **截图**：`round0-02-admin-dashboard.png`
- **结果**：✅ PASS

### 0.3 一键登录族员（EDITOR）
- **步骤**：清空 localStorage → 点击 `uid=4_12` ● 一键体验族员个人页面
- **API**：`POST /api/auth/demo-member-login` → 201
- **localStorage**：`geneasphere_token` (239 bytes), `demo_clan_slug=zhuxi-demo`
- **JWT payload**：`{role: "EDITOR", sub: "b6e6ada5-3161-4817-9c25-ed3d8a9d7dd1"}`
- **跳转**：`/user-center/profile`
- **页面元素**：个人资料卡片 / 头像 / 昵称"演示族员·朱小小" / 手机号 138****0001 / 邮箱 / 性别 / 所属家族"朱熹族谱（演示）" / 保存修改 / 修改密码
- **控制台错误**：无
- **截图**：`round0-03-member-profile.png`
- **结果**：✅ PASS

### 0.4 退出登录
- **步骤**：在个人资料页点击 `uid=6_4` 退出登录按钮
- **API**：前端仅清状态（无 logout 接口调用，依赖 token 过期）
- **localStorage**：清空 (`{ ls: [], ss: [], tokenLen: 0 }`)
- **跳转**：`/login`
- **结果**：✅ PASS

### 0.5 路由守卫（无 token 直接访问受保护路由）
- **步骤**：`localStorage.clear()` → `navigate_page(/zupu/zhuxi-demo/dashboard)`
- **实际**：URL 仍停留在 `/zupu/zhuxi-demo/dashboard`，**未自动跳 /login**，页面 DOM 完全空白
- **期望**：应自动跳 `/login`
- **结果**：⚠️ FAIL（守卫未生效，需检查 AdminLayout 的 beforeEach；这与之前的回归报告结论不一致 —— 可能是 dashboard 子路由无守卫、依赖父级 AdminLayout 的 mount/unmount）
- **截图**：`round0-04b-guard-reload.png`

> ⚠️ **疑似问题**：AdminLayout.vue 的 `onMounted` 中可能未检查 token；或 vue-router 的 beforeEach 守卫只对 layout 入口生效，未对深层子路由生效。
> 后续 Round 3 跨角色测试将深入检查。

## 2. Round 0 总结

| PASS | FAIL | SKIP | 总计 |
|------|------|------|------|
| 4    | 1    | 0    | 5    |

- 80% 通过率
- 一键演示登录两个角色功能完好
- 发现 1 个潜在路由守卫缺陷，待 Round 3 进一步验证
