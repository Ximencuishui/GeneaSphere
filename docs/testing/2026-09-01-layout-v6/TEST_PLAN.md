# LayoutEngine v6 浏览器视觉验收测试方案

> 测试日期：2026-09-01
> 测试负责人：Qoder（MiniMax-M3）
> 测试目标：族谱树布局引擎 v6（W1-W5 全部完成）浏览器视觉验收 + 单元测试回归
> 关联文档：
> - [《族谱树布局引擎 v6》](../../../族谱树布局引擎%20v6：三模块分层架构%20+%20dagre&elkjs%20双引擎需求文档.md)
> - [《dagre vs elkjs 引擎选择》](../../../dagre-vs-elkjs-selection.md)
> - [《spouse 虚拟节点模型》](../../../spouse-virtual-node-model.md)
> - [《bench-results》](../../../bench-results.md)

---

## 0. 测试范围界定

聚焦 v6 文档 §8 验收清单的 11 项主流程断言 + 13 项性能基准，覆盖三模块分层架构、spouse 虚拟节点化、dagre/elkjs 双引擎策略。

不覆盖：
- 业务功能权限边界（管理员后台 E2E 由 2026-08-03 报告覆盖）
- PDF/Word 导出
- 迁徙地图

---

## 1. 测试对象

| 模块 | 文件 | 职责 |
|------|------|------|
| `tree-layout.ts` | `apps/web/src/utils/tree-layout.ts` | 节点 X/Y 计算 + CoupleUnit 注册 |
| `edge-router.ts` | `apps/web/src/utils/edge-router.ts` | 父子边正交路径 |
| `spouse-renderer.ts` | `apps/web/src/utils/spouse-renderer.ts` | 配偶边梳状视觉 |
| `layout-engine.ts` | `apps/web/src/utils/layout-engine.ts` | 编排器（≤ 400 行） |
| `spouse-virtualizer.ts` | `apps/web/src/utils/spouse-virtualizer.ts` | expand/collapse 虚拟节点 |
| `dagre-layout.ts` | `apps/web/src/utils/dagre-layout.ts` | dagre 同步适配层 |
| `elkjs-layout.ts` | `apps/web/src/utils/elkjs-layout.ts` | elkjs 异步适配层 |
| `layout-engine-adapter.ts` | `apps/web/src/utils/layout-engine-adapter.ts` | 引擎选择 + fallback 链 |

---

## 2. 测试用例矩阵

### 2.1 单元测试回归（vitest，无须浏览器）

| 文件 | 用例数 | 状态 | 备注 |
|------|--------|------|------|
| `apps/web/src/utils/layout-engine.spec.ts` | 38 | ✅ | v3-v5 详细回归（一夫多妻/配偶子树避让/同层水平边段错开/父子边正交/P1 一妻多妾/P3 birthOrder） |
| `apps/web/src/utils/layout-engine.main-flows.spec.ts` | 13 | ✅ | v6 主流程断言（12 项功能 + 1 鲁棒性） |
| `apps/web/src/utils/layout-engine.bench.spec.ts` | 13 | ✅ | B1/B2 性能 + B3 引擎选择 + V1 视觉回归 + E1-E3 边界 |
| `apps/web/src/utils/spouse-virtualizer.spec.ts` | 12 | ✅ | expand/collapse 边界（单配偶/一夫多妻/双重身份/兄弟共妻/连襟） |
| **小计** | **76** | ✅ | 全部通过 |

### 2.2 浏览器视觉验收（Browser MCP）

| ID | 类别 | 验证点 | 文档对照 | 截图 |
|----|------|--------|----------|------|
| V6-E2E-01 | 朱熹 demo 1001 节点 | dagre 路径首屏渲染 < 5s；同代 Y 一致；无 NaN/Infinity | §8.1 #6 / §8.2 | `v6-zhuxi-1001-dagre.png` |
| V6-E2E-02 | 朱熹 524 节点 | compactBox 兜底路径渲染；与 v5 视觉一致 | §8.1 / §10 #5 | `v6-zhuxi-524-compactbox.png` |
| V6-E2E-03 | 引擎切换 toolbar | `engine: auto / dagre / elkjs / compactBox` 四态切换有效 | §1.1 策略表 / §10 #6 | `v6-engine-toolbar.png` |
| V6-E2E-04 | P1.1 共享 drop line | 所有兄弟起点 = (父 + 最右妻妾) 中点（v6.0.8 起无论 motherId 如何） | §8.1 #1 | `v6-p1-shared-dropline.png` |
| V6-E2E-05 | P1.2 含 motherId=妾 的兄弟 | 同样共享同一 drop line 起点；走线与正妻之子完全一致，区别仅在 isConcubineChild 样式 | §8.1 #2 | `v6-p1-motherid.png` |
| V6-E2E-06 | P1.3 正妻之子 + 妾之子 | 共享同一虚拟起点 + 同一 busY（v6.0.8 起作为母样式区分的强制验收项） | §8.1 #3 + §8.1 P4.1-P4.3 | `v6-p1-virtual-start.png` |
| V6-E2E-07 | P1.4 同母多子 busY | pts[1].y === pts[2].y | §8.1 #4 | `v6-p1-shared-busy.png` |
| V6-E2E-08 | 配偶边梳状 | junction X = 丈夫右边缘；多妻子 marriageOrder stagger | §8.1 #5 | `v6-spouse-comb.png` |
| V6-E2E-09 | 同代 Y 一致 | 同一 generation 节点 Y 完全相等 | §8.1 #6 | `v6-y-alignment.png` |
| V6-E2E-10 | 主脉对齐 | mainLineageCenter=true 时主脉节点 X 平均 ≈ 0 | §8.1 #9 | `v6-main-lineage-center.png` |
| V6-E2E-11 | 子树避让 | resolveSubtreeOverlap 后同代节点外接矩形不重叠 | §8.1 #10 | `v6-subtree-overlap.png` |
| V6-E2E-12 | birthOrder 排序 | 兄弟节点 X 严格按 birthOrder 升序 | §8.1 #11 | `v6-birthorder.png` |
| V6-E2E-13 | 双重身份 | X 既是子又是配偶，layout 不崩 | §8.1 #6 / E1 | `v6-boundary-dual.png` |
| V6-E2E-14 | 兄弟共妻 | H1/H2 共 W，layout 不崩 | E2 | `v6-boundary-shared-wife.png` |
| V6-E2E-15 | 连襟 | H1→W1, H2→W2 独立虚拟链 | E3 | `v6-boundary-jiecheng.png` |
| V6-E2E-16 | Fallback 链路 | elkjs worker 失败 → dagre → compactBox | §4.1 / §10 #7 | `v6-fallback-chain.png` |
| V6-E2E-17 | dagre 反转修复 | 兄弟输入顺序不反转 | §2.4 | `v6-dagre-reverse-fix.png` |
| V6-E2E-18 | 单子 L 形 | 父子边 path 长度 === 2 | §8.1 #8 | `v6-single-child-l.png` |
| V6-E2E-19 | 多子 T 形 | 父子边 path 长度 === 4 | §8.1 #8 | `v6-multi-child-t.png` |

---

## 3. 测试执行流程

### 3.1 前置条件

- [ ] SSH 隧道 15432 已建立（连接 Lighthouse PostgreSQL）
- [ ] 后端 3101 / 前端 5173 已启动
- [ ] 演示数据库（朱熹族谱 1000 人 seed）已就绪

### 3.2 单元测试阶段

```bash
cd apps/web
pnpm vitest run src/utils/layout-engine.spec.ts \
                src/utils/layout-engine.main-flows.spec.ts \
                src/utils/spouse-virtualizer.spec.ts \
                src/utils/layout-engine.bench.spec.ts
```

通过准则：76 个测试 100% 通过，无 warning 升级。

### 3.3 浏览器视觉验收阶段

使用 Browser MCP 工具集：
- `mcp__browser-use__navigate_page`：导航到 `/tree/:clanId`
- `mcp__browser-use__click`：点击工具栏引擎切换
- `mcp__browser-use__take_screenshot`：截图归档
- `mcp__browser-use__evaluate_script`：注入探针，提取节点 X/Y、性能计时
- `mcp__browser-use__list_console_messages`：监控 console 错误

每个用例记录：
- 输入 fixture（节点数 / 引擎 / 拓扑）
- 截图（首屏 + 关键交互后）
- 性能计时（首屏 ms / 重排 ms）
- console 错误 / warning
- 通过 / 失败结论

### 3.4 测试通过准则

| 维度 | 阈值 |
|------|------|
| 功能正确性 | 11 项主流程断言全部通过 |
| 性能 | 朱熹 1001 dagre 首屏 < 5s；elkjs 5000 < 8s |
| 视觉 | 节点不重叠、同代 Y 一致、主脉对齐、无 NaN/Infinity |
| 兼容 | v5 历史截图（tree-demo-detailed-100.png）行为不退化 |
| 控制台 | 无 "transform not registered" 等 G6 错误 |

---

## 4. 测试报告

最终交付物：
- `REPORT.md`：执行结果 + 实测数据 + 截图引用
- `screenshots/`：19 张关键截图
- `canvas-report.canvas.tsx`：可视化验收报表（含指标卡、轨迹表、风险表）

---

## 5. 风险与缓解

| 风险 | 缓解 |
|------|------|
| elkjs WASM 在 jsdom fallback 模式下性能较差 | 阈值设宽于实测 3-4 倍；浏览器环境实测为准 |
| dagre 与 compactBox X 跨度差异 50-100% | 不做 X 像素比对，仅验证拓扑正确性 |
| 朱熹 demo 截图与 v5 不一致 | 视觉回归不依赖 X 跨度，由后续阶段保证同代 Y/主脉对齐 |
| 浏览器 MCP 工具偶发失败 | 单场景失败不阻塞总报告，标注风险后继续 |

---

## 6. 相关文件清单

```
apps/web/src/utils/
├── layout-engine.ts             # 编排器
├── tree-layout.ts               # 节点位置
├── edge-router.ts               # 父子边正交
├── spouse-renderer.ts           # 配偶边梳状
├── dagre-layout.ts              # dagre 适配层
├── elkjs-layout.ts              # elkjs 适配层
├── layout-engine-adapter.ts     # 引擎选择 + fallback
├── spouse-virtualizer.ts        # expand/collapse
├── __fixtures__/
│   ├── large-tree.ts            # 性能基准
│   └── zhuxi.ts                 # 视觉回归
└── __tests__/
    ├── layout-engine.spec.ts             (38)
    ├── layout-engine.main-flows.spec.ts  (13)
    ├── layout-engine.bench.spec.ts       (13)
    └── spouse-virtualizer.spec.ts        (12)
```
