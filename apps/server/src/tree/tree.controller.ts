import { Controller, Post, Get, Body, Param, Patch } from '@nestjs/common';
import { TreeService, TreeNode } from './tree.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { MoveSubTreeDto } from './dto/move-subtree.dto';
import { Person } from '@prisma/client';

@Controller('tree')
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

  @Patch('move-subtree')
  async moveSubTree(@Body() dto: MoveSubTreeDto): Promise<void> {
    return await this.treeService.moveSubTree(dto.subtree_root_id, dto.new_parent_id);
  }
}
