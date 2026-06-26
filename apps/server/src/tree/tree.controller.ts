import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { TreeService, TreeNode, ClanTreeResponse } from './tree.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { MoveSubTreeDto } from './dto/move-subtree.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { CreateMarriageDto } from './dto/create-marriage.dto';
import { CheckKinshipDto } from './dto/check-kinship.dto';
import { Person } from '@prisma/client';
import { Public } from '../auth/public.decorator';
import { ClanResolverService } from '../common/clan-resolver.service';
import { AdminService } from '../admin/admin.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * 族谱树 API
 * - GET 端点（subtree、clan full、person detail、kinship check）公开访问：族谱树本身是家族公开信息
 * - 写端点（create/update/delete/move）必须登录 + clan admin，由全局 JwtAuthGuard + assertClanAdmin 拦截
 *
 * 设计要点：**不要在 controller 级加 @Public()**，
 * 全局 JwtAuthGuard 看到 @Public 就跳过，req.user 永远是 undefined，
 * 写端点的 assertClanAdmin 会全部 403。请按端点单独加 @Public() 装饰。
 */
@Controller('api/tree')
export class TreeController {
  constructor(
    private readonly treeService: TreeService,
    private readonly clanResolver: ClanResolverService,
    private readonly adminService: AdminService,
  ) {}

  /**
   * 通用权限校验：要求 userId 是 person / family 所属 clan 的管理员
   * - person / family 不存在 → 404
   * - 无权限 → 403
   */
  private async assertClanAdmin(
    userId: string | undefined,
    clanId: bigint | null,
  ): Promise<bigint> {
    if (!clanId) throw new NotFoundException('资源不存在');
    if (!userId) throw new ForbiddenException('需要登录');
    await this.adminService.requireAdmin(clanId, userId);
    return clanId;
  }

  /**
   * (P2-N) 写入族谱树类操作的审计日志
   * - fire-and-forget：不阻塞主流程；写入失败仅 dev 模式 console.error
   * - 不写日志：clanId 或 userId 缺失时（理论上 assertClanAdmin 已拦截）
   */
  private logTreeAction(
    clanId: bigint | null | undefined,
    userId: string | undefined,
    action: string,
    targetType?: string,
    targetId?: string,
    details?: string,
  ): void {
    if (!clanId || !userId) return;
    this.adminService
      .logAction({ clanId, userId, action, targetType, targetId, details })
      .catch((e) => {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.error(`[TreeController] audit log failed: action=${action}`, e);
        }
      });
  }

  @Post('person')
  async createPerson(
    @Body() dto: CreatePersonDto,
    @Req() req: any,
  ): Promise<Person> {
    const userId = req?.user?.userId as string | undefined;
    const result = await this.treeService.createPerson(
      {
        clan_id: dto.clan_id,
        full_name: dto.full_name,
        gender: dto.gender,
        birth_date: dto.birth_date,
        death_date: dto.death_date,
        is_living: dto.is_living,
      },
      dto.parent_id,
    );
    this.logTreeAction(
      dto.clan_id,
      userId,
      'tree.person.create',
      'person',
      result.id.toString(),
      JSON.stringify({ parent_id: dto.parent_id?.toString() ?? null }),
    );
    return result;
  }

  @Public()
  @Get('subtree/:rootPersonId')
  async getSubTree(@Param('rootPersonId') rootPersonId: string): Promise<TreeNode> {
    return await this.treeService.getSubTree(BigInt(rootPersonId));
  }

  /**
   * Get full clan tree data including main lineage path, avatar info, and spouse edges.
   * 与其他 admin 路由一致：URL 段使用 clanSlug，由 ClanResolverService 解析为 BigInt，
   * 顺便校验 NORMAL 状态（封禁/审核中家族拒绝访问）。
   */
  @Public()
  @Get('clan/:clanSlug/full')
  async getClanFullTree(
    @Param('clanSlug') clanSlug: string,
    @Query('userId') userId?: string,
  ): Promise<ClanTreeResponse> {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return await this.treeService.getClanFullTree(clanId, userId);
  }

  @Patch('move-subtree')
  async moveSubTree(@Body() dto: MoveSubTreeDto, @Req() req: any): Promise<void> {
    const userId = req?.user?.userId as string | undefined;
    const clanId = await this.treeService.getPersonClanId(dto.subtree_root_id);
    await this.assertClanAdmin(userId, clanId);
    await this.treeService.moveSubTree(dto.subtree_root_id, dto.new_parent_id);
    this.logTreeAction(
      clanId,
      userId,
      'tree.subtree.move',
      'person',
      dto.subtree_root_id.toString(),
      JSON.stringify({ new_parent_id: dto.new_parent_id?.toString() ?? null }),
    );
  }

  /**
   * 更新人物基础信息（侧栏编辑保存）
   */
  @Patch('person/:personId')
  async updatePerson(
    @Param('personId') personId: string,
    @Body() dto: UpdatePersonDto,
    @Req() req: any,
  ): Promise<Person> {
    const userId = req?.user?.userId as string | undefined;
    const pid = BigInt(personId);
    const clanId = await this.treeService.getPersonClanId(pid);
    await this.assertClanAdmin(userId, clanId);
    const result = await this.treeService.updatePerson(pid, {
      full_name: dto.full_name,
      gender: dto.gender,
      birth_date: dto.birth_date,
      death_date: dto.death_date,
      is_living: dto.is_living,
      birth_place: dto.birth_place,
      death_place: dto.death_place,
      migration_branch: dto.migration_branch,
    });
    this.logTreeAction(
      clanId,
      userId,
      'tree.person.update',
      'person',
      pid.toString(),
    );
    return result;
  }

  /**
   * 获取单个人物详情（父母/配偶/子女）—— 侧栏抽屉打开时调用
   */
  @Public()
  @Get('person/:personId/detail')
  async getPersonDetail(@Param('personId') personId: string) {
    return await this.treeService.getPersonDetail(BigInt(personId));
  }

  /**
   * 创建婚姻（FamilyUnit）
   * - 内置血缘合法性校验：近亲直接返回 409 CONSANGUINEOUS_MARRIAGE
   * - 自动检测婚姻序号（再婚）
   */
  @Post('marriage')
  async createMarriage(@Body() dto: CreateMarriageDto, @Req() req: any) {
    const userId = req?.user?.userId as string | undefined;
    await this.assertClanAdmin(userId, dto.clan_id);
    const result = await this.treeService.createMarriage({
      clan_id: dto.clan_id,
      husband_id: dto.husband_id,
      wife_id: dto.wife_id,
      marriage_date: dto.marriage_date,
      end_date: dto.end_date,
      end_reason: dto.end_reason,
      is_current: dto.is_current,
      note: dto.note,
    });
    this.logTreeAction(
      dto.clan_id,
      userId,
      'tree.marriage.create',
      'family',
      result.id.toString(),
      JSON.stringify({
        husband_id: dto.husband_id?.toString() ?? null,
        wife_id: dto.wife_id?.toString() ?? null,
      }),
    );
    return result;
  }

  /**
   * 血缘校验（前端创建婚姻前预检）
   * 返回 { isConsanguineous, relationship, commonAncestors }
   * 计算密集、无敏感写操作，公开访问
   */
  @Public()
  @Post('kinship-check')
  async checkKinship(@Body() dto: CheckKinshipDto) {
    return await this.treeService.isConsanguineous(
      BigInt(dto.person_a_id),
      BigInt(dto.person_b_id),
    );
  }

  /**
   * 软删除人物（用于「撤销栈」自动回滚，非业务主流程入口）
   * - 写操作需要登录，由全局 JwtAuthGuard 拦截
   * - 当前用户 id 注入 deleted_by 以便审计
   * - 校验：必须是 person 所属 clan 的管理员
   */
  @Delete('person/:personId')
  async deletePerson(
    @Param('personId') personId: string,
    @Req() req: any,
  ): Promise<void> {
    const userId = req?.user?.userId as string | undefined;
    const pid = BigInt(personId);
    const clanId = await this.treeService.getPersonClanId(pid);
    await this.assertClanAdmin(userId, clanId);
    await this.treeService.softDeletePerson(pid, userId);
    this.logTreeAction(clanId, userId, 'tree.person.soft_delete', 'person', pid.toString());
  }

  /**
   * 恢复已软删除的人物（撤销栈使用）
   * - 校验：必须是 person 所属 clan 的管理员
   */
  @Patch('person/:personId/restore')
  async restorePerson(
    @Param('personId') personId: string,
    @Req() req: any,
  ): Promise<void> {
    const userId = req?.user?.userId as string | undefined;
    const pid = BigInt(personId);
    // 软删除的 person 也需要拿到 clan_id 来校验权限，故 includeDeleted: true
    const clanId = await this.treeService.getPersonClanId(pid, { includeDeleted: true });
    await this.assertClanAdmin(userId, clanId);
    await this.treeService.restorePerson(pid);
    this.logTreeAction(clanId, userId, 'tree.person.restore', 'person', pid.toString());
  }

  /**
   * 删除婚姻（FamilyUnit），用于撤销栈回滚
   * - 校验：必须是 family 所属 clan 的管理员
   */
  @Delete('marriage/:familyId')
  async deleteMarriage(
    @Param('familyId') familyId: string,
    @Req() req: any,
  ): Promise<void> {
    const userId = req?.user?.userId as string | undefined;
    const fid = BigInt(familyId);
    const clanId = await this.treeService.getFamilyClanId(fid);
    await this.assertClanAdmin(userId, clanId);
    await this.treeService.deleteFamilyUnit(fid);
    this.logTreeAction(clanId, userId, 'tree.marriage.delete', 'family', fid.toString());
  }
}