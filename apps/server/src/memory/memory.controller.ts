import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { MemoryQuizStatus } from '@prisma/client';
import { MemoryService } from './memory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from '../admin/admin.service';
import { clientIp } from '../common/client-ip';
import { GetQuizDto, SubmitQuizAnswersDto, CreateQuizDto, CreateAnswerDto, MemoryWallQueryDto } from './dto/memory.dto';

@Controller('api/memory')
export class MemoryController {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly adminService: AdminService,
  ) {}

  // ==================== 公开接口（无需登录） ====================

  /**
   * 获取3道验证题目
   */
  @Get('quiz')
  async getQuizzes(@Query() query: GetQuizDto) {
    return this.memoryService.getRandomQuizzes(query.location, query.decade);
  }

  /**
   * 获取记忆留言墙数据
   */
  @Get('wall')
  async getMemoryWall(@Query() query: MemoryWallQueryDto) {
    return this.memoryService.getMemoryWall(
      query.location,
      query.decade,
      query.page,
      query.pageSize,
    );
  }

  // ==================== 需要登录 ====================

  /**
   * 提交验证答案
   */
  @Post('quiz/submit')
  @UseGuards(JwtAuthGuard)
  async submitQuizAnswers(
    @Req() req: any,
    @Body() body: SubmitQuizAnswersDto,
  ) {
    return this.memoryService.submitQuizAnswers(
      req.user.id,
      body.location,
      body.decade,
      body.answers,
    );
  }

  /**
   * 创建题目
   */
  @Post('quiz/create')
  @UseGuards(JwtAuthGuard)
  async createQuiz(@Req() req: any, @Body() body: CreateQuizDto) {
    return this.memoryService.createQuiz(req.user.userId || req.user.id, body);
  }

  /**
   * 提交答案
   */
  @Post('answer')
  @UseGuards(JwtAuthGuard)
  async createAnswer(@Req() req: any, @Body() body: CreateAnswerDto) {
    return this.memoryService.createAnswer(req.user.id, body.quizId, body.content);
  }

  /**
   * "我证实" 投票
   */
  @Post('answer/:id/endorse')
  @UseGuards(JwtAuthGuard)
  async endorseAnswer(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.memoryService.endorseAnswer(req.user.id, id);
  }

  /**
   * 获取当前用户徽章
   */
  @Get('badges')
  @UseGuards(JwtAuthGuard)
  async getUserBadges(@Req() req: any) {
    return this.memoryService.getUserBadges(req.user.id);
  }

  /**
   * 获取当前用户已验证的地区
   */
  @Get('verified-locations')
  @UseGuards(JwtAuthGuard)
  async getVerifiedLocations(@Req() req: any) {
    return this.memoryService.getUserVerifiedLocations(req.user.id);
  }

  // ==================== 管理员接口 ====================

  /**
   * 获取待审核题目
   */
  @Get('admin/pending')
  @UseGuards(JwtAuthGuard)
  async getPendingQuizzes(
    @Req() req: any,
    @Query('clanSlug') clanSlug: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: string,
  ) {
    const userId = req.user.userId || req.user.id;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const quizStatus = status === 'ALL' ? 'ALL' : (status as MemoryQuizStatus | undefined);
    return this.memoryService.getPendingQuizzes(clanId, Number(page) || 1, Number(pageSize) || 20, quizStatus);
  }

  /**
   * 审核题目
   */
  @Post('admin/review/:id')
  @UseGuards(JwtAuthGuard)
  async reviewQuiz(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
    @Body('answer') answer?: string,
    @Body('reject_reason') rejectReason?: string,
    @Query('clanSlug') clanSlug?: string,
  ) {
    const userId = req.user.userId || req.user.id;
    const slug = clanSlug || req.body?.clanSlug;
    if (!slug) throw new ForbiddenException('缺少家族标识');
    const clanId = await this.adminService.requireAdminBySlug(slug, userId);
    const result = await this.memoryService.reviewQuiz(id, clanId, status as MemoryQuizStatus, answer, rejectReason);
    await this.adminService.logAction({
      clanId,
      userId,
      action: status === 'REJECTED' ? 'REJECT_MEMORY_QUIZ' : 'APPROVE_MEMORY_QUIZ',
      targetType: 'LocalMemoryQuiz',
      targetId: String(id),
      details: rejectReason || answer || status,
      ipAddress: clientIp(req),
    });
    return result;
  }
}
