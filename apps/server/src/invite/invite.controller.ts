import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { InviteService } from './invite.service';
import { WechatService } from './wechat.service';
import { AdminService } from '../admin/admin.service';
import { CreateInviteQrcodeDto } from './dto/create-invite-qrcode.dto';
import { CreatePeerQrcodeDto } from './dto/create-peer-qrcode.dto';
import { AutoMatchDto } from './dto/auto-match.dto';
import { SubmitPersonInfoDto } from './dto/submit-person-info.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { RequestEndorsementDto } from './dto/request-endorsement.dto';
import { RespondEndorsementDto } from './dto/respond-endorsement.dto';
import { ConfirmInfoDto } from './dto/confirm-info.dto';
import { ModificationReviewDto } from './dto/modification-review.dto';
import { WxCallbackDto } from './dto/wx-callback.dto';
import { VerificationStatus } from '@prisma/client';
import { ClanResolverService } from '../common/clan-resolver.service';

@ApiTags('invite')
@Controller('api/invite')
export class InviteController {
  constructor(
    private readonly invite: InviteService,
    private readonly wechat: WechatService,
    private readonly admin: AdminService,
    private readonly clanResolver: ClanResolverService,
  ) {}

  // ==================== 管理端：邀请二维码 ====================

  @Post('qrcodes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员创建邀请二维码' })
  async createQrcode(@Request() req, @Body() dto: CreateInviteQrcodeDto) {
    const userId = req.user.userId;
    const clanId = await this.admin.requireAdminBySlug(dto.clan_slug, userId);
    return this.invite.createInviteQrcode(clanId, userId, dto.expire_days);
  }

  @Get('qrcodes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员列出家族邀请二维码' })
  async listQrcodes(@Request() req, @Query('clan_slug') clanSlug: string) {
    const userId = req.user.userId;
    const clanId = await this.admin.requireAdminBySlug(clanSlug, userId);
    return { data: await this.invite.listInviteQrcodes(clanId) };
  }

  @Get('qrcodes/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '邀请二维码详情' })
  async getQrcode(@Request() req, @Param('id') idStr: string) {
    const id = BigInt(idStr);
    const detail = await this.invite.getInviteQrcode(id);
    // detail.clan_id 是数据库里的字符串 id，转回 bigint 后做权限校验
    await this.admin.requireAdmin(BigInt(detail.clan_id), req.user.userId);
    return detail;
  }

  @Delete('qrcodes/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '撤销邀请二维码' })
  async revokeQrcode(@Request() req, @Param('id') idStr: string) {
    return this.invite.revokeInviteQrcode(BigInt(idStr), req.user.userId);
  }

  @Get('scan-stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '扫码与验证统计' })
  async scanStats(
    @Request() req,
    @Query('clan_slug') clanSlug: string,
    @Query('days') daysStr?: string,
  ) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    const days = daysStr ? parseInt(daysStr) : 7;
    return this.invite.getScanStats(clanId, days);
  }

  // ==================== 管理端：验证记录 ====================

  @Get('verification-records')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '验证会话记录' })
  async listRecords(
    @Request() req,
    @Query('clan_slug') clanSlug: string,
    @Query('status') status?: VerificationStatus,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    return this.invite.listVerificationRecords(clanId, {
      status,
      page: parseInt(pageStr) || 1,
      pageSize: parseInt(pageSizeStr) || 20,
    });
  }

  @Get('verification-records/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '验证会话详情' })
  async getRecordDetail(@Request() req, @Param('id') idStr: string) {
    const detail = await this.invite.getVerificationRecordDetail(BigInt(idStr));
    // detail.clan_id 是数据库里的字符串 id，转回 bigint 后做权限校验
    await this.admin.requireAdmin(BigInt(detail.clan_id), req.user.userId);
    return detail;
  }

  // ==================== 管理端：信息修改审核 ====================

  @Get('modification-requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '信息修改申请列表' })
  async listModification(
    @Request() req,
    @Query('clan_slug') clanSlug: string,
    @Query('status') status?: any,
  ) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    return { data: await this.invite.listModificationRequests(clanId, status) };
  }

  @Patch('modification-requests/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '审核信息修改申请' })
  async reviewModification(
    @Request() req,
    @Param('id') idStr: string,
    @Body() dto: ModificationReviewDto,
  ) {
    return this.invite.reviewModificationRequest(
      BigInt(idStr),
      req.user.userId,
      { status: dto.status, reject_reason: dto.reject_reason },
    );
  }

  // ==================== 互发验证二维码（已登录用户） ====================

  @Post('peer-qrcode')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '已认证族人生成互发验证二维码（30 分钟有效）' })
  async createPeerQrcode(@Request() req, @Body() dto: CreatePeerQrcodeDto) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(dto.clan_slug);
    return this.invite.createPeerQrcode(req.user.userId, clanId);
  }

  @Get('peer-qrcode/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '互发二维码详情' })
  async getPeerQrcode(@Request() req, @Param('id') idStr: string) {
    return this.invite.getPeerQrcode(BigInt(idStr), req.user.userId);
  }

  @Get('peer-qrcode/my-records')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的互发验证记录' })
  async listMyPeerQrcodes(@Request() req) {
    return { data: await this.invite.listMyPeerQrcodes(req.user.userId) };
  }

  // ==================== H5 公开 API ====================

  @Public()
  @Get('h5/wx-config')
  @ApiOperation({ summary: '微信 JSSDK 配置（Mock）' })
  async getWxConfig(@Query('url') url: string) {
    return this.wechat.getJsSdkConfig(url);
  }

  @Public()
  @Get('h5/resolve')
  @ApiOperation({ summary: '扫码落地：创建验证会话' })
  async resolve(@Query('code') code: string) {
    return this.invite.resolveQrcode(code);
  }

  @Public()
  @Post('h5/wx-callback')
  @ApiOperation({ summary: '微信授权回调（Mock）' })
  async wxCallback(@Body() dto: WxCallbackDto, @Query('session_id') sessionIdStr?: string) {
    const profile = await this.wechat.exchangeCode(dto.code, {
      mock_phone: dto.mock_phone,
      mock_nickname: dto.mock_nickname,
    });
    if (!sessionIdStr) {
      return { profile };
    }
    return this.invite.handleWxCallback(BigInt(sessionIdStr), profile);
  }

  @Public()
  @Get('h5/session/:id')
  @ApiOperation({ summary: '获取验证会话状态（H5 轮询）' })
  async sessionStatus(@Param('id') idStr: string) {
    return this.invite.getSessionStatus(BigInt(idStr));
  }

  @Public()
  @Get('h5/auto-match')
  @ApiOperation({ summary: '自动匹配族谱人物' })
  async autoMatch(@Query() dto: AutoMatchDto) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(dto.clan_slug);
    return this.invite.autoMatchPerson(clanId, {
      full_name: dto.full_name,
      father_name: dto.father_name,
      birth_year: dto.birth_year,
    });
  }

  @Public()
  @Post('h5/person-info')
  @ApiOperation({ summary: '提交无数据时的填报信息' })
  async submitPersonInfo(@Body() dto: SubmitPersonInfoDto) {
    return this.invite.submitPersonInfo(BigInt(dto.session_id), {
      full_name: dto.full_name,
      gender: dto.gender,
      birth_year: dto.birth_year,
      father_name: dto.father_name,
      mother_name: dto.mother_name,
      spouse_name: dto.spouse_name,
      children_names: dto.children_names,
    });
  }

  @Public()
  @Post('h5/confirm-info')
  @ApiOperation({ summary: '确认/修改信息' })
  async confirmInfo(@Body() dto: ConfirmInfoDto) {
    return this.invite.confirmInfo(BigInt(dto.session_id), {
      person_id: dto.person_id,
      confirmed_payload: dto.confirmed_payload,
    });
  }

  @Public()
  @Get('h5/quiz/:sessionId')
  @ApiOperation({ summary: '生成 3 道知识问答' })
  async getQuiz(@Param('sessionId') idStr: string) {
    return this.invite.generateQuiz(BigInt(idStr));
  }

  @Public()
  @Post('h5/quiz/:sessionId/answer')
  @ApiOperation({ summary: '提交单题答案' })
  async answerQuiz(
    @Param('sessionId') idStr: string,
    @Body() body: { attempt_id: number; answer: string },
  ) {
    return this.invite.submitQuizAnswer(BigInt(idStr), BigInt(body.attempt_id), body.answer);
  }

  @Public()
  @Post('h5/quiz/:sessionId/submit')
  @ApiOperation({ summary: '提交整套题目' })
  async submitQuiz(
    @Param('sessionId') idStr: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.invite.submitQuiz(BigInt(idStr), dto.answers, dto.retry_round || 0);
  }

  @Public()
  @Post('h5/endorsement/:sessionId/request')
  @ApiOperation({ summary: '发起熟人背书请求' })
  async requestEndorsement(
    @Param('sessionId') idStr: string,
    @Body() dto: RequestEndorsementDto,
  ) {
    return this.invite.requestEndorsement(BigInt(idStr), dto.endorser_key);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('h5/endorsement/:id/respond')
  @ApiOperation({ summary: '被背书人响应（需登录）' })
  async respondEndorsement(
    @Request() req,
    @Param('id') idStr: string,
    @Body() dto: RespondEndorsementDto,
  ) {
    return this.invite.respondEndorsement(
      BigInt(idStr),
      req.user.userId,
      dto.result,
      dto.reject_reason,
    );
  }
}
