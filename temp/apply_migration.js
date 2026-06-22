// 数据库迁移执行脚本 - 使用 pg 客户端
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'packages', 'db', '.env') });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sqlPath = path.join(
    __dirname,
    '..',
    'packages',
    'db',
    'prisma',
    'migrations',
    '20260622000000_add_migration_map',
    'migration.sql'
  );

  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`Migration SQL length: ${sql.length}`);

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to PostgreSQL');

  try {
    await client.query(sql);
    console.log('Migration applied successfully.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }

  // 验证
  const verifyClient = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await verifyClient.connect();
  const r = await verifyClient.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('migration_events', 'migration_location_media', 'historical_dynasties') ORDER BY table_name`
  );
  console.log('Tables present:', r.rows.map((row) => row.table_name).join(', '));
  await verifyClient.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
