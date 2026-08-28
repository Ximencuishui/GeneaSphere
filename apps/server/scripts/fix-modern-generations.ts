import 'dotenv/config';
import { PrismaClient, Gender } from '@geneasphere/db';

/**
 * 修复近现代族员断崖式缺失
 *
 * 从指定世代的男性开始，逐代补充配偶与子女，让第 9 世以后的人数
 * 平滑回升、自然延续到近现代（含在世人员），避免“古代上千人、现代只剩 1 人”。
 *
 * 用法（需先确保数据库连接正常、.env 已配置）：
 *   npx ts-node -P scripts/tsconfig.json scripts/fix-modern-generations.ts <clanSlug> [选项]
 *
 * 示例：
 *   npx ts-node -P scripts/tsconfig.json scripts/fix-modern-generations.ts zhuxi-demo --dryRun
 *   npx ts-node -P scripts/tsconfig.json scripts/fix-modern-generations.ts zhuxi-demo --fromGen=9 --toGen=32
 */

const prisma = new PrismaClient();

const CURRENT_YEAR = new Date().getFullYear();

// 字辈用字 + 名用字，组合成“姓+字辈+名”（与演示家族 3 字名风格一致，且组合空间大）
const ZIBEI_CHARS = [
  '樾','楷','检','樽','栻','栉','柄','模','炜','炤','焘','熹','塾','埜','森','焕','炽','栒','栋','梁',
  '沐','深','桂','桐','浚','洪','潜','鋆','鉴','铨','永','长','久','昌','盛','茂','荣','华','富','贵',
];
const MALE_GIVEN_NAMES = [
  '伟','强','磊','军','洋','勇','杰','涛','超','明','辉','刚','平','鹏','飞','斌','波','俊','峰','建',
  '林','宇','浩','凯','健','鑫','毅','晨','轩','昊','睿','梓','涵','泽','皓','宸','奕','程','硕','博文',
  '子轩','浩然','宇航','俊杰','天佑','一鸣','思远','嘉树','景行','明德','弘毅','维岳','承志','启铭','守正',
];
const FEMALE_GIVEN_NAMES = [
  '芳','娜','敏','静','丽','艳','娟','霞','秀','英','慧','梅','雪','琴','兰','洁','颖','晶','倩','玲',
  '婷','媛','怡','瑾','璇','璐','琳','琪','瑶','珊','茜','蕾','霏','霓','婉','嫣','芷','若','语','彤',
  '诗涵','雅琴','梦瑶','婉清','思琪','雨萱','欣怡','佳慧','静姝','灵芸','雪晴','晓萱','依诺','梓涵','子衿','清和',
  '之桃','书文','月瑶','以晴','念真','乐菱','慕灵','初雪','青黛','云舒',
];
const SPOUSE_SURNAMES = [
  '李','王','张','刘','陈','杨','黄','赵','周','吴','徐','孙','马','朱','胡','郭','何','高','林','罗',
  '郑','梁','谢','宋','唐','许','韩','冯','邓','曹','彭','曾','肖','田','董','袁','潘','于','蒋','蔡',
];

interface ExpandOptions {
  clanSlug: string;
  fromGen: number;
  toGen: number;
  surname: string | null;
  seed: number;
  dryRun: boolean;
}

function parseArgs(): ExpandOptions {
  const args = process.argv.slice(2);
  const clanSlug = args.find((a) => !a.startsWith('--'));
  if (!clanSlug) {
    console.error('错误：请提供 clanSlug，例如：zhuxi-demo');
    printUsage();
    process.exit(1);
  }

  const getFlag = (key: string) => {
    const full = args.find((a) => a.startsWith(`--${key}=`));
    return full ? full.split('=')[1] : undefined;
  };
  const hasFlag = (key: string) => args.includes(`--${key}`);

  return {
    clanSlug,
    fromGen: parseInt(getFlag('fromGen') || '9', 10),
    toGen: parseInt(getFlag('toGen') || '32', 10),
    surname: getFlag('surname') || null,
    seed: parseInt(getFlag('seed') || '42', 10),
    dryRun: hasFlag('dryRun') || hasFlag('dry-run'),
  };
}

function printUsage() {
  console.log(`
用法：
  npx ts-node -P scripts/tsconfig.json scripts/fix-modern-generations.ts <clanSlug> [选项]

选项：
  --fromGen=N      从第 N 世开始补充（默认 9）
  --toGen=N        补充到第 N 世为止（默认 32，延续到近现代）
  --surname=姓     指定家族姓氏（默认自动推断）
  --seed=N         随机种子（默认 42）
  --dryRun         只预览，不写入数据库

示例：
  npx ts-node -P scripts/tsconfig.json scripts/fix-modern-generations.ts zhuxi-demo --dryRun
`);
}

// 线性同余伪随机数（可复现）
function makeRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickRange(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

async function inferSurname(clanId: bigint): Promise<string> {
  const persons = await prisma.person.findMany({
    where: { clan_id: clanId, deleted_at: null },
    select: { full_name: true },
    take: 200,
  });
  const freq = new Map<string, number>();
  for (const p of persons) {
    if (!p.full_name) continue;
    const s = p.full_name.charAt(0);
    freq.set(s, (freq.get(s) || 0) + 1);
  }
  let best = '朱';
  let bestCount = 0;
  for (const [s, c] of freq.entries()) {
    if (c > bestCount) {
      best = s;
      bestCount = c;
    }
  }
  return best;
}

async function loadUsedNames(clanId: bigint): Promise<Set<string>> {
  const persons = await prisma.person.findMany({
    where: { clan_id: clanId, deleted_at: null },
    select: { full_name: true },
  });
  return new Set(persons.map((p) => p.full_name).filter(Boolean));
}

function createNameGenerator(
  surname: string,
  usedNames: Set<string>,
) {
  // 男性：姓 + 字辈 + 名，组合空间 = ZIBEI × GIVEN
  const MALE_COMBOS: string[] = [];
  for (const z of ZIBEI_CHARS) {
    for (const g of MALE_GIVEN_NAMES) {
      MALE_COMBOS.push(surname + z + g);
    }
  }
  // 女性：配偶姓氏 + 名，组合空间 = SPOUSE_SURNAMES × GIVEN
  const FEMALE_COMBOS: string[] = [];
  for (const sn of SPOUSE_SURNAMES) {
    for (const fn of FEMALE_GIVEN_NAMES) {
      FEMALE_COMBOS.push(sn + fn);
    }
  }

  let maleCounter = 0;
  let femaleCounter = 0;

  const nextMaleName = (): string => {
    for (let attempt = 0; attempt < MALE_COMBOS.length; attempt++) {
      const idx = (maleCounter + attempt) % MALE_COMBOS.length;
      const name = MALE_COMBOS[idx];
      if (!usedNames.has(name)) {
        usedNames.add(name);
        maleCounter = idx + 1;
        return name;
      }
    }
    throw new Error(`男性姓名组合空间耗尽（${MALE_COMBOS.length} 个组合）`);
  };

  const nextFemaleName = (): string => {
    for (let attempt = 0; attempt < FEMALE_COMBOS.length; attempt++) {
      const idx = (femaleCounter + attempt) % FEMALE_COMBOS.length;
      const name = FEMALE_COMBOS[idx];
      if (!usedNames.has(name)) {
        usedNames.add(name);
        femaleCounter = idx + 1;
        return name;
      }
    }
    throw new Error(`女性姓名组合空间耗尽（${FEMALE_COMBOS.length} 个组合）`);
  };

  return { nextMaleName, nextFemaleName };
}

async function findRoot(clanId: bigint) {
  return prisma.person.findFirst({
    where: {
      clan_id: clanId,
      deleted_at: null,
      descendant_links: { none: { depth: 1 } },
    },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
}

async function getPersonsByGeneration(
  clanId: bigint,
  rootId: bigint,
  generation: number,
) {
  const depth = generation - 1;
  return prisma.person.findMany({
    where: {
      clan_id: clanId,
      deleted_at: null,
      descendant_links: {
        some: { ancestor_id: rootId, depth },
      },
    },
    include: {
      husband_in: {
        include: { children: { include: { child: true } } },
      },
    },
  });
}

async function findOrCreateWife(
  clanId: bigint,
  husband: any,
  wifeBirthYear: number,
  nameGen: ReturnType<typeof createNameGenerator>,
  random: () => number,
) {
  // 已有妻子则复用
  const existingFamily = husband.husband_in?.[0];
  if (existingFamily?.wife_id) {
    const wife = await prisma.person.findUnique({
      where: { id: existingFamily.wife_id },
    });
    if (wife) return { wife, family: existingFamily };
  }

  const wifeName = nameGen.nextFemaleName();
  const wifeDeathYear = wifeBirthYear + pickRange(55, 95, random);
  const wife = await prisma.person.create({
    data: {
      clan_id: clanId,
      full_name: wifeName,
      gender: 'female',
      birth_date: new Date(`${wifeBirthYear}-06-15`),
      death_date: wifeDeathYear <= CURRENT_YEAR ? new Date(`${wifeDeathYear}-06-15`) : null,
      is_living: wifeDeathYear > CURRENT_YEAR,
      birth_place: husband.birth_place,
      migration_branch: husband.migration_branch,
    },
  });

  // 为妻子建立 self-record 和嫁入链（depth 与丈夫一致，纳入世代统计）
  const husbandAncestries = await prisma.personAncestry.findMany({
    where: { descendant_id: husband.id },
    select: { ancestor_id: true, depth: true },
  });
  const wifeAncestry = husbandAncestries.map((a) => ({
    ancestor_id: a.ancestor_id,
    descendant_id: wife.id,
    depth: a.depth,
  }));
  wifeAncestry.push({ ancestor_id: wife.id, descendant_id: wife.id, depth: 0 });
  await prisma.personAncestry.createMany({ data: wifeAncestry, skipDuplicates: true });

  let family = existingFamily;
  if (!family) {
    family = await prisma.familyUnit.create({
      data: {
        clan_id: clanId,
        husband_id: husband.id,
        wife_id: wife.id,
        union_type: 'normal',
      },
    });
  } else {
    await prisma.familyUnit.update({
      where: { id: family.id },
      data: { wife_id: wife.id },
    });
  }

  return { wife, family };
}

interface ChildPlan {
  gender: Gender;
  birthYear: number;
}

/**
 * 决定某位男性新增多少个子女。
 * 繁衍意愿随世代推进逐步降低（人口增长 → 趋于平稳 → 现代生育下降），
 * 保证第 9 世后的总人数平滑回升后自然回落，而不是爆炸或断崖。
 */
function planChildren(
  fatherBirthYear: number,
  generation: number,
  existingSons: number,
  existingDaughters: number,
  random: () => number,
): ChildPlan[] {
  // 繁衍意愿：中世代 60% 男性留有后裔，近现代逐步降到 50%，
  // 使人口从第 9 世起平滑过渡、缓慢回落，并延续到近现代（含在世人员）
  const reproFrac = generation <= 20 ? 0.6 : 0.5;

  // 该男性不繁衍（无记录子嗣），符合真实族谱“非所有男性都有记载后裔”
  if (random() > reproFrac) return [];

  const targetSons = pickRange(1, 2, random);
  const targetDaughters = random() < 0.7 ? 1 : 0;

  // 已有子女过多时不再硬塞
  const sonsToAdd = Math.max(0, Math.min(targetSons, 4) - existingSons);
  const daughtersToAdd = Math.max(0, Math.min(targetDaughters, 3) - existingDaughters);

  const plans: ChildPlan[] = [];
  const baseBirth = fatherBirthYear + pickRange(22, 34, random);
  for (let i = 0; i < sonsToAdd + daughtersToAdd; i++) {
    const isSon = i < sonsToAdd;
    plans.push({
      gender: isSon ? 'male' : 'female',
      birthYear: baseBirth + Math.floor(i * 2.2) + pickRange(0, 2, random),
    });
  }
  return plans;
}

async function expandGeneration(
  clanId: bigint,
  rootId: bigint,
  generation: number,
  nameGen: ReturnType<typeof createNameGenerator>,
  random: () => number,
  dryRun: boolean,
  stats: { personsCreated: number; wivesCreated: number; childrenCreated: number },
) {
  const persons = await getPersonsByGeneration(clanId, rootId, generation);
  const males = persons.filter((p) => p.gender === 'male');

  console.log(`\n  第 ${generation} 世：共 ${persons.length} 人，男性 ${males.length} 人`);

  if (males.length === 0) {
    console.log('  → 该世代无男性，族脉延续终止');
    return [];
  }

  const nextGenMales: any[] = [];

  for (const male of males) {
    const birthYear = male.birth_date
      ? new Date(male.birth_date).getFullYear()
      : 1850 + (generation - 9) * 30;

    const existingFamily = male.husband_in?.[0];
    const existingChildren = existingFamily?.children?.map((c: any) => c.child) || [];
    const existingSons = existingChildren.filter((c: any) => c.gender === 'male').length;
    const existingDaughters = existingChildren.filter((c: any) => c.gender === 'female').length;

    if (dryRun) {
      const plans = planChildren(birthYear, generation, existingSons, existingDaughters, random);
      if (plans.length > 0 && plans.length <= 3) {
        console.log(`    [预览] ${male.full_name}(${birthYear}) 已 ${existingSons} 子 ${existingDaughters} 女，计划新增 ${plans.length} 人`);
      }
      continue;
    }

    const { wife, family } = await findOrCreateWife(
      clanId,
      male,
      birthYear + pickRange(16, 24, random),
      nameGen,
      random,
    );
    if (!existingFamily) stats.wivesCreated++;

    const plans = planChildren(birthYear, generation, existingSons, existingDaughters, random);
    if (plans.length === 0) continue;

    for (const plan of plans) {
      const name = plan.gender === 'male' ? nameGen.nextMaleName() : nameGen.nextFemaleName();
      const deathYear = plan.birthYear + (
        plan.gender === 'male'
          ? pickRange(55, 90, random)
          : pickRange(58, 93, random)
      );
      const isLiving = deathYear > CURRENT_YEAR;

      const child = await prisma.person.create({
        data: {
          clan_id: clanId,
          full_name: name,
          gender: plan.gender,
          birth_date: new Date(`${plan.birthYear}-06-15`),
          death_date: isLiving ? null : new Date(`${deathYear}-06-15`),
          is_living: isLiving,
          birth_place: male.birth_place,
          migration_branch: male.migration_branch,
        },
      });
      stats.personsCreated++;
      stats.childrenCreated++;

      // 建立父系 ancestry 链（含自身 self-record）
      const fatherAncestries = await prisma.personAncestry.findMany({
        where: { descendant_id: male.id },
        select: { ancestor_id: true, depth: true },
      });
      const childAncestry = fatherAncestries.map((a) => ({
        ancestor_id: a.ancestor_id,
        descendant_id: child.id,
        depth: a.depth + 1,
      }));
      childAncestry.push({ ancestor_id: child.id, descendant_id: child.id, depth: 0 });
      await prisma.personAncestry.createMany({ data: childAncestry, skipDuplicates: true });

      // 挂到家庭
      await prisma.familyChild.create({
        data: {
          family_id: family.id,
          child_id: child.id,
          birth_order: existingChildren.length + plans.indexOf(plan) + 1,
        },
      });

      if (plan.gender === 'male') {
        nextGenMales.push(child);
      }
    }
  }

  return nextGenMales;
}

async function printDemographics(clanId: bigint, rootId: bigint) {
  const rows = await prisma.$queryRaw<Array<{ generation: number; total: number; male: number; female: number; living: number; deceased: number }>>`
    SELECT
      pa.depth + 1 AS generation,
      COUNT(*) AS total,
      SUM(CASE WHEN p.gender = 'male' THEN 1 ELSE 0 END) AS male,
      SUM(CASE WHEN p.gender = 'female' THEN 1 ELSE 0 END) AS female,
      SUM(CASE WHEN p.is_living THEN 1 ELSE 0 END) AS living,
      SUM(CASE WHEN NOT p.is_living THEN 1 ELSE 0 END) AS deceased
    FROM persons p
    JOIN person_ancestry pa ON pa.descendant_id = p.id
    WHERE p.clan_id = ${clanId}
      AND p.deleted_at IS NULL
      AND pa.ancestor_id = ${rootId}
      AND pa.depth >= 0
    GROUP BY pa.depth
    ORDER BY pa.depth
  `;
  console.log('\n  当前按世代分布：');
  console.log('  世代 | 总计 | 男 | 女 | 在世 | 已故');
  for (const r of rows) {
    console.log(`  第 ${String(r.generation).padEnd(2)} 世 | ${String(r.total).padStart(4)} | ${String(r.male).padStart(3)} | ${String(r.female).padStart(3)} | ${String(r.living).padStart(3)} | ${String(r.deceased).padStart(3)}`);
  }
}

async function main() {
  const opts = parseArgs();
  console.log(`\n[fix-modern-generations] clanSlug=${opts.clanSlug}, fromGen=${opts.fromGen}, toGen=${opts.toGen}, dryRun=${opts.dryRun}`);

  const clan = await prisma.clan.findUnique({ where: { slug: opts.clanSlug } });
  if (!clan) {
    console.error(`未找到 slug=${opts.clanSlug} 的家族`);
    process.exit(1);
  }
  console.log(`找到家族：${clan.name} (id=${clan.id})`);

  const root = await findRoot(clan.id);
  if (!root) {
    console.error('未找到家族根节点（始祖）');
    process.exit(1);
  }
  console.log(`找到始祖 id=${root.id}`);

  await printDemographics(clan.id, root.id);

  const surname = opts.surname || await inferSurname(clan.id);
  console.log(`使用姓氏：${surname}`);

  const usedNames = await loadUsedNames(clan.id);
  const random = makeRandom(opts.seed);
  const nameGen = createNameGenerator(surname, usedNames);

  const stats = { personsCreated: 0, wivesCreated: 0, childrenCreated: 0 };

  for (let gen = opts.fromGen; gen <= opts.toGen; gen++) {
    await expandGeneration(clan.id, root.id, gen, nameGen, random, opts.dryRun, stats);
  }

  console.log('\n  处理完成：');
  if (opts.dryRun) {
    console.log('  本次为预览模式，未写入数据库。');
  } else {
    console.log(`  新增人员：${stats.personsCreated}`);
    console.log(`  新增妻子：${stats.wivesCreated}`);
    console.log(`  新增子女关系：${stats.childrenCreated}`);
  }

  await printDemographics(clan.id, root.id);

  const total = await prisma.person.count({ where: { clan_id: clan.id, deleted_at: null } });
  const living = await prisma.person.count({ where: { clan_id: clan.id, is_living: true, deleted_at: null } });
  console.log(`\n  家族总人数：${total}，在世人数：${living}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[fix-modern-generations] 执行失败:', err);
  process.exit(1);
});
