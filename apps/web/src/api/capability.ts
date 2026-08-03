import request from '@/utils/request';

export interface CapabilityStatus {
  key:
    | 'video_generation'
    | 'ai_tools'
    | 'sms'
    | 'sms_recharge'
    | 'wechat';
  enabled: boolean;
  configured: boolean;
  available: boolean;
  mode: 'real' | 'test' | 'disabled';
  reason?: string;
}

export const capabilityApi = {
  list: () =>
    request.get<{ data: CapabilityStatus[] }, { data: CapabilityStatus[] }>(
      '/api/capabilities',
    ),
};

export default capabilityApi;
