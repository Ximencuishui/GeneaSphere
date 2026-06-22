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
import { MemoryService } from './memory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetQuizDto, SubmitQuizAnswersDto, CreateQuizDto, CreateAnswerDto, MemoryWallQueryDto } from './dto/memory.dto';

@Controller('memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

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
    return this.memoryService.createQuiz(req.user.id, body);
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
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    // Check admin role
    const role = req.user.role || '';
    if (!['OWNER', 'ADMIN', 'super', 'operator'].includes(role)) {
      return { error: '无权限' };
    }
    return this.memoryService.getPendingQuizzes(page || 1, pageSize || 20);
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
  ) {
    const role = req.user.role || '';
    if (!['OWNER', 'ADMIN', 'super', 'operator'].includes(role)) {
      return { error: '无权限' };
    }
    return this.memoryService.reviewQuiz(id, status as any, answer);
  }
}
