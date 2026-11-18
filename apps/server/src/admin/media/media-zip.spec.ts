import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { entriesForMedia, resolveLocalMediaPath, writeMediaZip } from './media-zip';

jest.mock('archiver', () => {
  const archive = {
    pipe: jest.fn(),
    file: jest.fn(),
    append: jest.fn(),
    on: jest.fn().mockReturnThis(),
    finalize: jest.fn(),
  };
  return {
    ZipArchive: class {
      pipe(dest: unknown) { return archive.pipe(dest); }
      file(filepath: string, data: { name: string }) { return archive.file(filepath, data); }
      append(source: Buffer, data: { name: string }) { return archive.append(source, data); }
      on(event: string, cb: (err: Error) => void) { return archive.on(event, cb); }
      finalize() { return archive.finalize(); }
    },
    __archive: archive,
  };
});

describe('media zip packing', () => {
  const archive = (jest.requireMock('archiver') as { __archive: {
    pipe: jest.Mock;
    file: jest.Mock;
    append: jest.Mock;
    on: jest.Mock;
    finalize: jest.Mock;
  } }).__archive;

  beforeEach(() => {
    jest.clearAllMocks();
    archive.on.mockReturnThis();
  });

  it('rejects paths that leave the media storage root', () => {
    expect(resolveLocalMediaPath('/media/../../secret.txt')).toBeNull();
    expect(resolveLocalMediaPath('/media/..\\secret.txt')).toBeNull();
    expect(resolveLocalMediaPath('https://example.com/a.jpg')).toBeNull();
  });

  it('writes only the files that were collected', async () => {
    archive.finalize.mockResolvedValue(undefined);
    const dest = join(tmpdir(), `pack-${Date.now()}.zip`);

    await writeMediaZip(dest, [
      { kind: 'file', abs: join(tmpdir(), 'ok.jpg'), name: '9-ok.jpg' },
    ]);

    expect(archive.file).toHaveBeenCalledTimes(1);
    expect(archive.file).toHaveBeenCalledWith(join(tmpdir(), 'ok.jpg'), { name: '9-ok.jpg' });
    expect(archive.append).not.toHaveBeenCalled();
    rmSync(dest, { force: true });
  });

  it('collects an existing local file and skips a remote object the storage service cannot read', async () => {
    const root = mkdtempSync(join(tmpdir(), 'media-zip-'));
    const previous = process.env.STORAGE_PATH;
    process.env.STORAGE_PATH = root;
    writeFileSync(join(root, 'ok.jpg'), 'img');

    const result = await entriesForMedia(
      [
        { id: 9n, file_url: '/media/ok.jpg' },
        { id: 10n, file_url: 'https://cdn.example.com/missing.jpg', original_key: 'clan/missing.jpg' },
      ],
      jest.fn().mockRejectedValue(new Error('no')),
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual(expect.objectContaining({ kind: 'file', name: '9-ok.jpg' }));
    expect(result.skipped).toEqual([{ id: '10', reason: '远程文件无法读取' }]);
    process.env.STORAGE_PATH = previous;
    rmSync(root, { recursive: true, force: true });
  });
});