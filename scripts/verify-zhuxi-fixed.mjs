// 验证演示数据完整性：按世代分布 + 房支分布 + 无孤儿子孙
import pg from 'pg';

const c = new pg.Client({
  host: '127.0.0.1', port: 15432,
  user: 'geneauser', password: 'GeneaSphere2024!',
  database: 'geneasphere'
});
await c.connect();

// 找出演示家族 id
const clanR = await c.query(`SELECT id, name FROM clans WHERE name LIKE '朱熹族谱%' ORDER BY id DESC LIMIT 1`);
const clan = clanR.rows[0];
console.log(`演示家族: id=${clan.id} name="${clan.name}"\n`);

// 总人数
const totalR = await c.query(`SELECT COUNT(*) as cnt FROM persons WHERE clan_id = $1 AND deleted_at IS NULL`, [clan.id]);
console.log(`总人数: ${totalR.rows[0].cnt}`);

// 按 ancestry depth 分组（世代）
const genR = await c.query(`
  SELECT pa.depth + 1 AS generation, COUNT(*) AS total
  FROM persons p
  JOIN person_ancestry pa ON pa.descendant_id = p.id
  WHERE p.clan_id = $1 AND p.deleted_at IS NULL
    AND pa.ancestor_id = (
      SELECT id FROM persons
      WHERE clan_id = $1 AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM person_ancestry pa2
          WHERE pa2.descendant_id = persons.id AND pa2.depth = 1
        )
      ORDER BY id LIMIT 1
    )
  GROUP BY pa.depth
  ORDER BY pa.depth
`, [clan.id]);
console.log('\n按世代分布:');
genR.rows.forEach(r => console.log(`  第${r.generation}世: ${r.total} 人`));

// 按房支分布
const branchR = await c.query(`
  SELECT COALESCE(migration_branch, '未知') AS branch, COUNT(*) AS total
  FROM persons
  WHERE clan_id = $1 AND deleted_at IS NULL
  GROUP BY migration_branch
  ORDER BY branch
`, [clan.id]);
console.log('\n按房支分布:');
branchR.rows.forEach(r => {
  const label = r.branch === 'A' ? '长房' : r.branch === 'B' ? '二房' : r.branch === 'C' ? '三房' : r.branch;
  console.log(`  ${label} (${r.branch}): ${r.total} 人`);
});

// 无父链人数统计（孤儿子孙）
const orphanR = await c.query(`
  SELECT
    COUNT(*) FILTER (
      WHERE NOT EXISTS (SELECT 1 FROM person_ancestry pa
        WHERE pa.descendant_id = p.id AND pa.depth = 1)
    ) AS orphan_total,
    COUNT(*) FILTER (
      WHERE NOT EXISTS (SELECT 1 FROM person_ancestry pa
        WHERE pa.descendant_id = p.id AND pa.depth = 1)
        AND p.gender = 'male'
    ) AS orphan_male,
    COUNT(*) FILTER (
      WHERE NOT EXISTS (SELECT 1 FROM person_ancestry pa
        WHERE pa.descendant_id = p.id AND pa.depth = 1)
        AND p.gender = 'female'
    ) AS orphan_female
  FROM persons p
  WHERE p.clan_id = $1 AND p.deleted_at IS NULL
`, [clan.id]);
console.log('\n孤儿子孙统计:');
const or_ = orphanR.rows[0];
console.log(`  总孤儿: ${or_.orphan_total}`);
console.log(`  男性孤儿: ${or_.orphan_male}`);
console.log(`  女性孤儿: ${or_.orphan_female}`);

// 家庭数
const famR = await c.query(`SELECT COUNT(*) AS cnt FROM family_units WHERE clan_id = $1`, [clan.id]);
console.log(`\n家庭数: ${famR.rows[0].cnt}`);

// 子女关系数
const fcR = await c.query(`
  SELECT COUNT(*) AS cnt FROM family_children fc
  JOIN family_units fu ON fu.id = fc.family_id
  WHERE fu.clan_id = $1
`, [clan.id]);
console.log(`子女关系数: ${fcR.rows[0].cnt}`);

// 闭包表统计
const ancR = await c.query(`
  SELECT depth, COUNT(*) AS cnt
  FROM person_ancestry
  GROUP BY depth
  ORDER BY depth
`);
console.log('\n闭包表按 depth:');
ancR.rows.forEach(r => console.log(`  depth=${r.depth}: ${r.cnt}`));

await c.end();