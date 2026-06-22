import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '@geneasphere/db';
import { OrderStatus, PrintOrderRefundStatus } from '@prisma/client';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PlatformOperationLogService } from '../common/platform-operation-log.service';
import { getClientIp } from '../common/ip.util';

@ApiTags('platform/orders')
@ApiBearerAuth('platform')
@UseGuards(PlatformAuthGuard)
@Controller('api/platform/orders')
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logService: PlatformOperationLogService,
  ) {}

  // ==================== 印刷订单 ====================

  @Get('print')
  @ApiOperation({ summary: '全平台印刷订单' })
  async printList(
    @Query('status') status?: string,
    @Query('familyId') familyIdStr?: string,
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;
    const where: any = {};
    if (status) where.status = status;
    if (familyIdStr) where.clan_id = BigInt(familyIdStr);
    if (startDateStr || endDateStr) {
      where.created_at = {};
      if (startDateStr) where.created_at.gte = new Date(startDateStr);
      if (endDateStr) where.created_at.lte = new Date(endDateStr);
    }
    const [items, total] = await Promise.all([
      this.prisma.printOrder.findMany({
        where,
        include: {
          clan: { select: { id: true, name: true } },
          user: { select: { id: true, phone: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.printOrder.count({ where }),
    ]);
    return {
      data: items.map((o) => ({
        id: o.id.toString(),
        family: { id: o.clan.id.toString(), name: o.clan.name },
        user_phone_masked: o.user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
        specification: o.specification,
        quantity: o.quantity,
        amount: o.amount,
        status: o.status,
        tracking_no: o.tracking_no,
        tracking_company: o.tracking_company,
        refund_amount: o.refund_amount,
        refund_status: o.refund_status,
        created_at: o.created_at,
        updated_at: o.updated_at,
      })),
      pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
    };
  }

  @Get('print/:id')
  @ApiOperation({ summary: '印刷订单详情' })
  async printDetail(@Param('id') idStr: string) {
    const id = BigInt(idStr);
    const o = await this.prisma.printOrder.findUnique({
      where: { id },
      include: {
        clan: { select: { id: true, name: true } },
        user: { select: { id: true, phone: true } },
      },
    });
    if (!o) throw new NotFoundException('订单不存在');
    return {
      id: o.id.toString(),
      family: { id: o.clan.id.toString(), name: o.clan.name },
      user: {
        id: o.user.id,
        phone_masked: o.user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
      },
      specification: o.specification,
      quantity: o.quantity,
      amount: o.amount,
      status: o.status,
      tracking_no: o.tracking_no,
      tracking_company: o.tracking_company,
      shipping_address: o.shipping_address,
      refund_amount: o.refund_amount,
      refund_reason: o.refund_reason,
      refund_status: o.refund_status,
      refunded_at: o.refunded_at,
      created_at: o.created_at,
      updated_at: o.updated_at,
    };
  }

  @Post('print/:id/ship')
  @ApiOperation({ summary: '标记发货' })
  async ship(
    @Param('id') idStr: string,
    @Body() body: { tracking_no: string; tracking_company: string },
    @Request() req: any,
  ) {
    if (!body.tracking_no || !body.tracking_company) {
      throw new BadRequestException('请填写物流单号与快递公司');
    }
    const id = BigInt(idStr);
    const o = await this.prisma.printOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('订单不存在');
    if (!['PAID', 'PRINTING', 'PENDING'].includes(o.status)) {
      throw new BadRequestException(`当前订单状态(${o.status})不可发货`);
    }
    const updated = await this.prisma.printOrder.update({
      where: { id },
      data: {
        status: OrderStatus.SHIPPED,
        tracking_no: body.tracking_no,
        tracking_company: body.tracking_company,
      },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'SHIP_ORDER',
      targetType: 'PrintOrder',
      targetId: idStr,
      detail: { tracking_no: body.tracking_no, tracking_company: body.tracking_company },
      ipAddress: getClientIp(req),
    });
    return { message: '已标记发货', status: updated.status };
  }

  @Post('print/:id/refund')
  @ApiOperation({ summary: '发起退款' })
  async refund(
    @Param('id') idStr: string,
    @Body() body: { amount: number; reason: string },
    @Request() req: any,
  ) {
    if (!body.amount || body.amount <= 0 || !body.reason) {
      throw new BadRequestException('请填写退款金额与原因');
    }
    const id = BigInt(idStr);
    const o = await this.prisma.printOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('订单不存在');
    const newRefundTotal = Number(o.refund_amount) + Number(body.amount);
    if (newRefundTotal > Number(o.amount)) {
      throw new BadRequestException('累计退款金额不能超过订单金额');
    }
    const isFull = Math.abs(newRefundTotal - Number(o.amount)) < 0.01;
    const updated = await this.prisma.printOrder.update({
      where: { id },
      data: {
        refund_amount: newRefundTotal,
        refund_reason: body.reason,
        refund_status: isFull
          ? (PrintOrderRefundStatus.FULL as any)
          : (PrintOrderRefundStatus.PARTIAL as any),
        refunded_at: new Date(),
        status: isFull ? OrderStatus.CANCELLED : o.status,
      },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'REFUND_ORDER',
      targetType: 'PrintOrder',
      targetId: idStr,
      detail: { amount: body.amount, reason: body.reason, is_full: isFull },
      ipAddress: getClientIp(req),
    });
    return { message: isFull ? '已全额退款' : '已部分退款', refund_amount: updated.refund_amount, refund_status: updated.refund_status, status: updated.status };
  }

  // ==================== 充值订单 ====================

  @Get('recharge')
  @ApiOperation({ summary: '充值订单列表' })
  async rechargeList(
    @Query('status') status?: string,
    @Query('familyId') familyIdStr?: string,
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;
    const where: any = {};
    if (status) where.status = status;
    if (familyIdStr) where.clan_id = BigInt(familyIdStr);
    if (startDateStr || endDateStr) {
      where.created_at = {};
      if (startDateStr) where.created_at.gte = new Date(startDateStr);
      if (endDateStr) where.created_at.lte = new Date(endDateStr);
    }
    const [items, total] = await Promise.all([
      this.prisma.rechargeOrder.findMany({
        where,
        include: { clan: { select: { id: true, name: true } } },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.rechargeOrder.count({ where }),
    ]);
    return {
      data: items.map((o) => ({
        id: o.id.toString(),
        family: { id: o.clan.id.toString(), name: o.clan.name },
        user_id: o.user_id,
        amount: o.amount,
        bonus_amount: o.bonus_amount,
        payment_method: o.payment_method,
        transaction_no: o.transaction_no,
        status: o.status,
        created_at: o.created_at,
      })),
      pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
    };
  }

  @Get('recharge/export-csv')
  @ApiOperation({ summary: '导出充值对账 CSV' })
  async exportRechargeCsv(
    @Res() res: Response,
    @Request() req: any,
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
  ) {
    const where: any = {};
    if (startDateStr || endDateStr) {
      where.created_at = {};
      if (startDateStr) where.created_at.gte = new Date(startDateStr);
      if (endDateStr) where.created_at.lte = new Date(endDateStr);
    }
    const items = await this.prisma.rechargeOrder.findMany({
      where,
      include: { clan: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
    });
    const header = '订单ID,家族名称,用户ID,金额,赠送金额,支付方式,交易号,状态,创建时间\n';
    const rows = items
      .map(
        (o) =>
          `${o.id},${o.clan.name},${o.user_id},${o.amount},${o.bonus_amount},${o.payment_method},${o.transaction_no || ''},${o.status},${o.created_at.toISOString()}\n`,
      )
      .join('');
    const csv = '\uFEFF' + header + rows; // BOM 让 Excel 识别 UTF-8

    if (req) {
      await this.logService.log({
        adminId: req.user.adminId,
        actionType: 'EXPORT_RECHARGE_CSV',
        targetType: 'RechargeOrder',
        ipAddress: getClientIp(req),
      });
    }

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="recharge_${Date.now()}.csv"`,
    });
    res.send(csv);
  }
}
