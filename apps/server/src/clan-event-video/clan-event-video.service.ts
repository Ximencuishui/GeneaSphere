import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { VideoProjectStatus, FamilyEventType, Prisma } from '@prisma/client';
import { CreateClanEventVideoDto } from './dto/create-clan-event-video.dto';
import { v4 as uuidv4 } from 'uuid';

/**
 * 家族大事件视频服务
 *
 * 数据来源：family_events + media_archive(通过 media_ids 关联)
 * 复用 ClanMigrationVideoService 架构思路，但数据源是 FamilyEvent 表。
 */
@Injectable()
export class ClanEventVideoService {
  private readonly logger = new Logger(ClanEventVideoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建大事件视频项目
   */
  async create(clanId: bigint, userId: string, dto: CreateClanEventVideoDto) {
    // 提取匹配的事件
    const events = await this.prisma.familyEvent.findMany({
      where: {
        clan_id: clanId,
        ...(dto.event_type_filter?.length ? { event_type: { in: dto.event_type_filter } } : {}),
        ...(dto.start_year ? { event_year: { gte: dto.start_year } } : {}),
        ...(dto.end_year ? { event_year: { lte: dto.end_year } } : {}),
      },
      orderBy: [{ event_year: 'asc' }, { event_date: 'asc' }],
    });

    if (events.length === 0) {
      this.logger.warn(`家族 ${clanId} 在指定范围内无大事件`);
    }

    // 创建项目
    const project = await this.prisma.clanEventVideo.create({
      data: {
        clan_id: clanId,
        title: dto.title,
        start_year: dto.start_year,
        end_year: dto.end_year,
        event_type_filter: dto.event_type_filter
          ? (dto.event_type_filter as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        style: dto.style ?? 'nostalgic',
        status: VideoProjectStatus.queued,
        event_count: events.length,
        created_by: userId,
      },
    });

    // 异步处理
    this.processAsync(project.id, events.length).catch((err) => {
      this.logger.error(`大事件视频 ${project.id} 异步处理失败: ${err?.message}`);
    });

    return this.toResponse(project);
  }

  /**
   * 异步模拟视频生成
   */
  private async processAsync(projectId: bigint, eventCount: number) {
    const processingMs = Math.min(Math.max(eventCount * 800, 5000), 60000);
    await new Promise((r) => setTimeout(r, processingMs));

    const uuid = uuidv4().replace(/-/g, '');
    const key = `event-videos/${projectId}/${uuid}.mp4`;
    const useCos = process.env.COS_ENABLED === 'true';
    const videoUrl = useCos
      ? `https://cdn.xungenlu.cn/${key}`
      : `/storage/${key.replace(/\//g, '_')}`;

    await this.prisma.clanEventVideo.update({
      where: { id: projectId },
      data: {
        status: VideoProjectStatus.completed,
        video_url: videoUrl,
        duration_seconds: Math.min(eventCount * 8, 600), // 每个事件约 8 秒
        file_size: BigInt(Math.floor(eventCount * 1024 * 1024 * 1.5)),
        completed_at: new Date(),
      },
    });
  }

  /**
   * 查询项目列表
   */
  async list(
    clanId: bigint,
    options: { page?: number; pageSize?: number; status?: VideoProjectStatus },
  ) {
    const { page = 1, pageSize = 20, status } = options;
    const where: Prisma.ClanEventVideoWhereInput = {
      clan_id: clanId,
      ...(status ? { status } : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.clanEventVideo.count({ where }),
      this.prisma.clanEventVideo.findMany({
        where,
        orderBy: { created_at: 'desc' },
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
   * 查询单个项目
   */
  async findOne(clanId: bigint, id: bigint) {
    const project = await this.prisma.clanEventVideo.findUnique({ where: { id } });
    if (!project || project.clan_id !== clanId) {
      throw new NotFoundException(`大事件视频 ${id} 不存在`);
    }
    return this.toResponse(project);
  }

  /**
   * 预览匹配事件数量
   */
  async preview(
    clanId: bigint,
    options: { start_year?: number; end_year?: number; event_type_filter?: FamilyEventType[] },
  ) {
    const where: Prisma.FamilyEventWhereInput = {
      clan_id: clanId,
      ...(options.event_type_filter?.length
        ? { event_type: { in: options.event_type_filter } }
        : {}),
      ...(options.start_year ? { event_year: { gte: options.start_year } } : {}),
      ...(options.end_year ? { event_year: { lte: options.end_year } } : {}),
    };

    const [count, yearRange] = await this.prisma.$transaction([
      this.prisma.familyEvent.count({ where }),
      this.prisma.familyEvent.aggregate({
        where,
        _min: { event_year: true },
        _max: { event_year: true },
      }),
    ]);

    return {
      event_count: count,
      year_range: {
        earliest: yearRange._min.event_year,
        latest: yearRange._max.event_year,
      },
      estimated_duration_seconds: Math.min(count * 8, 600),
    };
  }

  /**
   * 删除
   */
  async delete(clanId: bigint, id: bigint) {
    const project = await this.prisma.clanEventVideo.findUnique({ where: { id } });
    if (!project || project.clan_id !== clanId) {
      throw new NotFoundException(`大事件视频 ${id} 不存在`);
    }
    await this.prisma.clanEventVideo.delete({ where: { id } });
    return { id: id.toString(), deleted: true };
  }

  /**
   * 统一响应
   */
  private toResponse<T extends { id: bigint; file_size: any; event_type_filter: any; created_at: Date; completed_at?: Date | null }>(
    p: T,
  ) {
    return {
      ...p,
      id: p.id.toString(),
      file_size: p.file_size ? Number(p.file_size) : null,
      event_type_filter: p.event_type_filter ?? [],
      created_at: p.created_at.toISOString(),
      completed_at: p.completed_at ? p.completed_at.toISOString() : null,
    };
  }
}
