# Round 7 E2E 测试报告

**时间**: 2026-08-02
**测试人**: AI (Qoder Browser MCP)
**版本**: GeneaSphere dev (本地)
**目标**: 管理员演示登录 → 公告 CRUD → 媒体/二维码 → 族员演示登录 → 边界测试

---

## 一、服务健康度

| 端口 | 服务 | 状态 |
|------|------|------|
| 5173 | Vite 前端 | ✅ LISTENING |
| 3101 | NestJS 后端 | ✅ LISTENING |
| 15432 | PostgreSQL (SSH) | ✅ LISTENING |

---

## 二、Phase 1 - P1 缺陷复测

### P1-Bug: 匿名用户访问 /zupu/:slug/dashboard 白屏

**状态**: ❌ **仍然存在（未修复）**

**步骤**:
1. 清除 localStorage，确保未登录
2. 访问 http://localhost:5173/zupu/zhuxi-demo/dashboard

**实际结果**:
- URL 停留在 `/zupu/zhuxi-demo/dashboard`
- 页面 body 几乎为空（bodyLen=7）
- 仅显示一个按钮 "🔇 背景音乐"
- 点击背景音乐按钮可打开音乐播放器面板，说明部分 JS 仍在执行

**根本原因**: `/zupu/:slug/*` 下的 admin 路由守卫 `requiresAdmin: true` 对未登录用户未做正确重定向，导致渲染出空白页面。

**截图**: `round7/01-anon-redirect.png` (Round 7 复测), `round7/18-anon-dashboard-p1.png`

---

## 三、Phase 2 - 管理员演示登录 + 公告 CRUD

### 3.1 管理员演示登录

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1 | 点击 "▶ 一键体验族谱管理演示" | ✅ 按钮立即 disabled |
| 2 | 等待自动跳转 | ✅ 约 2s 后进入 /zupu/zhuxi-demo |
| 3 | 验证 JWT token 存储 | ✅ `geneasphere_token` 写入 localStorage |
| 4 | 验证角色 | ✅ role=OWNER, phone=13800000000 |

**截图**: `round7/02-admin-dashboard.png`

### 3.2 公告 CRUD 完整生命周期

| 步骤 | 操作 | API 验证 | 结果 |
|------|------|----------|------|
| 创建 | 点击 "发布公告" → 填写标题 → 确认 | POST /api/admin/announcements | ✅ count 3→4 |
| 编辑置顶 | 点击 编辑 → 切换 置顶 → 保存 | GET /api/admin/announcements → is_pinned=true | ✅ |
| 取消置顶 | 点击 "取消置顶" 按钮 | API is_pinned=false | ✅ |
| 下架 | 点击 "下架" 按钮 | API is_active=false, 状态显示"草稿" | ✅ |
| 删除 | 点击 "删除" → 确认 | DELETE /api/admin/announcements | ✅ count 4→3 |

**截图**: `round7/03-announcements-list.png`, `round7/04-announcement-created.png`, `round7/05-announcement-unpinned-unpublished.png`

---

## 四、Phase 3 - 影像审核 / 媒体库 / 邀请二维码

### 4.1 影像审核页面

| URL | 预期 | 实际 | 结果 |
|-----|------|------|------|
| `/zupu/zhuxi-demo/media` | 影像管理入口 | ❌ 白屏（无此路由） | - |
| `/zupu/zhuxi-demo/media/library` | 影像库 | ❌ 白屏 | - |
| `/zupu/zhuxi-demo/reviews/media` | 影像审核 | ❌ 白屏 | - |

**分析**: `/zupu/zhuxi-demo/media/*` 路由不存在于路由配置中（仅 `media/library` 和 `media/albums` 在 `/zupu/:slug/` 下存在），且后端 `/api/admin/media/*` 相关端点也可能未注册。

### 4.2 邀请二维码

| 功能 | 操作 | 结果 |
|------|------|------|
| 列表展示 | 访问 /zupu/zhuxi-demo/invite/qrcodes | ✅ 表格渲染正常（初始 0 条） |
| 生成新二维码 | 点击 "生成新二维码" → "生成" | ✅ API POST /api/invite/qrcodes 成功，生成 inv_4_6cd447b8a505babe_c692448f |
| 二维码展示 | 生成后自动弹出 dialog | ✅ 显示 QR code + 链接 + 过期时间（7 天后） |
| 复制链接 | 点击 "复制链接" | ✅ ElMessage.success 提示"已复制链接" |
| 撤销二维码 | 点击 "撤销" → 确认 | ✅ API DELETE 成功，状态变"已撤销"，按钮 disabled |

**截图**: `round7/10-invite-qrcodes.png`, `round7/11-qrcode-created.png`, `round7/12-qrcode-revoked.png`

**注意**: 后端 `/api/admin/invite/qrcodes` 不存在，但前端直接调用 `/api/invite/qrcodes`（无需 admin 前缀），该端点正常工作。

---

## 五、Phase 4 - 族员演示登录 + 个人资料

### 5.1 族员演示登录

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1 | 管理员登出（右上角 → 退出登录） | ✅ 跳转 /login |
| 2 | 点击 "● 一键体验族员个人页面" | ✅ 按钮立即 disabled |
| 3 | 等待自动跳转 | ✅ 约 3s 后进入 /user-center/profile |
| 4 | 验证 token | ✅ geneasphere_token, role=EDITOR, phone=13800000001 |

**URL 跳转**: /login → /user-center/profile（而非 /user-center）

### 5.2 个人资料页面

| 字段 | 值 | 可编辑 |
|------|-----|--------|
| 头像 | 显示默认头像 | ✅ 更换头像按钮 |
| 昵称 | 演示族员·朱小小 | ✅ 可编辑 |
| 手机号 | 138****0001 | ❌ disabled |
| 邮箱 | member@geneasphere.com | ✅ 可编辑 |
| 性别 | 男 (checked) | ✅ 单选 |
| 出生日期 | 未设置 | ✅ 日期选择器 |
| 所属家族 | 朱熹族谱（演示） | ❌ disabled |
| 家庭关系 | — | ✅ "前往维护"按钮 |

**修改保存测试**:
1. 修改昵称 → "演示族员·朱小小-R7" → 点击"保存修改"
2. API 验证: `GET /api/user/profile` 返回 `nickname: "演示族员·朱小小-R7"`, `updated_at: 2026-08-02T03:56:17.193Z` ✅

### 5.3 族员其他页面

| 页面 | URL | 状态 |
|------|-----|------|
| 家庭关系 | /user-center/family-relation | ✅ 正常加载 |
| 我的时光 | /user-center/timeline | ✅ 正常加载（0张照片） |
| 家庭图册 | /user-center/family-book | ✅ 正常加载（参数设置表单） |

**截图**: `round7/13-member-profile.png`, `round7/14-member-profile-saved.png`, `round7/15-member-family-relation.png`, `round7/16-member-timeline.png`, `round7/17-member-family-book.png`

---

## 六、Phase 5 - 跨角色重定向 / Token 异常 / 登出

| 场景 | 操作 | 预期结果 | 实际结果 | 结果 |
|------|------|----------|----------|------|
| Token 失效→受保护页 | 清除 localStorage → 访问 /user-center/profile | 重定向到 /login | URL → /login | ✅ |
| 匿名→admin 路由 | 未登录访问 /zupu/zhuxi-demo/dashboard | 重定向到 /login | 白屏（P1 bug） | ❌ P1 |
| Admin token 访问族员页 | admin 登录后访问 /user-center/profile | 显示 admin 自己资料 | 显示"演示用户·管理员" | ✅ 正常 |

**注意**: admin 用 demo 账号登录后，/user-center/profile 显示的是该用户的个人资料（phone=138****0000），而非族员资料。说明 admin 和 member 共享同一套用户中心。

---

## 七、遗留问题汇总

### P1（高优先级）

| # | 问题 | 影响 | 证据 |
|---|------|------|------|
| P1-1 | 匿名用户访问 /zupu/:slug/dashboard 白屏 | 未登录用户访问任何 /zupu/:slug/* admin 路由均白屏 | `bodyLen=7`, `round7/01-anon-redirect.png`, `round7/18-anon-dashboard-p1.png` |
| P1-2 | 8 个 admin 端点返回 404 | 数据统计、回收站、AI工具记录、二维码管理、导入、短信、地方记忆、家庭关系审核不可用 | Round 6 已确认 |

### P2（中优先级）

| # | 问题 | 影响 | 证据 |
|---|------|------|------|
| P2-1 | /zupu/zhuxi-demo/media/* 路由不存在 | 影像管理子菜单（影像库/相册管理）白屏 | snapshot 仅显示"🔇 背景音乐" |
| P2-2 | 公告删除确认框"确定"按钮需点击两次 | 影响删除体验 | Round 6 已记录 |

### 其他观察

- 邀请二维码后端端点 `/api/invite/qrcodes` 工作正常（无需 admin 前缀）
- 背景音乐播放器可在未登录空白页面上打开，说明部分全局 JS 仍在执行
- admin/member demo login 按钮点击后立即 disabled，避免重复提交
- 族员登录后跳转到 /user-center/profile 而非 /user-center，行为一致

---

## 八、截图清单

| 文件 | 内容 |
|------|------|
| `round7/01-anon-redirect.png` | P1 白屏复测（Round 7） |
| `round7/02-admin-dashboard.png` | Admin dashboard 加载成功 |
| `round7/03-announcements-list.png` | 公告列表（测试前 3 条） |
| `round7/04-announcement-created.png` | 新建公告 "Round7-E2E-1785642422746" |
| `round7/05-announcement-unpinned-unpublished.png` | 下架后状态=草稿 |
| `round7/06-members-page.png` | 成员管理页面 |
| `round7/07-media-page.png` | /zupu/zhuxi-demo/media 白屏 |
| `round7/08-media-library.png` | /zupu/zhuxi-demo/media/library 白屏 |
| `round7/09-media-reviews.png` | /zupu/zhuxi-demo/reviews/media 白屏 |
| `round7/10-invite-qrcodes.png` | 邀请二维码列表（初始空） |
| `round7/11-qrcode-created.png` | 生成二维码 dialog + QR code 显示 |
| `round7/12-qrcode-revoked.png` | 撤销后状态=已撤销 |
| `round7/13-member-profile.png` | 族员个人资料（朱小小） |
| `round7/14-member-profile-saved.png` | 昵称修改为"演示族员·朱小小-R7"保存 |
| `round7/15-member-family-relation.png` | 家庭关系维护页面 |
| `round7/16-member-timeline.png` | 我的时光（0张照片） |
| `round7/17-member-family-book.png` | 家庭图册参数设置 |
| `round7/18-anon-dashboard-p1.png` | P1 白屏（Round 7 复测 #2） |
| `round7/19-member-still-loggedin.png` | 族员登录状态保持 |
| `round7/20-admin-accessing-member-page.png` | Admin token 访问族员页面（显示 admin 自己资料） |
| `round7/21-migration-page.png` | 迁徙管理页面（需手动选择家族） |

---

## 九、管理后台路由扫描（新增）

快速扫描 12 个子路由渲染状态：

| 路由 | 页面内容 | 表格 | 表单 | 结果 |
|------|----------|------|------|------|
| `/zupu/zhuxi-demo/merge/applications` | 认亲申请列表 | ✅ | - | ✅ |
| `/zupu/zhuxi-demo/reviews/bio` | 生平审核列表 | ✅ | - | ✅ |
| `/zupu/zhuxi-demo/migration` | 迁徙管理（需选家族） | - | - | ✅ 功能正常 |
| `/zupu/zhuxi-demo/logs` | 操作日志 | ✅ | - | ✅ |
| `/zupu/zhuxi-demo/settings/clan-info` | 家族信息表单 | - | ✅ | ✅ |
| `/zupu/zhuxi-demo/orders` | 订单管理列表 | ✅ | - | ✅ |
| `/zupu/zhuxi-demo/video/migration` | 迁徙历史视频 | - | - | ⚠️ 需内容 |
| `/zupu/zhuxi-demo/media` | 白屏 | - | - | ❌ 路由不存在 |
| `/zupu/zhuxi-demo/media/library` | 白屏 | - | - | ❌ 路由不存在 |
| `/zupu/zhuxi-demo/reviews/media` | 白屏 | - | - | ❌ 路由不存在 |

**说明**: `/zupu/zhuxi-demo/media/*` 系列路由在路由配置中不存在（仅 `media/library` 和 `media/albums` 在 `/admin/*` 下），导致这三个路径均白屏。影像管理功能需要通过 `/admin/media/library` 等路径访问。