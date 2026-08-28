import pg from 'pg';
const c = new pg.Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});
await c.connect();

// 1. 看 1194, 1476, 1758 的完整信息
const r1 = await c.query(`
  SELECT id, full_name, birth_date, gender, migration_branch, clan_id
  FROM persons WHERE id IN (1194, 1476, 1758)
`);
console.log('3 个 orphan male 信息:');
r1.rows.forEach(r => console.log(`  id=${r.id} ${r.full_name} birth=${r.birth_date?.toISOString().slice(0,10)} gender=${r.gender} branch=${r.migration_branch} clan=${r.clan_id}`));

// 2. 看是否有同名的人（重名检测）
const r2 = await c.query(`
  SELECT full_name, COUNT(*) AS cnt, array_agg(id ORDER BY id) AS ids
  FROM persons WHERE clan_id = 2 AND deleted_at IS NULL
  GROUP BY full_name
  HAVING COUNT(*) > 1
  ORDER BY full_name
`);
console.log('\n重名 persons:');
r2.rows.forEach(r => console.log(`  ${r.full_name}: ${r.cnt} 次, ids=${r.ids.join(',')}`));

// 3. 看无父链的女性 + 是否在 familyChild 中
const r3 = await c.query(`
  SELECT p.id, p.full_name, p.birth_date, p.gender,
    (SELECT array_agg(fc.family_id) FROM family_children fc WHERE fc.child_id = p.id) AS child_in_families
  FROM persons p
  WHERE p.clan_id = 2 AND p.deleted_at IS NULL
    AND p.gender = 'female'
    AND NOT EXISTS (SELECT 1 FROM person_ancestry pa WHERE pa.descendant_id = p.id AND pa.depth = 1)
  ORDER BY p.id
  LIMIT 30
`);
console.log('\n无父链的女性（前 30）:');
r3.rows.forEach(r => console.log(`  id=${r.id} ${r.full_name} birth=${r.birth_date?.toISOString().slice(0,10)} childInFams=${JSON.stringify(r.child_in_families)}`));

// 4. 看繁衍层家庭中 husband_id 在 persons 中但 childNames 没写入的（孤儿）
const r4 = await c.query(`
  WITH fam_children AS (
    SELECT fu.id AS family_id, fu.husband_id, fu.clan_id,
           COUNT(fc.child_id) AS written_child_count
    FROM family_units fu
    LEFT JOIN family_children fc ON fc.family_id = fu.id
    WHERE fu.clan_id = 2
    GROUP BY fu.id, fu.husband_id, fu.clan_id
  )
  SELECT COUNT(*) AS zero_child_families
  FROM fam_children
  WHERE written_child_count = 0 AND husband_id IS NOT NULL
`);
console.log('\n0 个 child 的家庭数:', r4.rows[0].zero_child_families);

// 5. 看繁衍层家庭中是否有 husband_id = null（妻子家庭）
const r5 = await c.query(`
  SELECT COUNT(*) AS husband_null_count
  FROM family_units WHERE clan_id = 2 AND husband_id IS NULL
`);
console.log('husband_id 为 null 的家庭:', r5.rows[0].husband_null_count);

// 6. 总家族人数与 familyChild 数对比
const r6 = await c.query(`
  SELECT
    (SELECT COUNT(*) FROM persons WHERE clan_id = 2 AND deleted_at IS NULL) AS total,
    (SELECT COUNT(*) FROM persons WHERE clan_id = 2 AND deleted_at IS NULL AND gender = 'male') AS male,
    (SELECT COUNT(*) FROM persons WHERE clan_id = 2 AND deleted_at IS NULL AND gender = 'female') AS female,
    (SELECT COUNT(*) FROM family_children fc JOIN family_units fu ON fu.id = fc.family_id WHERE fu.clan_id = 2) AS fc_total,
    (SELECT COUNT(DISTINCT child_id) FROM family_children fc JOIN family_units fu ON fu.id = fc.family_id WHERE fu.clan_id = 2) AS fc_distinct
`);
console.log('\n总统计:', r6.rows[0]);

await c.end();
