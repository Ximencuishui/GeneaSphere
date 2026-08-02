# Round 1 — 管理员（OWNER）测试报告模板

> 测试时间：____________
> 测试执行：Qoder AI Agent
> 测试角色：管理员（OWNER，phone=13800000000）
> 演示族谱：朱熹族谱（演示）/ zhuxi-demo

## 环境
（同 Round 0）

## 总览
| PASS | FAIL | SKIP | 总计 |
|---|---|---|---|
| 0   | 0   | 0   | 35  |

## 用例明细（按模块）

### §0 登录入口
| # | 用例 | 步骤摘要 | API | UI | 控制台 | 截图 | 结果 |
|---|---|---|---|---|---|---|---|
| S1 | 登录页 UI | 看 2 个 demo 按钮 | — | ✅/❌ | 0 error | r1-login-page | ⬜ |
| S2 | 一键管理员登录 | click → 等待 /api/demo-login | 200✅/❌ | /zupu/zhuxi-demo ✅/❌ | 0 error | r1-login-admin | ⬜ |
| S3 | Landing Modal 入口 | 触发 + 进入 | 200✅/❌ | 双卡片 ✅/❌ | 0 error | r1-landing | ⬜ |
| S4 | 退出登录 | 头像菜单 → 退出 | — | token 清 ✅/❌ | 0 error | r1-logout | ⬜ |

### §1 族谱树
| # | 用例 | API | 耗时 | 结果 |
|---|---|---|---|---|
| A1 | 全树加载 | GET /api/tree/clan/zhuxi-demo/full 200; personCount ≥ 1000 | <3s | ⬜ |
| A2 | 搜索 + 聚焦 | GET /api/people/search 200 | — | ⬜ |
| A3 | 节点详情 | GET /api/tree/person/:id/detail 200 | — | ⬜ |
| A4 | 创建 Person | POST /api/tree/person 201 | — | ⬜ |
| A5 | 关系编辑 | POST + DELETE 200 | — | ⬜ |

### §2 家族信息
| # | 用例 | API | 结果 |
|---|---|---|---|
| B1 | 查看 + 编辑 | GET + PATCH 200 | ⬜ |
| B2 | 统计 | GET /api/clans/:id/statistics 200 | ⬜ |

### §3 成员管理
| # | 用例 | API | 结果 |
|---|---|---|---|
| C1 | 列表 | GET /api/admin/members 200 | ⬜ |
| C2 | 修改角色 | PATCH /api/admin/members/:id/role 200 | ⬜ |
| C3 | 移除成员 | DELETE /api/admin/members/:id 200 | ⬜ |
| C4 | 转移所有权 | PATCH /api/admin/members/transfer-ownership 200 | ⬜ |

### §4 媒体审核
| # | 用例 | API | 结果 |
|---|---|---|---|
| D1 | 待审列表 | GET /api/admin/reviews/media 200 | ⬜ |
| D2 | 通过 / 拒绝 | POST approve|reject 200 | ⬜ |
| D3 | 媒体库上传 | POST upload 201 | ⬜ |

### §5 导入 / 生成
| # | 用例 | API | 结果 |
|---|---|---|---|
| E1 | PDF OCR 上传 | POST /api/import/pdf + jobs/callback | ⬜ |
| E2 | 族谱图生成 | POST /api/genealogy-documents | ⬜ |

### §6 迁徙地图
| # | 用例 | API | 结果 |
|---|---|---|---|
| F1 | 地图加载 | GET /api/migration/:clanSlug/locations 200 | ⬜ |
| F2 | 编辑地点 | POST 201 | ⬜ |
| F3 | 降级容错 | 一级/二级/三级降级 | ⬜ |

### §7 家族事件
| # | 用例 | API | 结果 |
|---|---|---|---|
| G1 | 列表 | GET /api/family-events/:slug 200 | ⬜ |
| G2 | 创建 | POST 201 | ⬜ |
| G3 | 批量生成 | POST /generate-life-events 200 | ⬜ |

### §8 影像视频
| # | 用例 | API | 结果 |
|---|---|---|---|
| H1 | 血脉视频 | POST + jobs 链 | ⬜ |
| H2 | 事件视频 | POST /api/clan-*-videos 201 | ⬜ |

### §9 公告
| # | 用例 | API | 结果 |
|---|---|---|---|
| I1 | 发布 | POST 201 | ⬜ |

### §10 时光轴
| # | 用例 | API | 结果 |
|---|---|---|---|
| J1 | 全家族 | GET /timeline 200 | ⬜ |

### §11 搜索
| # | 用例 | API | 结果 |
|---|---|---|---|
| K1 | 跨族搜索 | GET /search?q=朱 200 | ⬜ |

### §12 印刷订单
| # | 用例 | API | 结果 |
|---|---|---|---|
| L1 | 列表 | GET /api/admin/orders 200 | ⬜ |
| L2 | 重新下单 | POST /api/admin/orders/:id/reorder 200 | ⬜ |

### §13 平台后台
| # | 用例 | API | 结果 |
|---|---|---|---|
| M1 | 进入平台后台 | GET /api/platform/* 403 (无平台角色) | ⬜ |
| M2 | 退出后访问 /admin/* | 跳 /login | ⬜ |

## 失败用例清单
（执行后填写）

## 总结
- 通过：__ /35
- 失败：__
- 下一步：____________
