import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@geneasphere/db';
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
            nickname: '演示用户·管理员',
            email: 'demo@geneasphere.com',
            gender: 'male',
            avatar_url: null,
          },
        });
        this.logger.log('演示用户已创建: 13800000000 / demo123');
      } else {
        // 确保密码始终正确，并补全用户中心字段
        await this.prisma.user.update({
          where: { phone: '13800000000' },
          data: {
            password_hash: demoPasswordHash,
            nickname: demoUser.nickname || '演示用户·管理员',
            email: demoUser.email || 'demo@geneasphere.com',
          },
        });
      }

      // 1.2 创建族员演示用户（普通成员角色）
      let demoMemberUser = await this.prisma.user.findUnique({
        where: { phone: '13800000001' },
      });

      if (!demoMemberUser) {
        demoMemberUser = await this.prisma.user.create({
          data: {
            phone: '13800000001',
            password_hash: demoPasswordHash,
            nickname: '演示族员·小明',
            email: 'member@geneasphere.com',
            gender: 'male',
            avatar_url: null,
          },
        });
        this.logger.log('族员演示用户已创建: 13800000001 / demo123');
      } else {
        await this.prisma.user.update({
          where: { phone: '13800000001' },
          data: {
            password_hash: demoPasswordHash,
            nickname: demoMemberUser.nickname || '演示族员·小明',
            email: demoMemberUser.email || 'member@geneasphere.com',
          },
        });
      }

      // 1.3 为族员演示用户创建 UserSetting
      const existingMemberSetting = await this.prisma.userSetting.findUnique({
        where: { user_id: demoMemberUser.id },
      });
      if (!existingMemberSetting) {
        await this.prisma.userSetting.create({
          data: { user_id: demoMemberUser.id },
        });
      }

      // 1.4 为演示用户创建默认 UserSetting
      const existingSetting = await this.prisma.userSetting.findUnique({
        where: { user_id: demoUser.id },
      });
      if (!existingSetting) {
        await this.prisma.userSetting.create({
          data: { user_id: demoUser.id },
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
            admin_user: { connect: { id: demoUser.id } },
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

      // 将族员演示用户添加到演示家族（EDITOR角色）
      const existingMemberClan = await this.prisma.clanMember.findUnique({
        where: {
          clan_id_user_id: {
            clan_id: demoClan.id,
            user_id: demoMemberUser.id,
          },
        },
      });
      if (!existingMemberClan) {
        await this.prisma.clanMember.create({
          data: {
            clan_id: demoClan.id,
            user_id: demoMemberUser.id,
            role: 'EDITOR', // 普通族员角色
          },
        });
        this.logger.log('族员演示用户已添加到演示家族');
      }

      // 5. 平台管理员种子
      await this.seedPlatformAdmin();
    } catch (error) {
      this.logger.error('种子数据初始化失败:', error.message);
    }
  }

  /**
   * 创建平台超级管理员账号
   */
  private async seedPlatformAdmin() {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const existing = await this.prisma.platformAdmin.findUnique({
      where: { username: 'platform_admin' },
    });
    if (!existing) {
      await this.prisma.platformAdmin.create({
        data: {
          username: 'platform_admin',
          password_hash: passwordHash,
          role: 'super',
          real_name: '超级管理员',
          phone: '13800000001',
          status: 'active',
        },
      });
      this.logger.log('✅ 平台超级管理员已创建: platform_admin / admin123');
    } else {
      // 确保密码正确
      await this.prisma.platformAdmin.update({
        where: { username: 'platform_admin' },
        data: { password_hash: passwordHash },
      });
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
          gender: 'male' as const,
          birth_date: new Date('1800-03-15'),
          death_date: new Date('1875-11-20'),
          is_living: false,
        },
        {
          clan_id: clanId,
          full_name: '李道明',
          gender: 'male' as const,
          birth_date: new Date('1830-07-08'),
          death_date: new Date('1901-02-14'),
          is_living: false,
        },
        {
          clan_id: clanId,
          full_name: '李永昌',
          gender: 'male' as const,
          birth_date: new Date('1860-01-20'),
          death_date: new Date('1938-06-05'),
          is_living: false,
        },
        {
          clan_id: clanId,
          full_name: '李正华',
          gender: 'male' as const,
          birth_date: new Date('1895-09-12'),
          death_date: new Date('1965-04-30'),
          is_living: false,
        },
        {
          clan_id: clanId,
          full_name: '李兴文',
          gender: 'male' as const,
          birth_date: new Date('1930-05-18'),
          death_date: new Date('2010-12-22'),
          is_living: false,
        },
        {
          clan_id: clanId,
          full_name: '李兴武',
          gender: 'male' as const,
          birth_date: new Date('1935-08-25'),
          death_date: new Date('2015-03-10'),
          is_living: false,
        },
        {
          clan_id: clanId,
          full_name: '李毓芬',
          gender: 'female' as const,
          birth_date: new Date('1965-03-08'),
          is_living: true,
        },
        {
          clan_id: clanId,
          full_name: '李毓刚',
          gender: 'male' as const,
          birth_date: new Date('1968-11-15'),
          is_living: true,
        },
        {
          clan_id: clanId,
          full_name: '李毓明',
          gender: 'male' as const,
          birth_date: new Date('1972-06-20'),
          is_living: true,
        },
        {
          clan_id: clanId,
          full_name: '张秀兰',
          gender: 'female' as const,
          birth_date: new Date('1898-02-10'),
          death_date: new Date('1978-08-15'),
          is_living: false,
        },
        {
          clan_id: clanId,
          full_name: '王素琴',
          gender: 'female' as const,
          birth_date: new Date('1933-11-08'),
          death_date: new Date('2018-01-25'),
          is_living: false,
        },
        {
          clan_id: clanId,
          full_name: '陈美华',
          gender: 'female' as const,
          birth_date: new Date('1938-04-12'),
          death_date: new Date('2020-07-30'),
          is_living: false,
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
    const f1 = await this.prisma.familyUnit.create({
      data: {
        clan_id: clanId,
        husband_id: findPerson('李元宗')?.id ?? null,
      },
    });
    await this.prisma.familyChild.create({
      data: { family_id: f1.id, child_id: findPerson('李道明')!.id, birth_order: 1 },
    });
    families.push(f1);

    // 李道明 → 李永昌
    const f2 = await this.prisma.familyUnit.create({
      data: {
        clan_id: clanId,
        husband_id: findPerson('李道明')?.id ?? null,
      },
    });
    await this.prisma.familyChild.create({
      data: { family_id: f2.id, child_id: findPerson('李永昌')!.id, birth_order: 1 },
    });
    families.push(f2);

    // 李永昌 → 李正华
    const f3 = await this.prisma.familyUnit.create({
      data: {
        clan_id: clanId,
        husband_id: findPerson('李永昌')?.id ?? null,
      },
    });
    await this.prisma.familyChild.create({
      data: { family_id: f3.id, child_id: findPerson('李正华')!.id, birth_order: 1 },
    });
    families.push(f3);

    // 李正华 + 张秀兰 → 李兴文, 李兴武
    const f4 = await this.prisma.familyUnit.create({
      data: {
        clan_id: clanId,
        husband_id: findPerson('李正华')?.id ?? null,
        wife_id: findPerson('张秀兰')?.id ?? null,
      },
    });
    await this.prisma.familyChild.createMany({
      data: [
        { family_id: f4.id, child_id: findPerson('李兴文')!.id, birth_order: 1 },
        { family_id: f4.id, child_id: findPerson('李兴武')!.id, birth_order: 2 },
      ],
    });
    families.push(f4);

    // 李兴文 + 王素琴 → 李毓芬, 李毓刚
    const f5 = await this.prisma.familyUnit.create({
      data: {
        clan_id: clanId,
        husband_id: findPerson('李兴文')?.id ?? null,
        wife_id: findPerson('王素琴')?.id ?? null,
      },
    });
    await this.prisma.familyChild.createMany({
      data: [
        { family_id: f5.id, child_id: findPerson('李毓芬')!.id, birth_order: 1 },
        { family_id: f5.id, child_id: findPerson('李毓刚')!.id, birth_order: 2 },
      ],
    });
    families.push(f5);

    // 李兴武 + 陈美华 → 李毓明
    const f6 = await this.prisma.familyUnit.create({
      data: {
        clan_id: clanId,
        husband_id: findPerson('李兴武')?.id ?? null,
        wife_id: findPerson('陈美华')?.id ?? null,
      },
    });
    await this.prisma.familyChild.create({
      data: { family_id: f6.id, child_id: findPerson('李毓明')!.id, birth_order: 1 },
    });
    families.push(f6);

    return families;
  }
}
