# Round 4 — 后续完善 P2 修正 + 平台管理员 4 角色扩展

> 测试时间：2026-08-01 13:01
> 测试执行：Qoder AI Agent
> 目标：验证"后续完善"3 项任务的实际执行结果

## 任务清单与执行状态

| # | 任务 | 状态 | 备注 |
|---|---|---|---|
| 1 | P2 用户中心增加"退出登录"按钮 | ✅ 已确认实现（**此前 R2 报告误判**） | 实现在 Layout 顶部下拉菜单中，非 SettingsPage |
| 2 | 平台管理员 seed 扩展（4 个角色） | ✅ 已完成并通过 4/4 登录验证 | 修改 `demo-seed.service.ts:205` + 重启验证 |
| 3 | 62 子页面深度 CRUD | ⏸️ 范围评估（按需拆批次） | 见下方子页面盘点 |

## 1. P2 误判澄清（已修正）

### R2 报告原判断
> ❌ P2：用户中心设置页仅"注销账号"无"退出登录" → 仍然存在（设计取舍，未在 P1 修复中处理）

### 源码核查（决定性证据）

**退出登录按钮**：[apps/web/src/layouts/UserCenterLayout.vue](apps/web/src/layouts/UserCenterLayout.vue) 行 571-576
```vue
<ElDropdownMenu>
  <ElDropdownItem @click="router.push('/clans')">
    返回家族空间
  </ElDropdownItem>
  <ElDropdownItem
    divided
    @click="handleLogout"
  >
    退出登录
  </ElDropdownItem>
</ElDropdownMenu>
```

**handleLogout 函数**：同文件行 154-157
```ts
function handleLogout() {
  userStore.reset()
  authStore.logout()
}
```

**SettingsPage**：仅保留"注销账号"（强删除意图），不混入"退出登录"——是合理的设计取舍。

### 结论

**P2 不再是 finding**。
- "退出登录"按钮位置在 `UserCenterLayout.vue` 顶部用户头像下拉菜单（行 550-579 的 `<ElDropdown>`）
- 调用链：`handleLogout → userStore.reset() + authStore.logout()`
- 顶部下拉菜单 vs 设置页底部是更常见的 UX 模式（符合 Material Design 与 Element Plus 设计规范）

**R2 报告已就地修正**：删除"已知 Finding 复测"段落，替换为"P2 退出登录按钮复测（2026-08-01 修正）"。

---

## 2. 平台管理员 4 角色 Seed 扩展

### 修改文件

[`apps/server/src/auth/demo-seed.service.ts`](apps/server/src/auth/demo-seed.service.ts) 行 205-247

`seedPlatformAdmin()` 方法从「单 super 账号」重构为「4 角色账号 + 原子 upsert」，完整代码：

```ts
private async seedPlatformAdmin() {
  // 4 个角色的演示账号，统一密码 admin123，便于平台多角色权限测试。
  // 现有 seed 只创建 super 账号；此处扩展为完整 4 角色覆盖（幂等 upsert）。
  // 手机号使用 1380000009X 段避开族员演示账号冲突段。
  // 使用 Prisma upsert 原子化 findUnique+create/update，避免热重启并发竞态
  // （参见 R4 报告：修复前首启观察到 id 跳跃 1→2→6→7，中间 id 被竞态失败占用）。
  const demoAccounts: Array<{
    username: string;
    role: 'super' | 'operator' | 'finance' | 'auditor';
    real_name: string;
    phone: string;
  }> = [
    { username: 'platform_admin',    role: 'super',    real_name: '超级管理员',  phone: '13800000090' },
    { username: 'platform_operator', role: 'operator', real_name: '运营管理员',  phone: '13800000091' },
    { username: 'platform_finance',  role: 'finance',  real_name: '财务管理员',  phone: '13800000092' },
    { username: 'platform_auditor',  role: 'auditor',  real_name: '审计管理员',  phone: '13800000093' },
  ];
  const passwordHash = await bcrypt.hash('admin123', 10);
  for (const acc of demoAccounts) {
    await this.prisma.platformAdmin.upsert({
      where: { username: acc.username },
      create: {
        username: acc.username,
        password_hash: passwordHash,
        role: acc.role,
        real_name: acc.real_name,
        phone: acc.phone,
        status: 'active',
      },
      update: {
        password_hash: passwordHash,
        role: acc.role,
        real_name: acc.real_name,
        phone: acc.phone,
      },
    });
    this.logger.log(`✅ 平台管理员演示账号 upsert: ${acc.username} / admin123 (${acc.role})`);
  }
}
```

### Schema 兼容性

[`packages/db/prisma/schema.prisma`](packages/db/prisma/schema.prisma) 行 494-510：
- `username` 唯一约束 ✅
- `phone` 字段**无**唯一约束 ✅（用 1380000009X 段避免与族员段 1380000000X 冲突）
- 4 个角色（super / operator / finance / auditor）已存在于 `PlatformRole` 枚举 ✅

### 登录验证（4/4 PASS）

| 账号 | 角色 | 登录 | JWT role | phone | real_name |
|---|---|---|---|---|---|
| platform_admin | super | ✅ 200 | super | 13800000090 | 超级管理员 |
| platform_operator | operator | ✅ 200 | operator | 13800000091 | 运营管理员 |
| platform_finance | finance | ✅ 200 | finance | 13800000092 | 财务管理员 |
| platform_auditor | auditor | ✅ 200 | auditor | 13800000093 | 审计管理员 |

```bash
POST /api/platform/auth/login
Body: {"username":"platform_*", "password":"admin123"}
→ 200 OK + access_token (role 字段对应)
```

### 后端热重启日志

```
[DemoSeedService] ✅ 平台管理员演示账号 upsert: platform_admin / admin123 (super)
[DemoSeedService] ✅ 平台管理员演示账号 upsert: platform_operator / admin123 (operator)
[DemoSeedService] ✅ 平台管理员演示账号 upsert: platform_finance / admin123 (finance)
[DemoSeedService] ✅ 平台管理员演示账号 upsert: platform_auditor / admin123 (auditor)
```

> **历史问题（已修复）**：upsert 改造前首启观察到 1 条 Unique constraint 警告（旧 PID 7252 与新 PID 20488 短暂并发 seed），且数据库 id 跳跃为 `1→2→6→7`（中间 3、4、5 被竞态失败占用的 id 仍占用序列）。
> **修复方案**：将 `findUnique + if/else create|update` 重构为 `prisma.platformAdmin.upsert({ where, create, update })`，原子化消除 findUnique 与 write 之间的竞态窗口。
> **修复验证**：upsert 改造后热重启日志 4/4 全成功，**无 unique constraint 错误**。

### 角色权限矩阵（演示账号集）

| 账号 | 角色 | 手机号 | 演示权限范围 |
|------|------|--------|------------|
| `13800000000` / demo123 | USER.OWNER | 13800000000 | 家族全部功能 |
| `13800000001` / demo123 | USER.EDITOR | 13800000001 | 用户中心 + 只读家族 |
| `platform_admin` / admin123 | PLATFORM.super | 13800000090 | 平台全部后台 |
| `platform_operator` / admin123 | PLATFORM.operator | 13800000091 | 内容审核 / 订单查看 |
| `platform_finance` / admin123 | PLATFORM.finance | 13800000092 | 财务订单 / 充值 |
| `platform_auditor` / admin123 | PLATFORM.auditor | 13800000093 | 日志 / 统计只读 |

### 平台前端路由（13 个子页面）

[`apps/web/src/router/index.ts`](apps/web/src/router/index.ts) 行 104-196 已配置：

| 路由 | 名称 | 标题 |
|---|---|---|
| `/platform-admin/login` | platform-login | 平台登录 |
| `/platform-admin` (→ `/dashboard`) | platform-dashboard | 平台控制台 |
| `/platform-admin/families` | platform-families | 家族管理 |
| `/platform-admin/families/:id` | platform-family-detail | 家族详情 |
| `/platform-admin/users` | platform-users | 用户管理 |
| `/platform-admin/reviews/media` | platform-reviews-media | 影像审核 |
| `/platform-admin/reviews/posts` | platform-reviews-posts | 寻亲帖审核 |
| `/platform-admin/orders/print` | platform-orders-print | 印刷订单 |
| `/platform-admin/orders/recharge` | platform-orders-recharge | 充值订单 |
| `/platform-admin/settings/pricing` | platform-settings-pricing | 定价管理 |
| `/platform-admin/settings/defaults` | platform-settings-defaults | 家族默认配置 |
| `/platform-admin/settings/switches` | platform-settings-switches | 全局开关 |
| `/platform-admin/statistics` | platform-statistics | 数据统计 |
| `/platform-admin/logs` | platform-logs | 操作日志 |

> 13 个 platform 子页面 + 1 个 login = 14 个 platform-admin 路由全部已实现。

---

## 3. 62 个 admin + user-center 子页面深度 CRUD 范围评估

### 实际盘点（剔除 deploy_bundle / deploy_light 副本）

#### Admin 子页面 = **39 个**（34 顶级 + 5 invite 子）

```
1.  AlbumsPage.vue                (202 行)
2.  AnnouncementsPage.vue          (254)
3.  BioReviewPage.vue             (346)
4.  ClanInfoPage.vue              (277)
5.  DashboardPage.vue             (763)
6.  DataExportPage.vue            (176)
7.  EventVideoPage.vue            (268)
8.  FamilyAlbumsPage.vue          (270)
9.  FamilyEventPage.vue           (310)
10. FamilyRelationDisputesPage.vue(78)
11. FamilyRelationReviewsPage.vue (205)
12. GenealogyGeneratePage.vue     (510)
13. GenealogyHistoryPage.vue      (206)
14. ImportManagementPage.vue      (411)
15. LogsPage.vue                  (198)
16. MediaLibraryPage.vue          (412)
17. MediaReviewPage.vue           (430)
18. MembersPage.vue               (460)
19. MemoryQuizManagement.vue      (193)
20. MergeApplicationsPage.vue     (322)
21. MergeWizardPage.vue           (438)
22. MigrationEventsPage.vue       (549)
23. MigrationVideoPage.vue        (264)
24. OrdersPage.vue                (172)
25. PrivacySettingsPage.vue       (192)
26. ReportsPage.vue               (211)
27. SearchPostsPage.vue           (185)
28. SmsBalancePage.vue            (705)
29. SmsSendPage.vue               (463)
30. StatisticsPage.vue            (280)
31. StoragePage.vue               (151)
32. ToolboxUsagePage.vue          (275)
33. TrashPage.vue                 (252)
34. XipaiSettingsPage.vue         (186)
35. invite/GenerateQrcodeDialog.vue      (61)
36. invite/ModificationReviewPage.vue    (126)
37. invite/QrcodeListPage.vue            (162)
38. invite/VerificationRecordDetailPage.vue (98)
39. invite/VerificationRecordsPage.vue   (115)
```

#### User-Center 子页面 = **31 个**（29 顶级 + 2 verify 子）

```
1.  AlbumsPage.vue               (871)
2.  AnnotationsPage.vue          (198)
3.  BuddiesPage.vue              (286)
4.  BuddyDetailPage.vue          (314)
5.  ChildhoodPlacesPage.vue      (291)
6.  FamiliesPage.vue             (258)
7.  FamilyBookDetailPage.vue     (533)
8.  FamilyBookPage.vue           (845)
9.  FamilyBookPreviewPage.vue    (1038)
10. FamilyRelationHistoryPage.vue(163)
11. FamilyRelationPage.vue       (283)
12. GroupDetailPage.vue          (529)
13. GroupsPage.vue               (284)
14. LineageVideoDetailPage.vue   (492)
15. LineageVideoPage.vue         (773)
16. MemoryContributionsPage.vue  (110)
17. MessagesPage.vue             (531)
18. OrderDetailPage.vue          (221)
19. OrdersPage.vue               (174)
20. ProfilePage.vue              (356)
21. SettingsPage.vue             (292)
22. SummaryDetailPage.vue        (467)
23. TimelinePage.vue             (246)
24. ToolboxPage.vue              (765)
25. TopicDetailPage.vue          (345)
26. VideoCreatePage.vue          (739)
27. VideoDetailPage.vue          (515)
28. VideosPage.vue               (408)
29. verify/InviteVerifyPage.vue  (127)
30. verify/MyVerifyRecordsPage.vue(92)
31. (额外?) 
```

> 用户口头提到「26 admin + 36 user-center」是按路由数估算，实际盘点为 **39 admin + 31 user-center = 70 个 vue 文件**（含 4 个 invite 子页 + 2 个 verify 子页）。

### 深度 CRUD 范围建议（按"按需"原则拆批次）

> 用户原话："**可按需**补全深度 CRUD 验证"。全量 70 个子页面 × CRUD 4 步 = 280+ 操作，工作量过大，建议按业务价值分批次。

#### 批次建议

| 批次 | 子页面数 | 优先级 | 范围 | 验证深度 |
|---|---|---|---|---|
| **Batch-A 关键业务** | 6 个 | 🔴 P0 | admin: Dashboard / Members / FamilyRelationReviews / MediaReview / MigrationEvents / MergeApplications<br>user: Profile / FamilyRelation / Toolbox / Timeline / Albums / Orders | 完整 CRUD（创建/查看/编辑/删除 + 列表筛选/导出） |
| **Batch-B 辅助工具** | 8 个 | 🟡 P1 | admin: SmsBalance / SmsSend / ToolboxUsage / Statistics / Reports / Logs / ImportManagement / DataExport<br>user: Toolbox (深度) / Videos / VideoCreate / LineageVideo / FamilyBook | API + 列表可达性 + 关键交互 |
| **Batch-C 长尾页面** | 16 个 | 🟢 P2 | admin: GenealogyGenerate / GenealogyHistory / PrivacySettings / XipaiSettings / Storage / Trash / SearchPosts / Orders / Announcements / EventVideo / FamilyEvent / FamilyRelationDisputes / MergeWizard / Dashboard 内嵌<br>user: Annotations / Buddies / BuddyDetail / ChildhoodPlaces / FamilyRelationHistory / FamilyBookDetail / FamilyBookPreview / GroupDetail / Groups / Messages / OrderDetail / SummaryDetail / TopicDetail / VideoDetail / MemoryContributions / verify/* | 页面可达性 + 空态渲染验证 |

### 推荐执行路径

1. **当前批次**：本轮 R4 已完成 P2 修正 + Platform-Admin 4 角色 seed 扩展
2. **下一批次**：如需深度 CRUD 验证，建议从 **Batch-A（6 个关键业务）** 开始
3. **增量方式**：每批次 4-6 个子页面 × CRUD 4 步 ≈ 24 操作/批次
4. **每批次产物**：1 份 `<round-batch-X>-<role>-actual.md` 报告

### 验证手段选项

| 手段 | 适用 | 工具 |
|---|---|---|
| **API 直测** | CRUD 端点可达性 + 权限矩阵 | `curl` / PowerShell `Invoke-WebRequest` |
| **浏览器实测** | 页面渲染 + 交互 + 空态 | Browser MCP（受限于 5000ms click 超时） |
| **代码审查** | 路由是否注册、组件是否实现 | `SearchCodebase` + `Read` |

> 建议**每个子页面**至少做「路由可达性 + 列表/详情 GET 200 + 权限矩阵（角色访问）」三项基础验证，再按需追加 POST/PUT/DELETE。

---

## 总结

- ✅ **P2 误判已澄清**：退出登录按钮实现在 Layout 顶部下拉菜单（R2 报告已修正）
- ✅ **平台管理员 4 角色 seed 已扩展**：4/4 账号登录验证 PASS
- ⏸️ **62 子页面深度 CRUD**：完成范围评估 + 批次拆分建议，待用户决策按需启动

## 下一步

1. 用户决策：是否启动 Batch-A（6 关键业务 CRUD 验证）
2. 或：扩展更多 R0-R3 报告未覆盖的边界场景
3. 或：进入生产部署验证（参考 `DEPLOY.md` + `deploy_bundle/`）