import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModificationStatus } from '@prisma/client';
import { AdminService } from '../admin/admin.service';
import { ClanResolverService } from '../common/clan-resolver.service';
import { RateLimitGuard } from '../common/rate-limit.middleware';
import { InviteService } from '../invite/invite.service';
import { Public } from '../auth/public.decorator';
import { CreateCrowdsourceNoticeDto } from './dto/create-crowdsource-notice.dto';
import { CrowdsourceSubmissionDto } from './dto/crowdsource-submission.dto';
import { RejectCrowdsourceSubmissionDto } from './dto/reject-crowdsource-submission.dto';
import { UpdateCrowdsourceNoticeDto } from './dto/update-crowdsource-notice.dto';
import { GenealogyCrowdsourceService } from './genealogy-crowdsource.service';

@ApiTags('genealogy-crowdsource')
@ApiBearerAuth()
@Controller('api/genealogy/:slug/crowdsource')
export class GenealogyCrowdsourceController {
  constructor(
    private readonly service: GenealogyCrowdsourceService,
    private readonly clanResolver: ClanResolverService,
    private readonly admin: AdminService,
    private readonly invite: InviteService,
  ) {}

  private async requireAdmin(slug: string, userId: string): Promise<bigint> {
    const { id } = await this.clanResolver.resolveOrThrow(slug);
    await this.admin.requireAdmin(id, userId);
    return id;
  }

  private toId(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException(`Invalid ID: ${value}`);
    }
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @Post('notices/resolve')
  @ApiOperation({ summary: 'H5 解析通知 token' })
  async resolveNotice(
    @Param('slug') slug: string,
    @Body('token') token: string,
  ) {
    if (!token?.trim()) throw new BadRequestException('token 必填');
    const { id } = await this.clanResolver.resolveOrThrow(slug);
    return { data: await this.service.resolveNotice(id, token.trim()) };
  }

  /**
   * H5 公开端点：族员通过短信登录后提交族谱信息修改申请。
   * 该接口无 JWT 鉴权（公开 H5 流程），仅依赖通知 token + 手机号 + 短信验证码已完成（前端控制）。
   */
  @Public()
  @UseGuards(RateLimitGuard)
  @Post('submissions')
  @ApiOperation({ summary: 'H5 族员提交族谱信息修改申请' })
  async submitH5(
    @Param('slug') slug: string,
    @Body() dto: CrowdsourceSubmissionDto,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(slug);
    return { data: await this.service.submitH5(clanId, dto) };
  }

  @Get('notices')
  @ApiOperation({ summary: '通知文案列表' })
  async listNotices(@Request() req, @Param('slug') slug: string) {
    return { data: await this.service.list(await this.requireAdmin(slug, req.user.userId)) };
  }

  @Post('notices')
  @ApiOperation({ summary: '新建通知文案' })
  async createNotice(@Request() req, @Param('slug') slug: string, @Body() dto: CreateCrowdsourceNoticeDto) {
    const clanId = await this.requireAdmin(slug, req.user.userId);
    return { data: await this.service.create(clanId, req.user.userId, dto) };
  }

  @Put('notices/:id')
  @ApiOperation({ summary: '编辑通知文案' })
  async updateNotice(@Request() req, @Param('slug') slug: string, @Param('id') id: string, @Body() dto: UpdateCrowdsourceNoticeDto) {
    const clanId = await this.requireAdmin(slug, req.user.userId);
    return { data: await this.service.update(clanId, this.toId(id), dto) };
  }

  @Delete('notices/:id')
  @ApiOperation({ summary: '删除通知文案' })
  async removeNotice(@Request() req, @Param('slug') slug: string, @Param('id') id: string) {
    const clanId = await this.requireAdmin(slug, req.user.userId);
    return { data: await this.service.remove(clanId, this.toId(id)) };
  }

  @Get('submissions')
  @ApiOperation({ summary: '族员信息修改申请列表' })
  async listSubmissions(@Request() req, @Param('slug') slug: string, @Query('status') status?: string) {
    const clanId = await this.requireAdmin(slug, req.user.userId);
    const normalized = status && status !== 'all' ? status.toUpperCase() : undefined;
    if (normalized && !Object.values(ModificationStatus).includes(normalized as ModificationStatus)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }
    return { data: await this.invite.listModificationRequests(clanId, normalized as ModificationStatus | undefined) };
  }

  @Post('submissions/:id/approve')
  @ApiOperation({ summary: '通过族员信息修改申请' })
  async approve(@Request() req, @Param('slug') slug: string, @Param('id') id: string) {
    const clanId = await this.requireAdmin(slug, req.user.userId);
    return { data: await this.invite.reviewModificationRequest(this.toId(id), req.user.userId, { status: ModificationStatus.APPROVED }, clanId) };
  }

  @Post('submissions/:id/reject')
  @ApiOperation({ summary: '拒绝族员信息修改申请' })
  async reject(
    @Request() req,
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: RejectCrowdsourceSubmissionDto,
  ) {
    const clanId = await this.requireAdmin(slug, req.user.userId);
    return {
      data: await this.invite.reviewModificationRequest(
        this.toId(id),
        req.user.userId,
        { status: ModificationStatus.REJECTED, reject_reason: dto.reason.trim() },
        clanId,
      ),
    };
  }
}