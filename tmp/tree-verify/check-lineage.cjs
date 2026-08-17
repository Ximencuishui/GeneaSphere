// 检查 demo 族谱 personAncestry 的深度分布与主传承路径
const { Client } = require('pg');

const client = new Client({
  host: '127.0.0.1',
  port: 15432,
  user: 'geneauser',
  password: 'GeneaSphere2024!',
  database: 'geneasphere',
});

async function main() {
  await client.connect();
  // 1) demo clan
  const clan = await client.query(`SELECT id, slug, name FROM clans WHERE slug='zhuxi-demo'`);
  console.log('clan:', clan.rows[0]);
  const clanId = clan.rows[0].id;

  // 2) 根节点（无父亲的男性？找没有 depth=1 祖先的人）
  const root = await client.query(`
    SELECT p.id, p.full_name FROM persons p
    WHERE p.clan_id = $1 AND p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM person_ancestry pa
        WHERE pa.descendant_id = p.id AND pa.depth = 1 AND pa.ancestor_id != p.id
      )
    LIMIT 10
  `, [clanId]);
  console.log('roots (no parent):', root.rows);

  // 3) person_ancestry 中该族最大深度
  const depthStat = await client.query(`
    SELECT max(pa.depth) AS max_depth, count(*) AS total
    FROM person_ancestry pa
    JOIN persons p ON p.id = pa.ancestor_id
    WHERE p.clan_id = $1
  `, [clanId]);
  console.log('ancestry depth stat:', depthStat.rows[0]);

  // 4) depth=1 边总数（父子关系）
  const d1 = await client.query(`
    SELECT count(*) AS edges FROM person_ancestry pa
    JOIN persons p ON p.id = pa.descendant_id
    WHERE p.clan_id = $1 AND pa.depth = 1
  `, [clanId]);
  console.log('depth=1 edges:', d1.rows[0]);

  // 5) 主传承：以 root 3333 为例看其子孙最深节点与父链（与后端 findMainLineagePath 逻辑一致）
  // 先看 3333 / 3959 是谁
  const ids = await client.query(`SELECT id, full_name, generation FROM persons WHERE id IN (3333, 3959) OR id::text IN ('3333','3959') LIMIT 5`);
  console.log('ids 3333/3959:', ids.rows);

  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
