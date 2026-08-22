import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminService } from '../admin/admin.service';
import { ClanResolverService } from '../common/clan-resolver.service';
import { FinalizeGenealogyDto } from './dto/finalize-genealogy.dto';
import { GenealogyFinalizeService } from './genealogy-finalize.service';

@ApiTags('genealogy-finalize')
@ApiBearerAuth()
@Controller('api/genealogy/:slug')
export class GenealogyFinalizeController {
  constructor(
    private readonly service: GenealogyFinalizeService,
    private readonly resolver: ClanResolverService,
    private readonly admin: AdminService,
  ) {}

  private async clanId(slug: string, userId: string) {
    const { id } = await this.resolver.resolveOrThrow(slug);
    await this.admin.requireAdmin(id, userId);
    return id;
  }

  @Post('finalize')
  @ApiOperation({ summary: '定谱并固化为新版本' })
  async finalize(@Request() req, @Param('slug') slug: string, @Body() dto: FinalizeGenealogyDto) {
    return { data: await this.service.finalize(await this.clanId(slug, req.user.userId), req.user.userId, dto) };
  }

  @Get('versions')
  @ApiOperation({ summary: '已定谱版本列表' })
  async versions(@Request() req, @Param('slug') slug: string) {
    return { data: await this.service.versions(await this.clanId(slug, req.user.userId)) };
  }
}
