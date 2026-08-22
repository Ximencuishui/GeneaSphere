import { Controller, Get, Param, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminService } from '../admin/admin.service';
import { ClanResolverService } from '../common/clan-resolver.service';
import { GenealogyDigitizeService } from './genealogy-digitize.service';

@ApiTags('genealogy-digitize')
@ApiBearerAuth()
@Controller('api/genealogy/:slug/digitize-tasks')
export class GenealogyDigitizeController {
  constructor(
    private readonly service: GenealogyDigitizeService,
    private readonly resolver: ClanResolverService,
    private readonly admin: AdminService,
  ) {}

  @Get()
  @ApiOperation({ summary: '旧谱电子化项目列表' })
  async list(@Request() req, @Param('slug') slug: string) {
    const { id } = await this.resolver.resolveOrThrow(slug);
    await this.admin.requireAdmin(id, req.user.userId);
    return { data: await this.service.list(id) };
  }
}
