// scripts/backfill-family-consistency.mjs
// 双写一致性回填脚本（《册谱数据模型决策清单》§H2）
//
// 背景：历史存在两条互不同步的写入路径——
//   - tree.service.createPerson：只写 PersonAncestry，不写 FamilyChild；
//   - family-relation.service.addChild：只写 FamilyUnit/FamilyChild，不写 PersonAncestry。
// 本脚本把两张表的"亲子关系集合"拉齐，是"树谱 ↔ 册谱 数据完全一致"验收项的硬前提。
//
// 阶段：
//   1) 有血缘边（ancestry depth=1）但无 FamilyChild → 补 FamilyChild
//      （优先复用父母已有家庭，无则新建单亲家庭；birth_order 取该家庭 max+1）
//   2) 有 FamilyChild 但缺对应血缘边 → 补 PersonAncestry
//      （self-record + 该父/母的祖先链 depth+1；仅处理同族父母）
//   3) 所有 person 的 self-record（depth=0）校验补齐
//
// 用法：
//   node scripts/backfill-family-consistency.mjs            # 执行修复
//   node scripts/backfill-family-consistency.mjs --dry-run  # 只检测不写入
//
// 注意：使用项目 .env（apps/server/.env 优先）作为数据库连接；脚本为幂等设计，可重复执行。

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

// ---------- dotenv 加载（与 fix-ancestry-self-records.mjs 一致） ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = pathResolve(__dirname, '..');
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
const BATCH = 1000;

function fmt(n) {
  return n.toString().padStart(5);
}

async function main() {
  console.log('==========================================');
  console.log(`  亲子关系双写一致性回填${isDryRun ? '（DRY-RUN）' : ''}`);
  console.log('==========================================\n');

  // ---------- 1) 载入基础数据 ----------
  const persons = await prisma.person.findMany({
    select: { id: true, clan_id: true, gender: true },
  });
  const personGender = new Map(persons.map((p) => [p.id.toString(), p.gender]));
  const personClan = new Map(persons.map((p) => [p.id.toString(), p.clan_id.toString()]));
  console.log(`总 person 数: ${fmt(persons.length)}`);

  // 血缘边（仅可见人员，与 tree 查询口径一致）
  const ancestryEdges = await prisma.personAncestry.findMany({
    where: { depth: 1, ancestor: { deleted_at: null }, descendant: { deleted_at: null } },
    select: { ancestor_id: true, descendant_id: true },
  });
  const edgeSet = new Set(
    ancestryEdges.map((e) => `${e.ancestor_id.toString()}:${e.descendant_id.toString()}`),
  );
  console.log(`ancestry 亲子边(depth=1): ${fmt(ancestryEdges.length)}`);

  const selfRecords = await prisma.personAncestry.findMany({
    where: { depth: 0 },
    select: { descendant_id: true },
  });
  const selfSet = new Set(selfRecords.map((r) => r.descendant_id.toString()));
  console.log(`self-record(depth=0): ${fmt(selfRecords.length)}`);

  const familyUnits = await prisma.familyUnit.findMany({
    select: { id: true, clan_id: true, husband_id: true, wife_id: true },
  });
  const familyById = new Map(familyUnits.map((fu) => [fu.id.toString(), fu]));
  const familyIdsByParent = new Map(); // parentId -> FamilyUnit[]
  for (const fu of familyUnits) {
    for (const pid of [fu.husband_id, fu.wife_id]) {
      if (pid == null) continue;
      const k = pid.toString();
      if (!familyIdsByParent.has(k)) familyIdsByParent.set(k, []);
      familyIdsByParent.get(k).push(fu);
    }
  }
  console.log(`family_units 数: ${fmt(familyUnits.length)}`);

  const familyChildren = await prisma.familyChild.findMany({
    select: { family_id: true, child_id: true, birth_order: true },
  });
  const childSetByFamily = new Map(); // familyId -> Set(childId)
  const maxOrderByFamily = new Map(); // familyId -> max birth_order
  for (const fc of familyChildren) {
    const fk = fc.family_id.toString();
    const ck = fc.child_id.toString();
    if (!childSetByFamily.has(fk)) childSetByFamily.set(fk, new Set());
    childSetByFamily.get(fk).add(ck);
    maxOrderByFamily.set(fk, Math.max(maxOrderByFamily.get(fk) ?? -1, fc.birth_order));
  }
  console.log(`family_children 数: ${fmt(familyChildren.length)}\n`);

  // child -> 所有父母（用于阶段 1 的"优配家庭"启发式）
  const parentsOf = new Map(); // childId -> Set(parentId)
  for (const e of ancestryEdges) {
    const c = e.descendant_id.toString();
    if (!parentsOf.has(c)) parentsOf.set(c, new Set());
    parentsOf.get(c).add(e.ancestor_id.toString());
  }

  // ---------- 2) 阶段 1：ancestry → FamilyChild 缺口 ----------
  // plannedFamilies：待新建的单亲家庭（对象数组，占位 id 用下标引用）
  // plannedChildren：family_id 统一存 string（'new:N' 占位或真实 id 字符串），执行阶段再转 BigInt
  const plannedFamilies = [];
  const plannedChildren = [];
  const plannedChildKeys = new Set();
  const familyKeyOfNew = new Map(); // 'single:<parentId>' -> 占位 family_id
  const nextOrder = new Map(maxOrderByFamily); // 规划期可变的 order 游标

  const ensureChildPlanned = (familyIdStr, childIdStr) => {
    const key = `${familyIdStr}:${childIdStr}`;
    if (plannedChildKeys.has(key)) return;
    if (childSetByFamily.get(familyIdStr)?.has(childIdStr)) return;
    plannedChildKeys.add(key);
    const order = (nextOrder.get(familyIdStr) ?? -1) + 1;
    nextOrder.set(familyIdStr, order);
    plannedChildren.push({ family_id: familyIdStr, child_id: childIdStr, birth_order: order });
  };

  const gaps1 = [];
  for (const e of ancestryEdges) {
    const p = e.ancestor_id.toString();
    const c = e.descendant_id.toString();
    const fams = familyIdsByParent.get(p) ?? [];
    const has = fams.some((fu) => childSetByFamily.get(fu.id.toString())?.has(c));
    if (has) continue;
    gaps1.push({ p, c, fams });
  }

  for (const g of gaps1) {
    // 优配：其他父母也在场的家庭 > 该父母的第一个家庭 > 新建单亲家庭
    const otherParents = [...(parentsOf.get(g.c) ?? [])].filter((x) => x !== g.p);
    const otherSet = new Set(otherParents);
    const preferred =
      g.fams.find(
        (fu) =>
          (fu.husband_id && otherSet.has(fu.husband_id.toString())) ||
          (fu.wife_id && otherSet.has(fu.wife_id.toString())),
      ) ?? g.fams[0];

    if (preferred) {
      ensureChildPlanned(preferred.id.toString(), g.c);
    } else {
      const clanId = personClan.get(g.p);
      if (!clanId) {
        console.warn(`  ⚠️ 跳过：父/母 ${g.p} 不在 person 表（血缘边孤儿），无法建家庭`);
        continue;
      }
      const newKey = `single:${g.p}`;
      let familyId = familyKeyOfNew.get(newKey);
      if (!familyId) {
        familyId = `new:${plannedFamilies.length}`; // 占位 id，执行阶段映射为真实 id
        familyKeyOfNew.set(newKey, familyId);
        const isMale = personGender.get(g.p) === 'male';
        plannedFamilies.push({
          clan_id: BigInt(clanId),
          husband_id: isMale ? BigInt(g.p) : null,
          wife_id: isMale ? null : BigInt(g.p),
        });
      }
      ensureChildPlanned(familyId, g.c);
    }
  }

  console.log(`阶段1: 缺 FamilyChild 的亲子边 ${fmt(gaps1.length)} 条`);
  if (gaps1.length > 0) {
    console.log(`  → 计划新建单亲家庭 ${fmt(plannedFamilies.length)} 个，补 FamilyChild ${fmt(plannedChildren.length)} 条`);
  }

  // ---------- 3) 阶段 2：FamilyChild → ancestry 缺口 ----------
  const ancestryRows = [];
  const ancestryRowKeys = new Set();
  const parentChainCache = new Map(); // parentId -> [{ancestor_id, depth}]

  const planAncestryRow = (ancestorIdStr, descendantIdStr, depth) => {
    const key = `${ancestorIdStr}:${descendantIdStr}`;
    if (ancestryRowKeys.has(key)) return;
    if (edgeSet.has(key)) return; // 已有血缘边
    ancestryRowKeys.add(key);
    ancestryRows.push({
      ancestor_id: BigInt(ancestorIdStr),
      descendant_id: BigInt(descendantIdStr),
      depth,
    });
  };

  let gaps2 = 0;
  for (const fc of familyChildren) {
    const family = familyById.get(fc.family_id.toString());
    if (!family) continue;
    const childStr = fc.child_id.toString();
    const familyClan = family.clan_id.toString();

    // 该 child 的 self-record
    if (!selfSet.has(childStr)) {
      selfSet.add(childStr);
      planAncestryRow(childStr, childStr, 0);
    }

    for (const pid of [family.husband_id, family.wife_id]) {
      if (pid == null) continue;
      const p = pid.toString();
      if (personClan.get(p) !== familyClan) continue; // 跨族父母不进闭包表
      if (edgeSet.has(`${p}:${childStr}`)) continue;
      gaps2++;

      if (!parentChainCache.has(p)) {
        parentChainCache.set(
          p,
          await prisma.personAncestry.findMany({
            where: { descendant_id: pid, ancestor: { deleted_at: null } },
            select: { ancestor_id: true, depth: true },
          }),
        );
      }
      const chain = parentChainCache.get(p);
      for (const pa of chain) {
        planAncestryRow(pa.ancestor_id.toString(), childStr, pa.depth + 1);
      }
      // 兜底：父/母自身缺 self-record 时直接建 (parent, child, 1)
      if (!chain.some((pa) => pa.ancestor_id === pid)) {
        planAncestryRow(p, childStr, 1);
      }
    }
  }
  console.log(
    `阶段2: 缺血缘边的 FamilyChild 亲子对 ${fmt(gaps2)} 条 → 补 ancestry ${fmt(ancestryRows.length)} 行（含 self-record）`,
  );

  // ---------- 4) 阶段 3：全局 self-record 补齐 ----------
  const missingSelf = persons.filter((p) => !selfSet.has(p.id.toString()));
  for (const p of missingSelf) {
    planAncestryRow(p.id.toString(), p.id.toString(), 0);
  }
  console.log(`阶段3: 缺 self-record 的 person ${fmt(missingSelf.length)} 人`);

  // ---------- 5) 汇总 ----------
  console.log(
    `\n汇总：新建家庭 ${fmt(plannedFamilies.length)}，补 FamilyChild ${fmt(plannedChildren.length)}，补 PersonAncestry ${fmt(ancestryRows.length)}`,
  );

  if (isDryRun) {
    console.log('\n预览（各取前 10）：');
    for (const f of plannedFamilies.slice(0, 10)) {
      console.log(`  新家庭 clan=${f.clan_id} husband=${f.husband_id} wife=${f.wife_id}`);
    }
    for (const fc of plannedChildren.slice(0, 10)) {
      console.log(`  FamilyChild family=${fc.family_id} child=${fc.child_id} order=${fc.birth_order}`);
    }
    for (const r of ancestryRows.slice(0, 10)) {
      console.log(`  Ancestry ${r.ancestor_id} → ${r.descendant_id} depth=${r.depth}`);
    }
    console.log('\n🔍 DRY-RUN 模式，未写入数据库。');
    return;
  }

  // ---------- 6) 执行 ----------
  // 6a. 新建家庭（需真实 id 供 FamilyChild 引用，逐个创建）
  const familyIdMap = new Map(); // 占位 id（'new:N'） -> 真实 id
  for (let i = 0; i < plannedFamilies.length; i++) {
    const created = await prisma.familyUnit.create({ data: plannedFamilies[i] });
    familyIdMap.set(`new:${i}`, created.id);
    console.log(`  新建家庭 ${created.id}（clan=${plannedFamilies[i].clan_id}）`);
  }

  // 6b. 批量写 FamilyChild（family_id 统一转真实 BigInt）
  const childInserts = plannedChildren.map((pc) => ({
    family_id:
      typeof pc.family_id === 'string' && pc.family_id.startsWith('new:')
        ? familyIdMap.get(pc.family_id)
        : BigInt(pc.family_id),
    child_id: BigInt(pc.child_id),
    birth_order: pc.birth_order,
  }));
  let writtenChildren = 0;
  for (let i = 0; i < childInserts.length; i += BATCH) {
    const res = await prisma.familyChild.createMany({
      data: childInserts.slice(i, i + BATCH),
      skipDuplicates: true,
    });
    writtenChildren += res.count;
  }
  console.log(`✅ FamilyChild 写入 ${writtenChildren}/${childInserts.length}`);

  // 6c. 批量写 PersonAncestry
  let writtenAncestry = 0;
  for (let i = 0; i < ancestryRows.length; i += BATCH) {
    const res = await prisma.personAncestry.createMany({
      data: ancestryRows.slice(i, i + BATCH),
      skipDuplicates: true,
    });
    writtenAncestry += res.count;
  }
  console.log(`✅ PersonAncestry 写入 ${writtenAncestry}/${ancestryRows.length}`);

  // ---------- 7) 验证（重新查询） ----------
  console.log('\n========== 验证 ==========');
  const vEdges = await prisma.personAncestry.findMany({
    where: { depth: 1, ancestor: { deleted_at: null }, descendant: { deleted_at: null } },
    select: { ancestor_id: true, descendant_id: true },
  });
  const vFamilyUnits = await prisma.familyUnit.findMany({
    select: { id: true, husband_id: true, wife_id: true },
  });
  const vChildren = await prisma.familyChild.findMany({
    select: { family_id: true, child_id: true },
  });
  const vFamilyByParent = new Map();
  for (const fu of vFamilyUnits) {
    for (const pid of [fu.husband_id, fu.wife_id]) {
      if (pid == null) continue;
      const k = pid.toString();
      if (!vFamilyByParent.has(k)) vFamilyByParent.set(k, []);
      vFamilyByParent.get(k).push(fu);
    }
  }
  const vChildSetByFamily = new Map();
  for (const fc of vChildren) {
    const fk = fc.family_id.toString();
    if (!vChildSetByFamily.has(fk)) vChildSetByFamily.set(fk, new Set());
    vChildSetByFamily.get(fk).add(fc.child_id.toString());
  }
  let vGap1 = 0;
  for (const e of vEdges) {
    const p = e.ancestor_id.toString();
    const c = e.descendant_id.toString();
    const fams = vFamilyByParent.get(p) ?? [];
    if (!fams.some((fu) => vChildSetByFamily.get(fu.id.toString())?.has(c))) vGap1++;
  }
  const vEdgeSet = new Set(vEdges.map((e) => `${e.ancestor_id}:${e.descendant_id}`));
  let vGap2 = 0;
  for (const fc of vChildren) {
    const family = vFamilyUnits.find((fu) => fu.id === fc.family_id);
    if (!family) continue;
    for (const pid of [family.husband_id, family.wife_id]) {
      if (pid == null) continue;
      if (!vEdgeSet.has(`${pid}:${fc.child_id}`)) vGap2++;
    }
  }
  const vSelf = await prisma.personAncestry.count({ where: { depth: 0 } });
  console.log(`血缘边 → FamilyChild 缺口: ${fmt(vGap1)}${vGap1 === 0 ? ' ✅' : ' ⚠️'}`);
  console.log(`FamilyChild → 血缘边 缺口: ${fmt(vGap2)}${vGap2 === 0 ? ' ✅' : ' ⚠️'}`);
  console.log(`self-record 总数: ${fmt(vSelf)} / person 数 ${fmt(persons.length)}${vSelf === persons.length ? ' ✅' : ' ⚠️'}`);
  if (vGap1 === 0 && vGap2 === 0 && vSelf === persons.length) {
    console.log('\n✅ 全部一致：PersonAncestry 与 FamilyChild 亲子关系集合已对齐。');
  } else {
    console.log('\n⚠️ 仍有缺口，请检查上方告警项后重跑（脚本幂等，可安全重跑）。');
  }
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e.message);
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
