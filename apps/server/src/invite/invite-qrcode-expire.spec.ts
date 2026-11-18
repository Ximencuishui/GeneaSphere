import { BadRequestException } from '@nestjs/common';

jest.mock('../cos/cos.service', () => ({ CosService: class CosService {} }));
jest.mock('../genealogy-edition/genealogy-edition.service', () => ({
  GenealogyEditionService: class GenealogyEditionService {},
}));

import { InviteService } from './invite.service';

describe('邀请二维码有效期上限', () => {
  const prisma = { inviteQrcode: { create: jest.fn() } };
  const service = new InviteService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('超过 30 天被拒绝，且不创建二维码', async () => {
    await expect(service.createInviteQrcode(1n, 'admin-1', 31)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.inviteQrcode.create).not.toHaveBeenCalled();
  });
});
