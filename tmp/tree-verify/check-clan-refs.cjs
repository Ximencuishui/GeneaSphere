// 检查 clan 4 相关的所有表中哪些有数据（决定重建清理范围）
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});

const tables = [
  ['clan_members', 'clan_id'],
  ['family_units', 'clan_id'],
  ['family_children', null], // 通过 family_id -> family_units
  ['person_ancestry', null], // 通过 person id
  ['persons', 'clan_id'],
  ['person_user_links', null], // 通过 person_id
  ['media_person_links', null],
  ['media_archives', 'clan_id'],
  ['xipai', 'clan_id'],
  ['migration_events', 'clan_id'],
  ['migration_location_media', 'clan_id'],
  ['family_events', 'clan_id'],
  ['clan_announcements', 'clan_id'],
  ['clan_albums', 'clan_id'],
  ['privacy_settings', 'clan_id'],
  ['family_book_projects', 'clan_id'],
  ['clan_tool_usage_logs', 'clan_id'],
  ['genealogy_documents', 'clan_id'],
  ['clan_migration_videos', 'clan_id'],
  ['clan_event_videos', 'clan_id'],
  ['book_volumes', 'clan_id'],
  ['share_links', 'clan_id'],
  ['merge_applications', 'clan_id'],
  ['print_orders', 'clan_id'],
  ['content_reports', 'clan_id'],
];

async function main() {
  await client.connect();
  for (const [tbl, col] of tables) {
    try {
      if (col) {
        const r = await client.query(`SELECT count(*) AS c FROM ${tbl} WHERE ${col} = 4`);
        console.log(`${tbl}.${col} = 4 → ${r.rows[0].c}`);
      } else {
        let r;
        if (tbl === 'family_children') {
          r = await client.query(`SELECT count(*) AS c FROM family_children fc JOIN family_units fu ON fu.id = fc.family_id WHERE fu.clan_id = 4`);
        } else if (tbl === 'person_ancestry') {
          r = await client.query(`SELECT count(*) AS c FROM person_ancestry pa JOIN persons p ON p.id = pa.ancestor_id OR p.id = pa.descendant_id WHERE p.clan_id = 4`);
        } else if (tbl === 'person_user_links') {
          r = await client.query(`SELECT count(*) AS c FROM person_user_links pul JOIN persons p ON p.id = pul.person_id WHERE p.clan_id = 4`);
        } else if (tbl === 'media_person_links') {
          r = await client.query(`SELECT count(*) AS c FROM media_person_links mpl JOIN persons p ON p.id = mpl.person_id WHERE p.clan_id = 4`);
        }
        console.log(`${tbl} (via persons) → ${r.rows[0].c}`);
      }
    } catch (e) {
      console.log(`${tbl} → ERR: ${e.message.slice(0, 60)}`);
    }
  }
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
