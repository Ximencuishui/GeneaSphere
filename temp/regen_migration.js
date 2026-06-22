// 重新生成 migration.sql（UTF-8 编码）
const { execSync } = require('child_process');
const fs = require('fs');
require('dotenv').config({ path: require('path').join(__dirname, '..', 'packages', 'db', '.env') });

const url = process.env.DATABASE_URL;
const sql = execSync(
  `pnpm exec prisma migrate diff --from-url "${url}" --to-schema-datamodel packages/db/prisma/schema.prisma --script`,
  { encoding: 'utf8' }
);
fs.writeFileSync('packages/db/prisma/migrations/20260622000000_add_migration_map/migration.sql', sql, 'utf8');
console.log('Written', sql.length, 'bytes (UTF-8)');
