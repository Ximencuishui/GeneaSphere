// 独立测试 compactBox 在 1000 节点树形上的输出
import { compactBox } from '@antv/hierarchy';

function buildBalancedTree(depths, breadthAtEachLevel) {
  // depths: 树的深度（如 8 表示 8 层）
  // breadthAtEachLevel: 数组，每个 depth 的孩子数（除最后层）
  // 例如：buildBalancedTree(7, [3, 3, 3, 3, 3, 3]) = 根节点 + 6 层每层 3 子 → 1+3+9+27+81+243+729 = 1093 节点
  let nextId = 1;
  function build(level) {
    if (level >= depths) return null;
    const id = String(nextId++);
    const children = [];
    const w = breadthAtEachLevel[level] ?? 1;
    for (let i = 0; i < w; i++) {
      const c = build(level + 1);
      if (c) children.push(c);
    }
    return {
      id,
      width: 34,
      height: 80,
      hgap: 12,
      vgap: 100,
      children: children.length > 0 ? children : undefined,
    };
  }
  return { root: build(0), totalNodes: nextId - 1 };
}

console.log('===== 测试1：3叉树 7层（1093 节点） =====');
const t1 = buildBalancedTree(7, [3, 3, 3, 3, 3, 3]);
console.log('节点数:', t1.totalNodes);

const nodeW = 34;
const nodeH = 80;
const nodeSep = 12;
const rankSep = 100;

const t1start = Date.now();
const root1 = compactBox(t1.root, {
  direction: 'TB',
  getWidth: () => nodeW,
  getHeight: () => nodeH,
  getHGap: () => nodeSep,
  getVGap: () => rankSep,
});
console.log('布局耗时:', Date.now() - t1start, 'ms');

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
const positions = [];
root1.eachNode((n) => {
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
  console.log(`  第${gen}代: 节点${info.count}个, 宽度${Math.round(info.maxX - info.minX)}px (avg 间距 ${Math.round((info.maxX - info.minX) / info.count)}px)`);
});

console.log('\n===== 测试2：朱熹 demo 模拟（更不规则） =====');
// 朱熹: 1 子
// 朱塾、朱埜、朱在：分别 5、2、3 子
// 总体不规则但总数 1000 左右
const t2result = buildBalancedTree(8, [3, 5, 4, 4, 3, 3, 2]); // 1+3+15+60+240+720+2160+4320 = 7519 (太多)
// 缩到 1000 左右
const t3result = buildBalancedTree(7, [3, 3, 3, 3, 2, 1]); // 1+3+9+27+81+162+162 = 445
console.log('节点数:', t3result.totalNodes);
const root3 = compactBox(t3result.root, {
  direction: 'TB',
  getWidth: () => nodeW,
  getHeight: () => nodeH,
  getHGap: () => nodeSep,
  getVGap: () => rankSep,
});
let minX3 = Infinity, maxX3 = -Infinity, minY3 = Infinity, maxY3 = -Infinity;
const p3 = [];
root3.eachNode((n) => {
  const cx = n.x + n.width / 2;
  const cy = n.y + n.height / 2;
  p3.push({ id: n.id, x: cx, y: cy, depth: n.depth });
  if (cx < minX3) minX3 = cx;
  if (cx > maxX3) maxX3 = cx;
  if (cy < minY3) minY3 = cy;
  if (cy > maxY3) maxY3 = cy;
});
console.log('spanX:', Math.round(maxX3 - minX3));
console.log('spanY:', Math.round(maxY3 - minY3));
console.log('ratio X/Y:', ((maxX3 - minX3) / Math.max(1, maxY3 - minY3)).toFixed(2));

const byGen3 = new Map();
p3.forEach(p => {
  if (!byGen3.has(p.depth)) byGen3.set(p.depth, { count: 0, minX: Infinity, maxX: -Infinity });
  const g = byGen3.get(p.depth);
  g.count++;
  if (p.x < g.minX) g.minX = p.x;
  if (p.x > g.maxX) g.maxX = p.x;
});
console.log('\n各代际宽度:');
[...byGen3.entries()].sort((a,b) => a[0] - b[0]).forEach(([gen, info]) => {
  console.log(`  第${gen}代: 节点${info.count}个, 宽度${Math.round(info.maxX - info.minX)}px`);
});