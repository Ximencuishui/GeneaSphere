import { Controller, Get, Post, Put, Body, Query, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SmsService } from './sms.service';

@ApiTags('admin/sms')
@Controller('api/admin/sms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  // ==================== 余额管理 ====================

  /**
   * 获取当前余额和统计信息
   */
  @Get('balance')
  @ApiOperation({ summary: '获取当前余额和统计信息' })
  async getBalance(
    @Request() req,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);
    return await this.smsService.getBalance(clanId, userId);
  }

  /**
   * 设置低水位预警阈值
   */
  @Put('balance/threshold')
  @ApiOperation({ summary: '设置低水位预警阈值' })
  async setLowBalanceThreshold(
    @Request() req,
    @Body() body: { clanId: string; threshold: number },
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(body.clanId);
    return await this.smsService.setLowBalanceThreshold(clanId, userId, body.threshold);
  }

  /**
   * 获取费用统计（月发送条数、消费金额）
   */
  @Get('balance/stats')
  @ApiOperation({ summary: '获取费用统计' })
  async getCostStats(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);
    return await this.smsService.getCostStats(
      clanId,
      userId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  // ==================== 充值管理 ====================

  /**
   * 创建充值订单
   */
  @Post('recharge')
  @ApiOperation({ summary: '创建充值订单' })
  async createRechargeOrder(
    @Request() req,
    @Body() body: { clanId: string; amount: number; paymentMethod: 'wechat' | 'alipay' },
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(body.clanId);
    return await this.smsService.createRechargeOrder(
      clanId,
      userId,
      body.amount,
      body.paymentMethod,
    );
  }

  /**
   * 获取充值记录列表
   */
  @Get('recharge-records')
  @ApiOperation({ summary: '获取充值记录列表' })
  async getRechargeRecords(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);
    return await this.smsService.getRechargeRecords(
      clanId,
      userId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  // ==================== 短信发送 ====================

  /**
   * 发送短信
   */
  @Post('send')
  @ApiOperation({ summary: '发送短信' })
  async sendSms(
    @Request() req,
    @Body() body: {
      clanId: string;
      content: string;
      recipientIds: string[];
      signName?: string;
      sendType?: 'IMMEDIATE' | 'SCHEDULED';
      scheduledAt?: string;
    },
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(body.clanId);
    return await this.smsService.sendSms(
      clanId,
      userId,
      body.content,
      body.recipientIds,
      body.signName || '【寻根路】',
      body.sendType || 'IMMEDIATE',
      body.scheduledAt ? new Date(body.scheduledAt) : undefined,
    );
  }

  /**
   * 获取发送记录列表
   */
  @Get('records')
  @ApiOperation({ summary: '获取发送记录列表' })
  async getSendRecords(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);
    return await this.smsService.getSendRecords(
      clanId,
      userId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
      status,
    );
  }

  /**
   * 获取发送记录详情
   */
  @Get('records/:id')
  @ApiOperation({ summary: '获取发送记录详情' })
  async getSendRecordDetail(
    @Request() req,
    @Param('id') recordIdStr: string,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);
    const recordId = BigInt(recordIdStr);
    return await this.smsService.getSendRecordDetail(recordId, clanId, userId);
  }

  // ==================== 扣费记录 ====================

  /**
   * 获取扣费记录列表
   */
  @Get('cost-logs')
  @ApiOperation({ summary: '获取扣费记录列表' })
  async getCostLogs(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);
    return await this.smsService.getCostLogs(
      clanId,
      userId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  // ==================== 辅助接口 ====================

  /**
   * 获取充值档位配置
   */
  @Get('recharge-tiers')
  @ApiOperation({ summary: '获取充值档位配置' })
  async getRechargeTiers() {
    return {
      tiers: [
        { amount: 50, bonus: 0, description: '无赠送' },
        { amount: 100, bonus: 10, description: '赠送10元' },
        { amount: 200, bonus: 30, description: '赠送30元' },
        { amount: 500, bonus: 100, description: '赠送100元' },
      ],
      unit_price: 0.05,
      unit: '元/条',
    };
  }
}
