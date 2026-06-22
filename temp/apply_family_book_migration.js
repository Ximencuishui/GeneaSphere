// 家庭图册数据库迁移执行脚本
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
    '20260622100000_add_family_book',
    'migration.sql',
  );

  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`Migration SQL length: ${sql.length} chars`);

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

  // 验证表与字段
  const verifyClient = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await verifyClient.connect();
  const r = await verifyClient.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('family_book_projects', 'family_book_pages')
    ORDER BY table_name
  `);
  console.log('Tables present:', r.rows.map((row) => row.table_name).join(', '));

  const cols = await verifyClient.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family_book_projects'
    ORDER BY column_name
  `);
  console.log('family_book_projects columns:', cols.rows.map((r) => r.column_name).join(', '));

  const cols2 = await verifyClient.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family_book_pages'
    ORDER BY column_name
  `);
  console.log('family_book_pages columns:', cols2.rows.map((r) => r.column_name).join(', '));

  const printCols = await verifyClient.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'print_orders'
      AND column_name = 'family_book_project_id'
  `);
  console.log('print_orders.family_book_project_id:', printCols.rows.length === 1 ? '已添加' : '缺失');

  await verifyClient.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
