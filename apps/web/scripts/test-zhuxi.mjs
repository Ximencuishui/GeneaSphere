// 用真实朱熹 demo 结构测试 compactBox
// 模型：每代所有节点都挂在上一代最右节点（主脉延伸模式）
import { compactBox } from '@antv/hierarchy';

function buildZhuXiDemo() {
  let nextId = 1;
  // 朱熹 demo 大致每代兄弟数：
  // 1, 3, 4, 4, 4, 6, 10, 14, 18, 22, 26, 30, 32, 34, 36, 38, 38, 36, 34, 32, 28, 24, 20, 16, 12, 8, 6, 4, 2
  // 总节点数 = sum = 1+3+4+4+4+6+...+2 = 524
  const widths = [1, 3, 4, 4, 4, 6, 10, 14, 18, 22, 26, 30, 32, 34, 36, 38, 38, 36, 34, 32, 28, 24, 20, 16, 12, 8, 6, 4, 2];
  // 简化：所有第 L 节点都是第 L-1 层最后一个节点的子
  // 即：除最右节点外，每个节点都是叶子
  function build(level) {
    if (level >= widths.length) return null;
    const id = String(nextId++);
    const isLast = level === widths.length - 1;
    if (isLast) {
      // 叶子
      return { id, width: 34, height: 80, hgap: 12, vgap: 100 };
    }
    // 不是叶子：创建 widths[level+1] 个孩子
    const w = widths[level + 1];
    const children = [];
    for (let i = 0; i < w; i++) {
      // 只有最后一个孩子继续往下延伸
      const c = i === w - 1 ? build(level + 1) : { id: String(nextId++), width: 34, height: 80, hgap: 12, vgap: 100 };
      children.push(c);
    }
    return { id, width: 34, height: 80, hgap: 12, vgap: 100, children };
  }
  return { root: build(0), totalNodes: nextId - 1, widths };
}

const { root, totalNodes, widths } = buildZhuXiDemo();
console.log('节点数:', totalNodes);
console.log('每代宽度:', widths.join(' '));

const nodeW = 34, nodeH = 80, nodeSep = 12, rankSep = 100;

const start = Date.now();
const hierarchyRoot = compactBox(root, {
  direction: 'TB',
  getWidth: () => nodeW,
  getHeight: () => nodeH,
  getHGap: () => nodeSep,
  getVGap: () => rankSep,
});
console.log('布局耗时:', Date.now() - start, 'ms');

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
const positions = [];
hierarchyRoot.eachNode((n) => {
  const cx = n.x + n.width / 2;
  const cy = n.y + n.height / 2;
  positions.push({ id: n.id, x: cx, y: cy, depth: n.depth });
  if (cx < minX) minX = cx;
  if (cx > maxX) maxX = cx;
  if (cy < minY) minY = cy;
  if (cy > maxY) maxY = cy;
});

console.log('spanX:', Math.round(maxX - minX));
console.log('spanY:', Math.round(maxY - minY));
console.log('ratio X/Y:', ((maxX - minX) / Math.max(1, maxY - minY)).toFixed(2));

const byGen = new Map();
positions.forEach(p => {
  if (!byGen.has(p.depth)) byGen.set(p.depth, { count: 0, minX: Infinity, maxX: -Infinity });
  const g = byGen.get(p.depth);
  g.count++;
  if (p.x < g.minX) g.minX = p.x;
  if (p.x > g.maxX) g.maxX = p.x;
});
console.log('\n各代际宽度:');
[...byGen.entries()].sort((a,b) => a[0] - b[0]).forEach(([gen, info]) => {
  console.log(`  第${gen}代: ${info.count}节点 宽度${Math.round(info.maxX - info.minX)}px`);
});