// 模拟真实朱熹 demo 数据结构（在浏览器中实际跑 layout-engine v4）
// 验证新 rankSep=70（nodeHeight*2.5）下的 X/Y ratio
import { compactBox } from '@antv/hierarchy';

// 真实 demo 数据每代兄弟数（从 API 实际抓取）
// depth 0: 1, depth 1: 3, depth 2: 4, depth 3: 4, depth 4: 4, depth 5: 10,
// depth 6: 38, depth 7: 14, depth 8: 33, depth 9: 131, depth 10: 175, depth 11: 83
const realPerGenCount = [1, 3, 4, 4, 4, 10, 38, 14, 33, 131, 175, 83];

function buildRealisticDemo() {
  let nextId = 1;
  // 构造每代节点，但每代"最右节点"才有孩子（主脉延伸模式，模拟 demo 的实际结构）
  function build(level) {
    if (level >= realPerGenCount.length) return null;
    const id = String(nextId++);
    const siblingCount = realPerGenCount[level];
    if (siblingCount === 1) {
      // 唯一节点：单根继续往下
      const child = build(level + 1);
      return {
        id,
        width: 64,
        height: 28,
        hgap: 10,   // nodeSep='auto' → avg=39 → max(10, 64*0.13) = max(10, 8.32) = 10
        vgap: 70,   // 新 rankSep: max(28+40, 28*2.5) = max(68, 70) = 70
        children: child ? [child] : undefined,
      };
    }
    // 多兄弟：本代有 siblingCount 个孩子，但只有最后一个继续往下
    const children = [];
    for (let i = 0; i < siblingCount; i++) {
      if (i === siblingCount - 1) {
        const c = build(level + 1);
        if (c) children.push(c);
      } else {
        // 兄弟节点：叶子
        children.push({
          id: String(nextId++),
          width: 64,
          height: 28,
          hgap: 10,
          vgap: 70,
        });
      }
    }
    return {
      id,
      width: 64,
      height: 28,
      hgap: 10,
      vgap: 70,
      children,
    };
  }
  return { root: build(0), totalNodes: nextId - 1 };
}

const { root, totalNodes } = buildRealisticDemo();
console.log('总节点数:', totalNodes);

const nodeW = 64, nodeH = 28, nodeSep = 10, rankSep = 70;
const start = Date.now();
const layoutRoot = compactBox(root, {
  direction: 'TB',
  getWidth: () => nodeW,
  getHeight: () => nodeH,
  getHGap: () => nodeSep,
  getVGap: () => rankSep,
});
const ms = Date.now() - start;
console.log('compactBox 耗时:', ms, 'ms');

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
const perGenWidth = new Map();
layoutRoot.eachNode((n) => {
  const x = n.x + n.width / 2;
  const y = n.y + n.height / 2;
  minX = Math.min(minX, x);
  maxX = Math.max(maxX, x);
  minY = Math.min(minY, y);
  maxY = Math.max(maxY, y);
  // 记录每代最大 X 跨度
  const depth = n.depth;
  const cur = perGenWidth.get(depth) || { min: Infinity, max: -Infinity, count: 0 };
  cur.min = Math.min(cur.min, x);
  cur.max = Math.max(cur.max, x);
  cur.count++;
  perGenWidth.set(depth, cur);
});

const spanX = Math.round(maxX - minX);
const spanY = Math.round(maxY - minY);
console.log('X 跨度:', spanX);
console.log('Y 跨度:', spanY);
console.log('X/Y ratio:', (spanX / Math.max(1, spanY)).toFixed(2));
console.log('--- 每代宽度 ---');
for (const [depth, w] of [...perGenWidth.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  depth ${depth}: 节点数=${w.count} X 跨度=${Math.round(w.max - w.min)}`);
}
