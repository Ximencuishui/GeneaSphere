// 诊断女性数 = 0：族根链内外的女性分布
import pg from 'pg';

const c = new pg.Client({
  host: '127.0.0.1', port: 15432,
  user: 'geneauser', password: 'GeneaSphere2024!',
  database: 'geneasphere'
});
await c.connect();

const clanR = await c.query(`SELECT id, name FROM clans WHERE name LIKE '朱熹族谱%' ORDER BY id DESC LIMIT 1`);
const clan = clanR.rows[0];
console.log(`演示家族: id=${clan.id} name="${clan.name}"\n`);

// 找族根
const rootR = await c.query(`
  SELECT id, full_name, gender FROM persons
  WHERE clan_id = $1 AND deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM person_ancestry pa2
      WHERE pa2.descendant_id = persons.id AND pa2.depth = 1
    )
  ORDER BY id LIMIT 1
`, [clan.id]);
const root = rootR.rows[0];
console.log(`族根: id=${root.id} name=${root.full_name} gender=${root.gender}\n`);

// 1) 全体人员性别分布
const allR = await c.query(`
  SELECT gender, COUNT(*) AS cnt FROM persons
  WHERE clan_id = $1 AND deleted_at IS NULL GROUP BY gender
`, [clan.id]);
console.log('【全体】性别分布:');
allR.rows.forEach(r => console.log(`  ${r.gender}: ${r.cnt}`));

// 2) 族根链上人员性别分布（从朱熹可达）
const inChainR = await c.query(`
  SELECT p.gender, COUNT(*) AS cnt
  FROM persons p
  JOIN person_ancestry pa ON pa.descendant_id = p.id
  WHERE p.clan_id = $1 AND p.deleted_at IS NULL
    AND pa.ancestor_id = $2
  GROUP BY p.gender
`, [clan.id, root.id]);
console.log('\n【族根链上】性别分布 (含 self-record)：');
inChainR.rows.forEach(r => console.log(`  ${r.gender}: ${r.cnt}`));

// 3) 链外人员（无自我记录到族根的）
const outChainR = await c.query(`
  SELECT p.gender, COUNT(*) AS cnt
  FROM persons p
  WHERE p.clan_id = $1 AND p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM person_ancestry pa
      WHERE pa.descendant_id = p.id AND pa.ancestor_id = $2
    )
  GROUP BY p.gender
`, [clan.id, root.id]);
console.log('\n【族根链外】性别分布（孤儿/嫁入女性）：');
outChainR.rows.forEach(r => console.log(`  ${r.gender}: ${r.cnt}`));

// 4) 抽样 5 个链外女性（嫁入的妻子们）
const wifeSample = await c.query(`
  SELECT p.id, p.full_name, p.gender
  FROM persons p
  WHERE p.clan_id = $1 AND p.deleted_at IS NULL
    AND p.gender = 'female'
    AND NOT EXISTS (
      SELECT 1 FROM person_ancestry pa
      WHERE pa.descendant_id = p.id AND pa.ancestor_id = $2
    )
  LIMIT 5
`, [clan.id, root.id]);
console.log('\n【链外女性样例】:');
wifeSample.rows.forEach(r => console.log(`  id=${r.id} ${r.full_name} ${r.gender}`));

// 5) 是否能通过 family_unit 找到她的丈夫
if (wifeSample.rows.length > 0) {
  const wId = wifeSample.rows[0].id;
  const famR = await c.query(`
    SELECT id, husband_id, wife_id FROM family_units
    WHERE clan_id = $1 AND wife_id = $2
  `, [clan.id, wId]);
  console.log(`\n  她所在家庭: ${famR.rows.length} 个`);
  famR.rows.forEach(r => console.log(`    family_id=${r.id} husband=${r.husband_id} wife=${r.wife_id}`));
}

await c.end();
