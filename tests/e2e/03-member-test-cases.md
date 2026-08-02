# 03 — 族员（EDITOR）测试用例全集

> **角色**：家族编辑者（演示场景：朱小小）  
> **登录端点**：`POST /api/auth/demo-member-login` (phone=`13800000001`)  
> **落地路由**：`/user-center/profile`  
> **数据视图**：仅以"朱小小"为根节点的直系血脉子树  
> **覆盖范围**：第 §0–§17 共 18 个业务模块

---

## §0 登录入口

### §0.1 一键登录 → 用户中心

**前置**：`localStorage` 清空

**步骤**：

1. `navigate_page` → `http://localhost:5173/login`
2. 点击 "一键体验族员个人页面" 按钮
3. `wait_for("朱小小")` 或 `wait_for("个人中心")`
4. `list_network_requests` 确认 `POST /api/auth/demo-member-login` 200
5. URL 应为 `/user-center/profile`
6. 截图 `round2-login-member.png`

**断言**：

- API 200，含 `user.phone=13800000001`, `role=EDITOR`, `demoClanSlug=zhuxi-demo`
- localStorage `geneasphere_token` 已写入
- 跳转 `/user-center/profile`

**通过**：✅ 族员登录成功

### §0.2 族员获取 demo-person 关联

**步骤**：

1. 登录后等待页面稳定
2. `evaluate_script` 触发：
   ```js
   async () => {
     const r = await fetch('/api/auth/me/demo-person', {
       headers: {Authorization:'Bearer '+localStorage.getItem('geneasphere_token')}
     });
     return { status: r.status, body: await r.json() };
   }
   ```
3. 验证返回 `{ person: { id, full_name: '朱小小', gender, birth_date, avatar_url, clan: {...} } }`

**断言**：

- API 200
- person.full_name === "朱小小"

**通过**：✅ demo-person 关联正确

---

## §1 直接血脉子树浏览

### §1.1 子树渲染（与管理员视角对比）

**步骤**：

1. 登录后，导航到 `/user-center/families` 或仪表盘上的"我的血脉"
2. `wait_for("朱小小")` 或画布
3. **关键**：子树人数应远小于 1000（应为朱小小上下若干代）
4. 截图 `round3-families-subtree.png`

**断言**：

- API：`GET /api/tree/subtree/:rootPersonId` 或 `GET /api/family-relation/my-person` 200
- 节点数：`personCount` ≪ 1000（管理员全树 vs 族员子树）
- 主支 = 朱小小本人（中心节点）

**通过**：✅ 视图符合"演示账号视图权限策略"要求

### §1.2 个人信息卡（朱小小）

**步骤**：

1. 截图全屏，看到个人资料卡
2. `take_snapshot`
3. 截图 `round3-profile-card.png`

**断言**：

- API：`GET /api/family-relation/my-person` 200
- 数据：姓名、生日、出生地、现居地

---

## §2 用户中心 — 个人资料

### §2.1 我的资料页

**步骤**：

1. 导航到 `/user-center/profile`
2. `take_snapshot`
3. 修改"昵称" → 提交
4. `wait_for` 成功
5. 截图 `round3-m1-profile-edit.png`

**断言**：

- API：`PATCH /api/profile` 或 `PATCH /api/users/me` 200
- UI 立即反映新昵称
- 控制台无 error

### §2.2 头像上传

**步骤**：

1. 上传一张 200×200 PNG 测试头像
2. `wait_for` 预览
3. 提交
4. 截图 `round3-m2-avatar.png`

**断言**：

- API：`POST /api/profile/avatar` 或 COS 上传链路 200
- CDN 域名回显头像

---

## §3 家谱册

### §3.1 家谱册列表

**步骤**：

1. 导航到 `/user-center/family-book`
2. `take_snapshot`
3. 截图 `round3-m3-familybook-list.png`

**断言**：

- API：`GET /api/family-book/projects` 200
- 至少看到 1 个家谱册（演示数据）

### §3.2 创建新家谱册

**步骤**：

1. 新建 → 填写标题、风格、人物范围
2. 预估页数：`POST /api/family-book/projects/:id/preview-estimate`
3. 提交生成
4. `wait_for` job 完成（轮询 `GET /api/jobs/:id`）
5. 截图 `round3-m3-familybook-create.png`

**断言**：

- API 调用链完整：`POST /api/family-book/projects` → `POST /api/family-book/projects/:id/preview-estimate` → `POST /api/family-book/projects/:id/generate` → `GET /api/family-book/projects/:id`（查 PDF 链接）
- 异步 job 进度合理

### §3.3 家谱册预览

**步骤**：

1. 点击查看 PDF 预览
2. 截图 `round3-m3-familybook-preview.png`

**断言**：

- PDF 流渲染（pdfjs-dist chunk 加载）

### §3.4 家谱册下单

**步骤**：

1. 在家谱册详情页 → "下单"
2. `POST /api/family-book/projects/:id/order`
3. 跳转支付 / 确认页
4. 截图 `round3-m3-familybook-order.png`

**断言**：

- API 201
- 订单详情可查询

---

## §4 寻亲匹配

### §4.1 匹配列表

**步骤**：

1. `/user-center/buddies`
2. `take_snapshot`
3. 截图 `round3-m4-buddies.png`

**断言**：

- API：`GET /api/buddy/matches` 200
- 候选 = 同族但未关联到本人的人物

### §4.2 匹配详情

**步骤**：

1. 点击一条匹配
2. `/user-center/buddy-detail/:id`
3. 截图 `round3-m4-buddy-detail.png`

**断言**：

- API：`GET /api/buddy/matches/:id` 200
- 显示共同祖先/关系链

### §4.3 发起确认请求

**步骤**：

1. 详情页 → "请求关联"
2. `POST /api/buddy/confirm-request`
3. 截图 `round3-m4-buddy-confirm.png`

**断言**：

- API 201
- 对方收到通知

---

## §5 寻亲邀请 / 扫码

### §5.1 我的邀请二维码

**步骤**：

1. `/user-center/invite` 或 `/user-center/qrcode`
2. `take_snapshot` → 看到二维码 (qrcode chunk)
3. 截图 `round3-m5-invite-qr.png`

**断言**：

- API：`POST /api/invite/qrcodes` 创建 → `GET /api/invite/qrcodes/:id` 200
- 二维码渲染清晰

### §5.2 扫码统计

**步骤**：

1. 同一页面 → "扫码统计"
2. `GET /api/invite/scan-stats`
3. 截图 `round3-m5-scan-stats.png`

**断言**：

- API 200，至少 0 次

### §5.3 验证记录页

**步骤**：

1. `/user-center/verify/my-records`
2. `take_snapshot`
3. 截图 `round3-m5-my-records.png`

**断言**：

- API：`GET /api/invite/verification-records` 200

### §5.4 H5 邀请流程（移动端模拟）

**步骤**：

1. 调整 viewport 到 iPhone 12 (`evaluate_script` 设 `window.resizeTo` 或浏览器 `setViewportSize`)
2. 模拟扫码进入 H5 页面 `/user-center/verify/invite?sessionId=...`
3. 走答 5 道验证题（按 `api/invite/h5/quiz/:sessionId`）
4. `POST /api/invite/h5/endorsement/:sessionId/request` 等待背书
5. 截图 `round3-m5-h5-flow.png` (mobile)

**断言**：

- API 调用链完整
- 答完后状态变化

---

## §6 迁移地图（只读）

### §6.1 个人视角下迁徙地图

**步骤**：

1. 访问 `/clans/zhuxi-demo/migration`
2. 或 `/user-center/migration`
3. `take_snapshot`
4. 截图 `round3-m6-migration.png`

**断言**：

- API 200
- **对比管理员**：普通用户应没有"添加地点"按钮（编辑权限缺失是边界）
- 控制台应无 401/403 错误

---

## §7 小组讨论

### §7.1 我的小组

**步骤**：

1. `/user-center/groups`
2. `take_snapshot`
3. 截图 `round3-m7-groups.png`

**断言**：

- API：`GET /api/discussions/groups` 200

### §7.2 小组详情

**步骤**：

1. 点进一个小组 → `/user-center/groups/:id`
2. `take_snapshot`
3. 截图 `round3-m7-group-detail.png`

**断言**：

- API：`GET /api/discussions/groups/:id` + topics 列表 200

### §7.3 发起话题

**步骤**：

1. 小组详情 → "发起话题"
2. 填写标题 + 内容
3. 提交
4. `POST /api/discussions/topics`
5. 截图 `round3-m7-topic-create.png`

**断言**：

- API 201
- 列表立即新增

### §7.4 话题详情 / 跟帖

**步骤**：

1. `/user-center/topics/:id`
2. 回复
3. 截图 `round3-m7-topic-detail.png`

---

## §8 影像视频（个人版）

### §8.1 我的视频

**步骤**：

1. `/user-center/videos`
2. `take_snapshot`
3. 截图 `round3-m8-videos.png`

**断言**：

- API：`GET /api/video/projects` 200

### §8.2 创建血脉视频

**步骤**：

1. `/user-center/lineage-video/create` → 上传几张图、选人物
2. `POST /api/lineage-video/projects`
3. 等待完成
4. 截图 `round3-m8-lineage-create.png`

**断言**：

- API 201
- 跳转到详情并可播放

### §8.3 视频预览

**步骤**：

1. `/user-center/lineage-video/detail/:id`
2. 截图 `round3-m8-lineage-detail.png`

**断言**：

- API：`GET /api/lineage-video/projects/:id` 200

---

## §9 公告（阅读）

### §9.1 查看公告

**步骤**：

1. `/user-center/announcements`
2. `take_snapshot`
3. 截图 `round3-m9-announce-read.png`

**断言**：

- API 200
- **对比管理员**：不应有"发布"或"编辑"按钮

---

## §10 童年地方

### §10.1 童年地方页

**步骤**：

1. `/user-center/childhood-places`
2. `take_snapshot`
3. 截图 `round3-m10-childhood.png`

**断言**：

- API 200
- 已验证地点显示在地图上（地图模块）

---

## §11 个人图册 / 照片

### §11.1 我的相册列表

**步骤**：

1. `/user-center/albums`
2. `take_snapshot`
3. 截图 `round3-m11-albums.png`

**断言**：

- API：`GET /api/personal-space/albums` 200

### §11.2 创建相册

**步骤**：

1. 新建相册 → 命名
2. `POST /api/personal-space/albums`
3. 截图 `round3-m11-album-create.png`

**断言**：

- API 201
- 列表新增一行

### §11.3 上传照片

**步骤**：

1. 进入相册 → 上传一张测试照片
2. `POST /api/personal-space/photos/upload`
3. 等待上传进度
4. 截图 `round3-m11-photo-upload.png`

**断言**：

- API 201
- 缩略图正确
- COS 路径正确

### §11.4 移动照片到其他相册

**步骤**：

1. 选照片 → "移动到" → 选另一相册
2. `POST /api/personal-space/photos/:id/move`
3. 截图 `round3-m11-photo-move.png`

**断言**：

- API 200
- 列表归属正确变化

### §11.5 删除照片

**步骤**：

1. 选中照片 → 删除
2. `DELETE /api/personal-space/photos/:id`
3. 截图 `round3-m11-photo-delete.png`

**断言**：

- API 200
- 列表立即移除

---

## §12 家族关系（个人设置）

### §12.1 我的当前关系

**步骤**：

1. `/user-center/family-relation`
2. `take_snapshot`
3. 截图 `round3-m12-relation.png`

**断言**：

- API：`GET /api/family-relation/my-person` 200

### §12.2 隐私设置

**步骤**：

1. 切换"是否在寻亲名单中显示"
2. `PUT /api/family-relation/privacy`
3. 截图 `round3-m12-privacy.png`

**断言**：

- API 200
- 列表 / 寻亲匹配接口立即过滤

### §12.3 关系变更历史

**步骤**：

1. `/user-center/family-relation/history`
2. 截图 `round3-m12-history.png`

**断言**：

- API：`GET /api/family-relation/history` 200

---

## §13 时光轴（个人版）

### §13.1 我的时光轴

**步骤**：

1. `/user-center/timeline`
2. `take_snapshot`
3. 截图 `round3-m13-timeline.png`

**断言**：

- API 200
- 应仅显示涉及本人 / 本人的事件

---

## §14 跨族搜索

### §14.1 搜索仅本家族？

**步骤**：

1. `/user-center/search` 或 `/search`
2. 输入"朱"
3. 截图 `round3-m14-search.png`

**断言**：

- API：`GET /api/search?q=朱` 200
- 命中结果来自"朱熹族谱"家族（族员只能搜到本人所属家族）
- 管理员视角若测试过，对比应一致

---

## §15 印刷订单

### §15.1 我的订单

**步骤**：

1. `/user-center/orders`
2. `take_snapshot`
3. 截图 `round3-m15-orders.png`

**断言**：

- API：`GET /api/orders` 200

### §15.2 订单详情

**步骤**：

1. 点进任一订单
2. `/user-center/orders/:id`
3. 截图 `round3-m15-order-detail.png`

**断言**：

- API：`GET /api/orders/:id` 200

---

## §16 工具箱

### §16.1 工具箱入口

**步骤**：

1. `/user-center/toolbox`
2. `take_snapshot`
3. 截图 `round3-m16-toolbox.png`

**断言**：

- API 200
- 显示可用工具：邀请、二维码、AI 助手、家谱册等卡片

---

## §17 设置

### §17.1 账户设置

**步骤**：

1. `/user-center/settings`
2. 切换"消息推送"开关
3. 提交
4. 截图 `round3-m17-settings.png`

**断言**：

- API：`PATCH /api/user/settings` 200
- 状态正确

---

## §18 记忆问答（memory 模块）

### §18.1 答题

**步骤**：

1. 访问记忆问答模块（可能通过首页卡片或家族入口）
2. 获取题目：`GET /memory/quiz`
3. 提交答案：`POST /memory/quiz/submit`
4. 截图 `round3-m18-quiz.png`

**断言**：

- API 200
- 答题正确时返回徽章：`GET /memory/badges`

### §18.2 音像墙

**步骤**：

1. `GET /memory/wall` 或 `/memory/wall` UI
2. 截图 `round3-m18-wall.png`

**断言**：

- API 200

### §18.3 验证地点

**步骤**：

1. `GET /memory/verified-locations`
2. 截图 `round3-m18-locations.png`

---

## §A 总结：本轮覆盖清单

| 模块 | 用例数 | 关键截图 |
|---|---|---|
| 登录入口 | 2 | round3-login-* |
| 直接血脉子树 | 2 | round3-families-* |
| 个人资料 | 2 | round3-m1-*, m2-avatar |
| 家谱册 | 4 | round3-m3-* |
| 寻亲匹配 | 3 | round3-m4-* |
| 寻亲邀请 | 4 | round3-m5-* |
| 迁徙只读 | 1 | round3-m6-migration |
| 小组讨论 | 4 | round3-m7-* |
| 影像视频 | 3 | round3-m8-* |
| 公告阅读 | 1 | round3-m9-announce |
| 童年地方 | 1 | round3-m10-childhood |
| 个人图册 | 5 | round3-m11-* |
| 家族关系 | 3 | round3-m12-* |
| 个人时光轴 | 1 | round3-m13-timeline |
| 跨族搜索 | 1 | round3-m14-search |
| 印刷订单 | 2 | round3-m15-* |
| 工具箱 | 1 | round3-m16-toolbox |
| 设置 | 1 | round3-m17-settings |
| 记忆问答 | 3 | round3-m18-* |
| **合计** | **44** | — |
