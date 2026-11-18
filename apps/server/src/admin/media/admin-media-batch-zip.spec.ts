import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';

jest.mock('../../cos/cos.service', () => ({ CosService: class CosService {} }));
jest.mock('../../cos/image-processor.service', () => ({ ImageProcessorService: class ImageProcessorService {} }));
jest.mock('./media-zip', () => {
  const actual = jest.requireActual('./media-zip');
  return {
    ...actual,
    writeMediaZip: jest.fn().mockResolvedValue(undefined),
  };
});

import { AdminMediaController } from './admin-media.controller';
import * as mediaZip from './media-zip';

describe('AdminMediaController batch zip', () => {
  const admin = { resolveMediaActor: jest.fn(), logAction: jest.fn() };
  const prisma = {
    mediaArchive: { findMany: jest.fn() },
  };
  const notification = { notify: jest.fn().mockResolvedValue(undefined) };
  const cos = { readObject: jest.fn() };
  const controller = new AdminMediaController(
    admin as never,
    prisma as never,
    cos as never,
    notification as never,
  );
  const req = { user: { userId: 'admin-a' } };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.resolveMediaActor.mockResolvedValue({ clanId: 1n, role: 'ADMIN' });
    notification.notify.mockResolvedValue(undefined);
  });

  it('returns 404 and does not write a file when no media belongs to the clan', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([]);

    await expect(controller.batchZip(req, 'clan-a', { ids: [99] })).rejects.toBeInstanceOf(NotFoundException);

    expect(admin.resolveMediaActor).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(prisma.mediaArchive.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [99n] }, clan_id: 1n, deleted_at: null },
    }));
    expect(mediaZip.writeMediaZip).not.toHaveBeenCalled();
    expect(notification.notify).not.toHaveBeenCalled();
    expect(cos.readObject).not.toHaveBeenCalled();
  });

  it('packs only the media found in the current clan', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([
      { id: 9n, file_url: '/media/ok.jpg', display_url: null, original_key: null },
      { id: 10n, file_url: '/media/../../secret.txt', display_url: 'https://cdn.example.com/other.jpg', original_key: 'other/clan.jpg' },
    ]);
    cos.readObject.mockRejectedValue(new Error('missing'));
    const root = mkdtempSync(join(tmpdir(), 'media-zip-'));
    const previous = process.env.STORAGE_PATH;
    process.env.STORAGE_PATH = root;
    writeFileSync(join(root, 'ok.jpg'), 'img');

    let result: Awaited<ReturnType<typeof controller.batchZip>>;
    try {
      result = await controller.batchZip(req, 'clan-a', { ids: [9, 10] });
    } finally {
      process.env.STORAGE_PATH = previous;
      rmSync(root, { recursive: true, force: true });
    }

    expect(mediaZip.writeMediaZip).toHaveBeenCalledTimes(1);
    const entries = (mediaZip.writeMediaZip as jest.Mock).mock.calls[0][1];
    expect(entries).toHaveLength(1);
    expect(entries[0].name.startsWith('9-')).toBe(true);
    expect(String(entries[0].abs).replace(/\\/g, '/')).toMatch(/ok\.jpg$/);
    expect(entries.some((entry: { name: string }) => entry.name.startsWith('10-'))).toBe(false);
    expect(result.count).toBe(1);
    expect(result.url).toContain('/api/admin/media/clan-a/zips/media-1-');
    expect(result.skipped).toEqual([{ id: '10', reason: '远程文件无法读取' }]);
    expect(notification.notify).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin-a',
      clanId: 1n,
      type: NotificationType.SYSTEM,
      title: '影像打包完成',
    }));
  });
});
