import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
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

  it('packs a flattened or nested local original before the display file, and does not invent bytes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'media-zip-'));
    const previous = process.env.STORAGE_PATH;
    process.env.STORAGE_PATH = root;
    writeFileSync(join(root, 'media_original_1_a.jpg'), 'original');
    writeFileSync(join(root, 'display.jpg'), 'display');
    mkdirSync(join(root, 'media', 'original', '2'), { recursive: true });
    writeFileSync(join(root, 'media', 'original', '2', 'b.jpg'), 'nested');
    writeFileSync(join(root, 'a b.jpg'), 'spaced');

    const read = jest.fn(async (key: string) => {
      if (key === 'media/display/3/c.jpg') return Buffer.from('remote-display');
      if (key === 'media/original/4/empty.jpg') return Buffer.alloc(0);
      throw new Error('missing');
    });
    const result = await entriesForMedia(
      [
        { id: 9n, file_url: '/media/display.jpg', original_key: 'media/original/1/a.jpg' },
        { id: 2n, file_url: 'https://cdn.example.com/missing.jpg', original_key: 'media/original/2/b.jpg' },
        { id: 8n, file_url: '/media/a%20b.jpg' },
        { id: 3n, file_url: 'https://cdn.example.com/media/display/3/c.jpg', original_key: 'media/original/3/c.jpg' },
        { id: 4n, file_url: '/media/no-such.jpg', original_key: 'media/original/4/empty.jpg' },
      ],
      read,
    );

    expect(result.entries.map((entry) => entry.name)).toEqual([
      '9-media_original_1_a.jpg',
      '2-b.jpg',
      '8-a b.jpg',
      '3-c.jpg',
    ]);
    expect(result.entries[0]).toEqual(expect.objectContaining({ kind: 'file' }));
    expect(result.entries[3]).toEqual(expect.objectContaining({ kind: 'buffer' }));
    expect(result.skipped).toEqual([{ id: '4', reason: '远程文件无法读取' }]);
    expect(read).toHaveBeenCalledWith('media/original/3/c.jpg');
    process.env.STORAGE_PATH = previous;
    rmSync(root, { recursive: true, force: true });
  });
});