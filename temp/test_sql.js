// 测试单条语句
const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', 'packages', 'db', '.env') });

async function main() {
  const url = process.env.DATABASE_URL;
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // 测试1：单条 CREATE TYPE
  try {
    await client.query(`CREATE TYPE "MigrationReason" AS ENUM ('WAR', 'BUSINESS', 'OFFICIAL', 'RECLAMATION', 'FAMINE', 'OTHER')`);
    console.log('CREATE TYPE OK');
  } catch (e) {
    console.log('CREATE TYPE FAIL:', e.message);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
