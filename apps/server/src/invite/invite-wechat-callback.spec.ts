import { BadRequestException } from '@nestjs/common';

jest.mock('../cos/cos.service', () => ({ CosService: class CosService {} }));
jest.mock('../genealogy-edition/genealogy-edition.service', () => ({
  GenealogyEditionService: class GenealogyEditionService {},
}));
jest.mock('./invite.service', () => ({ InviteService: class InviteService {} }));

import { InviteController } from './invite.controller';
import { MockWechatService } from './mock-wechat.service';

describe('微信回调不接受客户端手机号', () => {
  const invite = { handleWxCallback: jest.fn() };
  const wechat = { exchangeCode: jest.fn() };
  const capability = { getStatus: jest.fn() };
  const controller = new InviteController(
    invite as never,
    wechat as never,
    {} as never,
    {} as never,
    capability as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WECHAT_MOCK_CALLBACK;
    capability.getStatus.mockReturnValue({ available: false, reason: '未配置' });
  });

  it('未配置真实微信时回调失败，不用请求体里的手机号改绑', async () => {
    await expect(
      controller.wxCallback({ code: 'abc', mock_phone: '13800001111' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(wechat.exchangeCode).not.toHaveBeenCalled();
    expect(invite.handleWxCallback).not.toHaveBeenCalled();
  });

  it('服务端打开 Mock 时也不把请求体手机号传给换码', async () => {
    process.env.WECHAT_MOCK_CALLBACK = 'true';
    wechat.exchangeCode.mockResolvedValue({ openid: 'oid', nickname: '微信用户' });
    invite.handleWxCallback.mockResolvedValue({ ok: true });

    await controller.wxCallback({ code: 'abc', mock_phone: '13800001111' } as never, '15');

    expect(wechat.exchangeCode).toHaveBeenCalledWith('abc');
    expect(invite.handleWxCallback).toHaveBeenCalledWith(15n, expect.not.objectContaining({ phone: '13800001111' }));
    delete process.env.WECHAT_MOCK_CALLBACK;
  });
});

describe('MockWechatService', () => {
  it('换码结果不带调用方手机号', async () => {
    const profile = await new MockWechatService().exchangeCode('abc');
    expect(profile.phone).toBeUndefined();
    expect(profile.openid).toBeTruthy();
  });
});
