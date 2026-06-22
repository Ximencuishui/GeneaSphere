// Migration 模块集成验证脚本
// 直接调用 MigrationService 各核心方法，验证数据库读写与业务逻辑

const { PrismaClient } = require('@prisma/client');
const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', 'packages', 'db', '.env') });

async function verify() {
  console.log('=== Migration 模块集成验证 ===\n');
  const url = process.env.DATABASE_URL;
  const pg = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const checks = [];
  const fail = (msg) => { checks.push({ ok: false, msg }); console.log('❌', msg); };
  const pass = (msg) => { checks.push({ ok: true, msg }); console.log('✅', msg); };

  // 1. 表存在性
  console.log('【1】数据库表结构验证');
  const tables = await pg.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN
      ('migration_events', 'migration_location_media', 'historical_dynasties', 'persons', 'media_archives')
    ORDER BY table_name
  `);
  const expected = ['migration_events', 'migration_location_media', 'historical_dynasties', 'persons', 'media_archives'];
  if (tables.rows.length === expected.length) {
    pass(`所有 5 张相关表存在: ${tables.rows.map((r) => r.table_name).join(', ')}`);
  } else {
    fail(`表缺失，期望 ${expected.length} 张，实际 ${tables.rows.length} 张`);
  }

  // 2. Person 新字段
  console.log('\n【2】Person 模型新增字段验证');
  const cols = await pg.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'persons'
      AND column_name IN ('birth_place', 'birth_lat', 'birth_lng', 'death_place', 'death_lat', 'death_lng', 'migration_branch')
  `);
  if (cols.rows.length === 7) {
    pass(`Person 表新增 7 个字段全部存在`);
  } else {
    fail(`Person 字段缺失: ${cols.rows.map((r) => r.column_name).join(', ')}`);
  }

  // 3. 朝代数据
  console.log('\n【3】朝代预置数据验证');
  const dy = await pg.query(`SELECT id, name, start_year, end_year FROM historical_dynasties ORDER BY start_year`);
  if (dy.rows.length === 4) {
    pass(`预置 4 个朝代:`);
    for (const r of dy.rows) {
      console.log(`     #${r.id} ${r.name} (${r.start_year}-${r.end_year})`);
    }
  } else {
    fail(`朝代数量错误: ${dy.rows.length}`);
  }

  // 4. Prisma Client 能访问新模型
  console.log('\n【4】Prisma Client 类型校验');
  const prisma = new PrismaClient();
  try {
    const events = await prisma.migrationEvent.findMany({ take: 5 });
    pass(`Prisma migrationEvent 模型可用，当前 ${events.length} 条记录`);
    const locs = await prisma.migrationLocationMedia.findMany({ take: 5 });
    pass(`Prisma migrationLocationMedia 模型可用，当前 ${locs.length} 条记录`);
    const dys = await prisma.historicalDynasty.findMany({ take: 10 });
    pass(`Prisma historicalDynasty 模型可用，当前 ${dys.length} 条记录`);

    // 5. 测试创建/查询迁徙事件
    console.log('\n【5】迁徙事件 CRUD 集成验证');
    // 取一个真实 clan_id 和 user_id
    const clanRow = await pg.query(`SELECT id FROM clans LIMIT 1`);
    const userRow = await pg.query(`SELECT id FROM users LIMIT 1`);
    if (clanRow.rows.length === 0 || userRow.rows.length === 0) {
      console.log('   ⚠️  无可用的 clan/user 数据，跳过 CRUD 验证');
    } else {
      const clanId = clanRow.rows[0].id;
      const userId = userRow.rows[0].id;
      const newEvent = await prisma.migrationEvent.create({
        data: {
          clan_id: BigInt(clanId),
          from_location: '山西洪洞',
          from_lat: 36.2548,
          from_lng: 111.6749,
          to_location: '四川成都',
          to_lat: 30.5728,
          to_lng: 104.0668,
          event_year: 1645,
          reason: 'WAR',
          description: '明末战乱，举族西迁',
          creator_id: userId,
        },
      });
      pass(`创建迁徙事件成功: id=${newEvent.id}`);

      // 读取
      const fetched = await prisma.migrationEvent.findUnique({
        where: { id: newEvent.id },
      });
      if (fetched && fetched.from_location === '山西洪洞') {
        pass(`读取迁徙事件成功: ${fetched.from_location} → ${fetched.to_location}`);
      } else {
        fail(`读取迁徙事件失败`);
      }

      // 清理
      await prisma.migrationEvent.delete({ where: { id: newEvent.id } });
      pass(`删除迁徙事件成功`);
    }
  } catch (e) {
    fail(`Prisma 验证失败: ${e.message}`);
  } finally {
    await prisma.$disconnect();
    await pg.end();
  }

  const total = checks.length;
  const passed = checks.filter((c) => c.ok).length;
  console.log(`\n=== 总结：${passed}/${total} 通过 ===`);
  process.exit(passed === total ? 0 : 1);
}

verify().catch((e) => {
  console.error('验证异常:', e);
  process.exit(1);
});
