import {
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  Query,
  NotFoundException,
  Body,
  Param,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';

@ApiTags('admin/orders')
@Controller('api/admin/orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取印刷订单列表
   */
  @Get()
  @ApiOperation({ summary: 'Get print orders list' })
  async getOrders(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('status') status?: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const where: any = { clan_id: clanId };
    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      this.prisma.printOrder.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.printOrder.count({ where }),
    ]);

    return {
      data: orders.map(o => ({
        id: o.id.toString(),
        specification: o.specification,
        quantity: o.quantity,
        amount: o.amount,
        status: o.status,
        tracking_no: o.tracking_no,
        created_at: o.created_at,
        updated_at: o.updated_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 再次购买（需求 §3.8.1）
   * 复制原订单的规格、数量、收货地址，生成新订单（status=PENDING）。
   * 新订单需走常规支付流程。
   *
   * 响应中同时返回原订单与新订单的关键字段，便于前端在跳转印刷页前确认。
   */
  @Post(':id/reorder')
  @ApiOperation({ summary: '基于历史订单再次购买' })
  async reorder(
    @Request() req,
    @Param('id') orderIdStr: string,
  ) {
    const userId = req.user.userId;
    const orderId = BigInt(orderIdStr);

    const source = await this.prisma.printOrder.findUnique({
      where: { id: orderId },
    });
    if (!source) throw new NotFoundException('订单不存在');

    await this.adminService.requireAdmin(source.clan_id, userId);

    const newOrder = await this.prisma.printOrder.create({
      data: {
        clan_id: source.clan_id,
        user_id: source.user_id,
        specification: source.specification,
        quantity: source.quantity,
        amount: source.amount,
        shipping_address: source.shipping_address ?? undefined,
        status: 'PENDING' as any,
        tracking_no: null,
        tracking_company: null,
        refund_amount: 0,
        refund_reason: null,
        refund_status: 'NONE' as any,
      },
    });

    await this.adminService.logAction({
      clanId: source.clan_id,
      userId,
      action: 'REORDER_PRINT',
      targetType: 'PrintOrder',
      targetId: newOrder.id.toString(),
      details: `from_order_id=${orderIdStr}`,
    });

    return {
      message: '已生成新订单，请前往支付',
      new_order_id: newOrder.id.toString(),
      source_order_id: orderIdStr,
      amount: newOrder.amount,
      // 复制来源：规格/数量/收货地址，前端可据此预填新订单表单
      specification: newOrder.specification,
      quantity: newOrder.quantity,
      shipping_address: newOrder.shipping_address,
      // 跳转 URL：前端可拼接 /print?reorder=<id> 或直接跳订单详情
      redirect_url: `/admin/orders?focus=${newOrder.id.toString()}`,
    };
  }
}
