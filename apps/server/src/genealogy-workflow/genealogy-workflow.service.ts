import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { loadXiupu, saveXiupu, XIUPU_STAGE_KEYS, XiupuSettings } from './xiupu-settings';

/**
 * 修谱工作流状态推导（只读，不落库）：
 * 依据家族下真实业务数据（导入记录/OCR/校对/数据表/通知/修改申请/审核/谱书/印刷订单）
 * 推导"修谱全流程"各阶段的完成情况，供管理后台【控制台】与【修谱】顶部工作流条展示。
 *
 * 主流程 8 步（只按主节点算进度，子步骤不算进百分比）：
 *   1 新建族谱项目
 *   2 谱源录入 / 旧谱电子化（影像上传 → OCR识别 → 左右对照校勘 → 数据保存）
 *   3 内部初审
 *   4 下发族人勘误
 *   5 汇总勘误、修订谱稿（驳回可回流到这一步）
 *   6 终审定稿
 *   7 册谱版式渲染
 *   8 预览、印刷出谱
 */

export type WorkflowStageStatus = 'done' | 'current' | 'todo' | 'returned' | 'suspended';

export interface WorkflowSubStage {
  key: string;
  label: string;
  status: WorkflowStageStatus;
  count: number;
  /** 待办小红点，例如待审核勘误 */
  badge: number;
  detail: string;
  link: string;
}

export interface WorkflowStage {
  key: string;
  label: string;
  status: WorkflowStageStatus;
  /** 统计数量，展示在节点旁的小标签，不放进序号圆点 */
  count: number;
  badge: number;
  /** 勘误被驳回，需要回到修订环节 */
  returned?: boolean;
  detail: string;
  link: string;
  /** 与侧栏菜单 index 一致，点击后高亮这一项 */
  menu_path: string;
  /** 上一环节 key。严格串行时，上一环节不是 done 则本环节不可进入 */
  pre_condition?: string | null;
  /** 本环节驳回后要回到的节点 */
  reject_return_key?: string | null;
  /** 严格串行下被前置环节拦住 */
  blocked?: boolean;
  return_notice?: { reason: string; requirement: string } | null;
  /** 把流程打回本节点的环节名称，供悬停文案使用 */
  returned_from_label?: string | null;
  sub_stages?: WorkflowSubStage[];
}

export interface GenealogyWorkflowStatus {
  clan_id: string;
  clan_slug: string;
  clan_name: string;
  progress: number; // 0-100，returned 与 suspended 不计入
  done_count: number;
  total_count: number;
  mode: 'serial' | 'free';
  progress_paused: boolean;
  pedigree_locked: boolean;
  current_stage: string | null; // 当前进行中阶段 key（全部完成时为 null）
  current_label: string | null;
  stages: WorkflowStage[];
}

@Injectable()
export class GenealogyWorkflowService {
  private readonly logger = new Logger(GenealogyWorkflowService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStatus(clan: { id: bigint; slug: string; name: string }): Promise<GenealogyWorkflowStatus> {
    const clanId = clan.id;

    // ========== 一次性并行统计各数据源 ==========
    const [
      importLogCount, // 旧谱电子文档导入记录（PDF 导入 / 拍照件导入）
      ocrImportCount, // 走 OCR 通道的导入任务数
      correctedTempCount, // 左右对照已校对（is_corrected=true）的记录数
      saveLogCount, // 成功写入数据表的导入任务数
      personCount, // 族谱树已有族员数
      smsCount, // 短信发送记录数
      notificationCount, // 站内通知数
      crowdsourceNoticeCount, // 已发送/关闭的众包通知文案数
      modReqCount, // 族人勘误申请数
      modReqPendingCount, // 待主修审核的勘误
      modReqRejectedCount, // 已驳回、需要回到修订的勘误
      modReqReviewedCount, // 已审核（通过/驳回）的勘误
      bioReviewedCount, // 已审核的生平
      bioPendingCount, // 待初审的生平
      genealogyDocCount, // 已定稿的族谱版本
      bookVolumeCount, // 已生成的册谱卷
      printOrderCount, // 印刷订单
      bioRejectedCount,
      bioRejectRow,
      modRejectRow,
      xiupuBundle,
    ] = await Promise.all([
      this.prisma.pdfImportLog.count({ where: { clan_id: clanId } }),
      this.prisma.pdfImportLog.count({ where: { clan_id: clanId, parse_mode: 'ocr' } }),
      this.prisma.pdfParseTemp.count({
        where: { import_log: { clan_id: clanId }, is_corrected: true },
      }),
      this.prisma.pdfImportLog.count({
        where: { clan_id: clanId, success_records: { gt: 0 } },
      }),
      this.prisma.person.count({ where: { clan_id: clanId, deleted_at: null } }),
      this.prisma.smsSendRecord.count({ where: { clan_id: clanId } }),
      this.prisma.notification.count({ where: { clan_id: clanId } }),
      this.prisma.crowdsourceNotice.count({
        where: { clan_id: clanId, status: { in: ['sent', 'closed'] } },
      }),
      this.prisma.personModificationRequest.count({ where: { clan_id: clanId } }),
      this.prisma.personModificationRequest.count({ where: { clan_id: clanId, status: 'PENDING' } }),
      this.prisma.personModificationRequest.count({ where: { clan_id: clanId, status: 'REJECTED' } }),
      this.prisma.personModificationRequest.count({
        where: { clan_id: clanId, status: { in: ['APPROVED', 'REJECTED'] } },
      }),
      this.prisma.bioReview.count({
        where: { person: { clan_id: clanId }, status: { in: ['APPROVED', 'REJECTED'] } },
      }),
      this.prisma.bioReview.count({
        where: { person: { clan_id: clanId }, status: 'PENDING' },
      }),
      this.prisma.genealogyDocument.count({ where: { clan_id: clanId } }),
      this.prisma.bookVolume.count({ where: { clan_id: clanId } }),
      this.prisma.printOrder.count({ where: { clan_id: clanId } }),
      this.prisma.bioReview.count({
        where: { person: { clan_id: clanId }, status: 'REJECTED' },
      }),
      this.prisma.bioReview.findFirst({
        where: { person: { clan_id: clanId }, status: 'REJECTED' },
        orderBy: { reviewed_at: 'desc' },
        select: { reject_reason: true },
      }),
      this.prisma.personModificationRequest.findFirst({
        where: { clan_id: clanId, status: 'REJECTED' },
        orderBy: { reviewed_at: 'desc' },
        select: { reject_reason: true },
      }),
      loadXiupu(this.prisma, clanId),
    ]);
    const xiupu = xiupuBundle.settings;

    const link = (path: string) => `/zupu/${clan.slug}${path}`;

    const menu = {
      project: link('/genealogy/data?tab=new'),
      digitize: link('/genealogy/data?tab=digitize'),
      import: link('/genealogy/data?tab=digitize&import=1'),
      compare: link('/genealogy/data?tab=pdf-import'),
      internal: link('/reviews/bio'),
      notice: link('/genealogy/errata?tab=dispatch'),
      revise: link('/genealogy/errata?tab=revise'),
      lock: link('/genealogy/finalize'),
      render: link('/genealogy/typeset'),
      print: link('/print'),
    };

    // ========== 第 2 步内部子任务：不进入主流程编号 ==========
    const digitizeSubStages: WorkflowSubStage[] = [
      {
        key: 'import_photo',
        label: '影像上传',
        status: 'todo',
        count: importLogCount,
        badge: 0,
        detail:
          importLogCount > 0
            ? `已导入 ${importLogCount} 份旧谱 PDF`
            : '纸质旧谱请先拍照或扫描，导出成 PDF 再上传',
        link: menu.import,
      },
      {
        key: 'ocr',
        label: 'OCR识别',
        status: 'todo',
        count: ocrImportCount,
        badge: 0,
        detail:
          ocrImportCount > 0
            ? `已识别 ${ocrImportCount} 份扫描件`
            : '扫描版自动识别文字，文字版可跳过',
        link: menu.import,
      },
      {
        key: 'compare_edit',
        label: '左右对照校勘',
        status: 'todo',
        count: correctedTempCount,
        badge: 0,
        detail:
          correctedTempCount > 0
            ? `已对照校勘 ${correctedTempCount} 条`
            : '对照原文，核对识别出的人名和关系',
        link: menu.compare,
      },
      {
        key: 'save_table',
        label: '数据保存',
        status: 'todo',
        count: Math.max(saveLogCount, personCount),
        badge: 0,
        detail:
          saveLogCount > 0 || personCount > 0
            ? `谱库已有 ${personCount} 人`
            : '核对无误后写入谱库。族人不能直接改谱库',
        link: menu.digitize,
      },
    ];

    const stages: WorkflowStage[] = [
      {
        key: 'project',
        label: '新建族谱项目',
        status: 'todo',
        count: 0,
        badge: 0,
        detail: '配置凡例、字辈和谱书框架',
        link: menu.project,
        menu_path: menu.project,
      },
      {
        key: 'digitize',
        label: '旧谱电子化',
        status: 'todo',
        count: importLogCount,
        badge: 0,
        detail: '录入新编资料，或把旧谱扫描件整理进谱库',
        link: menu.digitize,
        menu_path: menu.digitize,
        sub_stages: digitizeSubStages,
      },
      {
        key: 'internal_review',
        label: '谱稿初审',
        status: 'todo',
        count: bioReviewedCount,
        badge: bioPendingCount,
        detail:
          bioPendingCount > 0
            ? `还有 ${bioPendingCount} 条待审，含人物生平与世系关系`
            : '审核人物生平和世系关系。驳回后回到旧谱电子化',
        link: menu.internal,
        menu_path: menu.internal,
      },
      {
        key: 'errata_notice',
        label: '下发族人勘误',
        status: 'todo',
        count: crowdsourceNoticeCount,
        badge: 0,
        detail:
          crowdsourceNoticeCount > 0
            ? `已下发 ${crowdsourceNoticeCount} 份勘误通知`
            : notificationCount > 0
              ? '已有站内消息。请用勘误通知正式下发，族人只能提交申请'
              : '通知族人核对。族人只能提交勘误，不能直接改谱库',
        link: menu.notice,
        menu_path: menu.notice,
      },
      {
        key: 'errata_revise',
        label: '汇总勘误、修订谱稿',
        status: 'todo',
        count: modReqCount,
        badge: modReqPendingCount,
        returned: modReqRejectedCount > 0,
        detail:
          modReqRejectedCount > 0
            ? `有 ${modReqRejectedCount} 条勘误被退回，请回到世系校勘修订`
            : modReqPendingCount > 0
              ? `待审核勘误 ${modReqPendingCount} 条，通过后才入库`
              : '汇总族人勘误。主修审核通过后才写入谱库',
        link: menu.revise,
        menu_path: menu.revise,
      },
      {
        key: 'lock',
        label: '终审定稿',
        status: 'todo',
        count: genealogyDocCount,
        badge: 0,
        detail:
          genealogyDocCount > 0
            ? `已锁定 ${genealogyDocCount} 个谱稿版本`
            : '终审通过后定谱锁稿',
        link: menu.lock,
        menu_path: menu.lock,
      },
      {
        key: 'render',
        label: '册谱版式渲染',
        status: 'todo',
        count: bookVolumeCount,
        badge: 0,
        detail:
          bookVolumeCount > 0
            ? `已生成 ${bookVolumeCount} 卷册谱`
            : '生成欧式或苏式世系、人物传、人名索引',
        link: menu.render,
        menu_path: menu.render,
      },
      {
        key: 'print',
        label: '预览、印刷出谱',
        status: 'todo',
        count: printOrderCount,
        badge: 0,
        detail:
          printOrderCount > 0
            ? `已有 ${printOrderCount} 笔印刷`
            : '预览成书效果，再交付印刷',
        link: menu.print,
        menu_path: menu.print,
      },
    ];

    // ========== 先解析子阶段状态 ==========
    let subCurrentFound = false;
    for (const sub of digitizeSubStages) {
      if (sub.count > 0) {
        sub.status = 'done';
      } else if (!subCurrentFound) {
        sub.status = 'current';
        subCurrentFound = true;
      } else {
        sub.status = 'todo';
      }
    }

    const rejectTarget: Record<string, string> = {
      internal_review: 'digitize',
      lock: 'errata_revise',
    };
    stages.forEach((stage, index) => {
      stage.pre_condition = index === 0 ? null : stages[index - 1].key;
      stage.reject_return_key = rejectTarget[stage.key] ?? null;
      stage.blocked = false;
      stage.return_notice = null;
      stage.returned = false;
      stage.returned_from_label = null;
    });

    const digitizeDone =
      digitizeSubStages.every((s) => s.status === 'done') || personCount > 0 || saveLogCount > 0;
    const lockDone = Boolean(xiupu.lock);

    for (const stage of stages) {
      stage.status = this.isStageDone(stage.key, {
        digitizeDone,
        bioReviewedCount,
        crowdsourceNoticeCount,
        smsCount,
        modReqReviewedCount,
        lockDone,
        bookVolumeCount,
        printOrderCount,
      })
        ? 'done'
        : 'todo';
    }

    const markReturned = (key: string, reason: string, requirement: string, fromLabel: string) => {
      const target = stages.find((stage) => stage.key === key);
      if (!target) return;
      target.status = 'returned';
      target.returned = true;
      target.returned_from_label = fromLabel;
      target.return_notice = { reason, requirement };
    };
    const openBio = await this.latestRejectedBios(clanId);
    const openErrata = await this.openErrataRejections(clanId);
    const resubmittedAt = xiupu.digitize_resubmitted_at ? new Date(xiupu.digitize_resubmitted_at) : null;
    const rejectionIsNew =
      openBio.count > 0 &&
      (!resubmittedAt || !openBio.latestAt || openBio.latestAt.getTime() > resubmittedAt.getTime());

    if (rejectionIsNew) {
      markReturned(
        'digitize',
        openBio.reason || '谱稿初审未通过',
        '请按驳回意见修订世系和人物资料，改完再提交谱稿初审。',
        '谱稿初审',
      );
    } else if (resubmittedAt) {
      const digitize = stages.find((stage) => stage.key === 'digitize');
      const review = stages.find((stage) => stage.key === 'internal_review');
      if (digitize) {
        digitize.status = 'done';
        digitize.returned = false;
        digitize.return_notice = null;
        digitize.returned_from_label = null;
      }
      const reReviewed = await this.hasBioApprovalAfter(clanId, resubmittedAt);
      if (review && !reReviewed) review.status = 'todo';
    }
    if (xiupu.final_reject) {
      markReturned(
        'errata_revise',
        xiupu.final_reject.reason,
        xiupu.final_reject.reason.includes('解锁')
          ? '定稿已解除。请在汇总勘误、修订谱稿中修订后，再提交终审定稿。'
          : '终审未通过。请修订谱稿后，再提交终审定稿。',
        '终审定稿',
      );
    } else if (openErrata.count > 0) {
      markReturned(
        'errata_revise',
        openErrata.reason || '族人勘误被退回',
        '请按退回意见修订谱稿。族人提交的是勘误申请，主修审核通过后才入库。',
        '汇总勘误、修订谱稿',
      );
    }

    for (const key of xiupu.suspended) {
      const stage = stages.find((item) => item.key === key);
      if (stage) stage.status = 'suspended';
    }

    let focused = false;
    for (const stage of stages) {
      if (stage.status === 'done') continue;
      if (!focused && stage.status === 'todo') stage.status = 'current';
      focused = true;
    }

    if (xiupu.mode === 'serial') {
      // 第一个还没完成的环节之后，全部禁止提前进入。
      let waiting = false;
      for (const stage of stages) {
        if (waiting) stage.blocked = true;
        if (stage.status !== 'done') waiting = true;
      }
    }

    const doneCount = stages.filter((stage) => stage.status === 'done').length;
    const totalCount = stages.length;
    const progress = Math.min(100, Math.round((doneCount / totalCount) * 100));
    const currentStage =
      stages.find((stage) => stage.status === 'suspended') ??
      stages.find((stage) => stage.status === 'current') ??
      stages.find((stage) => stage.status === 'returned') ??
      null;

    return {
      clan_id: clanId.toString(),
      clan_slug: clan.slug,
      clan_name: clan.name,
      progress,
      done_count: doneCount,
      total_count: totalCount,
      mode: xiupu.mode,
      progress_paused: xiupu.suspended.length > 0,
      pedigree_locked: lockDone,
      current_stage: currentStage?.key ?? null,
      current_label: currentStage?.label ?? null,
      stages,
    };
  }

  async updateSettings(
    clan: { id: bigint; slug: string; name: string },
    body: { mode?: string; suspend?: string; resume?: string; resubmit?: string },
  ) {
    const allowed = new Set<string>(XIUPU_STAGE_KEYS);
    if (body.mode !== undefined && body.mode !== 'serial' && body.mode !== 'free') {
      throw new BadRequestException('流转方式只接受 serial 或 free');
    }
    if (body.suspend && !allowed.has(body.suspend)) throw new BadRequestException('未知环节');
    if (body.resume && !allowed.has(body.resume)) throw new BadRequestException('未知环节');
    if (body.resubmit && body.resubmit !== 'digitize') {
      throw new BadRequestException('目前只能重新提交谱稿初审');
    }

    await saveXiupu(this.prisma, clan.id, (current) => {
      const next: XiupuSettings = { ...current, suspended: [...current.suspended] };
      if (body.mode === 'serial' || body.mode === 'free') next.mode = body.mode;
      if (body.suspend && !next.suspended.includes(body.suspend)) next.suspended.push(body.suspend);
      if (body.resume) next.suspended = next.suspended.filter((key) => key !== body.resume);
      if (body.resubmit === 'digitize') {
        next.digitize_resubmitted_at = new Date().toISOString();
        next.suspended = next.suspended.filter((key) => key !== 'digitize');
      }
      return next;
    });
    return this.getStatus(clan);
  }

  /** 每人最新一条谱稿审核仍是驳回，才视为需要回流。 */
  private async latestRejectedBios(clanId: bigint) {
    const rows = await this.prisma.$queryRaw<
      Array<{ status: string; reject_reason: string | null; reviewed_at: Date | null }>
    >`
      SELECT DISTINCT ON (br.person_id)
        br.status::text AS status,
        br.reject_reason,
        COALESCE(br.reviewed_at, br.created_at) AS reviewed_at
      FROM bio_reviews br
      INNER JOIN persons p ON p.id = br.person_id
      WHERE p.clan_id = ${clanId}
      ORDER BY br.person_id, br.reviewed_at DESC NULLS LAST, br.created_at DESC
    `;
    const open = rows.filter((row) => row.status === 'REJECTED');
    let latestAt: Date | null = null;
    for (const row of open) {
      if (!row.reviewed_at) continue;
      const at = new Date(row.reviewed_at);
      if (!latestAt || at.getTime() > latestAt.getTime()) latestAt = at;
    }
    return {
      count: open.length,
      reason: open.find((row) => row.reject_reason)?.reject_reason ?? null,
      latestAt,
    };
  }

  /** 重新提交谱稿初审之后，是否已经有新的通过记录。 */
  private async hasBioApprovalAfter(clanId: bigint, after: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ id: bigint }>>`
      SELECT br.id
      FROM bio_reviews br
      INNER JOIN persons p ON p.id = br.person_id
      WHERE p.clan_id = ${clanId}
        AND br.status = 'APPROVED'
        AND COALESCE(br.reviewed_at, br.created_at) > ${after}
      LIMIT 1
    `;
    return rows.length > 0;
  }

  /** 同一人、同一字段后来已通过的驳回，不再把修订环节标成回流。 */
  private async openErrataRejections(clanId: bigint) {
    const rows = await this.prisma.$queryRaw<Array<{ reject_reason: string | null }>>`
      SELECT r.reject_reason
      FROM person_modification_requests r
      WHERE r.clan_id = ${clanId}
        AND r.status = 'REJECTED'
        AND NOT EXISTS (
          SELECT 1 FROM person_modification_requests n
          WHERE n.person_id = r.person_id
            AND n.field_name = r.field_name
            AND n.status = 'APPROVED'
            AND n.reviewed_at > COALESCE(r.reviewed_at, r.created_at)
        )
    `;
    return { count: rows.length, reason: rows.find((row) => row.reject_reason)?.reject_reason ?? null };
  }

  /** 8 个主节点是否已经做完。回流和搁置由调用方改写 status，不在这里计完成。 */
  private isStageDone(
    key: string,
    ctx: {
      digitizeDone: boolean;
      bioReviewedCount: number;
      crowdsourceNoticeCount: number;
      smsCount: number;
      modReqReviewedCount: number;
      lockDone: boolean;
      bookVolumeCount: number;
      printOrderCount: number;
    },
  ): boolean {
    switch (key) {
      case 'project':
        return true;
      case 'digitize':
        return ctx.digitizeDone;
      case 'internal_review':
        return ctx.bioReviewedCount > 0;
      case 'errata_notice':
        return ctx.crowdsourceNoticeCount > 0 || ctx.smsCount > 0;
      case 'errata_revise':
        return ctx.modReqReviewedCount > 0;
      case 'lock':
        return ctx.lockDone;
      case 'render':
        return ctx.bookVolumeCount > 0;
      case 'print':
        return ctx.printOrderCount > 0;
      default:
        return false;
    }
  }
}
