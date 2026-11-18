import { BadRequestException } from '@nestjs/common';
import { assertExportRequest, mediaManifestCsv, membersCsv, missingOriginalExportError, readExportObject, zipTextEntries } from './clan-export-format';

describe('clan export request', () => {
  const bundle = {
    persons: [{ id: '1', full_name: '=张三', gender: 'male', birth_date: null, death_date: null, is_living: true, birth_place: '', death_place: '', biography: 'a,b' }],
    families: [],
    children: [],
    ancestry: [],
    media: [{ id: '9', media_type: 'image', file_size: 1, file_url: '/media/a.jpg', download_url: '/media/a.jpg', packed: false }],
    migrations: [{ id: '1', person_id: '1', from_location: '甲', to_location: '乙', event_year: 1900, reason: '', description: '' }],
    logs: [{ id: '1', user_id: 'u', user_phone: '1', action: 'EXPORT_CLAN_DATA', target_type: '', target_id: '', details: '', ip_address: '', created_at: new Date('2026-01-01T00:00:00.000Z') }],
  };

  it('rejects excel and unknown types', () => {
    expect(() => assertExportRequest('all', 'excel')).toThrow(BadRequestException);
    expect(() => assertExportRequest('photos', 'csv')).toThrow(BadRequestException);
    expect(assertExportRequest('logs', 'csv')).toEqual({ type: 'logs', format: 'csv' });
  });

  it('escapes csv and lists the zip contract', () => {
    const csv = membersCsv(bundle.persons);
    expect(csv).toContain("\"'=张三\"");
    expect(csv).toContain('"a,b"');
    expect(zipTextEntries('json', bundle).map((entry) => entry.name)).toEqual([
      'genealogy.json',
      'migration.csv',
      'audit_logs.csv',
      'media_manifest.csv',
    ]);
    expect(zipTextEntries('csv', bundle).map((entry) => entry.name)).toContain('genealogy.csv');
    expect(zipTextEntries('csv', bundle).map((entry) => entry.name)).toContain('relationships.csv');
  });

  it('writes packed and the reason, and fails a full export only when every original is missing', () => {
    const manifest = mediaManifestCsv([
      { id: '9', media_type: 'image', file_size: 1, file_url: '/media/a.jpg', download_url: '/media/a.jpg', packed: false, pack_reason: '本地文件不存在' },
      { id: '10', media_type: 'image', file_size: 2, file_url: 'https://cdn.example.com/b.jpg', packed: true, pack_reason: '' },
    ]);
    expect(manifest.split('\n')[0]).toContain('packed');
    expect(manifest.split('\n')[0]).toContain('pack_reason');
    expect(manifest).toContain('本地文件不存在');
    expect(manifest).toContain('yes');

    expect(missingOriginalExportError(2, 0, [{ id: '9', reason: '本地文件不存在' }, { id: '10', reason: '远程文件无法读取' }]))
      .toBe('影像原文件都读不到：9（本地文件不存在）、10（远程文件无法读取）');
    expect(missingOriginalExportError(0, 0, [])).toBeNull();
    expect(missingOriginalExportError(2, 1, [{ id: '10', reason: '远程文件无法读取' }])).toBeNull();
  });
});

describe('export object reads', () => {
  it('reads the cold bucket first and falls back to hot', async () => {
    const read = jest.fn(async (_key: string, bucket: 'hot' | 'cold') => {
      if (bucket === 'cold') throw new Error('missing');
      return Buffer.from('hot');
    });

    await expect(readExportObject(read, 'media/original/1/a.jpg')).resolves.toEqual(Buffer.from('hot'));
    expect(read).toHaveBeenNthCalledWith(1, 'media/original/1/a.jpg', 'cold');
    expect(read).toHaveBeenNthCalledWith(2, 'media/original/1/a.jpg', 'hot');
  });

  it('stops after the cold bucket when the original is there', async () => {
    const read = jest.fn(async (_key: string, bucket: 'hot' | 'cold') => {
      if (bucket === 'cold') return Buffer.from('cold');
      return Buffer.from('hot');
    });
    await expect(readExportObject(read, 'media/original/1/a.jpg')).resolves.toEqual(Buffer.from('cold'));
    expect(read).toHaveBeenCalledTimes(1);
  });
});
