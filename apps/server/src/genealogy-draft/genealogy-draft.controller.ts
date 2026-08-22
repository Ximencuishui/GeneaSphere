import { BadRequestException, Body, Controller, Delete, Get, Header, Param, Post, Put, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminService } from '../admin/admin.service';
import { ClanResolverService } from '../common/clan-resolver.service';
import { CreateGenealogyDraftDto } from './dto/create-genealogy-draft.dto';
import { UpdateGenealogyDraftDto } from './dto/update-genealogy-draft.dto';
import { GenealogyDraftService } from './genealogy-draft.service';

@ApiTags('genealogy-draft')
@ApiBearerAuth()
@Controller('api/genealogy/:slug')
export class GenealogyDraftController {
  constructor(
    private readonly service: GenealogyDraftService,
    private readonly resolver: ClanResolverService,
    private readonly admin: AdminService,
  ) {}

  private async clanId(slug: string, userId: string) {
    const { id } = await this.resolver.resolveOrThrow(slug);
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

  @Get('drafts')
  @ApiOperation({ summary: '族谱草稿列表' })
  async list(@Request() req, @Param('slug') slug: string) {
    return { data: await this.service.list(await this.clanId(slug, req.user.userId)) };
  }

  @Post('drafts')
  @ApiOperation({ summary: '保存族谱草稿' })
  async create(@Request() req, @Param('slug') slug: string, @Body() dto: CreateGenealogyDraftDto) {
    return { data: await this.service.create(await this.clanId(slug, req.user.userId), req.user.userId, dto) };
  }

  @Put('drafts/:id')
  @ApiOperation({ summary: '更新族谱草稿' })
  async update(
    @Request() req,
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: UpdateGenealogyDraftDto,
  ) {
    return { data: await this.service.update(await this.clanId(slug, req.user.userId), this.toId(id), dto) };
  }

  @Delete('drafts/:id')
  @ApiOperation({ summary: '删除族谱草稿' })
  async remove(@Request() req, @Param('slug') slug: string, @Param('id') id: string) {
    return { data: await this.service.remove(await this.clanId(slug, req.user.userId), this.toId(id)) };
  }

  @Get('export')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @ApiOperation({ summary: '导出族谱 JSON 备份' })
  async export(@Request() req, @Param('slug') slug: string, @Query('format') format = 'json') {
    if (format !== 'json') return { message: `Unsupported format: ${format}` };
    return this.service.exportJson(await this.clanId(slug, req.user.userId));
  }
}
