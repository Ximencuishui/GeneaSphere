# 04 — 跨角色权限边界测试用例

> **目的**：验证角色权限隔离、路由守卫、JWT 鉴权、状态污染防御  
> **测试入口**：每轮测试前**先清空** localStorage（包括 token、demo_clan_slug、demo_clan_name）  
> **通过判定**：必须**未授权访问被拦截**且**未发生数据泄露**

---

## 一、核心边界矩阵（待验证矩阵）

| # | 当前状态 | 访问路径 | 期望 |
|---|---|---|---|
| B1 | 未登录 | `/zupu/zhuxi-demo/dashboard` | 跳 `/login` |
| B2 | 未登录 | `/admin/members` | 跳 `/login` |
| B3 | 未登录 | `/user-center/profile` | 跳 `/login` |
| B4 | 未登录 | `/platform-admin/families` | 跳 `/login` |
| B5 | 管理员 token | `/user-center/profile` | 跳 `/admin` 或降级渲染 |
| B6 | 管理员 token | `/platform-admin/families` | 403（无平台运营权限） |
| B7 | 族员 token | `/admin/members` | 跳 `/login` 或 403 toast |
| B8 | 族员 token | `/platform-admin/families` | 跳 `/login` |
| B9 | 族员 token | `/admin/migration` | 403 |
| B10 | 族员 token | `/admin/import` | 403 |
| B11 | 管理员 token | `/user-center/albums` | 跳 `/admin`（个人视角非管理员入口） |
| B12 | 任意 | `GET /api/admin/members` 缺 token | 401 |
| B13 | 族员 token | `GET /api/admin/members` | 403 |
| B14 | 任意 token | `GET /api/platform/families` | 403（演示无平台账号） |
| B15 | EDITOR token | 携带管理员路由点链接（防 CSRF / 非授权跳转） | 拒绝 |
| B16 | 退出登录后 | localStorage 不残留 token | 验证 localStorage |
| B17 | 同一 browser | 切换 token 登录 | 旧 token 完全失效 |
| B18 | Token 过期 | 任何受保护接口 | 401 + 跳 `/login` |
| B19 | 同一 URL | tabA 登出，tabB 操作 | tabB 后端接口 401 |

---

## 二、用例详情

### §B1 — 未登录访问家族后台

**前置**：完全清空 localStorage

**步骤**：

1. `evaluate_script` 清状态 → 验证 `localStorage.length === 0`
2. `navigate_page` → `/zupu/zhuxi-demo/dashboard`
3. `wait_for` 至少 2 秒
4. `evaluate_script` 读 `location.href`
5. 截图 `round3-b1-redirect.png`

**断言**：

- 跳转 URL 含 `/login`
- 可选：URL 含 `?redirect=/zupu/zhuxi-demo/dashboard`
- 控制台无 error

**通过**：✅ 重定向到 `/login`

### §B2 — 未登录访问 /admin/members

**步骤**：

1. 清状态
2. `navigate_page` → `/admin/members`
3. 等待
4. 截图 `round3-b2-admin-redirect.png`

**断言**：

- 跳 `/login`

### §B3 — 未登录访问 /user-center/profile

**步骤**：

1. 清状态
2. `navigate_page` → `/user-center/profile`
3. 截图 `round3-b3-uc-redirect.png`

**断言**：

- 跳 `/login`

### §B5 — 管理员 token 访问 /user-center/profile

**前置**：先以管理员身份登录

**步骤**：

1. 登录管理员（保留 token）
2. `navigate_page` → `/user-center/profile`
3. 截图 `round3-b5-admin-on-member-route.png`

**断言**（这是设计性判断 —— 取决于产品决策）：

- **场景 A**：路由识别"管理员无个人 Person 数据"，降级重定向到 `/admin/dashboard`
- **场景 B**：访问后看到一个提示"个人中心仅对族员可用"，附带"切换账号"按钮
- 数据安全：`GET /api/auth/me/demo-person` 调用 → 应返回 `{ person: null }`

**通过**：✅ 不应崩、不应误显示 demo-person 数据

### §B6 — 管理员 token 访问 /platform-admin/families

**前置**：管理员已登录

**步骤**：

1. `navigate_page` → `/platform-admin/families`
2. `wait_for` 加载
3. 截图 `round3-b6-platform.png`

**断言**：

- **当前演示数据**：手机号 13800000000 **没有平台管理员绑定**，应看不到完整列表
- 顶部应有"无权限"提示
- API：`GET /api/platform/families` 应返回 403

### §B7 — 族员 token 访问 /admin/members

**前置**：先以族员身份登录

**步骤**：

1. 登录族员
2. `navigate_page` → `/admin/members`
3. `wait_for` 加载
4. 截图 `round3-b7-member-on-admin.png`

**断言**：

- UI 应展示 401/403 页面 或 redirect 到 `/user-center/...`
- 关键：不应**真实**渲染出成员列表
- `list_network_requests` 应能看到 `GET /api/admin/members` 返回 403，或根本未发起该调用（被前端守卫拦截）

**通过**：✅ 拒绝访问

### §B9 — 族员 token 访问 /admin/migration

**步骤**：

1. 族员已登录
2. `navigate_page` → `/admin/migration`
3. 截图 `round3-b9-member-migration.png`

**断言**：同上，应被拦截

### §B11 — 管理员 token 访问 /user-center/albums

**步骤**：

1. 管理员已登录
2. `navigate_page` → `/user-center/albums`
3. 截图 `round3-b11-admin-albums.png`

**断言**：根据产品设计可能跳回 `/admin` 或显示"管理员无可用个人相册"

### §B12 — API 缺 token 拒绝

**步骤**：

1. 清空 token
2. `evaluate_script` 执行：
   ```js
   async () => {
     const r = await fetch('/api/admin/members');
     return { status: r.status, body: await r.text() };
   }
   ```
3. 截图 `round3-b12-api-no-token.png`（控制台）

**断言**：

- status 401
- body 含 "Unauthorized"

### §B13 — 族员 token 调用 /api/admin/members

**步骤**：

1. 族员登录
2. `evaluate_script`：
   ```js
   async () => {
     const r = await fetch('/api/admin/members', {
       headers: {Authorization: 'Bearer ' + localStorage.getItem('geneasphere_token')}
     });
     return { status: r.status, body: await r.text() };
   }
   ```
3. 截图

**断言**：

- status 403

### §B14 — 演示账号无平台权限

**步骤**：

1. 任意演示账号已登录
2. `evaluate_script`：
   ```js
   async () => {
     const r = await fetch('/api/platform/families', {
       headers: {Authorization: 'Bearer ' + localStorage.getItem('geneasphere_token')}
     });
     return { status: r.status };
   }
   ```
3. 截图

**断言**：

- status 403（演示数据无平台管理员绑定）

### §B16 — 退出后 localStorage 不残留

**步骤**：

1. 任意角色登录
2. `take_snapshot` 找到用户菜单 / 退出按钮
3. `click` 退出
4. `evaluate_script`：
   ```js
   () => ({
     token: localStorage.getItem('geneasphere_token'),
     slug: localStorage.getItem('demo_clan_slug'),
     name: localStorage.getItem('demo_clan_name')
   })
   ```
5. 截图 `round3-b16-after-logout.png`

**断言**：

- 三个 key 全部 `null`
- URL 跳 `/login`

### §B17 — 切换 token 登录

**步骤**：

1. 登录管理员（保留状态）
2. `evaluate_script` 记录当前 token（`token_A`）
3. 退出登录 → localStorage 清空
4. 登录族员
5. `evaluate_script` 记录当前 token（`token_B`）
6. 截图 `round3-b17-token-swap.png`

**断言**：

- `token_A !== token_B`
- 角色匹配当前登录
- 之前 token_A 调用任何受保护接口应 401

### §B18 — Token 过期场景

**手动模拟过期**：

**步骤**：

1. 登录管理员
2. `evaluate_script` 改写 token 末尾 3 字符为 `XXX`
3. 等待下一次 API 调用
4. `take_snapshot` 看是否跳 `/login`
5. 截图 `round3-b18-token-expired.png`

**断言**：

- 受保护接口返回 401
- 全局 axios 拦截器检测 401 → 自动清 localStorage + 跳 `/login`

### §B19 — 多 Tab 干扰

**步骤**：

1. 打开两个 tab（或用 `evaluate_script` 模拟）
2. tabA 登录管理员，tabB 保持未登录
3. tabB 尝试访问 `/admin/members`
4. 截图两个 tab

**断言**：

- 每个 tab 状态独立，互不污染
- 没有共享 localStorage 跨 tab 的隔离漏洞

---

## 三、CSRF / 钓鱼场景

### §B20 — Referer 验证（API 层）

**步骤**：

1. 起一个静态 HTML 在 `file:///` 上，含伪造表单 fetch
2. 携带当前 token 自动提交到 `/api/tree/person` (POST)
3. 观察是否成功

**断言**：

- 应被 CORS / CSRF 拦截
- 这是基础 CORS 检查，期望 OPTIONS 预检失败

### §B21 — 篡改 demo_clan_slug

**步骤**：

1. 登录管理员（own zupu/zhuxi-demo）
2. `evaluate_script` 改 `localStorage.setItem('demo_clan_slug', 'some-other-slug')`
3. `navigate_page` → `/zupu/some-other-slug/dashboard`
4. 截图 `round3-b21-spoofed-slug.png`

**断言**：

- 后端校验 token → user 的 clan 列表，slug 不匹配时应 403
- 不应展示 any 数据

---

## 四、API 限流 / 锁定

### §B22 — 登录失败 5 次锁定

**前置**：退出登录 → 清状态

**步骤**：

1. 用错误密码连发 5 次 `POST /api/auth/login`
2. 第 6 次无论正确密码都返回 401
3. 控制台查看错误消息
4. 截图 `round3-b22-lockout.png`

**断言**：

- 第 5 次后接口返回锁定信息（包含"锁定"或 "locked"）
- 数据库 `login_attempts` 表对应 subject_key 计数
- 失败 60s 内不接受新登录尝试（演示数据可能更短）

**清理**：

```sql
DELETE FROM login_attempts WHERE subject_key = '13800000000';
```

> 来自 `scripts/verify-admin-v1.mjs` 已验证此逻辑

---

## 五、安全 Headers

### §B23 — HTTP Response Headers

**步骤**：

1. `evaluate_script`：
   ```js
   async () => {
     const r = await fetch('/');
     const h = {};
     r.headers.forEach((v, k) => h[k] = v);
     return h;
   }
   ```
2. 截图（控制台输出）

**断言**：应存在（来自 `apps/server/src/common/security-headers.middleware.ts`）：

- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`

---

## 六、总结

**全部用例通过条件**：

- 上述 23 个边界用例 + 18 项 API 验证全部 PASS
- **不存在"族员 token 看到管理员数据"或"未登录看到受保护页面"**
- 退出登录后 localStorage 三键全清
- 多 tab 状态独立
- 锁定逻辑正确触发

**报告字段**：每条用例单独记录 PASS / FAIL，FAIL 必须附：
- 实际响应截图
- 控制台 error 文本
- 复现步骤
- 涉及模块

报告存档：`tests/e2e/reports/round3-actual.md`
