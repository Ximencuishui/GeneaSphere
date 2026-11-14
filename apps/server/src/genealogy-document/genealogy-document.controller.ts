import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from '../admin/admin.service';
import { GenealogyDocumentService } from './genealogy-document.service';
import { CreateGenealogyDocumentDto } from './dto/create-genealogy-document.dto';
import { GenealogyDocumentStyle } from '@prisma/client';
import { ClanResolverService } from '../common/clan-resolver.service';

@ApiTags('genealogy-document')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/genealogy-documents')
export class GenealogyDocumentController {
  constructor(
    private readonly service: GenealogyDocumentService,
    private readonly clanResolver: ClanResolverService,
    private readonly admin: AdminService,
  ) {}

  @Get(':clanSlug')
  @ApiOperation({ summary: '查询族谱文档历史版本列表' })
  async list(
    @Param('clanSlug') clanSlug: string,
    @Query('style') style?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    const styleEnum =
      style && (Object.values(GenealogyDocumentStyle) as string[]).includes(style)
        ? (style as GenealogyDocumentStyle)
        : undefined;
    return this.service.list(clanId, {
      style: styleEnum,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get(':clanSlug/diff')
  @ApiOperation({ summary: '对比两个版本的差异' })
  async diff(
    @Param('clanSlug') clanSlug: string,
    @Query('idA') idA: string,
    @Query('idB') idB: string,
  ) {
    if (!idA || !idB) {
      throw new BadRequestException('idA 与 idB 必填');
    }
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.diff(clanId, this.toBigInt(idA), this.toBigInt(idB));
  }

  @Get(':clanSlug/print-jobs/:jobId')
  @ApiOperation({ summary: '查询册谱印刷工作项状态' })
  async printJob(@Request() req, @Param('clanSlug') clanSlug: string, @Param('jobId') jobId: string) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    return this.service.getPrintJob(clanId, this.toBigInt(jobId));
  }

  @Get(':clanSlug/render-jobs/:jobId')
  @ApiOperation({ summary: '查询册谱 PDF 渲染任务' })
  async renderJob(@Param('clanSlug') clanSlug: string, @Param('jobId') jobId: string) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.getRenderJob(clanId, jobId);
  }

  @Get(':clanSlug/:id')
  @ApiOperation({ summary: '查询单个族谱文档' })
  async findOne(@Param('clanSlug') clanSlug: string, @Param('id') idStr: string) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.findOne(clanId, this.toBigInt(idStr));
  }

  @Post(':clanSlug/:id/print-jobs')
  @ApiOperation({ summary: '为已生成的册谱 PDF 创建印刷工作项' })
  async createPrintJob(@Request() req, @Param('clanSlug') clanSlug: string, @Param('id') idStr: string) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    return this.service.createPrintJob(clanId, req.user.userId, this.toBigInt(idStr));
  }

  @Post(':clanSlug/:id/retry')
  @ApiOperation({ summary: '重试对象存储失败的册谱 PDF，从渲染链路重新进入' })
  async retry(@Request() req, @Param('clanSlug') clanSlug: string, @Param('id') idStr: string) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    return this.service.retry(clanId, req.user.userId, this.toBigInt(idStr));
  }

  @Post(':clanSlug')
  @ApiOperation({ summary: '提交册谱 PDF 渲染任务，立即返回 job id' })
  async create(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() dto: CreateGenealogyDocumentDto,
  ) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    return this.service.enqueue(clanId, req.user.userId, dto);
  }

  @Delete(':clanSlug/:id')
  @ApiOperation({ summary: '删除族谱文档' })
  async delete(@Request() req, @Param('clanSlug') clanSlug: string, @Param('id') idStr: string) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    return this.service.delete(clanId, this.toBigInt(idStr));
  }

  private toBigInt(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException(`Invalid ID: ${value}`);
    }
  }
}
