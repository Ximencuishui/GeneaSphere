# Round 0 — Smoke 真实测试结果

> 测试时间：2026-08-01  
> 测试执行：Qoder AI Agent  
> 测试角色：smoke（不区分角色）

## 环境

| 项 | 状态 | 备注 |
|---|---|---|
| 前端 5173 | ✅ UP | `VITE v5.4.21 ready` |
| 后端 3101 | ✅ UP | `🚀 寻根路后端启动` |
| 数据库隧道 | ✅ UP | `127.0.0.1:15432` 透过 SSH 隧道可达 |
| demo-login | ✅ 201 | `POST /api/auth/demo-login` |
| demo-member-login | ✅ 201 | `POST /api/auth/demo-member-login` |

## 用例执行

| # | 用例 | 期望 | 实际 | 截图 | 结果 |
|---|---|---|---|---|---|
| R0-S1 | 访问登录页看到 2 个演示按钮 | ✅ | ✅ 看到两个按钮 | round0/round0-login-page.png | ✅ PASS |
| R0-S2 | 管理员一键登录跳转族谱后台 | ✅ | ⚠️ 跳 `/clans` 不是 `/zupu/zhuxi-demo/dashboard`（见发现1） | round0/round0-login-admin-success.png | ⚠️ PASS-WITH-FINDING |
| R0-S3 | 族员一键登录跳转用户中心 | ✅ | ✅ 跳 `/user-center/profile`，显示朱小小资料 | round0/round0-login-member-success.png | ✅ PASS |
| R0-S4 | 退出登录后 localStorage 三键全清 | ✅ | ✅ evaluate_script 清零验证 | —— | ⚠️ BY-EVAL（无 UI 退出按钮）|
| R0-S5 | 未登录访问受保护路由跳 /login | ✅ | ❌ 跳 `/platform-admin/members`，页面空白（见发现2）| round0/round0-anon-redirect.png | ❌ FAIL |

## 总结

- 通过：2 ✅ + 2 ⚠️ / 5
- 失败：1 ❌
- 是否阻塞：❌ 部分功能不阻塞，但 R0-S5 是边界核心，必须修复

---

## 🔍 重要发现（必须跟进）

### 发现 1：管理员演示登录的跳转路径

- **期望**：`/zupu/zhuxi-demo/dashboard`（家族管理后台）
- **实际**：`/clans`（家族列表/选择页）
- **原因**（根据 `apps/web/src/views/LoginView.vue` 中 `handleAdminDemoLogin`）：
  ```js
  if (demoClanSlug) {
    router.push(`/zupu/${demoClanSlug}`)  // 应走这里
  } else if (demoClanId) {
    router.push(`/tree/${demoClanId}`)
  } else {
    router.push('/clans')                  // 实际走到了 fallback
  }
  ```
- **可能原因**：后端 `demoLoginInternal()` 返回的 `demoClanSlug` 在该次响应中为 `null`（或前端的 `demoClanSlug` 字段未正确解析）
- **截图**：`round0/round0-login-admin-success.png`（显示家族管理列表，朱熹族谱卡片可见）
- **影响**：用户从营销页或登录页一键进入管理员视角，落到家族列表而非后台 dashboard。**需要 patch 前端跳转逻辑或后端返回字段**。

### 发现 2：未登录访问 `/admin/*` 的路由行为不符合预期

- **期望**：未登录访问 `/admin/members` → 跳 `/login`
- **实际**：未登录访问 `/admin/members` → 跳 `/platform-admin/members`（页面空白）
- **原因**（根据 `apps/web/src/router/index.ts` 中的"兼容旧链接"逻辑）：
  ```ts
  path: '/admin/:restPath(.*)*',
  redirect: (to) => {
    const familyToken = localStorage.getItem(TOKEN_KEY)
    if (familyToken) return { path: '/select-family' }
    return { ... }  // 重定向到 /platform-admin/<restPath>
  }
  ```
- **结果**：URL 变成 `/platform-admin/members`，但 `/platform-admin/members` 没有对应的子路由组件 → Vue RouterView 渲染空白
- **截图**：`round0/round0-anon-redirect.png`（显示空白页 + 背景音乐按钮）
- **影响**：用户在浏览器地址栏输入 `/admin/members` 时，看到的是无内容的"白屏"而不是登录页引导。**路由守卫或兼容链接的优先级逻辑需要调整**。
- **建议修复**：把"无 token 时跳 /login"提到 `/admin/*` redirect 之前；或者在 `/platform-admin/*` 子路由增加通配 catch-all 跳 /login。

### 发现 3：用户中心（族员视角）没有"退出"按钮

- **现象**：`/user-center/*` 页面所有侧边栏和设置页面都没有"退出登录"按钮
- **位置**：设置页面有"注销账号"（强删除），但没有"退出"（保留数据、仅清 token）
- **影响**：当前测试只能用 `evaluate_script` 模拟退出。真实用户必须等 token 60 分钟过期或关闭浏览器。
- **截图证据**：`round0/round0-user-center-sidebar.png`
- **建议修复**：在侧边栏底部加"退出登录"按钮（仅清 token，不删数据），符合"演示账号双入口"统一交互预期。

---

## API 调用快照

```
POST /api/auth/demo-login          201 (r0-s2)
GET  /api/clans                   304 (r0-s2 跳转后)
POST /api/auth/demo-member-login  201 (r0-s3)
GET  /api/auth/me/demo-person     200 (r0-s3 隐式)
GET  /                          多项静态资源 (r0-s1)
GET  /admin/members               200 → redirect → /platform-admin/members
```

## 控制台错误

- r0-s1: 0 error
- r0-s2: 0 error / 0 warn
- r0-s3: 0 error / 0 warn
- r0-s4: 0 error / 0 warn
- r0-s5: 0 error / 0 warn（页面空白但无 JS 异常）

---

## ✅ PASS 项详细记录

### R0-S1 登录页 UI（PASS）
- **API**：`/` 静态加载
- **UI**：登录页含两个一键按钮 + 表单 + 法务链接
- **截图**：`round0/round0-login-page.png`

### R0-S2 管理员一键登录（PASS-WITH-FINDING）
- **API**：`POST /api/auth/demo-login` → 201
- **JWT**：`role: EDITOR, phone: 13800000000, sub: f7796899-aedc-4282-a881-91b0b601b895, exp: 2026-08-01T04:28:52Z`（60min 后过期，符合设计）
- **跳转**：`/clans`（fallback 路径，而非预期的 `/zupu/zhuxi-demo/dashboard`）
- **localStorage**：`geneasphere_token` 已写入
- **截图**：`round0/round0-login-admin-success.png`

### R0-S3 族员一键登录（PASS）
- **API**：`POST /api/auth/demo-member-login` → 201
- **跳转**：`/user-center/profile` ✅
- **页面**：显示"演示族员·朱小小"完整资料（昵称、手机号、邮箱、性别、家族）
- **截图**：`round0/round0-login-member-success.png`

### R0-S4 退出登录（BY-EVAL）
- **方法**：`evaluate_script` 清三个 key
- **验证结果**：
  ```
  before: { token: '...', slug: 'zhuxi-demo', name: null }
  after:  { token: null, slug: null, name: null }
  ```
- **截图**：无（用评估脚本来验证）

### R0-S5 受保护路由守卫（FAIL）
- **期望**：跳 `/login`
- **实际**：跳 `/platform-admin/members`，页面空白
- **截图**：`round0/round0-anon-redirect.png`
- **状态**：❌ 需修复路由逻辑

---

## 下一步建议

1. **优先级 P0**：修复 R0-S5 路由守卫（空白页面 UX 灾难）
2. **优先级 P1**：调试 R0-S2 管理员跳转路径，确认 demoClanSlug 是否被前端正确解析
3. **优先级 P2**：补充族员侧栏退出按钮
4. **修复后**：重新跑 Round 0 验证，然后启动 R1/R2/R3 完整轮次
