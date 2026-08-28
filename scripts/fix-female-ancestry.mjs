// 修复女性 ancestry 闭包表：把嫁入妻子和女儿接到族根链上
// 原因：原 demo-seed 只用 family_unit.husband_id 构造父链，嫁入妻子只有 self-record
//       女儿 (ancestor=父, descendant=女儿, depth=1) 链无法被迭代扩展到 (ancestor=族根, descendant=女儿, depth=N)
// 修复：
//   1. 妻子：ancestor=族根, depth = 丈夫的 depth（同代）
//   2. 女儿：ancestor=族根, depth = 父亲的 depth + 1（晚一代）
// 幂等：ON CONFLICT DO NOTHING

import pg from 'pg';

const c = new pg.Client({
  host: '127.0.0.1', port: 15432,
  user: 'geneauser', password: 'GeneaSphere2024!',
  database: 'geneasphere'
});
await c.connect();

// 找演示家族
const clanR = await c.query(`SELECT id, name FROM clans WHERE name LIKE '朱熹族谱%' ORDER BY id DESC LIMIT 1`);
const clan = clanR.rows[0];
console.log(`演示家族: id=${clan.id} name="${clan.name}"`);

// 找族根（无 depth=1 父链的人）
const rootR = await c.query(`
  SELECT id, full_name FROM persons
  WHERE clan_id = $1 AND deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM person_ancestry pa2
      WHERE pa2.descendant_id = persons.id AND pa2.depth = 1
    )
  ORDER BY id LIMIT 1
`, [clan.id]);
const root = rootR.rows[0];
console.log(`族根: id=${root.id} name=${root.full_name}`);

// 1) 嫁入妻子：ancestor=族根, depth = 丈夫的 depth
const r1 = await c.query(`
  INSERT INTO person_ancestry (ancestor_id, descendant_id, depth)
  SELECT DISTINCT pa.ancestor_id, fu.wife_id, pa.depth
  FROM family_units fu
  JOIN person_ancestry pa ON pa.descendant_id = fu.husband_id
  WHERE fu.clan_id = $2
    AND pa.ancestor_id = $1
    AND fu.wife_id IS NOT NULL
  ON CONFLICT DO NOTHING
`, [root.id, clan.id]);
console.log(`\n[1] 嫁入妻子 ancestry: ${r1.rowCount} 条`);

// 2) 女儿：ancestor=族根, depth = 父的 depth + 1（晚一代）
// 女儿通过 family_children 关系挂到夫家，family.husband_id 为父
const r2 = await c.query(`
  INSERT INTO person_ancestry (ancestor_id, descendant_id, depth)
  SELECT DISTINCT pa.ancestor_id, fc.child_id, pa.depth + 1
  FROM family_children fc
  JOIN family_units fu ON fu.id = fc.family_id
  JOIN person_ancestry pa ON pa.descendant_id = fu.husband_id
  WHERE fu.clan_id = $2
    AND pa.ancestor_id = $1
    AND fu.husband_id IS NOT NULL
  ON CONFLICT DO NOTHING
`, [root.id, clan.id]);
console.log(`[2] 女儿 ancestry: ${r2.rowCount} 条`);

// 统计：再次检查
const inChainR = await c.query(`
  SELECT p.gender, COUNT(*) AS cnt
  FROM persons p
  JOIN person_ancestry pa ON pa.descendant_id = p.id
  WHERE p.clan_id = $1 AND p.deleted_at IS NULL
    AND pa.ancestor_id = $2
  GROUP BY p.gender
`, [clan.id, root.id]);
console.log(`\n【修复后】族根链上性别分布：`);
inChainR.rows.forEach(r => console.log(`  ${r.gender}: ${r.cnt}`));

// 按世代分布
const genR = await c.query(`
  SELECT pa.depth + 1 AS generation, COUNT(*) AS total,
    SUM(CASE WHEN p.gender = 'male' THEN 1 ELSE 0 END) AS male,
    SUM(CASE WHEN p.gender = 'female' THEN 1 ELSE 0 END) AS female
  FROM persons p
  JOIN person_ancestry pa ON pa.descendant_id = p.id
  WHERE p.clan_id = $1 AND p.deleted_at IS NULL
    AND pa.ancestor_id = $2
  GROUP BY pa.depth
  ORDER BY pa.depth
`, [clan.id, root.id]);
console.log(`\n按世代分布（含 self-record):`);
genR.rows.forEach(r => console.log(`  第${r.generation}世: ${r.total} 人 (男 ${r.male} / 女 ${r.female})`));

await c.end();
