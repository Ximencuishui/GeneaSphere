// 决定性验证：79 个"断根"是否可达；妻子节点在树 API 中的形态
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});

async function main() {
  await client.connect();
  const clanId = 4;

  // 1) 全量 depth=1（father+mother 混合）
  const rel = await client.query(`
    SELECT pa.ancestor_id, pa.descendant_id
    FROM person_ancestry pa
    WHERE pa.depth = 1 AND pa.ancestor_id != pa.descendant_id
  `);
  const childMap = new Map();
  for (const r of rel.rows) {
    const k = String(r.ancestor_id);
    if (!childMap.has(k)) childMap.set(k, []);
    childMap.get(k).push(String(r.descendant_id));
  }

  // BFS from root
  const visited = new Set(['3007']);
  const queue = ['3007'];
  while (queue.length) {
    const cur = queue.shift();
    for (const c of childMap.get(cur) || []) {
      if (!visited.has(c)) { visited.add(c); queue.push(c); }
    }
  }
  console.log('BFS(all depth=1) reachable from 3007:', visited.size);

  // 2) 79 个"断根"是谁 + 是否可达
  const broken = await client.query(`
    SELECT DISTINCT pa.ancestor_id AS id
    FROM person_ancestry pa
    WHERE pa.depth >= 1
      AND NOT EXISTS (
        SELECT 1 FROM person_ancestry pa2
        WHERE pa2.descendant_id = pa.ancestor_id AND pa2.depth = 1 AND pa2.ancestor_id != pa.ancestor_id
      )
      AND EXISTS (
        SELECT 1 FROM person_ancestry pa3
        WHERE pa3.ancestor_id = pa.ancestor_id AND pa3.depth = 1 AND pa3.descendant_id != pa.ancestor_id
      )
  `);
  console.log('broken roots count:', broken.rows.length);
  const brokenIds = broken.rows.map((r) => String(r.id));
  const reachableBroken = brokenIds.filter((id) => visited.has(id));
  console.log('broken roots REACHABLE from 3007:', reachableBroken.length, '/', brokenIds.length);
  const names = await client.query(`SELECT id, full_name, gender FROM persons WHERE id = ANY($1) LIMIT 30`, [brokenIds]);
  console.log('broken roots sample:', names.rows.map((r) => `${r.id}:${r.full_name}(${r.gender})`).join(', '));

  // 3) 不可达的 516 人构成
  const all = await client.query(`SELECT id, gender FROM persons WHERE clan_id=$1 AND deleted_at IS NULL`, [clanId]);
  const unreach = all.rows.filter((p) => !visited.has(String(p.id)));
  const byG = {};
  for (const p of unreach) byG[p.gender] = (byG[p.gender] || 0) + 1;
  console.log('unreachable:', unreach.length, JSON.stringify(byG));
  // 不可达女性里有多少是 family_units.wife（有丈夫，即“妻子”）
  const unreachIds = unreach.map((p) => String(p.id));
  const wives = await client.query(`
    SELECT count(DISTINCT fu.wife_id) AS cnt FROM family_units fu
    WHERE fu.clan_id=$1 AND fu.wife_id = ANY($2)
  `, [clanId, unreachIds]);
  console.log('unreachable persons who are wives in family_units:', wives.rows[0].cnt);
  const notWives = await client.query(`
    SELECT p.id, p.full_name, p.gender FROM persons p
    WHERE p.clan_id=$1 AND p.deleted_at IS NULL AND p.id = ANY($2)
      AND NOT EXISTS (SELECT 1 FROM family_units fu WHERE fu.clan_id=$1 AND fu.wife_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM family_units fu WHERE fu.clan_id=$1 AND fu.husband_id = p.id)
  `, [clanId, unreachIds]);
  console.log('unreachable & not in any family_units:', notWives.rows.length);
  notWives.rows.slice(0, 20).forEach((r) => console.log(`   ${r.id}: ${r.full_name} (${r.gender})`));

  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
