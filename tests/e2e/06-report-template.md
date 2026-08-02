# 06 — 测试报告模板 & 截图归档规范

---

## 一、单轮报告模板

复制以下模板填充 `tests/e2e/reports/round-N-actual.md`：

```markdown
# Round N — <角色> <类型> 测试报告

| 字段 | 值 |
|---|---|
| 测试执行者 | Qoder AI |
| 测试轮次 | Round N |
| 测试角色 | 管理员 / 族员 / 跨角色 |
| 测试日期 | 2026-08-01 |
| 总耗时 | ~X 分钟 |
| 浏览器环境 | Chromium via Playwright |
| 服务环境 | 前后端已启动 / SSH 隧道 OK / 数据库就绪 |
| 通过用例 | X |
| 失败用例 | Y |
| 跳过用例 | Z |
| 总用例 | N |

---

## 一、环境检查

- [x] 前端 `http://localhost:5173/` —— `VITE v5.4.21 ready`
- [x] 后端 `http://localhost:3101` —— `🚀 寻根路后端启动`
- [x] 数据库隧道 `127.0.0.1:15432` —— 可达
- [x] Demo 账号生效 —— `POST /api/auth/demo-login` 200

---

## 二、用例执行明细

### A1 家族信息

- **步骤**：访问 `/admin/clan-info` → 修改名称 → 提交
- **API 校验**：
  - `GET /api/clans/:id` → 200
  - `PATCH /api/clans/:id` → 200
- **UI 断言**：标题"朱熹族谱（演示）"可见，修改后立刻反映
- **控制台**：无 error
- **截图**：`round2-clan-info-before.png`, `round2-clan-info-after.png`
- **结果**：✅ PASS

### A2 族谱树加载

- **步骤**：登录管理员 → 进入 dashboard
- **API 校验**：`GET /api/tree/clan/zhuxi-demo/full` → 200，personCount ≥ 1000
- **UI 断言**：看到树画布、主支高亮、工具栏
- **性能**：首屏 ≤ 3 秒（含进度条）
- **截图**：`round1-tree-load.png`
- **结果**：✅ PASS

...（其他用例同样格式）

---

## 三、失败用例清单（如有）

### F1 — <用例名>

- **期望**：...
- **实际**：...
- **复现路径**：
  1. 第一步 ...
  2. 第二步 ...
- **截图**：`roundN-mod-fail.png` + 控制台 + Network
- **控制台错误**：
  ```
  [error] Cannot read properties of undefined
  ```
- **初步定位**：
  - **模块**：`apps/web/src/views/admin/...`
  - **接口**：`POST /api/...`
  - **可能原因**：...
- **建议下一步**：...

---

## 四、性能数据汇总

| 指标 | 期望 | 实际 |
|---|---|---|
| 登录页加载 | <1s | 0.6s |
| 1000 人 G6 首屏 | <3s | X.Xs |
| 路由跳转 | <500ms | Xms |
| 首屏字节 | <2MB | X.XMB |

---

## 五、API 调用统计

| 模块 | GET | POST | PUT | PATCH | DELETE | 失败数 |
|---|---|---|---|---|---|---|
| Auth | 3 | 2 | 0 | 0 | 0 | 0 |
| Tree | 5 | 2 | 0 | 1 | 0 | 0 |
| ... | | | | | | |

---

## 六、安全 Headers 校验（来自 `apps/server/src/common/security-headers.middleware.ts`）

| Header | 期望存在 | 实际 |
|---|---|---|
| Content-Security-Policy | ✅ | ✅/❌ |
| X-Frame-Options | ✅ | ✅/❌ |
| X-Content-Type-Options | ✅ | ✅/❌ |
| Referrer-Policy | ✅ | ✅/❌ |

---

## 七、截图归档

- 路径：`tests/e2e/screenshots/`
- 命名：`round{N}-{模块英文}-{步骤}.png`
- 例：`round1-tree-load.png`, `round3-b7-member-on-admin.png`
- 数量：本轮共 25 张

---

## 八、结论与下一步

- **本轮 PASS**：✅
- **遗留问题**：如 §三 失败清单
- **建议下一轮**：...
```

---

## 二、截图归档规范

### 命名规则

```
round{N}-{module-short}-{step-short}-{state}.png

例：
round1-login-admin-success.png
round2-m11-photo-upload-loading.png
round3-b7-member-on-admin.png
round4-p1-perf-tree.png
```

### 状态后缀（可选）

| 后缀 | 含义 |
|---|---|
| `-before` | 操作前状态 |
| `-loading` | 操作进行中（含进度条） |
| `-after` | 操作完成后 |
| `-success` | 成功 toast 后 |
| `-error` | 错误 toast 后 |

### 归档目录

```
tests/e2e/screenshots/
  round0/    # 冒烟
  round1/    # 管理员
  round2/    # 族员
  round3/    # 跨角色
  round4/    # 性能与回归
```

每轮开始时清空对应子目录或归档到 `tests/e2e/screenshots/_archive/{date}/`。

---

## 三、报告输出原则

1. **每轮报告独立**：不混用，前轮失败不影响本轮独立 PASS/FAIL 判定。
2. **失败必有截图 + 控制台 error + 复现路径**：三缺一不算 FAIL，必须补。
3. **性能数据**：所有"长耗时"用例（≥1 秒）必记录实际耗时。
4. **API 校验**：每个用例必须引用至少 1 个 API 状态码（200/201/400/401/403）。
5. **跨角色矩阵**：Round 3 的 23 项必现矩阵每项都要落实。
6. **可重入**：所有修复后必须重新跑整轮，不能只跑失败项。

---

## 四、报告归档

每完成一轮报告，将其 git commit：

```bash
git add tests/e2e/reports/round-N-actual.md tests/e2e/screenshots/roundN/
git commit -m "test(e2e): Round N <角色> 测试报告 — <PASS/FAIL:统计>"
```

下游 CI 可基于报告中的 `<FAIL>`/`FAIL` 关键字判断是否阻塞发版。

---

## 五、相关脚本

- 服务检查：`tests/e2e/scripts/check-services.ps1`
- 锁定清理：`DELETE FROM login_attempts WHERE subject_key = '13800000000';`
- 数据库 reseed（仅紧急）：`scripts/seed-merge-demo.cjs`
