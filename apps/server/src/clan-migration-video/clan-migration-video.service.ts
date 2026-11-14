import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { VideoProjectStatus, Prisma } from '@prisma/client';
import { CreateClanMigrationVideoDto } from './dto/create-clan-migration-video.dto';

/**
 * 全族迁徙历史视频服务
 *
 * 数据来源：migration_events + media_archive(taken_location 匹配)
 * 复用现有 VideoProject 队列架构思路，但使用 ClanMigrationVideo 表存储。
 */
@Injectable()
export class ClanMigrationVideoService {
  private readonly logger = new Logger(ClanMigrationVideoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建迁徙视频项目
   *
   * 1. 提取指定时间范围内的迁徙事件
   * 2. 按时间排序
   * 3. 创建视频项目记录（status=queued，不写 video_url）
   * 4. 写入 HeavyJob，由线下 worker 领取
   */
  async create(clanId: bigint, userId: string, dto: CreateClanMigrationVideoDto) {
    // 提取迁徙事件
    const events = await this.prisma.migrationEvent.findMany({
      where: {
        clan_id: clanId,
        ...(dto.branch_filter ? { branch: dto.branch_filter } : {}),
        ...(dto.start_year ? { event_year: { gte: dto.start_year } } : {}),
        ...(dto.end_year ? { event_year: { lte: dto.end_year } } : {}),
      },
      orderBy: [{ event_year: 'asc' }, { id: 'asc' }],
    });

    if (events.length === 0) {
      this.logger.warn(`家族 ${clanId} 在指定范围内无迁徙事件`);
    }

    // 创建项目
    const project = await this.prisma.clanMigrationVideo.create({
      data: {
        clan_id: clanId,
        title: dto.title,
        start_year: dto.start_year,
        end_year: dto.end_year,
        branch_filter: dto.branch_filter,
        style: dto.style ?? 'nostalgic',
        status: VideoProjectStatus.queued,
        event_count: events.length,
        created_by: userId,
      },
    });

    try {
      await this.prisma.heavyJob.create({
        data: {
          type: 'video',
          status: 'pending',
          userId,
          clanId,
          payload: {
            kind: 'clan-migration',
            projectId: project.id.toString(),
          },
        },
      });
    } catch (err) {
      await this.markProjectFailed(project.id);
      throw err;
    }

    return this.toResponse(project);
  }

  private async markProjectFailed(projectId: bigint) {
    try {
      await this.prisma.clanMigrationVideo.update({
        where: { id: projectId },
        data: { status: VideoProjectStatus.failed },
      });
    } catch (err: any) {
      this.logger.error(`迁徙视频 ${projectId} 标记失败未写入：${err?.message ?? err}`);
    }
  }

  /**
   * 查询项目列表
   */
  async list(
    clanId: bigint,
    options: { page?: number; pageSize?: number; status?: VideoProjectStatus },
  ) {
    const { page = 1, pageSize = 20, status } = options;
    const where: Prisma.ClanMigrationVideoWhereInput = {
      clan_id: clanId,
      ...(status ? { status } : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.clanMigrationVideo.count({ where }),
      this.prisma.clanMigrationVideo.findMany({
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
    const project = await this.prisma.clanMigrationVideo.findUnique({ where: { id } });
    if (!project || project.clan_id !== clanId) {
      throw new NotFoundException(`迁徙视频 ${id} 不存在`);
    }
    return this.toResponse(project);
  }

  /**
   * 预览：返回将包含的迁徙事件数量
   */
  async preview(
    clanId: bigint,
    options: { start_year?: number; end_year?: number; branch_filter?: string },
  ) {
    const where: Prisma.MigrationEventWhereInput = {
      clan_id: clanId,
      ...(options.branch_filter ? { branch: options.branch_filter } : {}),
      ...(options.start_year ? { event_year: { gte: options.start_year } } : {}),
      ...(options.end_year ? { event_year: { lte: options.end_year } } : {}),
    };

    const [count, yearRange] = await this.prisma.$transaction([
      this.prisma.migrationEvent.count({ where }),
      this.prisma.migrationEvent.aggregate({
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
      estimated_duration_seconds: Math.min(count * 15, 600),
    };
  }

  /**
   * 删除
   */
  async delete(clanId: bigint, id: bigint) {
    const project = await this.prisma.clanMigrationVideo.findUnique({ where: { id } });
    if (!project || project.clan_id !== clanId) {
      throw new NotFoundException(`迁徙视频 ${id} 不存在`);
    }
    await this.prisma.clanMigrationVideo.delete({ where: { id } });
    return { id: id.toString(), deleted: true };
  }

  /**
   * 统一响应。ClanMigrationVideo 的 BigInt 列是 id、clan_id、file_size。
   * id / clan_id 转字符串；file_size 与册谱文档 toResponse 一样转 Number。
   * 展开后若还剩 BigInt，一律转字符串，避免 JSON.stringify 抛错。
   */
  private toResponse<T extends {
    id: bigint | string;
    clan_id: bigint | string;
    file_size?: bigint | number | null;
    created_at: Date | string;
    completed_at?: Date | string | null;
  }>(p: T) {
    const response: Record<string, unknown> = {
      ...p,
      id: p.id.toString(),
      clan_id: p.clan_id.toString(),
      file_size: p.file_size == null ? null : Number(p.file_size),
      created_at: p.created_at instanceof Date ? p.created_at.toISOString() : p.created_at,
      completed_at:
        p.completed_at instanceof Date ? p.completed_at.toISOString() : (p.completed_at ?? null),
    };
    for (const [key, value] of Object.entries(response)) {
      if (typeof value === 'bigint') response[key] = value.toString();
    }
    return response;
  }
}
