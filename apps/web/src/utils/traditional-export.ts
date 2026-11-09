/**
 * 古谱整图导出。世代表头是画布外面的 HTML，G6 的 toDataURL 带不走它，
 * 所以按节点坐标和横担路径重绘整张图：不看当前缩放，也不看视口。
 */
import {
  CLASSIC_FONT_FAMILY,
  CLASSIC_PAPER,
  classicGenerationLines,
  classicRankLabel,
  classicSpouseCaption,
  layoutClassicGlyphs,
} from '@/utils/traditional-column';

const RAIL = 88;
const MARGIN = 32;
const MAX_SIDE = 8192;

export function classicExportScale(contentWidth: number, contentHeight: number): number {
  const cssW = RAIL + MARGIN * 2 + Math.max(1, contentWidth);
  const cssH = MARGIN * 2 + Math.max(1, contentHeight);
  const fit = Math.min(2, MAX_SIDE / cssW, MAX_SIDE / cssH);
  return Math.max(0.2, Math.round(fit * 100) / 100);
}

interface ExportBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface ExportNode {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  rank: string;
  spouse: string;
  generation: number;
  word: string;
}

function readSize(style: any): [number, number] {
  const size = style?.size;
  if (Array.isArray(size) && size.length >= 2) return [Number(size[0]) || 22, Number(size[1]) || 120];
  if (size && typeof size === 'object') return [Number(size.width) || 22, Number(size.height) || 120];
  return [22, 120];
}

function collect(graph: any): { bounds: ExportBounds; nodes: ExportNode[]; edges: { x: number; y: number }[][] } {
  const nodes: ExportNode[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const node of graph.getNodeData?.() || []) {
    const pos = graph.getElementPosition?.(String(node.id));
    if (!pos || typeof pos[0] !== 'number' || typeof pos[1] !== 'number') continue;
    const [width, height] = readSize(node.style);
    const data = node.data || {};
    const generation = typeof data.generation === 'number' ? data.generation : -1;
    nodes.push({
      x: pos[0],
      y: pos[1],
      width,
      height,
      name: String(node.label || data.full_name || data.original?.full_name || '').trim(),
      rank: classicRankLabel(data.birth_order) || String(data.generation_word || '').trim(),
      spouse: classicSpouseCaption(data.original?.spouses || data.spouses),
      generation,
      word: String(data.generation_word || '').trim(),
    });
    grow(pos[0] - width / 2, pos[1] - height / 2);
    grow(pos[0] + width / 2, pos[1] + height / 2);
  }

  const edges: { x: number; y: number }[][] = [];
  for (const edge of graph.getEdgeData?.() || []) {
    const points = edge?.style?.orthPath?.points;
    if (!Array.isArray(points) || points.length < 2) continue;
    const path = points
      .filter((point: any) => typeof point?.x === 'number' && typeof point?.y === 'number')
      .map((point: any) => ({ x: point.x, y: point.y }));
    if (path.length < 2) continue;
    edges.push(path);
    for (const point of path) grow(point.x, point.y);
  }

  if (!Number.isFinite(minX) || nodes.length === 0) {
    throw new Error('图里还没有可导出的人物');
  }
  return {
    bounds: { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) },
    nodes,
    edges,
  };
}

export async function downloadTraditionalChart(graph: any): Promise<void> {
  const { bounds, nodes, edges } = collect(graph);
  const scale = classicExportScale(bounds.width, bounds.height);
  const width = Math.ceil((RAIL + MARGIN * 2 + bounds.width) * scale);
  const height = Math.ceil((MARGIN * 2 + bounds.height) * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器没有提供画布，无法导出');

  const mapX = (x: number) => (RAIL + MARGIN + (x - bounds.minX)) * scale;
  const mapY = (y: number) => (MARGIN + (y - bounds.minY)) * scale;

  ctx.fillStyle = CLASSIC_PAPER;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#E4DCCB';
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(RAIL * scale, MARGIN * scale);
  ctx.lineTo(RAIL * scale, height - MARGIN * scale);
  ctx.stroke();

  ctx.strokeStyle = '#2A241C';
  ctx.lineWidth = Math.max(1, scale);
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  for (const path of edges) {
    ctx.beginPath();
    ctx.moveTo(mapX(path[0].x), mapY(path[0].y));
    for (let i = 1; i < path.length; i++) ctx.lineTo(mapX(path[i].x), mapY(path[i].y));
    ctx.stroke();
  }

  const ink = { rank: '#6B6258', name: '#1A1612', spouse: '#6B6258' };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const node of nodes) {
    const glyphs = layoutClassicGlyphs({
      name: node.name,
      rank: node.rank,
      spouse: node.spouse,
      width: node.width,
      height: node.height,
    });
    for (const glyph of glyphs) {
      ctx.fillStyle = ink[glyph.role];
      ctx.font = `${glyph.weight} ${glyph.fontSize * scale}px ${CLASSIC_FONT_FAMILY}`;
      ctx.fillText(glyph.text, mapX(node.x + glyph.x), mapY(node.y + glyph.y));
    }
  }

  const buckets = new Map<number, { y: number; words: Map<string, number> }>();
  for (const node of nodes) {
    if (node.generation < 0) continue;
    let bucket = buckets.get(node.generation);
    if (!bucket) {
      bucket = { y: node.y, words: new Map() };
      buckets.set(node.generation, bucket);
    }
    if (node.word) bucket.words.set(node.word, (bucket.words.get(node.word) || 0) + 1);
  }
  ctx.fillStyle = '#3A3228';
  const labelSize = 14 * scale;
  ctx.font = `400 ${labelSize}px ${CLASSIC_FONT_FAMILY}`;
  for (const [generation, bucket] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    let word = '';
    let best = 0;
    for (const [text, count] of bucket.words) {
      if (count > best) {
        word = text;
        best = count;
      }
    }
    const lines = classicGenerationLines(generation, word);
    const lineH = labelSize * 1.25;
    const block = lines.length * lineH;
    const y = mapY(bucket.y);
    lines.forEach((line, index) => {
      ctx.fillText(line, (RAIL * scale) / 2, y - block / 2 + lineH * index + lineH / 2);
    });
  }

  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = url;
  link.download = `古谱-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
