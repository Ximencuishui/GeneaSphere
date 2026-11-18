import { AdminToolboxUsageController } from './admin-toolbox-usage.controller';

describe('AdminToolboxUsageController clan scope', () => {
  const admin = { requireAdminBySlug: jest.fn() };
  const prisma = {
    toolUsageLog: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
    familySharedCredit: { aggregate: jest.fn() },
  };
  const controller = new AdminToolboxUsageController(admin as never, prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdminBySlug.mockResolvedValue(7n);
  });

  it('filters usage by the current clan id instead of every clan the user belongs to', async () => {
    prisma.toolUsageLog.findMany.mockResolvedValue([]);
    prisma.toolUsageLog.count.mockResolvedValue(0);

    await controller.getUsageList({ user: { userId: 'admin' } }, 'clan-a', '1', '20', 'restore', 'user-b');

    const where = prisma.toolUsageLog.findMany.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({ clan_id: 7n, tool_type: 'restore', user_id: 'user-b' }));
    expect(where.user).toBeUndefined();
  });

  it('reads this month counts and unexpired family credits', async () => {
    prisma.toolUsageLog.aggregate.mockResolvedValue({ _count: 2, _sum: { credits_used: 3 } });
    prisma.toolUsageLog.groupBy
      .mockResolvedValueOnce([{ tool_type: 'color', _count: { _all: 2 }, _sum: { credits_used: 3 } }])
      .mockResolvedValueOnce([{ user_id: 'u1' }]);
    prisma.familySharedCredit.aggregate.mockResolvedValue({ _sum: { remaining_credits: null } });

    const stats = await controller.getStats({ user: { userId: 'admin' } }, 'clan-a');

    expect(prisma.toolUsageLog.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ clan_id: 7n }),
    }));
    expect(stats.by_tool).toEqual([{ tool: 'color', count: 2, credits: 3 }]);
    expect(stats.remaining_free_credits).toBe(0);
    expect(stats.this_month.usage_count).toBe(2);
  });
});
