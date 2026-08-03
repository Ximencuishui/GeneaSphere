import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type CapabilityKey =
  | 'video_generation'
  | 'ai_tools'
  | 'sms'
  | 'sms_recharge'
  | 'wechat';

export interface CapabilityStatus {
  key: CapabilityKey;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  mode: 'real' | 'test' | 'disabled';
  reason?: string;
}

const CAPABILITY_CONFIG: Record<CapabilityKey, { enabled: string; provider: string }> = {
  video_generation: { enabled: 'VIDEO_GENERATION_ENABLED', provider: 'VIDEO_GENERATION_PROVIDER' },
  ai_tools: { enabled: 'AI_TOOLS_ENABLED', provider: 'AI_TOOLS_PROVIDER' },
  sms: { enabled: 'ADMIN_SMS_ENABLED', provider: 'ADMIN_SMS_PROVIDER' },
  sms_recharge: { enabled: 'SMS_RECHARGE_ENABLED', provider: 'SMS_PAYMENT_PROVIDER' },
  wechat: { enabled: 'WECHAT_ENABLED', provider: 'WECHAT_PROVIDER' },
};

@Injectable()
export class CapabilityService {
  private readonly logger = new Logger(CapabilityService.name);

  constructor(private readonly config: ConfigService) {}

  getStatus(key: CapabilityKey): CapabilityStatus {
    const mapping = CAPABILITY_CONFIG[key];
    const enabled = this.config.get<string>(mapping.enabled) === 'true';
    const provider = (this.config.get<string>(mapping.provider) || '').trim().toLowerCase();
    const isTest = provider === 'test' || provider === 'mock';
    // 本轮只建立安全门禁，尚未注册任何真实 Provider 适配器。仅设置环境变量
    // 不能让旧的模拟实现重新变成“可用”。接入适配器时需在这里显式登记。
    const configured = false;
    const available = enabled && configured;

    let reason: string | undefined;
    if (!enabled) reason = '该功能尚未启用';
    else if (isTest) reason = '仅配置了测试 Provider，真实业务不可用';
    else reason = provider ? '真实 Provider 适配器尚未安装' : '管理员尚未配置真实服务提供商';

    return {
      key,
      enabled,
      configured,
      available,
      mode: available ? 'real' : isTest ? 'test' : 'disabled',
      reason,
    };
  }

  listStatuses(): CapabilityStatus[] {
    return (Object.keys(CAPABILITY_CONFIG) as CapabilityKey[]).map((key) => this.getStatus(key));
  }

  assertAvailable(key: CapabilityKey): CapabilityStatus {
    const status = this.getStatus(key);
    if (!status.available) {
      this.logger.warn(`能力不可用: ${key} (${status.reason})`);
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'CAPABILITY_UNAVAILABLE',
          capability: key,
          message: status.reason,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return status;
  }
}
