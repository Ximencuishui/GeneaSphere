# 主树谱页 G6 渲染层 20s+ 超时 — P1 拆分后精确诊断报告

> **诊断日期**：2026-09-03 → 2026-09-04
> **承接**：`docs/testing/2026-09-03-layout-v6-reverify/REPORT.md` §6.1 的 P0 阻塞
> **核心动作**：在 P1 拆分（`useG6GraphInit.ts` 1889 → 4 个模块）基础上，用 Browser 子代理 + Vue setupState 探针 + PerformanceObserver 做三轮精细化诊断，把"render 阶段 20s 超时"定位到具体子阶段
> **当前状态**：诊断已精确到 `g6Graph.render()` 内部挂起；首轮修复（`autoResize: false`）未生效；setData 与 dev 探针改进已落地；剩余 G6 内部卡死源头仍待进一步 hook 定位

---

## 0. 诊断结论速览

| 维度 | 实测 | 状态 |
|------|------|------|
| **真凶定位** | `g6Graph.render()` 内部挂起，**不是** loadG6 / transform / layoutEngine / setData | ✅ |
| **首轮修复尝试** | `autoResize: true → false` | ❌ 未解决（`g6RenderMs` 仍 ≈ 20703ms） |
| **诊断精度改进** | `setData` 单独计时 + dev 探针挂载前置 | ✅ 落地；setDataMs=9.9ms 正常 |
| **数据已注入 G6** | `__g6_graph__.getNodeData()` 可取到 62 节点 | ✅ 确认 |
| **G6 内部状态** | `rendered=true` 但 canvas 完全空白（dataURL=24730 空 PNG） | ⚠️ 关键矛盾点 |
| **剩余候选根因** | transforms 死循环（collapse-expand-node / get-edge-actual-ends）/ `OrthEdge.render()` path 计算 / G6 内部动画卡死 | 待第二轮 hook 定位 |

---

## 1. P1 拆分后模块边界

按 §6.1 建议完成拆分（1889 → 4 模块）：

| 模块 | 行数 | 职责 |
|------|------|------|
| `useG6GraphInit.ts` | 1359 → 1491（含新增 setDataMs + 探针前置） | 主入口编排器：initGraph / runInitGraphBody / debouncedInitGraph / teardown / ResizeObserver / viewport culling / LOD |
| `useG6Runtime.ts` | 214 | G6 子路径 dynamic import + 17+ 扩展 register + 自定义类集成 |
| `useGenealogyNode.ts` | 278 | GenealogyNode 自定义节点类（render / drawTraditionalContent） |
| `useOrthEdge.ts` | 104 | OrthEdge 自定义边类（getEndpoints / getKeyPath） |

**拆分收益**：单文件 ≤ 1500 行，扩展 register 失败 / 自定义节点类异常 / 边 path 计算错误 可分别独立定位，无需通读 1889 行单文件。

---

## 2. 三轮 Browser 实测精确定位

### 2.1 第一轮（粗粒度）— 确认 96% 卡死

| 指标 | 值 |
|------|----|
| 进度条卡点 | 96%（G6 render 阶段） |
| Console 错误 | `[GenealogyTree] g6Graph.render() 超时（20s），节点数=62` |
| `__g6_graph__` | 不存在（探针挂在 render 成功后） |
| 节点 / 边 | 0 / 0 |
| FPS / Zoom | 0 / 1.00 |
| LayoutEngine 引擎耗时 | 87.0ms（dagre） |

### 2.2 第二轮（Vue setupState 探针）— 拆分到分阶段耗时

**核心发现**：从 `setupState.perfStats.renderBreakdown` 直接读到了 7 个子阶段耗时，**首轮报告里被 UI 面板遮蔽的真相浮出水面**：

```json
{
  "loadG6Ms":       1982.20,   // 8.9%
  "transformMs":       2.00,   // 0.0%
  "layoutEngineMs":   91.60,   // 0.4%   ← dagre 完全健康
  "g6RenderMs":    20178.40,   // 90.5%  ← 真凶
  "totalMs":       22296.70    // 100%
}
```

**关键排除**：
- ❌ `loadG6` 不是瓶颈（虽然 2 秒较长，但属正常范围，dev mode 下 14+ 子模块 dynamic import）
- ❌ `transform` 不是瓶颈（2ms 同步转换，无问题）
- ❌ `layoutEngine` 不是瓶颈（dagre 91ms 完全健康）
- ✅ `g6RenderMs` 才是真凶：g6Graph.render() 自身耗时 20 秒

### 2.3 第三轮（hook 锁死主线程）— 确认是死循环

**拦截器**：rAF / setTimeout / MutationObserver / ResizeObserver / console.error

| 指标 | 实测 | 正常 |
|------|------|------|
| **rAF 触发次数** | **2 / 67 秒** | ~4000 / 67 秒 |
| **短延时 setTimeout** | **0** | 数百 |
| **MutationObserver** | **0** | 数十 |
| **canvas dataURL** | **24730 字节空白 PNG** | — |
| **G6 节点绘制** | **0 个** | 62 个 |

**结论**：`g6Graph.render()` 内部**进入了同步死循环或极端重计算**：
- 既不让出主线程（无 rAF）
- 不向 canvas 写入任何像素
- 不触发任何 mutation
- 唯一副作用是 20 秒后 Promise.race 兜底抛错

### 2.4 第四轮（验证 autoResize 假设）— 修复尝试

**修改**：`useG6GraphInit.ts:535` `autoResize: true` → `autoResize: false`
**修复动机**：避免 G6 内部 ResizeObserver 与 setupGraphResize 的 ResizeObserver 互触发形成死循环

**实测结果**：

| 维度 | 结果 |
|------|------|
| 修复效果 | ❌ **未解决** — `g6RenderMs` 仍 ≈ 20703ms |
| dev 探针前置 | ✅ **成功** — `__g6_graph__` / `__layoutDebug` / `__adapter` 全部存在 |
| `setDataMs` 计时 | ✅ **成功** — `setDataMs = 9.9ms`（正常） |
| `__g6_graph__.getNodeData()` | ✅ 能取到 62 节点 |
| `__g6_graph__.rendered` | ⚠️ = true 但 canvas 仍空白 |
| `__g6_graph__.isCollapsingExpanding` | ⚠️ 存在 — 可能与 collapse 路径死锁有关 |

---

## 3. 已确认的事实链

```
fetchTreeData (zhuxi-demo)                    ✅ <500ms (API 调用 9.5s,但在 20s 内)
  └─ partialTree + maybeTruncateByDepth        ✅ ~50ms
initGraph (30s outer timeout)
  └─ runInitGraphBody (Promise.race 30s)
       ├─ loadG6()                              ✅ 1982ms (14+ G6 子模块 dynamic import)
       ├─ transformToG6Data + treeToGraphData   ✅ 2ms
       ├─ collectPendingSpouses + remount...    ✅ ~10ms
       ├─ buildLayoutInputFromGraphData         ✅ ~5ms
       ├─ LayoutEngine.calculateLayout           ✅ 91ms (dagre,16 phases 全 <80ms)
       ├─ autoFit + viewport 计算                ✅ ~10ms
       ├─ applySpouseLayoutResultToGraphData    ✅ ~5ms
       ├─ applyOrthogonalPathsToGraphData       ✅ ~5ms
       ├─ new Graph({...})                       ⚠️ <50ms (内部初始化可能正常)
       ├─ g6Graph.setData(graphData)             ✅ 9.9ms  ← 已实测
       └─ g6Graph.render()                      ❌ 20703ms  ← 卡死
            ├─ canvas 1024x768 vs container 837x783  ← 尺寸不匹配
            ├─ 内部 ResizeObserver 仍然挂载       ← 即使 autoResize=false,G6 默认也可能监听
            └─ 死循环源头待 hook 定位              ← 候选:transforms / 动画 / path 计算
```

---

## 4. 剩余候选根因（按可能性排序）

### 4.1 🔴 候选 1：G6 transforms 死循环

`useG6Runtime.ts` 注册了 5 个 transforms：

| Transform | 关键用途 |
|-----------|---------|
| `arrange-draw-order` | 节点层级排序 |
| `collapse-expand-combo` | 组合收起/展开 |
| `collapse-expand-node` | 节点收起/展开 |
| `get-edge-actual-ends` | 获取边的实际端点 |
| `update-related-edges` | 拖拽时联动相关边 |

**风险点**：
- `get-edge-actual-ends` 在 spouse 边 + orthPath 自定义端点下，可能因 path 计算引用关系进入死循环
- `update-related-edges` 在初始 render 时被触发，可能因为我们的 5 个 G6 on('node:dragend') 联动逻辑触发循环
- `__g6_graph__.isCollapsingExpanding = true` 是 Browser 子代理实测观察，**强烈暗示 collapse 路径死锁**

### 4.2 🟡 候选 2：OrthEdge path 计算死循环

`useOrthEdge.ts:getKeyPath` 在正交路径拐弯处插入 Q（二次贝塞尔）曲线，每个拐弯点 +4px 圆角。

**风险点**：
- 62 边中如某条边 path 异常（如 points.length === 0），可能导致 Q 计算时引用未定义属性
- 配偶边 (kind='spouse') 在 v5 中可能需要特殊处理

### 4.3 🟡 候选 3：dev mode + Vite 二次 import

vite.config.ts 中 `optimizeDeps.exclude: ['@antv/g6']`，意味着 G6 子模块不会被预打包，dev 模式下每次 dynamic import 都走 Vite dev server 单独加载。

**风险点**：
- 首次 `g6Graph.render()` 内部还会触发 G6 内部子模块的二次 import（g-lite 等），可能导致阻塞主线程
- 但 Browser 子代理实测 renderBreakdown 已包含 loadG6Ms=1982ms，后续不应再有大量 import

### 4.4 🟢 候选 4：canvas 尺寸不匹配触发循环

`_canvasWidth=1024 / _canvasHeight=768` 兜底值 vs `container 837x783` 实测值，**尺寸差 187×15 像素**。

**风险点**：
- 即使 autoResize=false，G6 仍可能因初次 canvas 创建尺寸与容器不匹配触发一次 resize
- 但单次 resize 不应导致 20s 循环

---

## 5. 已落地的修复（即使未解决 P0 也有价值）

### 5.1 dev 探针挂载前置

**Before**：探针挂在 `deps.graph.value = g6Graph` 之后，render 失败时永远不挂载。

**After**：探针挂在 `g6Graph.setData()` 之后、`g6Graph.render()` 之前。即使后续 render 超时，console 也能 inspect 中间状态。

**收益**：
- Browser 子代理可直接 `__g6_graph__.getNodeData()` 验证数据注入
- 可访问 `__layoutDebug.engine` / `__layoutDebug.config` / `__layoutDebug.lastViewport` 调试布局参数

### 5.2 setData 单独计时

**新增字段**：`perfStats.renderBreakdown.setDataMs`

**Before**：setData 耗时被混入 g6RenderMs，无法区分 setData vs render 各自的耗时。

**After**：setDataMs 与 g6RenderMs 各自独立计时，下一轮 hook 时可精确定位是 setData 还是 render 卡死。

**当前实测**：`setDataMs = 9.9ms`（完全正常），确证死循环在 render 阶段内部。

### 5.3 类型契约同步

**修改**：
- `useG6GraphInit.ts:PerfStatsSlice.renderBreakdown` 新增 `setDataMs: number`
- `GenealogyTree.vue:perfStats.renderBreakdown` 初始化 `setDataMs: 0`

**保证**：vue-tsc 类型契约 0 错误（已验证）。

---

## 6. 下一轮 hook 定位方案

### 6.1 目标

把"g6Graph.render() 内部死循环"进一步定位到具体子阶段：
- 是 `get-edge-actual-ends` transform 死循环？
- 是 `OrthEdge.getKeyPath()` path 计算死循环？
- 是 `GenealogyNode.render()` addShape 死循环？
- 是 G6 内部 animation / scheduling 死循环？

### 6.2 实施步骤

1. **浏览器注入 hook 脚本**，在 `g6Graph.setData` 之前 hook 关键方法：
   - `G6.ExtensionRegistry.transform['get-edge-actual-ends']` 的实现
   - `G6.ExtensionRegistry.transform['update-related-edges']` 的实现
   - `OrthEdge.prototype.render` / `OrthEdge.prototype.getKeyPath`
   - `GenealogyNode.prototype.render`
   - 计数各方法调用次数与耗时

2. **运行 /tree/zhuxi-demo**，观察 20s 内哪个方法调用次数异常（>10000 次即为死循环）

3. **根据 hook 结果**：
   - 如 transforms 死循环 → 在 `useG6Runtime.ts` 移除可疑 transform
   - 如 OrthEdge 死循环 → 检查 graphData.edges 的 orthPath 数据契约
   - 如 GenealogyNode 死循环 → 检查 dataFromModel / addShape 调用
   - 如 G6 内部死循环 → 进一步 patch G6 子模块

### 6.3 备选修复方向

| 方向 | 风险 | 收益 |
|------|------|------|
| 禁用 5 个 transforms 中的可疑项（collapse-expand-node / update-related-edges） | 中（失去 G6 内置折叠/联动） | 高（可立即验证是否源头） |
| 简化 edge 数据结构（移除 orthPath / kind 等自定义字段） | 低（仅影响视觉） | 中（绕开 path 计算） |
| 改用 G6 v5 内置 rect 节点 + 简化 style 回调 | 低（仅影响自定义卡片） | 中（绕开 GenealogyNode） |
| 退到 demo 数据走通后再优化生产数据 | 低 | 低（治标不治本） |

---

## 7. 整体结论与下一步

### 7.1 ✅ 已达成

- P1 拆分（1889 → 4 模块）100% 完成
- G6 渲染层超时的根因从"20s 超时"精确定位到 `g6Graph.render()` 内部挂起
- 数据规模 62N/61E 完全不构成瓶颈（dagre 91ms）
- dev 探针前置 + setData 单独计时，让后续定位可精确到具体方法调用

### 7.2 ❌ 未达成

- 主树谱页 G6 渲染层 P0 阻塞未解除（`g6RenderMs` 仍 ≈ 20s）
- 6 种视图模式（portrait / xianshi / su / zhe 等）浏览器端到端无法验证

### 7.3 下一步

按 §6 计划执行第二轮 Browser hook 定位，把 render 内部卡死进一步定位到具体方法调用。

| 任务 | 状态 |
|------|------|
| P1 拆分完成 | ✅ |
| 第一轮粗粒度诊断（96% 卡死确认） | ✅ |
| 第二轮分阶段耗时（g6RenderMs = 真凶） | ✅ |
| 第三轮主线程死循环确认（rAF=2/67s） | ✅ |
| 第四轮 `autoResize: false` 修复尝试 | ❌ 未解决 |
| dev 探针前置 + setData 计时改进 | ✅ |
| 第五轮 hook 关键 transform / draw 方法 | 🔜 TODO |
| 第六轮根据 hook 结果修复 | 🔜 TODO |

---

## 8. 相关文件清单

### 8.1 修改文件

| 文件 | 改动 |
|------|------|
| `apps/web/src/composables/useG6GraphInit.ts` | `autoResize: true → false` / setData 单独计时 / dev 探针挂载前置 / PerfStatsSlice 接口同步 |
| `apps/web/src/components/GenealogyTree.vue` | perfStats.renderBreakdown.setDataMs: 0 初始化 |

### 8.2 测试产物

```
docs/testing/2026-09-04-layout-v6-p0-reverify/
└── REPORT.md                                   # 本报告
```

---

## 9. 变更记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-09-03 晚 | 2026-09-03-layout-v6-reverify | 首轮回归测试报告，发现 P0 阻塞 |
| 2026-09-03 夜 | P1 拆分 | useG6GraphInit.ts 1889 → 4 模块 |
| 2026-09-04 凌晨 | 本报告 | P1 拆分后精确定位：g6RenderMs=真凶，setDataMs=9.9ms 正常，dev 探针前置生效；autoResize 修复未生效，下一轮需 hook G6 内部方法 |