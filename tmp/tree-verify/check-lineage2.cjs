// 检查主传承链断裂原因：3333 / 3959 是谁，以及最深后代到根的父链
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});

async function main() {
  await client.connect();
  // 1) 3333 / 3959 身份
  const who = await client.query(`SELECT id, full_name, gender, birth_date, death_date FROM persons WHERE id IN (3333, 3959)`);
  console.log('who are 3333/3959:', who.rows);

  // 2) 最深后代（与后端逻辑一致：ancestor_id=3007 深度最大者）
  const lastDesc = await client.query(`
    SELECT descendant_id FROM person_ancestry WHERE ancestor_id = 3007
    ORDER BY depth DESC LIMIT 3
  `);
  console.log('deepest descendants of 3007:', lastDesc.rows);

  // 3) 该后代沿 depth=1 父链能否走到 3007
  const lastId = lastDesc.rows[0]?.descendant_id;
  if (lastId) {
    const d1 = await client.query(`
      SELECT ancestor_id, descendant_id FROM person_ancestry
      WHERE descendant_id = $1 AND depth = 1
    `, [lastId]);
    console.log('depth=1 parent of deepest:', d1.rows);

    // 统计 3007 子树中，每个节点是否有 depth=1 父链（沿一个最深的链走）
    let cur = lastId; const chain = [String(cur)];
    const visited = new Set();
    while (true) {
      if (visited.has(cur)) break; visited.add(cur);
      const r = await client.query(
        `SELECT ancestor_id FROM person_ancestry WHERE descendant_id = $1 AND depth = 1 AND ancestor_id != descendant_id LIMIT 1`,
        [cur]);
      if (!r.rows.length) break;
      cur = r.rows[0].ancestor_id;
      chain.push(String(cur));
      if (chain.length > 40) break;
    }
    console.log('parent chain from deepest:', chain.join(' -> '));
  }

  // 4) 有多少 person 缺 depth=1 祖先记录（孤儿父链）
  const orphan = await client.query(`
    SELECT count(*) AS cnt FROM persons p
    WHERE p.clan_id = 4 AND p.deleted_at IS NULL
      AND p.id != 3007
      AND NOT EXISTS (
        SELECT 1 FROM person_ancestry pa
        WHERE pa.descendant_id = p.id AND pa.depth = 1 AND pa.ancestor_id != p.id
      )
  `);
  console.log('persons without depth=1 parent (non-root):', orphan.rows[0]);

  // 5) 无父链的人里，有多少有 children（即“父链断裂但仍有后代”）
  const broken = await client.query(`
    SELECT count(DISTINCT p.id) AS cnt FROM persons p
    WHERE p.clan_id = 4 AND p.deleted_at IS NULL AND p.id != 3007
      AND NOT EXISTS (
        SELECT 1 FROM person_ancestry pa
        WHERE pa.descendant_id = p.id AND pa.depth = 1 AND pa.ancestor_id != p.id
      )
      AND EXISTS (
        SELECT 1 FROM person_ancestry pa2
        WHERE pa2.ancestor_id = p.id AND pa2.depth = 1 AND pa2.descendant_id != p.id
      )
  `);
  console.log('broken-parent-chain nodes that still have children:', broken.rows[0]);
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
