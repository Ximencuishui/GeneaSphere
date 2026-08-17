// 精确核实 demo 族 family_units 的配偶关联完整性
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});

async function main() {
  await client.connect();
  const clanId = 4;

  const fu = await client.query(`
    SELECT count(*) AS total,
           count(husband_id) AS with_husband,
           count(wife_id) AS with_wife
    FROM family_units WHERE clan_id = $1
  `, [clanId]);
  console.log('family_units:', fu.rows[0]);

  // 有丈夫的 family 中，丈夫本人是否在族内
  const hIn = await client.query(`
    SELECT count(*) AS cnt FROM family_units fu
    JOIN persons p ON p.id = fu.husband_id AND p.clan_id = $1 AND p.deleted_at IS NULL
    WHERE fu.clan_id = $1
  `, [clanId]);
  console.log('families whose husband is in-clan person:', hIn.rows[0].cnt);

  // 女性人数 vs 作为 wife 出现的人数
  const fem = await client.query(`SELECT count(*) AS cnt FROM persons WHERE clan_id=$1 AND deleted_at IS NULL AND gender='female'`, [clanId]);
  const femWife = await client.query(`
    SELECT count(DISTINCT fu.wife_id) AS cnt FROM family_units fu
    JOIN persons p ON p.id = fu.wife_id AND p.clan_id = $1 AND p.deleted_at IS NULL
    WHERE fu.clan_id = $1 AND fu.wife_id IS NOT NULL
  `, [clanId]);
  console.log(`female persons: ${fem.rows[0].cnt}, distinct in-clan wives: ${femWife.rows[0].cnt}`);

  // 女性里"不是任何 family 的 wife 也不是 child"的人有多少（纯孤立女性）
  const orphanFem = await client.query(`
    SELECT count(*) AS cnt FROM persons p
    WHERE p.clan_id=$1 AND p.deleted_at IS NULL AND p.gender='female'
      AND NOT EXISTS (SELECT 1 FROM family_units fu WHERE fu.clan_id=$1 AND fu.wife_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM family_children fc JOIN family_units fu ON fu.id=fc.family_id WHERE fu.clan_id=$1 AND fc.child_id = p.id)
  `, [clanId]);
  console.log('females neither wife nor child:', orphanFem.rows[0].cnt);

  // 这些孤立的女性有没有 depth=1 子记录（作为母亲有后代）
  const orphanFemWithKids = await client.query(`
    SELECT count(DISTINCT pa.ancestor_id) AS cnt FROM person_ancestry pa
    JOIN persons p ON p.id = pa.ancestor_id AND p.clan_id=$1 AND p.deleted_at IS NULL AND p.gender='female'
    WHERE pa.depth = 1
      AND NOT EXISTS (SELECT 1 FROM family_units fu WHERE fu.clan_id=$1 AND fu.wife_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM family_children fc JOIN family_units fu ON fu.id=fc.family_id WHERE fu.clan_id=$1 AND fc.child_id = p.id)
  `, [clanId]);
  console.log('orphan females WITH depth=1 children (mothers not linked as wife):', orphanFemWithKids.rows[0].cnt);

  // 男性：有多少人是 family 的 husband（即有配偶节点资格）
  const maleHusband = await client.query(`
    SELECT count(DISTINCT fu.husband_id) AS cnt FROM family_units fu
    JOIN persons p ON p.id = fu.husband_id AND p.clan_id=$1
    WHERE fu.clan_id = $1
  `, [clanId]);
  console.log('distinct husbands in family_units:', maleHusband.rows[0].cnt);

  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
