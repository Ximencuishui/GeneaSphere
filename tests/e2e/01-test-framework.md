# 01 — 测试框架 & 多轮策略

## 一、设计原则

1. **状态隔离**：每轮测试开始前必须清空浏览器 localStorage / sessionStorage / cookies，避免上一轮的 token 残留导致污染。
2. **角色分组**：按"管理员"和"族员"两类角色分别执行完整流程，不跨角色混测。
3. **观察三角验证**：每个用例同时核对三个信号 —— **UI 元素可见性**（snapshot） + **网络请求响应**（list_network_requests） + **控制台错误**（list_console_messages），三者一致才算 PASS。
4. **可重入**：脚本化的 Browser MCP 调用可多次回放，每次执行前都重置状态。
5. **截图必有结论**：每个用例至少一张截图，文件名 `轮次-模块-步骤.png`，便于追踪。

---

## 二、多轮次编排（Round × Role × Module）

```
Round 0  Smoke     ─ 仅做"可达性"验证，最轻量
Round 1  Admin     ─ OWNER 角色主流程（核心 CRUD + 跳转）
Round 2  Member    ─ EDITOR 角色主流程（个人视角，只读子树）
Round 3  Boundary  ─ 跨角色权限验证（应为拒绝 / 重定向）
Round 4  Regression ─ 性能、异常、并发、防抖
```

每一轮独立输出报告到 `tests/e2e/reports/round-N-actual.md`。

### 轮次状态隔离要求（来自项目长期记忆：多轮端到端测试状态隔离规范）

```js
// 在每轮开始前执行（Browser MCP → evaluate_script）
() => {
  localStorage.clear();
  sessionStorage.clear();
  // 不操作 document.cookie（HttpOnly JWT 不归前端管）
  return { localStorage: 0, sessionStorage: 0 };
}
```

或更稳妥的版本（仅清认证相关 key）：

```js
() => {
  const keys = ['geneasphere_token','demo_clan_slug','demo_clan_name'];
  keys.forEach(k => localStorage.removeItem(k));
  return keys.filter(k => localStorage.getItem(k));
}
```

---

## 三、Browser MCP 工具约定

| 工具 | 用途 | 触发时机 |
|---|---|---|
| `list_pages` | 获取当前浏览器已打开页面 | 轮次开始 |
| `navigate_page` | 访问 URL（url/reload/back/forward） | 跳转页面 |
| `take_snapshot` | 获取 a11y 树（带 uid） | 任何交互前 |
| `click` | 按 uid 点击元素 | 主操作 |
| `fill` | 输入框填值 | 表单 |
| `press_key` | 按键（Enter/Escape/Arrow） | 快捷键 |
| `wait_for` | 等文本出现 | 异步加载 |
| `take_screenshot` | 截图（按 fullPage） | 用例结束 |
| `list_network_requests` | 查 API 调用 | 断言数据 |
| `list_console_messages` | 查错误日志 | 断言无错 |
| `evaluate_script` | 执行 JS | 状态清理、提取 |
| `handle_dialog` | 关闭 confirm/alert | 出现弹窗 |
| `hover` | 悬停（菜单触发） | 下拉菜单 |

### 调用顺序模板（每个用例的标准 7 步）

```
1. take_snapshot           → 取当前 uid 表（前置断言：上一页面已加载）
2. wait_for(text)          → 等待新页面关键标识
3. take_snapshot           → 重新取 uid（DOM 已稳定）
4. click(uid) | fill(...)  → 主操作
5. wait_for(text) | 短暂等待  → 等异步
6. take_snapshot + list_network_requests + list_console_messages → 三方断言
7. take_screenshot(filePath="roundX-modY-stepZ.png", fullPage=true) → 截图
```

### 跳转等待策略

```js
// 评估脚本：检测"当前路由是否就绪"
() => {
  return { url: location.href, title: document.title, ready: document.readyState };
}
// readyState 必须是 'complete'，否则继续等
```

---

## 四、网络断言规范

每个用例至少核对 **一个 GET 接口**（读取数据）和 **0–1 个 POST 接口**（变更数据）。

### 关键 API 列表（演示账号可访问的）

| 模块 | Endpoint | 方法 | 用途 |
|---|---|---|---|
| Auth | `/api/auth/demo-login` | POST | 管理员演示登录 |
| Auth | `/api/auth/demo-member-login` | POST | 族员演示登录 |
| Auth | `/api/auth/me/admin-clans` | GET | 管理员家族列表 |
| Auth | `/api/auth/me/demo-person` | GET | 族员关联人物 |
| Tree | `/api/tree/clan/:slug/full` | GET | 家族全树 |
| Tree | `/api/tree/subtree/:rootPersonId` | GET | 子树 |
| People | `/api/people/:id` | GET | 个人详情 |
| Clans | `/api/clans/:id` | GET | 家族信息 |
| Clans | `/api/clans/:id/statistics` | GET | 家族统计 |
| Admin | `/api/admin/menu` | GET | 管理员菜单 |
| Admin | `/api/admin/dashboard` | GET | 仪表盘 |
| Admin | `/api/admin/members` | GET | 成员列表 |
| Admin | `/api/admin/reviews/media` | GET | 待审媒体 |
| Migration | `/api/migration/:clanSlug/locations` | GET | 迁徙地点 |
| Personal | `/api/personal-space/albums` | GET | 个人相册 |
| Buddy | `/api/buddy/matches` | GET | 寻亲匹配 |
| Orders | `/api/orders` | GET | 订单列表 |

每次断言至少校验：

```js
// evaluate_script 示例（提取最近请求的 status）
async () => {
  const r = await fetch('/api/admin/dashboard', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('geneasphere_token') }
  });
  return { status: r.status, ok: r.ok };
}
```

---

## 五、控制台断言规范

每个用例结束前 `list_console_messages({types:['error','warn']})` 应返回**空列表**（允许的 warning 需在用例中明确标注）。

常见合法 warning：
- Element Plus icon 解析 warning（无影响）
- devtools recommendation warning
- Vite HMR ping

禁止出现的 error：
- `Cannot read property of undefined`
- 401/403 toast 上"未授权"错误（除非测试用例本身就是要触发这个）
- ChunkLoadError（G6 模块失败）

---

## 六、测试轮次定义（详细）

### Round 0：冒烟（5 分钟）

| 步骤 | 测试点 | 期望 |
|---|---|---|
| 0.1 | 打开 `/login` | 看到两个演示按钮（管理员 / 族员） |
| 0.2 | 点击"族谱管理"演示按钮 | 调用 `POST /api/auth/demo-login`（HTTP 201），跳转到 `/zupu/zhuxi-demo`（注：旧的 `/admin/dashboard` 路由已废弃，统一为 `/zupu/:slug`） |
| 0.3 | 点击"族员个人页面"演示按钮 | 调用 `POST /api/auth/demo-member-login`，跳转到 `/user-center/profile` |
| 0.4 | 退出登录 | 回到 `/login`，无残留 token |
| 0.5 | 直接访问 `/zupu/zhuxi-demo` 未登录 | 重定向到 `/login`（注：旧的 `/admin/dashboard` 已统一为 `/zupu/:slug`） |

### Round 1：管理员主流程（30–45 分钟）

清空 localStorage → 走"族谱管理"按钮 → 覆盖：

```
A1  家族信息
A2  族谱树浏览（关键：1000 人节点能否秒级渲染）
A3  成员管理
A4  媒体审核
A5  导入/PDF/OCR
A6  迁徙地图（编辑模式）
A7  家族事件
A8  影像视频项目
A9  公告
A10 时光轴
A11 搜索
A12 印刷订单
A13 平台管理后台（验证拦截）
```

每个用例至少两步：列表加载 + 一项交互（创建/编辑/删除/审核）。

### Round 2：族员主流程（25–35 分钟）

清空 localStorage → 走"族员个人页面"按钮 → 覆盖：

```
M1  个人资料
M2  直接血脉子树（自动定位朱小小）
M3  家谱册
M4  寻亲匹配
M5  寻亲邀请
M6  小组讨论
M7  个人相册/照片上传
M8  童年地方
M9  时光轴（个人版）
M10 跨族搜索（仅本家族？）
M11 订单
M12 工具箱
M13 设置
M14 管理员路由拦截（验证 401/403）
```

### Round 3：跨角色权限边界（15 分钟）

清空 localStorage → 多种状态交替切换，验证：

- 未登录访问 `/zupu/zhuxi-demo/dashboard` → 跳 `/login`
- EDITOR token 访问 `/admin/members` → 403 或重定向
- OWNER token 访问 `/user-center/profile` → 期望重定向到 `/zupu/zhuxi-demo`（OWNER 默认进入族谱后台，`/admin/dashboard` 已废弃）
- 编辑后调用 `/api/auth/demo-login` 多个并发的 race condition
- 同一浏览器切换 token 登录（先登出再登入）→ localStorage 不残留

### Round 4：回归与性能（按需）

- 1000 人 G6 节点首次渲染时长（性能基线）
- 长耗时加载进度条（G6 v5.1.1 多阶段进度条规范）
- Token 过期后接口返回 401 → toast 提示 + 跳 `/login`
- 移动端 viewport（375×667）渲染关键页面
- 网络断开（offline）→ 重连 → 重试
- 高 DPI 截图清晰度
- 上传 4MB 头像的进度条和成功状态

---

## 七、报告模板字段

每轮报告 `reports/round-N-actual.md`：

```markdown
# Round N — <角色> <类型> 测试报告

测试人：Qoder AI
测试日期：2026-08-01
浏览器：Chromium（Playwright 内核）

## 环境
- 前端：http://localhost:5173/ 状态：UP
- 后端：http://localhost:3101/api 状态：UP
- 数据库隧道：127.0.0.1:15432 状态：UP
- token：演示账号已应用

## 总览
| PASS | FAIL | SKIP | 总计 |
|---|---|---|---|
| 0   | 0   | 0   | 0  |

## 用例明细

### A1 家族信息
- **步骤**：...
- **API**：GET /api/clans/:id → 200
- **UI**：标题"朱熹族谱（演示）"可见
- **控制台**：无 error
- **结果**：✅ PASS
- **截图**：round1-modA1-step1.png

...

## 失败用例

### F1 用例名
- **期望** vs **实际**
- **复现路径**
- **截图**：roundX-modY-stepZ.png
- **初步定位**：...
```

---

## 八、相关规范引用

- 项目长期记忆 `development_practice_specification`：**多轮端到端测试状态隔离规范** —— localStorage 清理是强制要求。
- 项目长期记忆 `project_introduction`：**演示账号双入口功能设计** —— `POST /api/auth/demo-login` (管理员) 与 `POST /api/auth/demo-member-login` (族员)。
- 项目长期记忆 `project_introduction`：**演示账号视图权限策略** —— 管理员看全树、族员看直系子树。
- 项目长期记忆 `development_practice_specification`：**长耗时渲染需添加分阶段进度条** —— 1000 人树渲染应看到进度反馈。
