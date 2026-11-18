import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    mediaArchive: { create: jest.fn() },
  })),
  ReviewStatus: { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' },
}));
jest.mock('sharp', () => {
  const sharp = jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
  }));
  return { __esModule: true, default: sharp };
});
jest.mock('../cos/cos.service', () => ({ CosService: class CosService {} }));
jest.mock('../cos/image-processor.service', () => ({ ImageProcessorService: class ImageProcessorService {} }));
jest.mock('./avatar.service', () => ({ AvatarService: class AvatarService {} }));

import { PrismaClient } from '@prisma/client';
import { MediaService } from './media.service';

const mediaCreate = () =>
  (PrismaClient as unknown as jest.Mock).mock.results[0].value.mediaArchive.create as jest.Mock;

describe('MediaService uploadFile', () => {
  const storage = mkdtempSync(join(tmpdir(), 'geneasphere-media-'));
  let service: MediaService;

  beforeAll(() => {
    process.env.STORAGE_PATH = storage;
    delete process.env.COS_ENABLED;
    service = new MediaService(
      { getDriverType: () => 'local' } as never,
      { processImage: jest.fn() } as never,
      {} as never,
    );
  });

  afterAll(() => {
    rmSync(storage, { recursive: true, force: true });
  });

  beforeEach(() => {
    mediaCreate().mockReset();
    mediaCreate().mockResolvedValue({ id: 1n, file_url: '/media/clip.mp4' });
  });

  it('writes media_type video when saving a video', async () => {
    const file = {
      buffer: Buffer.from('vid'),
      size: 3,
      mimetype: 'video/mp4',
      originalname: 'clip.mp4',
    } as Express.Multer.File;

    await service.uploadFile(file, 4n, 'user-1');

    expect(mediaCreate()).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clan_id: 4n,
        uploader_id: 'user-1',
        media_type: 'video',
      }),
    });
  });

  it('writes media_type image when saving an image locally', async () => {
    const file = {
      buffer: Buffer.from('img'),
      size: 3,
      mimetype: 'image/jpeg',
      originalname: 'a.jpg',
    } as Express.Multer.File;

    await service.uploadFile(file, 4n, 'user-1');

    expect(mediaCreate()).toHaveBeenCalledWith({
      data: expect.objectContaining({ media_type: 'image' }),
    });
  });

  it('stores original_filename and pixel size when sharp reads an image', async () => {
    const file = {
      buffer: Buffer.from('img'),
      size: 3,
      mimetype: 'image/jpeg',
      originalname: 'C:\\fakepath\\老宅.jpg',
    } as Express.Multer.File;

    await service.uploadFile(file, 4n, 'user-1');

    expect(mediaCreate()).toHaveBeenCalledWith({
      data: expect.objectContaining({
        original_filename: '老宅.jpg',
        width: 800,
        height: 600,
        media_type: 'image',
      }),
    });
  });

  it('does not require resolution when saving a video', async () => {
    const file = {
      buffer: Buffer.from('vid'),
      size: 3,
      mimetype: 'video/mp4',
      originalname: 'clips/clip.mp4',
    } as Express.Multer.File;

    await service.uploadFile(file, 4n, 'user-1');

    const data = mediaCreate().mock.calls[0][0].data;
    expect(data.original_filename).toBe('clip.mp4');
    expect(data.media_type).toBe('video');
    expect(data.width).toBeUndefined();
    expect(data.height).toBeUndefined();
  });

  it('sets taken_year from taken_on', async () => {
    const file = {
      buffer: Buffer.from('img'),
      size: 3,
      mimetype: 'image/jpeg',
      originalname: 'a.jpg',
    } as Express.Multer.File;

    await service.uploadFile(file, 4n, 'user-1', 1970, undefined, undefined, undefined, undefined, {
      taken_on: new Date(Date.UTC(1981, 0, 2)),
    });

    expect(mediaCreate()).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taken_year: 1981,
        taken_on: new Date(Date.UTC(1981, 0, 2)),
        original_filename: 'a.jpg',
      }),
    });
  });
});
