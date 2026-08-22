import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { Gender } from '@prisma/client';
import { CreateCrowdsourceNoticeDto } from './dto/create-crowdsource-notice.dto';
import { UpdateCrowdsourceNoticeDto } from './dto/update-crowdsource-notice.dto';
import { CrowdsourceSubmissionDto } from './dto/crowdsource-submission.dto';
import { randomBytes } from 'crypto';

/**
 * 众包通知文案服务（修谱工作流 notify 阶段）
 *
 * 职责：
 *   - 管理员创建通知文案 → 生成唯一 token → 拼 H5 链接发送给族员扫码修改
 *   - 族员通过 H5 完成短信登录 → 提交自己的修改申请
 *   - sent_count 由真实业务事件（族员成功提交）累加；通知解析本身只校验并返回安全文案
 */
@Injectable()
export class GenealogyCrowdsourceService {
  private readonly logger = new Logger(GenealogyCrowdsourceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 生成 32 位 url-safe token。
   */
  private generateToken(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * 通用 BigInt → 字符串的序列化（与项目里 bigint-serializer 保持一致）。
   */
  private serialize<T extends Record<string, any>>(row: T) {
    if (!row) return row;
    const out: any = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'bigint') out[k] = v.toString();
      else if (v instanceof Date) out[k] = v.toISOString();
      else out[k] = v;
    }
    return out;
  }

  async list(clanId: bigint) {
    const rows = await this.prisma.crowdsourceNotice.findMany({
      where: { clan_id: clanId },
      orderBy: { updated_at: 'desc' },
    });
    return rows.map((r) => this.serialize(r));
  }

  async create(clanId: bigint, userId: string, dto: CreateCrowdsourceNoticeDto) {
    if (!dto.title?.trim()) {
      throw new BadRequestException('通知标题不能为空');
    }
    if (!dto.content?.trim()) {
      throw new BadRequestException('通知内容不能为空');
    }
    // 避免 token 冲突：循环直到拿到唯一 token
    let token = this.generateToken();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await this.prisma.crowdsourceNotice.findUnique({
        where: { token },
        select: { id: true },
      });
      if (!exists) break;
      token = this.generateToken();
    }

    const row = await this.prisma.crowdsourceNotice.create({
      data: {
        clan_id: clanId,
        title: dto.title.trim(),
        content: dto.content.trim(),
        start_at: dto.start_at ? new Date(dto.start_at) : null,
        end_at: dto.end_at ? new Date(dto.end_at) : null,
        status: dto.status ?? 'draft',
        token,
        sent_count: 0,
        created_by: userId,
      },
    });
    return this.serialize(row);
  }

  async update(clanId: bigint, id: bigint, dto: UpdateCrowdsourceNoticeDto) {
    const row = await this.prisma.crowdsourceNotice.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('通知文案不存在');
    if (row.clan_id !== clanId) {
      throw new ForbiddenException('无权操作该家族的通知文案');
    }
    const updated = await this.prisma.crowdsourceNotice.update({
      where: { id },
      data: {
        title: dto.title?.trim() ?? row.title,
        content: dto.content?.trim() ?? row.content,
        start_at: dto.start_at ? new Date(dto.start_at) : row.start_at,
        end_at: dto.end_at ? new Date(dto.end_at) : row.end_at,
        status: dto.status ?? row.status,
      },
    });
    return this.serialize(updated);
  }

  async remove(clanId: bigint, id: bigint) {
    const row = await this.prisma.crowdsourceNotice.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('通知文案不存在');
    if (row.clan_id !== clanId) {
      throw new ForbiddenException('无权操作该家族的通知文案');
    }
    await this.prisma.crowdsourceNotice.delete({ where: { id } });
    return { id: id.toString(), deleted: true };
  }

  async resolveNotice(clanId: bigint, token: string) {
    const now = new Date();
    const row = await this.prisma.crowdsourceNotice.findUnique({ where: { token } });
    if (!row || row.clan_id !== clanId) {
      throw new NotFoundException('通知链接不存在');
    }
    if (row.status !== 'sent') {
      throw new BadRequestException(row.status === 'closed' ? '通知链接已关闭' : '通知链接尚未启用');
    }
    if (row.start_at && row.start_at > now) throw new BadRequestException('通知链接尚未生效');
    if (row.end_at && row.end_at < now) throw new BadRequestException('通知链接已过期');

    return {
      id: row.id.toString(),
      title: row.title,
      content: row.content,
      start_at: row.start_at?.toISOString() ?? null,
      end_at: row.end_at?.toISOString() ?? null,
      status: row.status,
    };
  }

  /**
   * H5 端：族员提交族谱信息修改申请
   *
   * 流程：
   *   1) 校验通知文案（status=sent、未过期）
   *   2) 通过 phone 查找 / 自动注册 User
   *   3) 通过 PersonUserLink 优先定位族员本人 Person；找不到时按 full_name 自动匹配
   *   4) 与现有 Person 比对字段，差异部分各自生成 PersonModificationRequest
   *   5) xipai / contact_phone / bio 走统一附加信息条目（reason 携带详情，管理员可人工补充）
   *   6) 累加通知的 sent_count
   */
  async submitH5(clanId: bigint, dto: CrowdsourceSubmissionDto) {
    // 1) 校验通知
    const notice = await this.prisma.crowdsourceNotice.findUnique({
      where: { token: dto.token.trim() },
    });
    if (!notice || notice.clan_id !== clanId) {
      throw new NotFoundException('通知链接不存在');
    }
    if (notice.status !== 'sent') {
      throw new BadRequestException(
        notice.status === 'closed' ? '通知链接已关闭' : '通知链接尚未启用',
      );
    }
    const now = new Date();
    if (notice.start_at && notice.start_at > now) {
      throw new BadRequestException('通知链接尚未生效');
    }
    if (notice.end_at && notice.end_at < now) {
      throw new BadRequestException('通知链接已过期');
    }

    // 2) 通过手机号定位/创建 User
    let user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) {
      const randomPasswordHash =
        '$2a$10$' +
        randomBytes(16).toString('hex') +
        randomBytes(22).toString('base64').replace(/[+/=]/g, 'a').slice(0, 22);
      user = await this.prisma.user.create({
        data: { phone: dto.phone, password_hash: randomPasswordHash },
      });
    }

    // 3) 定位 Person：优先 PersonUserLink（self），其次按姓名匹配
    const link = await this.prisma.personUserLink.findFirst({
      where: {
        user_id: user.id,
        relation_role: 'self',
        person: { clan_id: clanId },
      },
      include: { person: true },
    });
    let person = link?.person ?? null;

    if (!person) {
      person = await this.prisma.person.findFirst({
        where: {
          clan_id: clanId,
          full_name: { equals: dto.full_name.trim() },
        },
        orderBy: { id: 'asc' },
      });
    }

    if (!person) {
      throw new BadRequestException(
        '未在族谱中找到与您姓名匹配的人物，请联系管理员先建立关联后再提交修改',
      );
    }

    // 4) 字段差异 → 修改申请
    const createdRequests: any[] = [];
    const personId = person.id;

    const oldFullName = person.full_name;
    const newFullName = dto.full_name.trim();
    if (oldFullName !== newFullName) {
      createdRequests.push(
        await this.prisma.personModificationRequest.create({
          data: {
            person_id: personId,
            clan_id: clanId,
            requester_user_id: user.id,
            field_name: 'full_name',
            old_value: oldFullName,
            new_value: newFullName,
            reason: 'H5 众包修改',
          },
        }),
      );
    }

    const oldGender = person.gender;
    const newGender = dto.gender === 'female' ? Gender.female : Gender.male;
    if (oldGender !== newGender) {
      createdRequests.push(
        await this.prisma.personModificationRequest.create({
          data: {
            person_id: personId,
            clan_id: clanId,
            requester_user_id: user.id,
            field_name: 'gender',
            old_value: oldGender,
            new_value: newGender === Gender.female ? 'female' : 'male',
            reason: 'H5 众包修改',
          },
        }),
      );
    }

    if (dto.birth_year !== undefined) {
      const oldYear = person.birth_date ? person.birth_date.getFullYear().toString() : '';
      const newYear = String(dto.birth_year);
      if (oldYear !== newYear) {
        createdRequests.push(
          await this.prisma.personModificationRequest.create({
            data: {
              person_id: personId,
              clan_id: clanId,
              requester_user_id: user.id,
              field_name: 'birth_year',
              old_value: oldYear || null,
              new_value: newYear,
              reason: 'H5 众包修改',
            },
          }),
        );
      }
    }

    // 5) 附加信息（xipai / contact_phone / bio）：统一写到 reason，管理员审核时可见
    const extras: string[] = [];
    if (dto.xipai?.trim()) extras.push(`字辈：${dto.xipai.trim()}`);
    if (dto.contact_phone?.trim()) extras.push(`联系电话：${dto.contact_phone.trim()}`);
    if (dto.bio?.trim()) extras.push(`生平简介：${dto.bio.trim()}`);
    if (extras.length > 0) {
      createdRequests.push(
        await this.prisma.personModificationRequest.create({
          data: {
            person_id: personId,
            clan_id: clanId,
            requester_user_id: user.id,
            field_name: 'extra_info',
            old_value: null,
            new_value: extras.join('；'),
            reason: 'H5 众包修改（附加信息）',
          },
        }),
      );
    }

    if (createdRequests.length === 0) {
      throw new BadRequestException('您提交的内容与现有信息一致，无需修改');
    }

    // 6) 通知 sent_count +1（族员真实提交视为一次有效触达）
    await this.prisma.crowdsourceNotice.update({
      where: { id: notice.id },
      data: { sent_count: { increment: 1 } },
    });

    this.logger.log(
      `crowdsource H5 提交成功：clan=${clanId.toString()} person=${personId.toString()} requests=${createdRequests.length}`,
    );

    return {
      notice_id: notice.id.toString(),
      person_id: personId.toString(),
      request_count: createdRequests.length,
      requests: createdRequests.map((r) => ({
        id: r.id.toString(),
        field_name: r.field_name,
      })),
    };
  }

  /**
   * H5 端：族员完成真实业务事件（如族员成功提交修改）后，由内部调用方触发累加。
   * 这里只暴露原子 +1，供内部调用，不暴露 HTTP。
   */
  async incrementSentCount(id: bigint, delta = 1): Promise<void> {
    await this.prisma.crowdsourceNotice.update({
      where: { id },
      data: { sent_count: { increment: delta } },
    });
  }
}