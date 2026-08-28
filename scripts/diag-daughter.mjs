// 诊断女儿是否作为 familyChild 记录
import pg from 'pg';

const c = new pg.Client({
  host: '127.0.0.1', port: 15432,
  user: 'geneauser', password: 'GeneaSphere2024!',
  database: 'geneasphere'
});
await c.connect();

const clanR = await c.query(`SELECT id FROM clans WHERE name LIKE '朱熹族谱%' ORDER BY id DESC LIMIT 1`);
const clan = clanR.rows[0];

// 1) 找家族中所有女性
const femaleR = await c.query(`
  SELECT p.id, p.full_name, p.gender
  FROM persons p
  WHERE p.clan_id = $1 AND p.deleted_at IS NULL AND p.gender = 'female'
`, [clan.id]);
console.log(`家族女性总数: ${femaleR.rows.length}`);

// 2) 这些女性中，哪些是 family_children 的 child
const fcR = await c.query(`
  SELECT p.id, p.full_name, fc.family_id, fu.husband_id
  FROM persons p
  JOIN family_children fc ON fc.child_id = p.id
  JOIN family_units fu ON fu.id = fc.family_id
  WHERE p.clan_id = $1 AND p.deleted_at IS NULL
`, [clan.id]);
console.log(`\n作为 family_children.child 的女性: ${fcR.rows.length}`);
fcR.rows.slice(0, 5).forEach(r => console.log(`  ${r.full_name} id=${r.id} family=${r.family_id} 父=${r.husband_id}`));

// 3) 这些女性中，哪些是 family_units.wife_id
const wifeR = await c.query(`
  SELECT p.id, p.full_name, fu.id AS family_id, fu.husband_id
  FROM persons p
  JOIN family_units fu ON fu.wife_id = p.id
  WHERE p.clan_id = $1 AND p.deleted_at IS NULL
`, [clan.id]);
console.log(`\n作为 family_units.wife 的女性: ${wifeR.rows.length}`);

// 4) 既是 child 又不是 wife 的女性（应该是女儿但嫁不出去）
const onlyChildR = await c.query(`
  SELECT p.id, p.full_name
  FROM persons p
  JOIN family_children fc ON fc.child_id = p.id
  JOIN family_units fu ON fu.id = fc.family_id
  WHERE p.clan_id = $1 AND p.deleted_at IS NULL
    AND p.gender = 'female'
    AND NOT EXISTS (
      SELECT 1 FROM family_units fu2 WHERE fu2.wife_id = p.id
    )
`, [clan.id]);
console.log(`\n仅作为 child 出现在家族（不是任何人的妻子）: ${onlyChildR.rows.length}`);
onlyChildR.rows.slice(0, 5).forEach(r => console.log(`  ${r.full_name} id=${r.id}`));

await c.end();
