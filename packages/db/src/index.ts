export * from '@prisma/client';
export { RelationChangeStatus, RelationChangeType, RelationPrivacyLevel, CustodyStatus, MarriageType, MarriageEndReason, FamilyRelationChange, ChildCustodyRecord, MarriageHistory, RelationPrivacyPreference } from '@prisma/client';
import { PrismaClient, Gender } from '@prisma/client';
import { Injectable, Module, OnModuleInit, Global, Logger } from '@nestjs/common';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 5000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.$connect();
        this.logger.log('数据库连接成功');
        return;
      } catch (error) {
        this.logger.warn(`数据库连接失败 (第 ${attempt}/${MAX_RETRIES} 次): ${error.message}`);
        if (attempt === MAX_RETRIES) {
          this.logger.error('数据库重连已达最大次数，放弃连接');
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

const prisma = new PrismaClient();

export class PersonService {
  async createPerson(
    data: {
      clan_id: bigint;
      full_name: string;
      gender: Gender;
      birth_date?: Date;
      death_date?: Date;
      is_living?: boolean;
    },
    parent_id?: bigint
  ) {
    return await prisma.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          clan_id: data.clan_id,
          full_name: data.full_name,
          gender: data.gender,
          birth_date: data.birth_date,
          death_date: data.death_date,
          is_living: data.is_living ?? true,
        },
      });

      const ancestryRecords: { ancestor_id: bigint; descendant_id: bigint; depth: number }[] = [];

      ancestryRecords.push({
        ancestor_id: person.id,
        descendant_id: person.id,
        depth: 0,
      });

      if (parent_id) {
        const parentAncestries = await tx.personAncestry.findMany({
          where: { descendant_id: parent_id },
          select: { ancestor_id: true, depth: true },
        });

        for (const pa of parentAncestries) {
          ancestryRecords.push({
            ancestor_id: pa.ancestor_id,
            descendant_id: person.id,
            depth: pa.depth + 1,
          });
        }
      }

      await tx.personAncestry.createMany({
        data: ancestryRecords,
      });

      return person;
    });
  }

  async getAncestors(descendant_id: bigint) {
    return await prisma.personAncestry.findMany({
      where: { descendant_id },
      include: { ancestor: true },
      orderBy: { depth: 'asc' },
    });
  }

  async getDescendants(ancestor_id: bigint) {
    return await prisma.personAncestry.findMany({
      where: { ancestor_id },
      include: { descendant: true },
      orderBy: { depth: 'asc' },
    });
  }

  async getPersonWithAncestry(person_id: bigint) {
    const person = await prisma.person.findUnique({
      where: { id: person_id },
    });

    if (!person) return null;

    const ancestors = await this.getAncestors(person_id);

    return {
      ...person,
      ancestors: ancestors.map((a) => ({
        person: a.ancestor,
        depth: a.depth,
      })),
    };
  }

  async createFamilyWithChildren(
    clan_id: bigint,
    husband_id?: bigint,
    wife_id?: bigint,
    children: { person_id: bigint; birth_order: number }[] = []
  ) {
    return await prisma.$transaction(async (tx) => {
      const family = await tx.familyUnit.create({
        data: {
          clan_id,
          husband_id,
          wife_id,
        },
      });

      for (const child of children) {
        await tx.familyChild.create({
          data: {
            family_id: family.id,
            child_id: child.person_id,
            birth_order: child.birth_order,
          },
        });
      }

      return family;
    });
  }
}

export { prisma };
