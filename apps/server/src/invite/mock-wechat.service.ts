import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  WechatService,
  WxJsSdkConfig,
  WxUserProfile,
  WxTemplateMessage,
} from './wechat.service';

/**
 * 微信 Mock 实现
 *
 * 在没有真实公众号 AppId/AppSecret 的情况下，提供与生产同形状的接口。
 *  - exchangeCode：返回基于 code 哈希的稳定 openid + 随机 nickname/avatar
 *  - sendTemplateMessage：仅写入日志，不调用真实 API
 *
 * 当环境变量 WECHAT_ENABLED=true 时应替换为真实实现。
 */
@Injectable()
export class MockWechatService extends WechatService {
  private readonly logger = new Logger('MockWechatService');

  async getJsSdkConfig(url: string): Promise<WxJsSdkConfig> {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonceStr = randomBytes(8).toString('hex');
    // 真实实现应使用 sha1(jsapi_ticket, noncestr, timestamp, url) 签名
    const signature = randomBytes(16).toString('hex');
    return {
      appId: process.env.WECHAT_APP_ID || 'MOCK_APP_ID',
      timestamp,
      nonceStr,
      signature,
    };
  }

  async exchangeCode(
    code: string,
    hints?: { mock_phone?: string; mock_nickname?: string },
  ): Promise<WxUserProfile> {
    // 基于 code 哈希生成稳定 openid，便于回放
    const openid = this.hashCodeToOpenid(code);
    const nickname = hints?.mock_nickname || `微信用户${openid.slice(-4)}`;
    return {
      openid,
      unionid: undefined,
      nickname,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${openid}`,
      phone: hints?.mock_phone,
    };
  }

  async sendTemplateMessage(message: WxTemplateMessage): Promise<{ success: boolean; messageId?: string }> {
    this.logger.log(
      `[Mock] 微信模板消息 -> openid=${message.openid} template=${message.templateId} data=${JSON.stringify(message.data)}`,
    );
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  private hashCodeToOpenid(code: string): string {
    // 简单稳定哈希
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash = (hash * 31 + code.charCodeAt(i)) | 0;
    }
    const base = Math.abs(hash).toString(16).padStart(8, '0');
    return `mock_openid_${base}${randomBytes(4).toString('hex')}`;
  }
}
