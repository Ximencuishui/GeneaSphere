// 对比：family_children 父链真实深度 vs person_ancestry 闭包表深度
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});
async function main() {
  await client.connect();
  // 1) 闭包表从根 3007 的最大深度
  const closure = await client.query(`
    SELECT max(depth) AS max_depth, count(*) AS rows
    FROM person_ancestry WHERE ancestor_id = 3007
  `);
  console.log('person_ancestry from root 3007: max_depth =', closure.rows[0].max_depth, ', rows =', closure.rows[0].rows);

  // 2) family_children 父链 BFS 深度（权威父子链）
  const fc = await client.query(`
    SELECT fc.child_id, fu.husband_id
    FROM family_children fc JOIN family_units fu ON fu.id = fc.family_id
    WHERE fu.clan_id = 4
  `);
  const parentOf = new Map();
  for (const r of fc.rows) if (r.husband_id) parentOf.set(String(r.child_id), String(r.husband_id));
  // BFS from root 3007
  const depth = new Map(); depth.set('3007', 0);
  const queue = ['3007'];
  let maxDepth = 0, maxNode = null;
  while (queue.length) {
    const cur = queue.shift();
    // 找 cur 的所有孩子
    for (const [child, parent] of parentOf.entries()) {
      if (parent === cur && !depth.has(child)) {
        depth.set(child, depth.get(cur) + 1);
        if (depth.get(child) > maxDepth) { maxDepth = depth.get(child); maxNode = child; }
        queue.push(child);
      }
    }
  }
  console.log('family_children 父链 BFS 从根可达:', depth.size, '人, 最大深度:', maxDepth);
  const nm = await client.query(`SELECT id, full_name FROM persons WHERE id = $1`, [maxNode]);
  console.log('最深节点:', nm.rows[0]);

  // 3) 闭包表里 depth=11 的节点（之前挂载的叶节点）在父链 BFS 里是第几代
  const d11 = await client.query(`
    SELECT p.id, p.full_name FROM person_ancestry pa
    JOIN persons p ON p.id = pa.descendant_id
    WHERE pa.ancestor_id = 3007 AND pa.depth = 11 AND p.clan_id = 4
    LIMIT 3
  `);
  console.log('closure depth=11 样例:', d11.rows.map((r) => `${r.id}:${r.full_name}`).join(', '));
  for (const r of d11.rows) {
    console.log(`  ${r.full_name}(${r.id}) 父链 BFS 深度:`, depth.get(String(r.id)));
  }

  // 4) 父链 BFS 深度 >= 12 的人数（闭包表没覆盖到的人）
  const over11 = [...depth.entries()].filter(([, d]) => d > 11).length;
  console.log('父链深度 > 11 的人数（闭包表缺失段）:', over11);

  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
