import { Injectable } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

const RISK_WINDOW_DAYS = 30;
const RISK_CHANGE_THRESHOLD = 3;
const ADULT_AGE = 18;

@Injectable()
export class RelationValidator {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 校验用户是否为所操作 person 的本人
   */
  async assertOwnPerson(userId: string, personId: bigint): Promise<void> {
    const link = await this.prisma.personUserLink.findFirst({
      where: {
        user_id: userId,
        person_id: personId,
        relation_role: 'self',
      },
    });
    if (!link) {
      throw new ForbiddenException('您无权操作此人物');
    }
  }

  /**
   * 校验是否未成年（<18 岁禁止自助更新）
   */
  async assertAdult(personId: bigint): Promise<void> {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { birth_date: true },
    });
    if (!person) {
      throw new BadRequestException('人物不存在');
    }
    if (person.birth_date) {
      const age = this.calculateAge(person.birth_date);
      if (age < ADULT_AGE) {
        throw new ForbiddenException('未成年人暂不支持自助更新家庭关系，请由监护人代为操作');
      }
    }
  }

  /**
   * 检查 30 天内同 person 婚姻变更频率，超过阈值标记为 needs_manual
   */
  async checkMarriageRisk(personId: bigint): Promise<boolean> {
    const since = new Date();
    since.setDate(since.getDate() - RISK_WINDOW_DAYS);

    const count = await this.prisma.familyRelationChange.count({
      where: {
        person_id: personId,
        change_type: 'marriage',
        created_at: { gte: since },
      },
    });
    return count >= RISK_CHANGE_THRESHOLD;
  }

  /**
   * 禁止删除子女 — 子女永远是家族血脉
   */
  assertNotChildDeletion(operation: string): void {
    if (operation === 'delete_child') {
      throw new ForbiddenException('子女永远是家族血脉，不可删除。如需调整抚养关系，请使用"子女归属"功能');
    }
  }

  /**
   * 计算年龄
   */
  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * 验证当前用户是否为子女的父母之一
   */
  async assertIsParent(userId: string, childId: bigint): Promise<{ parentId: bigint }> {
    const userPersonLinks = await this.prisma.personUserLink.findMany({
      where: { user_id: userId, relation_role: 'self' },
      select: { person_id: true },
    });
    const userPersonIds = userPersonLinks.map((l) => l.person_id);

    const custody = await this.prisma.childCustodyRecord.findFirst({
      where: {
        child_id: childId,
        parent_id: { in: userPersonIds },
        effective_to: null,
      },
    });
    if (!custody) {
      throw new ForbiddenException('您不是该子女的父/母');
    }
    return { parentId: custody.parent_id };
  }

  /**
   * 检测子女归属是否存在争议
   */
  async detectDispute(childId: bigint): Promise<boolean> {
    const activeCustody = await this.prisma.childCustodyRecord.findMany({
      where: {
        child_id: childId,
        effective_to: null,
      },
    });
    return activeCustody.length > 1;
  }
}
