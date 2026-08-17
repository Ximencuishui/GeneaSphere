import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';

/**
 * 修谱工作流状态推导（只读，不落库）：
 * 依据家族下真实业务数据（导入记录/OCR/校对/数据表/通知/修改申请/审核/谱书/印刷订单）
 * 推导"修谱全流程"各阶段的完成情况，供管理后台【控制台】与【修谱】顶部工作流条展示。
 *
 * 阶段顺序（与产品 PRD 修谱流程一致）：
 *   1 新建族谱
 *   2 旧谱电子化（导入与拍照 → OCR 识别 → 左右对照编修 → 保存数据表）
 *   3 发通知族员（短信/微信/站内）
 *   4 族员自行更改
 *   5 审核
 *   6 新谱建成
 *   7 印刷出谱
 */

export type WorkflowStageStatus = 'done' | 'current' | 'todo';

export interface WorkflowSubStage {
  key: string;
  label: string;
  status: WorkflowStageStatus;
  count: number;
  detail: string;
  link: string;
}

export interface WorkflowStage {
  key: string;
  label: string;
  status: WorkflowStageStatus;
  count: number;
  detail: string;
  link: string;
  sub_stages?: WorkflowSubStage[];
}

export interface GenealogyWorkflowStatus {
  clan_id: string;
  clan_slug: string;
  clan_name: string;
  progress: number; // 0-100
  done_count: number;
  total_count: number;
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
      modReqCount, // 族员信息修改申请数
      modReqReviewedCount, // 已审核（通过/驳回）的修改申请数
      bioReviewedCount, // 已审核的生平传记数
      genealogyDocCount, // 族谱文档版本数（新谱）
      bookVolumeCount, // 册谱卷宗数
      printOrderCount, // 印刷订单数
    ] = await Promise.all([
      this.prisma.pdfImportLog.count({ where: { clan_id: clanId } }),
      this.prisma.pdfImportLog.count({ where: { clan_id: clanId, parse_mode: 'ocr' } }),
      this.prisma.pdfParseTemp.count({
        where: { import_log: { clan_id: clanId }, is_corrected: true },
      }),
      this.prisma.pdfImportLog.count({
        where: { clan_id: clanId, success_records: { gt: 0 } },
      }),
      this.prisma.person.count({ where: { clan_id: clanId } }),
      this.prisma.smsSendRecord.count({ where: { clan_id: clanId } }),
      this.prisma.notification.count({ where: { clan_id: clanId } }),
      this.prisma.personModificationRequest.count({ where: { clan_id: clanId } }),
      this.prisma.personModificationRequest.count({
        where: { clan_id: clanId, status: { in: ['APPROVED', 'REJECTED'] } },
      }),
      this.prisma.bioReview.count({
        where: { person: { clan_id: clanId }, status: { in: ['APPROVED', 'REJECTED'] } },
      }),
      this.prisma.genealogyDocument.count({ where: { clan_id: clanId } }),
      this.prisma.bookVolume.count({ where: { clan_id: clanId } }),
      this.prisma.printOrder.count({ where: { clan_id: clanId } }),
    ]);

    const link = (path: string) => `/zupu/${clan.slug}${path}`;

    // ========== 阶段 2 子阶段：旧谱电子化 ==========
    const digitizeSubStages: WorkflowSubStage[] = [
      {
        key: 'import_photo',
        label: '导入与拍照',
        status: 'todo',
        count: importLogCount,
        detail:
          importLogCount > 0
            ? `已导入 ${importLogCount} 份旧谱电子文档 / 拍照件`
            : '上传旧谱 PDF 电子文档或拍照件',
        link: link('/genealogy/history'),
      },
      {
        key: 'ocr',
        label: 'OCR 识别',
        status: 'todo',
        count: ocrImportCount,
        detail:
          ocrImportCount > 0
            ? `已完成 ${ocrImportCount} 个扫描件 OCR 识别`
            : '扫描件将自动 OCR 识别，文字版无需此步骤',
        link: link('/import'),
      },
      {
        key: 'compare_edit',
        label: '左右对照编修',
        status: 'todo',
        count: correctedTempCount,
        detail:
          correctedTempCount > 0
            ? `已左右对照校对 ${correctedTempCount} 条记录`
            : '在导入管理页对"原文 ↔ 识别结果"左右对照校对',
        link: link('/import'),
      },
      {
        key: 'save_table',
        label: '保存数据表',
        status: 'todo',
        count: Math.max(saveLogCount, personCount),
        detail:
          saveLogCount > 0 || personCount > 0
            ? `已保存 ${personCount} 位族员至族谱数据表`
            : '校对完成后保存至族员数据表',
        link: link('/import'),
      },
    ];

    // ========== 顶层 7 阶段 ==========
    const stages: WorkflowStage[] = [
      {
        key: 'clan_created',
        label: '新建族谱',
        status: 'todo',
        count: 1,
        detail: '族谱已创建，可开始修谱',
        link: link('/settings/clan-info'),
      },
      {
        key: 'digitize',
        label: '旧谱电子化',
        status: 'todo',
        count: digitizeSubStages.reduce((s, x) => s + x.count, 0),
        detail: '把旧族谱（电子文档 / 拍照件）转为结构化数据',
        link: link('/import'),
        sub_stages: digitizeSubStages,
      },
      {
        key: 'notify',
        label: '发通知族员',
        status: 'todo',
        count: Math.max(smsCount, notificationCount),
        detail:
          smsCount > 0 || notificationCount > 0
            ? `已通过短信/微信/站内通知族员 ${Math.max(smsCount, notificationCount)} 次`
            : '通知族员核对并补充个人信息（短信 / 微信 / 站内）',
        link: link('/announcements'),
      },
      {
        key: 'member_edit',
        label: '族员自行更改',
        status: 'todo',
        count: modReqCount,
        detail:
          modReqCount > 0
            ? `族员已提交 ${modReqCount} 条信息修改申请`
            : '族员可对自己的信息提交修改申请',
        link: link('/invite/reviews'),
      },
      {
        key: 'review',
        label: '审核',
        status: 'todo',
        count: modReqReviewedCount + bioReviewedCount,
        detail:
          modReqReviewedCount + bioReviewedCount > 0
            ? `已审核 ${modReqReviewedCount + bioReviewedCount} 条修改 / 传记`
            : '审核族员提交的信息修改与传记',
        link: link('/invite/reviews'),
      },
      {
        key: 'new_book',
        label: '新谱建成',
        status: 'todo',
        count: genealogyDocCount + bookVolumeCount,
        detail:
          genealogyDocCount + bookVolumeCount > 0
            ? `已生成 ${genealogyDocCount} 个族谱版本 / ${bookVolumeCount} 卷册谱`
            : '定稿并生成新族谱（文档版本 / 册谱卷宗）',
        link: link('/genealogy/generate'),
      },
      {
        key: 'print',
        label: '印刷出谱',
        status: 'todo',
        count: printOrderCount,
        detail:
          printOrderCount > 0
            ? `已下单 ${printOrderCount} 个印刷订单`
            : '提交印刷订单，印刷装订成谱',
        link: link('/orders'),
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

    // ========== 再自上而下解析主阶段状态 ==========
    let currentFound = false;
    for (const stage of stages) {
      let stageDone: boolean;
      if (stage.key === 'digitize') {
        // 旧谱电子化：全部子阶段完成才算完成（进度以子阶段计）
        stageDone = digitizeSubStages.every((s) => s.status === 'done');
      } else {
        stageDone = this.isStageDone(stage.key, {
          importLogCount,
          ocrImportCount,
          correctedTempCount,
          saveLogCount,
          personCount,
          smsCount,
          notificationCount,
          modReqCount,
          modReqReviewedCount,
          bioReviewedCount,
          genealogyDocCount,
          bookVolumeCount,
          printOrderCount,
        });
      }

      if (stageDone) {
        stage.status = 'done';
      } else if (!currentFound) {
        stage.status = 'current';
        currentFound = true;
      } else {
        stage.status = 'todo';
      }
    }

    // ========== 进度与结果 ==========
    const doneCount =
      stages.filter((s) => s.key !== 'digitize' && s.status === 'done').length +
      digitizeSubStages.filter((s) => s.status === 'done').length;
    const totalCount = 10; // 新建族谱(1) + 旧谱电子化 4 子阶段 + 通知/族员更改/审核/新谱建成/印刷(5)
    const progress = Math.min(100, Math.round((doneCount / totalCount) * 100));

    const currentStage = stages.find((s) => s.status === 'current') ?? null;

    return {
      clan_id: clanId.toString(),
      clan_slug: clan.slug,
      clan_name: clan.name,
      progress,
      done_count: doneCount,
      total_count: totalCount,
      current_stage: currentStage?.key ?? null,
      current_label: currentStage?.label ?? null,
      stages,
    };
  }

  /** 各主阶段完成判定（digitize 由子阶段驱动，不在此处理） */
  private isStageDone(
    key: string,
    ctx: {
      importLogCount: number;
      ocrImportCount: number;
      correctedTempCount: number;
      saveLogCount: number;
      personCount: number;
      smsCount: number;
      notificationCount: number;
      modReqCount: number;
      modReqReviewedCount: number;
      bioReviewedCount: number;
      genealogyDocCount: number;
      bookVolumeCount: number;
      printOrderCount: number;
    },
  ): boolean {
    switch (key) {
      case 'clan_created':
        return true;
      case 'notify':
        return ctx.smsCount > 0 || ctx.notificationCount > 0;
      case 'member_edit':
        return ctx.modReqCount > 0;
      case 'review':
        return ctx.modReqReviewedCount > 0 || ctx.bioReviewedCount > 0;
      case 'new_book':
        return ctx.genealogyDocCount > 0 || ctx.bookVolumeCount > 0;
      case 'print':
        return ctx.printOrderCount > 0;
      default:
        return false;
    }
  }
}
