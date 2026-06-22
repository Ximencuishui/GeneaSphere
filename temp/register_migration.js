// 注册迁移到 _prisma_migrations 表（PowerShell 非交互模式下用 migrate deploy 失败，手动注册）
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', 'packages', 'db', '.env') });

async function main() {
  const url = process.env.DATABASE_URL;
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const migrationName = '20260622000000_add_migration_map';
  const sqlPath = path.join(__dirname, '..', 'packages', 'db', 'prisma', 'migrations', migrationName, 'migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');

  // 检查是否已经注册
  const exists = await client.query(`SELECT id FROM _prisma_migrations WHERE migration_name = $1`, [migrationName]);
  if (exists.rows.length > 0) {
    console.log(`Migration ${migrationName} already registered.`);
    await client.end();
    return;
  }

  // 插入迁移记录
  await client.query(
    `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (gen_random_uuid()::text, $1, NOW(), $2, NULL, NULL, NOW(), $3)`,
    [checksum, migrationName, 1]
  );
  console.log(`Registered migration: ${migrationName}`);
  console.log(`Checksum: ${checksum}`);

  // 验证
  const r = await client.query(`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 3`);
  console.log('Latest migrations:');
  for (const row of r.rows) {
    console.log(`  ${row.migration_name} @ ${row.finished_at?.toISOString?.() || row.finished_at}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
