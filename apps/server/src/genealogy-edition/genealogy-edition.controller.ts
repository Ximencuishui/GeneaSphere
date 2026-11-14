import { BadRequestException, Body, Controller, Get, Header, Param, Post, Put, Request, StreamableFile } from '@nestjs/common';
import { createReadStream } from 'fs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminService } from '../admin/admin.service';
import { ClanResolverService } from '../common/clan-resolver.service';
import { serializeBigInt } from '../common/bigint-serializer';
import { GenealogyEditionService } from './genealogy-edition.service';

@ApiTags('genealogy-edition')
@ApiBearerAuth()
@Controller('api/genealogy/:slug')
export class GenealogyEditionController {
  constructor(
    private readonly edition: GenealogyEditionService,
    private readonly resolver: ClanResolverService,
    private readonly admin: AdminService,
  ) {}

  private async clanId(slug: string, userId: string) {
    const { id } = await this.resolver.resolveOrThrow(slug);
    await this.admin.requireAdmin(id, userId);
    return id;
  }

  @Get('published-pdfs')
  async publishedPdfs(@Request() req, @Param('slug') slug: string) {
    return { data: await this.edition.listPublishedPdfs(await this.clanId(slug, req.user.userId)) };
  }

  @Get('source-pdfs/:taskId')
  @Header('Content-Type', 'application/pdf')
  async sourcePdf(@Request() req, @Param('slug') slug: string, @Param('taskId') taskId: string) {
    const file = await this.edition.openSourcePdf(await this.clanId(slug, req.user.userId), taskId);
    req.res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    return new StreamableFile(createReadStream(file.abs));
  }

  @Post('source-pdfs/:taskId/print')
  async printSource(@Request() req, @Param('slug') slug: string, @Param('taskId') taskId: string) {
    return {
      data: await this.edition.createSourcePrintJob(await this.clanId(slug, req.user.userId), req.user.userId, taskId),
    };
  }

  @Get('edition')
  async state(@Request() req, @Param('slug') slug: string) {
    return { data: await this.edition.state(await this.clanId(slug, req.user.userId)) };
  }

  @Post('edition/open')
  async open(@Request() req, @Param('slug') slug: string, @Body() body: { choice?: 'overwrite' | 'keep' }) {
    const choice = body?.choice === 'overwrite' || body?.choice === 'keep' ? body.choice : undefined;
    return { data: await this.edition.openRound(await this.clanId(slug, req.user.userId), req.user.userId, choice) };
  }

  @Post('edition/confirm')
  async confirm(
    @Request() req,
    @Param('slug') slug: string,
    @Body() body: { stage?: 'project' | 'digitize' | 'review' | 'revise' },
  ) {
    const stage = body?.stage;
    if (stage !== 'project' && stage !== 'digitize' && stage !== 'review' && stage !== 'revise') {
      throw new BadRequestException('未知确认环节');
    }
    return { data: await this.edition.confirm(await this.clanId(slug, req.user.userId), req.user.userId, stage) };
  }

  @Post('errata')
  async errata(@Request() req, @Param('slug') slug: string, @Body() body: {
    target_kind?: string;
    field_name?: string;
    new_value?: string;
    old_value?: string;
    reason?: string;
    person_id?: string;
    catalog_slot?: string;
    target_ref?: string;
  }) {
    if (!body?.field_name || !body.new_value) throw new BadRequestException('请填写勘误内容');
    return {
      data: await this.edition.fileErrata(await this.clanId(slug, req.user.userId), req.user.userId, {
        ...body,
        field_name: body.field_name,
        new_value: body.new_value,
      }),
    };
  }

  @Get('slots')
  async slots(@Request() req, @Param('slug') slug: string) {
    const clanId = await this.clanId(slug, req.user.userId);
    return serializeBigInt(await this.edition.ensureSlots(clanId, req.user.userId));
  }

  @Put('slots/:slot')
  async slot(
    @Request() req,
    @Param('slug') slug: string,
    @Param('slot') slot: string,
    @Body() body: { content?: string; config?: unknown },
  ) {
    const clanId = await this.clanId(slug, req.user.userId);
    return serializeBigInt(await this.edition.upsertSlot(clanId, req.user.userId, slot, body ?? {}));
  }
}
