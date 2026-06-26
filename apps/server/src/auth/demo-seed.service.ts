import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient, Gender } from '@geneasphere/db';
import * as bcrypt from 'bcryptjs';
import {
  ADMIN_AVATAR,
  MEMBER_AVATAR,
  HISTORICAL_AVATAR,
  MALE_AVATAR,
  FEMALE_AVATAR,
  CLAN_COVER_IMAGE,
} from './demo-assets';
/**
 * 演示种子数据服务 - 朱熹族谱版（1000 人）
 * 始祖朱熹（1130-1200），覆盖约 28 代。
 */
@Injectable()
export class DemoSeedService implements OnModuleInit {
  private readonly logger = new Logger(DemoSeedService.name);
  private prisma = new PrismaClient();
  async onModuleInit() { await this.seedDemoData(); }
  async resetDemoClanData(clanId: bigint) {
    await this.prisma.familyChild.deleteMany({ where: { family: { clan_id: clanId } } });
    await this.prisma.familyUnit.deleteMany({ where: { clan_id: clanId } });
    await this.prisma.personAncestry.deleteMany({
      where: { OR: [{ ancestor: { clan_id: clanId } }, { descendant: { clan_id: clanId } }] },
    });
    await this.prisma.person.deleteMany({ where: { clan_id: clanId } });
    this.logger.log(`已清空家族 ${clanId} 的人物/家庭/祖先关系`);
  }
  async seedDemoData() {
    try {
      const demoPasswordHash = await bcrypt.hash('demo123', 10);
      let demoUser = await this.prisma.user.findUnique({ where: { phone: '13800000000' } });
      if (!demoUser) {
        demoUser = await this.prisma.user.create({
          data: {
            phone: '13800000000',
            password_hash: demoPasswordHash,
            nickname: '演示用户·管理员',
            email: 'demo@geneasphere.com',
            gender: 'male',
            avatar_url: ADMIN_AVATAR,
          },
        });
        this.logger.log(`演示用户已创建: 13800000000 / demo123 (avatar=${ADMIN_AVATAR})`);
      } else {
        await this.prisma.user.update({
          where: { phone: '13800000000' },
          data: {
            password_hash: demoPasswordHash,
            nickname: demoUser.nickname || '演示用户·管理员',
            email: demoUser.email || 'demo@geneasphere.com',
            avatar_url: demoUser.avatar_url || ADMIN_AVATAR,
          },
        });
      }
      let demoMemberUser = await this.prisma.user.findUnique({ where: { phone: '13800000001' } });
      if (!demoMemberUser) {
        demoMemberUser = await this.prisma.user.create({
          data: {
            phone: '13800000001',
            password_hash: demoPasswordHash,
            nickname: '演示族员·朱小小',
            email: 'member@geneasphere.com',
            gender: 'male',
            avatar_url: MEMBER_AVATAR,
          },
        });
      } else {
        await this.prisma.user.update({
          where: { phone: '13800000001' },
          data: {
            password_hash: demoPasswordHash,
            nickname: demoMemberUser.nickname || '演示族员·朱小小',
            email: demoMemberUser.email || 'member@geneasphere.com',
            avatar_url: demoMemberUser.avatar_url || MEMBER_AVATAR,
          },
        });
      }
      for (const userId of [demoUser.id, demoMemberUser.id]) {
        const setting = await this.prisma.userSetting.findUnique({ where: { user_id: userId } });
        if (!setting) await this.prisma.userSetting.create({ data: { user_id: userId } });
      }
      const legacyClan = await this.prisma.clan.findFirst({ where: { name: '李氏宗族（演示）' } });
      if (legacyClan) {
        this.logger.log(`发现旧演示家族 李氏宗族（演示）(id=${legacyClan.id})，清理中...`);
        await this.resetDemoClanData(legacyClan.id);
        await this.prisma.clanMember.deleteMany({ where: { clan_id: legacyClan.id } });
        await this.prisma.clan.delete({ where: { id: legacyClan.id } });
        this.logger.log('旧演示家族已清理');
      }
      let demoClan = await this.prisma.clan.findFirst({ where: { name: '朱熹族谱（演示）' } });
      const isFirstCreate = !demoClan;
      if (!demoClan) {
        demoClan = await this.prisma.clan.create({
          data: { name: '朱熹族谱（演示）', description: this.buildClanDescription(), admin_user: { connect: { id: demoUser.id } } },
        });
        await this.prisma.clanMember.create({ data: { clan_id: demoClan.id, user_id: demoUser.id, role: 'OWNER' } });
        const stats = await this.createDemoZhuXiGenealogy(demoClan.id);
        this.logger.log(`✅ 朱熹族谱已生成: ${stats.totalPersons} 位族人, ${stats.totalFamilies} 个家庭`);
      } else {
        const existing = await this.prisma.clanMember.findUnique({ where: { clan_id_user_id: { clan_id: demoClan.id, user_id: demoUser.id } } });
        if (!existing) await this.prisma.clanMember.create({ data: { clan_id: demoClan.id, user_id: demoUser.id, role: 'OWNER' } });
      }
      const existingMemberClan = await this.prisma.clanMember.findUnique({ where: { clan_id_user_id: { clan_id: demoClan.id, user_id: demoMemberUser.id } } });
      if (!existingMemberClan) await this.prisma.clanMember.create({ data: { clan_id: demoClan.id, user_id: demoMemberUser.id, role: 'EDITOR' } });

      // ==================== 朱小小 Person 记录 + PersonUserLink 关联 ====================
      // 族员演示账号（13800000001）作为朱熹长房后裔"朱小小"在族谱中真实存在
      // 使用 upsert 保证幂等：多次启动 seed 不会重复创建
      let zhuxiaoxiao = await this.prisma.person.findFirst({
        where: { clan_id: demoClan.id, full_name: '朱小小' },
      });
      if (!zhuxiaoxiao) {
        zhuxiaoxiao = await this.prisma.person.create({
          data: {
            clan_id: demoClan.id,
            full_name: '朱小小',
            gender: 'male' as Gender,
            birth_date: new Date('2000-01-01'),
            death_date: null,
            is_living: true,
            birth_place: '福建武夷山',
            migration_branch: 'A',
            avatar_url: MEMBER_AVATAR,
            thumbnail_url: MEMBER_AVATAR,
          },
        });
        this.logger.log(`✅ 朱小小 Person 记录已创建: id=${zhuxiaoxiao.id}`);
      } else if (!zhuxiaoxiao.avatar_url) {
        zhuxiaoxiao = await this.prisma.person.update({
          where: { id: zhuxiaoxiao.id },
          data: { avatar_url: MEMBER_AVATAR, thumbnail_url: MEMBER_AVATAR },
        });
      }

      // 创建或更新 PersonUserLink 关联（族员账号 ↔ 朱小小 Person）
      const existingLink = await this.prisma.personUserLink.findFirst({
        where: { user_id: demoMemberUser.id, person_id: zhuxiaoxiao.id, relation_role: 'self' },
      });
      if (!existingLink) {
        await this.prisma.personUserLink.create({
          data: {
            user_id: demoMemberUser.id,
            person_id: zhuxiaoxiao.id,
            relation_role: 'self',
            verified_at: new Date(),
          },
        });
        this.logger.log(`✅ PersonUserLink 已创建: user=${demoMemberUser.id} -> 朱小小(person=${zhuxiaoxiao.id})`);
      }

      // 仅在首次创建家族时设置完整 description（避免每次启动都写库）
      if (isFirstCreate) {
        await this.prisma.clan.update({
          where: { id: demoClan.id },
          data: { description: this.buildClanDescription() },
        });
      }

      await this.seedPlatformAdmin();
    } catch (error) {
      this.logger.error('种子数据初始化失败:', error.message);
      this.logger.error(error.stack);
    }
  }
  private async seedPlatformAdmin() {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const existing = await this.prisma.platformAdmin.findUnique({ where: { username: 'platform_admin' } });
    if (!existing) {
      await this.prisma.platformAdmin.create({ data: { username: 'platform_admin', password_hash: passwordHash, role: 'super', real_name: '超级管理员', phone: '13800000001', status: 'active' } });
    } else {
      await this.prisma.platformAdmin.update({ where: { username: 'platform_admin' }, data: { password_hash: passwordHash } });
    }
  }

  /** 构造演示家族的完整 description（含朱小小介绍） */
  private buildClanDescription(): string {
    return `南宋理学家朱熹（1130-1200）后裔族谱演示，涵盖约 28 代、1000 位族人。\n\n演示族员「朱小小」：朱熹长房 30 世孙，2000 年生于福建武夷山，毕业于厦门大学软件工程系，现从事家族数字化工作。`;
  }
  private static readonly TARGET_POPULATION = 1000;
  private static readonly CURRENT_YEAR = 2025;
  private static readonly GENERATION_YEARS = 32;
  private static readonly ZIBEI_CHARS = ['熹','塾','埜','在','鉴','铨','潜','鋆','浚','洪','沐','深','桂','桐','森','柄','模','朴','梓','樾','楷','检','樽','栻','栉','栒','栋','梁'];
  private static readonly MALE_GIVEN_NAMES = ['康','宁','安','平','泰','昌','盛','荣','华','耀','明','德','仁','义','礼','智','信','忠','孝','廉','邦','国','家','民','世','代','永','长','久','远','福','禄','寿','喜','财','源','海','山','川','林','涛','波','渊','文','武','斌','勇','强','伟','雄','辉','光','星','辰','天','地','宇','宙','鸿','志','远','翔','飞','龙','虎','豹','麟','凤','祺','瑞'];
  private static readonly MARRIAGE_SURNAMES = ['刘','陈','张','王','李','赵','黄','周','吴','徐','孙','胡','高','林','何','郭','马','罗','梁','宋','郑','谢','韩','唐','冯','于','董','萧','程','曹','袁','邓','许','傅','沈','曾','彭','吕','苏','卢','蒋','蔡','贾','丁','魏','薛','叶','阎','余','潘'];
  private static readonly FEMALE_GIVEN_NAMES = ['娘','姑','英','华','芳','芬','萍','莉','梅','兰','菊','竹','莲','荷','玉','珍','珠','翠','凤','鸾','燕','莺','蝶','娥','媛','婷','娟','秀','惠','敏','慧','巧','美','丽','倩','仪','静','娴','淑','贤','德','贞','婉','柔','云','霞','月','星','瑶','琼'];
  private static readonly BIRTH_PLACES = ['婺源','徽州','建阳','崇安','武夷山','杭州','福州','江西婺源','安徽歙县','福建建瓯','浙江淳安','江苏苏州'];
  private static readonly HISTORICAL_FIGURES: HistoricalFigure[] = [
    { name: '朱熹', gender: 'male', birth: 1130, death: 1200, generation: 1, branch: 'A' },
    { name: '刘氏', gender: 'female', birth: 1132, death: 1195, generation: 1, branch: 'A' },
    { name: '朱塾', gender: 'male', birth: 1153, death: 1191, generation: 2, father: '朱熹', mother: '刘氏', branch: 'A' },
    { name: '朱埜', gender: 'male', birth: 1156, death: 1212, generation: 2, father: '朱熹', mother: '刘氏', branch: 'B' },
    { name: '朱在', gender: 'male', birth: 1169, death: 1239, generation: 2, father: '朱熹', mother: '刘氏', branch: 'C' },
    { name: '林氏', gender: 'female', birth: 1155, death: 1215, generation: 2, branch: 'A' },
    { name: '赵氏', gender: 'female', birth: 1158, death: 1218, generation: 2, branch: 'B' },
    { name: '范氏', gender: 'female', birth: 1172, death: 1240, generation: 2, branch: 'C' },
    { name: '朱鉴', gender: 'male', birth: 1190, death: 1258, generation: 3, father: '朱塾', mother: '林氏', branch: 'A' },
    { name: '朱铨', gender: 'male', birth: 1195, death: 1260, generation: 3, father: '朱塾', mother: '林氏', branch: 'A' },
    { name: '朱潜', gender: 'male', birth: 1200, death: 1270, generation: 3, father: '朱埜', mother: '赵氏', branch: 'B' },
    { name: '朱鋆', gender: 'male', birth: 1205, death: 1275, generation: 3, father: '朱在', mother: '范氏', branch: 'C' },
    { name: '郑氏', gender: 'female', birth: 1192, death: 1265, generation: 3, branch: 'A' },
    { name: '王氏', gender: 'female', birth: 1198, death: 1268, generation: 3, branch: 'A' },
    { name: '孙氏', gender: 'female', birth: 1203, death: 1275, generation: 3, branch: 'B' },
    { name: '徐氏', gender: 'female', birth: 1208, death: 1280, generation: 3, branch: 'C' },
    { name: '朱浚', gender: 'male', birth: 1220, death: 1290, generation: 4, father: '朱鉴', mother: '郑氏', branch: 'A' },
    { name: '朱洪', gender: 'male', birth: 1225, death: 1295, generation: 4, father: '朱铨', mother: '王氏', branch: 'A' },
    { name: '朱沐', gender: 'male', birth: 1230, death: 1300, generation: 4, father: '朱潜', mother: '孙氏', branch: 'B' },
    { name: '朱深', gender: 'male', birth: 1235, death: 1305, generation: 4, father: '朱鋆', mother: '徐氏', branch: 'C' },
    { name: '陈氏', gender: 'female', birth: 1223, death: 1293, generation: 4, branch: 'A' },
    { name: '周氏', gender: 'female', birth: 1228, death: 1298, generation: 4, branch: 'A' },
    { name: '吴氏', gender: 'female', birth: 1233, death: 1303, generation: 4, branch: 'B' },
    { name: '何氏', gender: 'female', birth: 1238, death: 1308, generation: 4, branch: 'C' },
    { name: '朱桂', gender: 'male', birth: 1252, death: 1320, generation: 5, father: '朱浚', mother: '陈氏', branch: 'A' },
    { name: '朱桐', gender: 'male', birth: 1258, death: 1325, generation: 5, father: '朱洪', mother: '周氏', branch: 'A' },
    { name: '朱森', gender: 'male', birth: 1263, death: 1330, generation: 5, father: '朱沐', mother: '吴氏', branch: 'B' },
    { name: '朱柄', gender: 'male', birth: 1268, death: 1335, generation: 5, father: '朱深', mother: '何氏', branch: 'C' },
    { name: '郭氏', gender: 'female', birth: 1255, death: 1323, generation: 5, branch: 'A' },
    { name: '马氏', gender: 'female', birth: 1260, death: 1328, generation: 5, branch: 'A' },
    { name: '黄氏', gender: 'female', birth: 1265, death: 1333, generation: 5, branch: 'B' },
    { name: '罗氏', gender: 'female', birth: 1270, death: 1338, generation: 5, branch: 'C' },
  ];
  private async createDemoZhuXiGenealogy(clanId: bigint) {
    const startTime = Date.now();
    this.logger.log('开始生成朱熹族谱 1000 人演示数据...');
    const historicalMap = new Map<string, bigint>();
    const historicalData = DemoSeedService.HISTORICAL_FIGURES.map((f) => ({
      clan_id: clanId,
      full_name: f.name,
      gender: f.gender as Gender,
      birth_date: new Date(`${f.birth}-01-01`),
      death_date: f.death ? new Date(`${f.death}-12-31`) : null,
      is_living: !f.death || f.death >= DemoSeedService.CURRENT_YEAR,
      birth_place: DemoSeedService.BIRTH_PLACES[f.generation % DemoSeedService.BIRTH_PLACES.length],
      migration_branch: f.branch,
      avatar_url: HISTORICAL_AVATAR(f.generation * 10 + (f.branch ? f.branch.charCodeAt(0) : 0), f.gender),
    }));
    const createdHistorical = await this.prisma.person.createManyAndReturn({ data: historicalData });
    createdHistorical.forEach((p, idx) => { historicalMap.set(DemoSeedService.HISTORICAL_FIGURES[idx].name, p.id); });
    this.logger.log(`  [1/5] 历史核心层: ${createdHistorical.length} 人`);
    const famIdx = new Map<string, number>();
    const familiesArr: Array<{ clan_id: bigint; husband_id: bigint | null; wife_id: bigint | null; union_type: string }> = [];
    const childrenArr: Array<{ family_key: string; child_key: string; birth_order: number }> = [];
    const createCouple = (key: string, husbandName: string, wifeName?: string) => {
      const idx = familiesArr.length;
      familiesArr.push({ clan_id: clanId, husband_id: historicalMap.get(husbandName) ?? null, wife_id: wifeName ? historicalMap.get(wifeName) ?? null : null, union_type: 'normal' });
      famIdx.set(key, idx);
      return idx;
    };
    const addChild = (familyKey: string, childName: string, birthOrder: number) => { childrenArr.push({ family_key: familyKey, child_key: childName, birth_order: birthOrder }); };
    createCouple('F-朱熹','朱熹','刘氏');
    addChild('F-朱熹','朱塾',1);addChild('F-朱熹','朱埜',2);addChild('F-朱熹','朱在',3);
    createCouple('F-朱塾','朱塾','林氏');
    addChild('F-朱塾','朱鉴',1);addChild('F-朱塾','朱铨',2);
    createCouple('F-朱埜','朱埜','赵氏');
    addChild('F-朱埜','朱潜',1);
    createCouple('F-朱在','朱在','范氏');
    addChild('F-朱在','朱鋆',1);
    createCouple('F-朱鉴','朱鉴','郑氏');
    addChild('F-朱鉴','朱浚',1);
    createCouple('F-朱铨','朱铨','王氏');
    addChild('F-朱铨','朱洪',1);
    createCouple('F-朱潜','朱潜','孙氏');
    addChild('F-朱潜','朱沐',1);
    createCouple('F-朱鋆','朱鋆','徐氏');
    addChild('F-朱鋆','朱深',1);
    createCouple('F-朱浚','朱浚','陈氏');
    addChild('F-朱浚','朱桂',1);
    createCouple('F-朱洪','朱洪','周氏');
    addChild('F-朱洪','朱桐',1);
    createCouple('F-朱沐','朱沐','吴氏');
    addChild('F-朱沐','朱森',1);
    createCouple('F-朱深','朱深','何氏');
    addChild('F-朱深','朱柄',1);
    createCouple('F-朱桂','朱桂','郭氏');
    createCouple('F-朱桐','朱桐','马氏');
    createCouple('F-朱森','朱森','黄氏');
    createCouple('F-朱柄','朱柄','罗氏');
    const histFamilies=await this.prisma.familyUnit.createManyAndReturn({data:familiesArr});
    const histFamilyIdMap=new Map<string,bigint>();
    famIdx.forEach((arrIdx,key)=>{histFamilyIdMap.set(key,histFamilies[arrIdx].id);});
    this.logger.log('  [2/5] 历史家庭层: '+histFamilies.length+' 个家庭');
    const histChildIns=childrenArr.map(c=>({family_id:histFamilyIdMap.get(c.family_key),child_id:historicalMap.get(c.child_key),birth_order:c.birth_order}));
    if(histChildIns.length>0) await this.prisma.familyChild.createMany({data:histChildIns});
    this.logger.log('        历史子女关系: '+histChildIns.length+' 条');

    const breedingPool: Array<{name:string;gen:number;birth:number;branch:string;wifeName:string|null;}> = [];
    const fifthGenMales = DemoSeedService.HISTORICAL_FIGURES.filter((f) => f.gender === 'male' && f.generation === 5);
    const wifeMap5 = new Map<string,string>([['朱桂','郭氏'],['朱桐','马氏'],['朱森','黄氏'],['朱柄','罗氏']]);
    for (const f of fifthGenMales) {
      breedingPool.push({name: f.name, gen: f.generation, birth: f.birth, branch: f.branch || 'A', wifeName: wifeMap5.get(f.name) || null});
    }
    const usedNames = new Set<string>(DemoSeedService.HISTORICAL_FIGURES.map((f) => f.name));
    const newPeopleData: any[] = [];
    const newFamiliesData: Array<{key:string;husbandName:string;wifeName:string|null;childNames:string[];childOrders:number[];}> = [];
    let nameIdx = 0;
    let zibeiIdx = 5;
    const nextName = (): string => {
      const zibei = DemoSeedService.ZIBEI_CHARS[zibeiIdx % DemoSeedService.ZIBEI_CHARS.length];
      zibeiIdx++;
      const given = DemoSeedService.MALE_GIVEN_NAMES[nameIdx % DemoSeedService.MALE_GIVEN_NAMES.length];
      nameIdx++;
      return '朱' + zibei + given;
    };
    const nextWifeName = (): string => {
      const sn = DemoSeedService.MARRIAGE_SURNAMES[nameIdx % DemoSeedService.MARRIAGE_SURNAMES.length];
      const fn = DemoSeedService.FEMALE_GIVEN_NAMES[(nameIdx + 3) % DemoSeedService.FEMALE_GIVEN_NAMES.length];
      nameIdx += 2;
      return sn + fn;
    };
    const ensureUnique = (baseName: string, isMale: boolean): string => {
      let nm = baseName;
      let attempt = 0;
      while (usedNames.has(nm) && attempt < 50) {
        if (isMale) {
          const zibei = DemoSeedService.ZIBEI_CHARS[zibeiIdx % DemoSeedService.ZIBEI_CHARS.length];
          zibeiIdx++;
          const given = DemoSeedService.MALE_GIVEN_NAMES[(nameIdx + attempt) % DemoSeedService.MALE_GIVEN_NAMES.length];
          nm = '朱' + zibei + given;
        } else {
          const sn = DemoSeedService.MARRIAGE_SURNAMES[(nameIdx + attempt) % DemoSeedService.MARRIAGE_SURNAMES.length];
          const fn = DemoSeedService.FEMALE_GIVEN_NAMES[(nameIdx + attempt + 5) % DemoSeedService.FEMALE_GIVEN_NAMES.length];
          nm = sn + fn;
        }
        attempt++;
      }
      usedNames.add(nm);
      return nm;
    };
    this.logger.log('  [3/5] 开始程序化繁衍生成新人物...');
    let generation = 6;
    let totalCreated = 0;
    const totalTarget = DemoSeedService.TARGET_POPULATION - DemoSeedService.HISTORICAL_FIGURES.length;

    const totalTargetByGen: Record<number, number> = {
      6: 6, 7: 10, 8: 14, 9: 18, 10: 22, 11: 26, 12: 30, 13: 32, 14: 34, 15: 36,
      16: 38, 17: 38, 18: 36, 19: 34, 20: 32, 21: 28, 22: 24, 23: 20, 24: 16,
      25: 12, 26: 8, 27: 6, 28: 4, 29: 2,
    };
    const allMalesArr: Array<{name:string;gen:number;birth:number;branch:string;wifeName:string|null;}> = breedingPool.slice();
    while (totalCreated < totalTarget && generation <= 30) {
      const targetNewMales = totalTargetByGen[generation] || 0;
      if (targetNewMales === 0 || allMalesArr.length === 0) {
        generation++;
        continue;
      }
      for (let i = 0; i < targetNewMales && totalCreated < totalTarget; i++) {
        const fatherIdx = (i + generation * 7 + nameIdx) % allMalesArr.length;
        const father = allMalesArr[fatherIdx];
        const fatherWife = father.wifeName;
        const sonName = ensureUnique(nextName(), true);
        const sonBirth = father.birth + 25 + ((i + generation) % 8);
        const sonDeath = sonBirth + 40 + ((nameIdx + i) % 50);
        newPeopleData.push({
          name: sonName, gender: 'male', birth: sonBirth, death: sonDeath,
          gen: generation, branch: father.branch, is_living: sonDeath >= DemoSeedService.CURRENT_YEAR,
        });
        totalCreated++;
        const wname = ensureUnique(nextWifeName(), false);
        const wBirth = sonBirth + 18 + ((nameIdx + i) % 8);
        const wDeath = wBirth + 30 + ((nameIdx + i) % 55);
        newPeopleData.push({
          name: wname, gender: 'female', birth: wBirth, death: wDeath,
          gen: generation, branch: father.branch, is_living: wDeath >= DemoSeedService.CURRENT_YEAR,
        });
        totalCreated++;
        const childNames: string[] = [];
        const childOrders: number[] = [];
        if ((nameIdx + i) % 2 === 0 && totalCreated < totalTarget) {
          const daughterName = ensureUnique(nextWifeName(), false);
          const dBirth = sonBirth + 3;
          const dDeath = dBirth + 35 + ((nameIdx + i) % 50);
          newPeopleData.push({
            name: daughterName, gender: 'female', birth: dBirth, death: dDeath,
            gen: generation, branch: father.branch, is_living: dDeath >= DemoSeedService.CURRENT_YEAR,
          });
          totalCreated++;
          childNames.push(daughterName);
          childOrders.push(2);
        }
        newFamiliesData.push({
          key: 'F-' + sonName + '-c1',
          husbandName: sonName,
          wifeName: wname,
          childNames: childNames,
          childOrders: childOrders,
        });
        newFamiliesData.push({
          key: 'F-' + father.name + '-' + sonName,
          husbandName: father.name,
          wifeName: fatherWife,
          childNames: [sonName],
          childOrders: [1],
        });
        allMalesArr.push({name: sonName, gen: generation, birth: sonBirth, branch: father.branch, wifeName: wname});
      }
      generation++;
    }
    this.logger.log('        新人物: ' + newPeopleData.length + ' (目标 ' + totalTarget + ')');

    const newPersonInsertData = newPeopleData.map((p) => ({
      clan_id: clanId,
      full_name: p.name,
      gender: p.gender as Gender,
      birth_date: new Date(p.birth + '-01-01'),
      death_date: p.death ? new Date(p.death + '-12-31') : null,
      is_living: p.is_living,
      birth_place: DemoSeedService.BIRTH_PLACES[p.gen % DemoSeedService.BIRTH_PLACES.length],
      migration_branch: p.branch,
      avatar_url: p.gender === 'male' ? MALE_AVATAR(p.gen * 100 + totalCreated) : FEMALE_AVATAR(p.gen * 100 + totalCreated),
    }));
    const CHUNK = 200;
    const allNewPersons: any[] = [];
    for (let i = 0; i < newPersonInsertData.length; i += CHUNK) {
      const chunk = newPersonInsertData.slice(i, i + CHUNK);
      const inserted = await this.prisma.person.createManyAndReturn({ data: chunk });
      allNewPersons.push(...inserted);
    }
    const newPersonMap = new Map<string, bigint>();
    allNewPersons.forEach((p) => { newPersonMap.set(p.full_name, p.id); });
    this.logger.log('        已插入新人物: ' + allNewPersons.length);
    const fullPersonMap = new Map<string, bigint>();
    historicalMap.forEach((id, name) => { fullPersonMap.set(name, id); });
    newPersonMap.forEach((id, name) => { fullPersonMap.set(name, id); });
    const newFamiliesInsertData: Array<{clan_id:bigint;husband_id:bigint|null;wife_id:bigint|null;union_type:string;}> = [];
    const newFamilyKeyToIdx = new Map<string, number>();
    for (const fam of newFamiliesData) {
      const hId = fullPersonMap.get(fam.husbandName);
      if (!hId) continue;
      const wId = fam.wifeName ? fullPersonMap.get(fam.wifeName) : null;
      newFamiliesInsertData.push({ clan_id: clanId, husband_id: hId, wife_id: wId, union_type: 'normal' });
      newFamilyKeyToIdx.set(fam.key, newFamiliesInsertData.length - 1);
    }
    const insertedNewFamilies = await this.prisma.familyUnit.createManyAndReturn({ data: newFamiliesInsertData });
    this.logger.log('  [4/5] 新家庭层: ' + insertedNewFamilies.length + ' 个家庭');
    const newFamilyIdMap = new Map<string, bigint>();
    newFamilyKeyToIdx.forEach((arrIdx, key) => { newFamilyIdMap.set(key, insertedNewFamilies[arrIdx].id); });
    const newChildInserts: Array<{family_id:bigint;child_id:bigint;birth_order:number;}> = [];
    for (const fam of newFamiliesData) {
      const fId = newFamilyIdMap.get(fam.key);
      if (!fId) continue;
      for (let c = 0; c < fam.childNames.length; c++) {
        const cId = fullPersonMap.get(fam.childNames[c]);
        if (cId) newChildInserts.push({ family_id: fId, child_id: cId, birth_order: fam.childOrders[c] || (c + 1) });
      }
    }
    if (newChildInserts.length > 0) {
      for (let i = 0; i < newChildInserts.length; i += CHUNK) {
        await this.prisma.familyChild.createMany({ data: newChildInserts.slice(i, i + CHUNK) });
      }
    }
    this.logger.log('        新子女关系: ' + newChildInserts.length + ' 条');

    this.logger.log('  [5/5] 构建 PersonAncestry 祖先关系表...');
    const allFC = await this.prisma.familyChild.findMany({
      where: { family: { clan_id: clanId } },
      select: { child_id: true, family: { select: { husband_id: true } } },
    });
    const parentMap = new Map<bigint, bigint>();
    const childrenMap = new Map<bigint, bigint[]>();
    for (const fc of allFC) {
      if (fc.family.husband_id) {
        parentMap.set(fc.child_id, fc.family.husband_id);
        if (!childrenMap.has(fc.family.husband_id)) childrenMap.set(fc.family.husband_id, []);
        childrenMap.get(fc.family.husband_id)!.push(fc.child_id);
      }
    }
    const depth1Inserts: Array<{ancestor_id:bigint;descendant_id:bigint;depth:number;}> = [];
    for (const [child, father] of parentMap.entries()) {
      depth1Inserts.push({ ancestor_id: father, descendant_id: child, depth: 1 });
    }
    for (let i = 0; i < depth1Inserts.length; i += CHUNK) {
      await this.prisma.personAncestry.createMany({ data: depth1Inserts.slice(i, i + CHUNK) });
    }
    this.logger.log('        depth=1: ' + depth1Inserts.length + ' 条');
    let currentDepth = 1;
    const MAX_DEPTH = 30;
    while (currentDepth < MAX_DEPTH) {
      const currentRecords = await this.prisma.personAncestry.findMany({
        where: { depth: currentDepth },
        select: { ancestor_id: true, descendant_id: true },
      });
      if (currentRecords.length === 0) break;
      const nextInsertsMap = new Map<string, {ancestor_id:bigint;descendant_id:bigint;depth:number;}>();
      for (const rec of currentRecords) {
        const children = childrenMap.get(rec.descendant_id) || [];
        for (const child of children) {
          const key = rec.ancestor_id.toString() + '_' + child.toString();
          if (!nextInsertsMap.has(key)) {
            nextInsertsMap.set(key, { ancestor_id: rec.ancestor_id, descendant_id: child, depth: currentDepth + 1 });
          }
        }
      }
      if (nextInsertsMap.size === 0) break;
      const nextInserts = Array.from(nextInsertsMap.values());
      for (let i = 0; i < nextInserts.length; i += CHUNK) {
        await this.prisma.personAncestry.createMany({ data: nextInserts.slice(i, i + CHUNK) });
      }
      this.logger.log('        depth=' + (currentDepth + 1) + ': ' + nextInserts.length + ' 条');
      currentDepth++;
    }
    const totalPersonCount = await this.prisma.person.count({ where: { clan_id: clanId } });
    const totalFamilyCount = await this.prisma.familyUnit.count({ where: { clan_id: clanId } });
    const totalAncestryCount = await this.prisma.personAncestry.count({
      where: { OR: [{ ancestor: { clan_id: clanId } }, { descendant: { clan_id: clanId } }] },
    });
    const elapsed = Date.now() - startTime;
    this.logger.log('✅ 朱熹族谱生成完成: ' + totalPersonCount + ' 人, ' + totalFamilyCount + ' 个家庭, ' + totalAncestryCount + ' 条祖先关系 (耗时 ' + elapsed + 'ms)');
    return { totalPersons: totalPersonCount, totalFamilies: totalFamilyCount, totalAncestry: totalAncestryCount };
  }
}
interface HistoricalFigure {
  name: string;
  gender: 'male' | 'female';
  birth: number;
  death?: number;
  generation: number;
  father?: string;
  mother?: string;
  branch?: string;
}
