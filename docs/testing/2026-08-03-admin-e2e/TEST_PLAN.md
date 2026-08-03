# GeneaSphere 族谱管理员端到端测试方案

> 测试日期：2026-08-03  
> 测试负责人：Qoder（MiniMax-M3）  
> 测试类型：族谱管理员（OWNER/ADMIN/EDITOR）端到端验收  
> 应用版本：演示数据库 + 朱熹族谱（28 代 / 1000 人 seed）  
> 测试入口：<http://localhost:5173>（前端）、<http://localhost:3101>（后端 API）

---

## 1. 角色体系与可访问模块映射

| 角色 | 演示账号/手机 | 密码 | JWT.role | 可访问范围 |
|------|--------------|------|----------|-----------|
| 平台 SUPER | `platform_admin` | `admin123` | super | `/platform-admin/*` 全局控制台 |
| 平台 OPERATOR | `platform_operator` | `admin123` | operator | 平台侧只读审核、订单 |
| 平台 FINANCE | `platform_finance` | `admin123` | finance | 充值订单、定价管理 |
| 平台 AUDITOR | `platform_auditor` | `admin123` | auditor | 全局操作日志 |
| **家族 OWNER** | `13800000000` | `demo123` | OWNER | `/zupu/:slug/*` 全部功能（含 OWNER 专属） |
| **家族 EDITOR** | `13800000001` | `demo123` | EDITOR | 用户中心 `/user-center/*`，**禁止**进入管理后台 |

> 演示家族通过 `DemoSeedService.seedDemoData()` 自动生成：`朱熹家族` slug = `zhu-xi`（1000 人、28 代、约 400 家庭单元、若干家人迁徙事件、生平影像等）。

---

## 2. 测试场景设计

### 场景 A：登录认证（含一键登录）
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| A1 | 演示管理员通过一键登录按钮快速进入系统 | 1. 打开 `/login`；2. 点击「一键登录管理员」按钮 | POST `/api/auth/demo-login` 200；返回 token 写入 `localStorage.geneasphere_token`；跳转 `/select-family` 或家族后台 | 角色=OWNER；token 有效载荷含 `role:OWNER` |
| A2 | 普通族员使用一键登录 | 1. 打开 `/login`；2. 点击「一键登录普通族员」 | POST `/api/auth/demo-member-login` 200；跳转 `/clans`（因 EDITOR 角色无权进管理后台） | 角色=EDITOR；访问 `/zupu/:slug` 会被 `router.beforeEach` 重定向到 `/clans` |
| A3 | 错误密码登录 | POST `/api/auth/login` 用错密码 | 401 / 友好提示 | UI 显示错误条幅，不泄漏栈信息 |
| A4 | Token 过期访问管理页 | 删除 token 后访问 `/zupu/zhu-xi/members` | 重定向 `/login?redirect=...` | 重定向参数保留原意图 |
| A5 | 退出登录 | 点击 Avatar → 退出 | 清空 token；重定向 `/` | localStorage 不残留 geneasphere_token |

### 场景 B：管理员控制面板（Dashboard）
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| B1 | 进入管理员控制台 | 登录后跳到 `/zupu/zhu-xi` | 显示关键 KPI 卡片：人数、家庭、迁徙、媒体、出生/逝世率 | KPI 数字 ≥ 1000 人、家庭 ≥ 400 |
| B2 | 控制台近期活动加载 | 下拉刷新/分页 | 显示最近 10 条家族事件（创建、合并、删除） | 时间倒序；点击进入对应详情 |
| B3 | 跳转子页 | 点击某 KPI 或左侧菜单 | 路由切换且无白屏（vue-router 懒加载工作） | 关键模块加载延迟 < 1.5s |

### 场景 C：族谱树（核心：1000+ 人大数据渲染）
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| C1 | 进入族谱树页 | 菜单：`族谱树` 或 `/tree/:clanId` | 加载约 1000 节点；G6 v5.1.1 渲染；首屏时间 < 5s | console 无 `transform not registered` 错误 |
| C2 | 搜索人物 | 顶部搜索框：输入「朱熹」 | 输入联想；点击跳转节点；视口聚焦 | URL 出现 `?focus=<id>`；节点居中 |
| C3 | 缩放/平移 | 鼠标滚轮/拖拽 | 缩放范围 0.1x~4x；平移无卡顿 | 性能：拖拽 ≥ 30 fps |
| C4 | 节点 click | 点击某节点 | 弹出 Drawer 显示人物详情、家谱路径 | 跳页/弹层选择取决于配置 |
| C5 | 字辈筛选 | 切换字辈 Tab（朱/松/...） | 仅渲染该字辈分支 | 节点数 ≈ 字辈范围 |
| C6 | 配偶边渲染 | 在树根页面 | 丈夫-妻子横向边连接 | 不应出现重叠乱序 |

### 场景 D：成员管理
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| D1 | 查看成员列表 | `/zupu/zhu-xi/members` | 表格分页；支持按角色/状态筛选 | 总数 ≥ 1000（演示 seed） |
| D2 | 修改成员角色 | 选某成员 → 编辑角色 OWNER→EDITOR | 弹窗确认；`PATCH` 成功 | 后端日志写入 audit log |
| D3 | 删除/停用成员 | 触发删除 | 二次确认 + 软删除；进入 `trash` | 二次弹窗；toast 反馈 |
| D4 | 添加新成员 | 弹窗输入手机号/昵称 → 触发邀请/直加 | 成功后表格刷新 | 新成员出现在列表首位 |
| D5 | 权限隔离 | 用 EDITOR 访问 `/zupu/zhu-xi/members` | 跳 `/clans`（需 `OWNER/ADMIN`） | 路由 guard 阻止 |

### 场景 E：内容审核
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| E1 | 影像审核 | `/zupu/zhu-xi/reviews/media` | 待审列表；可通过/拒绝 | 操作有 toast；列表更新 |
| E2 | 生平审核 | `/zupu/zhu-xi/reviews/bio` | 文本 diff 视图 | 改动行高亮 |
| E3 | 举报管理 | `/zupu/zhu-xi/reports` | 显示举报原因 + 举报人 | 可批量处理 |

### 场景 F：族谱生成（PDF）
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| F1 | 选世代范围 | `/zupu/zhu-xi/genealogy/generate` | 选择样式（古典/现代）、起始-结束代 | 步进器输入有效 |
| F2 | 一键生成 | 点击生成 | 进度条/异步；完成后下载链接 | PDF 文件含封面 + 人物表 |
| F3 | 历史版本 | `/zupu/zhu-xi/genealogy/history` | 列表分页；可重新下载 | 文件可在浏览器打开 |

### 场景 G：迁徙地图
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| G1 | 进入迁徙管理 | `/zupu/zhu-xi/migration` | 高德/Leaflet 地图 + 地点标注 | 标记数 ≥ seed 数据 |
| G2 | 新增迁徙事件 | 弹窗：起点、终点、年代、家族世代 | API `POST /api/migration/:slug/events` 成功 | 时间轴新增节点 |
| G3 | 时间轴拖动 | 拖动时间轴 slider | 地图标记随时代过滤 | 仅显示该时代内事件 |

### 场景 H：大事件 & 公告
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| H1 | 大事件列表 | `/zupu/zhu-xi/family-events` | 表格 + 批量操作 | 列表支持搜索 |
| H2 | 批量生成 | 调用 `bulk` 接口 | 后端记录数 +N | 历史版本显示 |
| H3 | 公告发布 | `/zupu/zhu-xi/announcements` 创建公告（含富文本） | 富文本保存；列表置顶 | 内容含 emoji/图片时正确存储 |

### 场景 I：PDF/Excel 数据导入
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| I1 | PDF 族谱文档导入 | 进入 `/import` 上传 PDF | OCR（Tesseract.js）异步解析 | 自动降级（腾讯云未配置时本地 OCR） |
| I2 | 导入管理 | `/zupu/zhu-xi/import` | 任务列表 + 状态 | 失败任务可重试 |

### 场景 J：系统设置 / 字辈 / 云存储
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| J1 | 隐私配置 | `/zupu/zhu-xi/settings/privacy` | 颗粒度设置生效 | 保存后接口返回最新 |
| J2 | 字辈管理 | `/zupu/zhu-xi/settings/xipai` | 添加/编辑字符 | 字符排序按 Pinyin 或定义顺序 |
| J3 | 家族信息 | `/zupu/zhu-xi/settings/clan-info` | 修改名称/简介 | 头像/简介可保存 |
| J4 | 云存储 | `/zupu/zhu-xi/settings/storage` | COS 套餐与用量 | 当前用量与套餐容量对比正确 |

### 场景 K：邀请体系
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| K1 | 生成邀请码 | `/zupu/zhu-xi/invite/qrcodes` | 二维码图片可下载 | 二维码指向 h5/scan |
| K2 | 查看验证记录 | `/zupu/zhu-xi/invite/records` | 列表分页 + 状态筛选 | 已验证/未验证标签 |
| K3 | 信息修改审核 | `/zupu/zhu-xi/invite/reviews` | 改动 diff + 通过/拒绝 | 拒绝理由必填 |

### 场景 L：寻亲管理
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| L1 | 认亲申请 | `/zupu/zhu-xi/merge/applications` | 申请列表 + 合并向导 | 点击进入 `MergeWizardPage` |
| L2 | 寻亲帖 | `/zupu/zhu-xi/merge/posts` | 帖子列表 | 可上下线/置顶 |

### 场景 M：短信/订单/操作日志
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| M1 | 发送短信 | `/zupu/zhu-xi/sms/send` 选择接收人/模板 | 二次确认（防误发） | 余额扣减展示 |
| M2 | 余额管理 | `/zupu/zhu-xi/sms/balance` | 充值订单列表 | 支付链接对接占位 |
| M3 | 订单管理 | `/zupu/zhu-xi/orders` | 印刷订单分页 | 状态机：待付/已付/已发货 |
| M4 | 操作日志 | `/zupu/zhu-xi/logs` | 操作类型 + IP + 时间 | 支持按时间范围过滤 |

### 场景 N：权限边界（关键）
| ID | 用户故事 | 步骤 | 预期结果 | 验证点 |
|----|----------|------|----------|--------|
| N1 | EDITOR 直接访问管理页 URL | EDITOR 登录后输入 `/zupu/zhu-xi/members` | 重定向 `/clans` | 路由 guard 触发 |
| N2 | EDITOR 调管理 API | 用 EDITOR token 调 `GET /api/admin/members` | 403 Forbidden | 后端 guard 拒绝 |
| N3 | 跨家族访问 | OWNER-A 直接构造 OWNER-B 的 clan slug | 403 / 404 | 没有 cross-clan 越权 |

---

## 3. 测试流程

1. **环境就绪**：SSH 隧道 15432、前端 5173、后端 3101 已启动并健康
2. **登录认证（A 组）**：先做演示登录，对照 token 解析
3. **核心功能走查（B-H 组）**：从仪表盘一路到公告发布
4. **高级管理（I-M 组）**：导入/设置/邀请/寻亲/短信
5. **权限边界验证（N 组）**：切换 EDITOR 进行拒绝路径覆盖

每个用例记录：
- 请求 URL / Method / Payload（脱敏）
- 响应状态码 + 关键字段
- 控制台/页面错误
- 性能计时（如加载 > 3s 标注）
- 实际截图或 DOM 关键节点摘录

报告最终落盘 `docs/testing/2026-08-03-admin-e2e/REPORT.md`。
