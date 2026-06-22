import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
  ForbiddenException,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DiscussionService } from './discussion.service';
import { AiSummaryService } from './ai-summary.service';

@ApiTags('discussion/summary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/discussion')
export class SummaryController {
  constructor(
    private readonly discussionService: DiscussionService,
    private readonly aiSummaryService: AiSummaryService,
  ) {}

  // ==================== 总结列表 ====================

  @Get('groups/:id/summaries')
  @ApiOperation({ summary: '获取小组讨论总结列表' })
  async listSummaries(@Request() req, @Param('id') id: string) {
    const groupId = BigInt(id);
    await this.discussionService.checkMembership(groupId, req.user.userId);
    return this.aiSummaryService.listSummaries(groupId);
  }

  // ==================== 生成总结 ====================

  @Post('topics/:id/summary')
  @ApiOperation({ summary: '生成话题级讨论总结' })
  async generateTopicSummary(
    @Request() req,
    @Param('id') id: string,
  ) {
    const topicId = BigInt(id);
    const topic = await this.discussionService.getTopicById(topicId);
    if (!topic) {
      throw new NotFoundException('话题不存在');
    }
    await this.discussionService.checkMembership(topic.group_id, req.user.userId);

    // 检查权限：创建者或话题作者可生成
    const myRole = await this.discussionService.getMemberRole(topic.group_id, req.user.userId);
    const isTopicAuthor = topic.author_id === req.user.userId;
    if (myRole !== 'CREATOR' && myRole !== 'ADMIN' && !isTopicAuthor) {
      throw new ForbiddenException('无权限生成此话题的总结');
    }

    return this.aiSummaryService.generateTopicSummary(topicId, req.user.userId);
  }

  @Post('groups/:id/summary')
  @ApiOperation({ summary: '生成小组级讨论总结' })
  async generateGroupSummary(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { time_range_start?: string; time_range_end?: string },
  ) {
    const groupId = BigInt(id);
    // 仅创建者可生成小组级总结
    await this.discussionService.checkPermission(groupId, req.user.userId, ['CREATOR']);

    return this.aiSummaryService.generateGroupSummary(
      groupId,
      req.user.userId,
      body.time_range_start ? new Date(body.time_range_start) : undefined,
      body.time_range_end ? new Date(body.time_range_end) : undefined,
    );
  }

  // ==================== 总结详情 ====================

  @Get('summaries/:id')
  @ApiOperation({ summary: '获取总结详情' })
  async getSummary(@Request() req, @Param('id') id: string) {
    const summary = await this.aiSummaryService.getSummaryById(BigInt(id));
    if (!summary) {
      throw new NotFoundException('总结不存在');
    }
    await this.discussionService.checkMembership(BigInt(summary.group_id), req.user.userId);
    return summary;
  }

  // ==================== 编辑总结 ====================

  @Put('summaries/:id')
  @ApiOperation({ summary: '编辑总结内容' })
  async updateSummary(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { content: any },
  ) {
    const summary = await this.aiSummaryService.getSummaryById(BigInt(id));
    if (!summary) {
      throw new NotFoundException('总结不存在');
    }
    await this.discussionService.checkMembership(BigInt(summary.group_id), req.user.userId);

    // 检查权限
    const myRole = await this.discussionService.getMemberRole(BigInt(summary.group_id), req.user.userId);
    const isGenerator = summary.generated_by === req.user.userId;
    if (myRole !== 'CREATOR' && myRole !== 'ADMIN' && !isGenerator) {
      throw new ForbiddenException('无权限编辑此总结');
    }

    return this.aiSummaryService.updateSummary(BigInt(id), req.user.userId, body.content);
  }

  // ==================== 版本历史 ====================

  @Get('summaries/:id/versions')
  @ApiOperation({ summary: '获取总结版本历史' })
  async getVersions(@Request() req, @Param('id') id: string) {
    const summary = await this.aiSummaryService.getSummaryById(BigInt(id));
    if (!summary) {
      throw new NotFoundException('总结不存在');
    }
    await this.discussionService.checkMembership(BigInt(summary.group_id), req.user.userId);
    return this.aiSummaryService.getVersions(BigInt(id));
  }

  // ==================== 导出 ====================

  @Get('summaries/:id/export')
  @ApiOperation({ summary: '导出总结为 Markdown 或 PDF' })
  async exportSummary(
    @Request() req,
    @Param('id') id: string,
    @Query('format') format: 'md' | 'pdf' = 'md',
    @Res() res: Response,
  ) {
    const summary = await this.aiSummaryService.getSummaryById(BigInt(id));
    if (!summary) {
      throw new NotFoundException('总结不存在');
    }
    await this.discussionService.checkMembership(BigInt(summary.group_id), req.user.userId);

    if (format === 'md') {
      const markdown = this.aiSummaryService.toMarkdown(summary);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${summary.title}.md"`);
      res.send(markdown);
    } else {
      // PDF 导出：返回 JSON，让前端处理或复用打印服务
      const html = this.aiSummaryService.toHtml(summary);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    }
  }
}