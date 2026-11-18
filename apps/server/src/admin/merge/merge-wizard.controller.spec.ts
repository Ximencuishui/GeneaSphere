import { MergeWizardController } from './merge-wizard.controller';

describe('MergeWizardController 返回值', () => {
  const mergeService = { getWizardData: jest.fn() };
  const adminService = { requireAdmin: jest.fn(), requireAdminBySlug: jest.fn() };
  const prisma = { mergeApplication: { findUnique: jest.fn() } };
  const controller = new MergeWizardController(
    mergeService as never,
    adminService as never,
    prisma as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    adminService.requireAdmin.mockResolvedValue(undefined);
  });

  it('向导数据可被 JSON.stringify，且不含手机号和 contact_info', async () => {
    prisma.mergeApplication.findUnique.mockResolvedValue({ id: 1n, clan_id: 10n });
    mergeService.getWizardData.mockResolvedValue({
      application: {
        id: 1n,
        status: 'APPROVED',
        origin_place: '某地',
        xipai_info: ['德'],
        applicant: { id: 'user-1', phone: '13800001111' },
        matched_person: {
          id: 2n,
          full_name: '张三',
          contact_info: 'cipher-contact',
        },
      },
      applicantClan: { id: 10n, name: '甲氏', id_card_url: 'https://secret/id-card' },
      mainClan: {
        id: 10n,
        name: '甲氏',
        persons: [{ id: 3n, full_name: '挂载点' }],
      },
      comparison: { totalScore: 40 },
    });

    const result = await controller.getWizardData({ user: { userId: 'admin-1' } }, '1');
    const json = JSON.stringify(result);

    expect(json).not.toContain('13800001111');
    expect(json).not.toContain('cipher-contact');
    expect(json).not.toContain('contact_info');
    expect(json).not.toContain('id_card_url');
    expect(json).not.toContain('https://secret/id-card');
    expect(result.data.application.status).toBe('APPROVED');
    expect(result.data.application.origin_place).toBe('某地');
    expect(result.data.application.matched_person.full_name).toBe('张三');
    expect(result.data.application.matched_person.id).toBe('2');
    expect(result.data.mainClan.id).toBe('10');
    expect(result.data.mainClan.persons[0].id).toBe('3');
    expect(result.data.application.applicant.phone).toBeUndefined();
  });
});
