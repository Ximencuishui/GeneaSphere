# dagre vs elkjs 引擎选择（LayoutEngine v6 W3）

> 关联文档：[《族谱树布局引擎 v6》](../族谱树布局引擎%20v6：三模块分层架构%20+%20dagre&elkjs%20双引擎需求文档.md) §4.2 dagre 配置 / §4.3 elkjs 配置
>
> 实现模块：
> - `apps/web/src/utils/layout-engine-adapter.ts` — 引擎选择 + fallback 链
> - `apps/web/src/utils/dagre-layout.ts` — @dagrejs/dagre 适配层
> - `apps/web/src/utils/elkjs-layout.ts` — elkjs 适配层
> - `apps/web/src/workers/elkjs-layout.worker.ts` — elkjs web worker 入口
>
> 适用版本：LayoutEngine v6（W3 起）

---

## 1. 引擎选择策略

### 1.1 自动选择（默认）

```ts
// apps/web/src/utils/layout-engine-adapter.ts
export function selectLayoutEngine(
  totalNodes: number,
  config: LayoutConfig,
): ResolvedEngineType {
  const engine = config.engine ?? 'auto'
  const threshold = config.engineThreshold ?? 1000
  if (engine === 'auto') {
    return totalNodes <= threshold ? 'dagre' : 'elkjs'
  }
  return engine as ResolvedEngineType
}
```

**默认策略表**：

| totalNodes | engine='auto' | 引擎 | 路径 |
|------------|---------------|------|------|
| ≤ 1000 | dagre | 同步 | 主线程 |
| > 1000 | elkjs | 异步 | web worker |
| 用户强制 dagre | dagre | 同步 | 主线程 |
| 用户强制 elkjs | elkjs | 异步 | web worker |
| 用户强制 compactBox | compactBox | 同步 | 主线程（兜底） |

### 1.2 配置接口

```ts
// apps/web/src/types/layout.ts
interface LayoutConfig {
  engine?: 'auto' | 'dagre' | 'elkjs' | 'compactBox'
  engineThreshold?: number  // 默认 1000
}
```

### 1.3 选择理由

| 节点规模 | 推荐引擎 | 理由 |
|---------|---------|------|
| ≤ 1000 | dagre | 同步路径 < 60ms（浏览器），无 WASM 加载延迟 |
| 1000-2000 | dagre / elkjs | dagre 仍可胜任（< 200ms），elkjs 在大数据集更稳定 |
| > 2000 | elkjs | dagre 性能下降明显，elkjs WASM 算法更优 |
| > 5000 | elkjs | elkjs 异步 worker 避免阻塞 UI（实测 < 1s） |

---

## 2. dagre 配置（@dagrejs/dagre v3.1.1）

### 2.1 核心配置

```ts
// apps/web/src/utils/dagre-layout.ts
g.setGraph({
  rankdir: 'TB',           // 族谱惯例：根在上、子孙在下
  nodesep: 24,             // 兄弟节点水平间距（与 v5 compactBox 默认一致）
  ranksep: 48,             // 代际垂直间距（与 v5 一致）
  ranker: 'tight-tree',    // 族谱是树状结构，紧致树算法最优
  marginx: 8,              // 图加 8px margin 避免节点贴画布边
  marginy: 8,
})
```

### 2.2 配置项说明

| 选项 | 值 | 说明 |
|------|----|----|
| `rankdir` | `'TB'` | top-to-bottom；族谱垂直布局 |
| `nodesep` | `24` | 兄弟节点水平最小间距 |
| `ranksep` | `48` | 不同 rank 节点垂直最小间距 |
| `ranker` | `'tight-tree'` | dagre 4 种 ranker：`longest-path` / `tight-tree` / `network-simplex` / `unknown`；族谱用 tight-tree 最优 |
| `marginx` / `marginy` | `8` | 图边界 margin |

### 2.3 节点 / 边配置

```ts
// 节点：宽高透传（虚拟节点 width=0 → dagre 不分配空间）
g.setNode(node.id, {
  width: node.width,
  height: node.height,
})

// 边的默认 label 函数（dagre 要求 setDefaultEdgeLabel 后才能 setEdge）
g.setDefaultEdgeLabel(() => ({}))

g.setEdge(source, target, { id: edge.id })
```

### 2.4 关键约束：dagre tight-tree ranker 反转兄弟顺序

**实测发现**：dagre tight-tree ranker **反转**边输入顺序！

```
原顺序 [S1, S2, S3] → 输出 [S3, S2, S1]（X 坐标从左到右）
```

**修复**：在传给 dagre 前 `.reverse()` 一次，让 dagre 再反转回原顺序。

```ts
// apps/web/src/utils/dagre-layout.ts
const sortedEdges = [...virtualEdges]
  .filter((e) => e.kind === 'parent-child')
  .sort((a, b) => {
    // 先按 birthOrder 升序
    if (a.source !== b.source) return 0
    const oa = a.birthOrder
    const ob = b.birthOrder
    if (oa == null && ob == null) return 0
    if (oa == null) return 1
    if (ob == null) return -1
    return oa - ob
  })
  .reverse()  // ← 关键：dagre 会反转，所以先反转让输出恢复正序
```

### 2.5 birthOrder 后处理兜底

dagre tight-tree 不保证兄弟 X 与插入顺序一致（受子树宽度影响）。`reorderSiblingsByBirthOrder` 后处理：

```ts
function reorderSiblingsByBirthOrder(
  positions: Map<string, NodePosition>,
  sortedEdges: LayoutEdge[],
  config: LayoutConfig,
): void {
  // 对每组指定了 birthOrder 的兄弟，按排行强制重排 X
  // - 计算组内最左 X = minX
  // - 每个兄弟按 birthOrder 升序分配等距 X（间距 = 原最大兄弟间距）
  // - 未指定 birthOrder 的兄弟保持在原 X 不动（向后兼容）
}
```

### 2.6 dagre 限制

- ❌ **不处理 spouse 边**：必须先调用 `expandSpouseToVirtualNodes`（见 [《spouse 虚拟节点模型》](spouse-virtual-node-model.md)）
- ❌ **不保证 birthOrder 排序**：依赖前置 sort + 后处理
- ❌ **tight-tree 反转兄弟输入顺序**：必须 `.reverse()`
- ✅ **同步路径**：无 WASM / worker 加载开销
- ✅ **纯 JS**：无浏览器兼容问题

---

## 3. elkjs 配置（elkjs v0.12.0）

### 3.1 核心配置

```ts
// apps/web/src/utils/elkjs-layout.ts
const rootNode: ElkNode = {
  id: 'root',
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.crossingMinimization.semiInteractive': 'true',
    'elk.spacing.nodeNode': String(nodeSep),  // 同代水平间距
    'elk.layered.spacing.nodeNodeBetweenLayers': String(rankSep),  // 代际垂直间距
    'elk.direction': 'DOWN',  // top-to-bottom
  },
  children: virtualNodes.map((n) => ({
    id: n.id,
    width: n.width,
    height: n.height,
    // 虚拟节点 width=0，elkjs 会按 0 宽度处理（不影响布局）
  })),
  edges: virtualEdges
    .filter((e) => e.kind === 'parent-child')
    .map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
}
```

### 3.2 配置项说明

| 选项 | 值 | 说明 |
|------|----|----|
| `elk.algorithm` | `'layered'` | elkjs 支持：`layered` / `force` / `mrtree` / `stress`；族谱用 layered |
| `elk.layered.nodePlacement.strategy` | `'BRANDES_KOEPF'` | 节点放置算法：`SIMPLE` / `INTERACTIVE` / `LINEAR_SEGMENTS` / `BRANDES_KOEPF` |
| `elk.layered.crossingMinimization.semiInteractive` | `'true'` | 小规模提速 |
| `elk.spacing.nodeNode` | `nodeSep` | 节点水平最小间距 |
| `elk.layered.spacing.nodeNodeBetweenLayers` | `rankSep` | 不同层节点垂直最小间距 |
| `elk.direction` | `'DOWN'` | top-to-bottom |

### 3.3 elkjs vs dagre 算法差异

| 维度 | dagre tight-tree | elkjs layered (BRANDES_KOEPF) |
|------|-----------------|-------------------------------|
| 同代 Y 一致 | ✅ | ✅ |
| 同代 X 顺序 | ⚠️ 反转输入 | ✅ 按边输入顺序 |
| birthOrder 支持 | ❌ 需前置 sort + 后处理 | ⚠️ 部分支持，仍需前置 sort |
| 跨子树避让 | ⚠️ 子树紧凑 | ✅ 跨子树拉开 |
| 兄弟节点中心对齐 | ✅ | ⚠️ 部分对齐 |
| 性能（1000 节点） | < 60ms（同步） | ~500ms（WASM 加载后） |
| 性能（5000 节点） | ~200-400ms（同步） | < 1s（异步） |

### 3.4 Web Worker 通信

```ts
// apps/web/src/utils/elkjs-layout.ts
const elk = new ELK({
  workerUrl: new URL('../workers/elkjs-layout.worker.ts', import.meta.url).href,
})

// elk.layout(graph, { logging: false }) 返回 Promise
const result = await elk.layout(rootNode, { logging: false })
```

```ts
// apps/web/src/workers/elkjs-layout.worker.ts
import ELK from 'elkjs/lib/elk.bundled.js'

const elk = new ELK()

self.addEventListener('message', async (e) => {
  const graph = e.data
  const result = await elk.layout(graph, { logging: false })
  ;(self as any).postMessage(result)
})
```

### 3.5 jsdom + vitest 环境下的 polyfill

elkjs 内部依赖 web worker，jsdom 测试环境无原生支持。处理：

1. `apps/web/vitest.config.ts` 加入 `@vitest/web-worker` 到 setupFiles
2. elkjs 检测到 `Web Worker` 全局不存在时**自动 fallback** 到非 worker 模式（同步执行）
3. 实测：jsdom fallback 模式下 5000 节点 < 8s（vs 浏览器 worker 模式 < 1s）

---

## 4. Fallback 链

### 4.1 三级回退

```ts
// apps/web/src/utils/layout-engine-adapter.ts
async function runLayoutEngine(
  engineType: ResolvedEngineType,
  virtualNodes: LayoutNode[],
  virtualEdges: LayoutEdge[],
  config: LayoutConfig,
): Promise<Map<string, NodePosition>> {
  // 构建 fallback 链：按 engine → 后续引擎顺序
  const chain: ResolvedEngineType[] = [engineType]
  if (engineType !== 'dagre') chain.push('dagre')
  if (engineType !== 'compactBox') chain.push('compactBox')

  let lastError: unknown = null
  for (const engine of chain) {
    try {
      return await runSingleEngine(engine, virtualNodes, virtualEdges, config)
    } catch (err) {
      console.warn(`[W3 layout-engine-adapter] engine=${engine} failed:`, err)
      lastError = err
    }
  }
  throw new Error(`all engines failed. last error: ${String(lastError)}`)
}
```

### 4.2 触发场景

| 触发 | 主引擎 | 回退链 |
|------|--------|--------|
| elkjs worker 失败（CDN/WASM 离线） | elkjs → dagre → compactBox |
| dagre 抛错（拓扑循环） | dagre → compactBox |
| compactBox 抛错（数据结构异常） | compactBox → 抛错给调用方 |

### 4.3 compactBox 兜底路径

```ts
function runCompactBoxFallback(
  virtualNodes: LayoutNode[],
  virtualEdges: LayoutEdge[],
  config: LayoutConfig,
): Map<string, NodePosition> {
  // 复用 v3-v5 算法：递归 compactBox 输入构造 → compactBox 算法 → 位置收集
  // 与 dagre/elkjs 输出格式统一：Map<nodeId, NodePosition>
}
```

---

## 5. 主脉对齐实现

### 5.1 算法契约

dagre / elkjs 都不内置「主脉对齐」（即主脉节点 X ≈ 0）。LayoutEngine 在 dagre / elkjs 输出后用 `alignMainLineage` 阶段后处理：

```ts
// apps/web/src/utils/tree-layout.ts
export function alignMainLineage(
  nodePositions: Map<string, NodePosition>,
  nodeMap: Map<string, LayoutNode>,
  spouseByMain: Map<string, LayoutEdge[]>,
  childrenByParent: Map<string, string[]>,
  coupleUnitByMain: Map<string, CoupleUnit>,
  nodeMapForVirtualCheck?: Map<string, LayoutNode>,  // [W2 2026-09-01 新增] 可选：传 nodeMap 用于跳过虚拟节点 child
)
```

**6 个参数语义对照表**：

| 参数 | 类型 | 必填 | 用途 |
|------|------|------|------|
| `nodePositions` | `Map<string, NodePosition>` | ✅ | 待主脉对齐的节点位置（会被原地修改） |
| `nodeMap` | `Map<string, LayoutNode>` | ✅ | 节点元数据（读取 `isMainLineage`/`generation`） |
| `spouseByMain` | `Map<string, LayoutEdge[]>` | ✅ | 主节点 → 配偶边映射（供 CoupleUnit 整体平移时联动配偶位置） |
| `childrenByParent` | `Map<string, string[]>` | ✅ | 父 → 子节点 id 列表（用于遍历主脉子树） |
| `coupleUnitByMain` | `Map<string, CoupleUnit>` | ✅ | 跨模块共享的 CoupleUnit 表 |
| `nodeMapForVirtualCheck` | `Map<string, LayoutNode>`? | ❌ | W2 新增；传 `nodeMap` 时 `shiftNonMainSubtree` 跳过虚拟节点的 child 避免连带位移 |

### 5.2 实现要点

1. 识别主脉节点：`isMainLineage=true` 且 `generation >= 0` 的节点
2. 计算主脉 X 平均值 `mainAvgX`
3. 整体平移：`pos.x -= mainAvgX`（所有节点含虚拟节点同步平移）
4. 主脉 X 平均 ≈ 0（视觉锚点）

### 5.3 阶段[13] 主脉再居中

引擎输出后还会做一次主脉再居中（[阶段 13]），避免前面阶段（子树避让、整体居中）累积偏移：

```ts
// apps/web/src/utils/layout-engine.ts
if (config.mainLineageCenter) {
  const mainXValues: number[] = []
  for (const [id, node] of nodeMap) {
    if (node.isMainLineage && (node.generation ?? 0) >= 0 && !node.virtualSpouse) {
      const pos = realNodePositions.get(id)
      if (pos) mainXValues.push(pos.x)
    }
  }
  if (mainXValues.length > 0) {
    const mainAvgX = mainXValues.reduce((a, b) => a + b, 0) / mainXValues.length
    if (Math.abs(mainAvgX) > 1) {
      for (const [, pos] of realNodePositions) {
        pos.x -= mainAvgX
      }
      shiftEdgePathsX(finalEdges, -mainAvgX)
    }
  }
}
```

---

## 6. 性能对比（实测数据）

详见 [《bench-results.md》](bench-results.md)。

### 6.1 浏览器环境（生产）

| 节点数 | dagre 同步 | elkjs worker |
|--------|-----------|--------------|
| 1000 | ~30ms | ~200ms（含 WASM 加载） |
| 5000 | ~250ms | ~500ms |
| 10000 | ~800ms | ~1.5s |

### 6.2 jsdom + vitest 环境（CI）

| 节点数 | dagre 同步 | elkjs fallback（无 worker） |
|--------|-----------|----------------------------|
| 1000 | ~600ms（V8 JIT 冷启动） | ~500ms |
| 5000 | ~2s | ~3s |

阈值设宽于实测值 3-4 倍，含 V8 JIT 冷启动 + CI 抖动缓冲。

---

## 7. 常见问题

**Q：为什么不用一个引擎统一处理所有场景？**
A：dagre 同步路径在中小型树上无延迟；elkjs WASM 在大型树 / worker 下更稳。混合策略兼顾两者优势。

**Q：engine='auto' 的阈值 1000 是怎么定的？**
A：实测在浏览器上 1000 节点 dagre < 60ms，elkjs < 200ms（首次 WASM 加载）。1000 是个保守阈值，实际可达 2000 仍走 dagre。

**Q：elkjs worker 加载失败时会发生什么？**
A：elkjs 内部检测 worker 不可用时 fallback 到非 worker 模式（仍异步，但同步执行）。LayoutEngine 的 fallback 链会进一步回退到 dagre / compactBox。

**Q：dagre 与 elkjs 的同代 Y 一致性是否相同？**
A：是。两者都用 layered 算法，rank 内的 Y 严格一致。差异在 X：dagre 反转兄弟顺序，elkjs 按输入顺序。

**Q：compactBox 兜底路径还存在吗？**
A：保留。elkjs → dagre → compactBox 三级 fallback。compactBox 路径与 v5 行为兼容，用于调试 / WASM 离线场景。

---

## 8. 相关文件

| 文件 | 角色 |
|------|------|
| `apps/web/src/utils/layout-engine-adapter.ts` | 引擎选择 + fallback 链 |
| `apps/web/src/utils/dagre-layout.ts` | dagre 同步路径实现 |
| `apps/web/src/utils/elkjs-layout.ts` | elkjs 异步路径实现 |
| `apps/web/src/workers/elkjs-layout.worker.ts` | elkjs web worker 入口 |
| `apps/web/src/utils/__fixtures__/large-tree.ts` | 性能基准 fixture（1000/5000 节点） |
| `apps/web/src/utils/layout-engine.bench.spec.ts` | B1/B2/B3 + V1 + E1-E3 测试 |
| `apps/web/vite.config.ts` | dagre 加入 optimizeDeps |
| `apps/web/vitest.config.ts` | `@vitest/web-worker` 加入 setupFiles |

---

## 9. 演进历史

| 版本 | 引擎 | 说明 |
|------|------|------|
| v3 | Reingold-Tilford 自实现 | 单配偶树 |
| v4 | RT + 配偶拼接 | 一夫多妻 |
| v5 | @antv/hierarchy compactBox | 递归 tree-packing |
| **v6 (W3)** | **dagre + elkjs 双引擎** | **通用 DAG 布局器 + fallback compactBox** |

---

## 10. 验收标准

- ✅ 38 个 layout-engine 测试 + 12 个 spouse-virtualizer 测试全过
- ✅ 13 个 layout-engine.bench 测试全过（B1/B2/B3 + V1 + E1-E3）
- ✅ dagre 1001 节点 < 60ms（浏览器）；jsdom < 3s（CI 阈值）
- ✅ elkjs 5000 节点 < 1s（浏览器）；jsdom < 8s（CI 阈值）
- ✅ engine='auto' 默认按阈值切换
- ✅ engine='compactBox' 强制走 v5 兜底路径
- ✅ elkjs worker 失败 → 自动 fallback 到非 worker 模式
- ✅ dagre 拓扑循环 → fallback 到 compactBox
- ✅ dagre 反转兄弟顺序问题已 `.reverse()` 修复
- ✅ birthOrder 后处理兜底（reorderSiblingsByBirthOrder）