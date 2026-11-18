jest.mock('../cos/cos.service', () => ({ CosService: class CosService {} }));
jest.mock('../genealogy-edition/genealogy-edition.service', () => ({
  GenealogyEditionService: class GenealogyEditionService {},
}));

import { InviteService } from './invite.service';

describe('invite relative verification switch', () => {
  const session = {
    id: 1n,
    status: 'PENDING',
    expire_at: new Date(Date.now() + 60_000),
    clan_id: 2n,
    scanned_user_id: 'user-1',
    matched_person_id: 9n,
  };
  const prisma = {
    verificationSession: { findUnique: jest.fn(), update: jest.fn() },
    clanMember: { findUnique: jest.fn() },
    quizAttempt: { create: jest.fn() },
    person: { findUnique: jest.fn() },
  };
  const notification = { notify: jest.fn() };
  const privacy = { load: jest.fn() };
  const service = new InviteService(
    prisma as never,
    {} as never,
    notification as never,
    {} as never,
    {} as never,
    {} as never,
    privacy as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.verificationSession.findUnique.mockResolvedValue(session);
    prisma.verificationSession.update.mockResolvedValue(session);
    prisma.clanMember.findUnique.mockResolvedValue({ user_id: 'user-1' });
    notification.notify.mockResolvedValue(undefined);
  });

  it('skips the quiz and completes the session when relative verification is off', async () => {
    privacy.load.mockResolvedValue({ enable_relative_verify: false, verify_questions: [], verify_max_attempts: 3 });

    const result = await service.generateQuiz(1n);

    expect(result).toMatchObject({ skipped: true, required: false, passed: true, questions: [] });
    expect(prisma.quizAttempt.create).not.toHaveBeenCalled();
    expect(prisma.verificationSession.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PASSED', verify_method: 'INFO_CONFIRM' }),
    }));
  });

  it('does not replace configured question types when the genealogy has no matching data', async () => {
    privacy.load.mockResolvedValue({
      enable_relative_verify: true,
      verify_questions: ['父亲姓名'],
      verify_max_attempts: 3,
    });
    prisma.person.findUnique.mockResolvedValue({
      id: 9n,
      full_name: '张三',
      birth_date: null,
      birth_place: null,
      children_in: [],
    });

    await expect(service.generateQuiz(1n)).rejects.toThrow('已选的亲属验证题在族谱里没有对应数据，无法出题');
    expect(prisma.quizAttempt.create).not.toHaveBeenCalled();
    expect(prisma.verificationSession.update).not.toHaveBeenCalled();
  });

  it('uses the configured attempt limit when verification is on', async () => {
    privacy.load.mockResolvedValue({
      enable_relative_verify: true,
      verify_questions: [],
      verify_max_attempts: 1,
    });

    const result = await service.submitQuiz(1n, [], 1);

    expect(result).toMatchObject({ passed: false, fail_reason: 'retry_exhausted' });
  });
});
