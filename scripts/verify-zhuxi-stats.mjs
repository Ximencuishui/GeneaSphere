import pg from 'pg';
const c = new pg.Client({ host: '127.0.0.1', port: 15432, user: 'geneauser', password: 'GeneaSphere2024!', database: 'geneasphere' });
await c.connect();
// 看 familyChild 在历史家庭（id 1-17）的样本
const r1 = await c.query(`
  SELECT fc.family_id, fu.husband_id, fc.child_id, p.full_name
  FROM family_children fc
  JOIN family_units fu ON fu.id = fc.family_id
  JOIN persons p ON p.id = fc.child_id
  WHERE fu.clan_id = 2
  ORDER BY fc.family_id, fc.birth_order
  LIMIT 30
`);
console.log('前30条familyChild:');
r1.rows.forEach(r => console.log(`  fam=${r.family_id} husband=${r.husband_id} child=${r.child_id} ${r.full_name}`));
// 看繁衍层家庭（id > 17）的样本
const r2 = await c.query(`
  SELECT fu.id AS family_id, fu.husband_id, p.full_name, COUNT(fc.child_id) AS child_cnt
  FROM family_units fu
  JOIN persons p ON p.id = fu.husband_id
  LEFT JOIN family_children fc ON fc.family_id = fu.id
  WHERE fu.clan_id = 2
  GROUP BY fu.id, fu.husband_id, p.full_name
  ORDER BY fu.id
  LIMIT 30
`);
console.log('\n家庭(child数):');
r2.rows.forEach(r => console.log(`  fam=${r.family_id} husband=${r.husband_id} ${r.full_name} children=${r.child_cnt}`));
// 看无父链且anc_count>0的10人（孤儿子孙）
const r3 = await c.query(`
  SELECT p.id, p.full_name, p.birth_date,
    (SELECT COUNT(*) FROM family_children WHERE child_id = p.id) AS fc_count,
    (SELECT COUNT(*) FROM person_ancestry WHERE ancestor_id = p.id) AS anc_count
  FROM persons p
  WHERE p.clan_id = 2
    AND p.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM person_ancestry pa WHERE pa.descendant_id = p.id AND pa.depth = 1)
    AND p.gender = 'male'
  ORDER BY anc_count DESC, p.id
  LIMIT 15
`);
console.log('\n无父链的男性Top15:');
r3.rows.forEach(r => console.log(`  id=${r.id} ${r.full_name} birth=${r.birth_date?.toISOString().slice(0,10)} fc=${r.fc_count} anc=${r.anc_count}`));
await c.end();