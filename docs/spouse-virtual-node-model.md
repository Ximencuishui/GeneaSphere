# Spouse 虚拟节点模型（LayoutEngine v6 W2 数据模型迁移）

> 关联文档：[《族谱树布局引擎 v6》](../族谱树布局引擎%20v6：三模块分层架构%20+%20dagre&elkjs%20双引擎需求文档.md) §4.1 数据契约 / §5 算法契约
>
> 实现模块：`apps/web/src/utils/spouse-virtualizer.ts`
>
> 适用版本：LayoutEngine v6（W2 起）

---

## 1. 背景与动机

### 1.1 问题

族谱树布局引擎从 v3 (Reingold-Tilford) 到 v5 (compactBox) 一直使用 **「主节点 + 配偶节点」松散拼接** 模型：

```ts
// v3-v5 模型（已废弃）
nodes = [mainNode, spouseNode1, spouseNode2, ...]
edges = [
  { kind: 'parent-child', source: F, target: C },  // 父子边
  { kind: 'spouse',       source: F, target: W },  // 配偶边
  { kind: 'spouse',       source: F, target: W2 }, // 一夫多妻
]
```

这种模型存在两个根本问题：

1. **无法直接喂给通用 DAG 布局器**（dagre / elkjs）：它们只识别 parent-child 关系，spouse 边会被忽略或破坏拓扑。
2. **v5 compactBox 用 generation 字段的"负数 hack"识别配偶**：双重身份场景（如 X 既是 P 的子又是 Y 的配偶）下，Y 的 generation 取什么值是个未定义行为。

### 1.2 目标

把 spouse 边在 **in-memory 层** 转换为「虚拟 parent-child」链，让 dagre / elkjs 等通用 DAG 布局器可直接消费，同时：

- 保留 v5 视觉行为不变（demo 页面看起来一样）
- 数据库 schema 不变（前端层处理）
- 渲染层只关心 `virtualSpouse=true` 的节点和 `fromVirtualSpouse=true` 的边

---

## 2. 数据模型

### 2.1 旧模型 vs 新模型对比

| 字段 | 旧模型（v5） | 新模型（v6） |
|------|-------------|-------------|
| `LayoutNode.virtualSpouse` | 无 | **新增**：`true` 表示该节点是 spouse 边展开产生的虚拟节点（width=0, height=0） |
| `LayoutEdge.fromVirtualSpouse` | 无 | **新增**：`true` 表示该边是从 spouse 边展开而来的虚拟边（parent-child 类型） |
| 配偶节点 generation | 负数 hack | **保留**为负数（向后兼容），但 spouse 节点的"拓扑位置"由虚拟链决定 |
| 双重身份识别 | 依赖 generation 字段 | **不再依赖**，通过 `virtualToSpouse` Map 显式映射 |

### 2.2 虚拟节点命名

使用紧凑前缀避免与真实 ID 冲突：

```
__virt_w_<mainId>_<spouseId>
例：F 与 W1 的虚拟节点 = "__virt_w_F_W1"
```

约定：
- 主节点在左 → `__virt_w_<mainId>_<spouseId>`：parent-child 边 `mainId → __virt_w_*`
- 配偶在左 → `__virt_w_<spouseId>_<mainId>`：parent-child 边 `spouseId → __virt_w_*`

### 2.3 虚拟边属性

```ts
// 真实 spouse 边
{ id: 'sp1', source: 'F', target: 'W', kind: 'spouse', marriageOrder: 1 }

// 展开后产生的两条虚拟边 + 一个虚拟节点
{ id: 'virt-pc-1', source: 'F', target: '__virt_w_F_W', kind: 'parent-child', fromVirtualSpouse: true }
{ id: 'virt-pc-2', source: '__virt_w_F_W', target: 'W', kind: 'parent-child', fromVirtualSpouse: true }
```

---

## 3. expandSpouseToVirtualNodes 契约

### 3.1 函数签名

```ts
expandSpouseToVirtualNodes(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
): {
  virtualNodes: LayoutNode[];     // 含原 nodes + 展开产生的虚拟节点
  virtualEdges: LayoutEdge[];     // 含原 edges + 虚拟边（不含原 spouse 边）
  virtualToSpouse: Map<string, string>;  // 虚拟节点 id → 真实配偶 id
  spouseEdgeMap: Map<string, string>;     // 原 spouse 边 id → 展开后的虚拟边 id（mainId → virtualSpouseId）
}
```

**4 个返回字段的语义对照表**：

| 字段 | key 类型 | value 类型 | 用途 |
|------|---------|-----------|------|
| `virtualNodes` | — | — | 传给 dagre/elkjs 消费的完整节点列表（含 width=0/height=0 的虚拟节点） |
| `virtualEdges` | — | — | 传给 dagre/elkjs 消费的完整边列表（spouse 已转为 parent-child 虚拟链） |
| `virtualToSpouse` | 虚拟节点 id（如 `__virt_w_F_W1`） | 真实配偶 id（如 `W1`） | collapse 时把虚拟节点位置映射回真实配偶 |
| `spouseEdgeMap` | 原 spouse 边 id（如 `e-fw1`） | 展开后的虚拟边 id（如 `e-fw1__virt_e_0`） | 用于 LayoutEngine 在 collapse 后从虚拟边 path 还原 spouse 边视觉 |

### 3.2 行为规约

**输入**：原始 `nodes` 与 `edges`（可能包含 spouse 边）。

**输出**：
1. `virtualNodes`：原 nodes + 虚拟节点（width=0, height=0, virtualSpouse=true）
2. `virtualEdges`：原 edges 替换/补充为虚拟边
   - 原 parent-child 边保留
   - 原 spouse 边**移除**（已转为虚拟链）
   - 新增 2 条虚拟边：`<main> → <virt>` 和 `<virt> → <spouse>`
3. `virtualToSpouse`：`<virt>` → `<spouse>`（用于 collapse 时还原）
4. `spouseEdgeMap`：`<spouse>` → 原 spouse edge（保留 marriageOrder / isCurrent 等 metadata）

### 3.3 调用示例

```ts
const virtualized = expandSpouseToVirtualNodes(nodes, edges)
// → 传给 dagre / elkjs
const positions = await layoutWithDagre(virtualized.virtualNodes, virtualized.virtualEdges, config)
```

---

## 4. collapseVirtualNodes 契约

### 4.1 函数签名

```ts
collapseVirtualNodes(
  layout: { nodes: NodePosition[]; edges: LayoutEdge[] },
  virtualToSpouse: Map<string, string>,
): {
  nodes: NodePosition[];          // 不含虚拟节点的真实节点 NodePosition 列表
  edges: LayoutEdge[];            // 过滤虚拟边（id 含 `__virt_e_`）的 parent-child 边列表
  virtualToSpousePos: Map<string, NodePosition>;  // 虚拟节点 id → 真实配偶 NodePosition（id 字段被覆写为 spouseId）
}
```

**3 个返回字段的语义对照表**：

| 字段 | key 类型 | value 类型 | 用途 |
|------|---------|-----------|------|
| `nodes` | — | — | 渲染层消费的真实节点 NodePosition 列表 |
| `edges` | — | — | 含原 parent-child 边（虚拟边 id 含 `__virt_e_` 被过滤）；供 edge-router 计算真实父子边 path |
| `virtualToSpousePos` | 虚拟节点 id（如 `__virt_w_F_W1`） | 真实配偶 NodePosition（内部 id 字段 = spouseId） | 供 spouse-renderer 从虚拟节点 X 推导 spouse 边 junction X（因为真实配偶 X 可能被紧凑布局/主脉对齐调整过，虚拟节点 X 才是 main 同列的稳定锚点） |

### 4.2 行为规约

1. 从 `nodes` 中过滤掉 `virtualSpouse=true` 的节点
2. 真实节点的 X 位置：
   - 如果该节点是某虚拟节点的 `spouse`（即 `virtualToSpouse.get(<virt>) === <node>`），则 X 来自虚拟节点（确保与 main 同列）
   - 否则 X 保持原样
3. 真实节点的 Y 位置：保持不变（虚拟节点与 spouse 的 Y 是 dagre 自动分配的拓扑 rank，spouse 的 Y 来自其虚拟边链的下游 rank）

### 4.3 调用示例

```ts
const collapsed = collapseVirtualNodes(
  { nodes: [...positions.values()], edges: virtualEdges },
  virtualized.virtualToSpouse,
)
// → collapsed.nodes 给 GenealogeeTree.vue 渲染（不含虚拟节点）
// → collapsed.edges 用于 edge-router / spouse-renderer 计算最终 path
```

---

## 5. 边界场景

### 5.1 双重身份（X 既是 P 的子又是 Y 的配偶）

**场景**：
- P → X（parent-child）
- X → Y（spouse）

**展开结果**：
- 原 X 的 parent-child 边 `P → X` 保留
- 原 X → Y 的 spouse 边展开为：X → `__virt_w_X_Y` → Y
- 拓扑：P 是 X 的"父亲"，X 同时是 Y 的"丈夫"
- dagre 会把 P / X / Y 分配到不同的 rank（不一定相邻）

**关键点**：
- X 的 generation 与 P 同 rank（来自真实父子边）
- Y 的 generation 与 X 不同 rank（来自虚拟链）
- `virtualToSpouse` 中 `__virt_w_X_Y → Y`
- Y 在 LayoutEngine 内部被识别为"双重身份配偶"（generation >= 0 但出现在 `virtualToSpouse` 中）
- `positionSpouseNodes` 会保留 Y 在虚拟节点 X 的同列位置

### 5.2 兄弟共妻（H1、H2 共 W）

**场景**：
- Father → H1（parent-child）
- Father → H2（parent-child）
- H1 → W（spouse）
- H2 → W（spouse）

**展开结果**：
- Father → H1 和 Father → H2 保留
- H1 → `__virt_w_H1_W` → W
- H2 → `__virt_w_H2_W` → W
- 拓扑：W 有两个"父亲"（H1 和 H2 通过虚拟节点指向）
- dagre 处理多父节点：把 W 放在两个父的共同 rank（最深的子节点 rank）

**关键点**：
- 两条独立虚拟链，不共享虚拟节点
- W 的位置由 H1 与 H2 的子树共同影响（resolveSubtreeOverlap 阶段处理）

### 5.3 连襟（兄弟各婚不同配偶）

**场景**：
- Father → H1（parent-child）
- Father → H2（parent-child）
- H1 → W1（spouse）
- H2 → W2（spouse）

**展开结果**：
- H1 → `__virt_w_H1_W1` → W1
- H2 → `__virt_w_H2_W2` → W2
- 两条独立虚拟链，无交叉
- W1 与 W2 各自独立定位

**关键点**：
- W1 与 W2 X 不同（独立虚拟链无交叉）
- 测试覆盖在 `layout-engine.spec.ts` 「W5.主流程 #8 连襟」

---

## 6. 与 CoupleUnit 的关系

### 6.1 CoupleUnit 的角色

`CoupleUnit` 是 v5 引入的"主节点 + 全部配偶 + 配偶继子女子树"绑定单元，**保留**在 v6 中。

用途：
- `alignMainLineage`：主脉子节点的 CoupleUnit 整体平移
- `resolveSubtreeOverlap`：扫描时以 `unitWidth` 为最小单位宽度
- `computeSpouseEdgePaths`：junction X = `mainPos.x + mainPos.width/2`

### 6.2 虚拟节点化与 CoupleUnit 的协作

| 阶段 | 输入 | 虚拟节点作用 | CoupleUnit 作用 |
|------|------|--------------|----------------|
| `[阶段 0] expand` | 原 edges | 生成虚拟节点 + 虚拟边 | 无 |
| `[阶段 3] 主布局` | 虚拟图 | dagre/elkjs 消费虚拟链 | 无 |
| `[阶段 4] buildSpouseMap` | 原 spouse 边 | 无 | 由 `spouseByMain` 维护 |
| `[阶段 5] positionSpouseNodes` | 虚拟图 + spouseMap | 虚拟节点 X = main X（保证配偶与 main 同列） | 注册 `coupleUnitByMain` |
| `[阶段 7] resolveSubtreeOverlap` | 真实节点 + 虚拟图 | 子树扫描线跳过虚拟节点 child | 以 unitWidth 为最小宽度 |
| `[阶段 10] collapse` | 虚拟图 → 真实图 | 过滤虚拟节点 + 虚拟边 | 真实节点 X/Y 继承自虚拟图 |

### 6.3 关键约束

- **渲染层只接受真实节点**：`GenealogyTree.vue` 过滤 `virtualSpouse=true` 节点
- **edge-router 跳过虚拟边**：`edge.path` 由 spouse-renderer 接管 `fromVirtualSpouse=true` 边
- **spouse-renderer 在 collapse 后运行**：输入不含虚拟节点，行为不变

---

## 7. 数据库 schema 不变说明

### 7.1 持久化层

```sql
-- Prisma schema（无变化）
model Person {
  id           String   @id
  // ... 其他字段
}

model Relation {
  id           String   @id
  kind         RelationKind  // 'parent-child' | 'spouse'
  personAId    String
  personBId    String
  marriageOrder Int?
  isCurrent    Boolean?
}
```

### 7.2 边界处理

虚拟节点化完全在 **前端 in-memory 层** 完成：

- 后端 API 返回的仍是原始 `Relation`（spouse / parent-child 混合）
- 前端 `LayoutEngine.calculateLayout()` 内部调用 `expandSpouseToVirtualNodes` 转换
- 转换结果仅用于本次布局计算，不写回数据库
- 渲染层只看到不含虚拟节点的 `LayoutResult`

### 7.3 测试覆盖

`apps/web/src/utils/spouse-virtualizer.spec.ts`（12 个测试）覆盖：

| # | 场景 | 边界 |
|---|------|------|
| 1 | 单配偶 | 1 条虚拟链 |
| 2 | 一夫多妻 | N 条独立虚拟链 |
| 3 | 一妻多夫 | 性别反向（妻子是 main） |
| 4 | 双重身份 | X 既是子又是配偶 |
| 5 | 兄弟共妻 | H1/H2 共 W |
| 6 | 连襟 | H1→W1, H2→W2 独立 |
| 7 | collapse 后虚拟节点过滤 | 验证 nodes 数量 |
| 8 | collapse 后 spouse 边 metadata 保留 | marriageOrder / isCurrent 还原 |
| 9 | 双重身份 collapse 后 spouse X | X 同列 |
| 10 | 多代际虚拟链 | 3 代含配偶 |
| 11 | 三角关系（不应产生环） | 防御性测试 |
| 12 | 空输入 | 边界 |

---

## 8. 常见问题

**Q：为什么不用 dagre 的"复合节点"功能直接处理 spouse？**
A：dagre 没有原生 spouse 概念。强行用 graphlib 标记会被 dagre 当作普通节点，不影响布局。

**Q：虚拟节点是否会显著增加图规模？**
A：每条 spouse 边增加 1 个虚拟节点 + 2 条虚拟边。对于 1000 节点 / 100 spouse 边的中等场景，虚拟化后 ~1100 节点 / 1200 边，dagre 性能仍 < 60ms。

**Q：双重身份场景下 X 的 Y 坐标会不会被虚拟链"拉"到错误位置？**
A：不会。`positionSpouseNodes` 把虚拟节点 X 强制覆盖为 `mainPos.x`，但 Y 保持 dagre 拓扑 rank 分配。Y 的一致性由 `alignMainLineage` 阶段保证。

**Q：collapse 阶段会丢失 spouse 边 metadata 吗？**
A：不会。`spouseEdgeMap` 在 expand 时同步建立，collapse 时通过 `spouseByMain` 找回原始 spouse 边（含 marriageOrder / isCurrent）。

---

## 9. 演进历史

| 版本 | 模型 | 局限 |
|------|------|------|
| v3 (Reingold-Tilford) | 单配偶树状 | 不支持一夫多妻 |
| v4 | 单配偶 + 配偶拼接 | 一夫多妻用 generation < 0 hack |
| v5 (compactBox) | 一夫多妻 + CoupleUnit | generation hack 在双重身份下未定义 |
| **v6 (W2 起)** | **spouse 虚拟节点化 + CoupleUnit 保留** | **统一数据模型，dagre/elkjs 直接消费** |

---

## 10. 相关文件

| 文件 | 角色 |
|------|------|
| `apps/web/src/utils/spouse-virtualizer.ts` | expand/collapse 主实现 |
| `apps/web/src/utils/spouse-virtualizer.spec.ts` | 12 个边界测试 |
| `apps/web/src/types/layout.ts` | `LayoutNode.virtualSpouse` + `LayoutEdge.fromVirtualSpouse` 类型定义 |
| `apps/web/src/utils/layout-engine.ts` | `[阶段 0] expand` + `[阶段 10] collapse` 编排 |
| `apps/web/src/utils/edge-router.ts` | 跳过 `fromVirtualSpouse=true` 边 |
| `apps/web/src/utils/spouse-renderer.ts` | 在 collapse 后接管 spouse 边 path |
| `apps/web/src/utils/tree-layout.ts` | `positionSpouseNodes` 用虚拟节点对齐 main |

---

## 11. 验收标准

- ✅ 现有 38 个 layout-engine 测试全过（不收敛、不删改）
- ✅ 12 个 spouse-virtualizer 边界测试全过
- ✅ 双重身份 / 兄弟共妻 / 连襟 三种边界场景在 dagre / elkjs 路径下行为一致
- ✅ 数据库 schema 无变化（前端层处理）
- ✅ 渲染层只接受真实节点（`virtualSpouse=true` 被过滤）
- ✅ `layout-engine.ts` 仍 ≤ 400 行（含 expand/collapse 编排）