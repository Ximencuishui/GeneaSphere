// 查两个朱小小的 person_user_link 详情 + 主脉末端节点（用于挂载）
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});
async function main() {
  await client.connect();
  const links = await client.query(`
    SELECT pul.id, pul.person_id, pul.user_id, pul.relation_role, u.phone
    FROM person_user_links pul
    JOIN users u ON u.id = pul.user_id
    WHERE pul.person_id IN (3039, 3040)
  `);
  console.log('朱小小 links:', links.rows);

  // 主传承链末端（朱樽强 3959）及其子（如果有）
  const kids = await client.query(`
    SELECT fc.child_id, p.full_name FROM family_children fc
    JOIN family_units fu ON fu.id = fc.family_id
    JOIN persons p ON p.id = fc.child_id
    WHERE fu.husband_id = 3959
  `);
  console.log('3959 的孩子:', kids.rows);

  // 最深代节点（作为测试人物挂载点候选）
  const deep = await client.query(`
    SELECT p.id, p.full_name, max(pa.depth) AS depth
    FROM person_ancestry pa
    JOIN persons p ON p.id = pa.descendant_id
    WHERE pa.ancestor_id = 3007 AND p.clan_id = 4
    GROUP BY p.id, p.full_name
    ORDER BY depth DESC LIMIT 8
  `);
  console.log('最深后代:', deep.rows);

  // 每个无父链男性最近的可用挂载点：他们同支系（branch）的现代男性
  const orphanBranch = await client.query(`
    SELECT p.id, p.full_name, p.migration_branch FROM persons p
    WHERE p.id IN (3039,3040,4009,4010,4011,4012,4013,4015,4017,4018,4019,4020,4021,4022,4023,4024)
  `);
  console.log('orphans branch:', orphanBranch.rows);

  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
