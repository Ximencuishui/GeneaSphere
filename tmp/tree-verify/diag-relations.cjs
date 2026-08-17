// 诊断 family_children vs person_ancestry 完整性
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});

async function main() {
  await client.connect();
  const clanId = 4;

  // 1) family_children 里 distinct children 及对应父亲
  const fc = await client.query(`
    SELECT fc.child_id, fu.husband_id, fu.wife_id, fu.id AS family_id
    FROM family_children fc
    JOIN family_units fu ON fu.id = fc.family_id
    WHERE fu.clan_id = $1
  `, [clanId]);
  console.log('family_children rows:', fc.rows.length);
  const withHusband = fc.rows.filter((r) => r.husband_id);
  const noHusband = fc.rows.filter((r) => !r.husband_id);
  console.log('  with husband:', withHusband.length, '| no husband:', noHusband.length);
  if (noHusband.length) {
    const noHusbSample = await client.query(
      `SELECT id, full_name, gender FROM persons WHERE id = ANY($1) LIMIT 10`,
      [noHusband.slice(0, 10).map((r) => r.child_id)]);
    console.log('  children in wife-only families sample:', noHusbSample.rows);
  }

  // 2) 这些 children 里缺 depth=1 父链的有多少（父=husband 那条缺失）
  const childIds = withHusband.map((r) => String(r.child_id));
  const husbandIds = withHusband.map((r) => String(r.husband_id));
  const miss = await client.query(`
    SELECT count(*) AS cnt FROM unnest($1::bigint[]) AS c(child)
    WHERE NOT EXISTS (
      SELECT 1 FROM person_ancestry pa
      WHERE pa.descendant_id = c.child AND pa.depth = 1
    )
  `, [childIds]);
  console.log('family_children children missing ANY depth=1 parent:', miss.rows[0].cnt);

  // 3) 缺"父亲那条 depth=1"的（有 depth=1 但不是该 husband 的）
  //    对每个 child，检查 depth=1 里是否有 ancestor = 其 husband
  let missingFatherLink = 0;
  const sample = [];
  for (const r of withHusband) {
    const q = await client.query(`
      SELECT 1 FROM person_ancestry
      WHERE descendant_id = $1 AND ancestor_id = $2 AND depth = 1
    `, [r.child_id, r.husband_id]);
    if (!q.rows.length) {
      missingFatherLink++;
      if (sample.length < 8) sample.push({ child: r.child_id, father: r.husband_id });
    }
  }
  console.log('children missing THEIR FATHER depth=1 link:', missingFatherLink);
  if (sample.length) {
    const s = await client.query(`SELECT id, full_name FROM persons WHERE id = ANY($1)`, [sample.map((x) => x.child)]);
    console.log('  sample missing-father children:', s.rows);
  }

  // 4) person_ancestry depth=1 重复度
  const dup = await client.query(`
    SELECT count(*) AS total, count(DISTINCT (ancestor_id, descendant_id)) AS distinct_pairs
    FROM person_ancestry WHERE depth = 1
  `);
  console.log('depth=1 total vs distinct pairs:', dup.rows[0]);

  // 5) family_children 里没有的 depth=1 记录（ancestry 独有）
  const onlyAncestry = await client.query(`
    SELECT count(*) AS cnt FROM person_ancestry pa
    JOIN persons p ON p.id = pa.descendant_id AND p.clan_id = $1
    WHERE pa.depth = 1 AND pa.ancestor_id != pa.descendant_id
      AND NOT EXISTS (
        SELECT 1 FROM family_children fc
        JOIN family_units fu ON fu.id = fc.family_id AND fu.clan_id = $1
        WHERE fc.child_id = pa.descendant_id AND fu.husband_id = pa.ancestor_id
      )
  `, [clanId]);
  console.log('depth=1 rows NOT in family_children (ancestry-only):', onlyAncestry.rows[0].cnt);

  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
