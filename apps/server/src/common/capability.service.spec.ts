import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CapabilityService } from './capability.service';

/**
 * CapabilityService 在视频/AI/短信/充值等外部依赖的功能中提供"能力门禁"：
 * - 当管理员未启用或未配置真实 Provider 时，assertAvailable 必须抛 503；
 * - Provider=test/mock 仅允许开发模式返回 mode: test，绝不能被当成 available=true；
 * - 本轮未注册任何真实 Provider，因此无论 enabled 与 provider 设置如何，configured 都应为 false。
 */

function buildConfig(values: Record<string, string | undefined>): ConfigService {
  const store = new Map<string, string>();
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) store.set(k, v);
  }
  return {
    get: jest.fn((key: string) => store.get(key)),
  } as unknown as ConfigService;
}

describe('CapabilityService', () => {
  describe('listStatuses', () => {
    it('列出全部 5 项能力并附带 reason', () => {
      const svc = new CapabilityService(buildConfig({}));
      const list = svc.listStatuses();
      expect(list.map((s) => s.key)).toEqual([
        'video_generation',
        'ai_tools',
        'sms',
        'sms_recharge',
        'wechat',
      ]);
      for (const s of list) {
        expect(s.enabled).toBe(false);
        expect(s.configured).toBe(false);
        expect(s.available).toBe(false);
        expect(s.reason).toBeDefined();
      }
    });

    it('enabled=true 但未配置 provider → available=false, reason="管理员尚未配置真实服务提供商"', () => {
      const svc = new CapabilityService(
        buildConfig({ VIDEO_GENERATION_ENABLED: 'true' }),
      );
      const status = svc.getStatus('video_generation');
      expect(status.enabled).toBe(true);
      expect(status.configured).toBe(false);
      expect(status.available).toBe(false);
      expect(status.reason).toMatch(/管理员尚未配置/);
    });

    it('provider=test/mock → mode=test 且 available 永远为 false（拒绝把测试 Provider 当成可用）', () => {
      const svc = new CapabilityService(
        buildConfig({
          AI_TOOLS_ENABLED: 'true',
          AI_TOOLS_PROVIDER: 'mock',
        }),
      );
      const status = svc.getStatus('ai_tools');
      expect(status.enabled).toBe(true);
      expect(status.configured).toBe(false); // 即便 provider=test 也算未配置
      expect(status.available).toBe(false);
      expect(status.mode).toBe('test');
      expect(status.reason).toMatch(/仅配置了测试 Provider/);
    });

    it('provider=其他非 test/mock 值 → 提示"真实 Provider 适配器尚未安装"', () => {
      const svc = new CapabilityService(
        buildConfig({
          ADMIN_SMS_ENABLED: 'true',
          ADMIN_SMS_PROVIDER: 'tencent',
        }),
      );
      const status = svc.getStatus('sms');
      expect(status.reason).toMatch(/真实 Provider 适配器尚未安装/);
    });
  });

  describe('assertAvailable', () => {
    it('未启用 → 抛 503 + CAPABILITY_UNAVAILABLE', () => {
      const svc = new CapabilityService(buildConfig({}));
      try {
        svc.assertAvailable('video_generation');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const res = (err as HttpException).getResponse() as any;
        expect(res.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        expect(res.code).toBe('CAPABILITY_UNAVAILABLE');
        expect(res.capability).toBe('video_generation');
      }
    });

    it('provider=test/mock 也不能调用 → 同样抛 503', () => {
      const svc = new CapabilityService(
        buildConfig({
          AI_TOOLS_ENABLED: 'true',
          AI_TOOLS_PROVIDER: 'test',
        }),
      );
      expect(() => svc.assertAvailable('ai_tools')).toThrow(HttpException);
    });
  });
});