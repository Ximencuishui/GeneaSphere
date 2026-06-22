// Lineage Video 模块集成验证脚本
// 直接通过 Prisma Client + pg 验证数据库表结构、模型能力、关键业务逻辑
// 适用场景：服务端因预存 TS 错误无法启动时，使用本脚本做模块级降级验证

const { PrismaClient } = require('@prisma/client');
const { Client } = require('pg');
require('dotenv').config({
  path: require('path').join(__dirname, '..', 'packages', 'db', '.env'),
});

async function verify() {
  console.log('=== Lineage Video 模块集成验证 ===\n');

  const url = process.env.DATABASE_URL;
  const pg = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const checks = [];
  const fail = (msg) => { checks.push({ ok: false, msg }); console.log('❌', msg); };
  const pass = (msg) => { checks.push({ ok: true, msg }); console.log('✅', msg); };
  const info = (msg) => console.log('ℹ️ ', msg);

  // ==========================================
  // 1. 表存在性
  // ==========================================
  console.log('【1】数据库表结构验证');
  const tables = await pg.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN
      ('lineage_video_projects', 'lineage_video_material_links', 'persons', 'family_units', 'family_children', 'users', 'media_archives')
    ORDER BY table_name
  `);
  const expected = ['lineage_video_projects', 'lineage_video_material_links'];
  const actual = tables.rows.map((r) => r.table_name);
  const missing = expected.filter((t) => !actual.includes(t));
  if (missing.length === 0) {
    pass(`两张新增表均存在: ${expected.join(', ')}`);
  } else {
    fail(`缺失表: ${missing.join(', ')}`);
  }

  // ==========================================
  // 2. LineageVideoProject 字段完整性
  // ==========================================
  console.log('\n【2】LineageVideoProject 字段验证');
  const lpCols = await pg.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lineage_video_projects'
    ORDER BY ordinal_position
  `);
  const expectedFields = [
    'id', 'user_id', 'center_person_id', 'direction', 'up_generations',
    'down_generations', 'include_spouse', 'style', 'status', 'queue_position',
    'priority', 'paid_amount', 'video_url', 'duration_seconds', 'error_message',
    'created_at', 'completed_at'
  ];
  const actualFields = lpCols.rows.map((r) => r.column_name);
  const missingFields = expectedFields.filter((f) => !actualFields.includes(f));
  if (missingFields.length === 0) {
    pass(`LineageVideoProject 全部 17 个字段存在`);
  } else {
    fail(`LineageVideoProject 缺失字段: ${missingFields.join(', ')}`);
  }

  // 验证关键枚举/默认值
  const dirCol = lpCols.rows.find((r) => r.column_name === 'direction');
  if (dirCol && dirCol.data_type === 'USER-DEFINED') {
    pass(`direction 字段为枚举类型`);
  } else {
    fail(`direction 字段类型异常: ${dirCol?.data_type}`);
  }

  // ==========================================
  // 3. LineageVideoMaterialLink 字段
  // ==========================================
  console.log('\n【3】LineageVideoMaterialLink 字段验证');
  const lmlCols = await pg.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lineage_video_material_links'
  `);
  const expectedLmlFields = ['lineage_project_id', 'media_id', 'person_id', 'sequence_order'];
  const actualLmlFields = lmlCols.rows.map((r) => r.column_name);
  const missingLmlFields = expectedLmlFields.filter((f) => !actualLmlFields.includes(f));
  if (missingLmlFields.length === 0) {
    pass(`LineageVideoMaterialLink 全部 4 个字段存在`);
  } else {
    fail(`LineageVideoMaterialLink 缺失字段: ${missingLmlFields.join(', ')}`);
  }

  // ==========================================
  // 4. 索引验证
  // ==========================================
  console.log('\n【4】索引验证');
  const indexes = await pg.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'lineage_video_projects'
      AND indexname IN ('lineage_video_projects_user_id_status_idx', 'lineage_video_projects_status_priority_created_at_idx')
  `);
  if (indexes.rows.length === 2) {
    pass(`两个关键索引均存在: ${indexes.rows.map((r) => r.indexname).join(', ')}`);
  } else {
    fail(`索引缺失，期望 2 个，实际 ${indexes.rows.length} 个`);
  }

  // ==========================================
  // 5. LineageDirection 枚举值
  // ==========================================
  console.log('\n【5】LineageDirection 枚举值验证');
  const enumValues = await pg.query(`
    SELECT enumlabel FROM pg_enum
    WHERE enumtypid = (
      SELECT oid FROM pg_type WHERE typname = 'LineageDirection'
    )
    ORDER BY enumsortorder
  `);
  const expectedEnums = ['paternal', 'maternal', 'both'];
  const actualEnums = enumValues.rows.map((r) => r.enumlabel);
  if (JSON.stringify(actualEnums) === JSON.stringify(expectedEnums)) {
    pass(`LineageDirection 枚举值正确: ${actualEnums.join(', ')}`);
  } else {
    fail(`枚举值异常: ${actualEnums.join(', ')}`);
  }

  // ==========================================
  // 6. Prisma Client 模型可用性
  // ==========================================
  console.log('\n【6】Prisma Client 类型校验');
  const prisma = new PrismaClient();
  try {
    const lvpCount = await prisma.lineageVideoProject.count();
    pass(`Prisma lineageVideoProject 模型可用，当前 ${lvpCount} 条记录`);
    const lvmlCount = await prisma.lineageVideoMaterialLink.count();
    pass(`Prisma lineageVideoMaterialLink 模型可用，当前 ${lvmlCount} 条记录`);
  } catch (e) {
    fail(`Prisma 模型访问失败: ${e.message}`);
    await prisma.$disconnect();
    await pg.end();
    process.exit(1);
  }

  // ==========================================
  // 7. CRUD 端到端验证
  // ==========================================
  console.log('\n【7】LineageVideoProject CRUD 集成验证');

  // 取一个真实 clan_id / user_id / person_id 用于测试
  const personRow = await pg.query(`SELECT id, clan_id FROM persons LIMIT 1`);
  const userRow = await pg.query(`SELECT id FROM users LIMIT 1`);

  if (personRow.rows.length === 0 || userRow.rows.length === 0) {
    fail('无可用的 person/user 数据，跳过 CRUD 验证');
  } else {
    const personId = BigInt(personRow.rows[0].id);
    const clanId = BigInt(personRow.rows[0].clan_id);
    const userId = userRow.rows[0].id;

    // 7.1 CREATE
    let project;
    try {
      project = await prisma.lineageVideoProject.create({
        data: {
          user_id: userId,
          center_person_id: personId,
          direction: 'paternal',
          up_generations: 5,
          down_generations: 3,
          include_spouse: true,
          style: 'nostalgic',
          status: 'queued',
          queue_position: 1,
          priority: false,
        },
      });
      pass(`创建直系血缘项目成功: id=${project.id}, direction=${project.direction}`);
    } catch (e) {
      fail(`创建项目失败: ${e.message}`);
    }

    if (project) {
      // 7.2 READ
      const fetched = await prisma.lineageVideoProject.findUnique({
        where: { id: project.id },
      });
      if (fetched && fetched.direction === 'paternal' && fetched.up_generations === 5) {
        pass(`读取项目成功: direction=${fetched.direction}, up=${fetched.up_generations}, down=${fetched.down_generations}`);
      } else {
        fail(`读取项目数据异常`);
      }

      // 7.3 关联素材
      const mediaRow = await pg.query(`SELECT id FROM media_archives LIMIT 1`);
      if (mediaRow.rows.length > 0) {
        try {
          await prisma.lineageVideoMaterialLink.create({
            data: {
              lineage_project_id: project.id,
              media_id: BigInt(mediaRow.rows[0].id),
              person_id: personId,
              sequence_order: 1,
            },
          });
          pass(`创建素材关联成功`);

          const matCount = await prisma.lineageVideoMaterialLink.count({
            where: { lineage_project_id: project.id },
          });
          if (matCount === 1) {
            pass(`素材关联查询正确: ${matCount} 条`);
          } else {
            fail(`素材关联数量错误: ${matCount}`);
          }
        } catch (e) {
          fail(`素材关联失败: ${e.message}`);
        }
      }

      // 7.4 LIST（按用户）
      const list = await prisma.lineageVideoProject.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: 5,
      });
      if (list.find((p) => p.id === project.id)) {
        pass(`按用户列表查询成功，找到刚创建的项目`);
      } else {
        fail(`列表中未找到刚创建的项目`);
      }

      // 7.5 UPDATE 状态
      const updated = await prisma.lineageVideoProject.update({
        where: { id: project.id },
        data: {
          status: 'completed',
          video_url: 'https://example.com/test.mp4',
          duration_seconds: 120,
          completed_at: new Date(),
        },
      });
      if (updated.status === 'completed' && updated.video_url === 'https://example.com/test.mp4') {
        pass(`更新项目状态为 completed 成功`);
      } else {
        fail(`更新项目失败`);
      }

      // 7.6 DELETE（先删素材，再删项目）
      const deletedMats = await prisma.lineageVideoMaterialLink.deleteMany({
        where: { lineage_project_id: project.id },
      });
      await prisma.lineageVideoProject.delete({ where: { id: project.id } });
      const checkGone = await prisma.lineageVideoProject.findUnique({
        where: { id: project.id },
      });
      if (checkGone === null) {
        pass(`级联删除成功（素材 ${deletedMats.count} 条 + 项目）`);
      } else {
        fail(`删除失败，项目仍存在`);
      }
    }
  }

  // ==========================================
  // 8. 月度用量业务逻辑
  // ==========================================
  console.log('\n【8】月度用量业务逻辑验证');
  try {
    const userRow2 = await pg.query(`SELECT id FROM users LIMIT 1`);
    if (userRow2.rows.length === 0) {
      info('无可用用户，跳过月度用量验证');
    } else {
      const testUserId = userRow2.rows[0].id;
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthCount = await prisma.lineageVideoProject.count({
        where: {
          user_id: testUserId,
          created_at: { gte: startOfMonth },
          status: { not: 'failed' },
        },
      });
      pass(`月度用量统计可用: ${testUserId.substring(0, 8)}... 当月 ${monthCount} 条`);
    }
  } catch (e) {
    fail(`月度用量逻辑异常: ${e.message}`);
  }

  // ==========================================
  // 9. 反向关系字段验证（User.lineage_video_projects、Person.lineage_video_projects）
  // ==========================================
  console.log('\n【9】反向关系字段验证');
  const userCols = await pg.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'id' LIMIT 1
  `);
  if (userCols.rows.length === 1) {
    // 通过查询验证反向关系
    const sampleUser = await prisma.user.findFirst({
      include: { lineage_video_projects: { take: 1 } },
    });
    if (sampleUser && Array.isArray(sampleUser.lineage_video_projects)) {
      pass(`User.lineage_video_projects 反向关系可用`);
    } else {
      fail(`User 反向关系异常`);
    }
  }

  const samplePerson = await prisma.person.findFirst({
    include: {
      lineage_video_projects: { take: 1 },
      lineage_video_materials: { take: 1 },
    },
  });
  if (samplePerson && Array.isArray(samplePerson.lineage_video_projects) && Array.isArray(samplePerson.lineage_video_materials)) {
    pass(`Person.lineage_video_projects / lineage_video_materials 反向关系可用`);
  } else {
    fail(`Person 反向关系异常`);
  }

  await prisma.$disconnect();
  await pg.end();

  // ==========================================
  // 总结
  // ==========================================
  const total = checks.length;
  const passed = checks.filter((c) => c.ok).length;
  console.log(`\n========================================`);
  console.log(`  总结: ${passed}/${total} 通过`);
  console.log(`========================================`);

  if (passed === total) {
    console.log('\n🎉 直系血缘视频模块所有验收项通过！');
    process.exit(0);
  } else {
    console.log('\n⚠️ 存在未通过的验收项，请检查。');
    process.exit(1);
  }
}

verify().catch((e) => {
  console.error('验证异常:', e);
  process.exit(1);
});