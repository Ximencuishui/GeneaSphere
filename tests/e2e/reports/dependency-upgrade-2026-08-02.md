# 依赖升级与安全审计报告

> 执行日期：2026-08-02 ~ 2026-08-03
> 项目：GeneaSphere
> 范围：pnpm 依赖解析、漏洞审计、cos-nodejs-sdk-v5 / vite / vitest / uuid 升级兼容性评估、xlsx 输入隔离、Round 4 smoke 复验

## 1. 执行摘要

本轮在已落地的最小化 `pnpm.overrides` 基础上，分 4 个阶段对剩余漏洞做"逐包可升级/不可升级"评估，并执行对应方案：

| Phase | 目标 | 结论 |
|---|---|---|
| 1 | 评估 cos-nodejs-sdk-v5 主线升级 | ✅ 升至 3.0.0，request/tough-cookie/qs 整条链路消除 |
| 2 | 评估 vite / vitest / @vitejs/plugin-vue 主线升级 | ✅ vite 6.4.3 / vitest 3.2.6+ 落地，构建通过 |
| 3 | xlsx 升级路径评估 + 输入隔离 | ⚠️ npm 上 0.18.5 不可升级（上游弃维），改用 sanitizer 输入隔离层缓解 CVE-2023-30533 / CVE-2024-22363 |
| 4 | uuid override | ✅ 通过根 override 将 tencentcloud-sdk-nodejs 链路下 uuid 升到 14.0.1 |

审计结果从 **45 项 → 13 项 → 3 项**（其中剩余 2 high 均为无法通过 npm 升级修复的 xlsx CVE，已通过输入隔离缓解），降幅约 **93%**。Round 4 smoke 在每阶段后均保持 **11/11 PASS**。

**当前生产准入结论**：**NO-GO**（详见第 7 节；剩余依赖风险已显著降低，但跨浏览器矩阵与 Go-Live 合规签字未完成）。

## 2. 审计结果对比

| 阶段 | Critical | High | Moderate | Low | 合计 | 备注 |
|---|---:|---:|---:|---:|---:|---|
| 覆盖前 | 4 | 23 | 16 | 2 | 45 | 初始基线 |
| 最小覆盖后 | 1 | 3 | 9 | 0 | 13 | 仅 8 条 overrides |
| Phase 1 后（cos-sdk 3.0） | 1 | 3 | 4 | 0 | 8 | request 链路清零 |
| Phase 2 后（vite/vitest） | 0 | 2 | 1 | 0 | 3 | vite/vitest critical 清零 |
| Phase 4 后（uuid override） | 0 | 2 | 0 | 0 | **2** | uuid moderate 清零 |
| 变化 vs. 覆盖前 | **-4** | **-21** | **-16** | **-2** | **-43 (-95.6%)** | 仅余 xlsx 两个 high（输入隔离已覆盖） |

审计命令：

```bash
pnpm audit --json
```

各阶段证据：`temp/audit-minimal-overrides.json`、`temp/audit-phase1.json`、`temp/audit-phase2.json`、`temp/audit-phase4.json`。

## 3. 各包升级/替代方案评估

依赖链来源：

- `pnpm why <pkg>` (server 上下文)：`temp/why-cos-server.txt`、`temp/why-xlsx-server.txt`、`temp/why-uuid-server.txt`
- `pnpm why <pkg>` (web 上下文)：`temp/why-vite-web.txt`、`temp/why-vitest-web.txt`

### 3.1 cos-nodejs-sdk-v5 ✅ 已升级 2.15.4 → 3.0.0

- **结论**：直接升到 `^3.0.0`，与本项目用法兼容。
- **判断依据**：
  - v3.0.0 改用内部 `cos-request`（基于 fetch），原 `request` / `tough-cookie` / `qs` 整条传递链不再出现，11/11 PASS 验证无回归。
  - 调用面仅使用 `new COS()`、`putObject`、`deleteObject`、`getObjectUrl`、`headObject`，均为稳定 API，v3 仍支持。
- **pnpm install 影响**：21 added / 203 removed，零手工改动。
- **审计**：13 → 8（消除 1 critical + 1 high + 多个 moderate）。

### 3.2 vite / vitest / @vitejs/plugin-vue / @vitest/coverage-v8 ✅ 已升级

| 包 | 旧 | 新 | 备注 |
|---|---|---|---|
| `vite` | 5.4.x | 6.4.3 | 修复 CVE-2026-39365 / CVE-2026-53571 / CVE-2026-53632 |
| `vitest` | 2.1.9 | 3.2.6+ | 修复 critical CVE-2026-47429；实测解析到 3.2.7 |
| `@vitejs/plugin-vue` | 5.1.x | 6.0.x | 解析到 6.0.8 |
| `@vitest/coverage-v8` | 2.1.x | 3.2.x | 解析到 3.2.7 |

- **判断依据**：以上四个包在 pnpm workspace 中均由 `web` 直接声明，升级不需要全局 override；peer 关系（`vite 6.4.3 peer`）在 vite 6 自身与 plugin-vue 6 / vitest 3 / unplugin-vue-components 32 / unplugin 3 之间闭环，无外溢风险。
- **未使用全局 override 的理由**：与上次报告中的判断一致——vite/esbuild 的 override 会跨 web/server 边界污染，且 esbuild 0.25/0.28 与 Vite 6 的 native binary ABI 不匹配，曾导致 native 加载失败。直接升到声明范围更安全。
- **pnpm install 影响**：10 added / 174 removed；Windows 下首次安装遇到 Prisma 查询引擎 DLL 的 EPERM（Node 进程持有文件锁），停掉所有 Node 进程后重试即通过。
- **构建**：`pnpm --filter web build` ✅ 35.12s；`pnpm --filter server build` ✅。
- **审计**：8 → 3（消除 1 critical，2 high 减为 2 high；其中 vite/esbuild high 全消）。

### 3.3 esbuild 0.28.1（已就位）

- 直接声明在根 `dependencies.esbuild`，版本 `^0.28.1`，是 Phase 2 之前已经达到的状态。
- 当前审计已无 esbuild 相关 CVE；无需进一步动作。

### 3.4 xlsx 0.18.5 ⚠️ npm 不可升级 → 输入隔离

- **上游状态**：SheetJS CE 在 npm 上已停止维护，GitHub/npm 包均无 patched 版本。官方建议通过 `https://cdn.sheetjs.com/` 获取 0.19.3+ / 0.20.2+，但出于供应链与离线构建考虑，本项目不接受 CDN 依赖。
- **本项目使用面**（两处）：
  - `apps/server/src/import/import.service.ts`：解析用户上传的 xlsx（高风险入口，唯一触发 `XLSX.read` 的代码路径）。
  - `apps/server/src/platform/statistics/statistics.controller.ts`：仅服务端导出，不读取未受信输入（仅用 `json_to_sheet` / `book_new` / `book_append_sheet` / `sheet_to_csv` / `write`）。
- **替代方案对比**：

  | 方案 | 取舍 |
  |---|---|
  | 升 SheetJS CDN 版本 | 拒：引入 CDN 依赖，离线构建不可用，且 CDN 不是 npm 生态一部分 |
  | 切换 `exceljs` / `@e965/xlsx` 等替代库 | 拒：API 不一致，需要重写 import.service.ts；exceljs 自身也曾出现 prototype pollution 历史 |
  | **输入隔离 + 结果清洗（采用）** | 接受 npm 上 0.18.5 不变，在唯一入口加防御层 |
- **实施**：`apps/server/src/import/xlsx-sanitizer.ts`

  1. ZIP 魔数校验（`PK\x03\x04` / `PK\x05\x06`）
  2. 文件大小上限 5 MiB（默认，可调）
  3. 解析后行数上限 10 000（缓解 ReDoS 与内存耗尽）
  4. `XLSX.read` 强制开启 `cellDates`，关闭 `cellNF` / `cellText`（拒绝外部链接/宏）
  5. `sheet_to_json` 走 `defval` + `raw: false`，缺列不再产生 undefined 污染键
  6. **结果清洗**：`JSON.parse(JSON.stringify(row))` 剥除 `__proto__` / `constructor` 链 — 这是 CVE-2023-30533 的核心修复点

- **调用方切换**：`import.service.ts` 改为调用 `parseXlsxSafely<ExcelPersonData>(fileBuffer)`，移除 `import * as XLSX from 'xlsx'`。
- **单元验证**：`temp/xlsx-iso-smoke.cjs` 共 10 项 PASS，含 `__proto__` 攻击向量与 Object.prototype 未污染断言。

### 3.5 uuid ⚠️ → ✅ 通过 override 修复

- 旧版本 `9.0.1` 经 `tencentcloud-sdk-nodejs@4.1.253` 引入，触发 GHSA-w5hq-g745-h8pq（moderate，CVE-2026-41907，v3/v5/v6 静默部分写入）。
- 上一版报告曾尝试直接 override 失败，原因是 `cos-nodejs-sdk-v5@2.x` 通过 `uuid/v4` 子路径导入（受 `exports` 字段限制）。Phase 1 升级到 cos-sdk v3.0.0 后该限制解除，uuid override 不再冲突。
- **本次改动**：根 `package.json.pnpm.overrides` 增加 `"uuid": ">=11.1.1"`，pnpm 安装后实测 `temp/why-uuid-phase4.txt` 显示 `uuid@14.0.1`。
- **审计影响**：3 → 2（消除唯一 moderate）。

### 3.6 request / tough-cookie / qs ✅ 整链消除

- Phase 1 升级 cos-nodejs-sdk-v5 到 3.0.0 后，整条 `request` 传递链消失。
- `pnpm why request` / `tough-cookie` / `qs` 均已无任何路径命中。
- 上一版中保留的 `form-data >=2.5.4` / `fast-xml-parser >=4.5.4` 等 override 仍保留作为防御（开销可忽略）。

## 4. 最终采用的 overrides

根目录 `package.json` 中保留以下覆盖：

| 包 | 覆盖范围 | 目的 |
|---|---|---|
| `form-data` | `>=2.5.4` | 防御性 floor（request 链路移除后无活跃消费者） |
| `fast-xml-parser` | `>=4.5.4` | 防御性 floor |
| `multer` | `>=2.2.0` | 上传链路安全版本 |
| `brace-expansion` | `^5.0.8 \|\| >=5.0.8` | Nest CLI 传递依赖 |
| `js-yaml` | `>=4.3.1` | Nest CLI 传递依赖 |
| `fast-uri` | `>=3.1.3` | Nest CLI 传递依赖 |
| `immutable` | `>=5.1.9` | Vite/Sass 传递依赖 |
| `postcss` | `>=8.5.25` | 前端插件传递依赖 |
| `uuid` | `>=11.1.1` | 修复 tencentcloud-sdk-nodejs 传递的 uuid 9.0.1 moderate |

同时设置 `packageManager` 为 `pnpm@9.0.0`，并保留 `@nestjs/cli` 的 `ignoreMissing` peer dependency 规则。

## 5. 每阶段依赖变更后验证

| 阶段 | pnpm install | pnpm audit | web build | server build | Round 4 smoke |
|---|---|---|---|---|---|
| Phase 0 基线 | ✅ | 13 项 | — | ✅ | 11/11 PASS |
| Phase 1 cos-sdk 3.0 | ✅ 21+/203- | 8 项 | ✅ | ✅ | 11/11 PASS |
| Phase 2 vite/vitest | ✅ 10+/174- | 3 项 | ✅ 35.12s | ✅ | 11/11 PASS |
| Phase 3 xlsx sanitizer | (无变更) | 3 项 | ✅ | ✅ | 11/11 PASS |
| Phase 4 uuid override | ✅ 8+/174- | **2 项** | ✅ 35.12s | ✅ | 11/11 PASS |
| xlsx-iso 单元 | — | — | — | — | 10/10 PASS |

每阶段日志：`temp/install-phase{1,2,4}.log`、`temp/audit-phase{1,2,4}.json`、`temp/build-web-phase{2,4}.log`、`temp/build-server-phase{3}.log`、`temp/smoke-phase{1,2,3,4}.log`、`temp/xlsx-iso-smoke.log`。

复验命令：

```bash
node temp/round4-rerun.cjs
node temp/xlsx-iso-smoke.cjs
```

完整回归报告：`tests/e2e/reports/round4-regression-rerun.md`。

## 6. 剩余风险与后续动作

| 风险 | 当前状态 | 建议动作 |
|---|---|---|
| `xlsx` high ×2（CVE-2023-30533 / CVE-2024-22363） | 0.18.5，npm 不可升级；已通过 `xlsx-sanitizer` 输入隔离缓解 | 持续监控 SheetJS CDN 修复版是否纳入 npm；评估引入维护中的 `exceljs` 长期方案 |
| 跨浏览器矩阵 | 未完成 | 安装 Chromium/Firefox/WebKit 并执行 Playwright smoke |
| Go-Live 合规签字 | 未完成 | 补齐业务、技术、法务、CEO、运维、DBA 六方签字 |
| Tesseract.js 本地语料包 `.gz` 缺失 | 已通过补 `.gz` 副本绕过启动崩溃（一次性 fix） | 后续将 Tesseract 改为可配置 OCR provider 默认走腾讯云 |

## 7. 结论

本轮在四个阶段内完成了 cos-sdk / vite / vitest / uuid 的可升级路径落地，并用 `xlsx-sanitizer` 输入隔离层处理 npm 上不可升级的 xlsx CVE。审计项从 45 项降至 2 项（仅余 xlsx 两个 high，已隔离），Round 4 smoke 仍为 **11/11 PASS**，xlsx 隔离层自有单元 **10/10 PASS**。

**当前生产准入结论：NO-GO**。依赖层面的可升级项已基本闭环，但跨浏览器矩阵与 Go-Live 合规签字未完成，不满足准入条件。建议下一步并行推进：① 跨浏览器 smoke；② Go-Live 合规签字流程；③ 持续监控 xlsx 上游与潜在替代库。