import pg from 'pg';
const c = new pg.Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});
await c.connect();

// 1. 统计总人数、familyChild 记录、depth=1 ancestry
const r0 = await c.query(`
  SELECT
    (SELECT COUNT(*) FROM persons WHERE clan_id = 2 AND deleted_at IS NULL) AS total_persons,
    (SELECT COUNT(*) FROM family_children fc JOIN family_units fu ON fu.id = fc.family_id WHERE fu.clan_id = 2) AS total_fc,
    (SELECT COUNT(DISTINCT child_id) FROM family_children fc JOIN family_units fu ON fu.id = fc.family_id WHERE fu.clan_id = 2) AS distinct_children,
    (SELECT COUNT(*) FROM person_ancestry pa JOIN persons p1 ON pa.ancestor_id = p1.id WHERE p1.clan_id = 2 AND pa.depth = 1) AS depth1_total
`);
console.log('基础统计:', r0.rows[0]);

// 2. 找出 496 orphan 的特征：按 birth 的代际分布
const r1 = await c.query(`
  SELECT
    EXTRACT(YEAR FROM p.birth_date)::int AS birth_year,
    COUNT(*) AS cnt
  FROM persons p
  WHERE p.clan_id = 2 AND p.deleted_at IS NULL
    AND p.gender = 'male'
    AND NOT EXISTS (SELECT 1 FROM person_ancestry pa
                    WHERE pa.descendant_id = p.id AND pa.depth = 1)
    AND p.id != 1002  -- 排除朱熹
  GROUP BY birth_year
  ORDER BY birth_year
  LIMIT 30
`);
console.log('\norphan male 按出生年份分布:');
r1.rows.forEach(r => console.log(`  ${r.birth_year}: ${r.cnt} 人`));

// 3. 看 orphan 是否在 familyChild 中（被记为 child 但没 ancestry depth=1）
const r2 = await c.query(`
  SELECT COUNT(*) AS cnt
  FROM persons p
  WHERE p.clan_id = 2 AND p.deleted_at IS NULL
    AND p.gender = 'male'
    AND NOT EXISTS (SELECT 1 FROM person_ancestry pa
                    WHERE pa.descendant_id = p.id AND pa.depth = 1)
    AND EXISTS (SELECT 1 FROM family_children fc WHERE fc.child_id = p.id)
    AND p.id != 1002
`);
console.log('\norphan male 但在 familyChild 中:', r2.rows[0].cnt);

const r3 = await c.query(`
  SELECT COUNT(*) AS cnt
  FROM persons p
  WHERE p.clan_id = 2 AND p.deleted_at IS NULL
    AND p.gender = 'male'
    AND NOT EXISTS (SELECT 1 FROM person_ancestry pa
                    WHERE pa.descendant_id = p.id AND pa.depth = 1)
    AND NOT EXISTS (SELECT 1 FROM family_children fc WHERE fc.child_id = p.id)
    AND p.id != 1002
`);
console.log('orphan male 且不在 familyChild 中:', r3.rows[0].cnt);

// 4. 看繁衍层家庭 (family_id > 510) 的 child 数量分布
const r4 = await c.query(`
  SELECT
    CASE WHEN fu.id <= 510 THEN 'history' ELSE 'breeding' END AS layer,
    COUNT(DISTINCT fu.id) AS family_count,
    COUNT(fc.child_id) AS child_count,
    COUNT(DISTINCT fc.child_id) AS distinct_child_count
  FROM family_units fu
  LEFT JOIN family_children fc ON fc.family_id = fu.id
  WHERE fu.clan_id = 2
  GROUP BY layer
  ORDER BY layer
`);
console.log('\n家庭层 child 统计:');
r4.rows.forEach(r => console.log(`  ${r.layer}: family=${r.family_count} child=${r.child_count} distinct_child=${r.distinct_child_count}`));

// 5. 看繁衍层家庭中 husband_id 是否在 family_units 中，但 husband_id 不在 persons 中（建家庭时找不到人）
const r5 = await c.query(`
  SELECT fu.id, fu.husband_id, fu.wife_id
  FROM family_units fu
  WHERE fu.clan_id = 2
    AND fu.id > 510
    AND NOT EXISTS (SELECT 1 FROM persons p WHERE p.id = fu.husband_id)
  LIMIT 10
`);
console.log('\n繁衍层家庭 husband_id 无效:', r5.rowCount);

// 6. 找一个 orphan male 样本，看他的 family_unit 关系
const r6 = await c.query(`
  SELECT p.id, p.full_name, p.birth_date,
    (SELECT fu.id FROM family_units fu WHERE fu.husband_id = p.id AND fu.clan_id = 2 LIMIT 1) AS own_family,
    (SELECT array_agg(fc.family_id) FROM family_children fc WHERE fc.child_id = p.id) AS child_in_families,
    (SELECT COUNT(*) FROM person_ancestry WHERE descendant_id = p.id) AS anc_count
  FROM persons p
  WHERE p.clan_id = 2 AND p.deleted_at IS NULL
    AND p.gender = 'male'
    AND NOT EXISTS (SELECT 1 FROM person_ancestry pa
                    WHERE pa.descendant_id = p.id AND pa.depth = 1)
    AND p.id != 1002
  ORDER BY p.id
  LIMIT 5
`);
console.log('\norphan male 样本:');
r6.rows.forEach(r => console.log(`  id=${r.id} ${r.full_name} birth=${r.birth_date?.toISOString().slice(0,10)} ownFamily=${r.own_family} childInFams=${JSON.stringify(r.child_in_families)} anc=${r.anc_count}`));

await c.end();
