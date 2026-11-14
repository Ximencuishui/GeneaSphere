import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import {
  GenealogyDocumentStorageStatus,
  GenealogyDocumentStyle,
  GenealogyPrintJobStatus,
  Prisma,
} from '@prisma/client';
import { CreateGenealogyDocumentDto } from './dto/create-genealogy-document.dto';
import { PrintService } from '../print/print.service';
import type { GenealogyPreviewParams } from '../print/genealogy-preview';
import { CosService } from '../cos/cos.service';
import { v4 as uuidv4 } from 'uuid';
import { assertPedigreeLocked } from '../genealogy-workflow/xiupu-settings';
import { GenealogyEditionService } from '../genealogy-edition/genealogy-edition.service';

/**
 * 族谱文档历史版本管理服务
 *
 * 复用 PrintService 生成 PDF，保存到 GenealogyDocument 表，支持历史版本查询、对比、删除。
 */
type RenderJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** 对象存储整包上传。超过该大小直接拒绝，不截断、不转成 data URL。 */
export const PDF_MAX_BYTES = 64 * 1024 * 1024;

export const GENERATION_STORAGE_FAILED = 'GENERATION_STORAGE_FAILED';
export const PDF_TOO_LARGE = 'PDF_TOO_LARGE';

export class PdfTooLargeError extends Error {
  readonly code = PDF_TOO_LARGE;

  constructor(actualBytes: number, maxBytes: number) {
    super(
      `PDF 超过 ${Math.round(maxBytes / 1024 / 1024)}MB 上限（实际 ${Math.ceil(actualBytes / 1024 / 1024)}MB），已拒绝上传`,
    );
    this.name = 'PdfTooLargeError';
  }
}

export class GenealogyStorageFailedError extends Error {
  readonly code = GENERATION_STORAGE_FAILED;

  constructor(readonly document: Record<string, unknown>) {
    super('对象存储上传失败');
    this.name = 'GenealogyStorageFailedError';
  }
}

export function assertPdfWithinLimit(byteLength: number, maxBytes = PDF_MAX_BYTES): void {
  if (byteLength > maxBytes) {
    throw new PdfTooLargeError(byteLength, maxBytes);
  }
}

interface RenderJob {
  id: string;
  clanId: string;
  userId: string;
  dto: CreateGenealogyDocumentDto;
  /** 重试时指向已有的失败文档，生成从 renderAndStore 重新进入。 */
  documentId: string | null;
  status: RenderJobStatus;
  code: string | null;
  error: string | null;
  document: Record<string, unknown> | null;
  createdAt: number;
}

@Injectable()
export class GenealogyDocumentService {
  private readonly logger = new Logger(GenealogyDocumentService.name);

  /**
   * 进程内队列。HTTP 只入队并返回 job id，渲染在后续 tick 执行。
   * 替换点：enqueue() 改为 JobsService.createJob({ type: 'puppeteer', payload })，
   * 由持久化 worker 拉取 heavy_jobs 后调用 renderAndStore，再用 completeJob / failJob 回写。
   * 不要把 renderAndStore 挪回请求线程。
   */
  private readonly renderJobs = new Map<string, RenderJob>();
  private readonly renderQueue: string[] = [];
  private renderPumping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly printService: PrintService,
    private readonly cosService: CosService,
    private readonly edition: GenealogyEditionService,
  ) {}

  /**
   * 提交渲染。锁谱校验在请求线程完成，PDF 生成不在这里等待。
   */
  async enqueue(clanId: bigint, userId: string, dto: CreateGenealogyDocumentDto) {
    await assertPedigreeLocked(this.prisma, clanId);
    const job: RenderJob = {
      id: uuidv4(),
      clanId: clanId.toString(),
      userId,
      dto,
      status: 'pending',
      documentId: null,
      code: null,
      error: null,
      document: null,
      createdAt: Date.now(),
    };
    this.renderJobs.set(job.id, job);
    this.pruneRenderJobs();
    this.renderQueue.push(job.id);
    setImmediate(() => this.pumpRenderQueue());
    return { job_id: job.id, status: 'pending' as const };
  }

  getRenderJob(clanId: bigint, jobId: string) {
    const job = this.renderJobs.get(jobId);
    if (!job || job.clanId !== clanId.toString()) {
      throw new NotFoundException('渲染任务不存在');
    }
    return {
      job_id: job.id,
      status: job.status,
      code: job.code,
      error: job.error,
      document: this.presentDocument(job.document),
      retry_document_id:
        job.documentId ??
        (job.code === GENERATION_STORAGE_FAILED ? this.documentIdOf(job.document) : null),
    };
  }

  /**
   * 对 GENERATION_STORAGE_FAILED 的文档重新生成。
   * 请求立刻返回 job id；worker 从 renderAndStore 进入，先重新渲染 PDF，再上传。
   */
  async retry(clanId: bigint, userId: string, documentId: bigint) {
    await assertPedigreeLocked(this.prisma, clanId);
    const existing = await this.prisma.genealogyDocument.findUnique({ where: { id: documentId } });
    if (!existing || existing.clan_id !== clanId) {
      throw new NotFoundException(`族谱文档 ${documentId} 不存在`);
    }
    if (existing.storage_status !== GenealogyDocumentStorageStatus.GENERATION_STORAGE_FAILED) {
      throw new ConflictException('只有对象存储失败的文档可以重试');
    }
    const summary = (existing.scope_summary ?? {}) as Record<string, unknown>;
    const job: RenderJob = {
      id: uuidv4(),
      clanId: clanId.toString(),
      userId,
      dto: {
        version_name: existing.version_name,
        style: existing.style,
        layout: this.optionalLayout(summary.layout),
        branch: typeof summary.branch === 'string' ? summary.branch : undefined,
        generation_start: this.optionalInt(summary.generation_start),
        generation_end: this.optionalInt(summary.generation_end),
        cover_image_url: typeof summary.cover_image_url === 'string' ? summary.cover_image_url : undefined,
        include_options: this.optionalInclude(summary.include_options),
      },
      documentId: existing.id.toString(),
      status: 'pending',
      code: null,
      error: null,
      document: null,
      createdAt: Date.now(),
    };
    this.renderJobs.set(job.id, job);
    this.pruneRenderJobs();
    this.renderQueue.push(job.id);
    setImmediate(() => this.pumpRenderQueue());
    return { job_id: job.id, status: 'pending' as const, retry_document_id: job.documentId };
  }

  private pumpRenderQueue() {
    if (this.renderPumping) return;
    const jobId = this.renderQueue.shift();
    if (!jobId) return;
    const job = this.renderJobs.get(jobId);
    if (!job) {
      this.pumpRenderQueue();
      return;
    }
    this.renderPumping = true;
    job.status = 'processing';
    void this.runRenderJob(job).finally(() => {
      this.renderPumping = false;
      this.pumpRenderQueue();
    });
  }

  private async runRenderJob(job: RenderJob) {
    try {
      job.document = (await this.renderAndStore(
        BigInt(job.clanId),
        job.userId,
        job.dto,
        job.documentId ? BigInt(job.documentId) : undefined,
      )) as Record<string, unknown>;
      job.status = 'completed';
      job.code = null;
    } catch (error) {
      job.status = 'failed';
      if (error instanceof GenealogyStorageFailedError) {
        job.code = error.code;
        job.error = error.message;
        job.document = error.document;
      } else if (error instanceof PdfTooLargeError) {
        job.code = error.code;
        job.error = error.message;
        job.document = null;
      } else {
        job.code = 'GENERATION_FAILED';
        job.error = error instanceof Error ? error.message : 'PDF 渲染失败';
      }
      this.logger.error(`族谱 PDF 任务 ${job.id} 失败: ${job.code} ${job.error}`);
    }
  }

  private pruneRenderJobs() {
    if (this.renderJobs.size <= 100) return;
    for (const [id, job] of this.renderJobs) {
      if (job.status !== 'completed' && job.status !== 'failed') continue;
      this.renderJobs.delete(id);
      if (this.renderJobs.size <= 100) break;
    }
  }

  /**
   * 生成族谱文档（保存为历史版本）
   *
   * 完整流程：
   * 1. 复用 PrintService 生成 PDF Buffer
   * 2. 上传到 COS 冷 Bucket（CDN URL）
   * 3. 写入 GenealogyDocument 表
   */
  private async renderAndStore(
    clanId: bigint,
    userId: string,
    dto: CreateGenealogyDocumentDto,
    existingId?: bigint,
  ) {
    await assertPedigreeLocked(this.prisma, clanId);
    // 锁谱之后世系不能再改，这里读到的就是已锁定的谱稿。
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await this.printService.generateGenealogyPdf(clanId, this.previewParams(dto));
    } catch (err: any) {
      this.logger.error(`生成族谱 PDF 失败: ${err?.message}`);
      throw err;
    }
    // COS / 本地驱动都是 putObject 整包上传，不是分片。超限在上传前拒绝。
    assertPdfWithinLimit(pdfBuffer.length);

    const personCount = await this.prisma.person.count({ where: { clan_id: clanId } });
    const pageCount = Math.max(1, Math.ceil(personCount / 40));
    const scope = this.scopeSummary(dto, personCount);
    const versionNumber = existingId ? undefined : await this.allocateVersion(clanId);
    const key = `genealogy/${clanId}/${existingId?.toString() ?? versionNumber}/${uuidv4().replace(/-/g, '')}.pdf`;

    let uploadedFileUrl: string;
    let uploadedKey: string | null = null;
    try {
      const result = await this.cosService.uploadFile(key, pdfBuffer, {
        contentType: 'application/pdf',
        bucketType: 'cold',
      });
      uploadedFileUrl = result.url;
      uploadedKey = result.key;
    } catch (err: any) {
      this.logger.error(`上传族谱 PDF 失败: ${err?.message}`);
      const failed = await this.saveDocument(clanId, userId, dto, {
        existingId,
        fileUrl: null,
        fileSize: pdfBuffer.length,
        pageCount,
        scope,
        storageStatus: GenealogyDocumentStorageStatus.GENERATION_STORAGE_FAILED,
      });
      throw new GenealogyStorageFailedError(failed);
    }

    return this.saveDocument(clanId, userId, dto, {
      existingId,
      fileUrl: uploadedFileUrl,
      objectKey: uploadedKey,
      fileSize: pdfBuffer.length,
      pageCount,
      scope,
      storageStatus: GenealogyDocumentStorageStatus.READY,
    });
  }

  private previewParams(dto: CreateGenealogyDocumentDto): GenealogyPreviewParams {
    return {
      layout: dto.layout ?? 'su',
      style: dto.style,
      branch: dto.branch?.trim() || undefined,
      generation_start: dto.generation_start,
      generation_end: dto.generation_end,
      cover_image_url: dto.cover_image_url?.trim() || undefined,
      include_options: dto.include_options,
    };
  }

  private scopeSummary(dto: CreateGenealogyDocumentDto, personCount: number): Prisma.InputJsonValue {
    return {
      branch: dto.branch ?? null,
      generation_start: dto.generation_start ?? null,
      generation_end: dto.generation_end ?? null,
      person_count: personCount,
      include_options: dto.include_options ?? null,
      cover_image_url: dto.cover_image_url ?? null,
      layout: dto.layout ?? 'su',
    };
  }

  private async allocateVersion(clanId: bigint): Promise<number> {
    let nextVersion = 1;
    await this.prisma.$transaction(
      async (tx) => {
        const lastDoc = await tx.genealogyDocument.findFirst({
          where: { clan_id: clanId },
          orderBy: { version_number: 'desc' },
          select: { version_number: true },
        });
        nextVersion = (lastDoc?.version_number ?? 0) + 1;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return nextVersion;
  }

  private async saveDocument(
    clanId: bigint,
    userId: string,
    dto: CreateGenealogyDocumentDto,
    input: {
      existingId?: bigint;
      fileUrl: string | null;
      /** 本次上传成功的对象 key。条件更新未命中时用来删掉无人引用的文件。 */
      objectKey?: string | null;
      fileSize: number;
      pageCount: number;
      scope: Prisma.InputJsonValue;
      storageStatus: GenealogyDocumentStorageStatus;
    },
  ) {
    try {
      const doc = await this.prisma.$transaction(
        async (tx) => {
          const data = {
            file_url: input.fileUrl,
            file_size: BigInt(input.fileSize),
            page_count: input.pageCount,
            storage_status: input.storageStatus,
            scope_summary: input.scope,
          };
          if (input.existingId) {
            const updated = await tx.genealogyDocument.updateMany({
              where: {
                id: input.existingId,
                storage_status: GenealogyDocumentStorageStatus.GENERATION_STORAGE_FAILED,
              },
              data,
            });
            if (updated.count === 0) {
              if (input.objectKey) {
                try {
                  await this.cosService.deleteFile(input.objectKey, 'cold');
                } catch (deleteError: any) {
                  this.logger.error(
                    `孤儿对象待清理 key=${input.objectKey} ${deleteError?.message || deleteError}`,
                  );
                }
              }
              throw new ConflictException('已被其他请求处理');
            }
            const row = await tx.genealogyDocument.findUnique({ where: { id: input.existingId } });
            if (!row) {
              throw new NotFoundException(`族谱文档 ${input.existingId} 不存在`);
            }
            return row;
          }
          const lastDoc = await tx.genealogyDocument.findFirst({
            where: { clan_id: clanId },
            orderBy: { version_number: 'desc' },
            select: { version_number: true },
          });
          return tx.genealogyDocument.create({
            data: {
              ...data,
              clan_id: clanId,
              version_name: dto.version_name,
              version_number: (lastDoc?.version_number ?? 0) + 1,
              style: dto.style,
              created_by: userId,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (doc?.id) await this.edition.attachReadyDocument(clanId, doc.id);
      return this.toResponse(doc);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('族谱文档版本冲突，请重试');
      }
      throw error;
    }
  }

  private documentIdOf(document: Record<string, unknown> | null): string | null {
    return typeof document?.id === 'string' ? document.id : null;
  }

  private optionalLayout(value: unknown): CreateGenealogyDocumentDto['layout'] {
    return value === 'su' || value === 'ou' || value === 'shixi_table' ? value : undefined;
  }

  private optionalInt(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
  }

  private optionalInclude(value: unknown): CreateGenealogyDocumentDto['include_options'] {
    if (!value || typeof value !== 'object') return undefined;
    return value as CreateGenealogyDocumentDto['include_options'];
  }

  /**
   * 查询族谱历史版本列表
   */
  async list(
    clanId: bigint,
    options: { page?: number; pageSize?: number; style?: GenealogyDocumentStyle },
  ) {
    const { page = 1, pageSize = 20, style } = options;
    const where: Prisma.GenealogyDocumentWhereInput = {
      clan_id: clanId,
      ...(style ? { style } : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.genealogyDocument.count({ where }),
      this.prisma.genealogyDocument.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: items.map((item) => this.toResponse(item)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 查询单个历史版本
   */
  async findOne(clanId: bigint, id: bigint) {
    const doc = await this.prisma.genealogyDocument.findUnique({ where: { id } });
    if (!doc || doc.clan_id !== clanId) {
      throw new NotFoundException(`族谱文档 ${id} 不存在`);
    }
    return this.toResponse(doc);
  }

  /**
   * 删除历史版本
   */
  async delete(clanId: bigint, id: bigint) {
    const doc = await this.prisma.genealogyDocument.findUnique({ where: { id } });
    if (!doc || doc.clan_id !== clanId) {
      throw new NotFoundException(`族谱文档 ${id} 不存在`);
    }
    await this.prisma.genealogyDocument.delete({ where: { id } });
    return { id: id.toString(), deleted: true };
  }

  /**
   * 为已落库的册谱 PDF 创建印刷工作项。只记 PENDING，不收款、不交给印刷厂。
   */
  async createPrintJob(clanId: bigint, userId: string, documentId: bigint) {
    const doc = await this.prisma.genealogyDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.clan_id !== clanId) {
      throw new NotFoundException(`族谱文档 ${documentId} 不存在`);
    }
    if (doc.storage_status !== GenealogyDocumentStorageStatus.READY || !doc.file_url) {
      throw new ConflictException('只有已生成 PDF 的文档可以下单印刷');
    }
    const summary = (doc.scope_summary ?? {}) as Record<string, unknown>;
    const job = await this.prisma.genealogyPrintJob.create({
      data: {
        clan_id: clanId,
        document_id: doc.id,
        user_id: userId,
        status: GenealogyPrintJobStatus.PENDING,
        document_generated_at: doc.created_at,
        layout_params: {
          version_name: doc.version_name,
          style: doc.style,
          layout: typeof summary.layout === 'string' ? summary.layout : 'su',
          branch: typeof summary.branch === 'string' ? summary.branch : null,
          generation_start: typeof summary.generation_start === 'number' ? summary.generation_start : null,
          generation_end: typeof summary.generation_end === 'number' ? summary.generation_end : null,
          include_options:
            summary.include_options && typeof summary.include_options === 'object'
              ? summary.include_options
              : null,
          cover_image_url: typeof summary.cover_image_url === 'string' ? summary.cover_image_url : null,
        } as Prisma.InputJsonValue,
      },
    });
    return this.toPrintJob(job);
  }

  async getPrintJob(clanId: bigint, jobId: bigint) {
    const job = await this.prisma.genealogyPrintJob.findUnique({ where: { id: jobId } });
    if (!job || job.clan_id !== clanId) {
      throw new NotFoundException(`印刷工作项 ${jobId} 不存在`);
    }
    return this.toPrintJob(job);
  }

  /**
   * 对比两个版本的差异（人员增减）
   */
  async diff(clanId: bigint, idA: bigint, idB: bigint) {
    const [a, b] = await Promise.all([
      this.prisma.genealogyDocument.findUnique({ where: { id: idA } }),
      this.prisma.genealogyDocument.findUnique({ where: { id: idB } }),
    ]);

    if (!a || a.clan_id !== clanId) throw new NotFoundException(`族谱文档 ${idA} 不存在`);
    if (!b || b.clan_id !== clanId) throw new NotFoundException(`族谱文档 ${idB} 不存在`);

    const bothReady =
      a.storage_status === GenealogyDocumentStorageStatus.READY &&
      b.storage_status === GenealogyDocumentStorageStatus.READY;
    return {
      version_a: this.toResponse(a),
      version_b: this.toResponse(b),
      diff: {
        version_number_diff: b.version_number - a.version_number,
        page_count_diff: bothReady ? (b.page_count ?? 0) - (a.page_count ?? 0) : null,
        file_size_diff: bothReady
          ? Number((b.file_size ?? BigInt(0)) - (a.file_size ?? BigInt(0)))
          : null,
      },
    };
  }

  private toPrintJob(job: {
    id: bigint;
    clan_id: bigint;
    document_id: bigint | null;
    source_task_id?: string | null;
    user_id: string;
    status: GenealogyPrintJobStatus;
    layout_params: Prisma.JsonValue;
    document_generated_at: Date;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: job.id.toString(),
      clan_id: job.clan_id.toString(),
      document_id: job.document_id?.toString() ?? null,
      source_task_id: job.source_task_id ?? null,
      user_id: job.user_id,
      status: job.status,
      layout_params: job.layout_params ?? {},
      document_generated_at: job.document_generated_at.toISOString(),
      created_at: job.created_at.toISOString(),
      updated_at: job.updated_at.toISOString(),
    };
  }

  /**
   * 完成和存储失败会带上文档。pending、processing，以及没有文档的失败分支保持 null。
   * 这里再走一次 toResponse：saveDocument 已经转过一次，第二次必须可重复。
   */
  private presentDocument(document: Record<string, unknown> | null) {
    if (!document) return null;
    return this.toResponse(document as Parameters<GenealogyDocumentService['toResponse']>[0]);
  }

  /**
   * 统一响应序列化。GenealogyDocument 的 BigInt 列只有 id、clan_id、file_size。
   * id / clan_id 用 toString()；file_size 保持原有的 Number。
   */
  private toResponse<T extends {
    id: bigint | string;
    clan_id: bigint | string;
    file_size?: bigint | number | null;
    scope_summary?: unknown;
    created_at: Date | string;
  }>(d: T) {
    return {
      ...d,
      id: d.id.toString(),
      clan_id: d.clan_id.toString(),
      file_size: d.file_size ? Number(d.file_size) : null,
      scope_summary: d.scope_summary ?? {},
      created_at: d.created_at instanceof Date ? d.created_at.toISOString() : d.created_at,
    };
  }
}
