export * from '@prisma/client';
export { RelationChangeStatus, RelationChangeType, RelationPrivacyLevel, CustodyStatus, MarriageType, MarriageEndReason, FamilyRelationChange, ChildCustodyRecord, MarriageHistory, RelationPrivacyPreference } from '@prisma/client';
import { PrismaClient, Gender } from '@prisma/client';
import { Injectable, Module, OnModuleInit, Global, Logger } from '@nestjs/common';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * 启动连接重试参数（可通过环境变量覆盖）：
   *   PRISMA_CONNECT_MAX_RETRIES       默认 5
   *   PRISMA_CONNECT_RETRY_DELAY_MS    默认 5000
   *   PRISMA_QUERY_MAX_RETRIES         默认 2
   *   PRISMA_QUERY_RETRY_DELAY_MS      默认 300
   */
  private readonly connectMaxRetries = parseInt(
    process.env.PRISMA_CONNECT_MAX_RETRIES || '5',
    10,
  );
  private readonly connectRetryDelayMs = parseInt(
    process.env.PRISMA_CONNECT_RETRY_DELAY_MS || '5000',
    10,
  );
  private readonly queryMaxRetries = parseInt(
    process.env.PRISMA_QUERY_MAX_RETRIES || '2',
    10,
  );
  private readonly queryRetryDelayMs = parseInt(
    process.env.PRISMA_QUERY_RETRY_DELAY_MS || '300',
    10,
  );

  async onModuleInit() {
    for (let attempt = 1; attempt <= this.connectMaxRetries; attempt++) {
      try {
        await this.$connect();
        this.logger.log(
          `数据库连接成功（配置：重试 ${this.connectMaxRetries} 次，间隔 ${this.connectRetryDelayMs}ms）`,
        );
        return;
      } catch (error: any) {
        this.logger.warn(
          `数据库连接失败 (第 ${attempt}/${this.connectMaxRetries} 次): ${error?.message || error}`,
        );
        if (attempt === this.connectMaxRetries) {
          this.logger.error('数据库重连已达最大次数，放弃连接');
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, this.connectRetryDelayMs));
      }
    }
  }

  /**
   * 带重试的查询包装器。
   * 针对偶发连接断开（如 Neon pooler 冷启动、自动休眠唤醒），
   * 在 queryMaxRetries 范围内自动重试，提升稳定性。
   *
   * 注意：仅对幂等读操作自动重试。写操作请显式处理事务或由调用方控制。
   */
  async queryWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: any;
    for (let attempt = 1; attempt <= this.queryMaxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const code = err?.code || '';
        const msg = err?.message || '';
        const isRetryable =
          code === 'P1001' || // Can't reach database
          code === 'P1002' || // Database connection timed out
          code === 'P1008' || // Operations timed out
          code === 'P1017' || // Server has closed the connection
          /closed connection|connection terminated|ETIMEDOUT|ECONNRESET/i.test(msg);
        if (!isRetryable || attempt === this.queryMaxRetries) {
          throw err;
        }
        this.logger.warn(
          `查询失败 (第 ${attempt}/${this.queryMaxRetries} 次，code=${code})，准备重试: ${msg}`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, this.queryRetryDelayMs * attempt),
        );
      }
    }
    throw lastErr;
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
