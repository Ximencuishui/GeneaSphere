import { BadRequestException } from '@nestjs/common';
import { assertExportRequest, membersCsv, readExportObject, zipTextEntries } from './clan-export-format';

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
});
