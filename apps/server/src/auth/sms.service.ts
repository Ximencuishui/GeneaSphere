import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@geneasphere/db';

/**
 * 腾讯云短信验证码服务
 * 使用 tencentcloud-sdk-nodejs 内置的 SMS 模块
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly enabled: boolean;
  private readonly sdkAppId: string;
  private readonly signName: string;
  private readonly templateId: string;
  private readonly secretId: string;
  private readonly secretKey: string;
  private readonly region: string;

  /** 验证码有效期（分钟） */
  private readonly CODE_EXPIRE_MINUTES = 5;
  /** 同一手机号发送间隔（秒） */
  private readonly RESEND_INTERVAL_SECONDS = 60;
  /** 同一IP每小时最大发送次数 */
  private readonly IP_HOURLY_LIMIT = 10;
  /** 同一手机号每小时最大发送次数 */
  private readonly PHONE_HOURLY_LIMIT = 5;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.sdkAppId = this.configService.get('TENCENT_SMS_SDK_APP_ID') || '';
    this.signName = this.configService.get('TENCENT_SMS_SIGN_NAME') || '';
    this.templateId = this.configService.get('TENCENT_SMS_TEMPLATE_ID') || '';
    this.secretId = this.configService.get('TENCENT_SMS_SECRET_ID') || '';
    this.secretKey = this.configService.get('TENCENT_SMS_SECRET_KEY') || '';
    this.region = this.configService.get('TENCENT_SMS_REGION') || 'ap-guangzhou';

    this.enabled = !!(this.sdkAppId && this.signName && this.templateId && this.secretId && this.secretKey);

    if (this.enabled) {
      this.logger.log('腾讯云短信服务已启用');
    } else {
      this.logger.warn('腾讯云短信服务未配置（缺少 TENCENT_SMS_* 环境变量），将使用开发模式输出验证码到日志');
    }
  }

  /**
   * 发送短信验证码
   */
  async sendVerifyCode(phone: string, purpose: 'REGISTER' | 'LOGIN' | 'RESET_PASSWORD' | 'BIND_PHONE', ip?: string) {
    // 频率限制检查
    await this.checkRateLimit(phone, ip);

    // 生成 6 位数字验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 过期时间
    const expiresAt = new Date(Date.now() + this.CODE_EXPIRE_MINUTES * 60 * 1000);

    // 保存到数据库
    await this.prisma.smsVerifyCode.create({
      data: {
        phone,
        code,
        purpose: purpose as any,
        ip_address: ip || null,
        expires_at: expiresAt,
      },
    });

    // 发送短信
    if (this.enabled) {
      try {
        await this.sendViaTencentCloud(phone, code);
        this.logger.log(`验证码已发送到 ${phone}`);
      } catch (error: any) {
        this.logger.error(`腾讯云短信发送失败: ${error.message}`);
        // 发送失败时删除验证码记录
        await this.prisma.smsVerifyCode.deleteMany({
          where: { phone, code, is_used: false },
        });
        throw new BadRequestException('短信发送失败，请稍后再试');
      }
    } else {
      // 开发模式：输出到日志
      this.logger.log(`========================================`);
      this.logger.log(`📱 验证码 (${purpose}): ${code}`);
      this.logger.log(`📱 手机号: ${phone}`);
      this.logger.log(`📱 ${this.CODE_EXPIRE_MINUTES} 分钟内有效`);
      this.logger.log(`========================================`);
    }

    return {
      message: '验证码已发送',
      // 开发模式下返回验证码（仅用于测试，生产环境不会返回）
      ...(this.enabled ? {} : { code, expiresIn: this.CODE_EXPIRE_MINUTES * 60 }),
    };
  }

  /**
   * 校验验证码
   */
  async verifyCode(phone: string, code: string, purpose: 'REGISTER' | 'LOGIN' | 'RESET_PASSWORD' | 'BIND_PHONE'): Promise<boolean> {
    // 查找最新的有效验证码
    const record = await this.prisma.smsVerifyCode.findFirst({
      where: {
        phone,
        code,
        purpose: purpose as any,
        is_used: false,
        expires_at: { gte: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!record) {
      return false;
    }

    // 标记为已使用
    await this.prisma.smsVerifyCode.update({
      where: { id: record.id },
      data: { is_used: true, used_at: new Date() },
    });

    return true;
  }

  /**
   * 通过腾讯云 API 发送短信
   */
  private async sendViaTencentCloud(phone: string, code: string) {
    const tencentcloud = require('tencentcloud-sdk-nodejs');
    const SmsClient = tencentcloud.sms.v20210111.Client;

    const client = new SmsClient({
      credential: {
        secretId: this.secretId,
        secretKey: this.secretKey,
      },
      region: this.region,
      profile: {
        httpProfile: {
          endpoint: 'sms.tencentcloudapi.com',
        },
      },
    });

    const params = {
      SmsSdkAppId: this.sdkAppId,
      SignName: this.signName,
      TemplateId: this.templateId,
      TemplateParamSet: [code, String(this.CODE_EXPIRE_MINUTES)],
      PhoneNumberSet: [`+86${phone}`],
    };

    const response = await client.SendSms(params);

    if (response.SendStatusSet?.[0]?.Code !== 'Ok') {
      const statusMsg = response.SendStatusSet?.[0]?.Message || 'Unknown error';
      throw new Error(`短信发送失败: ${statusMsg}`);
    }

    return response;
  }

  /**
   * 频率限制检查
   */
  private async checkRateLimit(phone: string, ip?: string) {
    const now = new Date();

    // 检查同一手机号发送间隔
    const lastRecord = await this.prisma.smsVerifyCode.findFirst({
      where: {
        phone,
        created_at: {
          gte: new Date(now.getTime() - this.RESEND_INTERVAL_SECONDS * 1000),
        },
      },
      orderBy: { created_at: 'desc' },
    });

    if (lastRecord) {
      const secondsAgo = Math.floor((now.getTime() - lastRecord.created_at.getTime()) / 1000);
      const remainingSeconds = this.RESEND_INTERVAL_SECONDS - secondsAgo;
      throw new BadRequestException(`请等待 ${remainingSeconds} 秒后再试`);
    }

    // 检查同一手机号每小时发送次数
    const hourAgo = new Date(now.getTime() - 3600 * 1000);
    const phoneCount = await this.prisma.smsVerifyCode.count({
      where: {
        phone,
        created_at: { gte: hourAgo },
      },
    });

    if (phoneCount >= this.PHONE_HOURLY_LIMIT) {
      throw new BadRequestException('该手机号发送次数已达上限，请稍后再试');
    }

    // 检查同一 IP 每小时发送次数
    if (ip) {
      const ipCount = await this.prisma.smsVerifyCode.count({
        where: {
          ip_address: ip,
          created_at: { gte: hourAgo },
        },
      });

      if (ipCount >= this.IP_HOURLY_LIMIT) {
        throw new BadRequestException('发送次数已达上限，请稍后再试');
      }
    }
  }
}
