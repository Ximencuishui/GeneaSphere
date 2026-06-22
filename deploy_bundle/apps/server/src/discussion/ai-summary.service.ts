import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@geneasphere/db';
import { SummaryType } from '@prisma/client';

// OpenAI SDK 是可选依赖：未安装时优雅降级，不影响其他功能
let OpenAI: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  OpenAI = require('openai').default || require('openai');
} catch {
  OpenAI = null;
}

interface SummaryContent {
  background: string;
  main_points: Array<{ author: string; point: string; evidence?: string }>;
  consensus: string[];
  disagreements: string[];
  action_items: Array<{ task: string; assignee?: string; deadline?: string }>;
  attachments: Array<{ type: string; url: string; description: string }>;
}

interface DiscussionSummaryData {
  id: bigint;
  group_id: bigint;
  summary_type: SummaryType;
  source_topic_id?: bigint;
  time_range_start?: Date;
  time_range_end?: Date;
  title: string;
  content: SummaryContent;
  generated_by: string;
  version: number;
  created_at: Date;
  updated_at: Date;
  group?: { id: bigint; name: string };
  topic?: { id: bigint; title: string; author: { nickname?: string } };
  generator?: { id: string; nickname?: string };
}

@Injectable()
export class AiSummaryService {
  private readonly deepseekClient: any;
  private readonly deepseekModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY');
    const baseURL = this.configService.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com';
    this.deepseekModel = this.configService.get<string>('DEEPSEEK_MODEL') || 'deepseek-v4-flash';

    if (OpenAI) {
      try {
        this.deepseekClient = new OpenAI({
          baseURL,
          apiKey: apiKey || '',
        });
      } catch {
        this.deepseekClient = null;
      }
    } else {
      this.deepseekClient = null;
    }
  }

  // ==================== 总结列表 ====================

  async listSummaries(groupId: bigint) {
    const summaries = await this.prisma.discussionSummary.findMany({
      where: { group_id: groupId, deleted_at: null },
      include: {
        topic: { select: { id: true, title: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    // 批量获取生成者信息
    const userIds = summaries.map((s) => s.generated_by);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, avatar_url: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return summaries.map((s) => {
      const user = userMap.get(s.generated_by);
      return {
        id: s.id.toString(),
        group_id: s.group_id.toString(),
        group_name: s.group?.name,
        summary_type: s.summary_type,
        source_topic_id: s.source_topic_id?.toString(),
        source_topic_title: s.topic?.title,
        title: s.title,
        version: s.version,
        generated_by: {
          id: s.generated_by,
          nickname: user?.nickname || '未知用户',
          avatar_url: user?.avatar_url,
        },
        created_at: s.created_at.toISOString(),
        updated_at: s.updated_at.toISOString(),
      };
    });
  }

  // ==================== 生成话题总结 ====================

  async generateTopicSummary(topicId: bigint, userId: string) {
    // 获取话题和回复
    const topic = await this.prisma.groupTopic.findUnique({
      where: { id: topicId },
      include: {
        replies: {
          where: { deleted_at: null },
          include: { author: { select: { nickname: true } } },
          orderBy: { created_at: 'asc' },
        },
        group: { select: { id: true, name: true } },
      },
    });

    if (!topic) {
      throw new BadRequestException('话题不存在');
    }

    if (topic.replies.length < 3) {
      throw new BadRequestException('讨论内容较少（少于3条回复），生成的总结可能不够完整。建议继续讨论后再生成总结。');
    }

    // 构造讨论内容文本
    const discussionText = this.buildDiscussionText(topic.title, topic.content, topic.replies);

    // 调用 AI 生成总结
    let summaryContent: SummaryContent;
    try {
      summaryContent = await this.callAiForSummary(discussionText, 'topic', topic.title);
    } catch (error) {
      console.error('AI 生成失败:', error);
      throw new BadRequestException('AI 生成失败，请稍后重试或手动撰写总结');
    }

    // 生成标题
    const title = `关于《${topic.title}》的讨论总结`;

    // 保存总结
    const summary = await this.prisma.discussionSummary.create({
      data: {
        group_id: topic.group_id,
        summary_type: SummaryType.topic,
        source_topic_id: topicId,
        title,
        content: summaryContent as any,
        generated_by: userId,
      },
    });

    // 发送通知（静默方式，仅站内信）
    await this.sendSummaryNotification(topic.group_id, summary.id, title, topic.group.name);

    return {
      id: summary.id.toString(),
      title: summary.title,
      summary_type: summary.summary_type,
      message: '总结生成成功',
    };
  }

  // ==================== 生成小组总结 ====================

  async generateGroupSummary(groupId: bigint, userId: string, timeRangeStart?: Date, timeRangeEnd?: Date) {
    // 获取小组内一段时间内的所有话题和回复
    const where: any = {
      group_id: groupId,
      deleted_at: null,
    };

    if (timeRangeStart || timeRangeEnd) {
      where.created_at = {};
      if (timeRangeStart) where.created_at.gte = timeRangeStart;
      if (timeRangeEnd) where.created_at.lte = timeRangeEnd;
    }

    const topics = await this.prisma.groupTopic.findMany({
      where,
      include: {
        replies: {
          where: { deleted_at: null },
          include: { author: { select: { nickname: true } } },
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    if (topics.length === 0) {
      throw new BadRequestException('指定时间范围内没有讨论内容');
    }

    // 统计回复数
    const totalReplies = topics.reduce((sum, t) => sum + t.replies.length, 0);
    if (totalReplies < 3) {
      throw new BadRequestException('讨论内容较少（少于3条回复），生成的总结可能不够完整');
    }

    // 构造讨论内容文本
    const discussionText = topics
      .map((t) => `【话题】${t.title}\n${t.content}\n\n回复：\n${t.replies.map((r) => `${r.author.nickname || '匿名'}：${r.content}`).join('\n')}`)
      .join('\n\n---\n\n');

    // 调用 AI 生成总结
    let summaryContent: SummaryContent;
    try {
      summaryContent = await this.callAiForSummary(discussionText, 'group');
    } catch (error) {
      console.error('AI 生成失败:', error);
      throw new BadRequestException('AI 生成失败，请稍后重试或手动撰写总结');
    }

    // 生成标题
    const group = await this.prisma.discussionGroup.findUnique({ where: { id: groupId } });
    const dateStr = timeRangeEnd ? new Date(timeRangeEnd).toLocaleDateString('zh-CN') : '至今';
    const title = `${group?.name || '小组'}讨论总结（${dateStr}）`;

    // 保存总结
    const summary = await this.prisma.discussionSummary.create({
      data: {
        group_id: groupId,
        summary_type: SummaryType.group,
        time_range_start: timeRangeStart,
        time_range_end: timeRangeEnd,
        title,
        content: summaryContent as any,
        generated_by: userId,
      },
    });

    // 发送通知
    await this.sendSummaryNotification(groupId, summary.id, title, group?.name);

    return {
      id: summary.id.toString(),
      title: summary.title,
      summary_type: summary.summary_type,
      message: '总结生成成功',
    };
  }

  // ==================== 总结详情 ====================

  async getSummaryById(summaryId: bigint) {
    const summary = await this.prisma.discussionSummary.findUnique({
      where: { id: summaryId },
      include: {
        topic: { select: { id: true, title: true } },
        group: { select: { id: true, name: true } },
      },
    });

    if (!summary) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: summary.generated_by },
      select: { id: true, nickname: true, avatar_url: true },
    });

    return {
      id: summary.id.toString(),
      group_id: summary.group_id.toString(),
      group_name: summary.group?.name,
      summary_type: summary.summary_type,
      source_topic_id: summary.source_topic_id?.toString(),
      source_topic_title: summary.topic?.title,
      time_range_start: summary.time_range_start?.toISOString(),
      time_range_end: summary.time_range_end?.toISOString(),
      title: summary.title,
      content: summary.content,
      version: summary.version,
      generated_by: {
        id: summary.generated_by,
        nickname: user?.nickname || '未知用户',
        avatar_url: user?.avatar_url,
      },
      created_at: summary.created_at.toISOString(),
      updated_at: summary.updated_at.toISOString(),
    };
  }

  // ==================== 编辑总结 ====================

  async updateSummary(summaryId: bigint, editorId: string, content: SummaryContent) {
    // 保存当前版本到历史
    const current = await this.prisma.discussionSummary.findUnique({ where: { id: summaryId } });
    if (current) {
      await this.prisma.summaryVersion.create({
        data: {
          summary_id: summaryId,
          version: current.version,
          content: current.content,
          editor_id: editorId,
        },
      });
    }

    // 更新总结内容，版本号 +1
    const updated = await this.prisma.discussionSummary.update({
      where: { id: summaryId },
      data: {
        content: content as any,
        version: { increment: 1 },
      },
    });

    return {
      id: updated.id.toString(),
      title: updated.title,
      version: updated.version,
      message: '总结已更新',
    };
  }

  // ==================== 版本历史 ====================

  async getVersions(summaryId: bigint) {
    const versions = await this.prisma.summaryVersion.findMany({
      where: { summary_id: summaryId },
      orderBy: { version: 'desc' },
    });

    // 批量获取编辑者信息
    const userIds = versions.map((v) => v.editor_id);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return versions.map((v) => {
      const user = userMap.get(v.editor_id);
      return {
        version: v.version,
        content: v.content,
        editor: {
          id: v.editor_id,
          nickname: user?.nickname || '未知用户',
        },
        edited_at: v.edited_at.toISOString(),
      };
    });
  }

  // ==================== 导出格式转换 ====================

  toMarkdown(summary: any): string {
    const content = summary.content as SummaryContent;
    let md = `# ${summary.title}\n\n`;
    md += `**生成时间**: ${new Date(summary.created_at).toLocaleString('zh-CN')}\n`;
    md += `**版本**: v${summary.version}\n`;
    md += `**生成者**: ${summary.generator?.nickname || '未知'}\n\n`;

    md += `## 讨论背景\n\n${content.background || '无'}\n\n`;

    md += `## 主要观点\n\n`;
    if (content.main_points?.length) {
      content.main_points.forEach((p, i) => {
        md += `${i + 1}. **${p.author}**: ${p.point}`;
        if (p.evidence) md += `\n   - 证据: ${p.evidence}`;
        md += '\n';
      });
    } else {
      md += '无\n';
    }
    md += '\n';

    md += `## 共识\n\n`;
    if (content.consensus?.length) {
      content.consensus.forEach((c) => md += `- ${c}\n`);
    } else {
      md += '无\n';
    }
    md += '\n';

    md += `## 分歧\n\n`;
    if (content.disagreements?.length) {
      content.disagreements.forEach((d) => md += `- ${d}\n`);
    } else {
      md += '无\n';
    }
    md += '\n';

    md += `## 待办事项\n\n`;
    if (content.action_items?.length) {
      content.action_items.forEach((item) => {
        md += `- [ ] ${item.task}`;
        if (item.assignee) md += ` (负责人: ${item.assignee})`;
        if (item.deadline) md += ` (截止: ${item.deadline})`;
        md += '\n';
      });
    } else {
      md += '无\n';
    }
    md += '\n';

    if (content.attachments?.length) {
      md += `## 附件索引\n\n`;
      content.attachments.forEach((a) => md += `- [${a.description}](${a.url})\n`);
    }

    return md;
  }

  toHtml(summary: any): string {
    const content = summary.content as SummaryContent;
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${summary.title}</title>
<style>
body{font-family:system-ui;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}
h1{color:#5d4037;border-bottom:2px solid #8d6e63;padding-bottom:10px}
h2{color:#6d4c41;margin-top:30px}
.toc{background:#f5f5f5;padding:15px;border-radius:8px}
.meta{color:#888;font-size:14px}
.point{margin:10px 0;padding:10px;background:#fafafa;border-left:3px solid #8d6e63}
.action{background:#fff3e0;padding:10px;margin:5px 0;border-radius:4px}
</style></head>
<body>
<h1>${summary.title}</h1>
<div class="meta">
  <p>生成时间: ${new Date(summary.created_at).toLocaleString('zh-CN')} | 版本: v${summary.version} | 生成者: ${summary.generator?.nickname || '未知'}</p>
</div>

<h2>讨论背景</h2>
<p>${content.background || '无'}</p>

<h2>主要观点</h2>
${content.main_points?.length ? content.main_points.map((p) => `<div class="point"><strong>${p.author}:</strong> ${p.point}${p.evidence ? `<br><em>证据: ${p.evidence}</em>` : ''}</div>`).join('') : '<p>无</p>'}

<h2>共识</h2>
${content.consensus?.length ? `<ul>${content.consensus.map((c) => `<li>${c}</li>`).join('')}</ul>` : '<p>无</p>'}

<h2>分歧</h2>
${content.disagreements?.length ? `<ul>${content.disagreements.map((d) => `<li>${d}</li>`).join('')}</ul>` : '<p>无</p>'}

<h2>待办事项</h2>
${content.action_items?.length ? content.action_items.map((item) => `<div class="action">☐ ${item.task}${item.assignee ? ` <small>(负责人: ${item.assignee})</small>` : ''}${item.deadline ? ` <small>(截止: ${item.deadline})</small>` : ''}</div>`).join('') : '<p>无</p>'}
</body></html>`;
  }

  // ==================== 私有方法 ====================

  private buildDiscussionText(title: string, content: string, replies: any[]): string {
    let text = `【话题标题】${title}\n\n【话题内容】${content}\n\n【回复列表】\n`;
    replies.forEach((r, i) => {
      text += `${i + 1}. ${r.author?.nickname || '匿名用户'}：${r.content}\n`;
    });
    return text;
  }

  private async callAiForSummary(discussionText: string, type: 'topic' | 'group', topicTitle?: string): Promise<SummaryContent> {
    // 如果没有配置 AI，则返回默认结构
    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) {
      console.warn('DeepSeek API Key 未配置，使用默认总结内容');
      return this.getDefaultSummaryContent(discussionText, type);
    }

    const systemPrompt = `你是一个专业的家族讨论记录助手，负责对家族小组讨论内容进行归纳总结。

请根据提供的讨论内容，生成一个结构化的总结，包含以下部分：
1. background: 讨论背景（简要描述讨论的主题和目的）
2. main_points: 主要观点列表（每个包含 author-提出者, point-观点内容, evidence-证据/引用）
3. consensus: 达成的共识列表
4. disagreements: 存在的分歧列表
5. action_items: 待办事项列表（每个包含 task-任务描述, assignee-负责人, deadline-截止时间）
6. attachments: 附件索引（讨论中提到的图片、外链等）

请以JSON格式输出总结结果。`;

    const userPrompt = `请总结以下${type === 'topic' ? '话题讨论' : '小组讨论'}内容：

${discussionText}

请生成结构化的总结报告（JSON格式）：`;

    try {
      const completion = await this.deepseekClient.chat.completions.create({
        model: this.deepseekModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const content = completion.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('AI 未返回有效内容');
      }

      // 尝试解析 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as SummaryContent;
      }

      throw new Error('无法解析 AI 返回的内容');
    } catch (error) {
      console.error('DeepSeek AI 调用失败:', error);
      return this.getDefaultSummaryContent(discussionText, type);
    }
  }

  private getDefaultSummaryContent(discussionText: string, type: 'topic' | 'group'): SummaryContent {
    // 默认总结内容（当 AI 不可用时）
    const lines = discussionText.split('\n').filter((l) => l.trim());
    const firstLine = lines.find((l) => l.includes('【话题标题】'));

    return {
      background: `这是一段${type === 'topic' ? '话题' : '小组'}讨论内容，涵盖了家族成员之间的交流。`,
      main_points: [
        {
          author: '讨论参与者',
          point: '讨论内容已被记录，详细信息请查看原始记录。',
          evidence: discussionText.slice(0, 200) + '...',
        },
      ],
      consensus: ['讨论内容已归档保存'],
      disagreements: [],
      action_items: [],
      attachments: [],
    };
  }

  private async sendSummaryNotification(groupId: bigint, summaryId: bigint, title: string, groupName?: string) {
    // 获取小组所有成员
    const members = await this.prisma.groupMember.findMany({
      where: { group_id: groupId },
      select: { user_id: true },
    });

    // 为每个成员创建通知
    const notifications = members.map((m) => ({
      user_id: m.user_id,
      clan_id: null,
      type: 'SUMMARY_GENERATED' as const,
      title: '讨论总结已生成',
      content: `${title}`,
      target_type: 'DiscussionSummary',
      target_id: summaryId.toString(),
    }));

    if (notifications.length > 0) {
      await this.prisma.notification.createMany({ data: notifications });
    }
  }
}