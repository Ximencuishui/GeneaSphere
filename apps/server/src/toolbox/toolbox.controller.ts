import { Controller, Get, Post, Body, Query, Request, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreditService } from './services/credit.service';
import { PackageService } from './services/package.service';
import { AIProcessorService } from './services/ai-processor.service';
import { ProcessImageDto } from './dto/process-image.dto';
import { PurchasePackageDto, PACKAGE_PRICES } from './dto/purchase-package.dto';
import { AllocateCreditsDto } from './dto/allocate-credits.dto';

@ApiTags('工具箱')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('toolbox')
export class ToolboxController {
  constructor(
    private readonly creditService: CreditService,
    private readonly packageService: PackageService,
    private readonly aiProcessor: AIProcessorService,
  ) {}

  @Get('credits')
  @ApiOperation({ summary: '获取用户额度信息' })
  async getCredits(@Request() req) {
    const credits = await this.creditService.getUserCredits(req.user.userId);
    return {
      free_remaining: credits.free_remaining,
      paid_balance: credits.paid_balance,
      shared_balance: credits.shared_balance,
      total: credits.total,
    };
  }

  @Get('packages')
  @ApiOperation({ summary: '获取可用的次数包列表' })
  async getPackages() {
    return this.packageService.getAvailablePackages();
  }

  @Post('purchase')
  @ApiOperation({ summary: '购买次数包' })
  async purchasePackage(
    @Request() req,
    @Body() dto: PurchasePackageDto,
  ) {
    // 校验支付金额是否与套餐价格一致
    const expectedPrice = PACKAGE_PRICES[dto.package_type];
    if (dto.amount !== expectedPrice) {
      throw new HttpException(
        `支付金额不正确，该套餐价格为 ¥${expectedPrice}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.packageService.purchasePackage(
      req.user.userId,
      dto.package_type,
      dto.amount,
    );
  }

  @Post('process')
  @ApiOperation({ summary: '提交图片处理任务' })
  async processImage(
    @Request() req,
    @Body() dto: ProcessImageDto,
  ) {
    const userId = req.user.userId;

    // 检查并扣减额度
    const deductResult = await this.creditService.checkAndDeductCredits(
      userId,
      dto.tool_type,
    );

    if (!deductResult.success) {
      throw new HttpException(
        { success: false, error: deductResult.error, needPurchase: true },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // 创建使用记录
    const { cost, estimatedCost } = this.creditService.getToolCost(dto.tool_type);
    const usageLog = await this.creditService.createUsageLog(
      userId,
      dto.tool_type,
      cost,
      estimatedCost,
      'processing',
      dto.image_url,
    );

    // 安全解析 person_ids
    let personIds: string[] | undefined;
    if (dto.person_ids) {
      try {
        personIds = JSON.parse(dto.person_ids);
      } catch {
        throw new HttpException('person_ids 格式错误，应为有效的 JSON 数组', HttpStatus.BAD_REQUEST);
      }
    }

    // 调用AI处理（模拟）
    const processResult = await this.aiProcessor.processImage(
      dto.tool_type,
      dto.image_url,
      {
        maskUrl: dto.mask_url,
        personIds,
      },
    );

    // 更新使用记录状态
    await this.creditService.updateUsageLogStatus(
      usageLog.id,
      processResult.success ? 'completed' : 'failed',
      processResult.outputUrl,
    );

    return {
      success: processResult.success,
      jobId: processResult.jobId,
      outputUrl: processResult.outputUrl,
      creditsUsed: cost,
      remainingCredits: deductResult.remainingCredits,
      message: processResult.message,
    };
  }

  @Get('history')
  @ApiOperation({ summary: '获取使用历史' })
  async getHistory(
    @Request() req,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.creditService.getUsageHistory(
      req.user.userId,
      Number(limit),
      Number(offset),
    );
  }

  @Get('purchase-history')
  @ApiOperation({ summary: '获取购买记录' })
  async getPurchaseHistory(@Request() req) {
    return this.packageService.getPurchaseHistory(req.user.userId);
  }

  // ========== 家族共享功能（需要管理员权限）==========
  private async checkAdminPermission(prisma: any, userId: string) {
    const member = await prisma.clanMember.findFirst({
      where: {
        user_id: userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });
    if (!member) {
      throw new HttpException('无管理员权限', HttpStatus.FORBIDDEN);
    }
    return member;
  }

  @Get('family/packages')
  @ApiOperation({ summary: '获取家族共享包列表（管理员）' })
  async getFamilyPackages(@Request() req) {
    const prisma = (this.creditService as any).prisma;
    await this.checkAdminPermission(prisma, req.user.userId);
    return this.packageService.getFamilyPackages(req.user.clanId);
  }

  @Post('family/allocate')
  @ApiOperation({ summary: '分配共享次数给成员（管理员）' })
  async allocateCredits(
    @Request() req,
    @Body() dto: AllocateCreditsDto,
  ) {
    const prisma = (this.creditService as any).prisma;
    await this.checkAdminPermission(prisma, req.user.userId);
    return this.packageService.allocateCredits(
      dto.shared_credit_id,
      dto.user_id,
      dto.credits,
    );
  }

  @Get('family/members')
  @ApiOperation({ summary: '获取成员分配情况（管理员）' })
  async getMemberAllocations(
    @Request() req,
    @Query('package_id') packageId: string,
  ) {
    const prisma = (this.creditService as any).prisma;
    await this.checkAdminPermission(prisma, req.user.userId);
    return this.packageService.getMemberAllocations(BigInt(packageId));
  }

  @Post('family/purchase-shared')
  @ApiOperation({ summary: '购买家族共享包（管理员）' })
  async purchaseFamilyPackage(
    @Request() req,
    @Body() body: { package_type: string; amount: number },
  ) {
    const prisma = (this.creditService as any).prisma;
    await this.checkAdminPermission(prisma, req.user.userId);

    // 校验支付金额
    const expectedPrice = PACKAGE_PRICES[body.package_type as keyof typeof PACKAGE_PRICES];
    if (!expectedPrice || body.amount !== expectedPrice) {
      throw new HttpException(
        `支付金额不正确，该套餐价格为 ¥${expectedPrice || '未知'}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.packageService.purchaseFamilyPackage(
      req.user.clanId,
      req.user.userId,
      body.package_type as any,
      body.amount,
    );
  }
}
