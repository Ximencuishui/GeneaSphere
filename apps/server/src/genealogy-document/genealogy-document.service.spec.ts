import { ConflictException, NotFoundException } from '@nestjs/common';
import { GenealogyDocumentStyle } from '@prisma/client';
import {
  assertPdfWithinLimit,
  GenealogyDocumentService,
  GenealogyStorageFailedError,
  PDF_MAX_BYTES,
  PdfTooLargeError,
} from './genealogy-document.service';
import { CreateGenealogyDocumentDto } from './dto/create-genealogy-document.dto';

jest.mock('uuid', () => {
  let n = 0;
  return { v4: () => `job-${++n}` };
});

jest.mock('../print/print.service', () => ({
  PrintService: class PrintService {},
}));

jest.mock('../cos/cos.service', () => ({
  CosService: class CosService {},
}));

const lockedSettings = {
  settings_json: {
    xiupu: {
      lock: {
        locked_at: '2026-11-13T00:00:00.000Z',
        locked_by: 'user-1',
        operator_name: '主修',
        version_name: '定稿',
      },
    },
  },
};

const dto = {
  version_name: '族谱·2026版',
  style: GenealogyDocumentStyle.traditional,
} as CreateGenealogyDocumentDto;

function build(generateGenealogyPdf = jest.fn()) {
  const prisma = {
    clan: { findUnique: jest.fn().mockResolvedValue(lockedSettings) },
  };
  const service = new GenealogyDocumentService(
    prisma as never,
    { generateGenealogyPdf } as never,
    {} as never,
    { attachReadyDocument: jest.fn() } as never,
  );
  return { service, prisma, generateGenealogyPdf };
}

async function flushQueue() {
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

describe('GenealogyDocumentService.enqueue', () => {
  it('立即返回 job id，不在请求里等待 PDF', async () => {
    const { service, generateGenealogyPdf } = build(jest.fn(() => new Promise(() => undefined)));
    const queued = await service.enqueue(1n, 'user-1', dto);

    expect(queued.status).toBe('pending');
    expect(queued.job_id).toEqual(expect.any(String));
    expect(generateGenealogyPdf).not.toHaveBeenCalled();

    await flushQueue();
    expect(service.getRenderJob(1n, queued.job_id).status).toBe('processing');
    expect(generateGenealogyPdf).toHaveBeenCalledWith(1n, {
      layout: 'su',
      style: dto.style,
      branch: undefined,
      generation_start: undefined,
      generation_end: undefined,
      cover_image_url: undefined,
      include_options: undefined,
    });
  });

  it('渲染失败后任务变为 failed', async () => {
    const { service } = build(
      jest.fn().mockRejectedValue(new Error('PDF 渲染超时（60 秒），已关闭浏览器')),
    );
    const queued = await service.enqueue(1n, 'user-1', dto);
    for (let i = 0; i < 10; i++) {
      await flushQueue();
      if (service.getRenderJob(1n, queued.job_id).status === 'failed') break;
    }

    expect(service.getRenderJob(1n, queued.job_id)).toMatchObject({
      status: 'failed',
      error: 'PDF 渲染超时（60 秒），已关闭浏览器',
    });
  });

  it('未锁谱时拒绝入队', async () => {
    const { service, prisma, generateGenealogyPdf } = build();
    prisma.clan.findUnique.mockResolvedValue({ settings_json: {} });

    await expect(service.enqueue(1n, 'user-1', dto)).rejects.toBeInstanceOf(ConflictException);
    expect(generateGenealogyPdf).not.toHaveBeenCalled();
  });

  it('不能读取其他家族的任务', async () => {
    const { service } = build(jest.fn(() => new Promise(() => undefined)));
    const queued = await service.enqueue(1n, 'user-1', dto);

    expect(() => service.getRenderJob(2n, queued.job_id)).toThrow(NotFoundException);
  });
});

describe('PDF 持久化', () => {
  it('超过上限时明确拒绝，不截断', () => {
    expect(() => assertPdfWithinLimit(PDF_MAX_BYTES)).not.toThrow();
    expect(() => assertPdfWithinLimit(PDF_MAX_BYTES + 1)).toThrow(PdfTooLargeError);
  });

  it('对象存储失败时写入失败状态且 file_url 为空', async () => {
    const created = jest.fn(async ({ data }) => ({
      id: 11n,
      clan_id: 1n,
      created_at: new Date('2026-11-13T00:00:00.000Z'),
      ...data,
    }));
    const uploadFile = jest.fn().mockRejectedValue(new Error('COS down'));
    const prisma = {
      clan: { findUnique: jest.fn().mockResolvedValue(lockedSettings) },
      person: { count: jest.fn().mockResolvedValue(4) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          genealogyDocument: {
            findFirst: jest.fn().mockResolvedValue({ version_number: 2 }),
            create: created,
          },
        }),
      ),
    };
    const service = new GenealogyDocumentService(
      prisma as never,
      { generateGenealogyPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')) } as never,
      { uploadFile } as never,
      { attachReadyDocument: jest.fn() } as never,
    );

    const queued = await service.enqueue(1n, 'user-1', dto);
    for (let i = 0; i < 10; i++) {
      await flushQueue();
      if (service.getRenderJob(1n, queued.job_id).status === 'failed') break;
    }

    const job = service.getRenderJob(1n, queued.job_id);
    expect(job).toMatchObject({
      status: 'failed',
      code: 'GENERATION_STORAGE_FAILED',
      error: '对象存储上传失败',
      retry_document_id: '11',
    });
    expect(job.document).toMatchObject({
      id: '11',
      clan_id: '1',
      file_url: null,
      storage_status: 'GENERATION_STORAGE_FAILED',
    });
    expect(typeof (job.document as { file_size: unknown }).file_size).toBe('number');
    expect(() => JSON.stringify(job)).not.toThrow();
    const saved = created.mock.calls[0][0].data as { file_url: string | null; scope_summary: unknown };
    expect(saved.file_url).toBeNull();
    expect(JSON.stringify(saved.scope_summary)).not.toContain('data:application/pdf');
    expect(uploadFile).toHaveBeenCalled();
  });

  it('对象存储失败后可按原文档重试，成功后写入 file_url', async () => {
    const created = jest.fn();
    const updated = jest.fn();
    let stored: Record<string, unknown> | null = null;
    const uploadFile = jest
      .fn()
      .mockRejectedValueOnce(new Error('COS down'))
      .mockResolvedValueOnce({ url: 'genealogy/1/3/retry.pdf' });
    const prisma = {
      clan: { findUnique: jest.fn().mockResolvedValue(lockedSettings) },
      person: { count: jest.fn().mockResolvedValue(4) },
      genealogyDocument: {
        findUnique: jest.fn(async () => stored),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          genealogyDocument: {
            findFirst: jest.fn().mockResolvedValue({ version_number: 2 }),
            create: jest.fn(async ({ data }) => {
              stored = {
                id: 11n,
                clan_id: 1n,
                version_name: data.version_name,
                style: data.style,
                scope_summary: data.scope_summary,
                created_at: new Date('2026-11-13T00:00:00.000Z'),
                ...data,
              };
              created(data);
              return stored;
            }),
            updateMany: jest.fn(async ({ where, data }) => {
              if (!stored || stored.storage_status !== where.storage_status) return { count: 0 };
              stored = { ...stored, ...data };
              updated({ where, data });
              return { count: 1 };
            }),
            findUnique: jest.fn(async () => stored),
          },
        }),
      ),
    };
    const service = new GenealogyDocumentService(
      prisma as never,
      { generateGenealogyPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')) } as never,
      { uploadFile } as never,
      { attachReadyDocument: jest.fn() } as never,
    );

    const queued = await service.enqueue(1n, 'user-1', dto);
    for (let i = 0; i < 10; i++) {
      await flushQueue();
      if (service.getRenderJob(1n, queued.job_id).status === 'failed') break;
    }

    const failed = service.getRenderJob(1n, queued.job_id);
    expect(failed).toMatchObject({
      status: 'failed',
      code: 'GENERATION_STORAGE_FAILED',
      error: '对象存储上传失败',
      retry_document_id: '11',
    });
    expect(failed.document).toMatchObject({
      file_url: null,
      storage_status: 'GENERATION_STORAGE_FAILED',
    });
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ file_url: null }));
    expect(JSON.stringify((created.mock.calls[0][0] as { scope_summary: unknown }).scope_summary)).not.toContain(
      'data:application/pdf',
    );

    const retried = await service.retry(1n, 'user-1', 11n);
    for (let i = 0; i < 10; i++) {
      await flushQueue();
      if (service.getRenderJob(1n, retried.job_id).status === 'completed') break;
    }

    expect(service.getRenderJob(1n, retried.job_id)).toMatchObject({
      status: 'completed',
      code: null,
      document: {
        id: '11',
        file_url: 'genealogy/1/3/retry.pdf',
        storage_status: 'READY',
      },
    });
    expect(updated).toHaveBeenCalledWith({
      where: { id: 11n, storage_status: 'GENERATION_STORAGE_FAILED' },
      data: expect.objectContaining({
        file_url: 'genealogy/1/3/retry.pdf',
        storage_status: 'READY',
      }),
    });
    expect(created).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });

  it('并发重试时第二次条件更新未命中则不覆盖 file_url', async () => {
    const winner = {
      id: 11n,
      clan_id: 1n,
      version_name: dto.version_name,
      style: dto.style,
      file_url: 'genealogy/1/3/first.pdf',
      storage_status: 'READY',
      created_at: new Date('2026-11-13T00:00:00.000Z'),
    };
    const updateMany = jest.fn(async () => ({ count: 0 }));
    const uploadFile = jest.fn(async (key: string) => ({ url: 'genealogy/1/3/second.pdf', key }));
    const deleteFile = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      clan: { findUnique: jest.fn().mockResolvedValue(lockedSettings) },
      person: { count: jest.fn().mockResolvedValue(4) },
      genealogyDocument: {
        findUnique: jest.fn().mockResolvedValue({
          ...winner,
          file_url: null,
          storage_status: 'GENERATION_STORAGE_FAILED',
          scope_summary: {},
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          genealogyDocument: {
            updateMany,
            findUnique: jest.fn(),
          },
        }),
      ),
    };
    const service = new GenealogyDocumentService(
      prisma as never,
      { generateGenealogyPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')) } as never,
      { uploadFile, deleteFile } as never,
      { attachReadyDocument: jest.fn() } as never,
    );

    const retried = await service.retry(1n, 'user-1', 11n);
    for (let i = 0; i < 10; i++) {
      await flushQueue();
      if (service.getRenderJob(1n, retried.job_id).status === 'failed') break;
    }

    expect(service.getRenderJob(1n, retried.job_id)).toMatchObject({
      status: 'failed',
      error: '已被其他请求处理',
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 11n, storage_status: 'GENERATION_STORAGE_FAILED' },
      data: expect.objectContaining({ file_url: 'genealogy/1/3/second.pdf' }),
    });
    expect(winner.file_url).toBe('genealogy/1/3/first.pdf');
    expect(deleteFile).toHaveBeenCalledWith(uploadFile.mock.calls[0][0], 'cold');
  });

  it('超限时不上传、不写文档', async () => {
    const uploadFile = jest.fn();
    const create = jest.fn();
    const prisma = {
      clan: { findUnique: jest.fn().mockResolvedValue(lockedSettings) },
      person: { count: jest.fn() },
      $transaction: jest.fn(),
      genealogyDocument: { create },
    };
    const service = new GenealogyDocumentService(
      prisma as never,
      { generateGenealogyPdf: jest.fn().mockResolvedValue({ length: PDF_MAX_BYTES + 1 }) } as never,
      { uploadFile } as never,
      { attachReadyDocument: jest.fn() } as never,
    );

    const queued = await service.enqueue(1n, 'user-1', dto);
    for (let i = 0; i < 10; i++) {
      await flushQueue();
      if (service.getRenderJob(1n, queued.job_id).status === 'failed') break;
    }

    expect(service.getRenderJob(1n, queued.job_id)).toMatchObject({
      status: 'failed',
      code: 'PDF_TOO_LARGE',
      document: null,
      retry_document_id: null,
    });
    expect(uploadFile).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('存储失败错误携带可重试文档', () => {
    const error = new GenealogyStorageFailedError({ id: '11', file_url: null });
    expect(error.code).toBe('GENERATION_STORAGE_FAILED');
    expect(error.document.file_url).toBeNull();
  });
});

describe('印刷工作项', () => {
  const generatedAt = new Date('2026-11-14T00:00:00.000Z');
  const readyDoc = {
    id: 9n,
    clan_id: 1n,
    version_name: '族谱·2026版',
    style: 'traditional',
    file_url: 'genealogy/1/1/a.pdf',
    storage_status: 'READY',
    created_at: generatedAt,
    scope_summary: {
      layout: 'ou',
      branch: '南支',
      generation_start: 1,
      generation_end: 5,
      include_options: { spouse_info: true },
    },
  };

  function serviceWith(doc: unknown, created = jest.fn()) {
    const prisma = {
      genealogyDocument: { findUnique: jest.fn().mockResolvedValue(doc) },
      genealogyPrintJob: {
        create: created,
        findUnique: jest.fn(),
      },
    };
    const service = new GenealogyDocumentService(prisma as never, {} as never, {} as never, { attachReadyDocument: jest.fn() } as never);
    return { service, prisma, created };
  }

  it('为已生成的文档创建 PENDING 工作项', async () => {
    const created = jest.fn().mockResolvedValue({
      id: 4n,
      clan_id: 1n,
      document_id: 9n,
      user_id: 'user-1',
      status: 'PENDING',
      layout_params: { layout: 'ou', branch: '南支' },
      document_generated_at: generatedAt,
      created_at: generatedAt,
      updated_at: generatedAt,
    });
    const { service } = serviceWith(readyDoc, created);

    const job = await service.createPrintJob(1n, 'user-1', 9n);

    expect(job).toMatchObject({
      id: '4',
      clan_id: '1',
      document_id: '9',
      status: 'PENDING',
      document_generated_at: generatedAt.toISOString(),
    });
    expect(created).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clan_id: 1n,
        document_id: 9n,
        user_id: 'user-1',
        status: 'PENDING',
        document_generated_at: generatedAt,
        layout_params: expect.objectContaining({ layout: 'ou', branch: '南支', style: 'traditional' }),
      }),
    });
  });

  it('PDF 未落库时不创建工作项', async () => {
    const { service, created } = serviceWith({ ...readyDoc, file_url: null, storage_status: 'GENERATION_STORAGE_FAILED' });

    await expect(service.createPrintJob(1n, 'user-1', 9n)).rejects.toBeInstanceOf(ConflictException);
    expect(created).not.toHaveBeenCalled();
  });

  it('按 id 查询本家族的工作项', async () => {
    const { service, prisma } = serviceWith(readyDoc);
    prisma.genealogyPrintJob.findUnique.mockResolvedValue({
      id: 4n,
      clan_id: 1n,
      document_id: 9n,
      user_id: 'user-1',
      status: 'PENDING',
      layout_params: { layout: 'ou' },
      document_generated_at: generatedAt,
      created_at: generatedAt,
      updated_at: generatedAt,
    });

    await expect(service.getPrintJob(1n, 4n)).resolves.toMatchObject({ id: '4', status: 'PENDING' });
    await expect(service.getPrintJob(2n, 4n)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clan_id 不匹配时抛 NotFoundException', async () => {
    const { service, prisma } = serviceWith(readyDoc);
    prisma.genealogyPrintJob.findUnique.mockResolvedValue({
      id: 4n,
      clan_id: 1n,
      document_id: 9n,
      user_id: 'user-1',
      status: 'PENDING',
      layout_params: {},
      document_generated_at: generatedAt,
      created_at: generatedAt,
      updated_at: generatedAt,
    });

    await expect(service.getPrintJob(2n, 4n)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('版本对比', () => {
  function diffService(a: Record<string, unknown>, b: Record<string, unknown>) {
    const prisma = {
      genealogyDocument: {
        findUnique: jest.fn(async ({ where }: { where: { id: bigint } }) => (where.id === 1n ? a : b)),
      },
    };
    return new GenealogyDocumentService(prisma as never, {} as never, {} as never, { attachReadyDocument: jest.fn() } as never);
  }

  const base = {
    clan_id: 1n,
    version_name: '族谱',
    version_number: 1,
    style: 'traditional',
    file_url: 'genealogy/1/1/a.pdf',
    file_size: 100n,
    page_count: 2,
    storage_status: 'READY',
    scope_summary: {},
    created_at: new Date('2026-11-14T00:00:00.000Z'),
  };

  it('失败行不参与页数和文件大小对比', async () => {
    const service = diffService(
      { ...base, id: 1n },
      {
        ...base,
        id: 2n,
        version_number: 2,
        file_url: null,
        file_size: 999n,
        page_count: 40,
        storage_status: 'GENERATION_STORAGE_FAILED',
      },
    );

    const result = await service.diff(1n, 1n, 2n);

    expect(result.diff).toEqual({
      version_number_diff: 1,
      page_count_diff: null,
      file_size_diff: null,
    });
  });
});
