import {
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from '../admin/admin.service';
import { PrismaService } from '@geneasphere/db';
import { GenealogyWorkflowService } from './genealogy-workflow.service';

/**
 * 修谱工作流 API
 * GET /api/genealogy-workflow/status?clanId=<slug|id>
 * - 供管理后台【控制台】与【修谱】顶部工作流条展示当前修谱进度
 * - 仅家族 OWNER/ADMIN 可访问
 */
@ApiTags('genealogy-workflow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/genealogy-workflow')
export class GenealogyWorkflowController {
  constructor(
    private readonly workflowService: GenealogyWorkflowService,
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: '获取修谱工作流状态（7 阶段 + 旧谱电子化 4 子阶段）' })
  async getStatus(@Request() req, @Query('clanId') clanId: string) {
    if (!clanId) {
      throw new BadRequestException('clanId 必填');
    }
    const userId = req.user.userId;

    // 兼容数字 ID 与 slug
    const clan = await this.resolveClan(clanId);
    if (!clan) {
      throw new NotFoundException(`Clan '${clanId}' not found`);
    }

    await this.adminService.requireAdmin(clan.id, userId);
    return this.workflowService.getStatus(clan);
  }

  private async resolveClan(
    clanId: string,
  ): Promise<{ id: bigint; slug: string; name: string } | null> {
    if (/^\d+$/.test(clanId)) {
      const byId = await this.prisma.clan.findUnique({
        where: { id: BigInt(clanId) },
        select: { id: true, slug: true, name: true },
      });
      if (!byId) return null;
      return { id: byId.id, slug: byId.slug ?? byId.id.toString(), name: byId.name };
    }
    // slug 路径
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(clanId)) {
      throw new BadRequestException(`Invalid clan id '${clanId}'`);
    }
    const bySlug = await this.prisma.clan.findUnique({
      where: { slug: clanId },
      select: { id: true, slug: true, name: true },
    });
    if (!bySlug) return null;
    return { id: bySlug.id, slug: bySlug.slug!, name: bySlug.name };
  }
}
