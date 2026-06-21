import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * 演示种子数据服务
 * 在模块初始化时自动创建演示账号和演示家族数据，
 * 确保营销网站的一键演示登录始终可用。
 */
@Injectable()
export class DemoSeedService implements OnModuleInit {
  private readonly logger = new Logger(DemoSeedService.name);
  private prisma = new PrismaClient();

  async onModuleInit() {
    await this.seedDemoData();
  }

  async seedDemoData() {
    try {
      // 1. 创建演示用户（如已存在则跳过）
      const demoPasswordHash = await bcrypt.hash('demo123', 10);
      let demoUser = await this.prisma.user.findUnique({
        where: { phone: '13800000000' },
      });

      if (!demoUser) {
        demoUser = await this.prisma.user.create({
          data: {
            phone: '13800000000',
            password_hash: demoPasswordHash,
          },
        });
        this.logger.log('✅ 演示用户已创建: 13800000000 / demo123');
      } else {
        // 确保密码始终正确
        await this.prisma.user.update({
          where: { phone: '13800000000' },
          data: { password_hash: demoPasswordHash },
        });
      }

      // 2. 创建演示家族（如已存在则跳过）
      let demoClan = await this.prisma.clan.findFirst({
        where: { name: '李氏宗族（演示）' },
      });

      if (!demoClan) {
        demoClan = await this.prisma.clan.create({
          data: {
            name: '李氏宗族（演示）',
            description: '这是一个演示家族，展示了根脉云谱的核心功能。包含完整的族谱树结构、人物档案和影像资料。',
          },
        });

        // 添加演示用户为家族 Owner
        await this.prisma.clanMember.create({
          data: {
            clan_id: demoClan.id,
            user_id: demoUser.id,
            role: 'OWNER',
          },
        });

        // 3. 创建演示族谱人物数据
        const ancestors = await this.createDemoPersons(demoClan.id);

        // 4. 创建家庭关系（父母-子女）
        await this.createDemoFamilies(demoClan.id, ancestors);

        this.logger.log(`✅ 演示家族已创建: ${demoClan.name}，包含 ${ancestors.length} 位族人`);
      } else {
        // 确保演示用户是家族成员
        const existingMember = await this.prisma.clanMember.findUnique({
          where: {
            clan_id_user_id: {
              clan_id: demoClan.id,
              user_id: demoUser.id,
            },
          },
        });
        if (!existingMember) {
          await this.prisma.clanMember.create({
            data: {
              clan_id: demoClan.id,
              user_id: demoUser.id,
              role: 'OWNER',
            },
          });
        }
      }
    } catch (error) {
      this.logger.error('种子数据初始化失败:', error.message);
    }
  }

  /**
   * 创建演示人物数据
   * 构建一个五代家族树：始祖 → 二世 → 三世 → 四世 → 五世
   */
  private async createDemoPersons(clanId: bigint) {
    const now = new Date();
    const persons = await this.prisma.person.createManyAndReturn({
      data: [
        {
          clan_id: clanId,
          full_name: '李元宗',
          gender: 'male',
          birth_date: new Date('1800-03-15'),
          death_date: new Date('1875-11-20'),
          is_living: false,
          generation: 1,
          xipai: '元',
          biography: '始祖李元宗，字德厚。清嘉庆年间举人，曾任县学训导。一生致力于教育事业，培养门生无数。晚年回乡修谱，为李氏宗族奠定了完整的世系记录基础。',
        },
        {
          clan_id: clanId,
          full_name: '李道明',
          gender: 'male',
          birth_date: new Date('1830-07-08'),
          death_date: new Date('1901-02-14'),
          is_living: false,
          generation: 2,
          xipai: '道',
          biography: '二世李道明，字光远。继承父业，开设私塾，在乡里颇有声望。太平天国时期曾组织乡勇保卫乡里，后被推举为族长。',
        },
        {
          clan_id: clanId,
          full_name: '李永昌',
          gender: 'male',
          birth_date: new Date('1860-01-20'),
          death_date: new Date('1938-06-05'),
          is_living: false,
          generation: 3,
          xipai: '永',
          biography: '三世李永昌，字盛之。清末秀才，光绪年间创办新式学堂。辛亥革命后任县教育会长，推动了当地新式教育的发展。',
        },
        {
          clan_id: clanId,
          full_name: '李正华',
          gender: 'male',
          birth_date: new Date('1895-09-12'),
          death_date: new Date('1965-04-30'),
          is_living: false,
          generation: 4,
          xipai: '正',
          biography: '四世李正华，字国栋。早年留学日本学习建筑，回国后参与多项重要工程建设。抗战期间内迁西南，战后回乡主持族谱续修。',
        },
        {
          clan_id: clanId,
          full_name: '李兴文',
          gender: 'male',
          birth_date: new Date('1930-05-18'),
          death_date: new Date('2010-12-22'),
          is_living: false,
          generation: 5,
          xipai: '兴',
          biography: '五世李兴文，著名历史学家。曾任省社科院研究员，专注于地方史和家族史研究。著有《李氏宗族源流考》等学术著作。',
        },
        {
          clan_id: clanId,
          full_name: '李兴武',
          gender: 'male',
          birth_date: new Date('1935-08-25'),
          death_date: new Date('2015-03-10'),
          is_living: false,
          generation: 5,
          xipai: '兴',
          biography: '五世李兴武，工程师。参与了三峡工程前期勘测工作，退休后积极推动家族文化保护。',
        },
        {
          clan_id: clanId,
          full_name: '李毓芬',
          gender: 'female',
          birth_date: new Date('1965-03-08'),
          death_date: null,
          is_living: true,
          generation: 6,
          xipai: '毓',
          biography: '六世李毓芬，医学博士。现任省人民医院心内科主任，在心血管疾病研究领域有突出贡献。',
        },
        {
          clan_id: clanId,
          full_name: '李毓刚',
          gender: 'male',
          birth_date: new Date('1968-11-15'),
          death_date: null,
          is_living: true,
          generation: 6,
          xipai: '毓',
          biography: '六世李毓刚，企业家。创立科技公司，热心家族公益事业，资助修建了李氏宗祠。',
        },
        {
          clan_id: clanId,
          full_name: '李毓明',
          gender: 'male',
          birth_date: new Date('1972-06-20'),
          death_date: null,
          is_living: true,
          generation: 6,
          xipai: '毓',
          biography: '六世李毓明，大学教授。任教于省师范大学历史系，研究方向为中国家族制度史。',
        },
        {
          clan_id: clanId,
          full_name: '张秀兰',
          gender: 'female',
          birth_date: new Date('1898-02-10'),
          death_date: new Date('1978-08-15'),
          is_living: false,
          generation: 4,
          xipai: null,
          biography: '李正华之妻，出身书香门第。相夫教子，持家有道，在战乱年代守护家族文献资料。',
        },
        {
          clan_id: clanId,
          full_name: '王素琴',
          gender: 'female',
          birth_date: new Date('1933-11-08'),
          death_date: new Date('2018-01-25'),
          is_living: false,
          generation: 5,
          xipai: null,
          biography: '李兴文之妻，小学教师。一生教书育人，桃李满天下。',
        },
        {
          clan_id: clanId,
          full_name: '陈美华',
          gender: 'female',
          birth_date: new Date('1938-04-12'),
          death_date: new Date('2020-07-30'),
          is_living: false,
          generation: 5,
          xipai: null,
          biography: '李兴武之妻，护士长。在县医院工作四十年，被当地人亲切地称为"陈妈妈"。',
        },
      ],
    });

    return persons;
  }

  /**
   * 创建家庭关系（父母-子女）和配偶关系
   */
  private async createDemoFamilies(clanId: bigint, persons: any[]) {
    const findPerson = (name: string) => persons.find((p: any) => p.full_name === name);
    const families = [];

    // 李元宗 → 李道明
    const f1 = await this.prisma.family.create({
      data: {
        clan_id: clanId,
        father_id: findPerson('李元宗')?.id ?? null,
        mother_id: null,
      },
    });
    await this.prisma.familyChild.create({
      data: { family_id: f1.id, person_id: findPerson('李道明')!.id },
    });
    families.push(f1);

    // 李道明 → 李永昌
    const f2 = await this.prisma.family.create({
      data: {
        clan_id: clanId,
        father_id: findPerson('李道明')?.id ?? null,
        mother_id: null,
      },
    });
    await this.prisma.familyChild.create({
      data: { family_id: f2.id, person_id: findPerson('李永昌')!.id },
    });
    families.push(f2);

    // 李永昌 → 李正华
    const f3 = await this.prisma.family.create({
      data: {
        clan_id: clanId,
        father_id: findPerson('李永昌')?.id ?? null,
        mother_id: null,
      },
    });
    await this.prisma.familyChild.create({
      data: { family_id: f3.id, person_id: findPerson('李正华')!.id },
    });
    families.push(f3);

    // 李正华 + 张秀兰 → 李兴文, 李兴武
    const f4 = await this.prisma.family.create({
      data: {
        clan_id: clanId,
        father_id: findPerson('李正华')?.id ?? null,
        mother_id: findPerson('张秀兰')?.id ?? null,
      },
    });
    await this.prisma.familyChild.createMany({
      data: [
        { family_id: f4.id, person_id: findPerson('李兴文')!.id },
        { family_id: f4.id, person_id: findPerson('李兴武')!.id },
      ],
    });
    families.push(f4);

    // 李兴文 + 王素琴 → 李毓芬, 李毓刚
    const f5 = await this.prisma.family.create({
      data: {
        clan_id: clanId,
        father_id: findPerson('李兴文')?.id ?? null,
        mother_id: findPerson('王素琴')?.id ?? null,
      },
    });
    await this.prisma.familyChild.createMany({
      data: [
        { family_id: f5.id, person_id: findPerson('李毓芬')!.id },
        { family_id: f5.id, person_id: findPerson('李毓刚')!.id },
      ],
    });
    families.push(f5);

    // 李兴武 + 陈美华 → 李毓明
    const f6 = await this.prisma.family.create({
      data: {
        clan_id: clanId,
        father_id: findPerson('李兴武')?.id ?? null,
        mother_id: findPerson('陈美华')?.id ?? null,
      },
    });
    await this.prisma.familyChild.create({
      data: { family_id: f6.id, person_id: findPerson('李毓明')!.id },
    });
    families.push(f6);

    return families;
  }
}
