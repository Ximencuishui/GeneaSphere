import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';

@ApiTags('admin/reports')
@Controller('api/admin/reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminReportController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  private async loadInClan(id: bigint, clanId: bigint) {
    const report = await this.prisma.contentReport.findFirst({
      where: { id, clan_id: clanId },
      include: {
        reporter: { select: { id: true, phone: true, nickname: true } },
        handler: { select: { id: true, phone: true, nickname: true } },
      },
    });
    if (!report) {
      throw new NotFoundException('举报不存在');
    }
    return report;
  }

  @Get()
  @ApiOperation({ summary: '获取举报列表' })
  async getReports(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('targetType') targetType?: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const pageNum = parseInt(page || '1', 10);
    const pageSizeNum = parseInt(pageSize || '20', 10);
    const skip = (pageNum - 1) * pageSizeNum;

    const where: any = { clan_id: clanId };
    if (status && status !== 'all') {
      where.status = status.toUpperCase();
    }
    if (targetType) {
      where.target_type = targetType.toUpperCase();
    }

    const [reports, total] = await Promise.all([
      this.prisma.contentReport.findMany({
        where,
        include: {
          reporter: { select: { id: true, phone: true, nickname: true } },
          handler: { select: { id: true, phone: true, nickname: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSizeNum,
      }),
      this.prisma.contentReport.count({ where }),
    ]);

    const enrichedReports = await Promise.all(
      reports.map(async (report) => {
        let targetInfo: any = null;
        try {
          switch (report.target_type) {
            case 'MEDIA': {
              const media = await this.prisma.mediaArchive.findUnique({
                where: { id: report.target_id },
                select: { id: true, file_url: true, thumb_url: true, description: true },
              });
              targetInfo = media ? { type: 'media', data: media } : null;
              break;
            }
            case 'BIO': {
              const bio = await this.prisma.bioReview.findUnique({
                where: { id: report.target_id },
                include: { person: { select: { id: true, full_name: true } } },
              });
              targetInfo = bio ? { type: 'bio', data: bio } : null;
              break;
            }
            case 'POST': {
              const post = await this.prisma.searchPost.findUnique({
                where: { id: report.target_id },
                select: { id: true, origin_place: true, contact_info: true },
              });
              targetInfo = post ? { type: 'post', data: post } : null;
              break;
            }
            case 'MEMBER': {
              const person = await this.prisma.person.findUnique({
                where: { id: report.target_id },
                select: { id: true, full_name: true },
              });
              targetInfo = person ? { type: 'member', data: person } : null;
              break;
            }
          }
        } catch {
          targetInfo = null;
        }

        return {
          id: report.id.toString(),
          target_type: report.target_type,
          target_id: report.target_id.toString(),
          reason: report.reason,
          description: report.description,
          status: report.status,
          handled_by: report.handler?.nickname || report.handler?.phone,
          handled_at: report.handled_at,
          result: report.result,
          created_at: report.created_at,
          reporter_name: report.reporter.nickname || report.reporter.phone,
          target_info: targetInfo,
        };
      }),
    );

    return {
      data: enrichedReports,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取举报详情' })
  async getReport(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const report = await this.loadInClan(BigInt(id), clanId);

    return {
      id: report.id.toString(),
      target_type: report.target_type,
      target_id: report.target_id.toString(),
      reason: report.reason,
      description: report.description,
      status: report.status,
      created_at: report.created_at,
      reporter_name: report.reporter.nickname || report.reporter.phone,
      handler_name: report.handler?.nickname || report.handler?.phone,
      handled_at: report.handled_at,
      result: report.result,
    };
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: '确认举报，处理违规内容' })
  async confirmReport(
    @Request() req,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);
    const reportId = BigInt(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const report = await tx.contentReport.findFirst({
        where: { id: reportId, clan_id: clanId },
      });
      if (!report) {
        throw new NotFoundException('举报不存在');
      }
      if (report.status !== 'PENDING') {
        throw new BadRequestException('只能处理待处理的举报');
      }
      if (report.target_type === 'MEMBER') {
        throw new BadRequestException('成员类举报不能自动处置。请线下核实后驳回，或等待后续处置能力。');
      }

      switch (report.target_type) {
        case 'MEDIA':
          await tx.mediaArchive.update({
            where: { id: report.target_id },
            data: { deleted_at: new Date(), deleted_by: userId },
          });
          break;
        case 'BIO':
          await tx.bioReview.update({
            where: { id: report.target_id },
            data: { status: 'REJECTED' },
          });
          break;
        case 'POST':
          await tx.searchPost.update({
            where: { id: report.target_id },
            data: { status: 'REMOVED' },
          });
          break;
        default:
          throw new BadRequestException(`暂不支持自动处置 ${report.target_type} 类举报`);
      }

      const result = await tx.contentReport.updateMany({
        where: { id: reportId, clan_id: clanId, status: 'PENDING' },
        data: {
          status: 'CONFIRMED',
          handled_by: userId,
          handled_at: new Date(),
          result: body.result || '已确认违规并处理',
        },
      });
      if (result.count !== 1) {
        throw new BadRequestException('只能处理待处理的举报');
      }
      return tx.contentReport.findFirst({ where: { id: reportId, clan_id: clanId } });
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'CONFIRM_REPORT',
      targetType: 'ContentReport',
      targetId: id,
      details: `确认举报`,
    });

    return {
      id: updated!.id.toString(),
      status: updated!.status,
      handled_at: updated!.handled_at,
    };
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '驳回举报' })
  async rejectReport(
    @Request() req,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);
    const reportId = BigInt(id);

    const existing = await this.loadInClan(reportId, clanId);
    const result = await this.prisma.contentReport.updateMany({
      where: { id: reportId, clan_id: clanId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        handled_by: userId,
        handled_at: new Date(),
        result: body.result || '举报已驳回',
      },
    });
    if (result.count !== 1) {
      throw new BadRequestException('只能处理待处理的举报');
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'REJECT_REPORT',
      targetType: 'ContentReport',
      targetId: id,
      details: `驳回举报: ${existing.reason}`,
    });

    return {
      id,
      status: 'REJECTED',
      handled_at: new Date(),
    };
  }
}
