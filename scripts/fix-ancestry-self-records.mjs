// scripts/fix-ancestry-self-records.mjs
// 作用：扫描所有 person，为缺失 self-record 的 person 自动补上
//       (ancestor_id = descendant_id = person.id, depth = 0)
//
// 适用场景：
//   1. 种子脚本/数据导入遗漏 self-record
//   2. TreeService.getSubTree 报 "Root person with id X not found" 但 person 表中存在
//   3. 闭包表因任何原因被部分清空
//
// 用法：
//   node scripts/fix-ancestry-self-records.mjs            # 直接执行修复
//   node scripts/fix-ancestry-self-records.mjs --dry-run  # 只检测不写入
//
// 注意：使用根工作区目录的 .env (apps/server/.env) 作为数据库连接

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

// 向上查找 .env（依次检查当前目录 / 父目录 / apps/server/）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = pathResolve(__dirname, '..'); // 项目根目录
const candidates = [
  process.env.DOTENV_PATH,
  pathResolve(ROOT, 'apps/server/.env'),
  pathResolve(ROOT, 'apps/web/.env.production'),
  pathResolve(ROOT, 'packages/db/.env'),
  pathResolve(process.cwd(), '.env'),
  pathResolve(process.cwd(), '../.env'),
].filter(Boolean);
for (const p of candidates) {
  if (existsSync(p)) {
    dotenvConfig({ path: p });
    console.log(`[dotenv] 加载: ${p}`);
    break;
  }
}

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

const safe = (_, v) => (typeof v === 'bigint' ? v.toString() : v);

function fmt(n) {
  return n.toString().padStart(5);
}

try {
  console.log('==========================================');
  console.log(`  闭包表 self-record 自愈脚本${isDryRun ? '（DRY-RUN）' : ''}`);
  console.log('==========================================\n');

  // 1) 拉取所有 person
  const allPersons = await prisma.person.findMany({
    select: { id: true, clan_id: true, full_name: true },
  });
  console.log(`总 person 数: ${fmt(allPersons.length)}`);

  // 2) 拉取所有 self-record（depth = 0）
  const allSelfRecords = await prisma.personAncestry.findMany({
    where: { depth: 0 },
    select: { descendant_id: true },
  });
  const hasSelfSet = new Set(allSelfRecords.map((r) => r.descendant_id.toString()));
  console.log(`现有 self-record 数: ${fmt(allSelfRecords.length)}`);

  // 3) 找出缺失 self-record 的 person
  const missing = allPersons.filter((p) => !hasSelfSet.has(p.id.toString()));
  console.log(`缺失 self-record 数: ${fmt(missing.length)}\n`);

  if (missing.length === 0) {
    console.log('✅ 所有 person 都有 self-record，无需修复。');
    process.exit(0);
  }

  // 4) 按 clan 分组
  const byClan = new Map();
  for (const p of missing) {
    const k = p.clan_id.toString();
    if (!byClan.has(k)) byClan.set(k, []);
    byClan.get(k).push(p);
  }

  console.log('按 clan 分布：');
  for (const [clanId, persons] of byClan) {
    console.log(`  clan ${clanId}: ${persons.length} 人`);
  }
  console.log('');

  // 5) 预览前 10 个
  console.log('示例（最多前 10 个）：');
  for (const p of missing.slice(0, 10)) {
    console.log(`  person ${p.id.toString()} (clan=${p.clan_id.toString()}, name=${p.full_name})`);
  }
  console.log('');

  if (isDryRun) {
    console.log('🔍 DRY-RUN 模式，未写入数据库。');
    process.exit(0);
  }

  // 6) 批量插入（使用 createMany + skipDuplicates 防止并发竞态）
  const records = missing.map((p) => ({
    ancestor_id: p.id,
    descendant_id: p.id,
    depth: 0,
  }));

  // 分批写入（每批 1000 条，避免大 SQL）
  const BATCH = 1000;
  let written = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const result = await prisma.personAncestry.createMany({
      data: batch,
      skipDuplicates: true,
    });
    written += result.count;
    console.log(
      `  写入进度: ${Math.min(i + BATCH, records.length)}/${records.length} (新增 ${result.count})`,
    );
  }

  console.log(`\n✅ 修复完成，共写入 ${written} 条 self-record。`);

  // 7) 验证
  const afterCount = await prisma.personAncestry.count({ where: { depth: 0 } });
  console.log(`修复后 self-record 总数: ${afterCount}（应为 ${allPersons.length}）`);
  if (afterCount === allPersons.length) {
    console.log('✅ 验证通过：所有 person 都已拥有 self-record。');
  } else {
    console.log(`⚠️  仍有 ${allPersons.length - afterCount} 人缺失，请检查。`);
  }
} catch (e) {
  console.error('❌ 错误:', e.message);
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
