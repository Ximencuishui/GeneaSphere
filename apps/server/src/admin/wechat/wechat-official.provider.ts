import { Injectable } from '@nestjs/common';
import { CapabilityService } from '../../common/capability.service';

/**
 * 公众号真实推送接口。默认实现在微信能力未配置时拒绝，不连接开放平台。
 */
export abstract class WechatOfficialProvider {
  abstract verifyConnectivity(appId: string): Promise<void>;
  abstract publishToFollowers(input: { clanId: string; title: string }): Promise<void>;
}

@Injectable()
export class RejectingWechatOfficialProvider extends WechatOfficialProvider {
  constructor(private readonly capability: CapabilityService) {
    super();
  }

  async verifyConnectivity(_appId: string): Promise<void> {
    this.capability.assertAvailable('wechat');
  }

  async publishToFollowers(_input: { clanId: string; title: string }): Promise<void> {
    this.capability.assertAvailable('wechat');
  }
}
