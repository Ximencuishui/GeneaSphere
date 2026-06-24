import { Controller, Get, Post, Param, Query, Body, UseGuards, Request, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';

/**
 * 管理员 PDF 导入管理 API
 * 功能：导入记录管理、任务监控、OCR 额度管理
 */
@ApiTags('admin/import')
@Controller('api/admin/import')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminImportController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取 PDF 导入记录列表
   */
  @Get('logs')
  @ApiOperation({ summary: '获取 PDF 导入记录列表' })
  async getImportLogs(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('status') status?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const where: any = { clan_id: clanId };
    if (status) {
      where.status = status;
    }

    const [logs, total] = await Promise.all([
      this.prisma.pdfImportLog.findMany({
        where,
        include: {
          user: { select: { id: true, phone: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.pdfImportLog.count({ where }),
    ]);

    return {
      data: logs.map(log => ({
        id: log.id.toString(),
        task_id: log.task_id,
        user_phone: log.user.phone,
        file_name: log.file_name,
        file_size: log.file_size.toString(),
        parse_mode: log.parse_mode,
        total_pages: log.total_pages,
        total_records: log.total_records,
        success_records: log.success_records,
        failed_records: log.failed_records,
        status: log.status,
        error_message: log.error_message,
        created_at: log.created_at,
        completed_at: log.completed_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 获取导入记录详情
   */
  @Get('logs/:id')
  @ApiOperation({ summary: '获取导入记录详情' })
  async getImportLogDetail(
    @Request() req,
    @Param('id') idStr: string,
  ) {
    const userId = req.user.userId;
    const id = BigInt(idStr);

    const log = await this.prisma.pdfImportLog.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, phone: true } },
        clan: { select: { id: true, name: true } },
        temp_records: {
          orderBy: { row_number: 'asc' },
          take: 100,
        },
      },
    });

    if (!log) {
      throw new NotFoundException('导入记录不存在');
    }

    await this.adminService.requireAdmin(log.clan_id, userId);

    return {
      id: log.id.toString(),
      task_id: log.task_id,
      user_phone: log.user.phone,
      clan_name: log.clan.name,
      file_name: log.file_name,
      file_size: log.file_size.toString(),
      parse_mode: log.parse_mode,
      total_pages: log.total_pages,
      total_records: log.total_records,
      success_records: log.success_records,
      failed_records: log.failed_records,
      status: log.status,
      error_message: log.error_message,
      created_at: log.created_at,
      completed_at: log.completed_at,
      preview_records: log.temp_records.map(r => ({
        id: r.id.toString(),
        row_number: r.row_number,
        full_name: r.full_name,
        gender: r.gender,
        generation: r.generation,
        birth_date: r.birth_date,
        death_date: r.death_date,
        is_living: r.is_living,
        parent_name: r.parent_name,
        spouse_name: r.spouse_name,
        biography: r.biography,
        confidence_score: r.confidence_score?.toString(),
        is_corrected: r.is_corrected,
      })),
    };
  }

  /**
   * 获取正在进行的导入任务
   */
  @Get('tasks/active')
  @ApiOperation({ summary: '获取正在进行的导入任务' })
  async getActiveTasks(
    @Request() req,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    // 获取所有 pending | parsing | preview | correcting | importing 状态的任务
    const activeStatuses = ['pending', 'parsing', 'preview', 'correcting', 'importing'];
    const tasks = await this.prisma.pdfImportLog.findMany({
      where: {
        clan_id: clanId,
        status: { in: activeStatuses },
      },
      include: {
        user: { select: { id: true, phone: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return {
      data: tasks.map(task => ({
        id: task.id.toString(),
        task_id: task.task_id,
        user_phone: task.user.phone,
        file_name: task.file_name,
        status: task.status,
        progress: this.calculateProgress(task),
        created_at: task.created_at,
      })),
    };
  }

  /**
   * 获取 OCR 使用统计
   */
  @Get('ocr-stats')
  @ApiOperation({ summary: '获取 OCR 使用统计' })
  async getOcrStats(
    @Request() req,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    // 获取本月 OCR 使用统计（基于 PdfImportLog）
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // 查询本月 OCR 任务汇总
    const ocrTasks = await this.prisma.pdfImportLog.findMany({
      where: {
        clan_id: clanId,
        parse_mode: 'ocr',
        created_at: { gte: startOfMonth },
      },
    });

    // 计算汇总
    let totalPages = 0;
    let totalRecords = 0;
    let successRecords = 0;
    let failedRecords = 0;

    for (const task of ocrTasks) {
      totalPages += task.total_pages;
      totalRecords += task.total_records;
      successRecords += task.success_records;
      failedRecords += task.failed_records;
    }

    // 获取本月文本解析任务汇总
    const textTasks = await this.prisma.pdfImportLog.findMany({
      where: {
        clan_id: clanId,
        parse_mode: 'text',
        created_at: { gte: startOfMonth },
      },
    });

    return {
      monthly: {
        ocr_tasks: ocrTasks.length,
        text_tasks: textTasks.length,
        total_pages: totalPages,
        total_records: totalRecords,
        success_records: successRecords,
        failed_records: failedRecords,
      },
      total: {
        ocr_tasks: ocrTasks.length,
        text_tasks: textTasks.length,
      },
    };
  }

  /**
   * 计算任务进度
   */
  private calculateProgress(task: any): number {
    switch (task.status) {
      case 'pending': return 0;
      case 'parsing': return 25;
      case 'preview': return 50;
      case 'correcting': return 75;
      case 'importing': return 90;
      case 'completed': return 100;
      case 'failed': return 0;
      default: return 0;
    }
  }
}
