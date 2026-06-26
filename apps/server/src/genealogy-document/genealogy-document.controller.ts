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

  @Get(':clanSlug/:id')
  @ApiOperation({ summary: '查询单个族谱文档' })
  async findOne(@Param('clanSlug') clanSlug: string, @Param('id') idStr: string) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.findOne(clanId, this.toBigInt(idStr));
  }

  @Post(':clanSlug')
  @ApiOperation({ summary: '生成族谱文档并保存为新版本' })
  async create(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() dto: CreateGenealogyDocumentDto,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.create(clanId, req.user.userId, dto);
  }

  @Delete(':clanSlug/:id')
  @ApiOperation({ summary: '删除族谱文档' })
  async delete(@Param('clanSlug') clanSlug: string, @Param('id') idStr: string) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
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
