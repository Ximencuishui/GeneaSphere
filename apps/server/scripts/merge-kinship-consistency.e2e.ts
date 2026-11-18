/**
 * 寻亲合并真实库联调。禁止 mock Prisma。
 * 只连 127.0.0.1 / localhost。跑完按本次创建的 id 清数据。
 *
 * 运行（在 apps/server）：
 *   npx ts-node --transpile-only -P tsconfig.json scripts/merge-kinship-consistency.e2e.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { BadRequestException } from '@nestjs/common';
import {
  ApplicationStatus,
  Gender,
  PrismaClient,
  Role,
} from '@prisma/client';
import { MergeService } from '../src/admin/merge/merge.service';
import { UserMergeApplicationController } from '../src/admin/merge/user-merge-application.controller';
import { AdminService } from '../src/admin/admin.service';

config({ path: resolve(__dirname, '../.env') });

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL 未设置');
  const parsed = new URL(raw.replace(/^postgresql:/, 'http:'));
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error(`拒绝连接非本地库：${parsed.hostname}`);
  }
  return { host: parsed.hostname, port: parsed.port, database: parsed.pathname.replace(/^\//, '').split('?')[0] };
}

const target = assertLocalDatabase();
const prisma = new PrismaClient();
const mergeService = new MergeService(prisma as never);
const userMerge = new UserMergeApplicationController(prisma as never);
const adminService = new AdminService(prisma as never, null as never);

const stamp = Date.now().toString().slice(-8);
const prefix = `e2e-merge-${stamp}`;
const userIds: string[] = [];
const clanIds: bigint[] = [];
const personIds: bigint[] = [];
const familyIds: bigint[] = [];
const applicationIds: bigint[] = [];

function log(message: string) {
  console.log(`[merge-e2e] ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function edgeKey(row: { ancestor_id: bigint; descendant_id: bigint; depth: number }) {
  return `${row.ancestor_id.toString()}:${row.descendant_id.toString()}:${row.depth}`;
}

async function loadEdges(ids: bigint[]) {
  const rows = await prisma.personAncestry.findMany({
    where: { OR: [{ ancestor_id: { in: ids } }, { descendant_id: { in: ids } }] },
  });
  return rows.map(edgeKey).sort();
}

async function ensureMigration() {
  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'merge_applications' AND column_name = 'applicant_clan_id'
  `;
  const labels = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ApplicationStatus' AND e.enumlabel = 'WITHDRAWN'
  `;
  if (columns.length > 0 && labels.length > 0) {
    log('测试库已有 applicant_clan_id 与 WITHDRAWN');
    return;
  }
  log('测试库缺少合并迁移，执行 prisma migrate deploy');
  const deployed = spawnSync(
    'npx',
    ['prisma', 'migrate', 'deploy', '--schema=prisma/schema.prisma'],
    { cwd: resolve(__dirname, '../../../packages/db'), stdio: 'inherit', shell: true },
  );
  if (deployed.status !== 0) {
    throw new Error(`prisma migrate deploy 失败，退出码 ${deployed.status}`);
  }
}

async function cleanup() {
  if (applicationIds.length > 0) {
    await prisma.dataSnapshot.deleteMany({ where: { merge_application_id: { in: applicationIds } } });
    await prisma.mergeApplication.deleteMany({ where: { id: { in: applicationIds } } });
  }
  if (personIds.length > 0) {
    await prisma.familyChild.deleteMany({ where: { child_id: { in: personIds } } });
    await prisma.personAncestry.deleteMany({
      where: { OR: [{ ancestor_id: { in: personIds } }, { descendant_id: { in: personIds } }] },
    });
  }
  if (familyIds.length > 0 || clanIds.length > 0) {
    await prisma.familyUnit.deleteMany({
      where: {
        OR: [
          familyIds.length ? { id: { in: familyIds } } : { id: -1n },
          clanIds.length ? { clan_id: { in: clanIds } } : { id: -1n },
        ],
      },
    });
  }
  if (clanIds.length > 0) {
    await prisma.clanMember.deleteMany({ where: { clan_id: { in: clanIds } } });
  }
  if (personIds.length > 0) {
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  }
  if (clanIds.length > 0) {
    await prisma.clan.deleteMany({ where: { id: { in: clanIds } } });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function expectRejected(run: () => Promise<unknown>, label: string) {
  try {
    await run();
  } catch (error) {
    assert(error instanceof BadRequestException, `${label} 应抛出 BadRequestException，实际是 ${error}`);
    assert(error.getStatus() === 400, `${label} 应返回 400，实际是 ${error.getStatus()}`);
    log(`${label} 被拒绝：${error.message}`);
    return;
  }
  throw new Error(`${label} 应当失败，但调用成功了`);
}

async function main() {
  log(`连接本地库 ${target.host}:${target.port}/${target.database}`);
  await ensureMigration();

  const admin = await prisma.user.create({
    data: { phone: `198${stamp}`, password_hash: 'e2e-merge-not-a-login', nickname: `${prefix}-admin` },
  });
  const applicant = await prisma.user.create({
    data: { phone: `197${stamp}`, password_hash: 'e2e-merge-not-a-login', nickname: `${prefix}-applicant` },
  });
  userIds.push(admin.id, applicant.id);

  const clanA = await prisma.clan.create({
    data: { name: `${prefix}-家族A`, slug: `${prefix}-a`, admin_user_id: admin.id },
  });
  const clanB = await prisma.clan.create({
    data: { name: `${prefix}-家族B`, slug: `${prefix}-b`, admin_user_id: admin.id },
  });
  const clanC = await prisma.clan.create({
    data: { name: `${prefix}-家族C`, slug: `${prefix}-c`, admin_user_id: admin.id },
  });
  clanIds.push(clanA.id, clanB.id, clanC.id);
  await prisma.clanMember.create({
    data: { clan_id: clanA.id, user_id: admin.id, role: Role.OWNER },
  });

  const rootA = await prisma.person.create({
    data: { clan_id: clanA.id, full_name: `${prefix}-A始祖`, gender: Gender.male, is_living: false },
  });
  const childA = await prisma.person.create({
    data: { clan_id: clanA.id, full_name: `${prefix}-A子代`, gender: Gender.male, is_living: false },
  });
  const grandA = await prisma.person.create({
    data: { clan_id: clanA.id, full_name: `${prefix}-A孙代`, gender: Gender.male, is_living: true },
  });
  const rootB = await prisma.person.create({
    data: { clan_id: clanB.id, full_name: `${prefix}-B支系根`, gender: Gender.male, is_living: false },
  });
  const childB = await prisma.person.create({
    data: { clan_id: clanB.id, full_name: `${prefix}-B子代`, gender: Gender.female, is_living: true },
  });
  const rootC = await prisma.person.create({
    data: { clan_id: clanC.id, full_name: `${prefix}-C已有路径`, gender: Gender.male, is_living: false },
  });
  personIds.push(rootA.id, childA.id, grandA.id, rootB.id, childB.id, rootC.id);

  const familyRoot = await prisma.familyUnit.create({
    data: { clan_id: clanA.id, husband_id: rootA.id, union_type: 'normal', marriage_order: 1 },
  });
  const familyChildA = await prisma.familyUnit.create({
    data: { clan_id: clanA.id, husband_id: childA.id, union_type: 'normal', marriage_order: 1 },
  });
  const familyB = await prisma.familyUnit.create({
    data: { clan_id: clanB.id, husband_id: rootB.id, union_type: 'normal', marriage_order: 1 },
  });
  familyIds.push(familyRoot.id, familyChildA.id, familyB.id);
  await prisma.familyChild.createMany({
    data: [
      { family_id: familyRoot.id, child_id: childA.id, birth_order: 1 },
      { family_id: familyChildA.id, child_id: grandA.id, birth_order: 1 },
      { family_id: familyB.id, child_id: childB.id, birth_order: 1 },
    ],
  });
  await prisma.personAncestry.createMany({
    data: [
      { ancestor_id: rootA.id, descendant_id: rootA.id, depth: 0 },
      { ancestor_id: childA.id, descendant_id: childA.id, depth: 0 },
      { ancestor_id: grandA.id, descendant_id: grandA.id, depth: 0 },
      { ancestor_id: rootA.id, descendant_id: childA.id, depth: 1 },
      { ancestor_id: rootA.id, descendant_id: grandA.id, depth: 2 },
      { ancestor_id: childA.id, descendant_id: grandA.id, depth: 1 },
      { ancestor_id: rootB.id, descendant_id: rootB.id, depth: 0 },
      { ancestor_id: childB.id, descendant_id: childB.id, depth: 0 },
      { ancestor_id: rootB.id, descendant_id: childB.id, depth: 1 },
      { ancestor_id: rootC.id, descendant_id: rootC.id, depth: 0 },
      { ancestor_id: rootC.id, descendant_id: childA.id, depth: 2 },
    ],
  });
  log('已造家族 A（始祖/子代/孙代）与家族 B、以及一条预先存在的跨族路径');

  const created = await userMerge.create(
    { user: { userId: applicant.id } },
    {
      clan_id: clanA.id.toString(),
      origin_place: `${prefix}-祖籍`,
      xipai_info: ['测'],
      ancestor_name: `${prefix}-祖`,
      migration_history: 'e2e',
      applicant_clan_id: clanB.id.toString(),
      branch_root_person_id: rootB.id.toString(),
      applicant_id: 'forged-client-user',
      status: 'APPROVED',
    } as never,
  );
  const applicationId = BigInt(created.id);
  applicationIds.push(applicationId);
  const pending = await prisma.mergeApplication.findUnique({ where: { id: applicationId } });
  assert(pending?.status === ApplicationStatus.PENDING, `创建后状态应为 PENDING，实际 ${pending?.status}`);
  assert(pending?.applicant_id === applicant.id, 'applicant_id 必须来自登录用户');
  assert(pending?.applicant_clan_id === clanB.id, 'applicant_clan_id 应为家族 B');
  assert(pending?.branch_root_person_id === rootB.id, 'branch_root_person_id 应为 B 支系根');
  log(`认亲申请 ${created.id} 为 PENDING，申请人 ${pending.applicant_id}`);

  await adminService.requireAdmin(clanA.id, admin.id);
  const approved = await mergeService.approveApplication(applicationId, admin.id);
  assert(approved.status === ApplicationStatus.APPROVED, '审核后应为 APPROVED');
  log('族长审核通过，状态 APPROVED');

  const cycleApp = await userMerge.create(
    { user: { userId: applicant.id } },
    {
      clan_id: clanA.id.toString(),
      origin_place: `${prefix}-闭环`,
      xipai_info: [],
      applicant_clan_id: clanC.id.toString(),
      branch_root_person_id: rootC.id.toString(),
    },
  );
  const cycleId = BigInt(cycleApp.id);
  applicationIds.push(cycleId);
  await mergeService.approveApplication(cycleId, admin.id);

  const snapshotState = async () => {
    const clans = await prisma.person.findMany({
      where: { id: { in: personIds } },
      select: { id: true, clan_id: true },
    });
    return {
      clans: clans.map((row) => `${row.id.toString()}:${row.clan_id.toString()}`).sort().join('\n'),
      edges: (await loadEdges(personIds)).join('\n'),
      successStatus: (await prisma.mergeApplication.findUnique({ where: { id: applicationId } }))?.status,
      cycleStatus: (await prisma.mergeApplication.findUnique({ where: { id: cycleId } }))?.status,
    };
  };
  const beforeNegative = await snapshotState();

  await expectRejected(
    () => mergeService.executeMerge(cycleId, childA.id, rootC.id, 4, admin.id),
    '已有 depth>=1 路径',
  );
  await expectRejected(
    () => mergeService.executeMerge(applicationId, grandA.id, rootB.id, 7, admin.id),
    '挂载点仍在世',
  );

  const afterNegative = await snapshotState();
  assert(afterNegative.clans === beforeNegative.clans, '拒绝后人物 clan_id 被改写');
  assert(afterNegative.edges === beforeNegative.edges, '拒绝后闭包被改写');
  assert(afterNegative.successStatus === beforeNegative.successStatus, '拒绝后成功申请的状态被改写');
  assert(afterNegative.cycleStatus === beforeNegative.cycleStatus, '拒绝后闭环申请的状态被改写');
  log('两条拒绝用例均已回滚，库内数据与调用前一致');

  const beforeMergeEdges = afterNegative.edges.split('\n');
  const merged = await mergeService.executeMerge(applicationId, childA.id, rootB.id, 9, admin.id);
  log(`合并完成，快照 ${merged.snapshotId}，generationOffset=9 不应进入 depth`);

  const moved = await prisma.person.findMany({ where: { id: { in: [rootB.id, childB.id] } } });
  assert(moved.every((person) => person.clan_id === clanA.id), '家族 B 人物的 clan_id 应改为家族 A');

  const depthOf = async (ancestorId: bigint, descendantId: bigint) => {
    const row = await prisma.personAncestry.findUnique({
      where: { ancestor_id_descendant_id: { ancestor_id: ancestorId, descendant_id: descendantId } },
    });
    assert(row, `缺少闭包边 ${ancestorId}->${descendantId}`);
    return row.depth;
  };
  assert(await depthOf(childA.id, rootB.id) === 0 + 0 + 1, 'A子代到B支系根的 depth 应为 1');
  assert(await depthOf(rootA.id, rootB.id) === 1 + 0 + 1, 'A始祖到B支系根的 depth 应为 2');
  assert(await depthOf(childA.id, childB.id) === 0 + 1 + 1, 'A子代到B子代的 depth 应为 2');
  assert(await depthOf(rootA.id, childB.id) === 1 + 1 + 1, 'A始祖到B子代的 depth 应为 3');
  assert(await depthOf(rootB.id, childB.id) === 1, 'B 支系内部边 depth 仍为 1');
  assert(await depthOf(rootB.id, rootB.id) === 0, 'B 支系根自我行 depth 仍为 0');
  assert(await depthOf(childB.id, childB.id) === 0, 'B 子代自我行 depth 仍为 0');
  assert(await depthOf(rootA.id, grandA.id) === 2, 'A 侧原有祖孙边不应被改写');
  const anyOffsetDepth = await prisma.personAncestry.findFirst({
    where: {
      ancestor_id: { in: [rootA.id, childA.id] },
      descendant_id: { in: [rootB.id, childB.id] },
      depth: { gte: 9 },
    },
  });
  assert(!anyOffsetDepth, 'generationOffset 不应写进 depth');
  log('闭包深度与支系内部边、自我行均符合 a.depth + b.depth + 1');

  await mergeService.rollbackMerge(BigInt(merged.snapshotId), admin.id);
  const restored = await prisma.person.findMany({ where: { id: { in: [rootB.id, childB.id] } } });
  assert(restored.every((person) => person.clan_id === clanB.id), '回滚后 B 的人物应回到家族 B');
  const restoredEdges = await loadEdges(personIds);
  assert(restoredEdges.join('\n') === beforeMergeEdges.join('\n'), `回滚后闭包与合并前不一致\n期望 ${beforeMergeEdges.join(',')}\n实际 ${restoredEdges.join(',')}`);
  const rolled = await prisma.mergeApplication.findUnique({ where: { id: applicationId } });
  assert(rolled?.status === ApplicationStatus.APPROVED, `回滚后申请应为 APPROVED，实际 ${rolled?.status}`);
  const mergerLeft = await prisma.familyUnit.count({
    where: { union_type: 'merger', husband_id: childA.id, clan_id: clanA.id },
  });
  assert(mergerLeft === 0, '回滚后新建的 merger 家庭应被删除');
  log('回滚已恢复 clan_id、逐行闭包、APPROVED 状态，并删除 merger 家庭');
  log('全部断言通过');
}

main()
  .catch((error) => {
    console.error('[merge-e2e] 失败');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
      log('已清掉本次测试行');
    } catch (error) {
      console.error('[merge-e2e] 清理失败');
      console.error(error);
      process.exitCode = 1;
    }
    await prisma.$disconnect();
  });
