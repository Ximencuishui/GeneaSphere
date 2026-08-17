# 树谱模块 PRD · 实施映射表

- 依据：《树谱模块‑需求文档（PRD）》V1.0（`docs/树谱模块‑需求文档（PRD）.md`）
- 代码基准（2026-08 现状）：
  - `packages/db/prisma/schema.prisma`（数据模型）
  - `apps/server/src/tree/tree.service.ts` / `tree.controller.ts` / `tree.module.ts`
  - `apps/server/src/family-relation/family-relation.service.ts`（另一条写入路径，已与树谱双写统一）
  - `apps/server/src/pedigree/`（新增：亲子关系统一写入服务）
  - `apps/web/src/views/TreePage.vue`、`components/GenealogyTree.vue`、`api/tree.ts`、`types/index.ts`
- 状态图例：✅ 已实现 / 🔶 部分实现（有小缺口）/ 🆕 需新增 / 🔵 二期

---

## 一、数据源与存储原则（PRD §说明 / §2.1 / §5）

| PRD 要求 | 现有实现 | 状态 |
|---|---|---|
| 树谱是同一套人物数据的可视化视图，不独立存储 | `getClanFullTree`/`getSubTree` 实时读 Person/FamilyUnit/PersonAncestry，无副本 | ✅ |
| 数据源：人物表、配偶关系表 | `Person` + `FamilyUnit` | ✅ |
| 数据源：过继关系表 | 无独立表；过继/收养在 `FamilyChild.child_type`（BIOLOGICAL/ADOPTED/STEP/FOSTER） | ✅ 语义等价（PRD 表述可理解为"过继关系字段"） |
| 修改人物数据后树谱自动刷新 | 前端「刷新族谱」按钮 + 每次加载实时查询 | ✅ |
| 输入/输出：JSON 备份、PDF | JSON：admin `GET /api/admin/settings/export`；PDF：`print` 模块 + puppeteer worker；均不在树页工具栏 | 🔶 |

## 二、视图基础渲染（PRD §2.1）

| # | PRD 要求 | 现有实现 | 状态 |
|---|---|---|---|
| 1 | 横向世系树，父上子下；可选纵向 | 布局引擎支持 LR/TB 切换（`layoutDirection`，GenealogyTree 工具栏按钮） | ✅ |
| 2 | 男性蓝卡【夫】/ 女性红卡【妻/妾/女】，展示排行、姓名、生卒 | 节点按性别着色；生卒年可推导（birth_date/death_date）；**排行未展示**（树 API 不透出 birth_order） | 🔶 需 API 增强（本次已做，见 §六） |
| 3 | 水平连线=婚姻；垂直连线=父子 | spouse 边（水平，现任粉红实线/历史灰虚线）+ 父子边 | ✅ |
| 4 | 一人多配偶：多个配偶并排、各自分支子女 | 数据天然支持（FamilyUnit 多行 + marriage_order）；前端生成配偶副本节点；**"各妻子女分别分支"需 child→wife 归属**（本次 API 已透出 child_links） | 🔶 本次已补 |
| 5 | 过继/收养虚线标识 | `FamilyChild.child_type` 有数据，树 API 不透出（本次已补） | 🔶 本次已补 |
| 6 | 卡片只展示：身份标识、排行、姓名、生卒年（传记/葬地/功名不展示） | 卡片字段：姓名/性别/生卒/头像；身份标识=夫/妻/女由渲染推导；排行本次补 | 🔶 本次已补 |

## 三、画布交互（PRD §2.2）

| # | PRD 要求 | 现有实现 | 状态 |
|---|---|---|---|
| 1 | 滚轮缩放、移动端双指缩放 | G6 缩放/平移；**移动端 H5 树谱页面未做**（当前 h5 目录无树谱） | 🔵 |
| 2 | 平移拖拽 | G6 drag-canvas | ✅ |
| 3 | 单击卡片弹详情、跳转编辑、跳册谱 | `PersonEditDrawer` + 详情弹窗；**跳册谱**依赖册谱模块（新增后接 LinkToTree） | 🔶 |
| 4 | 房派分支折叠 | G6 `collapse-expand-node`（节点折叠）；**按房派折叠**需房派口径（复用 family-book 房支算法，决策清单 §C） | 🔶 |
| 5 | 定位到本人，画布自动居中 | `findMainLineagePath`（PersonUserLink）+ 「聚焦主传承线路」按钮 | ✅ |

## 四、顶部工具栏（PRD §2.3）

| 功能项 | 现有实现 | 状态 |
|---|---|---|
| 添加成员 | GenealogyTree「添加成员」+ TreePage「添加亲属」（含父/母/配偶/子女/兄弟姊妹，走双写统一入口） | ✅ |
| 搜索成员 | 画布内搜索框（前端过滤 + 高亮） | ✅ |
| 刷新视图 | 「刷新族谱」按钮（重新拉数据重绘） | ✅ |
| 导入 JSON | 新增 `POST /import/json`（ImportService.importFromJson，id 重映射 + 双写兜底；OWNER/ADMIN） | ✅ 2026-08-17 |
| 导入 Excel | `POST /import/excel`（ImportService.importFromExcel，已改走双写统一入口；OWNER/ADMIN） | ✅ 2026-08-17 |
| 导出 JSON | 树页新增 `GET /api/tree/clan/:clanId/export`（与 admin settings export 结构一致，兼容 slug；OWNER/ADMIN） | ✅ 2026-08-17 |
| 导出分页 PDF | `GET /print/genealogy/:clanId`（print 模块，A4 分页，40人/页；已兼容 slug；树页按钮） | ✅ 2026-08-17 |
| 导出完整大图 PDF | `GET /print/hanging/:clanId`（世系挂画 SVG→PDF，超长单页；超宽自动缩放+标注；树页"导出完整大图（挂画）"，导出前文件大小提示） | ✅ 2026-08-19 |

## 五、过滤开关（PRD §2.4，重要）

| 开关 | 现有实现 | 状态 |
|---|---|---|
| 隐藏妻子 / 隐藏女儿 / 隐藏女婿 | 已实现：`applyTraditionalFilters` 在 initGraph 入口做过滤拷贝（纯渲染、不改数据），工具栏下拉面板三个开关可自由组合、实时重绘；与吊线图/其他视图模式均兼容 | ✅ 2026-08-17 |
| 默认全开；实时重绘 | 开关切换走 `debouncedInitGraph` 全量重排 | ✅ |

> 建议：开关为纯渲染过滤（不改数据），与册谱世录卷过滤（`BookVolume.config`）共用同一语义（决策清单 §F3）。

## 六、本次 API 增强（child_type / birth_order / child→wife 归属）

背景：树 API 父子关系只来自 `PersonAncestry`（闭包表 depth=1），排行、过继类型、子女归属哪段婚姻/哪个妻子都存于 `FamilyChild`，从未透出。

**后端变更（`apps/server/src/tree/tree.service.ts`）**：

```ts
// 新增导出接口
export interface ChildLink {
  child_id: string;     // 对应 children[] 里的节点 id
  birth_order?: number; // 排行（FamilyChild.birth_order）
  child_type?: string;  // BIOLOGICAL | ADOPTED | STEP | FOSTER
  family_id?: string;   // 所属 FamilyUnit id
  mother_id?: string;   // 该家庭中的妻子 id（吊线图"各妻子女分别分支"的关键）
}
// TreeNode 新增（向后兼容，前端可忽略）
child_links?: ChildLink[]; // 与 children[] 一一对应（同下标）
```

- 加载路径：`getClanTreeOptimized` / `getClanTreeWithDepthLimit` / `getSubTree` 三处统一调用 `buildChildLinks(clanId|personIds)`（一次 `familyChild.findMany` + include family，O(N)）。
- 归属规则：对父节点 P 与子节点 C，从 C 的所有 FamilyChild 记录中优先选"P 为 husband/wife 的那条"，否则取第一条。
- `mother_id`：取所选家庭 `wife_id`（子女从哪个妻子分支）。
- 兼容性：新字段可选，旧前端不感知；`serializeBigInt` 出口统一序列化。

**前端对接（`apps/web/src/types/index.ts`）**：`GenealogyNode` 增加 `child_links?: ChildLink[]`（类型已补）。消费点：
- 吊线图模式（新增视图模式）：按 `child_links.mother_id` 把子女挂到对应妻子节点下；
- 卡片排行：读 `child_links.birth_order`；
- 过滤"隐藏女儿/女婿"：读子女 gender + child_links；
- 过继虚线：读 `child_links.child_type !== 'BIOLOGICAL'` → 虚线。

## 七、特殊业务场景（PRD §2.5）

| 场景 | 数据支持 | 状态 |
|---|---|---|
| 一人多配偶，各自子女分支 | FamilyUnit 多行 + child_links.mother_id | ✅ 本次 API 已透出 |
| 过继、兼祧，血缘虚线 | child_type + 多 FamilyChild 记录（兼祧=一人多条） | ✅ 本次 API 已透出 |
| 无子女不连线 | 无 children 即不画 | ✅ |
| 未婚无配偶 | 无 FamilyUnit 即无 spouse 边 | ✅ |
| 离异、早夭标记 | end_reason(divorce/widowed) 已有；早夭需按享年推导或 `PersonBio.premature`（册谱决策 §D） | 🔶 卡片标记需新增渲染 |

## 八、与册谱模块联动（PRD §2.6）

| 要求 | 现状 | 状态 |
|---|---|---|
| 树谱↔册谱双向跳转定位 | 册谱模块建设中；前端 `LinkToTree`/`PersonPop` 组件设计已定（册谱前端文档）；树谱侧需在卡片详情加「查看册谱」入口 + 高亮 | 🔶 册谱上线后接入 |
| 共用同一人物数据库，禁止双副本 | 树谱实时读库；册谱只存卷宗配置（BookVolume），人物仍单份；**双写一致性已统一**（PedigreeService + 回填脚本） | ✅ |

## 九、非功能需求（PRD §3）

| 要求 | 现状 | 状态 |
|---|---|---|
| 500 人流畅 / 1000 人提示折叠 | 深度限制加载、视口裁剪、头像懒加载（>500 阈值跳过预取）、分阶段进度条 | ✅ |
| 大数据量禁止一次性渲染 | viewport culling + 懒加载头像 | ✅ |
| Chrome/Edge + 移动端 H5 | Web 端 ✅；移动端：新增 `pinch-zoom` 双指缩放 behavior + 画布 `touch-action:none`，拖拽走 pointer 事件天然支持；工具栏横向滚动、768px 详情改底部抽屉（既有） | ✅ 2026-08-17 |
| 循环血缘检测，不崩溃 | `isConsanguineous` + moveSubTree 防环 + 血缘边查询过滤软删 | ✅（渲染端可再补显式环检测） |
| 缺父亲 ID 的祖先放顶层 | `findClanRootPerson`（无 parent 者 = 根） | ✅ |
| 导入格式错误给出明细 | PDF/Excel 导入有校验（xlsx-sanitizer、PdfParseTemp）；JSON 导入待建 | 🔶 |

## 十、验收标准对照（PRD §7）

| 验收项 | 现状 |
|---|---|
| 修改人物 → 树谱实时更新，与册谱一致 | ✅ 实时读库；册谱世录同源；双写已统一 |
| 过滤开关正确隐藏女性节点 | ✅ 已实现（PRD §2.4 三开关，纯渲染） |
| 多配偶、过继关系正确连线 | ✅ 数据齐备 + API 透出 child_links + 吊线图按 mother_id 分支、child_type 虚线 |
| 导入导出后关系无丢失 | 🔶 导出✅、导入 JSON 🆕；双写回填脚本保障一致性 |
| 循环血缘数据不崩溃 | ✅（isConsanguineous/moveSubTree 防环） |

---

## 汇总：待办清单（按依赖排序）

1. ~~双写一致性（PedigreeService + 回填脚本）~~ ✅ 已完成
2. ~~树 API 透出 child_links（child_type/birth_order/mother_id）~~ ✅ 已完成（后端 + web 类型）
3. ~~吊线图视图模式 + 排行/过继虚线渲染~~ ✅ 已完成（复用布局引擎配偶子树）
4. ~~过滤开关（隐藏妻子/女儿/女婿，纯渲染）~~ ✅ 已完成
5. ~~树页工具栏：导入 JSON/Excel、导出 JSON/分页PDF~~ ✅ 已完成（导出完整大图 PDF 留二期）
6. ~~移动端 H5 树谱（触摸双指缩放 + 小屏适配）~~ ✅ 已完成
7. ~~树谱↔册谱双向跳转~~ ✅ 已完成一期核心闭环（2026-08-17：`/cepu/:clanId` 册谱页 + `?person=` 定位世录 + `?focus=` 树谱高亮居中 + 树谱详情"查看册谱"按钮 + 管理后台/家族详情页入口）
