import pg from 'pg';
const c = new pg.Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});
await c.connect();

// 1. 查 1194 和 1314 的所有关联
const r1 = await c.query(`
  SELECT p.id, p.full_name, p.birth_date, p.created_at, p.updated_at,
    (SELECT fu.id FROM family_units fu WHERE fu.husband_id = p.id AND fu.clan_id = 2 LIMIT 1) AS husband_of_family,
    (SELECT fu.id FROM family_units fu WHERE fu.wife_id = p.id AND fu.clan_id = 2 LIMIT 1) AS wife_of_family,
    (SELECT array_agg(fc.family_id) FROM family_children fc WHERE fc.child_id = p.id) AS child_in_families,
    (SELECT COUNT(*) FROM person_ancestry WHERE descendant_id = p.id) AS anc_count
  FROM persons p WHERE p.id IN (1194, 1314, 1476, 1596, 1758, 1878)
  ORDER BY p.id
`);
console.log('6 个重名 orphan 详情:');
r1.rows.forEach(r => console.log(`  id=${r.id} ${r.full_name} birth=${r.birth_date?.toISOString().slice(0,10)} created=${r.created_at?.toISOString().slice(0,19)} husbandOf=${r.husband_of_family} wifeOf=${r.wife_of_family} childInFams=${JSON.stringify(r.child_in_families)} anc=${r.anc_count}`));

// 2. 找出所有没父链的 male 的人的详细信息
const r2 = await c.query(`
  SELECT p.id, p.full_name, p.birth_date, p.gender, p.migration_branch, p.created_at,
    (SELECT fu.id FROM family_units fu WHERE fu.husband_id = p.id AND fu.clan_id = 2 LIMIT 1) AS husband_of_family,
    (SELECT array_agg(fc.family_id) FROM family_children fc WHERE fc.child_id = p.id) AS child_in_families,
    (SELECT COUNT(*) FROM person_ancestry WHERE descendant_id = p.id) AS anc_count
  FROM persons p
  WHERE p.clan_id = 2 AND p.deleted_at IS NULL
    AND p.gender = 'male'
    AND NOT EXISTS (SELECT 1 FROM person_ancestry pa WHERE pa.descendant_id = p.id AND pa.depth = 1)
  ORDER BY p.id
`);
console.log('\n无父链的 male 全部详情（按 id 排序）:');
r2.rows.forEach(r => console.log(`  id=${r.id} ${r.full_name} birth=${r.birth_date?.toISOString().slice(0,10)} branch=${r.migration_branch} created=${r.created_at?.toISOString().slice(0,19)} husbandOf=${r.husband_of_family} childInFams=${JSON.stringify(r.child_in_families)} anc=${r.anc_count}`));

await c.end();
