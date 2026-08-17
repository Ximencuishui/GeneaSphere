import { Controller, Get, Param, Query, Res, HttpException, HttpStatus } from '@nestjs/common';
import { PrintService } from './print.service';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { ClanResolverService } from '../common/clan-resolver.service';

@Controller('print')
export class PrintController {
  constructor(
    private readonly printService: PrintService,
    private readonly clanResolver: ClanResolverService,
  ) {}

  /**
   * 兼容两种 URL 段：纯数字 id 直接 BigInt；非数字按 clan slug 解析（ClanResolverService）。
   * 与 tree.controller 的 resolveClanId 策略一致，方便树页工具栏直接传 slug。
   */
  private async resolveClanId(clanId: string): Promise<bigint> {
    if (/^\d+$/.test(clanId)) {
      return BigInt(clanId);
    }
    const { id } = await this.clanResolver.resolveOrThrow(clanId);
    return id;
  }

  @Public()
  @Get('genealogy/:clanId')
  async exportGenealogy(
    @Param('clanId') clanId: string,
    @Res() res: Response,
    @Query('mode') mode?: string,
  ) {
    try {
      const clanIdBigInt = await this.resolveClanId(clanId);

      // COS 模式：返回 CDN URL
      if (mode === 'cos' || process.env.COS_ENABLED === 'true') {
        const pdfUrl = await this.printService.generateAndUploadPdf(clanIdBigInt);
        return res.json({ url: pdfUrl });
      }

      // 本地模式：直接返回 PDF
      const pdfBuffer = await this.printService.generateGenealogyPdf(clanIdBigInt);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="genealogy_${clanIdBigInt}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      res.send(pdfBuffer);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to generate PDF',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /** 完整超长世系挂画 PDF（树谱工具栏"导出完整大图"） */
  @Public()
  @Get('hanging/:clanId')
  async exportHanging(
    @Param('clanId') clanId: string,
    @Res() res: Response,
  ) {
    try {
      const clanIdBigInt = await this.resolveClanId(clanId);
      const pdfBuffer = await this.printService.exportHangingPdf(clanIdBigInt);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="hanging_${clanIdBigInt}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      res.send(pdfBuffer);
    } catch (error) {
      throw new HttpException(
        error.message || '挂画 PDF 生成失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
