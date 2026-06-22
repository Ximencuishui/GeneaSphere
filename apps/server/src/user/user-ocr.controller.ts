import {
  Controller,
  Get,
  Query,
  Request,
} from '@nestjs/common';
import { OcrBillingService } from '../import/ocr-billing.service';

/**
 * 用户中心 OCR 额度与使用记录接口（v1.0）
 * - GET /api/user/ocr/quota 当前用户 OCR 免费额度与已用情况
 * - GET /api/user/ocr/usage OCR 使用历史（分页）
 */
@Controller('user/ocr')
export class UserOcrController {
  constructor(private readonly ocrBilling: OcrBillingService) {}

  /**
   * 当前用户的 OCR 额度信息
   */
  @Get('quota')
  async getQuota(@Request() req) {
    return this.ocrBilling.getOcrQuota(req.user.userId);
  }

  /**
   * OCR 使用历史
   */
  @Get('usage')
  async getUsage(
    @Request() req,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 20));
    return this.ocrBilling.listUsage(req.user.userId, p, ps);
  }
}