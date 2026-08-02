# Round 2 — 族员（EDITOR）测试报告模板

> 测试时间：____________
> 测试执行：Qoder AI Agent
> 测试角色：族员（EDITOR，phone=13800000001，朱小小）
> 演示族谱：朱熹族谱（演示）/ zhuxi-demo
> 数据视图：朱小小直系血脉子树（节点数 ≪ 1000）

## 总览
| PASS | FAIL | SKIP | 总计 |
|---|---|---|---|
| 0   | 0   | 0   | 44  |

## 用例明细

### §0 登录入口
| # | 用例 | API | 结果 |
|---|---|---|---|
| 1 | 族员一键登录 | POST /api/auth/demo-member-login 200 → /user-center/profile | ⬜ |
| 2 | demo-person 关联 | GET /api/auth/me/demo-person 200 → person.full_name="朱小小" | ⬜ |

### §1 子树
| # | 用例 | API | 结果 |
|---|---|---|---|
| 3 | 子树渲染 | GET /api/tree/subtree/... 200, 人数 ≪ 1000 | ⬜ |

### §2 个人资料
| # | 用例 | API | 结果 |
|---|---|---|---|
| 4 | 资料修改 | PATCH /api/profile 200 | ⬜ |
| 5 | 头像上传 | POST /api/profile/avatar 201 | ⬜ |

### §3 家谱册
| # | 用例 | API | 结果 |
|---|---|---|---|
| 6 | 列表 | GET /api/family-book/projects 200 | ⬜ |
| 7 | 创建 | POST + preview-estimate + generate 200 | ⬜ |
| 8 | 预览 | GET PDF 流 200 | ⬜ |
| 9 | 下单 | POST .../order 201 | ⬜ |

### §4 寻亲匹配
| # | 用例 | API | 结果 |
|---|---|---|---|
| 10 | 列表 | GET /api/buddy/matches 200 | ⬜ |
| 11 | 详情 | GET ...:id 200 | ⬜ |
| 12 | 发起关联 | POST confirm-request 201 | ⬜ |

### §5 邀请 / 扫码
| # | 用例 | API | 结果 |
|---|---|---|---|
| 13 | 二维码 | POST /api/invite/qrcodes 201 | ⬜ |
| 14 | 扫码统计 | GET /scan-stats 200 | ⬜ |
| 15 | 验证记录 | GET verification-records 200 | ⬜ |
| 16 | H5 邀请 | /api/invite/h5/* 全链 200 | ⬜ |

### §6 迁徙只读
| # | 用例 | API | 结果 |
|---|---|---|---|
| 17 | 地图只读 | GET migration 200, 无"添加"按钮 | ⬜ |

### §7 小组讨论
| # | 用例 | API | 结果 |
|---|---|---|---|
| 18 | 我的小组 | GET groups 200 | ⬜ |
| 19 | 小组详情 | GET groups/:id 200 | ⬜ |
| 20 | 发起话题 | POST topics 201 | ⬜ |
| 21 | 话题详情 + 回复 | POST reply 201 | ⬜ |

### §8 影像视频
| # | 用例 | API | 结果 |
|---|---|---|---|
| 22 | 我的视频列表 | GET projects 200 | ⬜ |
| 23 | 创建血脉视频 | POST + jobs 链 | ⬜ |
| 24 | 视频预览 | GET /:id 200 | ⬜ |

### §9 公告
| # | 用例 | API | 结果 |
|---|---|---|---|
| 25 | 阅读 | GET 200, 无"发布"按钮 | ⬜ |

### §10 童年地方
| # | 用例 | API | 结果 |
|---|---|---|---|
| 26 | 查看 + 地图渲染 | GET 200 | ⬜ |

### §11 个人图册
| # | 用例 | API | 结果 |
|---|---|---|---|
| 27 | 列表 | GET /api/personal-space/albums 200 | ⬜ |
| 28 | 创建相册 | POST 201 | ⬜ |
| 29 | 上传照片 | POST /photos/upload 201 | ⬜ |
| 30 | 移动照片 | POST /:id/move 200 | ⬜ |
| 31 | 删除照片 | DELETE /:id 200 | ⬜ |

### §12 家族关系
| # | 用例 | API | 结果 |
|---|---|---|---|
| 32 | 我的关系 | GET /family-relation/my-person 200 | ⬜ |
| 33 | 隐私设置 | PUT /privacy 200 | ⬜ |
| 34 | 关系历史 | GET /history 200 | ⬜ |

### §13 个人时光轴
| # | 用例 | API | 结果 |
|---|---|---|---|
| 35 | 渲染 | GET 200, 仅本家族事件 | ⬜ |

### §14 跨族搜索
| # | 用例 | API | 结果 |
|---|---|---|---|
| 36 | 搜索 | GET /search 200, 命中仅本家族 | ⬜ |

### §15 印刷订单
| # | 用例 | API | 结果 |
|---|---|---|---|
| 37 | 订单列表 | GET /api/orders 200 | ⬜ |
| 38 | 订单详情 | GET /:id 200 | ⬜ |

### §16 工具箱
| # | 用例 | API | 结果 |
|---|---|---|---|
| 39 | 入口卡片 | GET 200 | ⬜ |

### §17 设置
| # | 用例 | API | 结果 |
|---|---|---|---|
| 40 | 推送开关 | PATCH /api/user/settings 200 | ⬜ |

### §18 记忆问答
| # | 用例 | API | 结果 |
|---|---|---|---|
| 41 | 答题 | GET quiz + POST submit 200 | ⬜ |
| 42 | 音像墙 | GET /memory/wall 200 | ⬜ |
| 43 | 验证地点 | GET /memory/verified-locations 200 | ⬜ |

### 跨角色回归
| # | 用例 | API | 结果 |
|---|---|---|---|
| 44 | 访问 /admin/members | GET /api/admin/members 403 | ⬜ |

## 失败用例清单
（执行后填写）

## 总结
- 通过：__ /44
- 失败：__
- 下一步：____________
