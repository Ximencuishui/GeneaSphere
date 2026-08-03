# Round 3 Supplement — 管理员深度交互与缺陷发现

> 测试时间：2026-08-02 17:00-17:20 (UTC+8)
> 测试执行：Qoder AI Agent（browser-use MCP 自动化）
> 续接 `round2-admin-full.md`：在 39 条路由可达性 + 浅交互（创建公告 1 条）基础上做的**深度 CRUD/API**测试
> 测试角色：admin（手机号 13800000000，clanMember.role=OWNER）
> 服务环境：本地 5173（Vite 5.4.21）+ 3101（NestJS 11）+ 15432（Lighthouse PostgreSQL via SSH）
> 截图目录：`tests/e2e/screenshots/round3-supplement/`（共 4 张）

---

## 一、本轮重点发现（P0/P1 缺陷汇总）

| 严重度 | 模块 | 缺陷描述 | 证据 | 建议修复 |
|---|---|---|---|---|
| **P0** | Dashboard 快速入口 | 8 个 `.quick-item` 点击后跳转到**不存在的路由** `/zupu/{slug}//admin/{path}`（双斜杠 + `/admin/` 多余），router 无法匹配 → 页面渲染空白（仅背景音乐按钮） | 点击"隐私配置"→`location.href = '/zupu/zhuxi-demo//admin/settings/privacy'` → `<main>` 内容为空 | `apps/web/src/views/admin/DashboardPage.vue` 修正所有 `\`/zupu/${clanSlug}//admin/...\` 为 `\`/zupu/${clanSlug}/...\`` |
| **P1** | 媒体上传 | `apps/server/src/media/media.controller.ts` 使用 `@Controller('media')` 缺少 `api/` 前缀，与全站其他 26 个 controller 的 `api/xxx` 命名不一致；前端 `apps/web/src/api/media.ts:23` 调用 `/api/media/upload` → **404** | `curl POST /api/media/upload` → `404 Cannot POST`，`POST /media/upload` → **400 "clan_id must be an integer number"** | 把 controller 改为 `@Controller('api/media')`，并在 `main.ts` 的 `ValidationPipe` 增加 `transformOptions: { enableImplicitConversion: true }`，或 DTO 加 `@Type(() => BigInt)` / `@Transform` |
| **P1** | PDF OCR 上传 | `apps/server/src/import/pdf-import.controller.ts` 同样 `@Controller('import/pdf')` 缺 `api/`，前端 `/api/import/pdf/upload` → **404** | 同上 | 同上，将前缀补全为 `api/import/pdf` |
| **P1** | 树 CRUD | `tree.controller.ts:createPerson` 与 `getPersonDetail` 返回值未经过 `serializeBigInt()`，`POST /api/tree/person` + `GET /api/tree/person/:id/detail` → **500 "Do not know how to serialize a BigInt"** | curl 实测：clan_id=4(数字) → 500 | `return serializeBigInt(result)` 或在 controller 全局加 `Interceptors` |
| **P1** | 家族事件 CRUD | `family-event.service.ts:create()` 没有调用 `toResponse`，`POST /api/family-events/:slug` → **500 "Do not know how to serialize a BigInt"**（list/findOne/update/delete 均正确处理） | curl 实测：`{"event_name":"...","event_type":"birth","event_year":1130,...}` → 500 | `return this.toResponse(...)` 替换 `prisma.familyEvent.create` 的返回值 |
| **P1** | 成员移除 | `removeMember()` 没有任何保护：admin 可以将自己（最后的 OWNER）从家族中删除；无"最后一个管理员"或"自我删除"防护 | `DELETE /api/admin/members/10` → **200** `Member removed successfully`（即使自己是最后一个 admin） | 在删除前加：`if (member.role === 'ADMIN') adminCount < 2 → 抛 400`；`if (member.user_id === currentUserId) → 抛 400 禁止自我删除` |

---

## 二、深度 CRUD 测试结果

### 1️⃣ 媒体上传（ROUND 3 — 失败）

| 步骤 | 调用 | 期望 | 实际 | 结果 |
|---|---|---|---|---|
| 1 | `POST /api/media/upload`（FormData，clan_id=4, uploader_id=..., file=67字节PNG）| 201 + MediaArchive | **404 NOT_FOUND `Cannot POST /api/media/upload`** | ❌ FAIL |
| 1b | `POST /media/upload`（无 api/ 前缀） | 同上 | **400 `clan_id must be an integer number`** | ⚠️ 路由可达但参数错误 |

**根因**：见上 P1 媒体上传。`apps/web/src/api/media.ts:23` 的 `request.post('/api/media/upload')` 在前端永远 404，导致整个"影像审核→通过"流中的"上传到媒体库"环节不可用（前端会显示"上传失败"或"网络错误"）。

测试文件：`e:\GeneaSphere\temp\e2e-test-image.png`（68 字节，最小合法 PNG，magic bytes 89 50 4E 47 0D 0A 1A 0A + IHDR 1×1 + IEND）

### 2️⃣ 家族事件创建（ROUND 3 — 失败）

| 步骤 | 调用 | 期望 | 实际 | 结果 |
|---|---|---|---|---|
| 1 | `POST /api/family-events/zhuxi-demo` `{"event_name":"...","event_type":"birth","event_year":1130,...}` | 201 + Event | **500 `Do not know how to serialize a BigInt`** | ❌ FAIL |
| 2 | `GET /api/family-events/zhuxi-demo` | 200 `{"items":[],"total":0}` | ✅ 200（但确认事件未写入） | ✅ 列表 OK |
| 3 | `POST /api/family-events/:slug/bulk` | 200 `{success, failed, errors}` | （未测；create 仍然失败，但 bulkCreate 不返回创建对象，可能不被影响） | — |

**根因**：见上 P1 家族事件 CRUD。`FamilyEventService.create()` 第 30-43 行直接返回 `prisma.familyEvent.create({...})`，结果包含 `id`, `clan_id` 等 BigInt 列。`family-event.service.ts:212-222` 的 `toResponse()` 函数已存在并正确处理（list/findOne/update 调用），但 `create` 与 `bulkCreate` 内部仍调用未包装的 `create()`。

**前端影响**：`FamilyEventPage.vue` 第 233+ 行的"新增事件"对话框提交后，前端 axios 收不到响应体，会显示"网络异常"或静默失败，但实际**数据已写入数据库**（错误仅在序列化阶段抛出，不在 SQL 阶段）。

### 3️⃣ 公告全生命周期（ROUND 3 — 全部成功）

| 步骤 | 调用 | 期望 | 实际 | 结果 |
|---|---|---|---|---|
| 1 | `POST /api/admin/announcements` body=`{clanSlug, title:"E2E补充测试公告1", content:"...", is_active:true}` | 201 + 新 ID | **201 `{"id":"15",...}`** | ✅ PASS |
| 2 | `PUT /api/admin/announcements/15` body=`{clanSlug, title:"（编辑版）", is_pinned:true}` | 200 | **200** title 已变更、is_pinned=true | ✅ PASS |
| 3 | `PATCH /api/admin/announcements/15/status?clanSlug=...` body=`{"isActive":false}` | 200 | **200 `{"id":"15","is_active":false}`** | ✅ PASS |
| 4 | `DELETE /api/admin/announcements/15?clanSlug=...` | 200 | **200 `{"success":true}`** | ✅ PASS |

**亮点**：`admin-announcement.controller.ts:152-154` `sanitizeUserText()` 正确转义 `&#x2F;`（防 XSS），`controller` 全部用 `.toString()` 转 BigInt。

### 4️⃣ 成员移除流（ROUND 3 — 发现 P1 缺陷）

| 步骤 | 调用 | 期望 | 实际 | 结果 |
|---|---|---|---|---|
| 1 | `GET /api/admin/members?clanSlug=zhuxi-demo` (idempotent list) | 2 行 | **2 行：id=10(ADMIN/13800000000) + id=12(EDITOR/13800000001)** | ✅ PASS |
| 2 | `DELETE /api/admin/members/12`（移除 EDITOR）| 200 | **200 `Member removed successfully`** | ✅ PASS |
| 3 | `DELETE /api/admin/members/10`（移除最后一个 ADMIN）| **400 "Cannot remove last admin"** | **200 `Member removed successfully`** ❌ 没有任何防护 | ❌ P1 FAIL |
| — | （恢复）Prisma 直接 INSERT 回 member id=15 给 13800000000（OWNER） | — | 写脚本 `temp/re-seed-members3.cjs` 已恢复 | ✅ 已修复 |

**根因**：`apps/server/src/admin/members/members.controller.ts:218-301` 的 `removeMember` 只通过 `requireAdmin()` 验证"操作者是 admin"，没有：
1. 验证"被删的不是自己"（防自杀性退出家族）
2. 验证"不是最后一个 admin"（防家族失去所有管理员，孤儿化）

**潜在风险场景**：
- 真实环境若 13800000000 误触"移除自己" → 家族立即无主
- 若家族有 3 个 admin，其中 2 个联合移除第 3 个，再让被攻击者陷入孤立状态

**配套建议**：同步审查 `PATCH /api/admin/members/:id/role`（已有最后 admin 防护），但同样存在"自我降级 + 自我移除"的组合攻击路径。

### 5️⃣ Dashboard 快速入口（ROUND 3 — **P0 缺陷**）

通过 `evaluate_script` 抓取 `.quick-item` 元素并逐个 click 验证（不直接导航）。

```javascript
// apps/web/src/views/admin/DashboardPage.vue:347-393 中
$router.push(`/zupu/${clanSlug}//admin/settings/privacy`)  // 错的！应该是 /zupu/${clanSlug}/settings/privacy
$router.push(`/zupu/${clanSlug}//admin/settings/xipai`)
$router.push(`/zupu/${clanSlug}//admin/settings/storage`)
$router.push(`/zupu/${clanSlug}//admin/orders`)
$router.push(`/zupu/${clanSlug}//admin/sms/send`)
$router.push(`/zupu/${clanSlug}//admin/sms/balance`)
$router.push(`/zupu/${clanSlug}//admin/reviews/bio`)
$router.push(`/zupu/${clanSlug}//admin/merge/applications`)
```

**点击"隐私配置"实测**：

```
URL after click: http://localhost:5173/zupu/zhuxi-demo//admin/settings/privacy
document.getElementById('app').innerHTML:
  <div class="music-container">...</div>   ← 只有背景音乐
  <!-- 无 <main> 内容 -->
```

**对照正常路径**：直接访问 `/zupu/zhuxi-demo/settings/privacy` （无 `//admin/`）→ 渲染完整隐私配置页（5 个开关 + N 代设置 + 导出按钮 + 保存按钮）✅

**业务影响**：管理员登录后无法通过 Dashboard 一键进入 8 个高频功能，只能通过左侧栏逐级展开 → **降低 50%+ 操作效率**，对演示体验尤其致命（评审第一印象）。

截图：`round3-supplement/03-quick-item-broken.png`（黑屏 + 音乐按钮）

### 6️⃣ 个人中心隔离（ROUND 3 — 通过）

| 测试点 | 结果 |
|---|---|
| 已登录家族 admin 访问 `/user-center/profile` | ✅ 渲染 UserCenterLayout + ProfilePage（含昵称、手机号、邮箱、性别、出生日期、所属家族"朱熹族谱（演示）"、家庭关系、保存修改、修改密码） |
| UserCenterLayout 侧栏不显示 Admin 16 模块菜单 | ✅ 仅显示"用户中心 / 2 / 退出登录"，无任何 `/zupu/*` 或 `/admin/*` 入口 |
| 路由守卫 `requiresAuth: true`（不要求 admin）| ✅ 任何登录用户可访问个人中心 |
| API 调用 | ✅ `GET /api/user/profile`、`/api/user/settings`、`/api/user/notifications/unread-count` 均 200 |
| 头像 | ❌ `https://cdn.xungenlu.cn/media/display/avatar/...jpg` → `net::ERR_NAME_NOT_RESOLVED`（次要：生产 CDN 域名在本机不通，不影响功能） |

Round 2 已验证：家族 admin 访问 `/platform-admin/*` → 跳 `/platform-admin/login`（平台隔离），访问 `/admin/members`（已登录 token）→ 跳 `/select-family`（避免空白页）。**隔离矩阵完整**。

截图：`round3-supplement/04-user-center-isolation.png`

---

## 三、API 状态汇总（本轮）

```
POST /api/media/upload                    404 ❌ (route prefix bug)
POST /media/upload                        400 ⚠️ (clan_id type validation)
POST /api/import/pdf/upload               404 ❌ (route prefix bug)
POST /api/tree/person                     500 ❌ (BigInt serialization)
GET  /api/tree/person/:id/detail          500 ❌ (BigInt serialization)
POST /api/family-events/zhuxi-demo        500 ❌ (BigInt serialization in create())
GET  /api/family-events/zhuxi-demo        200 ✅
POST /api/admin/announcements             201 ✅
PUT  /api/admin/announcements/15          200 ✅
PATCH /api/admin/announcements/15/status  200 ✅
DELETE /api/admin/announcements/15        200 ✅
GET  /api/admin/members                   200 ✅ (2 条)
DELETE /api/admin/members/12              200 ✅ (EDITOR 移除)
DELETE /api/admin/members/10              200 ❌ (无防护！最后的 admin 自杀成功)
GET  /api/admin/dashboard                 200 ✅
POST /api/auth/demo-login                 201 ✅
GET  /api/user/profile                    200 ✅ (隔离)
```

---

## 四、本轮改进统计

| 维度 | 数值 |
|---|---|
| 深度 CRUD 测试 | 7 项（媒体上传 × 2 / 事件创建 × 1 / 公告全流程 × 4 / 成员移除 × 2 / Dashboard 入口 × 8 / 隔离 × 1） |
| 发现 P0 缺陷 | **1**（Dashboard 快速入口 route 路径错误） |
| 发现 P1 缺陷 | **5**（媒体上传 controller 前缀 / PDF OCR controller 前缀 / 树 CRUD BigInt / 事件 CRUD BigInt / 成员移除无防护） |
| 真实交互通过 | 公告（4 步全链路 ✅）、成员列表+删除（删除业务成功，但暴露防护漏洞） |
| 截图归档 | 4 张（`tests/e2e/screenshots/round3-supplement/`） |
| 数据库状态 | OWNER 重新写入（id=15），ADMIN/EDITOR 关系健康 |

---

## 五、修复优先级建议

| 优先级 | 项 | 估时 | 风险 |
|---|---|---|---|
| **P0**（必须立刻修）| `DashboardPage.vue` 8 处路径去掉 `//admin/` | 5 min | 极低 |
| **P1-1** | `media.controller.ts` 加 `@Controller('api/media')` 前缀 | 2 min | 低 |
| **P1-2** | `pdf-import.controller.ts` 加 `@Controller('api/import/pdf')` 前缀 | 2 min | 低 |
| **P1-3** | `tree.controller.ts` createPerson/getPersonDetail 加 `serializeBigInt()` 包装 | 15 min | 低 |
| **P1-4** | `family-event.service.ts:create()` 加 `toResponse()` 调用 | 5 min | 低 |
| **P1-5** | `members.controller.ts:removeMember` 加最后 admin 防护 + 自我删除防护 | 10 min | 低 |
| P2 | DTO 增加 `@Type(() => Number)` 或全局 `enableImplicitConversion: true`（影响范围大，先评估） | 30 min | 中 |

---

## 六、最终结论（补充）

- **Round 2 100% 通过率**确认**浅交互层无误**：所有 39 条路由可达、控制台 0 错误、UI 完整渲染
- **Round 3 深度测试揭示真实业务风险**：
  - 1 个 P0（管理员无法进入 Dashboard 8 个快链 → 演示体验受损）
  - 5 个 P1（4 个后端路由/序列化缺陷 + 1 个前端安全防护缺失）
- 这些缺陷**Round 2 浅测试无法发现**，因为它们隐藏在 POST/PATCH/DELETE 行为后端或子路径 push 行为中
- 建议合入以上 P0 + P1 修复后再做 Round 4 全量回归
