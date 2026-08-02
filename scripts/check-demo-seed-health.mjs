// 一次性数据库健康检查脚本
// 检查项：
//   1. demo 家族 person / familyUnit / familyChild / personAncestry 数据完整性
//   2. 是否有孤儿 familyUnit（husband/wife 引用了 demo clan person）
//   3. self-record 完整性
//   4. unique 约束热点（重复的 husband_id+wife_id+marriage_order）
//
// 不写入数据，仅 SELECT。退出码 0=全部正常，1=有数据异常。

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = pathResolve(__dirname, '..');
const candidates = [
  process.env.DOTENV_PATH,
  pathResolve(ROOT, 'apps/server/.env'),
  pathResolve(process.cwd(), '.env'),
].filter(Boolean);
for (const p of candidates) {
  if (existsSync(p)) {
    dotenvConfig({ path: p });
    console.log(`[dotenv] 加载: ${p}`);
    break;
  }
}

const prisma = new PrismaClient();
const safe = (_, v) => (typeof v === 'bigint' ? v.toString() : v);
let exitCode = 0;

function check(label, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) exitCode = 1;
}

try {
  console.log('\n========== Demo Seed 数据健康检查 ==========\n');

  // 1) demo 家族
  const demoClan = await prisma.clan.findFirst({ where: { name: { contains: '朱熹' } } });
  check('demo 家族存在', !!demoClan, demoClan ? `id=${demoClan.id}` : '');
  if (!demoClan) {
    process.exit(1);
  }
  const clanId = demoClan.id;

  // 2) 人员统计
  const personCount = await prisma.person.count({ where: { clan_id: clanId, deleted_at: null } });
  check('demo 家族人员数 ≈ 1000', personCount >= 1000, `实际 ${personCount} 人`);

  // 3) familyUnit 统计
  const familyCount = await prisma.familyUnit.count({ where: { clan_id: clanId } });
  check('familyUnit 数 > 0', familyCount > 0, `实际 ${familyCount} 个`);

  // 4) familyChild 统计
  const childCount = await prisma.familyChild.count({ where: { family: { clan_id: clanId } } });
  check('familyChild 数 > 0', childCount > 0, `实际 ${childCount} 条`);

  // 5) personAncestry 深度分布
  const depth0 = await prisma.personAncestry.count({ where: { depth: 0 } });
  const depth1 = await prisma.personAncestry.count({ where: { depth: 1 } });
  const total = await prisma.personAncestry.count();
  check('self-record (depth=0) == person 数', depth0 === personCount, `self-record ${depth0} vs person ${personCount}`);
  check('depth=1 关系数 > 0', depth1 > 0, `实际 ${depth1} 条`);
  console.log(`    闭包表总数: ${total} 条 (depth=0: ${depth0}, depth=1: ${depth1}, 其他: ${total - depth0 - depth1})`);

  // 6) 孤儿 familyUnit 检测（clan_id != demo clan 但 husband/wife 引用 demo clan person）
  const personIds = (await prisma.person.findMany({
    where: { clan_id: clanId },
    select: { id: true },
  })).map((p) => p.id);

  const orphanFamilies = await prisma.familyUnit.count({
    where: {
      NOT: { clan_id: clanId },
      OR: [
        { husband_id: { in: personIds } },
        { wife_id: { in: personIds } },
      ],
    },
  });
  check('孤儿 familyUnit 数 == 0', orphanFamilies === 0, `发现 ${orphanFamilies} 条`);

  // 7) 重复的 husband+wife+marriage_order 检测
  const allFamilies = await prisma.familyUnit.findMany({
    select: { husband_id: true, wife_id: true, marriage_order: true },
  });
  const seen = new Map();
  const dupes = [];
  for (const f of allFamilies) {
    const k = `${f.husband_id}-${f.wife_id}-${f.marriage_order}`;
    if (seen.has(k)) dupes.push(k);
    else seen.set(k, 1);
  }
  check('无重复 (husband, wife, marriage_order)', dupes.length === 0, `发现 ${dupes.length} 组重复`);

  // 8) 祖先可达性（每个 person 都应至少有一条 self-record）
  const personsWithoutSelf = await prisma.person.count({
    where: {
      clan_id: clanId,
      NOT: {
        descendant_links: { some: { depth: 0 } },
      },
    },
  });
  check('每个 person 都有 self-record', personsWithoutSelf === 0, `${personsWithoutSelf} 人缺失`);

  console.log('\n========================================');
  console.log(exitCode === 0 ? '✅ 全部检查通过' : '❌ 有数据异常，请排查');
  console.log('========================================\n');
} catch (e) {
  console.error('❌ 错误:', e.message);
  console.error(e.stack);
  exitCode = 1;
} finally {
  await prisma.$disconnect();
  process.exit(exitCode);
}