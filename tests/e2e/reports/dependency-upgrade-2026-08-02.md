# 依赖升级与安全审计报告

> 执行日期：2026-08-02
> 项目：GeneaSphere
> 范围：pnpm 依赖解析、漏洞审计、COS SDK 兼容性与 Round 4 smoke 复验

## 1. 执行摘要

本次采用根目录 `pnpm.overrides` 对可安全强制升级的传递依赖进行最小化修补，并重新生成 `pnpm-lock.yaml`。审计结果从 **45 项** 降至 **13 项**，减少约 **71%**；依赖调整后的 Round 4 smoke 复验为 **11/11 PASS**。

由于仍有 1 个 critical、3 个 high，且跨浏览器矩阵与 Go-Live 合规签字尚未完成，当前生产准入结论仍为 **NO-GO**。

## 2. 审计结果对比

| 阶段 | Critical | High | Moderate | Low | 合计 |
|---|---:|---:|---:|---:|---:|
| 覆盖前 | 4 | 23 | 16 | 2 | 45 |
| 最小覆盖后 | 1 | 3 | 9 | 0 | 13 |
| 变化 | -3 | -20 | -7 | -2 | **-32** |

审计命令：

```text
pnpm audit --json --audit-level high
```

详细原始证据：`temp/audit-minimal-overrides.json` 与 `temp/audit-minimal-overrides.txt`。

## 3. 最终采用的 overrides

根目录 `package.json` 中保留以下覆盖：

| 包 | 覆盖范围 | 目的 |
|---|---|---|
| `form-data` | `>=2.5.4` | 修复传递依赖安全版本 |
| `fast-xml-parser` | `>=4.5.4` | 修复传递依赖安全版本 |
| `multer` | `>=2.2.0` | 修复上传链路使用的安全版本 |
| `brace-expansion` | `^5.0.8 || >=5.0.8` | 修复 Nest CLI 传递依赖 |
| `js-yaml` | `>=4.3.1` | 修复 Nest CLI 传递依赖 |
| `fast-uri` | `>=3.1.3` | 修复 Nest CLI 传递依赖 |
| `immutable` | `>=5.1.9` | 修复 Vite/Sass 传递依赖 |
| `postcss` | `>=8.5.25` | 修复前端插件传递依赖 |

同时设置 `packageManager` 为 `pnpm@9.0.0`，并保留 `@nestjs/cli` 的 `ignoreMissing` peer dependency 规则，以避免安装阶段产生无效阻塞。

## 4. 兼容性验证与回滚决策

曾尝试把 `uuid`、`tough-cookie`、`esbuild`、`vite` 一并加入 override。该方案未采用，原因如下：

- 强制升级 `uuid` 后，`cos-nodejs-sdk-v5` 访问 `uuid/v4` 子路径时触发 `Package subpath './v4' is not defined by "exports"`。
- 同一阶段还出现 TypeScript 无法解析 `uuid` 类型定义的问题。
- Windows 环境下 Prisma 查询引擎 DLL 曾因 Node 进程持有文件锁而出现 `EPERM`，停止相关 Node 进程后重新安装恢复正常。

处理结果：恢复兼容的 lockfile 基线，移除上述高风险 override，仅保留第 3 节的最小覆盖集。备份文件为 `pnpm-lock.yaml.before-overrides` 与 `pnpm-lock.yaml.bad-overrides`。

## 5. 依赖调整后验证

| 验证项 | 结果 | 说明 |
|---|---|---|
| `pnpm install` | ✅ PASS | 最小覆盖配置安装成功，约 23.6 秒 |
| `pnpm audit` | ⚠️ 13 项 | 1 critical、3 high、9 moderate |
| Demo login | ✅ PASS | OWNER token 正常签发 |
| P0 Dashboard 路径扫描 | ✅ PASS | `//admin/` 命中 0 次 |
| 媒体上传 | ✅ PASS | `POST /api/media/upload` 返回 201，COS URL 正常 |
| PDF 上传 | ✅ PASS | `POST /api/import/pdf/upload` 返回 201 |
| 族谱树创建/详情 | ✅ PASS | `clan_id` 正确字符串化 |
| 家族事件创建 | ✅ PASS | `clan_id` 正确字符串化 |
| 成员权限保护 | ✅ PASS | self 删除 400，EDITOR 删除 200 |
| Round 4 smoke 总计 | ✅ **11/11 PASS** | 未发现依赖调整引入的功能回归 |

复验命令：

```text
node temp/round4-rerun.cjs
```

完整回归报告：`tests/e2e/reports/round4-regression-rerun.md`。

## 6. 剩余风险与后续动作

| 风险 | 当前状态 | 建议动作 |
|---|---|---|
| `vitest` critical | 仍存在，当前版本为 2.1.9 | 规划 Vitest 主线升级，先执行前端单测与构建回归 |
| `xlsx` high | 当前版本为 0.18.5，SheetJS 上游无可用 patched 版本提示 | 评估迁移到维护中的 XLSX 兼容实现或隔离解析输入 |
| `vite` / `esbuild` high | 与 Vite 5 / Vitest 2 依赖链相关 | 规划 Vite/Vitest 主线升级，不使用未经验证的全局 override |
| COS SDK 旧传递链 | `request`、`tough-cookie`、`qs`、`uuid` 等仍有风险 | 升级或替换 `cos-nodejs-sdk-v5` 前先做上传、签名、删除回归 |
| 跨浏览器矩阵 | 未完成 | 安装 Chromium/Firefox/WebKit 并执行 smoke |
| Go-Live 合规签字 | 未完成 | 补齐业务、技术、法务、CEO、运维、DBA 六方签字 |

## 7. 结论

本轮完成了安全依赖的可逆、最小化修补，并用完整 Round 4 smoke 验证了核心上传、BigInt 序列化、路径与权限修复。当前依赖漏洞数量显著下降，但由于仍有未闭环的高危/严重项及其他生产准入条件，不能据此转为 GO；下一阶段应优先完成 Vite/Vitest 与 XLSX/COS SDK 的兼容性升级评估。
