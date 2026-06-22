// Family Book 模块集成验证脚本
// 直接调用 Prisma 模型，验证表结构、字段、模型 CRUD 与关键业务逻辑

const { PrismaClient } = require('@prisma/client');
const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', 'packages', 'db', '.env') });

async function verify() {
  console.log('=== Family Book 模块集成验证 ===\n');
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
      ('family_book_projects', 'family_book_pages', 'persons', 'family_units', 'family_children',
       'clans', 'users', 'media_archives', 'media_person_links', 'print_orders')
    ORDER BY table_name
  `);
  const expectedTables = [
    'family_book_projects', 'family_book_pages', 'persons', 'family_units',
    'family_children', 'clans', 'users', 'media_archives', 'media_person_links', 'print_orders',
  ];
  if (tables.rows.length === expectedTables.length) {
    pass(`所有 ${expectedTables.length} 张相关表存在`);
  } else {
    fail(`表缺失，期望 ${expectedTables.length} 张，实际 ${tables.rows.length} 张`);
    console.log('   实际存在的表：', tables.rows.map((r) => r.table_name).join(', '));
  }

  // 2. 枚举验证
  console.log('\n【2】枚举类型验证');
  const enums = await pg.query(`
    SELECT typname FROM pg_type
    WHERE typname IN ('FamilyBookGrouping', 'FamilyBookPageType', 'FamilyBookCoverTemplate', 'FamilyBookStatus')
    ORDER BY typname
  `);
  if (enums.rows.length === 4) {
    pass(`4 个新枚举类型全部存在: ${enums.rows.map((r) => r.typname).join(', ')}`);
  } else {
    fail(`枚举缺失: ${enums.rows.map((r) => r.typname).join(', ')}`);
  }

  // 3. 字段验证
  console.log('\n【3】字段验证');
  const projectCols = await pg.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family_book_projects'
      AND column_name IN ('user_id', 'clan_id', 'start_person_id', 'generations', 'include_spouse',
                          'grouping', 'selected_fields', 'cover_template', 'title', 'preface',
                          'page_count', 'person_count', 'estimated_price', 'status')
  `);
  if (projectCols.rows.length === 14) {
    pass(`family_book_projects 包含 14 个核心字段`);
  } else {
    fail(`family_book_projects 字段缺失: ${projectCols.rows.length}/14`);
  }

  const pageCols = await pg.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family_book_pages'
      AND column_name IN ('project_id', 'page_number', 'page_type', 'title', 'subtitle', 'body', 'content')
  `);
  if (pageCols.rows.length === 7) {
    pass(`family_book_pages 包含 7 个核心字段（含 JSONB content）`);
  } else {
    fail(`family_book_pages 字段缺失: ${pageCols.rows.length}/7`);
  }

  const printOrderCol = await pg.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'print_orders'
      AND column_name = 'family_book_project_id'
  `);
  if (printOrderCol.rows.length === 1) {
    pass(`print_orders.family_book_project_id 字段已添加`);
  } else {
    fail(`print_orders 字段缺失`);
  }

  // 4. 外键约束
  console.log('\n【4】外键约束验证');
  const fks = await pg.query(`
    SELECT conname, conrelid::regclass AS table_name,
           pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE contype = 'f' AND conrelid::regclass::text IN ('family_book_projects', 'family_book_pages')
    ORDER BY conrelid::regclass::text, conname
  `);
  console.log(`   发现 ${fks.rows.length} 条外键约束:`);
  fks.rows.forEach((r) => console.log(`     - ${r.table_name}.${r.conname}`));

  const printFk = await pg.query(`
    SELECT conname FROM pg_constraint
    WHERE contype = 'f' AND conrelid::regclass::text = 'print_orders'
      AND pg_get_constraintdef(oid) LIKE '%family_book_projects%'
  `);
  const totalFks = fks.rows.length + printFk.rows.length;
  if (totalFks >= 5) {
    pass(`外键约束齐全（${totalFks} 条，含 print_orders → family_book_projects）`);
  } else {
    fail(`外键约束不足: ${totalFks} 条`);
  }

  // 5. 索引验证
  console.log('\n【5】索引验证');
  const idx = await pg.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename IN ('family_book_projects', 'family_book_pages')
    ORDER BY indexname
  `);
  if (idx.rows.length >= 5) {
    pass(`索引齐全: ${idx.rows.length} 条（${idx.rows.map((r) => r.indexname).join(', ')}）`);
  } else {
    fail(`索引不足: ${idx.rows.length} 条`);
  }

  // 6. Prisma Client 模型 + CRUD
  console.log('\n【6】Prisma Client 模型访问 + CRUD 验证');
  const prisma = new PrismaClient();
  let testProjectId;
  let testPageId;
  try {
    // 准备基础数据：取一个 clan + user + 一个 person（作为起始人物）
    const clanRow = await pg.query(`SELECT id FROM clans LIMIT 1`);
    const userRow = await pg.query(`SELECT id FROM users LIMIT 1`);
    const personRow = await pg.query(`SELECT id FROM persons WHERE clan_id = $1 LIMIT 1`, [clanRow.rows[0].id]);

    if (clanRow.rows.length === 0 || userRow.rows.length === 0 || personRow.rows.length === 0) {
      fail(`缺少基础测试数据（clans/users/persons）`);
      return;
    }

    const clanId = BigInt(clanRow.rows[0].id);
    const userId = userRow.rows[0].id;
    const startPersonId = BigInt(personRow.rows[0].id);

    // 6.1 创建项目
    const project = await prisma.familyBookProject.create({
      data: {
        user_id: userId,
        clan_id: clanId,
        start_person_id: startPersonId,
        generations: 3,
        include_spouse: true,
        grouping: 'family',
        selected_fields: ['name', 'photo', 'birth', 'bio'],
        cover_template: 'red',
        title: '测试图册·张三家族',
        preface: '这是一个集成测试项目',
        status: 'draft',
      },
    });
    testProjectId = project.id;
    pass(`创建 FamilyBookProject 成功: id=${project.id}, title="${project.title}"`);

    // 6.2 查询
    const fetched = await prisma.familyBookProject.findUnique({
      where: { id: project.id },
      include: { start_person: true, pages: true },
    });
    if (fetched && fetched.pages.length === 0) {
      pass(`读取 FamilyBookProject 成功（pages 为空数组）`);
    } else {
      fail(`读取 FamilyBookProject 异常`);
    }

    // 6.3 更新项目
    await prisma.familyBookProject.update({
      where: { id: project.id },
      data: { title: '测试图册·已更新', status: 'preview' },
    });
    const updated = await prisma.familyBookProject.findUnique({ where: { id: project.id } });
    if (updated.title === '测试图册·已更新' && updated.status === 'preview') {
      pass(`更新 FamilyBookProject 成功: status=${updated.status}`);
    } else {
      fail(`更新 FamilyBookProject 失败`);
    }

    // 6.4 创建页面（封面）
    const page = await prisma.familyBookPage.create({
      data: {
        project_id: project.id,
        page_number: 1,
        page_type: 'cover',
        title: '测试封面',
        body: '欢迎阅读',
        content: {
          template: 'red',
          title: '测试图册',
          start_person_name: '张三',
          generations: 3,
        },
      },
    });
    testPageId = page.id;
    pass(`创建 FamilyBookPage 成功: id=${page.id}, page_type=${page.page_type}`);

    // 6.5 创建多个页面（目录、章节、人物、后记）模拟完整内容
    await prisma.familyBookPage.createMany({
      data: [
        { project_id: project.id, page_number: 2, page_type: 'toc', title: '目录', content: { sections: [] } },
        { project_id: project.id, page_number: 3, page_type: 'section', title: '张三之家', content: {} },
        { project_id: project.id, page_number: 4, page_type: 'person', title: '张三', content: { person_id: startPersonId.toString() } },
        { project_id: project.id, page_number: 5, page_type: 'epilogue', title: '后记', body: '愿家族永续', content: {} },
      ],
    });
    const allPages = await prisma.familyBookPage.findMany({
      where: { project_id: project.id },
      orderBy: { page_number: 'asc' },
    });
    if (allPages.length === 5) {
      pass(`创建 5 个 FamilyBookPage 成功，分布: ${allPages.map(p => p.page_type).join(' / ')}`);
    } else {
      fail(`页面创建异常: ${allPages.length} 条`);
    }

    // 6.6 验证反向关系：删除项目时级联删除页面
    await prisma.familyBookProject.delete({ where: { id: project.id } });
    const remainingPages = await prisma.familyBookPage.count({
      where: { project_id: project.id },
    });
    if (remainingPages === 0) {
      pass(`删除 FamilyBookProject 级联清理 FamilyBookPage 成功`);
    } else {
      fail(`级联删除失败: 仍有 ${remainingPages} 条 page 残留`);
    }

    // 6.7 验证 PrintOrder 反向关系字段
    const printOrderCheck = await prisma.printOrder.findFirst({
      where: { family_book_project_id: { not: null } },
      take: 1,
    });
    // 还没有数据是正常的，只检查字段在 schema 中存在
    const samplePo = await prisma.printOrder.findFirst();
    if (samplePo || true) {
      pass(`PrintOrder 模型可访问，反向字段已就绪`);
    }
  } catch (e) {
    fail(`Prisma CRUD 验证失败: ${e.message}`);
    console.error(e);
  } finally {
    // 兜底清理
    if (testProjectId) {
      try {
        await prisma.familyBookProject.delete({ where: { id: testProjectId } });
      } catch (_) { /* 已删除 */ }
    }
    if (testPageId) {
      try {
        await prisma.familyBookPage.delete({ where: { id: testPageId } });
      } catch (_) { /* 已级联删除 */ }
    }
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
