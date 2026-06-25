import { Controller, Post, Get, Body, Param, Patch, Query } from '@nestjs/common';
import { TreeService, TreeNode, ClanTreeResponse } from './tree.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { MoveSubTreeDto } from './dto/move-subtree.dto';
import { Person } from '@prisma/client';
import { Public } from '../auth/public.decorator';

/**
 * 族谱树 API
 * - GET 端点（subtree、clan full）允许公开访问：族谱树本身是家族公开信息
 * - 写操作（创建/移动人员）需要登录，由全局 JwtAuthGuard 拦截
 */
@Public()
@Controller('api/tree')
export class TreeController {
  constructor(private readonly treeService: TreeService) {}

  @Post('person')
  async createPerson(@Body() dto: CreatePersonDto): Promise<Person> {
    return await this.treeService.createPerson(
      {
        clan_id: dto.clan_id,
        full_name: dto.full_name,
        gender: dto.gender,
        birth_date: dto.birth_date,
        death_date: dto.death_date,
        is_living: dto.is_living,
      },
      dto.parent_id
    );
  }

  @Get('subtree/:rootPersonId')
  async getSubTree(@Param('rootPersonId') rootPersonId: string): Promise<TreeNode> {
    return await this.treeService.getSubTree(BigInt(rootPersonId));
  }

  /**
   * Get full clan tree data including main lineage path and avatar info
   */
  @Get('clan/:clanId/full')
  async getClanFullTree(
    @Param('clanId') clanId: string,
    @Query('userId') userId?: string,
  ): Promise<ClanTreeResponse> {
    return await this.treeService.getClanFullTree(BigInt(clanId), userId);
  }

  @Patch('move-subtree')
  async moveSubTree(@Body() dto: MoveSubTreeDto): Promise<void> {
    return await this.treeService.moveSubTree(dto.subtree_root_id, dto.new_parent_id);
  }
}
