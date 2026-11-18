import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VideoProjectStatus } from '@prisma/client';
import { PrismaService } from '@geneasphere/db';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';

const STATUS_VALUES = new Set<string>(Object.values(VideoProjectStatus));

function asIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function projectTitle(fullName?: string | null) {
  const name = fullName?.trim();
  return name ? `${name}的直系血缘视频` : '直系血缘视频';
}

function creatorName(user?: { nickname?: string | null; phone?: string | null } | null) {
  return user?.nickname || user?.phone || '未知';
}

/**
 * 直系血缘视频没有 clan_id 列，家族边界走中心人物的 clan_id。
 * 模型也没有 deleted_at，删除与用户侧 deleteProject 相同：先删素材关联，再删项目。
 */
@ApiTags('admin/lineage-videos')
@Controller('api/admin/lineage-videos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminLineageVideoController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  private clanWhere(id: bigint, clanId: bigint) {
    return { id, center_person: { clan_id: clanId } };
  }

  @Get(':clanSlug')
  @ApiOperation({ summary: '获取本家族直系血缘视频列表' })
  async listLineageVideos(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, req.user.userId);
    const pageNum = Math.max(parseInt(page || '1', 10) || 1, 1);
    const pageSizeNum = Math.min(Math.max(parseInt(pageSize || '20', 10) || 20, 1), 100);
    const where = { center_person: { clan_id: clanId } };

    const [projects, total] = await Promise.all([
      this.prisma.lineageVideoProject.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, phone: true } },
          center_person: { select: { id: true, full_name: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
      }),
      this.prisma.lineageVideoProject.count({ where }),
    ]);

    return {
      data: projects.map((project) => ({
        id: project.id.toString(),
        title: projectTitle(project.center_person?.full_name),
        creator_name: creatorName(project.user),
        status: project.status,
        created_at: asIso(project.created_at),
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    };
  }

  @Get(':clanSlug/:id')
  @ApiOperation({ summary: '获取本家族直系血缘视频详情' })
  async getLineageVideo(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('id') id: string,
  ) {
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, req.user.userId);
    const project = await this.prisma.lineageVideoProject.findFirst({
      where: this.clanWhere(BigInt(id), clanId),
      include: {
        user: { select: { id: true, nickname: true, phone: true } },
        center_person: {
          select: { id: true, full_name: true, gender: true, birth_date: true, death_date: true },
        },
      },
    });
    if (!project) {
      throw new NotFoundException('直系血缘视频不存在');
    }
    return this.toDetail(project);
  }

  /**
   * 协助编辑仅覆盖已有字段：状态、说明（error_message）。
   * 项目表没有标题列，标题由中心人物姓名派生，不可写。
   */
  @Put(':clanSlug/:id')
  @ApiOperation({ summary: '编辑直系血缘视频状态或说明' })
  async updateLineageVideo(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('id') id: string,
    @Body() body: { status?: string; error_message?: string | null },
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const data: { status?: VideoProjectStatus; error_message?: string | null } = {};

    if (body?.status !== undefined) {
      if (!STATUS_VALUES.has(body.status)) {
        throw new BadRequestException('状态无效');
      }
      data.status = body.status as VideoProjectStatus;
    }
    if (body?.error_message !== undefined) {
      if (body.error_message === null || body.error_message === '') {
        data.error_message = null;
      } else if (typeof body.error_message === 'string') {
        data.error_message = body.error_message;
      } else {
        throw new BadRequestException('说明无效');
      }
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('没有可更新的字段');
    }

    const where = this.clanWhere(BigInt(id), clanId);
    const existing = await this.prisma.lineageVideoProject.findFirst({
      where,
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('直系血缘视频不存在');
    }

    const updated = await this.prisma.lineageVideoProject.updateMany({
      where,
      data,
    });
    if (updated.count === 0) {
      throw new NotFoundException('直系血缘视频不存在');
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'UPDATE_LINEAGE_VIDEO',
      targetType: 'LineageVideoProject',
      targetId: id,
      details: '更新直系血缘视频状态或说明',
    });

    return { success: true };
  }

  @Delete(':clanSlug/:id')
  @ApiOperation({ summary: '删除本家族直系血缘视频' })
  async deleteLineageVideo(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('id') id: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const where = this.clanWhere(BigInt(id), clanId);
    const project = await this.prisma.lineageVideoProject.findFirst({ where });
    if (!project) {
      throw new NotFoundException('直系血缘视频不存在');
    }

    await this.prisma.lineageVideoMaterialLink.deleteMany({
      where: { lineage_project_id: project.id },
    });
    await this.prisma.lineageVideoProject.delete({
      where: { id: project.id },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'DELETE_LINEAGE_VIDEO',
      targetType: 'LineageVideoProject',
      targetId: id,
      details: '删除直系血缘视频',
    });

    return { success: true };
  }

  private toDetail(project: {
    id: bigint;
    user_id: string;
    direction: string;
    up_generations: number;
    down_generations: number;
    include_spouse: boolean;
    style: string;
    status: string;
    queue_position: number;
    priority: boolean;
    paid_amount: { toString(): string } | number | string | null;
    video_url: string | null;
    duration_seconds: number | null;
    error_message: string | null;
    created_at: Date | string;
    completed_at: Date | string | null;
    user?: { nickname?: string | null; phone?: string | null } | null;
    center_person?: {
      id: bigint;
      full_name: string;
      gender?: string | null;
      birth_date?: Date | string | null;
      death_date?: Date | string | null;
    } | null;
  }) {
    return {
      id: project.id.toString(),
      title: projectTitle(project.center_person?.full_name),
      user_id: project.user_id,
      creator_name: creatorName(project.user),
      center_person: project.center_person
        ? {
            id: project.center_person.id.toString(),
            full_name: project.center_person.full_name,
            gender: project.center_person.gender ?? null,
            birth_date: asIso(project.center_person.birth_date),
            death_date: asIso(project.center_person.death_date),
          }
        : null,
      direction: project.direction,
      up_generations: project.up_generations,
      down_generations: project.down_generations,
      include_spouse: project.include_spouse,
      style: project.style,
      status: project.status,
      queue_position: project.queue_position,
      priority: project.priority,
      paid_amount: project.paid_amount == null ? null : String(project.paid_amount),
      video_url: project.video_url,
      duration_seconds: project.duration_seconds,
      error_message: project.error_message,
      created_at: asIso(project.created_at),
      completed_at: asIso(project.completed_at),
    };
  }
}
