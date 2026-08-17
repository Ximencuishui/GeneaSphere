#!/usr/bin/env node
/**
 * 闭包表（person_ancestry）重建脚本
 *
 * 背景：person_ancestry 是派生索引（闭包表），权威父子关系存储在
 * family_children + family_units（husband_id 为父）。任何写入端漏同步都会让
 * 闭包表漂移（缺链/多链），导致树结构、主传承路径、血缘校验结果不一致。
 *
 * 本脚本以 family_children 为唯一权威源，为指定家族全量重建 person_ancestry：
 *   1. self-record（depth=0）
 *   2. 父链（depth=1，family_children.husband_id → child）
 *   3. 祖先链展开（depth≥2，闭包 BFS）
 * 不写 mother 链（树结构、主脉、血缘校验均以父系为准；吊线图的"各妻分支"
 * 由 child_links.mother_id 直接读 family_units.wife_id，与闭包表无关）。
 *
 * 用法：
 *   node scripts/rebuild-ancestry.mjs --clan 4          # 重建家族 4
 *   node scripts/rebuild-ancestry.mjs --all             # 重建所有家族
 *   node scripts/rebuild-ancestry.mjs --clan 4 --dry    # 仅统计不写入
 */
import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = pathResolve(__dirname, '..');

const args = process.argv.slice(2);
const clanArg = args.includes('--all') ? null : (args[args.indexOf('--clan') + 1] ?? null);
const DRY = args.includes('--dry');
if (!clanArg && !args.includes('--all')) {
  console.error('用法: node scripts/rebuild-ancestry.mjs --clan <id> | --all [--dry]');
  process.exit(1);
}

for (const p of [pathResolve(ROOT, 'apps/server/.env'), pathResolve(ROOT, '.env')]) {
  if (existsSync(p)) { dotenvConfig({ path: p }); break; }
}

const prisma = new PrismaClient();

/** 重建单个家族闭包表（事务内） */
async function rebuildClan(tx, clanId) {
  // 1) 收集族内 person
  const persons = await tx.person.findMany({
    where: { clan_id: clanId, deleted_at: null },
    select: { id: true },
  });
  const personIds = persons.map((p) => p.id);
  if (personIds.length === 0) return { persons: 0, rows: 0 };

  // 2) 清空该族的闭包表（ancestor 或 descendant 任一属族内）
  await tx.personAncestry.deleteMany({
    where: { OR: [{ ancestor_id: { in: personIds } }, { descendant_id: { in: personIds } }] },
  });

  // 3) 权威父链：family_children → family_units.husband_id
  const links = await tx.familyChild.findMany({
    where: { family: { clan_id: clanId } },
    select: { child_id: true, family: { select: { husband_id: true } } },
  });
  const childrenOf = new Map(); // fatherId(string) -> [childIds(string)]
  for (const l of links) {
    if (!l.family.husband_id) continue;
    const f = l.family.husband_id.toString();
    if (!childrenOf.has(f)) childrenOf.set(f, []);
    if (!childrenOf.get(f).includes(l.child_id.toString())) childrenOf.get(f).push(l.child_id.toString());
  }

  // 4) 建闭包：self-record + 每个祖先沿父链 BFS 展开
  const rows = [];
  const seen = new Set();
  const push = (a, d, dep) => {
    const k = `${a}:${d}`;
    if (seen.has(k)) return;
    seen.add(k);
    rows.push({ ancestor_id: a, descendant_id: d, depth: dep });
  };
  for (const pid of personIds) push(pid, pid, 0);
  const collectDescendants = (a) => {
    const stack = [[a, 0]];
    while (stack.length) {
      const [cur, d] = stack.pop();
      const kids = childrenOf.get(cur) || [];
      for (const kid of kids) {
        push(a, kid, d + 1);
        stack.push([kid, d + 1]);
      }
    }
  };
  for (const pid of personIds) collectDescendants(pid.toString());

  // 5) 批量写入
  const BATCH = 2000;
  for (let i = 0; i < rows.length; i += BATCH) {
    await tx.personAncestry.createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
  }
  return { persons: personIds.length, rows: rows.length };
}

async function main() {
  const clanIds = clanArg
    ? [BigInt(clanArg)]
    : (await prisma.clan.findMany({ select: { id: true } })).map((c) => c.id);

  for (const clanId of clanIds) {
    const before = await prisma.personAncestry.count({
      where: { OR: [{ ancestor: { clan_id: clanId } }, { descendant: { clan_id: clanId } }] },
    });
    if (DRY) {
      // dry 模式：只统计权威源规模
      const links = await prisma.familyChild.count({ where: { family: { clan_id: clanId } } });
      const persons = await prisma.person.count({ where: { clan_id: clanId, deleted_at: null } });
      console.log(`[dry] clan ${clanId}: persons=${persons}, family_children=${links}, current_ancestry=${before}`);
      continue;
    }
    const result = await prisma.$transaction((tx) => rebuildClan(tx, clanId));
    console.log(`[ok] clan ${clanId}: persons=${result.persons}, rebuilt_ancestry_rows=${result.rows} (was ${before})`);
  }
}

main()
  .catch((e) => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
