import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import {
  InviteQrcodeStatus,
  VerificationStatus,
  VerifyMethod,
  QuizDifficulty,
  EndorsementResult,
  ModificationStatus,
  Role,
  Gender,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { WechatService } from './wechat.service';
import { NotificationService } from '../common/notification.service';
import { AdminService } from '../admin/admin.service';
import { CosService } from '../cos/cos.service';

const SESSION_TTL_MINUTES = 30;
const PEER_QRCODE_TTL_MINUTES = 30;
const QUIZ_REQUIRED_CORRECT = 2;
const QUIZ_TOTAL = 3;
const MAX_QUIZ_RETRY = 3;
const ENDORSER_MONTHLY_LIMIT = 5;

interface SubmittedPersonInfo {
  full_name: string;
  gender: string;
  birth_year?: number;
  father_name?: string;
  mother_name?: string;
  spouse_name?: string;
  children_names?: string[];
}

interface QuizQuestion {
  attempt_id: number;
  question: string;
  options: string[];
  difficulty: QuizDifficulty;
  category: string;
}

@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wechat: WechatService,
    private readonly notification: NotificationService,
    private readonly admin: AdminService,
    private readonly cosService: CosService,
  ) {}

  // ==================== 邀请二维码（管理端） ====================

  async createInviteQrcode(clanId: bigint, creatorId: string, expireDays = 7) {
    const code = this.generateUniqueCode(clanId);
    const expireAt = new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000);
    const created = await this.prisma.inviteQrcode.create({
      data: {
        clan_id: clanId,
        creator_id: creatorId,
        code,
        purpose: 'clan_invite',
        expire_at: expireAt,
        status: InviteQrcodeStatus.ACTIVE,
      },
    });

    await this.admin.logAction({
      clanId,
      userId: creatorId,
      action: 'CREATE_INVITE_QRCODE',
      targetType: 'InviteQrcode',
      targetId: created.id.toString(),
      details: `expire_days=${expireDays}`,
    });

    // COS 模式：生成二维码图片并上传
    let qrcodeDataUrl: string | undefined;
    const useCos = this.cosService.getDriverType() === 'cos' || process.env.COS_ENABLED === 'true';
    if (useCos) {
      try {
        const QRCode = require('qrcode');
        const scanUrl = this.buildScanUrl(created.code);
        const qrBuffer: Buffer = await QRCode.toBuffer(scanUrl, {
          type: 'png',
          width: 480,
          margin: 1,
        });
        const key = `media/qrcodes/${clanId}/${created.id}.png`;
        const result = await this.cosService.uploadFile(key, qrBuffer, {
          contentType: 'image/png',
          bucketType: 'hot',
        });
        qrcodeDataUrl = result.url;
        this.logger.log(`邀请二维码图片已上传至 COS: ${result.url}`);
      } catch (err: any) {
        this.logger.warn(`邀请二维码图片上传失败（非关键错误）: ${err.message}`);
      }
    }

    return {
      qrcode_id: created.id.toString(),
      code: created.code,
      url: this.buildScanUrl(created.code),
      qrcode_data_url: qrcodeDataUrl,
      expire_at: created.expire_at,
      status: created.status,
    };
  }

  async listInviteQrcodes(clanId: bigint) {
    const list = await this.prisma.inviteQrcode.findMany({
      where: { clan_id: clanId, purpose: 'clan_invite' },
      orderBy: { created_at: 'desc' },
    });
    return list.map((q) => ({
      ...q,
      id: q.id.toString(),
      clan_id: q.clan_id.toString(),
      url: this.buildScanUrl(q.code),
      effective_status: this.computeQrcodeStatus(q),
    }));
  }

  async getInviteQrcode(id: bigint) {
    const q = await this.prisma.inviteQrcode.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('邀请二维码不存在');
    return {
      ...q,
      id: q.id.toString(),
      clan_id: q.clan_id.toString(),
      url: this.buildScanUrl(q.code),
      effective_status: this.computeQrcodeStatus(q),
    };
  }

  async revokeInviteQrcode(id: bigint, userId: string) {
    const q = await this.prisma.inviteQrcode.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('邀请二维码不存在');
    await this.admin.requireAdmin(q.clan_id, userId);

    const updated = await this.prisma.inviteQrcode.update({
      where: { id },
      data: { status: InviteQrcodeStatus.REVOKED },
    });

    await this.admin.logAction({
      clanId: q.clan_id,
      userId,
      action: 'REVOKE_INVITE_QRCODE',
      targetType: 'InviteQrcode',
      targetId: id.toString(),
    });

    return { id: updated.id.toString(), status: updated.status };
  }

  // ==================== 验证记录（管理端） ====================

  async listVerificationRecords(
    clanId: bigint,
    options: { status?: VerificationStatus; page?: number; pageSize?: number } = {},
  ) {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const where: Prisma.VerificationSessionWhereInput = { clan_id: clanId };
    if (options.status) where.status = options.status;

    const [list, total] = await Promise.all([
      this.prisma.verificationSession.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.verificationSession.count({ where }),
    ]);

    return {
      data: list.map((s) => ({
        id: s.id.toString(),
        clan_id: s.clan_id.toString(),
        scanner_openid: s.scanner_openid,
        scanner_phone: s.scanner_phone,
        scanner_nickname: s.scanner_nickname,
        status: s.status,
        verify_method: s.verify_method,
        matched_person_id: s.matched_person_id?.toString() || null,
        expire_at: s.expire_at,
        passed_at: s.passed_at,
        fail_reason: s.fail_reason,
        created_at: s.created_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  async getVerificationRecordDetail(id: bigint) {
    const session = await this.prisma.verificationSession.findUnique({
      where: { id },
      include: {
        quiz_attempts: true,
        endorsements: true,
        matched_person: true,
      },
    });
    if (!session) throw new NotFoundException('验证会话不存在');
    return {
      ...session,
      id: session.id.toString(),
      clan_id: session.clan_id.toString(),
      qrcode_id: session.qrcode_id?.toString() || null,
      matched_person_id: session.matched_person_id?.toString() || null,
      quiz_attempts: session.quiz_attempts.map((q) => ({
        ...q,
        id: q.id.toString(),
        session_id: q.session_id.toString(),
      })),
      endorsements: session.endorsements.map((e) => ({
        ...e,
        id: e.id.toString(),
        session_id: e.session_id.toString(),
      })),
    };
  }

  // ==================== 信息修改审核 ====================

  async listModificationRequests(
    clanId: bigint,
    status?: ModificationStatus,
  ) {
    const where: Prisma.PersonModificationRequestWhereInput = { clan_id: clanId };
    if (status) where.status = status;
    const list = await this.prisma.personModificationRequest.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
    return list.map((r) => ({
      ...r,
      id: r.id.toString(),
      person_id: r.person_id.toString(),
      clan_id: r.clan_id.toString(),
    }));
  }

  async reviewModificationRequest(
    id: bigint,
    reviewerId: string,
    decision: { status: ModificationStatus; reject_reason?: string },
  ) {
    const record = await this.prisma.personModificationRequest.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('信息修改申请不存在');
    if (record.status !== ModificationStatus.PENDING) {
      throw new BadRequestException('该申请已处理');
    }
    await this.admin.requireAdmin(record.clan_id, reviewerId);

    if (decision.status === ModificationStatus.REJECTED && !decision.reject_reason) {
      throw new BadRequestException('驳回时必须填写原因');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.personModificationRequest.update({
        where: { id },
        data: {
          status: decision.status,
          reviewer_id: reviewerId,
          reviewed_at: new Date(),
          reject_reason: decision.reject_reason,
        },
      });

      // 审核通过时同步更新 Person 字段
      if (decision.status === ModificationStatus.APPROVED) {
        const data: Prisma.PersonUpdateInput = {};
        switch (record.field_name) {
          case 'full_name':
            data.full_name = record.new_value;
            break;
          case 'gender':
            data.gender = record.new_value === 'female' ? Gender.female : Gender.male;
            break;
          case 'birth_year':
            const year = parseInt(record.new_value, 10);
            if (!Number.isNaN(year)) {
              data.birth_date = new Date(`${year}-01-01`);
            }
            break;
          case 'birth_place':
            data.birth_place = record.new_value;
            break;
          case 'death_place':
            data.death_place = record.new_value;
            break;
          default:
            // 其它字段暂不处理
            break;
        }
        if (Object.keys(data).length > 0) {
          await tx.person.update({
            where: { id: record.person_id },
            data,
          });
        }
      }

      return updated;
    });

    await this.admin.logAction({
      clanId: record.clan_id,
      userId: reviewerId,
      action: `MODIFICATION_${decision.status}`,
      targetType: 'PersonModificationRequest',
      targetId: id.toString(),
      details: `field=${record.field_name} new=${record.new_value}`,
    });

    return {
      id: result.id.toString(),
      status: result.status,
      reviewed_at: result.reviewed_at,
    };
  }

  async createModificationRequest(
    personId: bigint,
    clanId: bigint,
    requesterId: string,
    payload: { field_name: string; old_value?: string; new_value: string; reason?: string },
  ) {
    if (!payload.new_value) throw new BadRequestException('new_value 必填');
    const created = await this.prisma.personModificationRequest.create({
      data: {
        person_id: personId,
        clan_id: clanId,
        requester_user_id: requesterId,
        field_name: payload.field_name,
        old_value: payload.old_value,
        new_value: payload.new_value,
        reason: payload.reason,
        status: ModificationStatus.PENDING,
      },
    });
    return {
      id: created.id.toString(),
      status: created.status,
      field_name: created.field_name,
      new_value: created.new_value,
    };
  }

  // ==================== 扫码统计 ====================

  async getScanStats(clanId: bigint, days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [qrcodes, sessions, passedSessions, pendingEndorsements] = await Promise.all([
      this.prisma.inviteQrcode.count({ where: { clan_id: clanId } }),
      this.prisma.verificationSession.count({
        where: { clan_id: clanId, created_at: { gte: since } },
      }),
      this.prisma.verificationSession.count({
        where: { clan_id: clanId, status: VerificationStatus.PASSED, created_at: { gte: since } },
      }),
      this.prisma.endorsement.count({
        where: {
          session: { clan_id: clanId },
          result: null,
          expire_at: { gt: new Date() },
        },
      }),
    ]);

    return {
      total_qrcodes: qrcodes,
      recent_scans: sessions,
      recent_passed: passedSessions,
      pending_endorsements: pendingEndorsements,
      pass_rate: sessions > 0 ? Math.round((passedSessions / sessions) * 100) : 0,
    };
  }

  // ==================== H5 公开流程 ====================

  /**
   * 扫码落地：校验 code 有效性 → 事务创建 session → 返回 clan + session
   */
  async resolveQrcode(code: string) {
    await this.expirePendingSessions();

    const qrcode = await this.prisma.inviteQrcode.findUnique({ where: { code } });
    if (!qrcode) {
      throw new NotFoundException('邀请二维码无效');
    }
    const effective = this.computeQrcodeStatus(qrcode);
    if (effective !== InviteQrcodeStatus.ACTIVE) {
      throw new BadRequestException(
        effective === InviteQrcodeStatus.EXPIRED ? '二维码已过期' : '二维码已撤销',
      );
    }

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.inviteQrcode.update({
        where: { id: qrcode.id },
        data: { scan_count: { increment: 1 } },
      });
      return tx.verificationSession.create({
        data: {
          qrcode_id: qrcode.id,
          clan_id: qrcode.clan_id,
          scanner_openid: 'pending', // 微信授权后回填
          status: VerificationStatus.PENDING,
          expire_at: new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000),
        },
      });
    });

    const clan = await this.prisma.clan.findUnique({
      where: { id: qrcode.clan_id },
      select: { id: true, name: true, description: true },
    });

    return {
      session_id: session.id.toString(),
      clan: {
        id: clan?.id.toString(),
        name: clan?.name,
        description: clan?.description,
      },
      inviter_user_id: qrcode.creator_id,
      expire_at: session.expire_at,
      purpose: qrcode.purpose,
    };
  }

  /**
   * 处理微信授权回调
   */
  async handleWxCallback(
    sessionId: bigint,
    profile: { openid: string; nickname: string; avatar?: string; phone?: string },
  ) {
    const session = await this.prisma.verificationSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');
    if (session.status !== VerificationStatus.PENDING) {
      throw new BadRequestException('会话已结束');
    }
    if (session.expire_at < new Date()) {
      await this.markSessionExpired(sessionId);
      throw new BadRequestException('会话已过期');
    }

    // 尝试用 openid 关联已注册用户
    let user = await this.prisma.user.findUnique({ where: { wx_openid: profile.openid } });
    if (!user && profile.phone) {
      user = await this.prisma.user.findUnique({ where: { phone: profile.phone } });
      if (user) {
        // 绑定 openid
        await this.prisma.user.update({
          where: { id: user.id },
          data: { wx_openid: profile.openid },
        });
      }
    }

    const updated = await this.prisma.verificationSession.update({
      where: { id: sessionId },
      data: {
        scanner_openid: profile.openid,
        scanner_nickname: profile.nickname,
        scanner_avatar: profile.avatar,
        scanner_phone: profile.phone,
        scanned_user_id: user?.id,
      },
    });

    return {
      session_id: updated.id.toString(),
      user: user
        ? {
            id: user.id,
            phone: user.phone,
            nickname: user.nickname,
            avatar_url: user.avatar_url,
            has_clan_membership: await this.hasClanMembership(user.id, session.clan_id),
          }
        : null,
      phone_required: !profile.phone,
      expire_at: updated.expire_at,
    };
  }

  /**
   * 获取会话状态（供 H5 轮询）
   */
  async getSessionStatus(sessionId: bigint) {
    const session = await this.prisma.verificationSession.findUnique({
      where: { id: sessionId },
      include: { endorsements: true },
    });
    if (!session) throw new NotFoundException('会话不存在');
    if (session.expire_at < new Date() && session.status === VerificationStatus.PENDING) {
      await this.markSessionExpired(sessionId);
      return { status: VerificationStatus.EXPIRED, expire_at: session.expire_at };
    }
    return {
      id: session.id.toString(),
      status: session.status,
      verify_method: session.verify_method,
      matched_person_id: session.matched_person_id?.toString() || null,
      passed_at: session.passed_at,
      fail_reason: session.fail_reason,
      expire_at: session.expire_at,
      endorsements: session.endorsements.map((e) => ({
        id: e.id.toString(),
        endorser_user_id: e.endorser_user_id,
        result: e.result,
        responded_at: e.responded_at,
      })),
    };
  }

  // ==================== 自动匹配 ====================

  async autoMatchPerson(clanId: bigint, payload: { full_name: string; father_name?: string; birth_year?: number }) {
    if (!payload.full_name) throw new BadRequestException('full_name 必填');
    const persons = await this.prisma.person.findMany({
      where: {
        clan_id: clanId,
        full_name: { contains: payload.full_name, mode: 'insensitive' },
      },
      include: {
        children_in: {
          include: {
            family: {
              include: {
                husband: { select: { id: true, full_name: true } },
                wife: { select: { id: true, full_name: true } },
              },
            },
          },
        },
      },
      take: 20,
    });

    // 计算匹配分数：姓名相同 +10；父亲姓名匹配 +5；出生年 ±2 加分
    const scored = persons.map((p) => {
      let score = 0;
      if (p.full_name === payload.full_name) score += 10;
      if (payload.birth_year && p.birth_date) {
        const year = p.birth_date.getFullYear();
        if (Math.abs(year - payload.birth_year) <= 2) score += 5;
      }
      // 父亲姓名匹配：取 person 在其父亲 FamilyUnit 中的父名
      for (const child of p.children_in) {
        const fatherName = child.family.husband?.full_name;
        if (fatherName && fatherName === payload.father_name) {
          score += 6;
          break;
        }
      }
      return {
        person_id: p.id.toString(),
        full_name: p.full_name,
        gender: p.gender,
        birth_year: p.birth_date?.getFullYear(),
        birth_place: p.birth_place,
        death_place: p.death_place,
        is_living: p.is_living,
        score,
      };
    });

    const matched = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      matched,
      has_match: matched.length > 0,
      best_match: matched[0] || null,
    };
  }

  /**
   * 提交无数据时的填报信息
   */
  async submitPersonInfo(
    sessionId: bigint,
    info: SubmittedPersonInfo,
  ) {
    await this.assertSessionPending(sessionId);

    const session = await this.prisma.verificationSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');

    await this.prisma.verificationSession.update({
      where: { id: sessionId },
      data: { submitted_info: info as any },
    });

    // 自动匹配一次
    const matchResult = await this.autoMatchPerson(session.clan_id, {
      full_name: info.full_name,
      father_name: info.father_name,
      birth_year: info.birth_year,
    });

    return {
      auto_match: matchResult,
    };
  }

  /**
   * 用户确认/修改信息
   */
  async confirmInfo(
    sessionId: bigint,
    payload: { person_id?: number; confirmed_payload?: Partial<SubmittedPersonInfo> },
  ) {
    await this.assertSessionPending(sessionId);

    const session = await this.prisma.verificationSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');

    // 若指定 person_id，且数据无修改 → 直接通过
    if (payload.person_id && !payload.confirmed_payload) {
      return this.completeSession(sessionId, {
        method: VerifyMethod.INFO_CONFIRM,
        personId: BigInt(payload.person_id),
      });
    }

    // 否则作为信息修改请求提交
    const personId = payload.person_id ? BigInt(payload.person_id) : null;
    if (personId && payload.confirmed_payload) {
      const person = await this.prisma.person.findUnique({ where: { id: personId } });
      if (!person) throw new NotFoundException('人物不存在');

      // 对每一个与原值不同的字段生成修改申请
      const requests: any[] = [];
      const fields: (keyof SubmittedPersonInfo)[] = [
        'full_name', 'gender', 'birth_year', 'father_name', 'mother_name', 'spouse_name', 'children_names',
      ];
      for (const f of fields) {
        const newVal = payload.confirmed_payload[f];
        if (newVal === undefined) continue;
        const strVal = Array.isArray(newVal) ? newVal.join('、') : String(newVal);
        const oldVal = f === 'birth_year'
          ? person.birth_date?.getFullYear()?.toString()
          : f === 'gender'
          ? person.gender
          : null;
        if (oldVal !== null && String(oldVal) === strVal) continue;

        const req = await this.createModificationRequest(
          personId,
          session.clan_id,
          session.scanned_user_id || 'h5_visitor',
          {
            field_name: f as string,
            old_value: oldVal?.toString(),
            new_value: strVal,
            reason: 'H5 扫码确认信息时修改',
          },
        );
        requests.push(req);
      }
      // 即便有修改申请，先通过会话（视为有效确认）
      return this.completeSession(sessionId, {
        method: VerifyMethod.INFO_CONFIRM,
        personId,
        modification_requests: requests,
      });
    }

    throw new BadRequestException('必须提供 person_id 或 confirmed_payload');
  }

  // ==================== 知识问答 ====================

  /**
   * 生成 3 道题。优先：1 道"父名"必答 + 2 道随机
   */
  async generateQuiz(sessionId: bigint) {
    await this.assertSessionPending(sessionId);

    const session = await this.prisma.verificationSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');

    const target = await this.resolveQuizTarget(session);
    if (!target) {
      throw new BadRequestException('缺少可出题的人物数据，请先填写或匹配信息');
    }

    // 1 道"父名"（必答 EASY）
    const easyQuestions: QuizQuestion[] = [];
    if (target.father_id) {
      const father = await this.prisma.person.findUnique({ where: { id: target.father_id } });
      if (father) {
        const distractors = await this.fetchDistractorNames(session.clan_id, father.full_name);
        easyQuestions.push(this.buildQuestion({
          sessionId,
          text: `你父亲的名字是？`,
          correct: father.full_name,
          distractors,
          difficulty: QuizDifficulty.EASY,
          category: 'direct_elder',
        }));
      }
    }

    // 2 道随机题
    const mediumQuestions = await this.buildRandomQuestions(session.clan_id, target, 2 - easyQuestions.length);
    const questions = [...easyQuestions, ...mediumQuestions].slice(0, QUIZ_TOTAL);

    // 如果仍不足 3 道（数据不足），补通用题
    while (questions.length < QUIZ_TOTAL) {
      questions.push(await this.buildGenericQuestion(session.clan_id, sessionId));
    }

    return {
      session_id: sessionId.toString(),
      total: questions.length,
      required_correct: QUIZ_REQUIRED_CORRECT,
      max_retry: MAX_QUIZ_RETRY,
      questions: questions.map((q) => ({
        attempt_id: q.attempt_id,
        question: q.question,
        options: q.options,
        difficulty: q.difficulty,
        category: q.category,
      })),
    };
  }

  /**
   * 提交单题答案
   */
  async submitQuizAnswer(
    sessionId: bigint,
    attemptId: bigint,
    userAnswer: string,
  ) {
    await this.assertSessionPending(sessionId);

    const attempt = await this.prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.session_id !== sessionId) {
      throw new NotFoundException('题目不存在');
    }
    if (attempt.user_answer) {
      throw new BadRequestException('本题已作答');
    }

    const updated = await this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        user_answer: userAnswer,
        is_correct: userAnswer === attempt.correct_answer,
        answered_at: new Date(),
      },
    });
    return { is_correct: updated.is_correct };
  }

  /**
   * 提交整套题：自动判卷
   */
  async submitQuiz(
    sessionId: bigint,
    answers: { attempt_id: number; answer: string }[],
    retryRound = 0,
  ) {
    await this.assertSessionPending(sessionId);

    if (retryRound >= MAX_QUIZ_RETRY) {
      await this.markSessionFailed(sessionId, '答题重抽次数已用尽');
      return { passed: false, fail_reason: 'retry_exhausted' };
    }

    for (const a of answers) {
      const attempt = await this.prisma.quizAttempt.findUnique({ where: { id: BigInt(a.attempt_id) } });
      if (!attempt || attempt.session_id !== sessionId) continue;
      if (attempt.user_answer) continue;
      await this.prisma.quizAttempt.update({
        where: { id: attempt.id },
        data: {
          user_answer: a.answer,
          is_correct: a.answer === attempt.correct_answer,
          answered_at: new Date(),
        },
      });
    }

    const all = await this.prisma.quizAttempt.findMany({ where: { session_id: sessionId } });
    const correctCount = all.filter((a) => a.is_correct === true).length;

    if (correctCount >= QUIZ_REQUIRED_CORRECT) {
      await this.completeSession(sessionId, {
        method: VerifyMethod.QUIZ,
        correctCount,
        totalCount: all.length,
      });
      return {
        passed: true,
        correct_count: correctCount,
        total_count: all.length,
      };
    }

    // 全部答错或答对不足
    if (retryRound + 1 >= MAX_QUIZ_RETRY) {
      await this.markSessionFailed(sessionId, '答题未通过');
      return { passed: false, fail_reason: 'insufficient_correct', correct_count: correctCount };
    }
    return {
      passed: false,
      can_retry: true,
      retry_remaining: MAX_QUIZ_RETRY - retryRound - 1,
      correct_count: correctCount,
    };
  }

  // ==================== 熟人背书 ====================

  /**
   * 发起背书请求
   */
  async requestEndorsement(sessionId: bigint, endorserKey: string) {
    await this.assertSessionPending(sessionId);

    const session = await this.prisma.verificationSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');

    // 解析 endorserKey：手机号或姓名
    const endorser = endorserKey.match(/^1\d{10}$/)
      ? await this.prisma.user.findUnique({ where: { phone: endorserKey } })
      : await this.prisma.user.findFirst({ where: { nickname: endorserKey } });

    if (!endorser) {
      throw new NotFoundException('未找到该已认证族人，请确认手机号或姓名');
    }
    if (endorser.id === session.scanned_user_id) {
      throw new BadRequestException('不能为自己背书');
    }
    // 校验 endorser 是否为本家族成员
    const isMember = await this.prisma.clanMember.findUnique({
      where: {
        clan_id_user_id: {
          clan_id: session.clan_id,
          user_id: endorser.id,
        },
      },
    });
    if (!isMember) {
      throw new BadRequestException('对方不是本家族成员，无法背书');
    }
    // 月度配额
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthlyCount = await this.prisma.endorsement.count({
      where: {
        endorser_user_id: endorser.id,
        created_at: { gte: monthStart },
      },
    });
    if (monthlyCount >= ENDORSER_MONTHLY_LIMIT) {
      throw new BadRequestException('该族人本月背书次数已达上限（5 次）');
    }

    const endorsement = await this.prisma.endorsement.create({
      data: {
        session_id: sessionId,
        endorser_user_id: endorser.id,
        expire_at: new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000),
      },
    });

    await this.prisma.verificationSession.update({
      where: { id: sessionId },
      data: { verify_method: VerifyMethod.ENDORSEMENT },
    });

    // 通知被背书人
    await this.notification.notify({
      userId: endorser.id,
      clanId: session.clan_id,
      type: 'ENDORSEMENT_REQUEST' as any,
      title: '身份验证背书请求',
      content: `${session.scanner_nickname || '有族人'} 正在请求你为他/她背书成为本家族成员，请在 30 分钟内确认`,
      targetType: 'VerificationSession',
      targetId: sessionId.toString(),
    });

    // 微信模板消息（Mock）
    const clan = await this.prisma.clan.findUnique({ where: { id: session.clan_id } });
    await this.wechat.sendTemplateMessage({
      templateId: process.env.WECHAT_TEMPLATE_ENDORSEMENT || 'mock_template_endorsement',
      openid: 'mock_openid', // 真实应查 endorser.wx_openid
      url: `/h5/endorsement-respond?id=${endorsement.id}`,
      data: {
        first: { value: '身份验证背书请求' },
        keyword1: { value: session.scanner_nickname || '微信用户' },
        keyword2: { value: clan?.name || '本家族' },
        remark: { value: '请尽快确认' },
      },
    });

    return {
      endorsement_id: endorsement.id.toString(),
      expire_at: endorsement.expire_at,
      endorser: { id: endorser.id, nickname: endorser.nickname, phone: endorser.phone.slice(-4).padStart(11, '*') },
    };
  }

  /**
   * 被背书人响应
   */
  async respondEndorsement(
    endorsementId: bigint,
    endorserUserId: string,
    result: EndorsementResult,
    rejectReason?: string,
  ) {
    const endorsement = await this.prisma.endorsement.findUnique({
      where: { id: endorsementId },
      include: { session: true },
    });
    if (!endorsement) throw new NotFoundException('背书请求不存在');
    if (endorsement.endorser_user_id !== endorserUserId) {
      throw new ForbiddenException('只有被请求人可以响应此背书');
    }
    if (endorsement.result) {
      throw new BadRequestException('已处理过该背书请求');
    }
    if (endorsement.expire_at < new Date()) {
      throw new BadRequestException('背书请求已过期');
    }
    if (result === EndorsementResult.REJECTED && !rejectReason) {
      throw new BadRequestException('拒绝时必须填写原因');
    }

    const updated = await this.prisma.endorsement.update({
      where: { id: endorsementId },
      data: {
        result,
        responded_at: new Date(),
        reject_reason: rejectReason,
      },
    });

    if (result === EndorsementResult.CONFIRMED) {
      await this.completeSession(endorsement.session_id, {
        method: VerifyMethod.ENDORSEMENT,
        endorsementId,
      });
    } else if (
      // 背书被拒后，且无其他待背书且为单人背书时
      endorsement.session.verify_method === VerifyMethod.ENDORSEMENT
    ) {
      const stillPending = await this.prisma.endorsement.count({
        where: { session_id: endorsement.session_id, result: null },
      });
      if (stillPending === 0) {
        await this.markSessionFailed(endorsement.session_id, '所有背书人均已拒绝');
      }
    }

    await this.admin.logAction({
      clanId: endorsement.session.clan_id,
      userId: endorserUserId,
      action: `ENDORSEMENT_${result}`,
      targetType: 'Endorsement',
      targetId: endorsementId.toString(),
    });

    return {
      id: updated.id.toString(),
      result: updated.result,
      responded_at: updated.responded_at,
    };
  }

  // ==================== 互发验证二维码 ====================

  /**
   * 已认证族人生成互发验证二维码（30 分钟有效）
   */
  async createPeerQrcode(inviterUserId: string, clanId: bigint) {
    // 验证 inviter 已是该家族成员
    const member = await this.prisma.clanMember.findUnique({
      where: { clan_id_user_id: { clan_id: clanId, user_id: inviterUserId } },
    });
    if (!member) {
      throw new ForbiddenException('仅本家族已认证族人才可发起互发验证');
    }
    const code = this.generateUniqueCode(clanId, 'peer');
    const qrcode = await this.prisma.inviteQrcode.create({
      data: {
        clan_id: clanId,
        creator_id: inviterUserId,
        code,
        purpose: 'peer_verify',
        expire_at: new Date(Date.now() + PEER_QRCODE_TTL_MINUTES * 60 * 1000),
        status: InviteQrcodeStatus.ACTIVE,
      },
    });
    return {
      qrcode_id: qrcode.id.toString(),
      code: qrcode.code,
      url: this.buildScanUrl(qrcode.code),
      inviter_user_id: inviterUserId,
      expire_at: qrcode.expire_at,
    };
  }

  async getPeerQrcode(id: bigint, requestUserId: string) {
    const q = await this.prisma.inviteQrcode.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('互发二维码不存在');
    if (q.creator_id !== requestUserId) {
      throw new ForbiddenException('无权查看他人二维码');
    }
    return {
      ...q,
      id: q.id.toString(),
      clan_id: q.clan_id.toString(),
      url: this.buildScanUrl(q.code),
      effective_status: this.computeQrcodeStatus(q),
    };
  }

  async listMyPeerQrcodes(requestUserId: string) {
    const list = await this.prisma.inviteQrcode.findMany({
      where: { creator_id: requestUserId, purpose: 'peer_verify' },
      orderBy: { created_at: 'desc' },
      take: 30,
    });
    return list.map((q) => ({
      ...q,
      id: q.id.toString(),
      clan_id: q.clan_id.toString(),
      url: this.buildScanUrl(q.code),
      effective_status: this.computeQrcodeStatus(q),
    }));
  }

  // ==================== 通用 ====================

  private generateUniqueCode(clanId: bigint, prefix = 'inv'): string {
    const raw = `${prefix}_${clanId.toString()}_${randomBytes(8).toString('hex')}`;
    const sig = createHash('sha256')
      .update(raw + (process.env.JWT_SECRET || 'geneasphere'))
      .digest('hex')
      .slice(0, 8);
    return `${raw}_${sig}`;
  }

  private buildScanUrl(code: string): string {
    const base = process.env.H5_BASE_URL || '/h5/scan';
    return `${base}?code=${encodeURIComponent(code)}`;
  }

  private computeQrcodeStatus(q: { status: InviteQrcodeStatus; expire_at: Date }) {
    if (q.status === InviteQrcodeStatus.REVOKED) return InviteQrcodeStatus.REVOKED;
    if (q.expire_at < new Date()) return InviteQrcodeStatus.EXPIRED;
    return q.status;
  }

  private async hasClanMembership(userId: string, clanId: bigint) {
    const m = await this.prisma.clanMember.findUnique({
      where: {
        clan_id_user_id: {
          clan_id: clanId,
          user_id: userId,
        },
      },
    });
    return !!m;
  }

  private async assertSessionPending(sessionId: bigint) {
    const session = await this.prisma.verificationSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('会话不存在');
    if (session.status !== VerificationStatus.PENDING) {
      throw new BadRequestException(`会话已结束，状态：${session.status}`);
    }
    if (session.expire_at < new Date()) {
      await this.markSessionExpired(sessionId);
      throw new BadRequestException('会话已过期');
    }
  }

  private async expirePendingSessions() {
    try {
      await this.prisma.verificationSession.updateMany({
        where: {
          status: VerificationStatus.PENDING,
          expire_at: { lt: new Date() },
        },
        data: { status: VerificationStatus.EXPIRED },
      });
      // 同步二维码状态
      await this.prisma.inviteQrcode.updateMany({
        where: {
          status: InviteQrcodeStatus.ACTIVE,
          expire_at: { lt: new Date() },
        },
        data: { status: InviteQrcodeStatus.EXPIRED },
      });
    } catch (e) {
      this.logger.warn(`批量清理过期会话失败: ${(e as Error).message}`);
    }
  }

  private async markSessionExpired(sessionId: bigint) {
    await this.prisma.verificationSession.update({
      where: { id: sessionId },
      data: { status: VerificationStatus.EXPIRED },
    });
  }

  private async markSessionFailed(sessionId: bigint, reason: string) {
    await this.prisma.verificationSession.update({
      where: { id: sessionId },
      data: {
        status: VerificationStatus.FAILED,
        fail_reason: reason,
      },
    });
  }

  private async completeSession(
    sessionId: bigint,
    info: {
      method: VerifyMethod;
      personId?: bigint;
      correctCount?: number;
      totalCount?: number;
      endorsementId?: bigint;
      modification_requests?: any[];
    },
  ) {
    const session = await this.prisma.verificationSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');

    await this.prisma.verificationSession.update({
      where: { id: sessionId },
      data: {
        status: VerificationStatus.PASSED,
        verify_method: info.method,
        passed_at: new Date(),
        matched_person_id: info.personId,
        scanned_user_id: session.scanned_user_id,
      },
    });

    // 自动加入家族
    if (session.scanned_user_id) {
      await this.autoJoinClan(
        session.scanned_user_id,
        session.clan_id,
        info.personId,
        sessionId,
      );
    }

    // 通知
    if (session.scanned_user_id) {
      await this.notification.notify({
        userId: session.scanned_user_id,
        clanId: session.clan_id,
        type: 'VERIFICATION_PASSED' as any,
        title: '身份验证通过',
        content: `你已成功通过身份验证，正式成为本家族成员`,
        targetType: 'VerificationSession',
        targetId: sessionId.toString(),
      });
    }

    return {
      session_id: sessionId.toString(),
      status: VerificationStatus.PASSED,
      method: info.method,
      modification_requests: info.modification_requests || [],
    };
  }

  private async autoJoinClan(userId: string, clanId: bigint, personId: bigint | undefined, sessionId: bigint) {
    const existing = await this.prisma.clanMember.findUnique({
      where: {
        clan_id_user_id: {
          clan_id: clanId,
          user_id: userId,
        },
      },
    });
    if (!existing) {
      await this.prisma.clanMember.create({
        data: {
          clan_id: clanId,
          user_id: userId,
          role: Role.VIEWER,
        },
      });
    }

    // 关联 person 与 user（如尚未建立）
    if (personId) {
      // 当前 schema 中 person 没有 user_id 字段；可写日志提示
      this.logger.log(`已为 user=${userId} 关联 person=${personId.toString()}（familyBook）`);
    }
  }

  // ==================== 出题辅助 ====================

  private async resolveQuizTarget(session: { matched_person_id: bigint | null; submitted_info: any; clan_id: bigint }) {
    if (session.matched_person_id) {
      return { id: session.matched_person_id, ...(await this.fetchPersonContext(session.matched_person_id)) };
    }
    if (session.submitted_info) {
      // 通过姓名+父亲名+出生年自动找一个候选
      const info = session.submitted_info as SubmittedPersonInfo;
      const match = await this.autoMatchPerson(session.clan_id, {
        full_name: info.full_name,
        father_name: info.father_name,
        birth_year: info.birth_year,
      });
      if (match.best_match) {
        return { id: BigInt(match.best_match.person_id), ...(await this.fetchPersonContext(BigInt(match.best_match.person_id))) };
      }
    }
    return null;
  }

  private async fetchPersonContext(personId: bigint) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: {
        children_in: {
          include: {
            family: {
              include: {
                husband: { select: { id: true, full_name: true } },
                wife: { select: { id: true, full_name: true } },
                children: { select: { child_id: true } },
              },
            },
          },
        },
      },
    });
    if (!person) return null;
    const fatherId = person.children_in[0]?.family.husband?.id;
    return {
      id: person.id,
      full_name: person.full_name,
      birth_date: person.birth_date,
      birth_place: person.birth_place,
      father_id: fatherId || null,
      spouse_id: person.children_in[0]?.family.wife?.id || null,
      siblings: person.children_in[0]?.family.children?.map((c) => c.child_id) || [],
    };
  }

  private buildQuestion(opts: {
    sessionId: bigint;
    text: string;
    correct: string;
    distractors: string[];
    difficulty: QuizDifficulty;
    category: string;
  }): QuizQuestion {
    const all = this.shuffle([opts.correct, ...opts.distractors]).slice(0, 4);
    // 保证 correct 在内
    if (!all.includes(opts.correct)) {
      all[0] = opts.correct;
    }
    // 这里先返回一个临时 attempt_id，调用方需在写入 DB 后回填
    const attempt = {
      attempt_id: 0, // 占位
      question: opts.text,
      options: all,
      difficulty: opts.difficulty,
      category: opts.category,
    } as QuizQuestion;
    // 同步创建 DB 记录
    return attempt;
  }

  private async persistAttempt(
    sessionId: bigint,
    text: string,
    options: string[],
    correct: string,
    difficulty: QuizDifficulty,
    category: string,
  ): Promise<QuizQuestion> {
    const created = await this.prisma.quizAttempt.create({
      data: {
        session_id: sessionId,
        question: text,
        options: options as any,
        correct_answer: correct,
        difficulty,
        category,
      },
    });
    return {
      attempt_id: Number(created.id),
      question: created.question,
      options,
      difficulty: created.difficulty,
      category: created.category,
    };
  }

  private async buildRandomQuestions(
    clanId: bigint,
    target: { id: bigint; full_name: string; father_id: bigint | null; spouse_id: bigint | null; siblings: bigint[]; birth_date?: Date; birth_place?: string | null } | any,
    count: number,
  ): Promise<QuizQuestion[]> {
    const sessionId = (target as any)._sessionId as bigint | undefined;
    if (!sessionId) return [];
    const out: QuizQuestion[] = [];

    // 1) 直系长辈生年
    if (target.father_id) {
      const father = await this.prisma.person.findUnique({ where: { id: target.father_id } });
      if (father?.birth_date) {
        const year = father.birth_date.getFullYear();
        const distractors = await this.fetchDistractorYears(clanId, year);
        out.push(
          await this.persistAttempt(
            sessionId,
            `你的父亲出生于哪一年？`,
            this.shuffle([String(year), ...distractors]).slice(0, 4),
            String(year),
            QuizDifficulty.MEDIUM,
            'direct_elder_year',
          ),
        );
      }
    }

    // 2) 旁系：取一个 sibling 出题
    if (target.siblings?.length && out.length < count) {
      const sid = target.siblings[0] as bigint;
      const sibling = await this.prisma.person.findUnique({ where: { id: sid } });
      if (sibling) {
        const distractors = await this.fetchDistractorNames(clanId, sibling.full_name);
        out.push(
          await this.persistAttempt(
            sessionId,
            `你有几个兄弟姐妹？以下哪一位是你的同辈？`,
            this.shuffle([sibling.full_name, ...distractors]).slice(0, 4),
            sibling.full_name,
            QuizDifficulty.MEDIUM,
            'sibling_name',
          ),
        );
      }
    }

    // 3) 出生地
    if (target.birth_place && out.length < count) {
      const distractors = await this.fetchDistractorNames(clanId, target.birth_place, 4);
      out.push(
        await this.persistAttempt(
          sessionId,
          `你的出生地（或籍贯）是？`,
          this.shuffle([target.birth_place, ...distractors]).slice(0, 4),
          target.birth_place,
          QuizDifficulty.HARD,
          'ancestral_place',
        ),
      );
    }

    return out.slice(0, count);
  }

  private async buildGenericQuestion(clanId: bigint, sessionId: bigint): Promise<QuizQuestion> {
    // 兜底：随机抽一个家族成员名字问"以下哪位是本家族成员"
    const samples = await this.prisma.person.findMany({
      where: { clan_id: clanId },
      take: 8,
      select: { full_name: true },
    });
    const names = samples.map((p) => p.full_name);
    if (names.length < 4) {
      return await this.persistAttempt(
        sessionId,
        '请确认你正在加入的家族名称',
        ['张氏家族', '李氏家族', '王氏家族', '赵氏家族'],
        '张氏家族',
        QuizDifficulty.EASY,
        'generic',
      );
    }
    const correct = names[0];
    const distractors = names.slice(1, 4);
    return await this.persistAttempt(
      sessionId,
      '以下哪位有可能是本家族成员？',
      this.shuffle([correct, ...distractors]),
      correct,
      QuizDifficulty.EASY,
      'generic',
    );
  }

  private async fetchDistractorNames(clanId: bigint, correct: string, count = 6): Promise<string[]> {
    const others = await this.prisma.person.findMany({
      where: { clan_id: clanId, NOT: { full_name: correct } },
      take: 20,
      select: { full_name: true },
    });
    return this.shuffle(others.map((p) => p.full_name)).slice(0, count);
  }

  private async fetchDistractorYears(clanId: bigint, correctYear: number, count = 4): Promise<string[]> {
    const years = new Set<number>();
    const persons = await this.prisma.person.findMany({
      where: { clan_id: clanId, birth_date: { not: null } },
      take: 30,
      select: { birth_date: true },
    });
    persons.forEach((p) => {
      if (p.birth_date) years.add(p.birth_date.getFullYear());
    });
    const arr = [...years].filter((y) => y !== correctYear);
    return this.shuffle(arr).slice(0, count).map(String);
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
