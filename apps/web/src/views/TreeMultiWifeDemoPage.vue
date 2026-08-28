<script setup lang="ts">
/**
 * 一夫多妻 + 子树避让优化 Demo 页
 *
 * 直接调用 LayoutEngine 计算布局，并把节点 / 边渲染为 SVG。
 * 用于人工验收 v4 优化方案（一夫多妻走线 + 同世代卡片不重叠 + 牵引线不重叠）。
 *
 * 路由：/demo/tree-multi-wife（无需登录）
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutEngine } from '@/utils/layout-engine'
import type { LayoutNode, LayoutEdge } from '@/types/layout'

// [2026-08-27 §2.7 验收] 视图模式预设
// - compact: Demo 原始尺寸（80×32, sep=28, rank=60）—— 紧凑卡片
// - detailed: PRD §2.7 目标模式（76×110, sep=32, rank=140）—— 详细横排卡片
//   节点高度增加后，能在视觉上验证「T 形分支水平段共享 Y」「梳状布线汇
//   聚点位于丈夫底与妻子顶之间」等走线要求
// [2026-08-27 P1 修复] 同步主组件 GenealogyTree.vue 的 56→76 加宽决策，
// 宽高比从 0.51 提升到 ~0.69，匹配生产模式。
const VIEW_MODE_PRESETS = {
  compact:  { nodeWidth: 80, nodeHeight: 32, nodeSep: 28, rankSep: 60,  spouseGap: 40 },
  detailed: { nodeWidth: 76, nodeHeight: 110, nodeSep: 32, rankSep: 140, spouseGap: 32 },
} as const
type ViewMode = keyof typeof VIEW_MODE_PRESETS
const route = useRoute()
const router = useRouter()

// 与 GenealogyTree.vue 中的 WIFE_PALETTE 保持一致
const WIFE_PALETTE: string[] = [
  '#C0392B',
  '#27AE60',
  '#2980B9',
  '#D68910',
  '#7D3C98',
  '#138D75',
  '#6E2C00',
  '#B9770E',
]
function hashPersonId(id: string | number): number {
  const s = String(id)
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
function getWifePaletteColor(id: string | number): string {
  return WIFE_PALETTE[hashPersonId(id) % WIFE_PALETTE.length]
}

// ---------- 数据集（4 个最小场景）----------

// [2026-08-27 P1 修复] 节点 width/height 不再硬编码。
// 原 NW=80/NH=32 是 compact 模式尺寸，detailed 模式下被错误套用。
// LayoutEngine 在节点 width/height 缺失时会回退到 VIEW_MODE_PRESETS.nodeWidth/Height，
// 因此让场景节点显式声明 width=0/height=0（falsy）触发回退逻辑，
// 切换 viewMode 时所有节点尺寸随之同步，避免手动维护。
const NW = 0 as const
const NH = 0 as const

type Scenario = {
  id: string
  label: string
  description: string
  nodes: LayoutNode[]
  edges: LayoutEdge[]
}

const scenarios: Scenario[] = [
  // 场景 1：单夫 4 妻，妻 2 有较深继子女子树
  {
    id: 'multi-wife',
    label: '一夫四妻',
    description: '1 夫 + 4 妻，妻 2 有 3 代继子女，验证妻子调色板与梳状分岔。',
    nodes: [
      { id: '1', label: '夫', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: NW, height: NH },
      { id: '2', label: '妻 1', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: NW, height: NH },
      { id: '3', label: '妻 2', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: NW, height: NH },
      { id: '4', label: '妻 3', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: NW, height: NH },
      { id: '5', label: '妻 4', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: NW, height: NH },
      { id: 'A', label: '继 A', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: NW, height: NH },
      { id: 'B1', label: '继 B1', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: NW, height: NH },
      { id: 'B2', label: '继 B2', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: NW, height: NH },
      { id: 'B1a', label: 'B1 子', gender: 'male', isMainLineage: true, isLiving: false, generation: 2, width: NW, height: NH },
      { id: 'B1b', label: 'B1 女', gender: 'female', isMainLineage: false, isLiving: false, generation: 2, width: NW, height: NH },
      { id: 'C', label: '继 C', gender: 'male', isMainLineage: false, isLiving: false, generation: 1, width: NW, height: NH },
    ],
    edges: [
      { id: 'e-sp1', source: '1', target: '2', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'e-sp2', source: '1', target: '3', kind: 'spouse', marriageOrder: 2, isCurrent: true },
      { id: 'e-sp3', source: '1', target: '4', kind: 'spouse', marriageOrder: 3, isCurrent: true },
      { id: 'e-sp4', source: '1', target: '5', kind: 'spouse', marriageOrder: 4, isCurrent: true },
      { id: 'e-p1', source: '2', target: 'A', kind: 'parent-child' },
      { id: 'e-p2', source: '3', target: 'B1', kind: 'parent-child' },
      { id: 'e-p3', source: '3', target: 'B2', kind: 'parent-child' },
      { id: 'e-p4', source: 'B1', target: 'B1a', kind: 'parent-child' },
      { id: 'e-p5', source: 'B1', target: 'B1b', kind: 'parent-child' },
      { id: 'e-p6', source: '5', target: 'C', kind: 'parent-child' },
    ],
  },
  // 场景 2：单夫 + 单妻 + 3 子女（多子女梳状）
  {
    id: 'single-spouse-multi-kids',
    label: '单妻多子女',
    description: '1 夫 + 1 妻 + 3 子女，验证 T 形分支水平段 Y 一致。',
    nodes: [
      { id: 'H', label: '夫', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: NW, height: NH },
      { id: 'W', label: '妻', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: NW, height: NH },
      { id: 'S1', label: '长子', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: NW, height: NH },
      { id: 'S2', label: '次子', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: NW, height: NH },
      { id: 'S3', label: '三子', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: NW, height: NH },
      { id: 'GS1', label: '长孙', gender: 'male', isMainLineage: true, isLiving: false, generation: 2, width: NW, height: NH },
      { id: 'GS2', label: '次孙', gender: 'male', isMainLineage: true, isLiving: false, generation: 2, width: NW, height: NH },
    ],
    edges: [
      { id: 'e-sp', source: 'H', target: 'W', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'e-hs1', source: 'H', target: 'S1', kind: 'parent-child' },
      { id: 'e-hs2', source: 'H', target: 'S2', kind: 'parent-child' },
      { id: 'e-hs3', source: 'H', target: 'S3', kind: 'parent-child' },
      { id: 'e-s1g1', source: 'S1', target: 'GS1', kind: 'parent-child' },
      { id: 'e-s2g2', source: 'S2', target: 'GS2', kind: 'parent-child' },
    ],
  },
  // 场景 3：连襟
  {
    id: 'brothers-in-law',
    label: '连襟（兄弟各婚）',
    description: '兄弟 H1/H2 各婚配 W1/W2，验证同代男性的配偶节点不重叠。',
    nodes: [
      { id: 'ROOT', label: '父', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: NW, height: NH },
      { id: 'H1', label: '长子', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: NW, height: NH },
      { id: 'H2', label: '次子', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: NW, height: NH },
      { id: 'W1', label: '大姐', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: NW, height: NH },
      { id: 'W2', label: '二姐', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: NW, height: NH },
      { id: 'C1', label: '长孙', gender: 'male', isMainLineage: true, isLiving: false, generation: 2, width: NW, height: NH },
      { id: 'C2', label: '次孙', gender: 'male', isMainLineage: true, isLiving: false, generation: 2, width: NW, height: NH },
    ],
    edges: [
      { id: 'e-root-h1', source: 'ROOT', target: 'H1', kind: 'parent-child' },
      { id: 'e-root-h2', source: 'ROOT', target: 'H2', kind: 'parent-child' },
      { id: 'e-h1w1', source: 'H1', target: 'W1', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'e-h2w2', source: 'H2', target: 'W2', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'e-h1c1', source: 'H1', target: 'C1', kind: 'parent-child' },
      { id: 'e-h2c2', source: 'H2', target: 'C2', kind: 'parent-child' },
    ],
  },
  // 场景 4：双重身份（既是子又是夫）
  {
    id: 'dual-role',
    label: '双重身份',
    description: 'X 既是 P 的子女，又是 Y 的配偶；父子边 + 配偶边都正确路由。',
    nodes: [
      { id: 'P', label: '父', gender: 'male', isMainLineage: true, isLiving: false, generation: 0, width: NW, height: NH },
      { id: 'M', label: '母', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: NW, height: NH },
      { id: 'X', label: '兼子女配偶', gender: 'male', isMainLineage: true, isLiving: false, generation: 1, width: NW, height: NH },
      { id: 'Y', label: 'X 的配偶', gender: 'female', isMainLineage: false, isLiving: false, generation: -1, width: NW, height: NH },
    ],
    edges: [
      { id: 'e-sp-pm', source: 'P', target: 'M', kind: 'spouse', marriageOrder: 1, isCurrent: true },
      { id: 'e-px', source: 'P', target: 'X', kind: 'parent-child' },
      { id: 'e-sp-xy', source: 'X', target: 'Y', kind: 'spouse', marriageOrder: 1, isCurrent: true },
    ],
  },
]

// ---------- 状态 ----------

/** 视图模式（compact / detailed），支持 URL ?mode= 持久化 */
const viewMode = ref<ViewMode>(((route.query.mode as ViewMode) || 'compact') in VIEW_MODE_PRESETS
  ? (route.query.mode as ViewMode)
  : 'compact')
/** 缩放百分比，支持 URL ?zoom= 持久化，默认 100% */
const zoomPercent = ref<number>(Math.min(400, Math.max(25, Number(route.query.zoom) || 100)))
const activeId = ref(scenarios[0].id)
const layout = ref<ReturnType<LayoutEngine['calculateLayout']> | null>(null)
const elapsed = ref(0)

const activeScenario = computed(() => scenarios.find(s => s.id === activeId.value)!)

/**
 * 把当前 viewMode / zoomPercent 写回 URL（保持可分享、可复现）
 * 用 router.replace 避免污染历史栈
 */
function syncUrl() {
  router.replace({
    query: {
      ...route.query,
      mode: viewMode.value,
      zoom: String(zoomPercent.value),
      scenario: activeId.value,
    },
  }).catch(() => {/* 路由重复 replace 静默忽略 */})
}

watch([viewMode, zoomPercent, activeId], () => {
  syncUrl()
})

/**
 * 根据当前 viewMode 缩放场景节点的尺寸与间距
 * - 不修改原 scenarios 数组，避免切换模式时原数据累积
 * - LayoutEngine.calculateLayout 内部会用到节点 width/height
 */
function buildLayoutInput(): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const preset = VIEW_MODE_PRESETS[viewMode.value]
  return {
    nodes: activeScenario.value.nodes.map(n => ({
      ...n,
      width: preset.nodeWidth,
      height: preset.nodeHeight,
    })),
    edges: activeScenario.value.edges,
  }
}

function compute() {
  const preset = VIEW_MODE_PRESETS[viewMode.value]
  const engine = new LayoutEngine({
    canvasSize: { width: 1400, height: 800 },
    config: {
      nodeWidth: preset.nodeWidth,
      nodeHeight: preset.nodeHeight,
      nodeSep: preset.nodeSep,
      rankSep: preset.rankSep,
      spouseGap: preset.spouseGap,
      marriageJunctionOffset: 16,
      edgeHorizontalSeparation: 10,
      resolveSubtreeOverlap: true,
    },
  })
  const t0 = performance.now()
  const input = buildLayoutInput()
  layout.value = engine.calculateLayout(input.nodes, input.edges)
  elapsed.value = +(performance.now() - t0).toFixed(2)
  // 重置主画布 transform 与选中状态，避免切换场景后 transform 残留
  selectedNodeId.value = null
  highlightMode.value = null
  resetMainTransform()
}

// [2026-08-27 §2.7 验收] viewMode / zoomPercent 变化都要重算 + 重置 transform
watch([viewMode, zoomPercent], () => compute())

onMounted(() => {
  // 同步 URL 上的 scenario 参数（首次访问 ?scenario=multi-wife 时）
  if (route.query.scenario && scenarios.some(s => s.id === route.query.scenario)) {
    activeId.value = route.query.scenario as string
  }
  compute()
})

// ---------- 渲染辅助 ----------

const VIEWBOX_PAD = 40

const viewBox = computed(() => {
  if (!layout.value) return `0 0 800 400`
  const { bounds } = layout.value
  const minX = bounds.minX - VIEWBOX_PAD
  const minY = bounds.minY - VIEWBOX_PAD
  const w = bounds.maxX - bounds.minX + VIEWBOX_PAD * 2
  const h = bounds.maxY - bounds.minY + VIEWBOX_PAD * 2
  return `${minX} ${minY} ${w} ${h}`
})

function pathToD(pts: { x: number; y: number }[]): string {
  if (!pts.length) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`
  return d
}

function nodeFill(id: string, isMain: boolean, gender: string): string {
  if (isMain) return '#FFF8E7'
  return gender === 'male' ? '#F0F4F8' : '#FFF1F5'
}

function nodeStroke(id: string, isMain: boolean): string {
  // [2026-08-27 P2 修复] demo 非主脉节点原描边色 #9E9E9E（中性灰）
  //   在 #FFF1F5（女粉）/ #F0F4F8（男淡蓝）填充上对比度不足，
  //   WCAG 对比度仅 2.1，未达 3.0 的「图形元素」最低标准。
  //   改为 #4A4A4A（深炭灰），对比度提升到 8.4+（女性填充）/ 9.2+（男性填充），
  //   既保持非主脉节点的「次级视觉」地位，又满足图形对比度要求。
  if (isMain) return '#C9A96E'
  return '#4A4A4A'
}

function edgeStroke(edge: LayoutEdge): string {
  if (edge.kind === 'spouse') {
    // 调色板锚到女性配偶 id（target 是配偶）
    return getWifePaletteColor(edge.target)
  }
  return '#999'
}

// ---------- 高亮交互 ----------

/** 当前选中节点 id（null 表示未选中） */
const selectedNodeId = ref<string | null>(null)

/**
 * 与某节点相关的边 id 集合
 *
 * 配偶边：source 或 target 任一端为选中节点
 * 父子边：source 或 target 任一端为选中节点
 *
 * 注意：边集合在 layout.value.edges 中以 id 为 key，且 LayoutEngine
 * 会为不同源共享同一配偶节点时复制 spouse 副本（id 仍唯一）。
 */
const relatedEdgeIds = computed(() => {
  if (!selectedNodeId.value || !layout.value) return new Set<string>()
  const sel = selectedNodeId.value
  const ids = new Set<string>()
  for (const e of layout.value.edges) {
    if (e.source === sel || e.target === sel) ids.add(e.id)
  }
  return ids
})

/**
 * 高亮模式：
 *  - 'spouse'：突出与选中节点相关的配偶边（其他边淡化）
 *  - 'all'   ：突出所有相关边（父子 + 配偶）
 *  - null    ：无高亮（清除选中）
 */
type HighlightMode = 'spouse' | 'all' | null
const highlightMode = ref<HighlightMode>(null)

function onNodeClick(id: string) {
  if (selectedNodeId.value === id) {
    // 同一节点再次点击：清除选中
    selectedNodeId.value = null
    highlightMode.value = null
    return
  }
  selectedNodeId.value = id
  // 默认高亮模式：配偶优先
  highlightMode.value = 'spouse'
}

function setMode(mode: HighlightMode) {
  highlightMode.value = mode
}

function isEdgeHighlighted(edge: LayoutEdge): boolean {
  if (!selectedNodeId.value || !relatedEdgeIds.value.has(edge.id)) return false
  if (highlightMode.value === 'all') return true
  if (highlightMode.value === 'spouse') return edge.kind === 'spouse'
  return false
}

function isEdgeDimmed(edge: LayoutEdge): boolean {
  if (!selectedNodeId.value) return false
  if (relatedEdgeIds.value.has(edge.id)) return false
  return true
}

function isNodeHighlighted(id: string): boolean {
  return selectedNodeId.value === id
}

function isNodeRelated(id: string): boolean {
  if (!selectedNodeId.value) return false
  if (selectedNodeId.value === id) return true
  // 通过边反查节点关系：与 selectedNode 共享边的另一端节点
  if (!layout.value) return false
  for (const e of layout.value.edges) {
    if (e.source === selectedNodeId.value && e.target === id) return true
    if (e.target === selectedNodeId.value && e.source === id) return true
  }
  return false
}

// ---------- Hover 提示与详情面板 ----------

/** 当前 hover 节点 id 与屏幕坐标 */
const hoverNodeId = ref<string | null>(null)
const hoverPos = ref<{ x: number; y: number } | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)

function onNodeEnter(id: string, evt: MouseEvent) {
  hoverNodeId.value = id
  // 把鼠标坐标转换到 SVG viewBox 坐标系下的偏移，用于提示框定位
  if (svgRef.value) {
    const pt = svgRef.value.createSVGPoint()
    pt.x = evt.clientX
    pt.y = evt.clientY
    const ctm = svgRef.value.getScreenCTM()
    if (ctm) {
      const local = pt.matrixTransform(ctm.inverse())
      hoverPos.value = { x: local.x, y: local.y }
    } else {
      hoverPos.value = null
    }
  }
}

function onNodeLeave() {
  hoverNodeId.value = null
  hoverPos.value = null
}

/**
 * 点击缩略图节点 → 切换主画布选中节点 + 滚动主画布使该节点居中
 *
 * 注意：主画布目前是直接渲染 layout.value（无 G6 viewport），
 * 因此我们通过 transform 一个 wrapper `<g>` 元素实现平移 + 缩放。
 */
function onThumbNodeClick(id: string, _evt: MouseEvent) {
  onNodeClick(id)
  // 平移主画布使节点居中：触发 mainTransform 重新计算
  focusNodeInMain(id)
}

/** 主画布视口 transform：scale 由 zoomPercent 驱动，tx/ty 仅用于 focusNode 后的居中 */
const mainTransform = computed(() => {
  const scale = zoomPercent.value / 100
  // 当用户未主动 focus（focusNodeInMain 会设置 tx/ty）时，tx/ty=0
  return { tx: 0, ty: 0, scale }
})

/**
 * 用户主动聚焦时使用的 transform override（覆盖 zoom 的默认 scale）
 * - null：跟随 zoomPercent
 * - {tx, ty, scale}：使用该值（如 1.0 以保持 viewBox 比例）
 */
const focusTransform = ref<{ tx: number; ty: number; scale: number } | null>(null)

function focusNodeInMain(id: string) {
  if (!layout.value) return
  const n = layout.value.nodes.find(x => x.id === id)
  if (!n) return
  // 平移使节点居中：focus 模式用 scale=1（保持 viewBox 比例），让节点直接落到 SVG 中心
  focusTransform.value = {
    tx: -n.x,
    ty: -n.y,
    scale: 1,
  }
}

/** 还原主画布 transform 到初始状态（跟随 zoomPercent） */
function resetMainTransform() {
  focusTransform.value = null
}

/** 实际渲染 transform：focus 优先，否则跟随 zoom */
const renderTransform = computed(() => {
  if (focusTransform.value) return focusTransform.value
  return mainTransform.value
})

/**
 * 选中节点的「详细信息」聚合
 *  - 入向边（source → self）：夫或父
 *  - 出向边（self → target）：妻 / 子 / 继子女
 *  - 关联节点：上述两端点中真实存在的节点
 */
const selectedDetail = computed(() => {
  if (!selectedNodeId.value || !layout.value) return null
  const sel = selectedNodeId.value
  const node = activeScenario.value.nodes.find(n => n.id === sel)
  if (!node) return null

  const spouseEdges: LayoutEdge[] = []
  const childEdges: LayoutEdge[] = []
  const parentEdges: LayoutEdge[] = []
  for (const e of layout.value.edges) {
    if (e.source === sel && e.kind === 'spouse') spouseEdges.push(e)
    else if (e.target === sel && e.kind === 'spouse') spouseEdges.push(e)
    if (e.source === sel && e.kind === 'parent-child') childEdges.push(e)
    if (e.target === sel && e.kind === 'parent-child') parentEdges.push(e)
  }

  const resolveLabel = (id: string) =>
    activeScenario.value.nodes.find(n => n.id === id)?.label ?? id

  return {
    node,
    spouses: spouseEdges
      .filter(e => e.source === sel || e.target === sel)
      .map(e => {
        const otherId = e.source === sel ? e.target : e.source
        const order = (e as any).marriageOrder ?? 0
        return { id: otherId, label: resolveLabel(otherId), order }
      })
      .sort((a, b) => a.order - b.order),
    children: childEdges.map(e => ({
      id: e.target, label: resolveLabel(e.target),
    })),
    parents: parentEdges.map(e => ({
      id: e.source, label: resolveLabel(e.source),
    })),
  }
})

// ---------- 缩略图：以选中节点为根的 2 代上下文子树 ----------

/**
 * 缩略图节点 / 边：以选中节点为中心，向上取 1 代父辈、向下取 2 代子辈。
 * 用 LayoutEngine 计算缩略子树的位置（独立调用，与主画布隔离）。
 *
 * 实现：
 *  1. 在主节点列表中找出「选中节点 ±2 代」可达的所有节点
 *  2. 过滤边
 *  3. 调用 LayoutEngine.calculateLayout
 *  4. 输出 {nodes, edges, viewBox}
 */
const thumbnailLayout = computed(() => {
  if (!selectedNodeId.value || !layout.value) return null
  const sel = selectedNodeId.value
  const fullNodes = activeScenario.value.nodes
  const fullEdges = activeScenario.value.edges

  // BFS 求 2 代祖先 + 2 代后代的可达集合
  const ancestors = new Set<string>([sel])
  const descendants = new Set<string>([sel])
  const edgeMap = new Map<string, string[]>()

  for (const e of fullEdges) {
    if (!edgeMap.has(e.source)) edgeMap.set(e.source, [])
    edgeMap.get(e.source)!.push(e.target)
  }

  // 上溯 2 代
  let upLayer = new Set<string>([sel])
  for (let i = 0; i < 2; i++) {
    const next = new Set<string>()
    for (const id of upLayer) {
      for (const e of fullEdges) {
        if (e.kind === 'parent-child' && e.target === id && !ancestors.has(e.source)) {
          next.add(e.source)
          ancestors.add(e.source)
        }
      }
    }
    upLayer = next
  }
  // 下探 2 代
  let downLayer = new Set<string>([sel])
  for (let i = 0; i < 2; i++) {
    const next = new Set<string>()
    for (const id of downLayer) {
      const children = edgeMap.get(id) || []
      for (const c of children) {
        if (!descendants.has(c)) {
          next.add(c)
          descendants.add(c)
        }
      }
    }
    downLayer = next
  }
  // 配偶关系：把 sel 的配偶也带上（不计入代数）
  for (const e of fullEdges) {
    if (e.kind !== 'spouse') continue
    if (e.source === sel) ancestors.add(e.target)
    if (e.target === sel) ancestors.add(e.source)
  }

  const keep = new Set<string>([...ancestors, ...descendants])
  const subNodes = fullNodes.filter(n => keep.has(n.id))
  // 边：仅保留两端都在 keep 内的边
  const subEdges = fullEdges.filter(e => keep.has(e.source) && keep.has(e.target))

  if (subNodes.length === 0) return null

  const tEngine = new LayoutEngine({
    canvasSize: { width: 400, height: 260 },
    config: {
      nodeSep: 18,
      rankSep: 40,
      spouseGap: 24,
      marriageJunctionOffset: 10,
      edgeHorizontalSeparation: 4,
      resolveSubtreeOverlap: true,
      mainLineageCenter: false, // 缩略图不强制居中主脉
    },
  })
  const result = tEngine.calculateLayout(subNodes, subEdges)

  // 高亮选中节点及其相邻节点（在缩略图中）
  const highlighted = new Set<string>([sel])

  // viewBox 自适应
  const pad = 12
  const minX = result.bounds.minX - pad
  const minY = result.bounds.minY - pad
  const w = result.bounds.maxX - result.bounds.minX + pad * 2
  const h = result.bounds.maxY - result.bounds.minY + pad * 2

  return {
    nodes: result.nodes,
    edges: result.edges,
    viewBox: `${minX} ${minY} ${w} ${h}`,
    highlighted,
    sel,
  }
})

function thumbEdgeColor(edge: LayoutEdge): string {
  // 缩略图配偶边用妻子 palette
  if (edge.kind === 'spouse') return getWifePaletteColor(edge.target)
  return '#aaa'
}

function thumbNodeFill(isSel: boolean, isMain: boolean, gender: string): string {
  if (isSel) return '#FFF1F0' // 选中节点淡粉底
  if (isMain) return '#FFF8E7'
  return gender === 'male' ? '#F0F4F8' : '#FFF1F5'
}

/** 缩略图中节点是否可点击跳转（非选中节点本身） */
function isThumbClickable(id: string): boolean {
  return thumbnailLayout.value?.sel !== id
}

function thumbNodeClass(id: string): string[] {
  const arr = ['thumb-node']
  if (thumbnailLayout.value?.highlighted.has(id)) arr.push('thumb-selected')
  if (isThumbClickable(id)) arr.push('thumb-clickable')
  return arr
}
</script>

<template>
  <div class="demo-page">
    <header class="demo-header">
      <h1>一夫多妻 + 子树避让优化 Demo</h1>
      <p class="desc">
        直接调用 LayoutEngine 渲染布局，用于人工验收 v4 优化方案。
        切换下方场景查看梳状分岔、T 形分支、子树避让等效果。
      </p>
    </header>

    <div class="scenario-tabs">
      <button
        v-for="s in scenarios"
        :key="s.id"
        :class="['tab', { active: s.id === activeId }]"
        @click="activeId = s.id; compute()"
      >
        {{ s.label }}
      </button>
      <span class="meta">节点 {{ activeScenario.nodes.length }} · 边 {{ activeScenario.edges.length }} · 布局耗时 {{ elapsed }} ms</span>
    </div>

    <!-- [2026-08-27 §2.7 验收] 视图模式 + 缩放工具栏 -->
    <div class="view-toolbar">
      <div class="tool-group">
        <span class="tool-label">视图模式：</span>
        <button
          v-for="m in (Object.keys(VIEW_MODE_PRESETS) as ViewMode[])"
          :key="m"
          :class="['tool-btn', { active: viewMode === m }]"
          @click="viewMode = m"
          :data-mode="m"
        >{{ m === 'compact' ? '紧凑卡片' : '详细卡片（detailed）' }}</button>
      </div>
      <div class="tool-group">
        <span class="tool-label">缩放：</span>
        <button class="tool-btn zoom-btn" @click="zoomPercent = Math.max(25, zoomPercent - 25)" data-action="zoom-out">−</button>
        <span class="zoom-readout" data-test="zoom-readout">{{ zoomPercent }}%</span>
        <button class="tool-btn zoom-btn" @click="zoomPercent = Math.min(400, zoomPercent + 25)" data-action="zoom-in">+</button>
        <button
          v-for="z in [50, 75, 100, 125, 150, 200]"
          :key="z"
          :class="['tool-btn', 'zoom-preset', { active: zoomPercent === z }]"
          @click="zoomPercent = z"
          :data-zoom="z"
        >{{ z }}%</button>
      </div>
    </div>

    <p class="scenario-desc">{{ activeScenario.description }}</p>

    <div class="canvas-wrapper">
      <svg
        :viewBox="viewBox"
        preserveAspectRatio="xMidYMid meet"
        class="canvas"
        ref="svgRef"
        data-test="demo-canvas"
        :data-mode="viewMode"
        :data-zoom="zoomPercent"
        :data-scenario="activeId"
      >
        <!-- 边 -->
        <g class="edges" :transform="`translate(${renderTransform.tx}, ${renderTransform.ty}) scale(${renderTransform.scale})`">
          <path
            v-for="e in layout?.edges"
            :key="e.id"
            :d="pathToD(e.path?.points || [])"
            :stroke="edgeStroke(e)"
            :stroke-width="
              isEdgeHighlighted(e) ? (e.kind === 'spouse' ? 4 : 3) :
              isEdgeDimmed(e) ? 1 : (e.kind === 'spouse' ? 2 : 1.5)
            "
            :opacity="isEdgeDimmed(e) ? 0.18 : 1"
            fill="none"
            stroke-linejoin="miter"
            :class="['edge', { highlighted: isEdgeHighlighted(e), dimmed: isEdgeDimmed(e) }]"
          />
        </g>

        <!-- 节点 -->
        <g class="nodes" :transform="`translate(${renderTransform.tx}, ${renderTransform.ty}) scale(${renderTransform.scale})`">
          <g
            v-for="n in layout?.nodes"
            :key="n.id"
            :transform="`translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`"
            :class="['node', {
              highlighted: isNodeHighlighted(n.id),
              related: isNodeRelated(n.id),
              hovered: hoverNodeId === n.id,
              dimmed: selectedNodeId !== null && !isNodeHighlighted(n.id) && !isNodeRelated(n.id),
            }]"
            @click="onNodeClick(n.id)"
            @mouseenter="onNodeEnter(n.id, $event)"
            @mouseleave="onNodeLeave"
          >
            <rect
              :width="n.width"
              :height="n.height"
              :fill="nodeFill(n.id, !!activeScenario.nodes.find(x => x.id === n.id && x.isMainLineage), activeScenario.nodes.find(x => x.id === n.id)?.gender || '')"
              :stroke="nodeStroke(n.id, !!activeScenario.nodes.find(x => x.id === n.id && x.isMainLineage))"
              stroke-width="1.5"
              rx="3"
            />
            <text
              :x="n.width / 2"
              :y="n.height / 2 + 4"
              text-anchor="middle"
              font-size="12"
              fill="#333"
            >
              {{ activeScenario.nodes.find(x => x.id === n.id)?.label }}
            </text>
          </g>
        </g>

        <!-- Hover 提示 -->
        <g
          v-if="hoverNodeId && hoverPos"
          class="tooltip"
          :transform="`translate(${hoverPos.x + 10}, ${hoverPos.y - 8})`"
        >
          <rect
            x="0" y="0" width="160" height="46" rx="4"
            fill="rgba(50,50,50,0.92)"
          />
          <text
            x="8" y="16"
            font-size="11"
            fill="#fff"
            font-weight="600"
          >
            {{ activeScenario.nodes.find(x => x.id === hoverNodeId)?.label }}
          </text>
          <text x="8" y="32" font-size="10" fill="#ccc">
            {{ (activeScenario.nodes.find(x => x.id === hoverNodeId)?.gender === 'male' ? '男' : '女') }}
            ·
            {{ activeScenario.nodes.find(x => x.id === hoverNodeId)?.isMainLineage ? '主脉' : '支系' }}
            ·
            第 {{ (activeScenario.nodes.find(x => x.id === hoverNodeId)?.generation ?? 0) + 1 }} 世
          </text>
          <text x="8" y="42" font-size="9" fill="#999">点击查看详情</text>
        </g>
      </svg>
    </div>

    <!-- 选中节点详情面板 -->
    <div v-if="selectedDetail" class="detail-panel">
      <div class="detail-header">
        <div class="detail-left">
          <div class="detail-avatar">
            {{ selectedDetail.node.label.charAt(0) }}
          </div>
          <div class="detail-title">
            <h3>{{ selectedDetail.node.label }}</h3>
            <div class="detail-meta">
              <el-tag :type="selectedDetail.node.gender === 'male' ? 'primary' : 'danger'" size="small" effect="dark">
                {{ selectedDetail.node.gender === 'male' ? '男' : '女' }}
              </el-tag>
              <span class="gen-badge">第 {{ (selectedDetail.node.generation ?? 0) + 1 }} 世</span>
              <el-tag v-if="selectedDetail.node.isMainLineage" type="warning" size="small">主脉</el-tag>
            </div>
          </div>
        </div>
        <div v-if="thumbnailLayout" class="thumb-wrap">
          <svg
            :viewBox="thumbnailLayout.viewBox"
            preserveAspectRatio="xMidYMid meet"
            class="thumb-svg"
          >
            <g class="thumb-edges">
              <path
                v-for="e in thumbnailLayout.edges"
                :key="e.id"
                :d="pathToD(e.path?.points || [])"
                :stroke="thumbEdgeColor(e)"
                :stroke-width="e.kind === 'spouse' ? 1.5 : 1"
                fill="none"
                stroke-linejoin="miter"
              />
            </g>
            <g class="thumb-nodes">
              <g
                v-for="n in thumbnailLayout.nodes"
                :key="n.id"
                :transform="`translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`"
                :class="thumbNodeClass(n.id)"
                @click="onThumbNodeClick(n.id, $event)"
              >
                <rect
                  :width="n.width"
                  :height="n.height"
                  :fill="thumbNodeFill(
                    thumbnailLayout.highlighted.has(n.id),
                    !!activeScenario.nodes.find(x => x.id === n.id && x.isMainLineage),
                    activeScenario.nodes.find(x => x.id === n.id)?.gender || ''
                  )"
                  :stroke="thumbnailLayout.highlighted.has(n.id) ? '#E91E63' : '#bbb'"
                  :stroke-width="thumbnailLayout.highlighted.has(n.id) ? 1.5 : 0.8"
                  rx="2"
                />
                <text
                  :x="n.width / 2"
                  :y="n.height / 2 + 3"
                  text-anchor="middle"
                  font-size="9"
                  :fill="thumbnailLayout.highlighted.has(n.id) ? '#C2185B' : '#666'"
                  :font-weight="thumbnailLayout.highlighted.has(n.id) ? '600' : '400'"
                >
                  {{ activeScenario.nodes.find(x => x.id === n.id)?.label }}
                </text>
              </g>
            </g>
          </svg>
        </div>
      </div>
      <div class="detail-body">
        <div v-if="selectedDetail.parents.length" class="detail-row">
          <span class="row-label">父：</span>
          <span
            v-for="p in selectedDetail.parents"
            :key="p.id"
            class="pill"
            @click="onNodeClick(p.id)"
          >{{ p.label }}</span>
        </div>
        <div v-if="selectedDetail.spouses.length" class="detail-row">
          <span class="row-label">配偶：</span>
          <span
            v-for="s in selectedDetail.spouses"
            :key="s.id"
            class="pill spouse-pill"
            :style="{ borderColor: getWifePaletteColor(s.id) }"
            @click="onNodeClick(s.id)"
          >
            {{ s.order === 1 ? '妻' : '妾' }} · {{ s.label }}
          </span>
        </div>
        <div v-if="selectedDetail.children.length" class="detail-row">
          <span class="row-label">子女：</span>
          <span
            v-for="c in selectedDetail.children"
            :key="c.id"
            class="pill"
            @click="onNodeClick(c.id)"
          >{{ c.label }}</span>
        </div>
        <div v-if="!selectedDetail.parents.length && !selectedDetail.spouses.length && !selectedDetail.children.length" class="detail-empty">
          暂无关联节点
        </div>
      </div>
    </div>

    <!-- 高亮工具栏 -->
    <div v-if="selectedNodeId" class="highlight-toolbar">
      <div class="selected-info">
        <span class="label">已选中：</span>
        <span class="value">
          {{ activeScenario.nodes.find(x => x.id === selectedNodeId)?.label }}
          （{{ activeScenario.nodes.find(x => x.id === selectedNodeId)?.gender === 'male' ? '男' : '女' }}）
        </span>
        <span class="related-count">相关边 {{ relatedEdgeIds.size }} 条</span>
      </div>
      <div class="mode-buttons">
        <span class="mode-label">高亮模式：</span>
        <button
          :class="['mode-btn', { active: highlightMode === 'spouse' }]"
          @click="setMode('spouse')"
        >配偶边</button>
        <button
          :class="['mode-btn', { active: highlightMode === 'all' }]"
          @click="setMode('all')"
        >所有相关边</button>
        <button class="mode-btn clear-btn" @click="selectedNodeId = null; highlightMode = null; resetMainTransform()">清除</button>
      </div>
    </div>

    <details class="legend">
      <summary>图例 / 验收要点</summary>
      <ul>
        <li><strong>一夫多妻走线</strong>：丈夫节点 → 婚姻汇聚点（夹在丈夫底与妻子顶之间） → 各妻子。</li>
        <li><strong>妻子调色板</strong>：每条配偶边按妻子 palette 上色，便于一眼区分妻支。</li>
        <li><strong>同世代卡片不重叠</strong>：同 Y 节点外接矩形间距 ≥ nodeSep。</li>
        <li><strong>牵引线不重叠</strong>：T 形分支水平段共享一条 Y，分岔到各子节点。</li>
        <li><strong>配偶子树避让</strong>：妻的继子女子树撑开 effectiveWidth，避免侵入其他分支。</li>
      </ul>
    </details>
  </div>
</template>

<style scoped lang="scss">
.demo-page {
  padding: 24px 32px;
  max-width: 1500px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.demo-header h1 {
  margin: 0 0 8px;
  font-size: 22px;
  color: #2c3e50;
}
.desc {
  margin: 0 0 16px;
  color: #666;
  font-size: 13px;
}
.scenario-tabs {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.tab {
  padding: 6px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.tab:hover { border-color: #C9A96E; color: #C9A96E; }
.tab.active {
  background: #C9A96E;
  color: #fff;
  border-color: #C9A96E;
}
.meta {
  margin-left: auto;
  font-size: 12px;
  color: #888;
}
.scenario-desc {
  margin: 4px 0 12px;
  font-size: 13px;
  color: #444;
}

/* [2026-08-27 §2.7 验收] 视图模式 + 缩放工具栏 */
.view-toolbar {
  display: flex;
  gap: 24px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: #FFF8E7;
  border: 1px solid #C9A96E;
  border-radius: 6px;
  margin-bottom: 12px;
}
.view-toolbar .tool-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.view-toolbar .tool-label {
  font-size: 12px;
  color: #5D4037;
  font-weight: 600;
  margin-right: 4px;
}
.view-toolbar .tool-btn {
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s;
}
.view-toolbar .tool-btn:hover { border-color: #C9A96E; color: #C9A96E; }
.view-toolbar .tool-btn.active {
  background: #C9A96E;
  color: #fff;
  border-color: #C9A96E;
  font-weight: 600;
}
.view-toolbar .zoom-btn {
  width: 28px;
  padding: 4px 0;
  text-align: center;
  font-weight: 600;
}
.view-toolbar .zoom-readout {
  display: inline-block;
  min-width: 56px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #5D4037;
  background: #fff;
  border: 1px solid #C9A96E;
  border-radius: 4px;
  padding: 3px 6px;
}
.view-toolbar .zoom-preset {
  font-variant-numeric: tabular-nums;
}
.canvas-wrapper {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fafafa;
  overflow: hidden;
  min-height: 480px;
}
.canvas {
  width: 100%;
  height: 600px;
  display: block;
}

// ---------- 高亮交互样式 ----------

.canvas .node {
  cursor: pointer;
  transition: opacity 0.2s ease;
}
.canvas .node:hover rect,
.canvas .node.hovered rect {
  filter: drop-shadow(0 0 4px rgba(201, 169, 110, 0.6));
  stroke-width: 2;
}
.canvas .tooltip text {
  pointer-events: none;
  user-select: none;
}
.canvas .node.highlighted rect {
  stroke: #E91E63;
  stroke-width: 3;
  filter: drop-shadow(0 0 6px rgba(233, 30, 99, 0.5));
}
.canvas .node.related rect {
  stroke: #C9A96E;
  stroke-width: 2;
}
.canvas .node.dimmed {
  opacity: 0.25;
}
.canvas .edge {
  transition: stroke-width 0.15s ease, opacity 0.15s ease;
}
.canvas .edge.highlighted {
  filter: drop-shadow(0 0 3px currentColor);
}
.canvas .edge.dimmed {
  pointer-events: none;
}

// ---------- 高亮工具栏 ----------

.highlight-toolbar {
  margin-top: 12px;
  padding: 10px 16px;
  background: #FFF8E7;
  border: 1px solid #C9A96E;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.selected-info {
  font-size: 13px;
  color: #5D4037;
}
.selected-info .label {
  font-weight: 600;
  margin-right: 4px;
}
.selected-info .value {
  color: #C9A96E;
  font-weight: 600;
  margin-right: 12px;
}
.selected-info .related-count {
  color: #888;
  font-size: 12px;
}
.mode-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mode-label {
  font-size: 12px;
  color: #666;
  margin-right: 4px;
}
.mode-btn {
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s;
}
.mode-btn:hover { border-color: #C9A96E; color: #C9A96E; }
.mode-btn.active {
  background: #C9A96E;
  color: #fff;
  border-color: #C9A96E;
}
.mode-btn.clear-btn {
  border-color: #E0E0E0;
  color: #888;
}
.mode-btn.clear-btn:hover {
  border-color: #999;
  color: #555;
}

// ---------- 选中节点详情面板 ----------

.detail-panel {
  margin-top: 12px;
  padding: 16px 20px;
  background: #fff;
  border: 1px solid #C9A96E;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(201, 169, 110, 0.15);
}
.detail-header {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0e6d3;
}
.detail-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.thumb-wrap {
  flex-shrink: 0;
  width: 320px;
  height: 200px;
  border: 1px solid #eee;
  border-radius: 4px;
  background: #fafafa;
  overflow: hidden;
  padding: 4px;
}
.thumb-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.thumb-node {
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.thumb-node.thumb-clickable:hover rect {
  stroke: #C9A96E;
  stroke-width: 1.5;
  filter: drop-shadow(0 0 3px rgba(201, 169, 110, 0.5));
}
.thumb-node.thumb-selected rect {
  stroke: #E91E63;
  stroke-width: 2;
  filter: drop-shadow(0 0 4px rgba(233, 30, 99, 0.4));
}
.detail-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #C9A96E, #A8884E);
  color: #fff;
  font-size: 22px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.detail-title h3 {
  margin: 0 0 6px;
  font-size: 18px;
  color: #2c3e50;
}
.detail-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
}
.gen-badge {
  display: inline-block;
  padding: 1px 8px;
  background: #f5e8d0;
  color: #8b6f3e;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}
.detail-body {
  padding-top: 12px;
}
.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  flex-wrap: wrap;
}
.row-label {
  color: #888;
  flex-shrink: 0;
  min-width: 50px;
  padding-top: 4px;
}
.pill {
  display: inline-block;
  padding: 3px 10px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 14px;
  font-size: 12px;
  color: #333;
  cursor: pointer;
  transition: all 0.15s;
}
.pill:hover {
  background: #FFF8E7;
  border-color: #C9A96E;
  color: #C9A96E;
}
.spouse-pill {
  background: #fff;
  border-width: 2px;
  font-weight: 500;
}
.detail-empty {
  color: #999;
  font-size: 12px;
  font-style: italic;
  padding: 8px 0;
}
.legend {
  margin-top: 16px;
  font-size: 13px;
  color: #555;
}
.legend summary {
  cursor: pointer;
  font-weight: 600;
  padding: 4px 0;
}
.legend ul {
  margin: 8px 0;
  padding-left: 20px;
}
.legend li { margin: 4px 0; }
</style>