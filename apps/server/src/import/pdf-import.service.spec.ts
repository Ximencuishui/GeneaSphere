import { HttpException, HttpStatus } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PedigreeService } from '../pedigree/pedigree.service';
import { PdfImportService, PdfPersonRecord } from './pdf-import.service';

jest.mock('../cos/cos.service', () => ({ CosService: class CosService {} }));

interface PersonRow {
  id: bigint;
  clan_id: bigint;
  full_name: string;
  gender: string;
  deleted_at: null;
}

interface AncestryRow {
  ancestor_id: bigint;
  descendant_id: bigint;
  depth: number;
}

interface FamilyRow {
  id: bigint;
  clan_id: bigint;
  husband_id: bigint | null;
  wife_id: bigint | null;
}

interface ChildRow {
  family_id: bigint;
  child_id: bigint;
  birth_order: number;
  child_type: string;
}

function memoryStore() {
  let seq = 1n;
  const persons: PersonRow[] = [];
  const ancestry: AncestryRow[] = [];
  const families: FamilyRow[] = [];
  const children: ChildRow[] = [];

  const pick = <T extends object>(row: T, select?: Record<string, boolean>) => {
    if (!select) return row;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) {
      if (select[key]) out[key] = (row as Record<string, unknown>)[key];
    }
    return out;
  };

  const sameId = (left: bigint | null | undefined, right: bigint | null | undefined) => {
    if (left == null || right == null) return left == null && right == null;
    return left === right;
  };

  const matchFamily = (row: FamilyRow, where: any): boolean => {
    if (where?.OR) return where.OR.some((clause: any) => matchFamily(row, clause));
    if (where?.husband_id !== undefined && !sameId(row.husband_id, where.husband_id)) return false;
    if (where?.wife_id !== undefined && !sameId(row.wife_id, where.wife_id)) return false;
    return true;
  };

  const tx = {
    person: {
      findMany: async ({ where, select }: any) => {
        let rows = persons.filter((person) => person.deleted_at == null);
        if (where?.clan_id !== undefined) rows = rows.filter((person) => person.clan_id === where.clan_id);
        if (where?.full_name?.in) rows = rows.filter((person) => where.full_name.in.includes(person.full_name));
        if (where?.id?.in) {
          const ids = new Set(where.id.in.map((id: bigint) => id.toString()));
          rows = rows.filter((person) => ids.has(person.id.toString()));
        }
        return rows.map((row) => pick(row, select));
      },
      create: async ({ data }: any) => {
        const person: PersonRow = { id: seq++, deleted_at: null, ...data };
        persons.push(person);
        return person;
      },
    },
    personAncestry: {
      findMany: async ({ where }: any) =>
        ancestry.filter((row) => row.descendant_id === where.descendant_id),
      createMany: async ({ data }: any) => {
        for (const row of data) {
          const exists = ancestry.some(
            (item) => item.ancestor_id === row.ancestor_id && item.descendant_id === row.descendant_id,
          );
          if (!exists) ancestry.push(row);
        }
      },
    },
    personBio: { create: async () => ({}) },
    familyUnit: {
      findFirst: async ({ where }: any) => families.find((row) => matchFamily(row, where)) ?? null,
      create: async ({ data }: any) => {
        const row: FamilyRow = { id: seq++, ...data };
        families.push(row);
        return row;
      },
    },
    familyChild: {
      findFirst: async ({ where }: any) =>
        children.find((row) => row.family_id === where.family_id && row.child_id === where.child_id) ?? null,
      aggregate: async ({ where }: any) => {
        const rows = children.filter((row) => row.family_id === where.family_id);
        const max = rows.reduce((highest, row) => Math.max(highest, row.birth_order), 0);
        return { _max: { birth_order: rows.length ? max : null } };
      },
      create: async ({ data }: any) => {
        children.push(data);
        return data;
      },
    },
  };

  return { tx, persons, families, children, ancestry };
}

describe('PdfImportService', () => {
  const uploadDir = (clanId: string) => path.join(process.cwd(), 'uploads', 'pdf-import', clanId);

  afterEach(() => {
    fs.rmSync(uploadDir('402'), { recursive: true, force: true });
    fs.rmSync(uploadDir('404'), { recursive: true, force: true });
  });

  function serviceFor(prisma: any, parser: any, billing: any) {
    return new PdfImportService(
      parser,
      prisma,
      {} as never,
      billing,
      { getDriverType: () => 'local' } as never,
      new PedigreeService({} as never),
    );
  }

  it('余额为 0 且费用超出免费额度时上传返回 402，并且不创建任务', async () => {
    const create = jest.fn();
    const prisma = { pdfImportTask: { create } };
    const parser = {
      assessPdf: jest.fn(async () => ({ needsOcr: true, totalPages: 11, text: '', metadata: {} })),
    };
    const billing = {
      assertAffordable: jest.fn(async () => {
        throw new HttpException(
          {
            error: 'INSUFFICIENT_BALANCE',
            message: '余额不足，已中止识别：预计需要 ¥0.50，当前余额 ¥0.00',
            required: 0.5,
            current: 0,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }),
    };
    const service = serviceFor(prisma, parser, billing);

    await expect(
      service.createImportTask('user-1', 402n, Buffer.from('%PDF-1.4'), 'blank.pdf'),
    ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });

    expect(create).not.toHaveBeenCalled();
    expect(fs.existsSync(uploadDir('402'))).toBe(false);
  });

  it('任务记录写入失败时删掉已经落盘的临时 PDF', async () => {
    const prisma = {
      pdfImportTask: { create: jest.fn(async () => { throw new Error('db down'); }) },
    };
    const parser = {
      assessPdf: jest.fn(async () => ({
        needsOcr: false,
        totalPages: 1,
        text: '第十三世陈德明，配王氏',
        metadata: {},
      })),
    };
    const service = serviceFor(prisma, parser, { assertAffordable: jest.fn() });

    await expect(
      service.createImportTask('user-1', 404n, Buffer.from('%PDF-1.4'), 'clan.pdf'),
    ).rejects.toThrow('db down');

    const dir = uploadDir('404');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    expect(files.filter((name) => name.endsWith('.pdf'))).toEqual([]);
  });

  it('校对后的三代记录写入 persons，并建立配偶和父子关系', async () => {
    const records = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures', 'corrected-branch.json'), 'utf8'),
    ) as PdfPersonRecord[];
    const memory = memoryStore();
    const task = {
      id: 'pdf_fixture',
      clan_id: 9n,
      status: 'correcting',
      file_name: 'clan.pdf',
      file_size: 10n,
      parse_mode: 'text',
      total_pages: 1,
      error_message: null,
      ocr_result: { records: [], metadata: {} },
    };
    const prisma = {
      pdfImportTask: {
        findUnique: jest.fn(async () => task),
        update: jest.fn(async ({ data }: any) => Object.assign(task, data)),
      },
      pdfImportLog: {
        findUnique: jest.fn(async () => null),
        update: jest.fn(async () => { throw new Error('no log'); }),
      },
      person: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (fn: (tx: typeof memory.tx) => Promise<unknown>) => fn(memory.tx)),
    };
    const service = serviceFor(prisma, {}, {});

    const result = await service.executeImport(task.id, 9n, records, 'create');

    expect(result.successCount).toBe(3);
    expect(new Set(memory.persons.map((person) => person.full_name))).toEqual(
      new Set(['陈德明', '陈文远', '王氏']),
    );
    const husband = memory.persons.find((person) => person.full_name === '陈德明');
    const wife = memory.persons.find((person) => person.full_name === '王氏');
    const child = memory.persons.find((person) => person.full_name === '陈文远');
    expect(memory.families).toEqual([
      expect.objectContaining({ husband_id: husband?.id, wife_id: wife?.id }),
    ]);
    expect(memory.children).toEqual([
      expect.objectContaining({ child_id: child?.id, family_id: memory.families[0].id }),
    ]);
    const parentEdges = memory.ancestry.filter(
      (row) => row.descendant_id === child?.id && row.depth === 1,
    );
    expect(parentEdges.map((row) => row.ancestor_id.toString()).sort()).toEqual(
      [husband?.id.toString(), wife?.id.toString()].sort(),
    );
  });
});
