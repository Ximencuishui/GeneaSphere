// 查 16 个无家庭关联人员的完整信息
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});
async function main() {
  await client.connect();
  // 无 depth=1 父链的男性（非根 朱熹 3007 之外）
  const r = await client.query(`
    SELECT p.id, p.full_name, p.gender, p.created_at, p.updated_at,
           (SELECT count(*) FROM family_units fu WHERE fu.clan_id=4 AND (fu.husband_id = p.id OR fu.wife_id = p.id)) AS family_links,
           (SELECT count(*) FROM family_children fc JOIN family_units fu ON fu.id=fc.family_id WHERE fu.clan_id=4 AND fc.child_id = p.id) AS child_links,
           (SELECT count(*) FROM person_user_links pul WHERE pul.person_id = p.id) AS user_links,
           (SELECT count(*) FROM person_ancestry pa WHERE pa.ancestor_id = p.id AND pa.depth >= 1) AS has_descendants
    FROM persons p
    WHERE p.clan_id=4 AND p.deleted_at IS NULL AND p.gender='male'
      AND NOT EXISTS (
        SELECT 1 FROM person_ancestry pa
        WHERE pa.descendant_id = p.id AND pa.depth = 1 AND pa.ancestor_id != p.id
      )
      AND p.id != 3007
    ORDER BY p.id
  `);
  console.log('无父链男性:', r.rows.length);
  r.rows.forEach((x) => console.log(`  ${x.id} ${x.full_name} created=${x.created_at ? x.created_at.toISOString().slice(0,19) : '?'} fam=${x.family_links} child=${x.child_links} user=${x.user_links} descendants=${x.has_descendants}`));
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
