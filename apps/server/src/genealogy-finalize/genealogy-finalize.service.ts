import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { FinalizeGenealogyDto } from './dto/finalize-genealogy.dto';
import { Prisma } from '@prisma/client';
import { loadXiupu, saveXiupu } from '../genealogy-workflow/xiupu-settings';
import { GenealogyEditionService } from '../genealogy-edition/genealogy-edition.service';

@Injectable()
export class GenealogyFinalizeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edition: GenealogyEditionService,
  ) {}

  async finalize(clanId: bigint, userId: string, dto: FinalizeGenealogyDto) {
    try {
      const row = await this.prisma.$transaction(
        async (tx) => {
          const latest = await tx.genealogyDocument.findFirst({
            where: { clan_id: clanId },
            orderBy: { version_number: 'desc' },
            select: { version_number: true },
          });
          const personCount = await tx.person.count({ where: { clan_id: clanId } });

          const created = await tx.genealogyDocument.create({
            data: {
              clan_id: clanId,
              created_by: userId,
              version_name: dto.version_name.trim(),
              version_number: (latest?.version_number ?? 0) + 1,
              scope_summary: {
                description: dto.description?.trim() || '',
                finalized_at: dto.finalized_at || new Date().toISOString(),
                editors: dto.editors,
                person_count: personCount,
                finalized: true,
              },
            },
          });
          await this.edition.publish(tx, clanId, userId, created.id, dto.version_name.trim());
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000, maxWait: 20000 },
      );
      const operator_name = await this.operatorName(userId);
      await saveXiupu(this.prisma, clanId, (current) => ({
        ...current,
        lock: {
          locked_at: new Date().toISOString(),
          locked_by: userId,
          operator_name,
          version_name: dto.version_name.trim(),
        },
        final_reject: null,
      }));
      return this.serialize(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('定谱版本冲突，请重试');
      }
      throw error;
    }
  }

  async lockState(clanId: bigint, userId: string) {
    const { settings } = await loadXiupu(this.prisma, clanId);
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      select: { admin_user_id: true },
    });
    const member = await this.prisma.clanMember.findUnique({
      where: { clan_id_user_id: { clan_id: clanId, user_id: userId } },
      select: { role: true },
    });
    return {
      locked: Boolean(settings.lock),
      locked_at: settings.lock?.locked_at ?? null,
      operator_name: settings.lock?.operator_name ?? null,
      version_name: settings.lock?.version_name ?? null,
      can_unlock: clan?.admin_user_id === userId || member?.role === 'OWNER',
    };
  }

  async reject(clanId: bigint, userId: string, reason: string) {
    const operator_name = await this.operatorName(userId);
    await saveXiupu(this.prisma, clanId, (current) => ({
      ...current,
      lock: null,
      final_reject: { reason: reason.trim(), at: new Date().toISOString(), operator_name },
    }));
    return this.lockState(clanId, userId);
  }

  async unlock(clanId: bigint, userId: string) {
    const operator_name = await this.operatorName(userId);
    const published = await this.edition.published(clanId);
    if (published) await this.edition.openRound(clanId, userId, 'keep');
    await saveXiupu(this.prisma, clanId, (current) => ({
      ...current,
      lock: null,
      final_reject: {
        reason: '已解锁并打开下一轮修谱稿',
        at: new Date().toISOString(),
        operator_name,
      },
    }));
    return this.lockState(clanId, userId);
  }

  private async operatorName(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nickname: true, phone: true },
    });
    return user?.nickname || user?.phone || '主修';
  }

  async versions(clanId: bigint) {
    const rows = await this.prisma.genealogyDocument.findMany({
      where: { clan_id: clanId },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((row) => this.serialize(row));
  }

  private serialize(row: any) {
    return {
      ...row,
      id: row.id.toString(),
      clan_id: row.clan_id.toString(),
      file_size: row.file_size?.toString() ?? null,
    };
  }
}
