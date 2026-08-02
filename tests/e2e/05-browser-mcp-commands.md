# 05 — Browser MCP 调用命令清单（可直接复用）

> **目标**：把所有测试用例转译为具体的 `mcp_browser_*` 调用序列  
> **执行者**：Qoder AI Agent 通过 `CallMcpTool` 调用 `browser-use` 服务器  
> **格式约定**：每个用例用编号块给出，主调用与断言调用分开

---

## §0 前置公共服务

### 工具映射

| Browser MCP 工具 | 用途 |
|---|---|
| `mcp__browser-use__list_pages` | 列出浏览器页面 |
| `mcp__browser-use__navigate_page` | 访问 URL |
| `mcp__browser-use__take_snapshot` | 取 a11y 树（含 uid） |
| `mcp__browser-use__click` | 点击元素 |
| `mcp__browser-use__fill` | 填值 |
| `mcp__browser-use__press_key` | 按键 |
| `mcp__browser-use__wait_for` | 等待文本出现 |
| `mcp__browser-use__take_screenshot` | 截图 |
| `mcp__browser-use__list_network_requests` | 列出网络请求 |
| `mcp__browser-use__list_console_messages` | 列出控制台 |
| `mcp__browser-use__evaluate_script` | 执行 JS |
| `mcp__browser-use__handle_dialog` | 处理 confirm/alert |

### 默认参数说明

- `navigate_page.timeout`: `{ value: 30, unit: 's' }`
- `wait_for.timeout`: `{ value: 15, unit: 's' }`（首屏长渲染可调 30s）
- `take_screenshot.fullPage`: `true`（捕获完整滚动）
- `take_screenshot.format`: `'png'`
- `take_screenshot.filePath`: 绝对路径 `e:\GeneaSphere\tests\e2e\screenshots\{name}.png`

---

## §1 Round 0 — 冒烟测试（5 个用例，可一次性执行）

### 用例 R0-S1：访问登录页

```python
# 主调用序列（Qoder AI 风格）

# 1. 清理状态
mcp__browser-use__evaluate_script(function="""
() => {
  const keys = ['geneasphere_token','demo_clan_slug','demo_clan_name'];
  keys.forEach(k => localStorage.removeItem(k));
  return { remaining: keys.map(k => ({k, v: localStorage.getItem(k)})) };
}
""")

# 2. 列出页面，确认有可用 page
mcp__browser-use__list_pages()

# 3. 访问登录页（首次 select_page 后）
mcp__browser-use__navigate_page(url="http://localhost:5173/login")
mcp__browser-use__wait_for(text="一键体验", timeout={value: 15, unit: 's'})

# 4. 截图登录页（含 2 个一键按钮）
mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r0-login-page.png",
  fullPage=True
)

# 5. 取 a11y 树查两个按钮 uid
mcp__browser-use__take_snapshot()
# 期望输出含：
#   element uid="<admin-uid>" name="一键体验族谱管理演示"
#   element uid="<member-uid>" name="一键体验族员个人页面"

# 6. 网络请求校验（应空 —— 登录页是纯静态）
mcp__browser-use__list_network_requests(resourceTypes=["xhr","fetch"])
mcp__browser-use__list_console_messages(types=["error","warn"])
```

### 用例 R0-S2：管理员一键登录 → 跳转族谱后台

```python
# 接续 S1，从 take_snapshot 拿到的 uid 替换下面的 <admin-uid>

mcp__browser-use__click(uid="<admin-uid>")
mcp__browser-use__wait_for(text="朱熹族谱（演示）", timeout={value: 15, unit: 's'})
# 备选：wait_for("族谱管理")

# 网络断言
mcp__browser-use__list_network_requests(resourceTypes=["xhr","fetch"])
# 校验：POST /api/auth/demo-login → 201（演示账号创建返回 201 Created）
#       GET /api/tree/clan/zhuxi-demo/full → 200

# 取 URL
mcp__browser-use__evaluate_script(function="() => ({url: location.href, title: document.title})")

# 截图跳转后页面
mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r0-login-admin-success.png",
  fullPage=True
)

# 控制台断言
mcp__browser-use__list_console_messages(types=["error"])
```

### 用例 R0-S3：族员一键登录 → 跳转用户中心

```python
# 1. 退出当前 token
mcp__browser-use__evaluate_script(function="""
() => {
  const keys = ['geneasphere_token','demo_clan_slug','demo_clan_name'];
  keys.forEach(k => localStorage.removeItem(k));
}
""")

# 2. 跳登录页（清 query string）
mcp__browser-use__navigate_page(url="http://localhost:5173/login")

# 3. 取 snapshot 拿 uid
mcp__browser-use__take_snapshot()

# 4. 点击 "一键体验族员个人页面"
mcp__browser-use__click(uid="<member-uid>")
mcp__browser-use__wait_for(text="朱小小", timeout={value: 15, unit: 's'})

# 5. 截图 + 网络断言
mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r0-login-member-success.png",
  fullPage=True
)
mcp__browser-use__list_network_requests(resourceTypes=["xhr","fetch"])
# 校验：POST /api/auth/demo-member-login → 200
```

### 用例 R0-S4：退出登录 → 清 localStorage

```python
# 1. 在成员页面，找顶部头像菜单
mcp__browser-use__take_snapshot()
# 找 uid_of_user_avatar_dropdown

mcp__browser-use__click(uid="<avatar-menu-uid>")
mcp__browser-use__wait_for(text="退出")
mcp__browser-use__take_snapshot()
# 找 uid_of_logout_button

mcp__browser-use__click(uid="<logout-button-uid>")
mcp__browser-use__wait_for(text="登录")

# 2. 验证 localStorage 清空
mcp__browser-use__evaluate_script(function="""
() => ({
  token: localStorage.getItem('geneasphere_token'),
  slug: localStorage.getItem('demo_clan_slug'),
  name: localStorage.getItem('demo_clan_name')
})
""")

mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r0-after-logout.png",
  fullPage=True
)
```

### 用例 R0-S5：未登录访问受保护路由

```python
# 1. 确认 localStorage 已空（接 S4）
mcp__browser-use__navigate_page(url="http://localhost:5173/admin/members")
mcp__browser-use__wait_for(text="登录", timeout={value: 10, unit: 's'})

mcp__browser-use__evaluate_script(function="() => location.href")

mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r0-anon-redirect.png",
  fullPage=True
)
```

---

## §2 Round 1 — 管理员主流程（精选高价值用例）

### 用例 R1-A1：族谱树加载

```python
mcp__browser-use__evaluate_script(function="""
() => {
  const keys = ['geneasphere_token','demo_clan_slug','demo_clan_name'];
  keys.forEach(k => localStorage.removeItem(k));
}
""")

# 重登管理员
mcp__browser-use__navigate_page(url="http://localhost:5173/login")
mcp__browser-use__take_snapshot()
mcp__browser-use__click(uid="<admin-login-btn-uid>")
mcp__browser-use__wait_for(text="朱熹族谱（演示）")

# 关键：等长渲染
mcp__browser-use__wait_for(text="加载", timeout={value: 8, unit: 's'})
# 如果有进度条，等"加载"消失或看到 canvas/svg
mcp__browser-use__wait_for(text="操作", timeout={value: 30, unit: 's'})

# 性能打点
mcp__browser-use__evaluate_script(function="""
() => {
  const t = performance.timing;
  return {
    domReady: t.domContentLoadedEventEnd - t.navigationStart,
    load: t.loadEventEnd - t.navigationStart,
    firstPaint: performance.getEntriesByType('paint')[0]?.startTime
  };
}
""")

mcp__browser-use__take_snapshot()
mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r1-tree-load.png",
  fullPage=True
)

mcp__browser-use__list_network_requests(resourceTypes=["fetch"])
# 校验：GET /api/tree/clan/zhuxi-demo/full 200，personCount >= 1000
```

### 用例 R1-A2：管理员创建 Person

```python
# 在树页面上
mcp__browser-use__take_snapshot()
# 找 "新增人物" 或 Toolbar 按钮 → uid_toolbar_add_person

mcp__browser-use__click(uid="<toolbar-add-person-uid>")
mcp__browser-use__wait_for(text="新增人物", timeout={value: 5, unit: 's'})
mcp__browser-use__take_snapshot()

# 填字段（uid_from_snapshot）
mcp__browser-use__fill(uid="<name-input-uid>", value="赵测试")
mcp__browser-use__fill(uid="<gender-input-uid>", value="男")
mcp__browser-use__fill(uid="<birth-year-uid>", value="1990")
mcp__browser-use__fill(uid="<birth-place-uid>", value="测试地点")

# 提交
mcp__browser-use__take_snapshot()
# 找 submit uid
mcp__browser-use__click(uid="<submit-btn-uid>")
mcp__browser-use__wait_for(text="成功", timeout={value: 8, unit: 's'})

# 网络断言
mcp__browser-use__list_network_requests(resourceTypes=["fetch"])
# POST /api/tree/person → 201

mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r1-person-create.png",
  fullPage=True
)
```

### 用例 R1-B1：管理员 / 媒体审核通过

```python
mcp__browser-use__navigate_page(url="http://localhost:5173/admin/media-review")
mcp__browser-use__wait_for(text="待审", timeout={value: 8, unit: 's'})
mcp__browser-use__take_snapshot()

# 找第一个 approve 按钮
mcp__browser-use__click(uid="<approve-btn-uid>")
mcp__browser-use__handle_dialog(action="accept")  # 弹出 confirm
mcp__browser-use__wait_for(text="成功", timeout={value: 5, unit: 's'})

mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r1-media-approve.png",
  fullPage=True
)

mcp__browser-use__list_network_requests(resourceTypes=["fetch"])
# POST /api/admin/reviews/media/:id/approve → 200
```

---

## §3 Round 2 — 族员主流程（精选高价值用例）

### 用例 R2-M1：族员一键登录 + 直接血脉子树

```python
# 1. 清空 + 登录
mcp__browser-use__evaluate_script(function="""
() => {
  const keys = ['geneasphere_token','demo_clan_slug','demo_clan_name'];
  keys.forEach(k => localStorage.removeItem(k));
}
""")
mcp__browser-use__navigate_page(url="http://localhost:5173/login")
mcp__browser-use__take_snapshot()
mcp__browser-use__click(uid="<member-login-btn-uid>")
mcp__browser-use__wait_for(text="朱小小", timeout={value: 15, unit: 's'})

mcp__browser-use__evaluate_script(function="() => location.href")
# 期望：/user-center/profile

# 2. 跳到家族子树页
mcp__browser-use__navigate_page(url="http://localhost:5173/user-center/families")
mcp__browser-use__wait_for(text="朱小小", timeout={value: 15, unit: 's'})
mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r2-subtree.png",
  fullPage=True
)

# 3. 验证子树人数 < 全树
mcp__browser-use__list_network_requests(resourceTypes=["fetch"])
# 应看到 GET /api/tree/subtree/:rootPersonId 200（人数远小于 1000）
```

### 用例 R2-M2：族员头像上传

```python
mcp__browser-use__navigate_page(url="http://localhost:5173/user-center/profile")
mcp__browser-use__wait_for(text="个人资料", timeout={value: 8, unit: 's'})
mcp__browser-use__take_snapshot()
# 找"上传头像"按钮 uid

mcp__browser-use__click(uid="<upload-avatar-uid>")
# 触发 file 选择对话框（mcp__browser-use__upload_file）
mcp__browser-use__upload_file(uid="<file-input-uid>", filePath="e:\\GeneaSphere\\tests\\e2e\\fixtures\\test-avatar.png")

mcp__browser-use__wait_for(text="成功", timeout={value: 30, unit: 's'})
mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r2-avatar-upload.png",
  fullPage=True
)
```

> 注：`upload_file` 是 Browser MCP 提供的另一种工具（不在我们已用工具列表内）。如果不支持，可用 `evaluate_script` 触发文件 input 并填值。

**备选方案**（无 upload_file 工具）：

```python
mcp__browser-use__evaluate_script(function="""
async (args) => {
  // 用 fetch 直接调用后端上传接口
  const resp = await fetch('/api/profile/avatar', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + localStorage.getItem('geneasphere_token')
    },
    body: JSON.stringify({avatarData: 'data:image/png;base64,...'})
  });
  return {status: resp.status};
}
""")
```

### 用例 R2-M3：族员创建家谱册

```python
mcp__browser-use__navigate_page(url="http://localhost:5173/user-center/family-book")
mcp__browser-use__wait_for(text="家谱册", timeout={value: 10, unit: 's'})
mcp__browser-use__take_snapshot()

mcp__browser-use__click(uid="<new-book-btn-uid>")
mcp__browser-use__wait_for(text="创建家谱册", timeout={value: 5, unit: 's'})
mcp__browser-use__take_snapshot()

mcp__browser-use__fill(uid="<book-title-uid>", value="测试家谱册")
# 风格选择（select）
mcp__browser-use__fill(uid="<book-style-uid>", value="古风")
# 提交
mcp__browser-use__click(uid="<book-submit-uid>")
mcp__browser-use__wait_for(text="成功", timeout={value: 15, unit: 's'})

mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r2-familybook-create.png",
  fullPage=True
)
```

---

## §4 Round 3 — 跨角色权限（精选高价值用例）

### 用例 R3-B7：族员访问 /admin/members 应被拒绝

```python
# 0. 前置：族员已登录
mcp__browser-use__navigate_page(url="http://localhost:5173/admin/members")
mcp__browser-use__wait_for(text="登录", timeout={value: 10, unit: 's'})
# 期望跳回 /login 或显示 403 页面

mcp__browser-use__evaluate_script(function="() => location.href")
mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r3-b7-member-on-admin.png",
  fullPage=True
)
```

### 用例 R3-B12：API 缺 token 拒绝

```python
# 1. 清 token
mcp__browser-use__evaluate_script(function="""
() => {
  localStorage.removeItem('geneasphere_token');
  return {ok: true};
}
""")

# 2. 直接调 API
mcp__browser-use__evaluate_script(function="""
async () => {
  const r = await fetch('/api/admin/members', {
    method: 'GET'
  });
  return {status: r.status, body: await r.text()};
}
""")

# 期望 status: 401
```

### 用例 R3-B13：族员 token 调 /api/admin/members 应被拒绝

```python
# 0. 前置：族员已登录
# 1. 用族员 token 调 API
mcp__browser-use__evaluate_script(function="""
async () => {
  const r = await fetch('/api/admin/members', {
    headers: {Authorization: 'Bearer ' + localStorage.getItem('geneasphere_token')}
  });
  return {status: r.status};
}
""")

# 期望 status: 403
```

### 用例 R3-B16：退出后 localStorage 清空

```python
# 0. 已登录管理员或族员
mcp__browser-use__take_snapshot()
# 找头像菜单 + 退出按钮
mcp__browser-use__click(uid="<avatar-menu-uid>")
mcp__browser-use__click(uid="<logout-btn-uid>")
mcp__browser-use__wait_for(text="登录", timeout={value: 8, unit: 's'})

# 验证 localStorage
mcp__browser-use__evaluate_script(function="""
() => ({
  token: localStorage.getItem('geneasphere_token'),
  slug: localStorage.getItem('demo_clan_slug'),
  name: localStorage.getItem('demo_clan_name')
})
""")
# 期望三个全 null

mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r3-b16-after-logout.png",
  fullPage=True
)
```

### 用例 R3-B21：篡改 demo_clan_slug

```python
# 0. 管理员已登录
# 1. 改 localStorage
mcp__browser-use__evaluate_script(function="""
() => {
  localStorage.setItem('demo_clan_slug', 'attacker-slug');
  return localStorage.getItem('demo_clan_slug');
}
""")

mcp__browser-use__navigate_page(url="http://localhost:5173/zupu/attacker-slug/dashboard")
mcp__browser-use__wait_for(text="加载", timeout={value: 8, unit: 's'})

# 验证 API 返回 403
mcp__browser-use__list_network_requests(resourceTypes=["fetch"])
mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r3-b21-spoofed-slug.png",
  fullPage=True
)
```

### 用例 R3-B22：登录失败 5 次锁定

```python
mcp__browser-use__evaluate_script(function="""
async () => {
  const results = [];
  for (let i = 0; i < 6; i++) {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({phone:'13800000000', password:'wrong-pwd-' + i})
    });
    results.push({i, status: r.status, body: await r.text()});
  }
  return results;
}
""")
# 期望：前 5 次 401，第 6 次 401 with message 包含 "锁定" / "locked"
```

> 注意：此用例已被 `scripts/verify-admin-v1.mjs` 验证。测试后清理：
> `DELETE FROM login_attempts WHERE subject_key = '13800000000';`

---

## §5 Round 4 — 性能与回归（精选高价值用例）

### 用例 R4-P1：1000 人 G6 渲染时长

```python
# 0. 管理员已登录
mcp__browser-use__navigate_page(url="http://localhost:5173/zupu/zhuxi-demo")
mcp__browser-use__wait_for(text="操作", timeout={value: 60, unit: 's'})

mcp__browser-use__evaluate_script(function="""
() => {
  const t = performance.timing;
  return {
    domReady: t.domContentLoadedEventEnd - t.navigationStart,
    load: t.loadEventEnd - t.navigationStart
  };
}
""")
# 期望 load < 3000ms（来自"长耗时渲染需添加分阶段进度条"规范）

mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r4-perf-tree.png",
  fullPage=True
)
```

### 用例 R4-P2：网络 502 错误处理

```python
# 1. 篡改 token 模拟过期
mcp__browser-use__evaluate_script(function="""
() => {
  const t = localStorage.getItem('geneasphere_token');
  localStorage.setItem('geneasphere_token', t.slice(0,-3) + 'XXX');
  return 'tampered';
}
""")

# 2. 触发任意 API 调用
mcp__browser-use__navigate_page(url="http://localhost:5173/zupu/zhuxi-demo")
mcp__browser-use__wait_for(text="登录", timeout={value: 10, unit: 's'})

mcp__browser-use__take_screenshot(
  filePath="e:\\GeneaSphere\\tests\\e2e\\screenshots\\r4-p2-expired-token.png",
  fullPage=True
)
```

### 用例 R4-P3：移动端 viewport

```python
mcp__browser-use__evaluate_script(function="""
() => {
  // 在实际 browser-use 中需通过 setup 参数设 viewport
  // 这里只读 currentWidth
  return {width: window.innerWidth, height: window.innerHeight};
}
""")
# 期望命中移动端响应式断点 < 768px 时的不同布局
```

---

## §6 辅助 / 工具脚本

### 状态清理器（一键调用）

```python
mcp__browser-use__evaluate_script(function="""
() => {
  const before = {token: localStorage.getItem('geneasphere_token')};
  const keys = ['geneasphere_token','demo_clan_slug','demo_clan_name'];
  keys.forEach(k => localStorage.removeItem(k));
  // 也清 session
  sessionStorage.clear();
  return {cleared: true, before};
}
""")
```

### 当前登录态快照（一键调用）

```python
mcp__browser-use__evaluate_script(function="""
() => {
  const t = localStorage.getItem('geneasphere_token');
  if (!t) return {logged: false};
  try {
    const payload = JSON.parse(atob(t.split('.')[1]));
    return {
      logged: true,
      phone: payload.phone,
      role: payload.role,
      exp: payload.exp,
      slug: localStorage.getItem('demo_clan_slug')
    };
  } catch (e) {
    return {logged: 'corrupted'};
  }
}
""")
```

### 网络监控过滤器

```python
# 仅看失败请求
mcp__browser-use__list_network_requests(resourceTypes=["xhr","fetch"])
# 用 evaluate_script 过滤 4xx/5xx
mcp__browser-use__evaluate_script(function="""
async () => {
  // 让浏览器脚本拦截 fetch 并收集
  if (window.__REQ_MON) return window.__REQ_MON;
  window.__REQ_MON = [];
  const origFetch = window.fetch;
  window.fetch = function(...args) {
    return origFetch.apply(this, args).then(r => {
      window.__REQ_MON.push({url: args[0], status: r.status, ts: Date.now()});
      return r;
    });
  };
  return 'monitor-installed';
}
""")
```

---

## §7 错误处理 / 轮次中断恢复

### 多 Tab 切换出错时

```python
# 列出现有 pages，重新选目标
mcp__browser-use__list_pages()
mcp__browser-use__select_page(pageIdx=<目标>)
```

### 浏览器卡死 / navigation timeout

```python
mcp__browser-use__navigate_page(url="about:blank")
# 等 2 秒
mcp__browser-use__evaluate_script(function="() => 'recovered'")
```

### 对话框未关闭

```python
mcp__browser-use__handle_dialog(action="dismiss")  # 或 accept
```

---

## §8 总结：本调用清单映射

| 调用清单章节 | 测试用例章节 | 角色 |
|---|---|---|
| §1 R0-S1..S5 | 02 §0, 03 §0 | 通用 |
| §2 R1-A1..A2 | 02 §1 | 管理员 |
| §2 R1-B1 | 02 §4 | 管理员 |
| §3 R2-M1..M3 | 03 §1..3 | 族员 |
| §4 R3-B7..B22 | 04 §B 系列 | 跨角色 |
| §5 R4-P1..P3 | Round 4 全部 | 通用 |

完整测试时按 Round 0 → Round 4 顺序执行，每轮前调用 §6 状态清理器。

---

## §9 子代理编排建议（大规模测试优化）

针对 90+ 用例，**建议按以下子代理拆分**降低上下文占用：

| 子代理 | 负责用例 | 触发条件 |
|---|---|---|
| `auth-runner` | R0-S1..S5, R3-B7, R3-B12..B22 | 启动即触发 |
| `admin-tree-runner` | R1-A1..A5 | 登录管理员后触发 |
| `admin-content-runner` | R1-B1..R1 全集非树部分 | 登录管理员后触发 |
| `member-runner` | R2-M1..M18 | 登录族员后触发 |
| `boundary-runner` | R3 跨角色 | 任意角色登录后触发 |

每个子代理用自己的子上下文，执行完后回报 PASS/FAIL + 截图路径。
