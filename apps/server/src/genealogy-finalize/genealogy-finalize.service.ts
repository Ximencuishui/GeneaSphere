import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { FinalizeGenealogyDto } from './dto/finalize-genealogy.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class GenealogyFinalizeService {
  constructor(private readonly prisma: PrismaService) {}

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

          return tx.genealogyDocument.create({
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
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.serialize(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('定谱版本冲突，请重试');
      }
      throw error;
    }
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
