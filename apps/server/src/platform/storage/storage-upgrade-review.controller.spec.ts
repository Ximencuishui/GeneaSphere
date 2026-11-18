import { PlatformStorageUpgradeController } from './storage-upgrade-review.controller';

describe('PlatformStorageUpgradeController review', () => {
  const tx = {
    storageUpgradeRequest: { update: jest.fn() },
    clan: { findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    platformOperationLog: { create: jest.fn() },
  };
  const prisma = {
    storageUpgradeRequest: { findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const controller = new PlatformStorageUpgradeController(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('approves without writing the platform admin id into reviewer_id', async () => {
    prisma.storageUpgradeRequest.findUnique.mockResolvedValue({
      id: 3n,
      clan_id: 9n,
      status: 'PENDING',
      applicant_id: 'user-1',
      plan_code: 'BASIC_20G',
      quota_bytes: 100n,
      current_quota_bytes: 50n,
    });
    tx.clan.findUnique.mockResolvedValue({ settings_json: { name: '甲' } });
    tx.storageUpgradeRequest.update.mockResolvedValue({ id: 3n, status: 'APPROVED' });

    await controller.adminReview(
      { user: { adminId: 44 }, headers: { 'x-forwarded-for': '203.0.113.8' }, ip: '127.0.0.1' },
      '3',
      { action: 'APPROVE', note: '同意' },
    );

    expect(tx.storageUpgradeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'APPROVED',
        reviewer_id: null,
        reviewer_note: 'platform_admin:44 同意',
        applied_quota_bytes: 100n,
      }),
    }));
    expect(tx.clan.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { settings_json: expect.objectContaining({ storage_quota_bytes: 100, name: '甲' }) },
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clan_id: 9n, user_id: 'user-1', ip_address: '203.0.113.8' }),
    }));
    expect(tx.platformOperationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ admin_id: 44n }),
    }));
  });
});
