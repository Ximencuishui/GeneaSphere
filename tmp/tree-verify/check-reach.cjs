// 从根 3007 沿 depth=1 父链 BFS，统计真正可达的节点数
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});

async function main() {
  await client.connect();
  // 全量 depth=1 关系（本族内）
  const rel = await client.query(`
    SELECT pa.ancestor_id, pa.descendant_id
    FROM person_ancestry pa
    JOIN persons a ON a.id = pa.ancestor_id AND a.clan_id = 4 AND a.deleted_at IS NULL
    JOIN persons d ON d.id = pa.descendant_id AND d.clan_id = 4 AND d.deleted_at IS NULL
    WHERE pa.depth = 1 AND pa.ancestor_id != pa.descendant_id
  `);
  const childMap = new Map(); // parent -> [children]
  for (const r of rel.rows) {
    if (!childMap.has(String(r.ancestor_id))) childMap.set(String(r.ancestor_id), []);
    childMap.get(String(r.ancestor_id)).push(String(r.descendant_id));
  }
  console.log('total depth=1 edges (intra-clan):', rel.rows.length);

  // BFS from root 3007
  const visited = new Set(['3007']);
  const queue = ['3007'];
  while (queue.length) {
    const cur = queue.shift();
    for (const c of childMap.get(cur) || []) {
      if (!visited.has(c)) { visited.add(c); queue.push(c); }
    }
  }
  console.log('reachable nodes from root 3007 via depth=1:', visited.size);

  // 不可达（非根）人数 + 性别
  const all = await client.query(
    `SELECT id, gender FROM persons WHERE clan_id=4 AND deleted_at IS NULL`);
  const unreachable = all.rows.filter((p) => !visited.has(String(p.id)));
  const byGender = {};
  for (const p of unreachable) byGender[p.gender] = (byGender[p.gender] || 0) + 1;
  console.log('unreachable:', unreachable.length, JSON.stringify(byGender));

  // 不可达者里，有多少人其实有 depth=1 子记录（即有后代的人）
  const unreachableIds = unreachable.map((p) => String(p.id));
  let hasKids = 0;
  for (const id of unreachableIds) if (childMap.has(id) && childMap.get(id).length) hasKids++;
  console.log('unreachable persons who have children:', hasKids);

  // 不可达的男性样例（这些本应显示在树上）
  const unreachableMales = unreachable.filter((p) => p.gender === 'male').slice(0, 20);
  const names = await client.query(
    `SELECT id, full_name FROM persons WHERE id = ANY($1)`, [unreachableMales.map((p) => p.id)]);
  console.log('sample unreachable males:', names.rows.map((r) => `${r.id}:${r.full_name}`).join(', '));

  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
