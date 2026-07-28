// 测试带配偶节点的 compactBox 输出
import { compactBox } from '@antv/hierarchy';

function buildZhuXiWithSpouses() {
  let nextId = 1;
  // 男性树结构
  const widths = [1, 3, 4, 4, 4, 6, 10, 14, 18, 22, 26, 30, 32, 34, 36, 38, 38, 36, 34, 32, 28, 24, 20, 16, 12, 8, 6, 4, 2];
  // 给每个男性节点加一个配偶（标记为 generation=-1）
  // 但 compactBox 只接受单一层级树，不处理外部节点
  // 所以我们把配偶当作叶子节点的兄弟？不行，因为这样会改变树的深度
  // 实际 layout-engine.ts 把配偶排除在 compactBox 之外，只用主脉树
  // 所以 compactBox 实际只处理 542 主脉节点
  // 配偶在 positionSpouseNodes 阶段单独处理

  // 测试：只用主脉树（542 节点），看 X 跨度
  function build(level) {
    if (level >= widths.length) return null;
    const id = String(nextId++);
    const w = widths[level];
    if (level === widths.length - 1) {
      return { id, width: 34, height: 80, hgap: 12, vgap: 100 };
    }
    const children = [];
    for (let i = 0; i < w; i++) {
      const c = i === w - 1 ? build(level + 1) : { id: String(nextId++), width: 34, height: 80, hgap: 12, vgap: 100 };
      children.push(c);
    }
    return { id, width: 34, height: 80, hgap: 12, vgap: 100, children };
  }
  return { root: build(0), totalNodes: nextId - 1 };
}

const { root, totalNodes } = buildZhuXiWithSpouses();
console.log('主脉节点数:', totalNodes);

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

// 顶部节点
const top = positions.filter(p => p.y <= minY + 5).slice(0, 3);
console.log('顶部节点:');
top.forEach(p => console.log(`  ${p.id}: (${Math.round(p.x)}, ${Math.round(p.y)})`));

// 中间节点
const mid = positions.filter(p => Math.abs(p.y - (minY + maxY) / 2) < 200).slice(0, 5);
console.log('中部节点:');
mid.forEach(p => console.log(`  ${p.id}: (${Math.round(p.x)}, ${Math.round(p.y)})`));