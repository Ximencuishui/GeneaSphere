import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@geneasphere/db';
import { htmlToRules, rulesToHtml } from '../cepu/clan-rules';
import { CATALOG_SLOTS, inferCatalogSlot, isCatalogSlot, slotDef } from './catalog-slots';
import { saveXiupu } from '../genealogy-workflow/xiupu-settings';

type Tx = Prisma.TransactionClient;

const WRITE_BLOCKED = '谱已定稿。请在定稿谱上提勘误，或先开始下一轮修谱。';

const BIO_KEYS = [
  'courtesy_name', 'native_place', 'burial_place', 'achievements', 'anecdotes', 'biography',
  'marital_notes', 'adoption_note', 'generation_char',
] as const;

@Injectable()
export class GenealogyEditionService {
  constructor(private readonly prisma: PrismaService) {}

  async published(clanId: bigint) {
    return this.prisma.genealogyEdition.findFirst({
      where: { clan_id: clanId, status: 'published' },
    });
  }

  async draft(clanId: bigint) {
    return this.prisma.genealogyEdition.findFirst({
      where: { clan_id: clanId, status: 'draft' },
    });
  }

  /** 族谱读快照：已有定稿，且这次不是修谱稿入口。 */
  async shouldReadSnapshot(clanId: bigint, draftRequested = false) {
    const published = await this.published(clanId);
    if (!published) return false;
    if (!draftRequested) return true;
    const draft = await this.draft(clanId);
    if (!draft) throw new ConflictException('请先开始下一轮修谱');
    return false;
  }

  async assertWritable(clanId: bigint) {
    const published = await this.published(clanId);
    if (!published) return;
    const draft = await this.draft(clanId);
    if (!draft) throw new ConflictException(WRITE_BLOCKED);
  }

  async state(clanId: bigint) {
    const [published, draft] = await Promise.all([this.published(clanId), this.draft(clanId)]);
    const liveHash = published ? await this.hashLive(clanId) : '';
    return {
      published: published
        ? {
            id: published.id.toString(),
            version_name: published.version_name,
            version_number: published.version_number,
            content_hash: published.content_hash,
          }
        : null,
      draft: draft
        ? {
            id: draft.id.toString(),
            version_name: draft.version_name,
            diverged: draft.diverged,
            opened_at: draft.opened_at,
            project_submitted_at: draft.project_submitted_at,
            digitize_confirmed_at: draft.digitize_confirmed_at,
            review_confirmed_at: draft.review_confirmed_at,
            revise_confirmed_at: draft.revise_confirmed_at,
          }
        : null,
      writable: !published || Boolean(draft),
      hash_matches: published ? liveHash === published.content_hash : true,
    };
  }

  async confirm(clanId: bigint, userId: string, stage: 'project' | 'digitize' | 'review' | 'revise') {
    await this.assertWritable(clanId);
    const edition = await this.ensureWorkingEdition(clanId, userId);
    const now = new Date();
    const data =
      stage === 'project'
        ? { project_submitted_at: edition.project_submitted_at ?? now }
        : stage === 'digitize'
          ? { digitize_confirmed_at: now }
          : stage === 'review'
            ? { review_confirmed_at: now }
            : { revise_confirmed_at: now };
    if (stage === 'review') {
      const open = await this.openReviewRejections(clanId);
      if (open > 0) throw new BadRequestException('还有未处理的驳回，修订后再确认初审');
    }
    if (stage === 'revise') {
      const pending = await this.prisma.personModificationRequest.count({
        where: { clan_id: clanId, status: 'PENDING', revision_edition_id: edition.id },
      });
      if (pending > 0) throw new BadRequestException('还有未审核的勘误，处理完再确认');
    }
    await this.prisma.genealogyEdition.update({ where: { id: edition.id }, data });
    return this.state(clanId);
  }

  async openRound(clanId: bigint, userId: string, choice?: 'overwrite' | 'keep') {
    const published = await this.published(clanId);
    if (!published) throw new BadRequestException('还没有定稿，直接在现有谱稿上修');
    const existing = await this.draft(clanId);
    if (existing) return this.state(clanId);
    const liveHash = await this.hashLive(clanId);
    const same = liveHash === published.content_hash;
    if (!same && !choice) throw new ConflictException('HASH_MISMATCH');
    if (!same && choice === 'overwrite') {
      await this.prisma.$transaction(async (tx) => {
        await this.freezeBackup(tx, clanId, userId, published.id);
        await this.restoreLiveFromEdition(tx, clanId, published.id);
      }, { timeout: 120000, maxWait: 20000 });
    }
    const latest = await this.prisma.genealogyEdition.findFirst({
      where: { clan_id: clanId },
      orderBy: { version_number: 'desc' },
      select: { version_number: true },
    });
    const nextNumber = (latest?.version_number ?? published.version_number) + 1;
    const created = await this.prisma.genealogyEdition.create({
      data: {
        clan_id: clanId,
        version_number: nextNumber,
        version_name: `${published.version_name} · 修订`,
        status: 'draft',
        based_on_edition_id: published.id,
        book_profile: published.book_profile,
        rules_text: published.rules_text,
        cover_json: published.cover_json ?? undefined,
        content_hash: '',
        diverged: !same && choice === 'keep',
        opened_at: new Date(),
        opened_by: userId,
      },
    });
    await this.bindPendingToDraft(clanId, created.id, published.id);
    await saveXiupu(this.prisma, clanId, (current) => ({
      ...current,
      lock: null,
      suspended: current.suspended.filter((key) => key !== 'digitize'),
    }));
    return this.state(clanId);
  }

  /** 终审事务内调用。失败会让整笔定稿回滚。 */
  async publish(tx: Tx, clanId: bigint, userId: string, documentId: bigint, versionName: string) {
    const currentPublished = await tx.genealogyEdition.findFirst({
      where: { clan_id: clanId, status: 'published' },
    });
    if (currentPublished) {
      await tx.genealogyEdition.update({
        where: { id: currentPublished.id },
        data: { status: 'superseded' },
      });
    }
    let edition = await tx.genealogyEdition.findFirst({
      where: { clan_id: clanId, status: 'draft' },
    });
    const hash = await this.hashLive(clanId, tx);
    const clan = await tx.clan.findUnique({
      where: { id: clanId },
      select: { name: true, slogan: true, origin_place: true, cover_url: true, rules: true, settings_json: true },
    });
    const profile = (clan?.settings_json as { cepu_book_profile?: string } | null)?.cepu_book_profile === 'standard'
      ? 'standard'
      : 'compact';
    const cover = {
      name: clan?.name ?? '',
      hall: clan?.slogan ?? '',
      place: clan?.origin_place ?? '',
      cover_url: clan?.cover_url ?? '',
      year: `公元${new Date().getFullYear()}年重修`,
    };
    if (!edition) {
      const latest = await tx.genealogyEdition.findFirst({
        where: { clan_id: clanId },
        orderBy: { version_number: 'desc' },
        select: { version_number: true },
      });
      edition = await tx.genealogyEdition.create({
        data: {
          clan_id: clanId,
          version_number: (latest?.version_number ?? 0) + 1,
          version_name: versionName,
          status: 'draft',
          opened_at: new Date(),
          opened_by: userId,
        },
      });
    }
    await this.fillSnapshot(tx, edition.id, clanId);
    await tx.genealogyEdition.update({
      where: { id: edition.id },
      data: {
        status: 'published',
        version_name: versionName,
        genealogy_document_id: documentId,
        book_profile: profile,
        rules_text: clan?.rules ?? null,
        cover_json: cover,
        content_hash: hash,
        published_at: new Date(),
        published_by: userId,
        diverged: false,
      },
    });
  }

  async attachReadyDocument(clanId: bigint, documentId: bigint) {
    const published = await this.published(clanId);
    if (!published) return;
    const doc = await this.prisma.genealogyDocument.findUnique({
      where: { id: documentId },
      select: { file_url: true, storage_status: true, clan_id: true },
    });
    if (!doc || doc.clan_id !== clanId || !doc.file_url || doc.storage_status !== 'READY') return;
    await this.prisma.genealogyEdition.update({
      where: { id: published.id },
      data: { genealogy_document_id: documentId },
    });
  }

  async roundForWorkflow(clanId: bigint) {
    const [published, draft] = await Promise.all([this.published(clanId), this.draft(clanId)]);
    const betweenRounds = Boolean(published) && !draft;
    const round = draft;
    let renderReady = false;
    let printReady = false;
    const docId = published?.genealogy_document_id;
    if (docId) {
      const doc = await this.prisma.genealogyDocument.findUnique({
        where: { id: docId },
        select: { file_url: true, storage_status: true },
      });
      renderReady = Boolean(doc?.file_url) && doc?.storage_status === 'READY';
      if (renderReady) {
        const jobs = await this.prisma.genealogyPrintJob.count({ where: { document_id: docId } });
        printReady = jobs > 0;
      }
    }
    const openReviews = round ? await this.openReviewRejections(clanId) : 0;
    const openedAt = round?.opened_at ?? null;
    const noticeCount = round
      ? await this.prisma.crowdsourceNotice.count({
          where: {
            clan_id: clanId,
            status: { in: ['sent', 'closed'] },
            ...(openedAt ? { created_at: { gte: openedAt } } : {}),
          },
        })
      : 0;
    const pendingErrata = round
      ? await this.prisma.personModificationRequest.count({
          where: { clan_id: clanId, status: 'PENDING', revision_edition_id: round.id },
        })
      : 0;
    return {
      hasRound: Boolean(round),
      betweenRounds,
      openedAt,
      projectSubmitted: Boolean(round?.project_submitted_at),
      digitizeConfirmed: Boolean(round?.digitize_confirmed_at),
      reviewConfirmed: Boolean(round?.review_confirmed_at) && openReviews === 0,
      reviseConfirmed: Boolean(round?.revise_confirmed_at) && pendingErrata === 0,
      noticeCount,
      renderReady: betweenRounds && renderReady,
      printReady: betweenRounds && printReady,
      publishedId: published?.id ?? null,
    };
  }

  async listVolumes(clanId: bigint) {
    const published = await this.published(clanId);
    if (!published) return null;
    const rows = await this.prisma.genealogyEditionVolume.findMany({
      where: { edition_id: published.id },
      orderBy: { sort_order: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      clan_id: clanId,
      sort_order: row.sort_order,
      title: row.title,
      type: row.type,
      content: row.content,
      config: row.config,
      catalog_slot: row.catalog_slot,
      created_by: 'edition',
    }));
  }

  async readVolume(clanId: bigint, volumeId: bigint) {
    const published = await this.published(clanId);
    if (!published) return null;
    const volume = await this.prisma.genealogyEditionVolume.findFirst({
      where: { id: volumeId, edition_id: published.id },
    });
    if (!volume) return null;
    if (volume.type === 'document') {
      const rulesText = volume.catalog_slot === 'rules-jiaxun'
        ? (published.rules_text ?? htmlToRules(volume.content ?? ''))
        : undefined;
      return {
        id: volume.id.toString(),
        title: volume.title,
        type: volume.type,
        catalog_slot: volume.catalog_slot,
        content: rulesText ? rulesToHtml(rulesText) : (volume.content ?? ''),
        rulesText,
      };
    }
    const entries = await this.snapshotShilu(published.id, (volume.config as { gender_filter?: string; layout?: string } | null) ?? {});
    return {
      id: volume.id.toString(),
      title: volume.title,
      type: volume.type,
      catalog_slot: volume.catalog_slot,
      config: volume.config,
      entries,
    };
  }

  /** 旧谱：已定稿且 PDF 就绪的版本，以及旧谱电子化上传的原件。 */
  async listPublishedPdfs(clanId: bigint) {
    const [editions, sources] = await Promise.all([
      this.prisma.genealogyEdition.findMany({
        where: {
          clan_id: clanId,
          status: { in: ['published', 'superseded'] },
          document: { storage_status: 'READY', file_url: { not: null } },
        },
        include: {
          document: {
            include: {
              print_jobs: { orderBy: { created_at: 'desc' }, take: 1 },
            },
          },
        },
        orderBy: { published_at: 'desc' },
      }),
      this.prisma.pdfImportTask.findMany({
        where: { clan_id: clanId, file_url: { not: null } },
        orderBy: { created_at: 'desc' },
      }),
    ]);
    const sourceIds = sources.map((task) => task.id);
    const sourceJobs = sourceIds.length
      ? await this.prisma.genealogyPrintJob.findMany({
          where: { clan_id: clanId, source_task_id: { in: sourceIds } },
          orderBy: { created_at: 'desc' },
        })
      : [];
    const latestSourceJob = new Map<string, (typeof sourceJobs)[number]>();
    for (const job of sourceJobs) {
      if (job.source_task_id && !latestSourceJob.has(job.source_task_id)) latestSourceJob.set(job.source_task_id, job);
    }
    const editionRows = editions.flatMap((edition) => {
      const doc = edition.document;
      if (!doc?.file_url) return [];
      const job = doc.print_jobs[0];
      return [{
        kind: 'edition' as const,
        title: edition.version_name,
        origin: edition.status === 'published' ? '当前定稿' : '以往定稿',
        at: edition.published_at,
        document_id: doc.id.toString(),
        task_id: null as string | null,
        file_url: doc.file_url,
        page_count: doc.page_count,
        file_size: doc.file_size?.toString() ?? null,
        print_job: job ? { id: job.id.toString(), status: job.status } : null,
      }];
    });
    const sourceRows = sources.flatMap((task) => {
      if (!task.file_url) return [];
      const job = latestSourceJob.get(task.id);
      return [{
        kind: 'source' as const,
        title: task.file_name,
        origin: '旧谱电子化',
        at: task.created_at,
        document_id: null as string | null,
        task_id: task.id,
        file_url: null as string | null,
        page_count: task.total_pages || null,
        file_size: task.file_size?.toString() ?? null,
        print_job: job ? { id: job.id.toString(), status: job.status } : null,
      }];
    });
    return [...editionRows, ...sourceRows].sort((a, b) => {
      const left = a.at ? new Date(a.at).getTime() : 0;
      const right = b.at ? new Date(b.at).getTime() : 0;
      return right - left;
    });
  }

  async openSourcePdf(clanId: bigint, taskId: string) {
    const task = await this.prisma.pdfImportTask.findFirst({
      where: { id: taskId, clan_id: clanId },
      select: { file_name: true, file_url: true },
    });
    if (!task?.file_url) throw new NotFoundException('原始 PDF 不存在');
    const abs = this.resolveSourcePdf(task.file_url, clanId);
    if (!existsSync(abs)) throw new NotFoundException('原始 PDF 不存在');
    return { abs, fileName: task.file_name || '旧谱.pdf' };
  }

  async createSourcePrintJob(clanId: bigint, userId: string, taskId: string) {
    const task = await this.prisma.pdfImportTask.findFirst({
      where: { id: taskId, clan_id: clanId },
    });
    if (!task?.file_url) throw new NotFoundException('原始 PDF 不存在');
    const abs = this.resolveSourcePdf(task.file_url, clanId);
    if (!existsSync(abs)) throw new NotFoundException('原始 PDF 不存在');
    const job = await this.prisma.genealogyPrintJob.create({
      data: {
        clan_id: clanId,
        source_task_id: task.id,
        user_id: userId,
        status: 'PENDING',
        document_generated_at: task.created_at,
        layout_params: { version_name: task.file_name, source: 'digitize' },
      },
    });
    return { id: job.id.toString(), status: job.status };
  }

  private resolveSourcePdf(fileUrl: string, clanId: bigint) {
    const rel = fileUrl.replace(/\\/g, '/').replace(/^\/+/, '');
    const root = path.resolve(process.cwd(), 'uploads', 'pdf-import', clanId.toString());
    if (!rel.startsWith(`uploads/pdf-import/${clanId.toString()}/`)) {
      throw new BadRequestException('非法文件路径');
    }
    const abs = path.resolve(process.cwd(), ...rel.split('/'));
    const relative = path.relative(root, abs);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException('非法文件路径');
    }
    return abs;
  }

  async publishedCover(clanId: bigint) {
    const published = await this.published(clanId);
    if (!published) return null;
    const cover = (published.cover_json as { name?: string; hall?: string; place?: string; year?: string } | null) ?? {};
    return {
      profile: published.book_profile === 'standard' ? 'standard' : 'compact',
      cover: {
        name: cover.name || '族谱',
        hall: cover.hall || '',
        volume: '全卷',
        year: cover.year || '',
        place: cover.place || '',
      },
      rules: published.rules_text ?? '',
    };
  }

  async publishedXipai(clanId: bigint) {
    const published = await this.published(clanId);
    if (!published) return null;
    const rows = await this.prisma.genealogyEditionXipai.findMany({
      where: { edition_id: published.id },
      orderBy: { generation: 'asc' },
    });
    return rows.map((row) => ({ generation: row.generation, character: row.character, note: row.note }));
  }

  async buildTree(clanId: bigint) {
    const published = await this.published(clanId);
    if (!published) throw new NotFoundException('没有已发布的族谱');
    const [personRows, links] = await Promise.all([
      this.prisma.genealogyEditionPerson.findMany({ where: { edition_id: published.id } }),
      this.prisma.genealogyEditionLink.findMany({ where: { edition_id: published.id } }),
    ]);
    const people = new Map(personRows.map((row) => [row.source_person_id.toString(), row.payload as SnapPerson]));
    const parentOf = new Map<string, string>();
    const childrenOf = new Map<string, { id: string; birth_order: number; child_type?: string; family_key?: string }[]>();
    const spousesOf = new Map<string, { id: string; marriage_order: number; union_type?: string; family_key?: string }[]>();
    const families = new Map<string, { husband?: string; wife?: string; marriage_order: number; union_type?: string }>();
    for (const link of links) {
      if (link.kind === 'spouse' && link.family_key) {
        families.set(link.family_key, {
          husband: link.left_person_id ? link.left_person_id.toString() : undefined,
          wife: link.right_person_id ? link.right_person_id.toString() : undefined,
          marriage_order: link.marriage_order ?? 1,
          union_type: link.union_type ?? undefined,
        });
      }
    }
    for (const link of links) {
      if (link.kind !== 'parent' || !link.family_key) continue;
      const family = families.get(link.family_key);
      const childId = link.right_person_id.toString();
      const father = family?.husband;
      const mother = family?.wife;
      const treeParent = father || mother;
      if (!treeParent || !people.has(childId)) continue;
      if (!parentOf.has(childId)) parentOf.set(childId, treeParent);
      const list = childrenOf.get(treeParent) ?? [];
      list.push({
        id: childId,
        birth_order: link.birth_order ?? 0,
        child_type: link.child_type ?? undefined,
        family_key: link.family_key,
      });
      childrenOf.set(treeParent, list);
    }
    for (const [key, family] of families) {
      if (family.husband && family.wife) {
        const push = (from: string, to: string) => {
          const list = spousesOf.get(from) ?? [];
          list.push({ id: to, marriage_order: family.marriage_order, union_type: family.union_type, family_key: key });
          spousesOf.set(from, list);
        };
        push(family.husband, family.wife);
        push(family.wife, family.husband);
      }
    }
    const roots = [...people.keys()].filter((id) => !parentOf.has(id));
    const rootId = roots.sort()[0];
    if (!rootId) throw new NotFoundException('定稿谱里没有人物');
    const visit = new Set<string>();
    const toNode = (id: string): any => {
      if (visit.has(id)) return null;
      visit.add(id);
      const person = people.get(id);
      if (!person) return null;
      const kids = (childrenOf.get(id) ?? []).sort((a, b) => a.birth_order - b.birth_order);
      const childNodes = kids.map((kid) => toNode(kid.id)).filter(Boolean);
      const spouses = (spousesOf.get(id) ?? []).map((spouse) => {
        const other = people.get(spouse.id);
        return {
          id: spouse.id,
          name: other?.full_name ?? '',
          full_name: other?.full_name ?? '',
          gender: other?.gender ?? 'female',
          family_id: spouse.family_key ?? spouse.id,
          marriage_order: spouse.marriage_order,
          is_current: true,
          union_type: spouse.union_type ?? 'normal',
          is_living: other?.is_living ?? true,
        };
      });
      return {
        id,
        name: person.full_name,
        gender: person.gender,
        birth_date: person.birth_date,
        death_date: person.death_date,
        is_living: person.is_living,
        avatar_url: person.avatar_url,
        thumbnail_url: person.thumbnail_url,
        has_photo: Boolean(person.avatar_url),
        birth_place: person.birth_place,
        migration_branch: person.migration_branch,
        native_place: person.bio?.native_place ?? null,
        generation_word: person.bio?.generation_char ?? null,
        children: childNodes,
        spouses,
        child_links: kids.map((kid) => ({
          child_id: kid.id,
          birth_order: kid.birth_order,
          child_type: kid.child_type,
          family_id: kid.family_key,
        })),
      };
    };
    const rootNode = toNode(rootId);
    const main: string[] = [];
    let cursor: any = rootNode;
    while (cursor) {
      main.push(cursor.id);
      cursor.is_main_lineage = true;
      cursor = cursor.children?.[0];
    }
    const spouseEdges: { from: string; to: string; order: number; is_current: boolean }[] = [];
    for (const family of families.values()) {
      if (family.husband && family.wife) {
        spouseEdges.push({
          from: family.husband,
          to: family.wife,
          order: family.marriage_order,
          is_current: true,
        });
      }
    }
    return {
      rootNode,
      mainLineage: main,
      totalPersons: people.size,
      spouseEdges,
      published: true,
    };
  }

  async ensureSlots(clanId: bigint, userId: string) {
    await this.assertWritable(clanId);
    const volumes = await this.prisma.bookVolume.findMany({
      where: { clan_id: clanId },
      orderBy: { sort_order: 'asc' },
    });
    const used = new Set(volumes.map((volume) => volume.catalog_slot).filter(Boolean) as string[]);
    for (const volume of volumes) {
      if (volume.catalog_slot) continue;
      const inferred = inferCatalogSlot(volume.title, volume.type, volume.config as { layout?: string; gender_filter?: string } | null);
      if (!inferred || used.has(inferred)) continue;
      await this.prisma.bookVolume.update({
        where: { id: volume.id },
        data: { catalog_slot: inferred },
      });
      volume.catalog_slot = inferred;
      used.add(inferred);
    }
    let order = volumes.reduce((max, volume) => Math.max(max, volume.sort_order), 0);
    for (const slot of CATALOG_SLOTS) {
      if (used.has(slot.key)) continue;
      order += 1;
      await this.prisma.bookVolume.create({
        data: {
          clan_id: clanId,
          sort_order: order,
          title: slot.title,
          type: slot.type,
          catalog_slot: slot.key,
          content: slot.type === 'document' ? '' : null,
          config: 'config' in slot ? slot.config : undefined,
          created_by: userId,
        },
      });
    }
    return this.prisma.bookVolume.findMany({
      where: { clan_id: clanId },
      orderBy: { sort_order: 'asc' },
    });
  }

  async upsertSlot(clanId: bigint, userId: string, slot: string, body: { content?: string; config?: unknown }) {
    if (!isCatalogSlot(slot)) throw new BadRequestException('未知目录槽');
    await this.assertWritable(clanId);
    await this.ensureSlots(clanId, userId);
    const def = slotDef(slot)!;
    const volume = await this.prisma.bookVolume.findFirst({
      where: { clan_id: clanId, catalog_slot: slot },
    });
    if (!volume) throw new NotFoundException('目录槽不存在');
    if (def.type === 'document') {
      let content = body.content ?? '';
      if (slot === 'rules-jiaxun') {
        const plain = htmlToRules(content);
        content = plain ? rulesToHtml(plain) : '';
        await this.prisma.clan.update({ where: { id: clanId }, data: { rules: plain || null } });
      }
      return this.prisma.bookVolume.update({
        where: { id: volume.id },
        data: { content },
      });
    }
    return this.prisma.bookVolume.update({
      where: { id: volume.id },
      data: { config: (body.config ?? volume.config ?? undefined) as Prisma.InputJsonValue },
    });
  }

  async fileErrata(
    clanId: bigint,
    userId: string,
    body: {
      target_kind?: string;
      field_name: string;
      new_value: string;
      old_value?: string;
      reason?: string;
      person_id?: string;
      catalog_slot?: string;
      target_ref?: string;
    },
  ) {
    const kind = body.target_kind || 'person';
    if (!body.new_value?.trim()) throw new BadRequestException('请填写拟改内容');
    if (!body.reason?.trim()) throw new BadRequestException('请填写勘误说明');
    const [published, draft] = await Promise.all([this.published(clanId), this.draft(clanId)]);
    if (kind === 'person' || kind === 'biography') {
      if (!body.person_id) throw new BadRequestException('请指定人物');
    }
    if (kind === 'volume' && !isCatalogSlot(body.catalog_slot || '')) {
      throw new BadRequestException('请指定卷宗槽位');
    }
    const created = await this.prisma.personModificationRequest.create({
      data: {
        clan_id: clanId,
        person_id: body.person_id ? BigInt(body.person_id) : null,
        requester_user_id: userId,
        field_name: body.field_name,
        old_value: body.old_value,
        new_value: body.new_value.trim(),
        reason: body.reason.trim(),
        target_kind: kind,
        target_ref: body.target_ref,
        catalog_slot: body.catalog_slot,
        filed_edition_id: published?.id,
        revision_edition_id: draft?.id,
      },
    });
    return { id: created.id.toString(), status: created.status };
  }

  async applyRequest(tx: Tx, record: {
    id: bigint;
    clan_id: bigint;
    person_id: bigint | null;
    field_name: string;
    new_value: string;
    target_kind: string;
    target_ref: string | null;
    catalog_slot: string | null;
  }) {
    if (record.field_name === 'extra_info') {
      const parts = record.new_value.split('；');
      for (const part of parts) {
        const text = part.trim();
        if (text.startsWith('字辈：')) await this.applyPersonField(tx, record.person_id!, 'generation_char', text.slice(3));
        else if (text.startsWith('联系电话：')) await this.applyPersonField(tx, record.person_id!, 'contact_phone', text.slice(5));
        else if (text.startsWith('生平简介：')) await this.applyPersonField(tx, record.person_id!, 'biography', text.slice(5));
      }
      await tx.personModificationRequest.update({ where: { id: record.id }, data: { applied_at: new Date() } });
      return;
    }
    const kind = record.target_kind || 'person';
    if (kind === 'volume' && record.catalog_slot) {
      const volume = await tx.bookVolume.findFirst({
        where: { clan_id: record.clan_id, catalog_slot: record.catalog_slot },
      });
      if (!volume) throw new BadRequestException('稿上还没有这一卷');
      await tx.bookVolume.update({ where: { id: volume.id }, data: { content: record.new_value } });
    } else if (kind === 'rules') {
      const plain = htmlToRules(record.new_value) || record.new_value;
      await tx.clan.update({ where: { id: record.clan_id }, data: { rules: plain } });
      const volume = await tx.bookVolume.findFirst({
        where: { clan_id: record.clan_id, catalog_slot: 'rules-jiaxun' },
      });
      if (volume) {
        await tx.bookVolume.update({ where: { id: volume.id }, data: { content: rulesToHtml(plain) } });
      }
    } else if (kind === 'xipai') {
      const generation = Number(record.target_ref);
      if (!Number.isInteger(generation)) throw new BadRequestException('字辈世代无效');
      const existing = await tx.xipai.findFirst({
        where: { clan_id: record.clan_id, generation },
      });
      if (existing) {
        await tx.xipai.update({
          where: { id: existing.id },
          data: record.field_name === 'note' ? { note: record.new_value } : { character: record.new_value },
        });
      } else {
        await tx.xipai.create({
          data: {
            clan_id: record.clan_id,
            generation,
            character: record.field_name === 'note' ? '' : record.new_value,
            note: record.field_name === 'note' ? record.new_value : null,
          },
        });
      }
    } else if (record.person_id) {
      await this.applyPersonField(tx, record.person_id, record.field_name, record.new_value);
    }
    await tx.personModificationRequest.update({
      where: { id: record.id },
      data: { applied_at: new Date() },
    });
  }

  async bindPendingToDraft(clanId: bigint, draftId: bigint, publishedId: bigint) {
    await this.prisma.personModificationRequest.updateMany({
      where: {
        clan_id: clanId,
        status: 'PENDING',
        revision_edition_id: null,
        OR: [{ filed_edition_id: publishedId }, { filed_edition_id: null }],
      },
      data: { revision_edition_id: draftId },
    });
  }

  private async applyPersonField(tx: Tx, personId: bigint, field: string, value: string) {
    if (field === 'full_name') {
      await tx.person.update({ where: { id: personId }, data: { full_name: value } });
      return;
    }
    if (field === 'gender') {
      await tx.person.update({
        where: { id: personId },
        data: { gender: value === 'female' ? 'female' : 'male' },
      });
      return;
    }
    if (field === 'birth_year') {
      const year = parseInt(value, 10);
      if (!Number.isNaN(year)) {
        await tx.person.update({ where: { id: personId }, data: { birth_date: new Date(`${year}-01-01`) } });
      }
      return;
    }
    if (field === 'birth_place' || field === 'death_place') {
      await tx.person.update({ where: { id: personId }, data: { [field]: value } });
      return;
    }
    const bioField = field === 'biography' || (BIO_KEYS as readonly string[]).includes(field) || field === 'contact_phone' || field === 'generation_char'
      ? field
      : null;
    if (!bioField) return;
    await tx.personBio.upsert({
      where: { person_id: personId },
      create: { person_id: personId, [bioField]: value },
      update: { [bioField]: value },
    });
  }

  private async openReviewRejections(clanId: bigint) {
    const rows = await this.prisma.$queryRaw<Array<{ status: string }>>`
      SELECT DISTINCT ON (br.person_id) br.status::text AS status
      FROM bio_reviews br
      INNER JOIN persons p ON p.id = br.person_id
      WHERE p.clan_id = ${clanId}
      ORDER BY br.person_id, br.reviewed_at DESC NULLS LAST, br.created_at DESC
    `;
    return rows.filter((row) => row.status === 'REJECTED').length;
  }

  private async ensureWorkingEdition(clanId: bigint, userId: string) {
    const draft = await this.draft(clanId);
    if (draft) return draft;
    const published = await this.published(clanId);
    if (published) throw new ConflictException(WRITE_BLOCKED);
    const latest = await this.prisma.genealogyEdition.findFirst({
      where: { clan_id: clanId },
      orderBy: { version_number: 'desc' },
      select: { version_number: true },
    });
    return this.prisma.genealogyEdition.create({
      data: {
        clan_id: clanId,
        version_number: (latest?.version_number ?? 0) + 1,
        version_name: '本轮修谱',
        status: 'draft',
        opened_at: new Date(),
        opened_by: userId,
      },
    });
  }

  private async freezeBackup(tx: Tx, clanId: bigint, userId: string, basedOn: bigint) {
    const latest = await tx.genealogyEdition.findFirst({
      where: { clan_id: clanId },
      orderBy: { version_number: 'desc' },
      select: { version_number: true },
    });
    const backup = await tx.genealogyEdition.create({
      data: {
        clan_id: clanId,
        version_number: (latest?.version_number ?? 0) + 1,
        version_name: '覆盖前备份',
        status: 'backup',
        based_on_edition_id: basedOn,
        opened_by: userId,
        opened_at: new Date(),
      },
    });
    await this.fillSnapshot(tx, backup.id, clanId);
    const hash = await this.hashLive(clanId, tx);
    await tx.genealogyEdition.update({ where: { id: backup.id }, data: { content_hash: hash } });
  }

  private async fillSnapshot(tx: Tx, editionId: bigint, clanId: bigint) {
    await tx.genealogyEditionVolume.deleteMany({ where: { edition_id: editionId } });
    await tx.genealogyEditionPerson.deleteMany({ where: { edition_id: editionId } });
    await tx.genealogyEditionLink.deleteMany({ where: { edition_id: editionId } });
    await tx.genealogyEditionXipai.deleteMany({ where: { edition_id: editionId } });
    const volumes = await tx.bookVolume.findMany({ where: { clan_id: clanId }, orderBy: { sort_order: 'asc' } });
    if (volumes.length) {
      await tx.genealogyEditionVolume.createMany({
        data: volumes.map((volume) => ({
          edition_id: editionId,
          catalog_slot: volume.catalog_slot ?? inferCatalogSlot(volume.title, volume.type, volume.config as { layout?: string; gender_filter?: string } | null),
          sort_order: volume.sort_order,
          title: volume.title,
          type: volume.type,
          content: volume.content,
          config: volume.config ?? undefined,
          source_volume_id: volume.id,
        })),
      });
    }
    const persons = await tx.person.findMany({
      where: { clan_id: clanId, deleted_at: null },
      include: { bio: true },
    });
    for (let i = 0; i < persons.length; i += 200) {
      const slice = persons.slice(i, i + 200);
      await tx.genealogyEditionPerson.createMany({
        data: slice.map((person) => ({
          edition_id: editionId,
          source_person_id: person.id,
          payload: this.personPayload(person) as Prisma.InputJsonValue,
        })),
      });
    }
    const units = await tx.familyUnit.findMany({
      where: { clan_id: clanId },
      include: { children: true },
    });
    const linkRows: Prisma.GenealogyEditionLinkCreateManyInput[] = [];
    for (const unit of units) {
      const key = unit.id.toString();
      if (unit.husband_id && unit.wife_id) {
        linkRows.push({
          edition_id: editionId,
          kind: 'spouse',
          left_person_id: unit.husband_id,
          right_person_id: unit.wife_id,
          family_key: key,
          marriage_order: unit.marriage_order,
          union_type: unit.union_type,
        });
      }
      for (const child of unit.children) {
        linkRows.push({
          edition_id: editionId,
          kind: 'parent',
          left_person_id: unit.husband_id ?? unit.wife_id ?? child.child_id,
          right_person_id: child.child_id,
          family_key: key,
          birth_order: child.birth_order,
          child_type: child.child_type,
        });
      }
    }
    for (let i = 0; i < linkRows.length; i += 200) {
      await tx.genealogyEditionLink.createMany({ data: linkRows.slice(i, i + 200) });
    }
    const xipai = await tx.xipai.findMany({ where: { clan_id: clanId }, orderBy: { generation: 'asc' } });
    if (xipai.length) {
      await tx.genealogyEditionXipai.createMany({
        data: xipai.map((row) => ({
          edition_id: editionId,
          generation: row.generation,
          character: row.character,
          note: row.note,
        })),
      });
    }
  }

  private async restoreLiveFromEdition(tx: Tx, clanId: bigint, editionId: bigint) {
    const volumes = await tx.genealogyEditionVolume.findMany({ where: { edition_id: editionId }, orderBy: { sort_order: 'asc' } });
    const persons = await tx.genealogyEditionPerson.findMany({ where: { edition_id: editionId } });
    const links = await tx.genealogyEditionLink.findMany({ where: { edition_id: editionId } });
    const xipai = await tx.genealogyEditionXipai.findMany({ where: { edition_id: editionId } });
    const edition = await tx.genealogyEdition.findUnique({ where: { id: editionId } });
    const kept = new Set<bigint>();
    for (const volume of volumes) {
      if (!volume.source_volume_id) continue;
      const existing = await tx.bookVolume.findFirst({ where: { id: volume.source_volume_id, clan_id: clanId } });
      if (!existing) continue;
      await tx.bookVolume.update({
        where: { id: existing.id },
        data: {
          title: volume.title,
          type: volume.type,
          content: volume.content,
          config: volume.config ?? undefined,
          catalog_slot: volume.catalog_slot,
          sort_order: volume.sort_order,
        },
      });
      kept.add(existing.id);
    }
    const liveVolumes = await tx.bookVolume.findMany({ where: { clan_id: clanId }, select: { id: true } });
    const drop = liveVolumes.filter((volume) => !kept.has(volume.id)).map((volume) => volume.id);
    if (drop.length) await tx.bookVolume.deleteMany({ where: { id: { in: drop } } });
    const sourceIds: bigint[] = [];
    for (const row of persons) {
      const payload = row.payload as SnapPerson;
      const existing = await tx.person.findFirst({ where: { id: row.source_person_id, clan_id: clanId } });
      if (!existing) continue;
      sourceIds.push(existing.id);
      await tx.person.update({
        where: { id: existing.id },
        data: {
          full_name: payload.full_name,
          gender: payload.gender === 'female' ? 'female' : 'male',
          birth_date: payload.birth_date ? new Date(payload.birth_date) : null,
          death_date: payload.death_date ? new Date(payload.death_date) : null,
          is_living: payload.is_living,
          birth_place: payload.birth_place,
          death_place: payload.death_place,
          avatar_url: payload.avatar_url,
          thumbnail_url: payload.thumbnail_url,
          migration_branch: payload.migration_branch,
          deleted_at: null,
        },
      });
      if (payload.bio) {
        await tx.personBio.upsert({
          where: { person_id: existing.id },
          create: { person_id: existing.id, ...payload.bio },
          update: payload.bio,
        });
      }
    }
    if (sourceIds.length) {
      await tx.person.updateMany({
        where: { clan_id: clanId, deleted_at: null, id: { notIn: sourceIds } },
        data: { deleted_at: new Date() },
      });
    }
    const units = await tx.familyUnit.findMany({ where: { clan_id: clanId }, select: { id: true } });
    if (units.length) {
      await tx.familyChild.deleteMany({ where: { family_id: { in: units.map((unit) => unit.id) } } });
      await tx.familyUnit.deleteMany({ where: { clan_id: clanId } });
    }
    const familyIds = new Map<string, bigint>();
    for (const link of links.filter((item) => item.kind === 'spouse' && item.family_key)) {
      const created = await tx.familyUnit.create({
        data: {
          clan_id: clanId,
          husband_id: link.left_person_id,
          wife_id: link.right_person_id,
          marriage_order: link.marriage_order ?? 1,
          union_type: link.union_type ?? 'normal',
        },
      });
      familyIds.set(link.family_key!, created.id);
    }
    for (const link of links.filter((item) => item.kind === 'parent' && item.family_key)) {
      const familyId = familyIds.get(link.family_key!);
      if (!familyId) continue;
      await tx.familyChild.create({
        data: {
          family_id: familyId,
          child_id: link.right_person_id,
          birth_order: link.birth_order ?? 1,
          child_type: (link.child_type as 'BIOLOGICAL') || 'BIOLOGICAL',
        },
      });
    }
    await tx.xipai.deleteMany({ where: { clan_id: clanId } });
    if (xipai.length) {
      await tx.xipai.createMany({
        data: xipai.map((row) => ({
          clan_id: clanId,
          generation: row.generation,
          character: row.character,
          note: row.note,
        })),
      });
    }
    if (edition) {
      await tx.clan.update({ where: { id: clanId }, data: { rules: edition.rules_text } });
    }
  }

  private async snapshotShilu(editionId: bigint, config: { gender_filter?: string; layout?: string }) {
    const [personRows, links] = await Promise.all([
      this.prisma.genealogyEditionPerson.findMany({ where: { edition_id: editionId } }),
      this.prisma.genealogyEditionLink.findMany({ where: { edition_id: editionId, kind: 'parent' } }),
    ]);
    const people = personRows.map((row) => ({ id: row.source_person_id.toString(), ...(row.payload as SnapPerson) }));
    const byId = new Map(people.map((person) => [person.id, person]));
    const fatherOf = new Map<string, string>();
    for (const link of links) {
      fatherOf.set(link.right_person_id.toString(), link.left_person_id.toString());
    }
    const generation = new Map<string, number>();
    const depthOf = (id: string, guard = 0): number => {
      if (generation.has(id)) return generation.get(id)!;
      if (guard > 40) return 1;
      const parent = fatherOf.get(id);
      const value = parent && byId.has(parent) ? depthOf(parent, guard + 1) + 1 : 1;
      generation.set(id, value);
      return value;
    };
    people.forEach((person) => depthOf(person.id));
    const filter = config.gender_filter;
    return people
      .filter((person) => {
        if (filter === 'female') return person.gender === 'female';
        if (filter === 'male') return person.gender !== 'female';
        return true;
      })
      .map((person) => ({
        person_id: person.id,
        generation: (generation.get(person.id) ?? 1) - 1,
        full_name: person.full_name,
        gender: person.gender === 'female' ? 'female' as const : 'male' as const,
        courtesy_name: person.bio?.courtesy_name ?? undefined,
        is_living: person.is_living,
        native_place: person.bio?.native_place ?? undefined,
        burial_place: person.bio?.burial_place ?? undefined,
        achievements: person.bio?.achievements ?? undefined,
        anecdotes: person.bio?.anecdotes ?? undefined,
        biography: person.bio?.biography ?? undefined,
        adoption_note: person.bio?.adoption_note ?? undefined,
        father_name: byId.get(fatherOf.get(person.id) ?? '')?.full_name,
        father_id: fatherOf.get(person.id),
        spouses: [],
        children: [],
        premature: false,
      }));
  }

  private personPayload(person: {
    full_name: string;
    gender: string;
    birth_date: Date | null;
    death_date: Date | null;
    is_living: boolean;
    birth_place: string | null;
    death_place: string | null;
    avatar_url: string | null;
    thumbnail_url: string | null;
    migration_branch: string | null;
    bio: Record<string, unknown> | null;
  }): SnapPerson {
    const bio: SnapPerson['bio'] = {};
    for (const key of BIO_KEYS) {
      const value = person.bio?.[key];
      bio[key] = typeof value === 'string' ? value : null;
    }
    return {
      full_name: person.full_name,
      gender: person.gender,
      birth_date: person.birth_date ? person.birth_date.toISOString() : null,
      death_date: person.death_date ? person.death_date.toISOString() : null,
      is_living: person.is_living,
      birth_place: person.birth_place,
      death_place: person.death_place,
      avatar_url: person.avatar_url,
      thumbnail_url: person.thumbnail_url,
      migration_branch: person.migration_branch,
      bio,
    };
  }

  private async hashLive(clanId: bigint, tx: Tx | PrismaService = this.prisma) {
    const volumes = await tx.bookVolume.findMany({ where: { clan_id: clanId }, orderBy: { sort_order: 'asc' } });
    const persons = await tx.person.findMany({ where: { clan_id: clanId, deleted_at: null }, include: { bio: true }, orderBy: { id: 'asc' } });
    const units = await tx.familyUnit.findMany({ where: { clan_id: clanId }, include: { children: true }, orderBy: { id: 'asc' } });
    const xipai = await tx.xipai.findMany({ where: { clan_id: clanId }, orderBy: { generation: 'asc' } });
    const clan = await tx.clan.findUnique({ where: { id: clanId }, select: { rules: true, settings_json: true } });
    const body = {
      rules: clan?.rules ?? '',
      profile: (clan?.settings_json as { cepu_book_profile?: string } | null)?.cepu_book_profile ?? 'compact',
      volumes: volumes.map((volume) => ({
        id: volume.id.toString(),
        title: volume.title,
        type: volume.type,
        slot: volume.catalog_slot,
        content: volume.content ?? '',
        config: volume.config ?? null,
      })),
      persons: persons.map((person) => this.personPayload(person)),
      links: units.map((unit) => ({
        h: unit.husband_id?.toString() ?? '',
        w: unit.wife_id?.toString() ?? '',
        children: unit.children.map((child) => `${child.child_id}:${child.birth_order}`).sort(),
      })),
      xipai: xipai.map((row) => ({ g: row.generation, c: row.character, n: row.note ?? '' })),
    };
    return createHash('sha256').update(JSON.stringify(body)).digest('hex');
  }
}

type SnapPerson = {
  full_name: string;
  gender: string;
  birth_date: string | null;
  death_date: string | null;
  is_living: boolean;
  birth_place: string | null;
  death_place: string | null;
  avatar_url: string | null;
  thumbnail_url: string | null;
  migration_branch: string | null;
  bio: Record<string, string | null>;
};
