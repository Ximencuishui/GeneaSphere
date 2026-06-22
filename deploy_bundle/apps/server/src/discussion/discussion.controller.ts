import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DiscussionService } from './discussion.service';

@ApiTags('discussion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/discussion')
export class DiscussionController {
  constructor(private readonly discussionService: DiscussionService) {}

  // ==================== 小组管理 ====================

  @Get('groups')
  @ApiOperation({ summary: '获取我加入的小组列表' })
  async listGroups(@Request() req) {
    return this.discussionService.listUserGroups(req.user.userId);
  }

  @Post('groups')
  @ApiOperation({ summary: '创建新小组' })
  async createGroup(@Request() req, @Body() body: { name: string; description?: string; is_public?: boolean }) {
    if (!body.name?.trim()) {
      throw new ForbiddenException('小组名称不能为空');
    }
    return this.discussionService.createGroup(req.user.userId, body);
  }

  @Get('groups/:id')
  @ApiOperation({ summary: '获取小组详情' })
  async getGroup(@Request() req, @Param('id') id: string) {
    const group = await this.discussionService.getGroupById(BigInt(id), req.user.userId);
    if (!group) {
      throw new NotFoundException('小组不存在');
    }
    return group;
  }

  @Patch('groups/:id')
  @ApiOperation({ summary: '更新小组信息' })
  async updateGroup(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; cover_url?: string },
  ) {
    const groupId = BigInt(id);
    await this.discussionService.checkPermission(groupId, req.user.userId, ['CREATOR', 'ADMIN']);
    return this.discussionService.updateGroup(groupId, body);
  }

  @Delete('groups/:id')
  @ApiOperation({ summary: '删除小组' })
  async deleteGroup(@Request() req, @Param('id') id: string) {
    const groupId = BigInt(id);
    await this.discussionService.checkPermission(groupId, req.user.userId, ['CREATOR']);
    await this.discussionService.deleteGroup(groupId);
    return { message: '小组已删除' };
  }

  // ==================== 成员管理 ====================

  @Get('groups/:id/members')
  @ApiOperation({ summary: '获取小组成员列表' })
  async listMembers(@Request() req, @Param('id') id: string) {
    const groupId = BigInt(id);
    await this.discussionService.checkMembership(groupId, req.user.userId);
    return this.discussionService.listMembers(groupId);
  }

  @Post('groups/:id/members')
  @ApiOperation({ summary: '邀请成员加入小组' })
  async inviteMember(@Request() req, @Param('id') id: string, @Body() body: { user_ids: string[] }) {
    const groupId = BigInt(id);
    await this.discussionService.checkPermission(groupId, req.user.userId, ['CREATOR', 'ADMIN']);
    if (!body.user_ids?.length) {
      throw new ForbiddenException('请选择要邀请的成员');
    }
    return this.discussionService.inviteMembers(groupId, body.user_ids);
  }

  @Delete('groups/:id/members/:userId')
  @ApiOperation({ summary: '移除小组成员' })
  async removeMember(@Request() req, @Param('id') id: string, @Param('userId') userId: string) {
    const groupId = BigInt(id);
    // 创建者可移除任何人，管理员可移除普通成员，成员可移除自己
    const myRole = await this.discussionService.getMemberRole(groupId, req.user.userId);
    if (myRole !== 'CREATOR' && myRole !== 'ADMIN' && req.user.userId !== userId) {
      throw new ForbiddenException('无权限移除该成员');
    }
    if (myRole === 'ADMIN') {
      const targetRole = await this.discussionService.getMemberRole(groupId, userId);
      if (targetRole === 'CREATOR' || targetRole === 'ADMIN') {
        throw new ForbiddenException('无权限移除该成员');
      }
    }
    return this.discussionService.removeMember(groupId, userId);
  }

  @Patch('groups/:id/members/:userId/role')
  @ApiOperation({ summary: '修改成员角色' })
  async updateMemberRole(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { role: string },
  ) {
    const groupId = BigInt(id);
    await this.discussionService.checkPermission(groupId, req.user.userId, ['CREATOR']);
    if (body.role !== 'ADMIN' && body.role !== 'MEMBER') {
      throw new ForbiddenException('无效的角色');
    }
    return this.discussionService.updateMemberRole(groupId, userId, body.role);
  }

  // ==================== 话题管理 ====================

  @Get('groups/:id/topics')
  @ApiOperation({ summary: '获取小组话题列表' })
  async listTopics(
    @Request() req,
    @Param('id') id: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('keyword') keyword?: string,
  ) {
    const groupId = BigInt(id);
    await this.discussionService.checkMembership(groupId, req.user.userId);
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    return this.discussionService.listTopics(groupId, page, pageSize, keyword);
  }

  @Post('groups/:id/topics')
  @ApiOperation({ summary: '创建话题' })
  async createTopic(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { title: string; content: string },
  ) {
    const groupId = BigInt(id);
    await this.discussionService.checkMembership(groupId, req.user.userId);
    if (!body.title?.trim() || !body.content?.trim()) {
      throw new ForbiddenException('话题标题和内容不能为空');
    }
    return this.discussionService.createTopic(groupId, req.user.userId, body);
  }

  @Get('topics/:id')
  @ApiOperation({ summary: '获取话题详情（含回复）' })
  async getTopic(
    @Request() req,
    @Param('id') id: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const topicId = BigInt(id);
    const topic = await this.discussionService.getTopicById(topicId);
    if (!topic) {
      throw new NotFoundException('话题不存在');
    }
    await this.discussionService.checkMembership(topic.group_id, req.user.userId);
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    return this.discussionService.getTopicDetail(topicId, page, pageSize);
  }

  @Delete('topics/:id')
  @ApiOperation({ summary: '删除话题' })
  async deleteTopic(@Request() req, @Param('id') id: string) {
    const topicId = BigInt(id);
    const topic = await this.discussionService.getTopicById(topicId);
    if (!topic) {
      throw new NotFoundException('话题不存在');
    }
    await this.discussionService.checkPermission(topic.group_id, req.user.userId, ['CREATOR', 'ADMIN']);
    // 话题作者也可删除自己的话题
    if (topic.author_id !== req.user.userId) {
      await this.discussionService.checkPermission(topic.group_id, req.user.userId, ['CREATOR', 'ADMIN']);
    }
    await this.discussionService.deleteTopic(topicId);
    return { message: '话题已删除' };
  }

  @Patch('topics/:id/pin')
  @ApiOperation({ summary: '置顶/取消置顶话题' })
  async togglePin(@Request() req, @Param('id') id: string, @Body() body: { is_pinned: boolean }) {
    const topicId = BigInt(id);
    const topic = await this.discussionService.getTopicById(topicId);
    if (!topic) {
      throw new NotFoundException('话题不存在');
    }
    await this.discussionService.checkPermission(topic.group_id, req.user.userId, ['CREATOR', 'ADMIN']);
    return this.discussionService.togglePinTopic(topicId, body.is_pinned);
  }

  // ==================== 回复管理 ====================

  @Post('topics/:id/replies')
  @ApiOperation({ summary: '发布回复' })
  async createReply(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { content: string; media_urls?: string[] },
  ) {
    const topicId = BigInt(id);
    const topic = await this.discussionService.getTopicById(topicId);
    if (!topic) {
      throw new NotFoundException('话题不存在');
    }
    await this.discussionService.checkMembership(topic.group_id, req.user.userId);
    if (!body.content?.trim()) {
      throw new ForbiddenException('回复内容不能为空');
    }
    return this.discussionService.createReply(topicId, req.user.userId, body);
  }

  @Delete('replies/:id')
  @ApiOperation({ summary: '删除回复' })
  async deleteReply(@Request() req, @Param('id') id: string) {
    const reply = await this.discussionService.getReplyById(BigInt(id));
    if (!reply) {
      throw new NotFoundException('回复不存在');
    }
    // 作者或小组管理员可删除
    if (reply.author_id !== req.user.userId) {
      await this.discussionService.checkPermission(reply.topic.group_id, req.user.userId, ['CREATOR', 'ADMIN']);
    }
    await this.discussionService.deleteReply(BigInt(id));
    return { message: '回复已删除' };
  }

  // ==================== 未读数 ====================

  @Get('groups/:id/unread-count')
  @ApiOperation({ summary: '获取小组未读话题数' })
  async getUnreadCount(@Request() req, @Param('id') id: string) {
    const groupId = BigInt(id);
    await this.discussionService.checkMembership(groupId, req.user.userId);
    return this.discussionService.getUnreadCount(groupId, req.user.userId);
  }

  @Post('groups/:id/mark-read')
  @ApiOperation({ summary: '标记小组已读' })
  async markRead(@Request() req, @Param('id') id: string) {
    const groupId = BigInt(id);
    await this.discussionService.checkMembership(groupId, req.user.userId);
    await this.discussionService.markGroupAsRead(groupId, req.user.userId);
    return { message: '已标记为已读' };
  }
}