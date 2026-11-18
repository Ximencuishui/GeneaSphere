import { LogsController } from './logs.controller';
import { StreamableFile } from '@nestjs/common';

describe('LogsController export', () => {
  const admin = { requireAdminBySlug: jest.fn() };
  const prisma = { auditLog: { findMany: jest.fn() } };
  const controller = new LogsController(admin as never, prisma as never);

  it('returns a csv attachment and escapes commas and formulas', async () => {
    admin.requireAdminBySlug.mockResolvedValue(2n);
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 1n,
        user: { phone: '13800000000' },
        action: 'UPDATE_PRIVACY_SETTINGS',
        target_type: 'PrivacySetting',
        target_id: '1',
        details: 'a,b',
        ip_address: '=1+1',
        created_at: new Date('2026-11-17T00:00:00.000Z'),
      },
    ]);

    const file = await controller.exportLogs({ user: { userId: 'admin' } }, 'clan-a');
    expect(file).toBeInstanceOf(StreamableFile);
    const chunks: Buffer[] = [];
    for await (const chunk of file.getStream()) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain("\"'=1+1\"");
    expect(file.options.disposition).toContain('.csv');
    expect(file.options.type).toContain('text/csv');
  });
});
