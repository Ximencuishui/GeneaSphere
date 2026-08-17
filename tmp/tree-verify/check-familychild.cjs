// 对比 familyChild / personAncestry 完整性：判断是“数据缺失”还是“建树逻辑漏挂”
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});

async function main() {
  await client.connect();
  const clanId = 4;

  // familyChild 记录数（demo 族的子女记录）
  const fc = await client.query(`
    SELECT count(*) AS cnt, count(DISTINCT child_id) AS distinct_children
    FROM family_children fc JOIN family_units fu ON fu.id = fc.family_id
    WHERE fu.clan_id = $1
  `, [clanId]);
  console.log('familyChild rows / distinct children:', fc.rows[0]);

  // 每个有 familyChild 的孩子，是否有 depth=1 父链
  const withFc = await client.query(`
    SELECT count(*) AS cnt FROM family_children fc
    JOIN family_units fu ON fu.id = fc.family_id
    WHERE fu.clan_id = $1 AND fc.child_id IS NOT NULL
  `, [clanId]);
  console.log('familyChild rows:', withFc.rows[0].cnt);

  // 不可达男性(16) 里有多少在 familyChild 里有记录（即数据其实存在，只是没挂 depth=1）
  const orphans = await client.query(`
    SELECT p.id, p.full_name FROM persons p
    WHERE p.clan_id = $1 AND p.deleted_at IS NULL AND p.gender='male'
      AND NOT EXISTS (
        SELECT 1 FROM person_ancestry pa
        WHERE pa.descendant_id = p.id AND pa.depth = 1 AND pa.ancestor_id != p.id
      )
  `, [clanId]);
  const ids = orphans.rows.map((r) => r.id);
  const fcOrphan = await client.query(`
    SELECT DISTINCT fc.child_id FROM family_children fc
    JOIN family_units fu ON fu.id = fc.family_id
    WHERE fu.clan_id = $1 AND fc.child_id = ANY($2)
  `, [clanId, ids]);
  console.log('orphan males that DO have familyChild records:', fcOrphan.rows.length, '/', orphans.rows.length);

  // 不可达且有子(78) 的整支：算一下如果补上父链，能多挂多少人（其子孙中不可达的人数）
  // 用闭包表：这些人的 depth>=1 后代里，有多少不可达
  const unreachRoots = await client.query(`
    SELECT DISTINCT pa.ancestor_id FROM person_ancestry pa
    JOIN persons p ON p.id = pa.ancestor_id AND p.clan_id = $1 AND p.deleted_at IS NULL
    WHERE pa.depth >= 1
      AND NOT EXISTS (
        SELECT 1 FROM person_ancestry pa2
        WHERE pa2.descendant_id = pa.ancestor_id AND pa2.depth = 1 AND pa2.ancestor_id != pa.ancestor_id
      )
      AND EXISTS (
        SELECT 1 FROM person_ancestry pa3
        WHERE pa3.ancestor_id = pa.ancestor_id AND pa3.depth = 1 AND pa3.descendant_id != pa.ancestor_id
      )
  `, [clanId]);
  const unreachRootIds = unreachRoots.rows.map((r) => String(r.ancestor_id));
  console.log('broken-subtree roots (have children, no parent):', unreachRootIds.length);

  // 这些根及其所有后代（闭包表 ancestor_id IN these）—— 全族范围内
  if (unreachRootIds.length) {
    const sub = await client.query(`
      SELECT count(DISTINCT pa.descendant_id) AS cnt
      FROM person_ancestry pa
      WHERE pa.ancestor_id = ANY($1)
        AND pa.descendant_id != pa.ancestor_id
    `, [unreachRootIds]);
    console.log('descendants under broken roots (their subtrees size):', sub.rows[0].cnt);
  }

  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
