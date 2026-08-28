// 一次性脚本：重置 zhuxi-demo（朱熹族谱）演示数据
// 用途：删除家族及其全部人物/家庭/祖先关系，下次 server 启动时由 demo-seed 重新生成。
// 与 apps/server/src/auth/demo-seed.service.ts:21 resetDemoClanData 同口径，
// 但额外删 clan 记录本身（让 server 重启时走 isFirstCreate=true 分支重新生成）。
//
// 设计：分批删除，每批 100 个 person，分多个事务跑（避免单事务 5 秒超时）。
// 删除顺序：先解所有引用本家族 person 的关联表，最后才删 person 本身。

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
  pathResolve(process.env.HOME || '', '.env'),
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
const BATCH = 100;

async function chunkedDelete(model, baseWhere, personIdList, batch = BATCH) {
  let total = 0;
  for (let i = 0; i < personIdList.length; i += batch) {
    const ids = personIdList.slice(i, i + batch);
    const where = {
      AND: [
        baseWhere,
        // 仅删引用本批 personId 的行，避免大表全扫
        { OR: baseWhere.personField ? [{ [baseWhere.personField]: { in: ids } }] : [] },
      ],
    };
    const r = await model.deleteMany({ where });
    total += r.count;
  }
  return total;
}

try {
  const demoClan = await prisma.clan.findFirst({
    where: { name: { contains: '朱熹' } },
    select: { id: true, slug: true, name: true },
  });
  if (!demoClan) {
    console.log('未找到 朱熹 演示家族，无需重置');
    process.exit(0);
  }
  console.log(`找到演示家族: id=${demoClan.id} slug=${demoClan.slug} name=${demoClan.name}`);

  const clanId = demoClan.id;
  const personIds = (
    await prisma.person.findMany({ where: { clan_id: clanId }, select: { id: true } })
  ).map((p) => p.id);
  console.log(`本家族共 ${personIds.length} 位族人，开始清理...`);

  // ── 第 1 步：按 clan_id 直接删（不走 personId 过滤，单事务即可）
  console.log('[1/8] familyChild by clan...');
  await prisma.familyChild.deleteMany({ where: { family: { clan_id: clanId } } });
  console.log('[2/8] familyUnit by clan...');
  await prisma.familyUnit.deleteMany({ where: { clan_id: clanId } });
  console.log('[3/8] mergeApplication by clan...');
  await prisma.mergeApplication.deleteMany({ where: { clan_id: clanId } });
  console.log('[4/8] clanMember by clan...');
  await prisma.clanMember.deleteMany({ where: { clan_id: clanId } });

  // ── 第 2 步：按 person_id 引用逐表分批清理（必须用 IN 避免漏孤儿）
  console.log(`[5/8] personAncestry (按 person 分 ${Math.ceil(personIds.length / BATCH)} 批)...`);
  let ancestryDel = 0;
  for (let i = 0; i < personIds.length; i += BATCH) {
    const ids = personIds.slice(i, i + BATCH);
    const r = await prisma.personAncestry.deleteMany({
      where: { OR: [{ ancestor_id: { in: ids } }, { descendant_id: { in: ids } }] },
    });
    ancestryDel += r.count;
  }
  console.log(`  → 删 ${ancestryDel} 条 ancestry`);

  console.log('[6/8] familyChild 孤儿 + familyUnit 孤儿 + familyBookProject + personBio...');
  let orphanChildDel = 0, orphanFamilyDel = 0, fbpDel = 0, bioDel = 0;
  for (let i = 0; i < personIds.length; i += BATCH) {
    const ids = personIds.slice(i, i + BATCH);
    const [c, f, p, b] = await Promise.all([
      prisma.familyChild.deleteMany({ where: { child_id: { in: ids } } }),
      prisma.familyUnit.deleteMany({
        where: { OR: [{ husband_id: { in: ids } }, { wife_id: { in: ids } }] },
      }),
      prisma.familyBookProject.deleteMany({ where: { start_person_id: { in: ids } } }),
      prisma.personBio.deleteMany({ where: { person_id: { in: ids } } }),
    ]);
    orphanChildDel += c.count;
    orphanFamilyDel += f.count;
    fbpDel += p.count;
    bioDel += b.count;
  }
  console.log(`  → 孤儿familyChild ${orphanChildDel}, 孤儿familyUnit ${orphanFamilyDel}, familyBookProject ${fbpDel}, personBio ${bioDel}`);

  // ── 第 3 步：最后才删 person 本身
  console.log(`[7/8] person (按 ${BATCH} 批量)...`);
  let personDel = 0;
  for (let i = 0; i < personIds.length; i += BATCH) {
    const ids = personIds.slice(i, i + BATCH);
    const r = await prisma.person.deleteMany({ where: { id: { in: ids } } });
    personDel += r.count;
  }
  console.log(`  → 删 ${personDel} 人`);

  // ── 第 4 步：删家族本身，让 server 重启时走 isFirstCreate=true 分支
  console.log('[8/8] 删除家族记录...');
  await prisma.clan.delete({ where: { id: clanId } });

  console.log(`\n✅ 已删除演示家族 ${demoClan.name} (id=${clanId})`);
  console.log('请重启 server（pnpm dev 或 pm2 restart）触发 demo-seed 重新生成。');
} catch (e) {
  console.error('❌ 错误:', e.message);
  console.error(e.stack);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}