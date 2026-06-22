import { Controller, Get, Param, Query, Res, HttpException, HttpStatus } from '@nestjs/common';
import { PrintService } from './print.service';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';

@Controller('print')
export class PrintController {
  constructor(private readonly printService: PrintService) {}

  @Public()
  @Get('genealogy/:clanId')
  async exportGenealogy(
    @Param('clanId') clanId: string,
    @Res() res: Response,
    @Query('mode') mode?: string,
  ) {
    try {
      const clanIdBigInt = BigInt(clanId);

      // COS 模式：返回 CDN URL
      if (mode === 'cos' || process.env.COS_ENABLED === 'true') {
        const pdfUrl = await this.printService.generateAndUploadPdf(clanIdBigInt);
        return res.json({ url: pdfUrl });
      }

      // 本地模式：直接返回 PDF
      const pdfBuffer = await this.printService.generateGenealogyPdf(clanIdBigInt);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="genealogy_${clanId}.pdf"`,
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
}
