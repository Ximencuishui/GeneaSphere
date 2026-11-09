<script setup lang="ts">
/**
 * 浏览器渲染压测：/demo/render-stress
 *
 * 1000 张真实族谱卡片挂上 G6，验收空间网格裁剪和 0.4 倍 LOD。
 * 结果写在 window.__blindSpot。
 */
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { loadG6Runtime } from '@/composables/useG6Runtime'
import { LayoutEngine } from '@/utils/layout-engine'
import { applyOrthogonalPathsToGraphData } from '@/utils/pending-spouse'
import { buildLargeTree } from '@/utils/__fixtures__/large-tree'
import { attachViewportCull, type ViewportCullHandle } from '@/utils/viewport-cull'
import { VIEW_MODE_SETTINGS } from '@/utils/view-mode-config'
import type { ViewMode } from '@/stores/genealogy'
import type { LayoutConfig } from '@/types/layout'

const host = ref<HTMLElement | null>(null)
const status = ref('准备数据…')
const graphRef = shallowRef<any>(null)
let cullHandle: ViewportCullHandle | null = null

onUnmounted(() => {
  cullHandle?.destroy()
  cullHandle = null
})

const genealogyStore = {
  viewMode: 'detailed' as ViewMode,
  cardDensity: 'detailed' as const,
  selectedNode: null as { id: number | string } | null,
}
const viewModeConfig = computed(() => VIEW_MODE_SETTINGS as Record<ViewMode, any>)

function avatarUrl(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 48
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#E7D3B0'
  ctx.fillRect(0, 0, 48, 48)
  ctx.fillStyle = '#3D5870'
  ctx.beginPath()
  ctx.arc(24, 18, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6E5830'
  ctx.fillRect(10, 30, 28, 16)
  return canvas.toDataURL('image/png')
}

function measureFrames(ms: number, step: (elapsed: number) => void) {
  return new Promise<{ fps: number; frames: number; maxFrameMs: number; p95FrameMs: number }>((resolve) => {
    const gaps: number[] = []
    let frames = 0
    let last = performance.now()
    const start = last
    const loop = (now: number) => {
      gaps.push(now - last)
      last = now
      frames += 1
      step(now - start)
      if (now - start < ms) requestAnimationFrame(loop)
      else {
        const elapsed = now - start
        const sorted = gaps.slice().sort((a, b) => a - b)
        resolve({
          fps: Math.round((frames * 1000) / elapsed),
          frames,
          maxFrameMs: Math.round(sorted[sorted.length - 1] ?? 0),
          p95FrameMs: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0),
        })
      }
    }
    requestAnimationFrame(loop)
  })
}

onMounted(async () => {
  const report: Record<string, unknown> = { startedAt: Date.now() }
  ;(window as any).__blindSpot = report
  try {
    const photo = avatarUrl()
    await new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('avatar decode failed'))
      img.src = photo
    })

    status.value = '平衡树布局，准备 1000 张卡片…'
    const built = buildLargeTree(1000)
    const width = 132
    const height = 120
    const layoutNodes = built.nodes.map((node, index) => ({
      ...node,
      width,
      height,
      label: `朱${['熹', '塾', '埜', '在', '鉴', '浚', '林', '彬'][index % 8]}${index}`,
    }))
    const engine = new LayoutEngine({
      canvasSize: { width: 1440, height: 900 },
      config: {
        nodeWidth: width,
        nodeHeight: height,
        nodeSep: 28,
        rankSep: 70,
        layoutDirection: 'TB',
        spouseGap: 48,
        mainLineageCenter: true,
        spouseOptimization: true,
        generationAlign: true,
        resolveSubtreeOverlap: true,
        engine: 'dagre',
        engineThreshold: 1000,
      } satisfies Partial<LayoutConfig>,
    })
    const layoutT0 = performance.now()
    const layoutResult = await engine.calculateLayout(layoutNodes, built.edges)
    report.balancedLayoutMs = Math.round(performance.now() - layoutT0)

    const pos = new Map(layoutResult.nodes.map((node) => [node.id, node]))
    const graphData = {
      nodes: layoutNodes.map((node) => {
        const p = pos.get(node.id)!
        return {
          id: node.id,
          type: 'rect',
          label: node.label,
          data: {
            gender: 'male',
            name: node.label,
            is_main_lineage: node.isMainLineage,
            is_living: false,
            birth_year: 1200 + node.generation * 28,
            death_year: 1268 + node.generation * 28,
            photo_url: photo,
            thumbnail_url: photo,
            generation_word: '熹',
            birth_order: 2,
          },
          style: { x: p.x, y: p.y, size: [p.width, p.height], zIndex: 10 },
        }
      }),
      edges: built.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'orth',
        data: { kind: 'parent-child' },
        style: { stroke: '#8C7344', lineWidth: 1.5, zIndex: 0 },
      })),
    }
    applyOrthogonalPathsToGraphData(graphData, layoutResult)

    status.value = '挂载 G6…'
    const { Graph } = await loadG6Runtime({ genealogyStore, viewModeConfig })
    const el = host.value!
    const graph = new Graph({
      container: el,
      width: el.clientWidth || 1440,
      height: el.clientHeight || 900,
      animation: false,
      autoResize: false,
      layout: undefined,
      behaviors: ['drag-canvas', 'zoom-canvas'],
      node: { type: 'rect', style: { size: [width, height], radius: 8, zIndex: 10 } },
      edge: { type: 'orth', style: { stroke: '#8C7344', lineWidth: 1.5, zIndex: 0 } },
    })
    graphRef.value = graph
    ;(window as any).__g6 = graph
    cullHandle = attachViewportCull(
      graph,
      layoutNodes.map((node) => {
        const p = pos.get(node.id)!
        return { id: node.id, x: p.x, y: p.y }
      }),
      built.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    )

    const setDataT0 = performance.now()
    graph.setData(graphData as any)
    const setDataMs = performance.now() - setDataT0
    const rendered = new Promise<void>((resolve) => graph.once('afterrender', () => resolve()))
    const renderT0 = performance.now()
    await graph.render()
    await rendered
    const renderMs = performance.now() - renderT0
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    report.render = {
      setDataMs: Math.round(setDataMs),
      renderMs: Math.round(renderMs),
      nodes: graphData.nodes.length,
      edges: graphData.edges.length,
      photos: graphData.nodes.length,
    }

    const root = pos.get('root')!
    await graph.zoomTo(1, false)
    const [vw, vh] = graph.getSize()
    const center = graph.getCanvasByViewport([vw / 2, vh / 2])
    await graph.translateBy([center[0] - root.x, center[1] - root.y], false)

    status.value = '网格裁剪视口外节点…'
    const cullT0 = performance.now()
    const cull = cullHandle!
    await cull.sync()
    report.cull = {
      initMs: Math.round(performance.now() - cullT0),
      visibleNodes: cull.stats.visibleNodes,
    }

    status.value = '拖拽帧率…'
    let dragDir = 1
    report.drag = await measureFrames(2000, () => {
      dragDir *= -1
      graph.translateBy([dragDir * 36, dragDir * 18], false)
    })

    status.value = '缩放帧率（跨越 0.4）…'
    report.zoom = await measureFrames(2400, (elapsed) => {
      const z = 0.2 + (Math.sin(elapsed / 280) + 1) * 0.45
      graph.zoomTo(z, false)
    })
    report.lodCrossMs = cull.stats.crossMs.slice()
    report.redrawCounts = cull.stats.redrawCounts.slice()
    report.visibleNodes = cull.stats.visibleNodes

    const dragFps = (report.drag as { fps: number }).fps
    const zoomMax = (report.zoom as { maxFrameMs: number }).maxFrameMs
    const crossMax = (report.lodCrossMs as number[]).reduce((max, ms) => Math.max(max, ms), 0)
    report.pass = dragFps >= 30 && zoomMax < 300 && (report.lodCrossMs as number[]).length > 0 && crossMax < 300
    report.done = true
    status.value = JSON.stringify(report, null, 2)
  } catch (error) {
    report.error = error instanceof Error ? error.stack || error.message : String(error)
    report.done = true
    ;(window as any).__blindSpot = report
    status.value = String(report.error)
  }
})
</script>

<template>
  <div class="stress-page">
    <div ref="host" class="stress-host"></div>
    <pre class="stress-panel">{{ status }}</pre>
  </div>
</template>

<style scoped>
.stress-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #f7f5f2;
}
.stress-host {
  width: 100%;
  height: 100%;
}
.stress-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
  max-width: min(560px, 46vw);
  max-height: 70vh;
  overflow: auto;
  margin: 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(255, 252, 247, 0.94);
  color: #2a241c;
  font-size: 12px;
  line-height: 1.45;
  box-shadow: 0 8px 24px rgba(42, 36, 28, 0.12);
}
</style>
