import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { FamilyEventType, Prisma } from '@prisma/client';
import { CreateFamilyEventDto } from './dto/create-family-event.dto';
import { UpdateFamilyEventDto } from './dto/update-family-event.dto';

/**
 * 家族大事件服务
 *
 * 提供 CRUD + 批量导入 + 自动生成诞辰/逝世事件能力。
 */
@Injectable()
export class FamilyEventService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建家族事件
   */
  async create(clanId: bigint, userId: string, dto: CreateFamilyEventDto) {
    if (!dto.event_date && !dto.event_year) {
      throw new BadRequestException('event_date 与 event_year 必须至少填写一个');
    }

    return this.prisma.familyEvent.create({
      data: {
        clan_id: clanId,
        event_name: dto.event_name,
        event_type: dto.event_type,
        event_date: dto.event_date ? new Date(dto.event_date) : null,
        event_year: dto.event_year ?? null,
        location: dto.location,
        description: dto.description,
        media_ids: dto.media_ids ? (dto.media_ids as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        created_by: userId,
      },
    });
  }

  /**
   * 查询家族事件列表（支持筛选与分页）
   */
  async list(
    clanId: bigint,
    options: {
      event_type?: FamilyEventType;
      start_year?: number;
      end_year?: number;
      page?: number;
      pageSize?: number;
    },
  ) {
    const { event_type, start_year, end_year, page = 1, pageSize = 20 } = options;

    const where: Prisma.FamilyEventWhereInput = {
      clan_id: clanId,
      ...(event_type ? { event_type } : {}),
      ...(start_year || end_year
        ? {
            event_year: {
              ...(start_year ? { gte: start_year } : {}),
              ...(end_year ? { lte: end_year } : {}),
            },
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.familyEvent.count({ where }),
      this.prisma.familyEvent.findMany({
        where,
        orderBy: [{ event_year: 'asc' }, { event_date: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: items.map((item) => this.toResponse(item)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 查询单个事件
   */
  async findOne(clanId: bigint, id: bigint) {
    const event = await this.prisma.familyEvent.findUnique({ where: { id } });
    if (!event || event.clan_id !== clanId) {
      throw new NotFoundException(`事件 ${id} 不存在`);
    }
    return this.toResponse(event);
  }

  /**
   * 更新事件
   */
  async update(clanId: bigint, id: bigint, dto: UpdateFamilyEventDto) {
    const existing = await this.prisma.familyEvent.findUnique({ where: { id } });
    if (!existing || existing.clan_id !== clanId) {
      throw new NotFoundException(`事件 ${id} 不存在`);
    }

    const data: Prisma.FamilyEventUpdateInput = {
      ...(dto.event_name !== undefined ? { event_name: dto.event_name } : {}),
      ...(dto.event_type !== undefined ? { event_type: dto.event_type } : {}),
      ...(dto.event_date !== undefined
        ? { event_date: dto.event_date ? new Date(dto.event_date) : null }
        : {}),
      ...(dto.event_year !== undefined ? { event_year: dto.event_year } : {}),
      ...(dto.location !== undefined ? { location: dto.location } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.media_ids !== undefined
        ? { media_ids: dto.media_ids ? (dto.media_ids as unknown as Prisma.InputJsonValue) : Prisma.JsonNull }
        : {}),
    };

    const updated = await this.prisma.familyEvent.update({ where: { id }, data });
    return this.toResponse(updated);
  }

  /**
   * 删除事件
   */
  async delete(clanId: bigint, id: bigint) {
    const existing = await this.prisma.familyEvent.findUnique({ where: { id } });
    if (!existing || existing.clan_id !== clanId) {
      throw new NotFoundException(`事件 ${id} 不存在`);
    }
    await this.prisma.familyEvent.delete({ where: { id } });
    return { id: id.toString(), deleted: true };
  }

  /**
   * 批量导入（CSV/JSON 数组）
   */
  async bulkCreate(
    clanId: bigint,
    userId: string,
    events: CreateFamilyEventDto[],
  ) {
    let success = 0;
    const errors: Array<{ index: number; error: string }> = [];
    for (let i = 0; i < events.length; i++) {
      try {
        await this.create(clanId, userId, events[i]);
        success += 1;
      } catch (err: any) {
        errors.push({ index: i, error: err?.message ?? 'unknown' });
      }
    }
    return { success, failed: errors.length, errors };
  }

  /**
   * 自动生成人物的诞辰/逝世事件（需管理员确认后入库）
   *
   * 返回候选事件列表，调用方可挑选后再次写入。
   */
  async generateLifeEvents(clanId: bigint) {
    const persons = await this.prisma.person.findMany({
      where: { clan_id: clanId },
      select: {
        id: true,
        full_name: true,
        birth_date: true,
        death_date: true,
      },
    });

    const candidates: Array<{
      person_id: string;
      event_name: string;
      event_type: FamilyEventType;
      event_date?: string;
      event_year?: number;
    }> = [];

    for (const p of persons) {
      if (p.birth_date) {
        candidates.push({
          person_id: p.id.toString(),
          event_name: `${p.full_name}诞辰`,
          event_type: FamilyEventType.birth,
          event_date: p.birth_date.toISOString(),
          event_year: p.birth_date.getFullYear(),
        });
      }
      if (p.death_date) {
        candidates.push({
          person_id: p.id.toString(),
          event_name: `${p.full_name}逝世`,
          event_type: FamilyEventType.death,
          event_date: p.death_date.toISOString(),
          event_year: p.death_date.getFullYear(),
        });
      }
    }

    return { candidates, count: candidates.length };
  }

  /**
   * 统一响应序列化：bigint → string
   */
  private toResponse<T extends { id: bigint; media_ids: any; created_at: Date; updated_at?: Date }>(
    e: T,
  ) {
    return {
      ...e,
      id: e.id.toString(),
      media_ids: e.media_ids ?? [],
      created_at: e.created_at.toISOString(),
      ...(e.updated_at ? { updated_at: e.updated_at.toISOString() } : {}),
    };
  }
}
