# 02 — 管理员（OWNER）测试用例全集

> **角色**：平台/家族管理员  
> **登录端点**：`POST /api/auth/demo-login` (phone=`13800000000`)  
> **落地路由**：`/zupu/zhuxi-demo/dashboard` 或 `/admin/dashboard`  
> **数据视图**：整个朱熹族谱（约 1000 人 / 28 代）  
> **覆盖范围**：第 §0–§13 共 14 个业务模块

每个用例结构：**前置 → 操作步骤 → API/UI 断言 → 截图 → 通过判定**

---

## §0 登录入口与一键演示登录

### §0.1 登录页访问与 UI 结构

**前置**：
- `localStorage` 已清空
- 浏览器访问 `http://localhost:5173/login`

**步骤**：

1. `navigate_page` 到 `http://localhost:5173/login`
2. `wait_for("登录")`
3. `take_snapshot` → 确认元素：
   - 标签 `寻根路 · xungenlu.cn`（品牌名）
   - 标签 `手机号登录` 或 `账号密码登录` Tab
   - 按钮 `一键体验族谱管理演示`
   - 按钮 `一键体验族员个人页面`
   - 表单（手机号 + 密码 / 短信码）
4. 截图 `round1-login-page.png`

**断言**：

- UI：两个一键按钮文案正确（**主题色应不同**，根据 `DemoRoleModal.vue` 与 `LoginView.vue` 设计）
- API：无网络调用
- 控制台：无 error

**通过**：✅ 看到 2 个 demo 入口按钮 + 品牌名 + 表单

### §0.2 一键登录管理员 → 跳转族谱后台

**前置**：登录页加载完成

**步骤**：

1. `click(uid_of_"一键体验族谱管理演示")`
2. `wait_for("族谱管理")` 或 `wait_for("朱熹")`
3. `list_network_requests` → 确认 `POST /api/auth/demo-login` status=201
4. `evaluate_script` → 返回 `location.href` 必须是 `/zupu/zhuxi-demo/...` 或 `/admin/dashboard`
5. 截图 `round1-login-admin-success.png`

**断言**：

- API：`POST /api/auth/demo-login` 201，response 含 `access_token`, `user.id=13800000000`, `demoClanSlug=zhuxi-demo`
- localStorage 写入：`geneasphere_token`, `demo_clan_slug`
- 跳转 URL 含 `/zupu/zhuxi-demo/` 或 `/admin`
- 控制台：无 error

**通过**：✅ 登录成功并跳转

### §0.3 营销首页 Demo Modal 入口

**前置**：浏览器访问 `http://localhost:5173/`

**步骤**：

1. `navigate_page` 到 `http://localhost:5173/`
2. `wait_for("立即体验")` 或 `wait_for("一键体验")`
3. `take_snapshot` → 找到"立即体验 / 一键体验演示账号"按钮
4. `click(...)` 触发 Modal
5. `take_snapshot` → 验证 Modal 出现两列卡片：
   - 左：管理员（族谱管理平台）标题 + 副标题 + 3 项 features + 立即进入
   - 右：族员（朱小小）标题 + 副标题 + 3 项 features + 立即进入
6. 点击左卡片"立即进入"
7. `wait_for` 跳转
8. 截图 `round1-landing-modal-admin.png`, `round1-landing-modal-after.png`

**断言**：

- API：`POST /api/auth/demo-login` 201
- Modal 双卡片布局正确（PC 端 720px 居中，<768px 切换 Drawer）
- 一键进入按钮在提交时 loading + 禁用对方按钮

**通过**：✅ Modal + 双入口都可用

### §0.4 退出登录

**前置**：已登录（任一角色）

**步骤**：

1. 在 admin dashboard 上找到用户菜单（通常右上角头像下拉）
2. `click` 用户菜单
3. `take_snapshot` → 找到"退出登录"或类似按钮
4. `click` 退出
5. `wait_for("登录")`
6. `evaluate_script` → 检查 localStorage 中 `geneasphere_token` 应被清空

**断言**：

- API：调用 `POST /api/auth/logout`（如有）或仅清前端状态
- 跳转回 `/login`
- localStorage 关键 key 已清除

**通过**：✅ 干净登出

---

## §1 家族族谱树（核心模块 / G6 渲染）

### §1.1 全族谱树加载性能与展示

**前置**：OWNER 已登录

**步骤**：

1. `navigate_page` 到 `/admin/dashboard` 或 `/zupu/zhuxi-demo/dashboard`
2. `wait_for("朱熹族谱")`
3. `wait_for` G6 画布加载（观察 canvas/svg 元素）
4. 记录首屏渲染时长（`evaluate_script` 取 `performance.timing` 或自打点）
5. `take_snapshot`
6. 截图 `round1-tree-load.png` (fullPage)

**断言**：

- API：`GET /api/tree/clan/zhuxi-demo/full` 200
- 响应包含 1000+ 节点（personCount）
- 渲染时间 < 3 秒（性能基线，按"长耗时渲染需添加分阶段进度条"规范）
- 看到分阶段进度条（如节点>500）
- 主支自动选中（"代数最长的支系"）

**通过**：✅ 全树渲染 OK

### §1.2 搜索 Person + 聚焦子树

**前置**：族谱树已加载

**步骤**：

1. 在工具栏找到 Person 搜索框
2. `fill(uid, "朱")`
3. `wait_for` 候选下拉
4. 点击候选中第一个
5. 等待 G6 重新聚焦
6. 截图 `round1-tree-search.png`

**断言**：

- API：`GET /api/people/search?q=朱` 200
- 子树渲染（可以是全树高亮某节点）

**通过**：✅ 搜索 + 聚焦可用

### §1.3 节点详情展开

**前置**：族谱树已加载

**步骤**：

1. `evaluate_script` 获取画布位置
2. `click` 中心节点（主支根）
3. `wait_for("详情")` 或 Modal
4. 截图 `round1-tree-detail.png`

**断言**：

- API：`GET /api/people/:id/detail` 或 `GET /api/tree/person/:personId/detail` 200
- Modal 显示姓名、生卒、配偶、子女

**通过**：✅ 详情正确

### §1.4 树 CRUD（创建 / 编辑 / 删除 Person）

**前置**：族谱树已加载

**步骤**：

1. 工具栏 → "新增人物"或类似入口
2. 填写：姓名、性别、生卒年、籍贯
3. 提交
4. `wait_for` toast 成功
5. `list_network_requests` 确认 `POST /api/tree/person` 201
6. 截图 `round1-tree-person-create.png`
7. 删除刚创建的人物
8. 截图 `round1-tree-person-delete.png`

**断言**：

- API：`POST /api/tree/person` 201 + `DELETE /api/tree/person/:id` 200
- 列表中立刻显示新节点（树刷新）
- 审计日志被写入（如有）

**通过**：✅ CRUD 流程通过

### §1.5 关系编辑（配偶 / 子女）

**前置**：族谱树已加载

**步骤**：

1. 选中两个 Person
2. "添加配偶关系" → `POST /api/tree/marriage`
3. "添加子女" → `POST /api/tree/family-child`
4. 验证闭包表更新：`GET /api/tree/subtree/:id`
5. 截图 `round1-tree-relation.png`

**断言**：

- API 全部 200
- 闭包一致性：`personAncestry` 自动重建
- 渲染层立即反映新关系

**通过**：✅ 关系编辑生效

---

## §2 家族信息

### §2.1 查看与编辑家族详情

**前置**：已登录

**步骤**：

1. 导航到 `/admin/clan-info` 或 `/zupu/zhuxi-demo/info`
2. `wait_for("家族信息")`
3. `take_snapshot` → 看到名称、简介、世系源、徽标
4. 修改名称 / 简介字段 → 提交
5. `wait_for` toast
6. 截图 `round2-clan-info.png`

**断言**：

- API：`GET /api/clans/:id` + `PATCH /api/clans/:id` 200
- localStorage `demo_clan_name` 同步更新

**通过**：✅ 修改家族信息生效

### §2.2 家族统计

**前置**：

**步骤**：

1. 导航到 `/admin/statistics` 或在 dashboard 中查看统计卡
2. `wait_for("统计")`
3. `take_snapshot`

**断言**：

- API：`GET /api/clans/:id/statistics` 200
- 数据：总人数、男性/女性比例、家族代数

**通过**：✅ 统计显示正确

---

## §3 成员管理

### §3.1 列出家族成员

**前置**：已登录

**步骤**：

1. 导航到 `/admin/members`
2. `wait_for("成员管理")`
3. `take_snapshot`
4. 截图 `round3-members-list.png`

**断言**：

- API：`GET /api/admin/members` 200
- 至少 2 行（演示账号 13800000000 与朱小小）
- 列：昵称、角色、加入时间、状态

**通过**：✅ 列表加载

### §3.2 修改成员角色

**前置**：在成员列表页

**步骤**：

1. 找到非 OWNER 成员（EDITOR 行）
2. 角色下拉切换到 `ADMIN`
3. 提交
4. `wait_for` 成功提示
5. `list_network_requests` 确认 `PATCH /api/admin/members/:id/role` 200
6. 截图 `round3-members-role.png`

**断言**：

- API 200
- 列表行立即更新

**通过**：✅ 角色修改生效

### §3.3 移除成员

**前置**：成员列表页

**步骤**：

1. 选 Editor 行 → "移除"按钮
2. `handle_dialog` 接受 confirm
3. 等待
4. 截图 `round3-members-delete.png`

**断言**：

- API：`DELETE /api/admin/members/:id` 200
- 行消失

**通过**：✅ 移除成功

### §3.4 转移所有权（防御性）

**前置**：OWNER 当前用户

**步骤**：

1. 找到"转移所有权"按钮
2. 选择目标成员
3. 提交
4. 当前账号应自动降级为 ADMIN（不再是 OWNER）

**断言**：

- API：`PATCH /api/admin/members/transfer-ownership` 200
- UI 顶部菜单变化（部分管理项消失）

**注意**：测试后**必须立即重新登录**恢复 OWNER，否则后续测试受连累。

---

## §4 媒体库与审核

### §4.1 待审媒体列表

**步骤**：

1. 导航到 `/admin/reviews` 或 `/admin/media-review`
2. `wait_for("待审")`
3. `take_snapshot`
4. 截图 `round4-media-review.png`

**断言**：

- API：`GET /api/admin/reviews/media` 200
- 至少一项待审（演示数据可能需要先触发）

### §4.2 审核通过 / 拒绝

**步骤**：

1. 点击"通过"
2. `wait_for` toast
3. 截图 `round4-media-approve.png`
4. 再点"拒绝" 一项
5. 截图 `round4-media-reject.png`

**断言**：

- API：`POST /api/admin/reviews/media/:id/approve|reject` 200
- 列表立即移除

**通过**：✅ 审核流程

### §4.3 媒体库浏览

**步骤**：

1. 导航到 `/admin/media-library`
2. `take_snapshot`
3. 上传一张测试图片（任意小图片 < 1MB）
4. `wait_for` 上传完成
5. 截图 `round4-media-upload.png`

**断言**：

- API：`POST /api/storage/upload` 或 `POST /api/personal-space/photos/upload` 200
- COS 存储路径正确

**通过**：✅ 媒体库可用

---

## §5 导入与族谱生成

### §5.1 PDF 上传解析（OCR）

**步骤**：

1. 导航到 `/admin/import` 或 `/admin/genealogy-generate`
2. `take_snapshot`
3. 上传一份测试 PDF
4. 等待 OCR 处理（可能需 30s+，看进度条）
5. 截图 `round5-import-pdf.png`

**断言**：

- API：`POST /api/import/pdf` 启动 → `POST /api/jobs/callback` 异步回调
- 触发 Tesseract.js OCR（已确认 OCR 引擎降级到 Tesseract.js）
- 看到 OCR 进度条

**注意**：根据"PDF解析OCR自动降级策略"记忆，可能降级到本地解析。

### §5.2 生成族谱图（PDF/PNG）

**步骤**：

1. `/admin/genealogy-generate` 选 1 人为主支
2. 生成
3. 截图 `round5-genealogy.png`

**断言**：

- API：`POST /api/genealogy-documents/:clanSlug` 启动
- 下载 PDF/PNG 链接正常

---

## §6 迁徙地图

### §6.1 迁徙地图加载

**步骤**：

1. 导航到 `/clans/zhuxi-demo/migration` 或 `/admin/migration`
2. `wait_for("迁徙")` 或高德瓦片容器
3. `wait_for` 至少一处标记
4. 截图 `round6-migration.png`

**断言**：

- API：`GET /api/migration/:clanSlug/locations` 200
- 瓦片来自高德（地图一级降级）
- 标记点 >= 1

### §6.2 编辑迁徙地点

**步骤**：

1. 地图点击添加点 → 填写朝代 / 人物 → 提交
2. `wait_for` 成功
3. `list_network_requests` → `POST /api/migration/:clanSlug/locations` 201
4. 截图 `round6-migration-edit.png`

**断言**：

- API 201
- 地图上立即出现新标记
- 详情面板同步刷新

### §6.3 地图三级降级（防御性）

如果地图渲染失败，应自动降级：
- 一级：高德瓦片
- 二级：OSM/CartoDB
- 三级：静态占位图

**步骤**：

1. 临时禁用网络（DevTools）→ 刷新
2. 应看到占位图 + 提示文案"地图加载失败"
3. 截图 `round6-migration-fallback.png`

---

## §7 家族事件

### §7.1 事件列表

**步骤**：

1. `/admin/family-event`
2. `take_snapshot`
3. 截图 `round7-events.png`

**断言**：

- API：`GET /api/family-events/:clanSlug` 200

### §7.2 创建事件

**步骤**：

1. 新建 → 填写标题、日期、关联人
2. 提交
3. 截图 `round7-events-create.png`

**断言**：

- API：`POST /api/family-events/:clanSlug` 201
- 列表新增一行

### §7.3 批量生成生命周期事件

**步骤**：

1. 选一个人物 → "生成大事记"
2. 等待
3. 截图 `round7-life-events.png`

**断言**：

- API：`POST /api/family-events/:clanSlug/generate-life-events` 200
- 多个事件自动按年龄分布

---

## §8 影像视频

### §8.1 创建血脉视频项目

**步骤**：

1. 导航到 `/admin/event-video`
2. 新建血脉视频项目
3. 选择 1 个人物 + 几张图片
4. 提交生成
5. 等异步完成
6. 截图 `round8-lineage-video.png`

**断言**：

- API：`POST /api/lineage-video/projects` 201
- 后续 `GET /api/jobs/:id` 查询生成状态
- 视频预览可播放

### §8.2 家族事件视频

**步骤**：

1. `/admin/clan-migration-videos` 或 `/admin/clan-event-videos`
2. 创建
3. 等待完成
4. 截图 `round8-clan-video.png`

**断言**：

- API：`POST /api/clan-migration-videos/:clanSlug` 201
- 视频预览可访问

---

## §9 公告

### §9.1 发布公告

**步骤**：

1. `/admin/announcements`
2. 新增公告 → 提交
3. 截图 `round9-announce.png`

**断言**：

- API：`POST /api/announcements` 201
- 用户中心可见该公告

---

## §10 时光轴

### §10.1 全家族时光轴

**步骤**：

1. `/timeline` 或 `/admin/timeline`
2. `wait_for` 至少 5 条
3. 截图 `round10-timeline.png`

**断言**：

- API：`GET /api/timeline?familyId=...` 200

---

## §11 搜索

### §11.1 跨族搜索

**步骤**：

1. `/search`
2. 输入"朱"
3. `wait_for` 搜索结果
4. 截图 `round11-search.png`

**断言**：

- API：`GET /api/search?q=朱` 200
- 命中人物 > 0

---

## §12 印刷订单

### §12.1 订单列表

**步骤**：

1. `/admin/orders` 或 `/admin/print-orders`
2. `take_snapshot`
3. 截图 `round12-orders.png`

**断言**：

- API：`GET /api/admin/orders` 200

### §12.2 重新下单（来自设计文档）

> 来自 `scripts/verify-admin-v1.mjs` 中 §10
**步骤**：

1. 找到任意一条订单详情
2. 点击"再次购买"
3. 截图 `round12-reorder.png`

**断言**：

- API：`POST /api/admin/orders/:id/reorder` 200

---

## §13 平台管理后台（防御性 / 权限）

### §13.1 OWNER 访问 /platform-admin 应被部分允许 / 部分禁止

**步骤**：

1. 直接访问 `/platform-admin/...`
2. `wait_for` 加载
3. 截图 `round13-platform.png`

**断言**：

- 取决于角色：手机号 13800000000 在演示数据中**并未绑定为平台管理员**
- 预期：进入后看到"无权限"或部分菜单缺失
- API：`GET /api/platform/...` 大概率 403

### §13.2 退出后访问 /admin/* 应跳 /login

**步骤**：

1. 退出登录
2. 直接访问 `/admin/members`（前端 vue-router 会重定向到 `/login`，无 `?redirect=` query）
3. 截图 `round13-redirect.png`

**断言**（P2-1 同步：实际 vue-router 守卫的实现只跳 `/login`，不携带原始 URL 作为 query）：

- 跳转 `/login`（不携带 query 字符串）
- localStorage `geneasphere_token` 为空

---

## §A 总结：本轮覆盖清单

| 模块 | 用例数 | 关键截图 |
|---|---|---|
| 登录入口 | 4 | round1-login-* |
| 族谱树 | 5 | round1-tree-* |
| 家族信息 | 2 | round2-* |
| 成员管理 | 4 | round3-* |
| 媒体审核 | 3 | round4-* |
| 导入生成 | 2 | round5-* |
| 迁徙地图 | 3 | round6-* |
| 家族事件 | 3 | round7-* |
| 影像视频 | 2 | round8-* |
| 公告 | 1 | round9-* |
| 时光轴 | 1 | round10-* |
| 搜索 | 1 | round11-* |
| 印刷订单 | 2 | round12-* |
| 平台后台 | 2 | round13-* |
| **合计** | **35** | — |
