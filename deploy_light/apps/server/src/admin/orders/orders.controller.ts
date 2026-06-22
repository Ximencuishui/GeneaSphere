import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
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
    @Query('clanId') clanIdStr: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('status') status?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

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
}
