# Round 3 — 跨角色权限实测报告

> 测试时间：2026-08-01；角色切换方式：清理浏览器状态后分别执行管理员/族员一键登录。

## 权限边界

族员（EDITOR）访问管理员路由时，以下 4 项均被重定向到 `/clans`，未进入后台页面：

| 编号 | 管理员路径 | 实际结果 |
|---|---|---|
| C1 | `/zupu/zhuxi-demo/members` | ✅ 重定向 `/clans` |
| C2 | `/zupu/zhuxi-demo/announcements` | ✅ 重定向 `/clans` |
| C3 | `/zupu/zhuxi-demo/statistics` | ✅ 重定向 `/clans` |
| C4 | `/zupu/zhuxi-demo/logs` | ✅ 重定向 `/clans` |

管理员访问用户中心 `/user-center/profile` 未被错误拦截，页面正常展示。

## API 权限补充

- EDITOR + 管理员接口：members、announcements、logs、qrcodes 均返回 HTTP 403。
- OWNER + 相同核心接口：dashboard、members、announcements、logs、orders、qrcodes 均返回 HTTP 200。
- 统计接口曾使用错误的 `/api/admin/statistics` URL，返回 404；该结果不能作为权限失败，需按前端实际请求路径补测。

## 结论

Round 3：路由权限 **4/4 PASS**，核心 API 权限边界 **4/4 PASS**。统计 API 的 404 属于测试地址不匹配，保留为补测项。
