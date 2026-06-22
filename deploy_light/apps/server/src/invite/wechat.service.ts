import { Injectable } from '@nestjs/common';

/**
 * 微信公共服务接口
 *
 * 当前实现由 MockWechatService 提供（因缺公众号 AppId/AppSecret）。
 * 真实集成时仅需新增 WechatServiceImpl 并在 InviteModule 中切换 Provider。
 */
export interface WxUserProfile {
  openid: string;
  unionid?: string;
  nickname: string;
  avatar?: string;
  phone?: string;
}

export interface WxJsSdkConfig {
  appId: string;
  timestamp: number;
  nonceStr: string;
  signature: string;
}

export interface WxTemplateMessage {
  templateId: string;
  openid: string;
  url?: string;
  data: Record<string, { value: string; color?: string }>;
}

export abstract class WechatService {
  /** 生成 H5 页面需要的 JSSDK 鉴权配置 */
  abstract getJsSdkConfig(url: string): Promise<WxJsSdkConfig>;

  /** 用 code 换取用户基本信息（Mock 时可直接传 mock code） */
  abstract exchangeCode(code: string, hints?: { mock_phone?: string; mock_nickname?: string }): Promise<WxUserProfile>;

  /** 发送微信模板消息（Mock 时仅打印日志） */
  abstract sendTemplateMessage(message: WxTemplateMessage): Promise<{ success: boolean; messageId?: string }>;
}
