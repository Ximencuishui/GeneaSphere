import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { FamilyEventType, Prisma } from '@prisma/client';
import { CreateFamilyEventDto } from './dto/create-family-event.dto';
import { UpdateFamilyEventDto } from './dto/update-family-event.dto';

/**
 * event_year 是独立的整数列，不是数据库生成列。
 * 只收到日期时，用日期字符串的公历年补上，避免筛选和视频预览漏掉这条记录。
 */
function yearFromEventDate(eventDate: string): number {
  const matched = /^(\d{4})/.exec(eventDate);
  if (!matched) {
    throw new BadRequestException('event_date 无法解析出年份');
  }
  return Number(matched[1]);
}

const LIFE_EVENT_TYPES = new Set<FamilyEventType>([
  FamilyEventType.birth,
  FamilyEventType.death,
]);

/** migrations/20261114151000_family_event_dedup 里的部分唯一索引名。 */
const LIFE_DEDUP_INDEX = 'family_events_life_person_type_key';

export type SkippedFamilyEvent = { skipped: true };

function isSkippedFamilyEvent(value: unknown): value is SkippedFamilyEvent {
  return !!value && typeof value === 'object' && (value as SkippedFamilyEvent).skipped === true;
}

/**
 * 家族大事件服务
 *
 * 提供 CRUD + 批量导入 + 自动生成诞辰/逝世事件能力。
 * 生卒去重不走 prisma.upsert：部分唯一索引带 WHERE，schema 里没有 @@unique。
 */
@Injectable()
export class FamilyEventService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建家族事件。
   * 同一人已有诞辰或逝世时返回 { skipped: true }，不把这条算作失败。
   */
  async create(clanId: bigint, userId: string, dto: CreateFamilyEventDto) {
    const eventYear =
      dto.event_year ?? (dto.event_date ? yearFromEventDate(dto.event_date) : undefined);
    if (!dto.event_date && eventYear == null) {
      throw new BadRequestException('event_date 与 event_year 必须至少填写一个');
    }

    const personId = this.readPersonId(dto.person_id);
    if (personId != null) {
      await this.assertPersonInClan(clanId, personId);
    }
    const mediaIds = await this.normalizeMediaIds(clanId, dto.media_ids);

    if (personId != null && LIFE_EVENT_TYPES.has(dto.event_type)) {
      const existing = await this.findLifeDuplicate(clanId, personId, dto.event_type);
      if (existing) return { skipped: true as const };
    }

    try {
      const created = await this.prisma.familyEvent.create({
        data: {
          clan_id: clanId,
          ...(personId != null ? { person_id: personId } : {}),
          event_name: dto.event_name,
          event_type: dto.event_type,
          event_date: dto.event_date ? new Date(dto.event_date) : null,
          event_year: eventYear ?? null,
          location: dto.location,
          description: dto.description,
          media_ids: mediaIds === undefined ? Prisma.JsonNull : mediaIds,
          created_by: userId,
        },
      });
      return this.toResponse(created);
    } catch (error) {
      if (personId != null && LIFE_EVENT_TYPES.has(dto.event_type) && this.isLifeDedupConflict(error)) {
        return { skipped: true as const };
      }
      throw error;
    }
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
      items: await this.attachMedia(clanId, items.map((item) => this.toResponse(item))),
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
    const [withMedia] = await this.attachMedia(clanId, [this.toResponse(event)]);
    return withMedia;
  }

  /**
   * 更新事件
   */
  async update(clanId: bigint, id: bigint, dto: UpdateFamilyEventDto) {
    const existing = await this.prisma.familyEvent.findUnique({ where: { id } });
    if (!existing || existing.clan_id !== clanId) {
      throw new NotFoundException(`事件 ${id} 不存在`);
    }

    const eventYear =
      dto.event_year !== undefined
        ? dto.event_year
        : dto.event_date
          ? yearFromEventDate(dto.event_date)
          : undefined;
    const personId = dto.person_id !== undefined ? this.readPersonId(dto.person_id) : undefined;
    if (personId != null) {
      await this.assertPersonInClan(clanId, personId);
    }
    const mediaIds = dto.media_ids !== undefined ? await this.normalizeMediaIds(clanId, dto.media_ids) : undefined;

    const nextType = dto.event_type ?? existing.event_type;
    const nextPersonId = personId !== undefined ? personId : existing.person_id;
    if (
      (dto.person_id !== undefined || dto.event_type !== undefined) &&
      nextPersonId != null &&
      LIFE_EVENT_TYPES.has(nextType)
    ) {
      const duplicate = await this.findLifeDuplicate(clanId, nextPersonId, nextType, id);
      if (duplicate) {
        throw new BadRequestException('该人物已有同类型的诞辰或逝世事件');
      }
    }

    const data: Prisma.FamilyEventUncheckedUpdateInput = {
      ...(dto.event_name !== undefined ? { event_name: dto.event_name } : {}),
      ...(dto.event_type !== undefined ? { event_type: dto.event_type } : {}),
      ...(dto.event_date !== undefined
        ? { event_date: dto.event_date ? new Date(dto.event_date) : null }
        : {}),
      ...(eventYear !== undefined ? { event_year: eventYear } : {}),
      ...(dto.location !== undefined ? { location: dto.location } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(personId !== undefined ? { person_id: personId } : {}),
      ...(mediaIds !== undefined ? { media_ids: mediaIds } : {}),
    };

    try {
      const updated = await this.prisma.familyEvent.update({ where: { id }, data });
      return this.toResponse(updated);
    } catch (error) {
      if (this.isLifeDedupConflict(error)) {
        throw new BadRequestException('该人物已有同类型的诞辰或逝世事件');
      }
      throw error;
    }
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
   * 批量导入（JSON 数组）。重复的生卒记入 skipped，不记入 failed。
   */
  async bulkCreate(
    clanId: bigint,
    userId: string,
    events: CreateFamilyEventDto[],
  ) {
    let success = 0;
    let skipped = 0;
    const errors: Array<{ index: number; error: string }> = [];
    for (let i = 0; i < events.length; i++) {
      try {
        const created = await this.create(clanId, userId, events[i]);
        if (isSkippedFamilyEvent(created)) skipped += 1;
        else success += 1;
      } catch (err: any) {
        errors.push({ index: i, error: err?.message ?? 'unknown' });
      }
    }
    return { success, skipped, failed: errors.length, errors };
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

  private readPersonId(value: unknown): bigint | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) {
      throw new BadRequestException('person_id 必须是数字');
    }
    return BigInt(text);
  }

  private async assertPersonInClan(clanId: bigint, personId: bigint) {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, clan_id: clanId },
      select: { id: true },
    });
    if (!person) {
      throw new BadRequestException('person_id 不属于当前家族');
    }
  }

  /**
   * undefined 表示请求没带这个字段。空数组原样返回。
   * 元素转成正整数并去重，且必须全部属于当前家族的媒体。
   */
  private async normalizeMediaIds(clanId: bigint, value: unknown): Promise<number[] | undefined> {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value)) {
      throw new BadRequestException('media_ids 必须是数组');
    }
    const ids: number[] = [];
    const seen = new Set<number>();
    for (const item of value) {
      if (typeof item === 'boolean' || item == null) {
        throw new BadRequestException('media_ids 包含无效的媒体 id');
      }
      const text = String(item).trim();
      if (!/^\d+$/.test(text)) {
        throw new BadRequestException('media_ids 包含无效的媒体 id');
      }
      const id = Number(text);
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new BadRequestException('media_ids 包含无效的媒体 id');
      }
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    if (ids.length === 0) return [];
    const found = await this.prisma.mediaArchive.findMany({
      where: { clan_id: clanId, id: { in: ids.map((id) => BigInt(id)) } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('media_ids 包含不属于当前家族的媒体');
    }
    return ids;
  }

  /** 本族是否已有同一人物的诞辰或逝世。索引本身不带 clan_id，人物已限制在本族。 */
  private findLifeDuplicate(
    clanId: bigint,
    personId: bigint,
    eventType: FamilyEventType,
    excludeId?: bigint,
  ) {
    return this.prisma.familyEvent.findFirst({
      where: {
        clan_id: clanId,
        person_id: personId,
        event_type: eventType,
        ...(excludeId != null ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
  }

  /**
   * 部分唯一索引冲突。Prisma 的 target 可能是索引名，也可能是字段列表。
   */
  private isLifeDedupConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const known = error as { code?: string; meta?: { target?: unknown } };
    const isKnown = error instanceof Prisma.PrismaClientKnownRequestError || known.code === 'P2002';
    if (!isKnown || known.code !== 'P2002') return false;
    const target = known.meta?.target;
    if (target == null) return true;
    const text = Array.isArray(target) ? target.map(String).join(',') : String(target);
    return text.includes(LIFE_DEDUP_INDEX) || (text.includes('person_id') && text.includes('event_type'));
  }

  private collectMediaIds(value: unknown): bigint[] {
    if (!Array.isArray(value)) return [];
    const ids: bigint[] = [];
    for (const item of value) {
      const text = typeof item === 'number' || typeof item === 'string' ? String(item).trim() : '';
      if (/^\d+$/.test(text) && text !== '0') ids.push(BigInt(text));
    }
    return ids;
  }

  /** 只附本族媒体的 id 和可访问地址，不返回媒体行的其余字段。 */
  private async attachMedia<T extends { media_ids: unknown }>(clanId: bigint, rows: T[]) {
    const all = new Map<string, bigint>();
    for (const row of rows) {
      for (const id of this.collectMediaIds(row.media_ids)) {
        all.set(id.toString(), id);
      }
    }
    const found = all.size
      ? await this.prisma.mediaArchive.findMany({
          where: { clan_id: clanId, id: { in: [...all.values()] } },
          select: { id: true, thumb_url: true, display_url: true, file_url: true },
        })
      : [];
    const byId = new Map(found.map((media) => [media.id.toString(), media]));
    return rows.map((row) => ({
      ...row,
      media: this.collectMediaIds(row.media_ids).flatMap((id) => {
        const media = byId.get(id.toString());
        if (!media) return [];
        return [{
          id: media.id.toString(),
          url: media.thumb_url || media.display_url || media.file_url,
        }];
      }),
    }));
  }

  /**
   * 统一响应序列化：bigint → string
   */
  private toResponse<T extends {
    id: bigint;
    clan_id: bigint;
    media_ids: unknown;
    created_at: Date;
    updated_at?: Date;
    person_id?: bigint | null;
  }>(e: T) {
    return {
      ...e,
      id: e.id.toString(),
      clan_id: e.clan_id.toString(),
      person_id: e.person_id == null ? null : e.person_id.toString(),
      media_ids: e.media_ids ?? [],
      created_at: e.created_at.toISOString(),
      ...(e.updated_at ? { updated_at: e.updated_at.toISOString() } : {}),
    };
  }
}
