// 查 clan4 里叫“朱熹”的人有几个（解释搜索命中 17）
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});
async function main() {
  await client.connect();
  const r = await client.query(
    `SELECT id, full_name, gender, birth_date FROM persons WHERE clan_id=4 AND deleted_at IS NULL AND full_name ILIKE '%朱熹%' ORDER BY id LIMIT 25`);
  console.log('persons with 朱熹 in name:', r.rows.length);
  r.rows.forEach((p) => console.log(`  ${p.id} ${p.full_name} ${p.gender} ${p.birth_date ? new Date(p.birth_date).getFullYear() : ''}`));
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
