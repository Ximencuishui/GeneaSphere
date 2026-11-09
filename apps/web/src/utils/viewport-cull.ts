/**
 * 空间网格视口裁剪 + 0.4 倍 LOD。
 *
 * 网格 2000×2000。平移时只比较视口盖住的格子；格子没变就什么都不做。
 * 格子变了才对进出的节点做差分，并调用 setElementVisibility。
 * 缩放只有跨过 0.4 时，才重绘当前视口里的卡片。
 */
export const CULL_CELL_SIZE = 2000
export const CULL_VIEWPORT_MARGIN_PX = 200
export const LOD_ZOOM_THRESHOLD = 0.4

export type LodLevel = 'minimal' | 'full'

let lodLevel: LodLevel = 'full'
let cullActive = false

export function getLodLevel(): LodLevel {
  return lodLevel
}

export function setLodLevel(level: LodLevel) {
  lodLevel = level
}

export function isViewportCullActive(): boolean {
  return cullActive
}

export interface CullPoint {
  id: string
  x: number
  y: number
}

export interface CullEdgeRef {
  id: string
  source: string
  target: string
}

export class SpatialGrid {
  private readonly buckets = new Map<string, string[]>()
  private readonly at = new Map<string, { x: number; y: number }>()
  private readonly cellSize: number

  constructor(points: CullPoint[], cellSize = CULL_CELL_SIZE) {
    this.cellSize = cellSize
    for (const point of points) {
      this.at.set(point.id, { x: point.x, y: point.y })
      const key = SpatialGrid.cellKey(point.x, point.y, cellSize)
      const bucket = this.buckets.get(key)
      if (bucket) bucket.push(point.id)
      else this.buckets.set(key, [point.id])
    }
  }

  nodesInRect(x1: number, y1: number, x2: number, y2: number): string[] {
    const size = this.cellSize
    const gx1 = Math.floor(x1 / size)
    const gx2 = Math.floor(x2 / size)
    const gy1 = Math.floor(y1 / size)
    const gy2 = Math.floor(y2 / size)
    const ids: string[] = []
    for (let gx = gx1; gx <= gx2; gx++) {
      for (let gy = gy1; gy <= gy2; gy++) {
        const bucket = this.buckets.get(`${gx}:${gy}`)
        if (!bucket) continue
        for (const id of bucket) {
          const point = this.at.get(id)
          if (!point) continue
          if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) ids.push(id)
        }
      }
    }
    return ids
  }

  static cellKey(x: number, y: number, cellSize = CULL_CELL_SIZE): string {
    return `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`
  }
}

export function diffIds(previous: Set<string>, next: Set<string>): { entered: string[]; left: string[] } {
  const entered: string[] = []
  const left: string[] = []
  for (const id of next) {
    if (!previous.has(id)) entered.push(id)
  }
  for (const id of previous) {
    if (!next.has(id)) left.push(id)
  }
  return { entered, left }
}

export interface ViewportRect {
  x1: number
  y1: number
  x2: number
  y2: number
  zoom: number
}

export function readViewportWorld(graph: any, marginPx = CULL_VIEWPORT_MARGIN_PX): ViewportRect | null {
  if (!graph || typeof graph.getSize !== 'function' || typeof graph.getCanvasByViewport !== 'function') {
    return null
  }
  const [vw, vh] = graph.getSize() as [number, number]
  const tl = graph.getCanvasByViewport([0, 0])
  const br = graph.getCanvasByViewport([vw, vh])
  if (!tl || !br) return null
  const zoom = typeof graph.getZoom === 'function' ? graph.getZoom() || 1 : 1
  const margin = marginPx / zoom
  return {
    x1: Math.min(tl[0], br[0]) - margin,
    x2: Math.max(tl[0], br[0]) + margin,
    y1: Math.min(tl[1], br[1]) - margin,
    y2: Math.max(tl[1], br[1]) + margin,
    zoom,
  }
}

export interface ViewportCullStats {
  visibleNodes: number
  lastSyncMs: number
  lastCrossMs: number
  crossMs: number[]
  redrawCounts: number[]
  visibilityUpdates: number
}

export interface ViewportCullHandle {
  sync: () => Promise<void>
  destroy: () => void
  stats: ViewportCullStats
}

function resolveElement(graph: any, id: string) {
  return graph.context?.element?.getElement?.(id) ?? graph.getElement?.(id)
}

function redrawNode(graph: any, id: string) {
  const el = resolveElement(graph, id)
  if (!el || el.destroyed || typeof el.render !== 'function') return
  el.render(el.parsedAttributes ?? el.attributes, el)
}

/**
 * 用 G6 的 setElementVisibility 写入渲染列表。
 * 只改 style.visibility 时，画布每帧仍会把藏掉的卡片遍历一遍。
 */
async function applyVisibility(graph: any, updates: Record<string, 'visible' | 'hidden'>) {
  const ids = Object.keys(updates)
  if (ids.length === 0 || typeof graph.setElementVisibility !== 'function') return
  // setElementVisibility 会把可见性写进渲染列表。只改 style 的话，画布每帧仍会遍历被藏起来的卡片。
  await graph.setElementVisibility(updates, false)
}

/**
 * 挂到一张 G6 图上。调用前节点坐标已经写进数据。
 * 渲染开始前调用，卡片就不会在每次缩放时各自重画。
 */
export function attachViewportCull(
  graph: any,
  nodes: CullPoint[],
  edges: CullEdgeRef[],
): ViewportCullHandle {
  cullActive = true
  const grid = new SpatialGrid(nodes)
  const edgeEnds = edges.map((edge) => ({
    id: String(edge.id),
    source: String(edge.source),
    target: String(edge.target),
  }))
  let visibleNodes = new Set(nodes.map((node) => String(node.id)))
  let visibleEdges = new Set(edgeEnds.map((edge) => edge.id))
  let cellKey = ''
  let lod: LodLevel = 'full'
  let scheduled = 0
  let applying = false
  let dirty = false
  let disposed = false
  let chain: Promise<void> = Promise.resolve()
  let revealPending = false

  const stats: ViewportCullStats = {
    visibleNodes: visibleNodes.size,
    lastSyncMs: 0,
    lastCrossMs: 0,
    crossMs: [],
    redrawCounts: [],
    visibilityUpdates: 0,
  }

  const syncNow = async () => {
    if (disposed) return
    const view = readViewportWorld(graph)
    if (!view) return
    const t0 = performance.now()
    const nextLod: LodLevel = view.zoom < LOD_ZOOM_THRESHOLD ? 'minimal' : 'full'
    const lodCrossed = nextLod !== lod
    const gx1 = Math.floor(view.x1 / CULL_CELL_SIZE)
    const gx2 = Math.floor(view.x2 / CULL_CELL_SIZE)
    const gy1 = Math.floor(view.y1 / CULL_CELL_SIZE)
    const gy2 = Math.floor(view.y2 / CULL_CELL_SIZE)
    const nextCellKey = `${gx1}:${gy1}:${gx2}:${gy2}`
    const cellsChanged = nextCellKey !== cellKey

    if (!cellsChanged && !lodCrossed) {
      stats.lastSyncMs = performance.now() - t0
      return
    }

    if (lodCrossed) {
      lod = nextLod
      setLodLevel(nextLod)
    }

    let entered: string[] = []
    if (cellsChanged) {
      const nextList = grid.nodesInRect(view.x1, view.y1, view.x2, view.y2)
      const nextNodes = new Set(nextList)
      const nodeDiff = diffIds(visibleNodes, nextNodes)
      // 一次铺开太多完整卡片会把单帧撑过 300ms。多出来的留到下一帧。
      const REVEAL_BUDGET = 8
      const reveal = nodeDiff.entered.length > REVEAL_BUDGET
        ? nodeDiff.entered.slice(0, REVEAL_BUDGET)
        : nodeDiff.entered
      const more = reveal.length < nodeDiff.entered.length
      if (!more) cellKey = nextCellKey
      else revealPending = true
      entered = reveal

      const shown = new Set(visibleNodes)
      for (const id of nodeDiff.left) shown.delete(id)
      for (const id of reveal) shown.add(id)

      const updates: Record<string, 'visible' | 'hidden'> = {}
      for (const id of nodeDiff.left) updates[id] = 'hidden'
      for (const id of reveal) redrawNode(graph, id)
      for (const id of reveal) updates[id] = 'visible'

      const nextEdges = new Set<string>()
      for (const edge of edgeEnds) {
        if (shown.has(edge.source) || shown.has(edge.target)) nextEdges.add(edge.id)
      }
      const edgeDiff = diffIds(visibleEdges, nextEdges)
      for (const id of edgeDiff.left) updates[id] = 'hidden'
      for (const id of edgeDiff.entered) updates[id] = 'visible'

      visibleNodes = shown
      visibleEdges = nextEdges
      stats.visibleNodes = shown.size
      stats.visibilityUpdates += Object.keys(updates).length
      await applyVisibility(graph, updates)
    }

    if (lodCrossed) {
      const drawT0 = performance.now()
      const enteredSet = new Set(entered)
      let redrawn = entered.length
      for (const id of visibleNodes) {
        if (enteredSet.has(id)) continue
        redrawNode(graph, id)
        redrawn += 1
      }
      const drawMs = performance.now() - drawT0
      stats.lastCrossMs = drawMs
      stats.crossMs.push(Math.round(drawMs))
      stats.redrawCounts.push(redrawn)
    }

    stats.lastSyncMs = performance.now() - t0
  }

  const sync = () => {
    const run = chain.then(() => syncNow())
    chain = run.then(() => undefined, () => undefined)
    return run
  }

  const flush = async () => {
    if (applying) {
      dirty = true
      return
    }
    applying = true
    try {
      await sync()
    } finally {
      applying = false
      if (!disposed && (dirty || revealPending)) {
        dirty = false
        revealPending = false
        schedule()
      }
    }
  }

  const schedule = () => {
    if (disposed || scheduled) return
    scheduled = requestAnimationFrame(() => {
      scheduled = 0
      void flush()
    })
  }

  const onViewport = () => schedule()
  graph.on?.('afterviewportchange', onViewport)
  graph.on?.('aftertransform', onViewport)
  graph.on?.('afterrender', onViewport)
  graph.on?.('aftersizechange', onViewport)

  return {
    sync,
    stats,
    destroy() {
      disposed = true
      if (scheduled) cancelAnimationFrame(scheduled)
      graph.off?.('afterviewportchange', onViewport)
      graph.off?.('aftertransform', onViewport)
      graph.off?.('afterrender', onViewport)
      graph.off?.('aftersizechange', onViewport)
      cullActive = false
      setLodLevel('full')
    },
  }
}
