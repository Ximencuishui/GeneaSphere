// 数据核对：男性数量 vs 501 节点、朱熹子链完整性
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});

async function main() {
  await client.connect();
  const clanId = 4;

  const male = await client.query(
    `SELECT count(*) AS cnt FROM persons WHERE clan_id=$1 AND deleted_at IS NULL AND gender='male'`, [clanId]);
  console.log('male persons:', male.rows[0].cnt);

  const female = await client.query(
    `SELECT count(*) AS cnt FROM persons WHERE clan_id=$1 AND deleted_at IS NULL AND gender='female'`, [clanId]);
  console.log('female persons:', female.rows[0].cnt);

  // 501 节点是否 = 男性（含根）？
  const noParentMale = await client.query(`
    SELECT count(*) AS cnt FROM persons p
    WHERE p.clan_id=$1 AND p.deleted_at IS NULL AND p.gender='male'
      AND NOT EXISTS (
        SELECT 1 FROM person_ancestry pa
        WHERE pa.descendant_id = p.id AND pa.depth = 1 AND pa.ancestor_id != p.id
      )`, [clanId]);
  console.log('males without parent link:', noParentMale.rows[0].cnt);

  // 朱熹(3007) 的直接子链：depth=1
  const zhuXiKids = await client.query(`
    SELECT descendant_id, ancestor_id FROM person_ancestry
    WHERE ancestor_id=3007 AND depth=1
  `);
  console.log('朱熹 depth=1 descendants:', zhuXiKids.rows.length, zhuXiKids.rows.slice(0, 10));

  // 3333 朱桂孝是否有 depth=1 父记录（应为朱熹系下某子）
  const p3333 = await client.query(`
    SELECT ancestor_id, depth FROM person_ancestry WHERE descendant_id=3333 AND depth=1
  `);
  console.log('3333 depth=1 ancestors:', p3333.rows);

  // 3333 的祖先（depth>1，闭包表应有）到根
  const anc = await client.query(`
    SELECT ancestor_id, depth FROM person_ancestry
    WHERE descendant_id=3333 AND depth>0 ORDER BY depth LIMIT 20
  `);
  console.log('3333 ancestors depth>0 (first 20):', anc.rows);

  // 3934 是谁
  const who3934 = await client.query(`SELECT id, full_name, gender FROM persons WHERE id=3934`);
  console.log('3934:', who3934.rows[0]);

  // 3934 的 depth=1 祖先
  const p3934 = await client.query(`SELECT ancestor_id, depth FROM person_ancestry WHERE descendant_id=3934 AND depth=1`);
  console.log('3934 depth=1 ancestors:', p3934.rows);

  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
