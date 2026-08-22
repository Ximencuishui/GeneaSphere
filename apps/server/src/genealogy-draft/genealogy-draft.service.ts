import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { serializeBigInt } from '../common/bigint-serializer';
import { CreateGenealogyDraftDto } from './dto/create-genealogy-draft.dto';
import { UpdateGenealogyDraftDto } from './dto/update-genealogy-draft.dto';

@Injectable()
export class GenealogyDraftService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeOptional(value?: string): string | null | undefined {
    return value === undefined ? undefined : value.trim() || null;
  }

  async list(clanId: bigint) {
    const [rows, memberCount] = await Promise.all([
      this.prisma.genealogyDraft.findMany({
        where: { clan_id: clanId },
        orderBy: { updated_at: 'desc' },
      }),
      this.prisma.person.count({ where: { clan_id: clanId } }),
    ]);
    return rows.map((row) => ({
      ...serializeBigInt(row),
      member_count: memberCount,
    }));
  }

  async create(clanId: bigint, userId: string, dto: CreateGenealogyDraftDto) {
    const row = await this.prisma.genealogyDraft.create({
      data: {
        clan_id: clanId,
        created_by: userId,
        name: dto.name.trim(),
        version: this.normalizeOptional(dto.version) ?? null,
        generation_start: dto.generation_start,
        generation_end: dto.generation_end,
        description: this.normalizeOptional(dto.description) ?? null,
        cover_image_url: this.normalizeOptional(dto.cover_image_url) ?? null,
      },
    });
    return serializeBigInt(row);
  }

  async update(clanId: bigint, id: bigint, dto: UpdateGenealogyDraftDto) {
    const existing = await this.prisma.genealogyDraft.findFirst({ where: { id, clan_id: clanId } });
    if (!existing) throw new NotFoundException('族谱草稿不存在');
    const row = await this.prisma.genealogyDraft.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        version: this.normalizeOptional(dto.version),
        generation_start: dto.generation_start,
        generation_end: dto.generation_end,
        description: this.normalizeOptional(dto.description),
        cover_image_url: this.normalizeOptional(dto.cover_image_url),
      },
    });
    return serializeBigInt(row);
  }

  async remove(clanId: bigint, id: bigint) {
    const existing = await this.prisma.genealogyDraft.findFirst({ where: { id, clan_id: clanId } });
    if (!existing) throw new NotFoundException('族谱草稿不存在');
    await this.prisma.genealogyDraft.delete({ where: { id } });
    return { id: id.toString(), deleted: true };
  }

  async exportJson(clanId: bigint) {
    const [clan, people, relationships, drafts] = await Promise.all([
      this.prisma.clan.findUnique({ where: { id: clanId } }),
      this.prisma.person.findMany({ where: { clan_id: clanId } }),
      this.prisma.familyUnit.findMany({ where: { clan_id: clanId }, include: { children: true } }),
      this.prisma.genealogyDraft.findMany({ where: { clan_id: clanId } }),
    ]);
    return serializeBigInt({ exported_at: new Date(), clan, people, relationships, drafts });
  }
}
