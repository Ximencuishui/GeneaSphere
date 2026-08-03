# Round 4 视觉验证证据

**测试日期**: 2026-08-02  
**测试账号**: 13800000000 (OWNER)  
**家族**: zhuxi-demo (朱熹演示家族)

---

## Evidence 1: Dashboard 全量渲染

**URL**: `http://localhost:5173/zupu/zhuxi-demo`  
**Title**: 寻根路 · xungenlu.cn · 寻根溯源、家族传承平台

```
欢迎回来，13800000000  2026年8月2日星期日  [管理成员]

[0 待办事项]  [1004 家族成员]  [5 家族影像]  [0.0G 已用存储]
[1004 族谱树]  [4 在世人数]  [5 照片总数]  [0 待办总数]

存储用量 0% | 已使用 0.00 GB | 总容量 5 GB | 剩余 5.00 GB

快速入口:
  隐私配置  字辈管理  生平审核  寻亲申请
  云存储    印刷订单  发送短信  短信余额

待办事项:  影像 0 · 生平 0 · 寻亲 0
          暂无待办事项，一切井然有序
```

---

## Evidence 2: 侧边栏 16 菜单项全部存在

```
1.  概况 (Overview / Dashboard)
2.  人员管理 (Members)
3.  内容审核 (Content Review)
4.  地方记忆 (Local Memory)
5.  寻亲管理 (Family Finding)
6.  家族公告 (Announcements)
7.  数据管理 (Data Management)
8.  影像管理 (Media Management)
9.  工具记录 (Tool Records)
10. 印刷服务 (Print Service)
11. 族谱生成 (Genealogy Generation)
12. 视频中心 (Video Center)
13. 事件管理 (Events)
14. 短信通知 (SMS)
15. 日志审计 (Logs)
16. 系统设置 (Settings)
```

---

## Evidence 3: 8 个 quick-item 端到端跳转

| # | 入口 | 目标路径 | 渲染内容（首 60 字） |
|---|---|---|---|
| 1 | 隐私配置 | `/settings/privacy` | 隐私配置游客可见范围允许查看已故人员仅展示前 N 代代（默认5） |
| 2 | 字辈管理 | `/settings/xipai` | 字辈管理 添加字辈 说明字辈用于规范家族成员的命名 |
| 3 | 生平审核 | `/reviews/bio` | 生平审核 批量通过 (0)  批量驳回 (0) 自定义理由驳回 |
| 4 | 寻亲申请 | `/merge/applications` | 认亲申请管理 查看可回滚快照 待处理待合并已合并已拒绝 |
| 5 | 云存储 | `/settings/storage` | 云存储0%已使用已用空间0.00 GB 总空间5 GB 剩余空间5.00 GB |
| 6 | 印刷订单 | `/orders` | 印刷订单管理全部待支付印刷中已发货已完成 |
| 7 | 发送短信 | `/sms/send` | 发送短信通知余额： ¥0.00充值余额不足当前余额为 0 元 |
| 8 | 短信余额 | `/sms/balance` | 短信余额 设置预警阈值 当前余额 ¥0.00 |

---

## Evidence 4: 35 个 admin 子路由全部 200+有内容

| 路由 | 状态 |
|---|---|
| `/members` 成员管理 | ✅ 84 char |
| `/reviews/media` 影像审核 | ✅ 54 char |
| `/reviews/bio` 生平审核 | ✅ 79 char |
| `/merge/applications` 认亲申请 | ✅ 77 char |
| `/merge/posts` 寻亲帖管理 | ✅ 46 char |
| `/migration` 迁徙管理 | ✅ 38 char |
| `/import` PDF 导入管理 | ✅ 134 char |
| `/settings/privacy` 隐私配置 | ✅ 103 char |
| `/settings/xipai` 字辈管理 | ✅ 75 char |
| `/settings/storage` 云存储 | ✅ 113 char |
| `/orders` 订单管理 | ✅ 70 char |
| `/genealogy/generate` 生成族谱 | ✅ 572 char |
| `/genealogy/history` 历史版本 | ✅ 87 char |
| `/video/migration` 迁徙历史视频 | ✅ 142 char |
| `/video/event` 大事件视频 | ✅ 145 char |
| `/family-events` 大事件列表 | ✅ 86 char |
| `/sms/send` 发送短信 | ✅ 140 char |
| `/sms/balance` 余额管理 | ✅ 204 char |
| `/logs` 操作日志 | ✅ 60 char |
| `/memory/quizzes` 题库管理 | ✅ 36 char |
| `/family-relation/reviews` 关系变更审核 | ✅ 41 char |
| `/family-relation/disputes` 子女归属争议 | ✅ 29 char |
| `/announcements` 公告管理 | ✅ 34 char |
| `/reports` 举报管理 | ✅ 42 char |
| `/statistics` 数据统计 | ✅ 18 char |
| `/trash` 回收站 | ✅ 72 char |
| `/media/library` 影像库 | ✅ 61 char |
| `/media/albums` 相册管理 | ✅ 33 char |
| `/toolbox-usage` AI 工具使用记录 | ✅ 64 char |
| `/family-albums` 家庭图册 | ✅ 38 char |
| `/settings/clan-info` 家族信息 | ✅ 101 char |
| `/settings/export` 数据导出 | ✅ 165 char |
| `/invite/qrcodes` 邀请二维码 | ✅ 39 char |
| `/invite/records` 验证记录 | ✅ 40 char |
| `/invite/reviews` 信息修改审核 | ✅ 37 char |

**0 个 404，0 个 空白页，0 个 报错。**

---

## Evidence 5: 网络请求健康

测试期间观察到浏览器发出的关键 API 请求：
- `GET /api/admin/dashboard?clanSlug=zhuxi-demo` → 200 OK, 258 bytes payload
- 解析成功: 成员 1004 · 照片 5 · 待办 0

所有 admin 子路由触发的 API 均返回 200。

---

## Evidence 6: 控制台 0 错误

测试期间浏览器控制台无 Vue/Network/JS 错误日志。
(playwright-cli 保存于 `e:\GeneaSphere\.playwright-cli\console-2026-08-02*.log`)
