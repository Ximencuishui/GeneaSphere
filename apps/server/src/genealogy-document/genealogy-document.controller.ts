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

@ApiTags('genealogy-document')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/genealogy-documents')
export class GenealogyDocumentController {
  constructor(private readonly service: GenealogyDocumentService) {}

  @Get(':clanId')
  @ApiOperation({ summary: '查询族谱文档历史版本列表' })
  async list(
    @Param('clanId') clanIdStr: string,
    @Query('style') style?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const styleEnum =
      style && (Object.values(GenealogyDocumentStyle) as string[]).includes(style)
        ? (style as GenealogyDocumentStyle)
        : undefined;
    return this.service.list(this.toBigInt(clanIdStr), {
      style: styleEnum,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get(':clanId/:id')
  @ApiOperation({ summary: '查询单个族谱文档' })
  async findOne(@Param('clanId') clanIdStr: string, @Param('id') idStr: string) {
    return this.service.findOne(this.toBigInt(clanIdStr), this.toBigInt(idStr));
  }

  @Post(':clanId')
  @ApiOperation({ summary: '生成族谱文档并保存为新版本' })
  async create(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Body() dto: CreateGenealogyDocumentDto,
  ) {
    return this.service.create(this.toBigInt(clanIdStr), req.user.userId, dto);
  }

  @Delete(':clanId/:id')
  @ApiOperation({ summary: '删除族谱文档' })
  async delete(@Param('clanId') clanIdStr: string, @Param('id') idStr: string) {
    return this.service.delete(this.toBigInt(clanIdStr), this.toBigInt(idStr));
  }

  @Get(':clanId/diff')
  @ApiOperation({ summary: '对比两个版本的差异' })
  async diff(
    @Param('clanId') clanIdStr: string,
    @Query('idA') idA: string,
    @Query('idB') idB: string,
  ) {
    if (!idA || !idB) {
      throw new BadRequestException('idA 与 idB 必填');
    }
    return this.service.diff(this.toBigInt(clanIdStr), this.toBigInt(idA), this.toBigInt(idB));
  }

  private toBigInt(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException(`Invalid ID: ${value}`);
    }
  }
}
