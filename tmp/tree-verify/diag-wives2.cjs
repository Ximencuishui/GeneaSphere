// 检查女性人名重复情况（解释 116 vs 500）
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});
async function main() {
  await client.connect();
  const r = await client.query(`
    SELECT full_name, count(*) AS cnt FROM persons
    WHERE clan_id=4 AND deleted_at IS NULL AND gender='female'
    GROUP BY full_name HAVING count(*) > 1 ORDER BY cnt DESC LIMIT 10
  `);
  console.log('duplicate female names:', r.rows);

  const total = await client.query(`SELECT count(*) AS cnt, count(DISTINCT full_name) AS distinct_names FROM persons WHERE clan_id=4 AND deleted_at IS NULL AND gender='female'`);
  console.log('female persons total vs distinct names:', total.rows[0]);

  // 116 个 wife 的名字 vs 全部女性
  const wives = await client.query(`
    SELECT DISTINCT p.full_name FROM family_units fu
    JOIN persons p ON p.id = fu.wife_id
    WHERE fu.clan_id=4
  `);
  console.log('distinct wife names:', wives.rows.length);
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
