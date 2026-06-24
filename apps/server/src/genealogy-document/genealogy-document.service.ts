import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { GenealogyDocumentStyle, Prisma } from '@prisma/client';
import { CreateGenealogyDocumentDto } from './dto/create-genealogy-document.dto';
import { PrintService } from '../print/print.service';
import { CosService } from '../cos/cos.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * 族谱文档历史版本管理服务
 *
 * 复用 PrintService 生成 PDF，保存到 GenealogyDocument 表，支持历史版本查询、对比、删除。
 */
@Injectable()
export class GenealogyDocumentService {
  private readonly logger = new Logger(GenealogyDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly printService: PrintService,
    private readonly cosService: CosService,
  ) {}

  /**
   * 生成族谱文档（保存为历史版本）
   *
   * 完整流程：
   * 1. 复用 PrintService 生成 PDF Buffer
   * 2. 上传到 COS 冷 Bucket（CDN URL）
   * 3. 写入 GenealogyDocument 表
   */
  async create(
    clanId: bigint,
    userId: string,
    dto: CreateGenealogyDocumentDto,
  ) {
    // 获取下一个版本号
    const lastDoc = await this.prisma.genealogyDocument.findFirst({
      where: { clan_id: clanId },
      orderBy: { version_number: 'desc' },
    });
    const nextVersion = (lastDoc?.version_number ?? 0) + 1;

    // 生成 PDF
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await this.printService.generateGenealogyPdf(clanId);
    } catch (err: any) {
      this.logger.error(`生成族谱 PDF 失败: ${err?.message}`);
      throw err;
    }

    // 上传到 COS
    const uuid = uuidv4().replace(/-/g, '');
    const key = `genealogy/${clanId}/${nextVersion}/${uuid}.pdf`;
    let fileUrl: string;
    try {
      const result = await this.cosService.uploadFile(key, pdfBuffer, {
        contentType: 'application/pdf',
        bucketType: 'cold',
      });
      fileUrl = result.url;
    } catch (err: any) {
      this.logger.warn(`上传族谱 PDF 失败，使用本地 Base64 fallback: ${err?.message}`);
      // Fallback: 将 buffer 转为 base64 data URL
      fileUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
    }

    // 估算页数（每页约 40 人，与 PrintService 一致）
    const personCount = await this.prisma.person.count({ where: { clan_id: clanId } });
    const pageCount = Math.max(1, Math.ceil(personCount / 40));

    const doc = await this.prisma.genealogyDocument.create({
      data: {
        clan_id: clanId,
        version_name: dto.version_name,
        version_number: nextVersion,
        file_url: fileUrl,
        file_size: BigInt(pdfBuffer.length),
        page_count: pageCount,
        style: dto.style,
        scope_summary: {
          branch: dto.branch ?? null,
          generation_start: dto.generation_start ?? null,
          generation_end: dto.generation_end ?? null,
          person_count: personCount,
          include_options: dto.include_options ?? null,
          cover_image_url: dto.cover_image_url ?? null,
        } as Prisma.InputJsonValue,
        created_by: userId,
      },
    });

    return this.toResponse(doc);
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
   * 对比两个版本的差异（人员增减）
   */
  async diff(clanId: bigint, idA: bigint, idB: bigint) {
    const [a, b] = await Promise.all([
      this.prisma.genealogyDocument.findUnique({ where: { id: idA } }),
      this.prisma.genealogyDocument.findUnique({ where: { id: idB } }),
    ]);

    if (!a || a.clan_id !== clanId) throw new NotFoundException(`族谱文档 ${idA} 不存在`);
    if (!b || b.clan_id !== clanId) throw new NotFoundException(`族谱文档 ${idB} 不存在`);

    return {
      version_a: this.toResponse(a),
      version_b: this.toResponse(b),
      diff: {
        version_number_diff: b.version_number - a.version_number,
        page_count_diff: (b.page_count ?? 0) - (a.page_count ?? 0),
        file_size_diff: Number((b.file_size ?? BigInt(0)) - (a.file_size ?? BigInt(0))),
      },
    };
  }

  /**
   * 统一响应序列化
   */
  private toResponse<T extends { id: bigint; file_size: any; scope_summary: any; created_at: Date }>(
    d: T,
  ) {
    return {
      ...d,
      id: d.id.toString(),
      file_size: d.file_size ? Number(d.file_size) : null,
      scope_summary: d.scope_summary ?? {},
      created_at: d.created_at.toISOString(),
    };
  }
}
