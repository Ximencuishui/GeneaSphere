# 族谱树布局引擎 v6：三模块分层架构 + dagre/elkjs 双引擎 需求文档

> 状态：实施中（W1 架构重构中）
> 版本：v6.0（2026-09-01 启动）
> 性质：v3（RT 轮廓）+ v4（一夫多妻牵引线优化）+ v5（A1/A2/A3 重构）之后的**架构升级专项文档**
> 上游文档：《树谱模块‑需求文档（PRD）》§2.7、《族谱树布局引擎 v3：Reingold-Tilford 轮廓算法需求文档》§3-§11、《树谱一夫多妻与子树避让优化-验收测试清单》
> 关联文件：`apps/web/src/utils/layout-engine.ts`（v5 入口，已开始拆分）、`apps/web/src/utils/tree-layout.ts`（W1 新增）、`apps/web/src/types/layout.ts`

---

## 0. 文档定位

本文档记录 LayoutEngine 的**第六代重构**，目标是把当前 1362 行的单文件 `layout-engine.ts` 拆为三层模块、引入 spouse 虚拟节点化、升级到 dagre + elkjs 双引擎，从而：

1. **解决大树上限**：当前 `@antv/hierarchy` 的 compactBox 在 5000+ 节点场景下内存与时间退化严重；elkjs（WASM）专为工业级 DAG 优化。
2. **修复子树 X 爆炸**：1000+ 节点大树出现"主脉竖直一线 + 支系飞出画外"的视觉割裂，dagre 的 layered 算法在 layering 阶段就避免这一现象。
3. **降低耦合**：当前 LayoutEngine 既是节点位置计算器、又是边路径路由器、又是配偶视觉装饰器；拆为三层后关注点分离。
4. **支持异步**：elkjs 在 web worker 中运行，不阻塞主线程。

**与 v5 的关系**：
- v5（2026-08-28）完成了 CoupleUnit 绑定语义、A1-A5 一夫多妻优化、junction 右边缘化；
- v6 在 v5 之上做**架构拆分 + 算法升级**，行为契约（对外接口）保持不变。

---

## 1. 背景与动机

### 1.1 v5 的痛点

| # | 问题 | 现象 | 根因 |
| --- | --- | --- | --- |
| 1 | 单文件 1362 行，10+ private 方法互调 | 改一处需通读全局，新人上手 1 周 | 缺乏模块边界 |
| 2 | `_subtreeWidthCache` + `coupleUnitByMain` + `this.config` 隐式状态 | 单元测试必须 new LayoutEngine，无法纯函数测试 | 类作为单体设计 |
| 3 | `@antv/hierarchy` compactBox 在 1000+ 节点退化 | 朱熹族谱 1001 人场景下布局有视觉割裂 | 算法上限 |
| 4 | 一夫多妻的 spouse 边和父子边耦合在同一引擎 | 改配偶走线要担心影响父子走线 | 关注点未分离 |
| 5 | spouse edge 在算法层是"特殊边" | dagre 等通用 DAG 布局器无法直接消费 | 数据模型与算法不匹配 |

### 1.2 v6 目标

| 目标 | 度量 | 当前基线（v5） | 目标值（v6） |
| --- | --- | --- | --- |
| 代码可维护性 | 单文件 LOC | 1362 | ≤ 400（每个模块） |
| 大树性能 | 1000 节点布局时间 | < 80ms（compactBox） | < 60ms（dagre） |
| 超大树支持 | 5000 节点布局时间 | 崩溃 / 超时 | < 1s（elkjs worker） |
| 视觉割裂 | 1000 节点"主脉竖直 + 支系飞出" | 存在 | 消除（dagre layering） |
| 测试可写性 | 纯函数测试占比 | ~30% | ≥ 70% |
| 主流程兼容 | P1 / 配偶梳状 / 同代 Y 测试 | 38 测试通过 | ≥ 12 测试通过 |

### 1.3 非目标（不在本期范围）

- 册谱版式（苏式/欧式）布局算法
- 世系表开本导出（PDF / Word）
- 迁徙地图的地理布局
- 拖拽编辑时的增量重排（保持现有 shiftSubtree 行为）
- 节点过滤开关（隐藏妻/女/女婿）的运行时切换（仅初始渲染时应用）

---

## 2. 架构总览

### 2.1 三模块分层

```
+-----------------------------------------------------+
|  LayoutEngine 类（编排器，薄包装）                    |
|  - calculateLayout(nodes, edges) → LayoutResult    |
|  - updateConfig / updateCanvasSize                  |
+-----------------------------------------------------+
            |              |              |
            v              v              v
+--------------------+ +-----------------+ +-----------------------+
| tree-layout.ts     | | edge-router.ts  | | spouse-renderer.ts    |
| (节点位置)          | | (父子边正交)     | | (配偶边梳状视觉)        |
+--------------------+ +-----------------+ +-----------------------+
   |                  |                       |
   |                  |                       |
   v                  v                       v
+--------------------+ +-----------------+ +-----------------------+
| W1: 保持 compactBox | | W1: 自研正交    | | W1: 自研梳状分岔      |
| W3: 替换为 dagre/  | | (族谱核心视觉)   | | (junction 锚定)       |
|     elkjs 双引擎   | |                  | |                      |
+--------------------+ +-----------------+ +-----------------------+
```

### 2.2 模块职责矩阵

| 模块 | 职责 | 不做 |
| --- | --- | --- |
| `tree-layout.ts` | 节点 X/Y 坐标计算；CoupleUnit 注册；主脉对齐；子树扫描线推开 | 边路径、视觉装饰 |
| `edge-router.ts` | 父子边正交路径（L/T 形）；共享 drop line 起点计算；水平段错开 | spouse 边、节点位置 |
| `spouse-renderer.ts` | spouse 边梳状分岔；junction 锚定；垂直 stagger；颜色映射 | 父子边、节点位置 |
| `layout-engine.ts` | 编排：调用三个模块做完整流程；维护跨模块状态（coupleUnitByMain） | 算法细节 |

### 2.3 数据流

```
LayoutEngine.calculateLayout(nodes, edges)
  │
  ├─[1] tree-layout.ts: 准备数据
  │    - buildSpouseMap / computeSpouseWidths / computeMaxGeneration
  │    - computeSubtreeWidth（记忆化）
  │
  ├─[2] tree-layout.ts: 主布局
  │    - compactBox (v5) → 后续替换为 dagre/elkjs (W3)
  │    - positionSpouseNodes（写入 nodePositions + 注册 CoupleUnit）
  │
  ├─[3] tree-layout.ts: 后处理
  │    - alignMainLineage（主脉对齐 x=0）
  │    - resolveSubtreeOverlap（扫描线推开）
  │    - shiftToCenter（整体居中平移）
  │
  ├─[4] edge-router.ts: 父子边路径
  │    - computeOrthogonalEdgePaths（T 形 + 共享 drop line 起点）
  │    - resolveEdgeHorizontalOverlaps（错开 + junctionGroup 豁免）
  │    - shiftEdgePathsX（响应主脉再居中）
  │
  ├─[5] spouse-renderer.ts: 配偶边路径
  │    - computeSpouseEdgePaths（梳状分岔 + junction 锚定）
  │
  └─[6] 输出 LayoutResult
```

---

## 3. 数据模型重构

### 3.1 当前模型

```ts
interface LayoutEdge {
  source: string;
  target: string;
  kind: 'spouse' | 'parent-child';
  marriageOrder?: number;
  isCurrent?: boolean;
  motherId?: string;
  birthOrder?: number;
  // ...
}
```

### 3.2 v6 模型（W2 引入）

**核心变化**：spouse edge 在 in-memory 层转为"虚拟 parent-child"。

```ts
// 旧输入
{ source: 'F', target: 'W1', kind: 'spouse', marriageOrder: 1 }
{ source: 'F', target: 'W2', kind: 'spouse', marriageOrder: 2 }
{ source: 'W1', target: 'c1', kind: 'parent-child' }

// W2 expandSpouseToVirtualNodes 后
{ source: 'F', target: 'wife_W1', kind: 'parent-child', _virtual: true }
{ source: 'F', target: 'wife_W2', kind: 'parent-child', _virtual: true }
{ source: 'wife_W1', target: 'W1', kind: 'parent-child' }
{ source: 'wife_W2', target: 'W2', kind: 'parent-child' }
{ source: 'W1', target: 'c1', kind: 'parent-child' }  // 继子女保持不变
```

**关键约束**：
- 数据库 schema **不变**；in-memory `LayoutNode[]` 多几个 `virtualSpouse: true` 的虚拟节点
- 虚拟节点 ID = `wife_<spouseId>` 或 `husband_<mainId>`（视性别）
- 虚拟节点宽度 = 0、高度 = 0（不渲染）
- layout 结果中虚拟节点位置保留，供 spouse-renderer 绘制梳状分岔时引用
- 输出给 G6 时，虚拟节点隐藏；spouse 边梳状由 G6 渲染层独立处理

### 3.3 CoupleUnit 仍然保留

虽然 spouse 节点化，但 CoupleUnit 的"绑定单元"语义对**主脉对齐**和**子树扫描线推开**仍有价值：

```ts
interface CoupleUnit {
  mainId: string;
  spouseIds: string[];   // 真实配偶 id（不含虚拟前缀）
  unitWidth: number;
  unitRightX: number;
}
```

### 3.4 EdgePath 类型扩展

W2 新增字段：

```ts
interface EdgePath {
  points: Point[];
  type: 'cubic' | 'line' | 'orthogonal';
  junction?: Point;
  junctionGroup?: string;
  /** [W2 2026-09-01] 标识此边是否由 spouse edge 展开而来 */
  fromVirtualSpouse?: boolean;
}
```

### 3.5 motherId 字段语义（v6.0.8 需求澄清）

> **新增章节（2026-09-02）**：根据新版树谱布局需求文档统一约定，澄清 `motherId` 字段在布局层的语义边界。

**核心约定**：一个男性节点的所有子女（无论由哪一位配偶所生）**统一从配偶水平链向下引出连接线**，共享同一组 T 形总线（共享 drop line / 共享 busY）。

```text
                      ┌─ 妻（W1）
   夫（F）─ ─ ─ ─ ─ ─ ─┼─ 妾 1（W2）
                      └─ 妾 2（W3）
                            │
                            ▼ 共享 drop line 起点 = (F.x + W3.x) / 2
   ┌────────────┬────────────┬────────────┐
   │ 长子（母=W1）│ 次子（母=W2）│ 季子（母=W3）│
   └────────────┴────────────┴────────────┘
   同一 busY ────────────────────────────
```

**母亲归属的区分方式**：仅通过**视觉样式**，不通过走线几何：

| 字段 | 类型 | 作用 | 影响走线起点？ |
|------|------|------|--------------|
| `motherId` | `string \| undefined` | 标记子女的生母是谁 | ❌ **不影响** |
| `isConcubineChild` | `boolean` | 标记是否为庶出（G6 渲染层用） | ❌ 不影响 |
| `palette` | `string` | 该母亲对应调色板色（用于边/卡片描边） | ❌ 不影响 |

**算法层契约**：

1. `edge-router.computeOrthogonalEdgePaths` 的 `resolveStartX` **不再按 motherId 分流**，所有兄弟统一使用：
   - 有 coupleUnit（父-多妻妾组）→ `coupleUnitMidX = (父.x + 最右配偶.x) / 2`
   - 无 coupleUnit → `parentPos.x`（父中心 X）
2. `hasAnyMotherId` 与 `motherPos.x` 判定路径从 v6.0.8 起**整体移除**。
3. 母亲归属信息保留在 Edge metadata 上，供 G6 渲染层（[GenealogyTree.vue](file:///e:/GeneaSphere/apps/web/src/components/GenealogyTree.vue)）按 `isConcubineChild + palette` 着色区分。

**v6.0.7 → v6.0.8 行为差异**：

| 兄弟类型 | v6.0.7 起点 X | v6.0.8 起点 X |
|----------|--------------|--------------|
| 正妻之子（无 motherId） | `parentPos.x`（向后兼容） | `coupleUnitMidX` |
| 正妻之子（motherId=正妻） | `motherPos.x` | `coupleUnitMidX` |
| 妾之子（motherId=妾） | `motherPos.x`（另枝走线） | `coupleUnitMidX` |

所有兄弟的 `pts[1].y === pts[2].y`（共享 busY）始终成立。

**与 v5/P1 时期的差异**：v5/P1 时期（`apps/web/src/utils/layout-engine.spec.ts` P1.1/P1.2 用例）保留的"妾之子从母亲节点中心 X 单独走线"语义在 v6.0.8 **整体废除**，对应的 spec 用例需同步重写（见 §8.1 P1.2/P1.3 新验收标准）。

---

## 4. 算法升级：dagre + elkjs 双引擎

### 4.1 引擎选择策略

| 节点数 | 引擎 | 执行环境 | 同步性 |
| --- | --- | --- | --- |
| ≤ 1000 | `@dagrejs/dagre` | 主线程 | 同步 |
| > 1000 | `elkjs`（WASM） | web worker | 异步（Promise / callback） |

### 4.2 dagre 配置

```ts
import dagre from '@dagrejs/dagre';

const g = new dagre.graphlib.Graph({ multigraph: true, compound: false });
g.setGraph({
  rankdir: 'TB',          // top-to-bottom（与族谱传统一致）
  nodesep: 24,            // 同代节点间距
  ranksep: 48,            // 代际间距
  edgesep: 4,             // 平行边间距
  ranker: 'tight-tree',   // 紧凑层级（适合族谱）
  marginx: 0,
  marginy: 0,
});
g.setDefaultEdgeLabel(() => ({}));
```

### 4.3 elkjs 配置

```ts
import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();
const graph: ElkNode = {
  id: 'root',
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.layered.spacing.nodeNodeBetweenLayers': '24',
    'elk.spacing.nodeNode': '24',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.crossingMinimization.semiInteractive': 'true',
  },
  children: [...],  // LayoutNode → ElkNode 适配
  edges: [...],     // LayoutEdge → ElkEdge 适配
};
const result = await elk.layout(graph);
```

### 4.4 主脉对齐与同代 Y 一致

| 行为 | v5（compactBox + 后处理） | v6（dagre + elkjs） |
| --- | --- | --- |
| 同代 Y 一致 | alignMainLineage 后处理 | rank 概念天然保证 |
| 主脉对齐到 x=0 | 后处理平移 | 主脉节点设 `constraint: 'same-x'` 或自定义 ranker |
| 子树避让 | resolveSubtreeOverlap 扫描线 | dagre 自带 subgraph 最小化边长度；elkjs `elk.layered.compaction.postCompaction` |

### 4.5 算法升级对现有测试的影响

保留主流程测试：
- P1.1-P1.4（共享 drop line / 虚拟起点）：预期全部通过
- spouse 边梳状分岔 × 2：通过
- 同代 Y 一致 × 1：通过（dagre rank 天然保证）
- 一夫多妻横向排序 × 1：通过（dagre ordering 阶段）
- 单/多子路径长度 × 2：通过

允许重写：
- 内部数据结构相关测试（如 `_subtreeWidthCache` 行为）
- compactBox 特定的输出（如中心点 vs 左上角）

---

## 5. 接口契约

### 5.1 对外签名（保持不变）

```ts
// apps/web/src/utils/layout-engine.ts
export class LayoutEngine {
  constructor(options: LayoutOptions);
  updateConfig(config: Partial<LayoutConfig>): void;
  updateCanvasSize(size: { width: number; height: number }): void;
  calculateLayout(nodes: LayoutNode[], edges: LayoutEdge[]): LayoutResult;
  autoFit(layout: LayoutResult): ViewportConfig;
}
```

### 5.2 模块函数签名（W1 新增）

```ts
// tree-layout.ts
export function buildSpouseMap(edges, spouseNodeIds): Map<string, LayoutEdge[]>;
export function computeSpouseWidths(spouseByMain, nodeMap, childrenByParent, config, cache): Map<string, number>;
export function computeSubtreeWidth(nodeId, nodeMap, childrenByParent, config, cache, depth?): number;
export function computeAutoNodeSep(totalNodes, generations, nodeWidth): number;
export function computeAutoRankSep(nodeHeight): number;
export function computeMaxGeneration(childrenByParent, roots): number;
export function positionSpouseNodes(nodePositions, nodeMap, spouseByMain, edges, childrenByParent, config, rankSep, nodeSep, coupleUnitByMain): void;
export function alignMainLineage(nodePositions, nodeMap, spouseByMain, childrenByParent, coupleUnitByMain): void;
export function resolveSubtreeOverlap(nodePositions, nodeMap, childrenByParent, spouseByMain, coupleUnitByMain, nodeSep): void;
export function shiftSubtree(nodeId, dx, nodePositions, childrenByParent, spouseByMain, coupleUnitByMain, visited?): void;
export function shiftToCenter(nodePositions): number;
export function getBoundingBox(nodes): BoundingBox;
```

```ts
// edge-router.ts
export function computeOrthogonalEdgePaths(nodePositions, edges, coupleUnitByMain): void;
export function resolveEdgeHorizontalOverlaps(edges, config): void;
export function shiftEdgePathsX(edges, dx): void;
```

```ts
// spouse-renderer.ts
export function computeSpouseEdgePaths(nodePositions, spouseByMain, config): void;
```

### 5.3 CoupleUnit 共享模式

由于 `coupleUnitByMain` 跨模块使用（tree-layout 写入、spouse-renderer 读取），保留为 LayoutEngine 类成员：

```ts
class LayoutEngine {
  private coupleUnitByMain = new Map<string, CoupleUnit>();
  calculateLayout(nodes, edges) {
    this.coupleUnitByMain.clear();
    // 传给 tree-layout 模块
    positionSpouseNodes(..., this.coupleUnitByMain);
    // 传给 edge-router 模块
    computeOrthogonalEdgePaths(nodePositions, edges, this.coupleUnitByMain);
    // 传给 spouse-renderer 模块
    computeSpouseEdgePaths(nodePositions, spouseByMain, this.config);
  }
}
```

---

## 6. 实施路线图

### W1 架构重构（拆模块，保持 v5 行为）

- [x] W1.1 分析现有方法，规划模块边界
- [x] W1.2 抽取 `tree-layout.ts`（节点位置计算 + CoupleUnit 注册）
- [ ] W1.3 抽取 `edge-router.ts`（正交路径 + 水平段错开）
- [ ] W1.4 抽取 `spouse-renderer.ts`（配偶边梳状视觉）
- [ ] W1.5 让 `LayoutEngine` 类变成编排器，38 测试全部通过

### W2 数据模型重构

- [ ] W2.1 实现 `expandSpouseToVirtualNodes`
- [ ] W2.2 实现 `collapseVirtualNodes`（输出层反向）
- [ ] 边界场景：双重身份、兄弟共妻、连襟

### W3 算法升级

- [ ] W3.1 引入 `@dagrejs/dagre`，替换 compactBox（小树路径）
- [ ] W3.2 引入 `elkjs` + worker（5000+ 节点路径）
- [ ] W3.3 引擎选择策略：≤1000 → dagre，>1000 → elkjs
- [ ] 主脉对齐迁移到 dagre `constraint`
- [ ] 同代 Y 一致由 dagre rank 保证

### W4 视觉回归 + 性能压测

- [ ] 朱熹 demo 截图与 v5 视觉对比，差异 ≤ 5%
- [ ] 1000 节点：dagre 路径 < 60ms
- [ ] 5000 节点：elkjs worker 路径 < 1s
- [ ] 边界场景回归：双重身份、连襟、继子女虚拟节点化

### W5 测试收敛 + 文档

- [ ] 测试从 38 收敛到 12 主流程断言
- [ ] 新增 1000 / 5000 节点性能基准测试
- [ ] 文档：
  - `docs/layout-engine-v6-architecture.md`（本文档）
  - `docs/spouse-virtual-node-model.md`（W2 数据模型迁移）
  - `docs/dagre-vs-elkjs-selection.md`（W3 引擎选择）

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| dagre 与 compactBox 视觉差异 | 朱熹 demo 截图需重测 | W4 视觉 diff 验证；允许微调 `ranker`/`nodesep` |
| 虚拟节点化让 spouse 计数翻倍 | 内存略增；DB 不变 | in-memory 性能影响可忽略（< 1%） |
| elkjs WASM 在 lighthouse 部署失败 | 大树布局回退 | fallback 到 dagre；CDN 加载 |
| 现有 26 个内部测试需删除 | 测试覆盖率短期下降 | 主流程兼容；新增性能基准测试覆盖 |
| dagre API 命令行式 vs 现有 OOP | 集成风格冲突 | 适配器模式封装，外部保持 OOP 接口 |
| CoupleUnit 跨模块共享 Map | 隐式状态难测试 | 通过参数显式传入；单元测试用 `new Map()` 注入 |

---

## 8. 验收标准

### 8.1 功能验收

> **[v6.0.8 需求澄清]**：P1.1-P1.4 描述的"共享 drop line 起点"是 v6.0.7 起的**唯一合法走线**。母亲归属不再通过走线起点 X 区分，仅通过 `isConcubineChild` + `palette` 样式区分。

- [ ] **P1.1**：父-多妻妾组共享 drop line：当父节点有 ≥1 配偶（coupleUnit 存在）时，所有子女起点 X = `(父.x + 最右配偶.x) / 2`
- [ ] **P1.2**：无论 `motherId` 字段是否存在或指向谁（妻 / 妾 / 外部配偶），起点 X 始终 = P1.1 中的共享 drop line 中点
- [ ] **P1.3**：正妻之子 + 妾之子共享同一虚拟起点，落在同一组 4 点 T 形总线上（`pts[1].y === pts[2].y`）
- [ ] **P1.4**：同父多子共享 busY（同一 `junctionGroup`，`resolveEdgeHorizontalOverlaps` 跳过同组水平段错开）
- [ ] spouse 边梳状分岔：junction X = 丈夫右边缘，多妻子按 marriageOrder stagger
- [ ] 同代 Y 一致：同一 generation 节点 Y 完全相等
- [ ] 一夫多妻横向排序：妻妾按 marriageOrder 从左到右
- [ ] 单子路径：2 点直线或 3 点 L 形
- [ ] 多子路径：4 点 T 形（共享总线）

**母亲归属样式区分**（v6.0.8 新增验收项）：

- [ ] **P4.1**：G6 渲染层（[GenealogyTree.vue](file:///e:/GeneaSphere/apps/web/src/components/GenealogyTree.vue)）正确把 `isConcubineChild=true` 的边渲染为虚线
- [ ] **P4.2**：G6 渲染层正确按 `palette` 给庶出边/卡片描边着色（每位母亲调色板色一致）
- [ ] **P4.3**：走线几何与母亲归属完全解耦——同一父节点的正妻之子与妾之子**走线完全相同**，仅样式不同

### 8.2 性能验收

- [ ] 1000 节点布局：dagre 同步路径 < 60ms
- [ ] 5000 节点布局：elkjs worker 异步路径 < 1s
- [ ] 朱熹族谱 1001 节点 demo 视觉割裂消除

### 8.3 架构验收

- [ ] `layout-engine.ts` 单文件 LOC ≤ 400
- [ ] `tree-layout.ts` / `edge-router.ts` / `spouse-renderer.ts` 各自纯函数占比 ≥ 80%
- [ ] 单元测试中纯函数测试占比 ≥ 70%（基线 30%）

### 8.4 兼容验收

- [ ] 现有 38 测试中至少 12 个主流程测试通过
- [ ] `LayoutEngine.calculateLayout` 对外签名不变
- [ ] `LayoutResult` / `EdgePath` / `CoupleUnit` 类型对外可见字段不变

---

## 9. 关联文档

- 《树谱模块‑需求文档（PRD）》§2.7 布局防重叠规则
- 《族谱树布局引擎 v3：Reingold-Tilford 轮廓算法需求文档》§3-§11
- 《树谱一夫多妻与子树避让优化-验收测试清单》25 项测试
- `apps/web/src/utils/layout-engine.ts`（v5 → v6 过渡中）
- `apps/web/src/utils/tree-layout.ts`（W1 新增）
- `apps/web/src/types/layout.ts`（EdgePath / CoupleUnit 定义）

## 10. 变更记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-09-01 | v6.0 | W1 启动：创建文档；新增 `tree-layout.ts` 模块；规划 edge-router / spouse-renderer 拆分 |
| 2026-09-01 | v6.0.1 | W1 收尾：创建 `edge-router.ts`（297 行）、`spouse-renderer.ts`（212 行）；`layout-engine.ts` 从 1362 行瘦身至 293 行（-78%），变纯编排器；`coupleUnitByMain` 作为跨模块共享状态保留为类字段；`LayoutEngine.calculateLayout` 对外签名不变；`layout-engine.spec.ts` 38 个测试全部通过 |
| 2026-09-02 | **v6.0.8** | **需求澄清（文档先行）**：根据新版树谱布局需求文档，明确母亲归属仅通过样式（`isConcubineChild` + `palette`）区分，不再通过走线几何（`resolveStartX`）区分；新增 §3.5 "motherId 字段语义"小节 + §8.1 "母亲归属样式区分"P4.1-P4.3 验收项；待跟进：① 修改 `apps/web/src/utils/edge-router.ts` `resolveStartX` 移除 motherId 分流；② 重写 `apps/web/src/utils/layout-engine.spec.ts` P1.1/P1.2 用例；③ 修订 `docs/testing/2026-09-01-layout-v6/REPORT.md` 与 `docs/testing/2026-09-01-layout-v6/TEST_PLAN.md` 中相关描述 |
