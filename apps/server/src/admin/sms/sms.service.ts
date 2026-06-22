import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { NotificationService } from '../../common/notification.service';

@Injectable()
export class SmsService {
  // 短信单价：0.05 元/条
  private readonly SMS_UNIT_PRICE = 0.05;

  // 充值档位配置
  private readonly RECHARGE_TIERS = [
    { amount: 50, bonus: 0 },
    { amount: 100, bonus: 10 },
    { amount: 200, bonus: 30 },
    { amount: 500, bonus: 100 },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  // ==================== 余额管理 ====================

  /**
   * 获取当前余额和统计信息
   */
  async getBalance(clanId: bigint, userId: string) {
    await this.requireAdmin(clanId, userId);

    // 使用 raw query 避免类型问题
    const balance = await (this.prisma as any).clanBalance?.findUnique?.({
      where: { clan_id: clanId },
    }) || await this.createBalanceIfNotExists(clanId);

    return {
      balance: Number(balance?.balance || 0),
      total_recharged: Number(balance?.total_recharged || 0),
      total_consumed: Number(balance?.total_consumed || 0),
      low_balance_threshold: Number(balance?.low_balance_threshold || 20),
      is_low_balance: Number(balance?.balance || 0) < Number(balance?.low_balance_threshold || 20),
    };
  }

  private async createBalanceIfNotExists(clanId: bigint) {
    try {
      return await (this.prisma as any).clanBalance?.create?.({
        data: { clan_id: clanId },
      });
    } catch {
      return await (this.prisma as any).clanBalance?.findUnique?.({
        where: { clan_id: clanId },
      });
    }
  }

  /**
   * 设置低水位预警阈值
   */
  async setLowBalanceThreshold(clanId: bigint, userId: string, threshold: number) {
    await this.requireAdmin(clanId, userId);

    try {
      const balance = await (this.prisma as any).clanBalance?.upsert?.({
        where: { clan_id: clanId },
        update: { low_balance_threshold: threshold },
        create: { clan_id: clanId, low_balance_threshold: threshold },
      });

      return { threshold: Number(balance?.low_balance_threshold || threshold) };
    } catch {
      // 如果 upsert 失败，尝试创建
      await this.createBalanceIfNotExists(clanId);
      const balance = await (this.prisma as any).clanBalance?.update?.({
        where: { clan_id: clanId },
        data: { low_balance_threshold: threshold },
      });
      return { threshold: Number(balance?.low_balance_threshold || threshold) };
    }
  }

  /**
   * 获取费用统计（月发送条数、消费金额）
   */
  async getCostStats(clanId: bigint, userId: string, startDate?: Date, endDate?: Date) {
    await this.requireAdmin(clanId, userId);

    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate || new Date();

    const records = await (this.prisma as any).smsSendRecord?.findMany?.({
      where: {
        clan_id: clanId,
        status: 'SENT',
        sent_at: { gte: start, lte: end },
      },
    }) || [];

    const totalSent = records.reduce((sum: number, r: any) => sum + (r.success_count || 0), 0);
    const totalCost = records.reduce((sum: number, r: any) => sum + Number(r.total_cost || 0), 0);

    return {
      month_sent_count: totalSent,
      month_consumed: totalCost,
      period: { start: start.toISOString(), end: end.toISOString() },
    };
  }

  // ==================== 充值管理 ====================

  /**
   * 创建充值订单
   */
  async createRechargeOrder(
    clanId: bigint,
    userId: string,
    amount: number,
    paymentMethod: 'wechat' | 'alipay',
  ) {
    await this.requireAdmin(clanId, userId);

    // 查找赠送金额
    const tier = this.RECHARGE_TIERS.find(t => t.amount === amount) || { bonus: 0 };

    // 生成订单号
    const tradeNo = `SMS${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // 创建充值记录（模拟成功）
    const record = await (this.prisma as any).rechargeRecord?.create?.({
      data: {
        clan_id: clanId,
        operator_id: userId,
        amount,
        bonus: tier.bonus,
        payment_method: paymentMethod,
        trade_no: tradeNo,
        status: 'SUCCESS',
      },
    });

    // 更新余额
    await this.addBalance(clanId, amount + tier.bonus);

    return {
      order_id: record?.id?.toString() || tradeNo,
      trade_no: tradeNo,
      amount,
      bonus: tier.bonus,
      total_amount: amount + tier.bonus,
      status: 'success',
      payment_url: `mock://pay/${paymentMethod}/${tradeNo}`,
    };
  }

  /**
   * 获取充值记录列表
   */
  async getRechargeRecords(
    clanId: bigint,
    userId: string,
    page: number = 1,
    pageSize: number = 20,
  ) {
    await this.requireAdmin(clanId, userId);

    const skip = (page - 1) * pageSize;

    const records = await (this.prisma as any).rechargeRecord?.findMany?.({
      where: { clan_id: clanId },
      orderBy: { created_at: 'desc' },
      skip,
      take: pageSize,
    }) || [];

    const total = await (this.prisma as any).rechargeRecord?.count?.({
      where: { clan_id: clanId },
    }) || 0;

    return {
      records: records.map((r: any) => ({
        id: r.id?.toString(),
        amount: Number(r.amount || 0),
        bonus: Number(r.bonus || 0),
        total_amount: Number(r.amount || 0) + Number(r.bonus || 0),
        payment_method: r.payment_method,
        trade_no: r.trade_no,
        status: r.status,
        created_at: r.created_at,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  // ==================== 短信发送 ====================

  /**
   * 发送短信
   */
  async sendSms(
    clanId: bigint,
    userId: string,
    content: string,
    recipientIds: string[],
    signName: string,
    sendType: 'IMMEDIATE' | 'SCHEDULED' = 'IMMEDIATE',
    scheduledAt?: Date,
  ) {
    await this.requireAdmin(clanId, userId);

    // 获取余额
    const balance = await this.getBalance(clanId, userId);
    const estimatedCost = recipientIds.length * this.SMS_UNIT_PRICE;

    // 校验余额
    if (balance.balance < estimatedCost) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_BALANCE',
        message: `余额不足，当前余额 ${balance.balance.toFixed(2)} 元，本次预估费用 ${estimatedCost.toFixed(2)} 元`,
        current_balance: balance.balance,
        estimated_cost: estimatedCost,
      });
    }

    // 创建发送记录
    const record = await (this.prisma as any).smsSendRecord?.create?.({
      data: {
        clan_id: clanId,
        operator_id: userId,
        content,
        sign_name: signName,
        recipient_ids: JSON.stringify(recipientIds),
        recipient_count: recipientIds.length,
        unit_price: this.SMS_UNIT_PRICE,
        total_cost: estimatedCost,
        status: sendType === 'SCHEDULED' ? 'PENDING' : 'PROCESSING',
        send_type: sendType === 'SCHEDULED' ? 'SCHEDULED' : 'IMMEDIATE',
        scheduled_at: scheduledAt,
      },
    });

    const recordId = record?.id;

    // 如果是立即发送，执行发送
    if (sendType === 'IMMEDIATE' && recordId) {
      await this.executeSend(recordId, clanId);
    }

    return {
      record_id: recordId?.toString(),
      status: sendType === 'SCHEDULED' ? 'scheduled' : 'sent',
      recipient_count: recipientIds.length,
      estimated_cost: estimatedCost,
      scheduled_at: scheduledAt?.toISOString(),
    };
  }

  /**
   * 执行发送（内部方法）
   */
  private async executeSend(recordId: bigint, clanId: bigint) {
    const record = await (this.prisma as any).smsSendRecord?.findUnique?.({
      where: { id: recordId },
    });

    if (!record) return;

    // 模拟发送：假设全部成功
    const successCount = record.recipient_count || 0;
    const failCount = 0;
    const totalCost = successCount * Number(record.unit_price || this.SMS_UNIT_PRICE);

    // 更新发送记录
    await (this.prisma as any).smsSendRecord?.update?.({
      where: { id: recordId },
      data: {
        status: 'SENT',
        success_count: successCount,
        fail_count: failCount,
        total_cost: totalCost,
        sent_at: new Date(),
      },
    });

    // 创建扣费记录
    await (this.prisma as any).smsCostLog?.create?.({
      data: {
        record_id: recordId,
        clan_id: clanId,
        success_count: successCount,
        unit_price: record.unit_price || this.SMS_UNIT_PRICE,
        total_cost: totalCost,
        cost_status: 'DEDUCTED',
        deducted_at: new Date(),
      },
    });

    // 扣除余额
    await this.deductBalance(clanId, totalCost);

    // 检查是否需要预警
    await this.checkLowBalanceWarning(clanId);
  }

  /**
   * 获取发送记录列表
   */
  async getSendRecords(
    clanId: bigint,
    userId: string,
    page: number = 1,
    pageSize: number = 20,
    status?: string,
  ) {
    await this.requireAdmin(clanId, userId);

    const where: any = { clan_id: clanId };
    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * pageSize;

    const records = await (this.prisma as any).smsSendRecord?.findMany?.({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: pageSize,
    }) || [];

    const total = await (this.prisma as any).smsSendRecord?.count?.({
      where,
    }) || 0;

    return {
      records: records.map((r: any) => ({
        id: r.id?.toString(),
        content_summary: (r.content || '').substring(0, 50) + (r.content?.length > 50 ? '...' : ''),
        recipient_count: r.recipient_count || 0,
        success_count: r.success_count || 0,
        fail_count: r.fail_count || 0,
        cost: Number(r.total_cost || 0),
        status: r.status,
        send_type: r.send_type,
        scheduled_at: r.scheduled_at?.toISOString?.(),
        sent_at: r.sent_at?.toISOString?.(),
        created_at: r.created_at,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  /**
   * 获取发送记录详情
   */
  async getSendRecordDetail(recordId: bigint, clanId: bigint, userId: string) {
    await this.requireAdmin(clanId, userId);

    const record = await (this.prisma as any).smsSendRecord?.findFirst?.({
      where: { id: recordId, clan_id: clanId },
      include: { cost_log: true },
    });

    if (!record) {
      throw new NotFoundException('发送记录不存在');
    }

    // 获取收件人信息（脱敏）
    let recipientIds: string[] = [];
    try {
      recipientIds = JSON.parse(record.recipient_ids || '[]');
    } catch {
      recipientIds = [];
    }

    return {
      id: record.id?.toString(),
      content: record.content,
      sign_name: record.sign_name,
      recipient_count: record.recipient_count || 0,
      recipient_ids_sample: recipientIds.slice(0, 5),
      recipient_ids_masked: recipientIds.map((id: string) => this.maskPhoneNumber(id)),
      success_count: record.success_count || 0,
      fail_count: record.fail_count || 0,
      unit_price: Number(record.unit_price || this.SMS_UNIT_PRICE),
      total_cost: Number(record.total_cost || 0),
      status: record.status,
      send_type: record.send_type,
      scheduled_at: record.scheduled_at?.toISOString?.(),
      sent_at: record.sent_at?.toISOString?.(),
      fail_reason: record.fail_reason,
      cost_status: record.cost_log?.cost_status,
      created_at: record.created_at,
    };
  }

  // ==================== 扣费记录 ====================

  /**
   * 获取扣费记录列表
   */
  async getCostLogs(
    clanId: bigint,
    userId: string,
    page: number = 1,
    pageSize: number = 20,
  ) {
    await this.requireAdmin(clanId, userId);

    const skip = (page - 1) * pageSize;

    const logs = await (this.prisma as any).smsCostLog?.findMany?.({
      where: { clan_id: clanId },
      orderBy: { created_at: 'desc' },
      skip,
      take: pageSize,
    }) || [];

    const total = await (this.prisma as any).smsCostLog?.count?.({
      where: { clan_id: clanId },
    }) || 0;

    return {
      logs: logs.map((log: any) => ({
        id: log.id?.toString(),
        record_id: log.record_id?.toString(),
        content_summary: (log.record?.content || '').substring(0, 30) + '...',
        success_count: log.success_count || 0,
        unit_price: Number(log.unit_price || this.SMS_UNIT_PRICE),
        total_cost: Number(log.total_cost || 0),
        cost_status: log.cost_status,
        deducted_at: log.deducted_at?.toISOString?.(),
        created_at: log.created_at,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }

  // ==================== 辅助方法 ====================

  /**
   * 增加余额
   */
  private async addBalance(clanId: bigint, amount: number) {
    try {
      await (this.prisma as any).clanBalance?.upsert?.({
        where: { clan_id: clanId },
        update: {
          balance: { increment: amount },
          total_recharged: { increment: amount },
        },
        create: {
          clan_id: clanId,
          balance: amount,
          total_recharged: amount,
        },
      });
    } catch {
      // 如果 upsert 失败，尝试直接更新
      const existing = await (this.prisma as any).clanBalance?.findUnique?.({
        where: { clan_id: clanId },
      });
      if (existing) {
        await (this.prisma as any).clanBalance?.update?.({
          where: { clan_id: clanId },
          data: {
            balance: Number(existing.balance || 0) + amount,
            total_recharged: Number(existing.total_recharged || 0) + amount,
          },
        });
      } else {
        await (this.prisma as any).clanBalance?.create?.({
          data: {
            clan_id: clanId,
            balance: amount,
            total_recharged: amount,
          },
        });
      }
    }
  }

  /**
   * 扣除余额
   */
  private async deductBalance(clanId: bigint, amount: number) {
    try {
      const existing = await (this.prisma as any).clanBalance?.findUnique?.({
        where: { clan_id: clanId },
      });
      if (existing) {
        await (this.prisma as any).clanBalance?.update?.({
          where: { clan_id: clanId },
          data: {
            balance: Math.max(0, Number(existing.balance || 0) - amount),
            total_consumed: Number(existing.total_consumed || 0) + amount,
          },
        });
      }
    } catch {
      // 忽略错误
    }
  }

  /**
   * 检查低余额预警
   */
  private async checkLowBalanceWarning(clanId: bigint) {
    const balance = await (this.prisma as any).clanBalance?.findUnique?.({
      where: { clan_id: clanId },
    });

    if (!balance) return;

    const currentBalance = Number(balance.balance || 0);
    const threshold = Number(balance.low_balance_threshold || 20);

    if (currentBalance <= threshold && currentBalance > 0) {
      const clan = await this.prisma.clan.findUnique({
        where: { id: clanId },
      });

      if (clan) {
        await this.notificationService.notify({
          userId: clan.admin_user_id,
          type: 'SYSTEM',
          title: '短信余额预警',
          content: `您的家族短信余额已低于 ${threshold.toFixed(2)} 元，当前余额 ${currentBalance.toFixed(2)} 元，请及时充值。`,
        });
      }
    } else if (currentBalance <= 0) {
      const clan = await this.prisma.clan.findUnique({
        where: { id: clanId },
      });

      if (clan) {
        await this.notificationService.notify({
          userId: clan.admin_user_id,
          type: 'SYSTEM',
          title: '短信余额不足',
          content: '您的家族短信余额已用完，无法发送短信，请立即充值。',
        });
      }
    }
  }

  /**
   * 权限校验
   */
  private async requireAdmin(clanId: bigint, userId: string) {
    const member = await this.prisma.clanMember.findUnique({
      where: {
        clan_id_user_id: {
          clan_id: clanId,
          user_id: userId,
        },
      },
    });

    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new BadRequestException('无权限执行此操作');
    }
  }

  /**
   * 手机号脱敏
   */
  private maskPhoneNumber(phone: string): string {
    if (phone.length === 11) {
      return phone.substring(0, 3) + '****' + phone.substring(7);
    }
    return phone.substring(0, 3) + '***' + phone.substring(phone.length - 4);
  }
}
