# Round 3 — 跨角色权限边界测试报告模板

> 测试时间：____________
> 测试执行：Qoder AI Agent
> 测试角色：跨角色矩阵
> 测试目的：验证权限隔离 / 路由守卫 / JWT 鉴权 / 状态污染防御

## 总览
| PASS | FAIL | SKIP | 总计 |
|---|---|---|---|
| 0   | 0   | 0   | 23  |

## 用例明细

### 未登录访问受保护路由
| # | 用例 | 期望 | 实际 |
|---|---|---|---|
| B1 | `/zupu/zhuxi-demo/dashboard` | 跳 /login | ⬜ |
| B2 | `/admin/members` | 跳 /login | ⬜ |
| B3 | `/user-center/profile` | 跳 /login | ⬜ |
| B4 | `/platform-admin/families` | 跳 /login | ⬜ |

### 已登录角色越权访问
| # | 用例 | 期望 | 实际 |
|---|---|---|---|
| B5 | OWNER → /user-center/profile | 跳 /admin 或降级渲染 | ⬜ |
| B6 | OWNER → /platform-admin/families | 403 | ⬜ |
| B7 | EDITOR → /admin/members | 跳 /login 或 403 | ⬜ |
| B8 | EDITOR → /platform-admin/families | 跳 /login | ⬜ |
| B9 | EDITOR → /admin/migration | 403 | ⬜ |
| B10 | EDITOR → /admin/import | 403 | ⬜ |
| B11 | OWNER → /user-center/albums | 跳 /admin | ⬜ |

### API 层鉴权
| # | 用例 | 期望 | 实际 |
|---|---|---|---|
| B12 | 缺 token → GET /api/admin/members | 401 | ⬜ |
| B13 | EDITOR token → GET /api/admin/members | 403 | ⬜ |
| B14 | 演示 token → GET /api/platform/families | 403 | ⬜ |
| B15 | EDITOR token → 携带管理员路由点链接 | 拒绝 | ⬜ |

### 状态污染
| # | 用例 | 期望 | 实际 |
|---|---|---|---|
| B16 | 退出登录后 localStorage 三键全 null | ✅ | ⬜ |
| B17 | 切换 token 登录（旧失效） | ✅ | ⬜ |
| B18 | Token 过期 / 篡改 → 401 + 跳 /login | ✅ | ⬜ |
| B19 | 多 tab 状态独立 | ✅ | ⬜ |

### 钓鱼 / 篡改
| # | 用例 | 期望 | 实际 |
|---|---|---|---|
| B20 | CORS / CSRF 预检 | OPTIONS 失败 | ⬜ |
| B21 | 篡改 demo_clan_slug | API 403 / 不显示数据 | ⬜ |

### 限流 / 锁定
| # | 用例 | 期望 | 实际 |
|---|---|---|---|
| B22 | 5 次错误密码 → 锁定 | 第 6 次返回锁定 | ⬜ |

### 安全 Headers
| # | 用例 | 期望 | 实际 |
|---|---|---|---|
| B23 | CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy | 全部存在 | ⬜ |

## 失败用例

### F1 — <用例名>
- **期望**：...
- **实际**：...
- **截图**：...
- **初步定位**：...

## 总结
- 通过：__ /23
- 失败：__
- 是否阻塞发版：☐ 是 ☐ 否
- 修复建议：____________
