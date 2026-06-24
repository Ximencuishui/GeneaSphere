import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '@geneasphere/db';

type Period = 'day' | 'week' | 'month';

interface SummaryPayload {
  period: Period;
  since: string;
  totals: {
    new_families: number;
    new_users: number;
    new_media: number;
    new_orders: number;
    revenue: number;
  };
  trends: Array<{ date: string; revenue: number; order_count: number }>;
  familyRanking?: Array<{ clan_id: string; name: string; value: number }>;
  toolRanking?: Array<{ tool_key: string; tool_name: string; count: number }>;
}

/**
 * 数据统计 PDF 报表生成器（需求 v1.0 §3.11）
 *
 * 日报/周报/月报自动生成 PDF，包含：
 *   1. 顶部品牌与时间段
 *   2. 核心指标：新增家族、用户、媒体、订单、收入
 *   3. 收入趋势
 *   4. 家族排行（可选）
 *   5. 工具使用排行（可选）
 */
@Injectable()
export class PdfReportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildSummary(
    period: Period,
  ): Promise<SummaryPayload> {
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [families, users, media, orders, revenueAgg, trendsRaw, familyRanking, toolRanking] =
      await Promise.all([
        this.prisma.clan.count({ where: { created_at: { gte: since } } }),
        this.prisma.user.count({ where: { created_at: { gte: since } } }),
        this.prisma.mediaArchive.count({
          where: { created_at: { gte: since } },
        }),
        this.prisma.printOrder.count({
          where: { created_at: { gte: since } },
        }),
        this.prisma.printOrder.aggregate({
          _sum: { amount: true },
          where: {
            created_at: { gte: since },
            status: { in: ['PAID', 'PRINTING', 'SHIPPED', 'COMPLETED'] },
          },
        }),
        this.prisma.$queryRaw<
          { date: string; amount: number; count: bigint }[]
        >`
          SELECT
            to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
            COALESCE(SUM(amount), 0)::float as amount,
            COUNT(*)::bigint as count
          FROM print_orders
          WHERE created_at >= ${since}
          GROUP BY date_trunc('day', created_at)
          ORDER BY date ASC
        `.catch(() => [] as any),
        // Top 10 家族（按成员数）
        this.prisma.$queryRaw<
          { id: bigint; name: string; count: bigint }[]
        >`
          SELECT c.id, c.name, COUNT(cm.id)::bigint as count
          FROM clans c
          LEFT JOIN clan_members cm ON cm.clan_id = c.id
          WHERE c.status != 'DELETED'
          GROUP BY c.id, c.name
          ORDER BY count DESC
          LIMIT 10
        `.catch(() => [] as any),
        // Top 10 工具（tool_usage_logs）
        this.prisma.$queryRaw<
          { tool_type: string; count: bigint }[]
        >`
          SELECT tool_type, COUNT(*)::bigint as count
          FROM tool_usage_logs
          WHERE created_at >= ${since}
          GROUP BY tool_type
          ORDER BY count DESC
          LIMIT 10
        `.catch(() => [] as any),
      ]);

    const toolNameMap: Record<string, string> = {
      restore: '老照片修复',
      color: '黑白上色',
      expand: '智能扩图',
      remove: '智能抹除',
      compose: '全家福合成',
      enhance: '图像增强',
      animate: '让照片动起来',
    };

    return {
      period,
      since: since.toISOString(),
      totals: {
        new_families: families,
        new_users: users,
        new_media: media,
        new_orders: orders,
        revenue: Number(revenueAgg._sum.amount || 0),
      },
      trends: trendsRaw.map((r) => ({
        date: r.date,
        revenue: Number(r.amount || 0),
        order_count: Number(r.count || 0),
      })),
      familyRanking: familyRanking.map((r) => ({
        clan_id: r.id.toString(),
        name: r.name,
        value: Number(r.count),
      })),
      toolRanking: toolRanking.map((r) => ({
        tool_key: r.tool_type,
        tool_name: toolNameMap[r.tool_type] || r.tool_type,
        count: Number(r.count),
      })),
    };
  }

  /**
   * 生成 PDF 报表，返回 PDF Buffer
   */
  async generatePdf(period: Period): Promise<Buffer> {
    const data = await this.buildSummary(period);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 60, bottom: 60, left: 60, right: 60 },
          info: {
            Title: `寻根路平台${this.periodLabel(period)}统计报表`,
            Author: '寻根路 Admin',
            Subject: `数据统计 / ${this.periodLabel(period)}`,
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk as Buffer));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ===== 顶部品牌 =====
        doc
          .fillColor('#5D4037')
          .fontSize(22)
          .font('Helvetica-Bold')
          .text('寻根路 · xungenlu.cn', { align: 'left' });
        doc
          .fillColor('#666')
          .fontSize(14)
          .font('Helvetica')
          .text(`平台${this.periodLabel(period)}数据统计报表`, {
            align: 'left',
          });

        doc.moveDown(0.5);
        doc
          .fillColor('#999')
          .fontSize(10)
          .text(
            `生成时间：${new Date().toLocaleString('zh-CN')}  |  统计区间：${this.periodLabel(period)}`,
          );

        doc.moveDown(1);
        doc
          .strokeColor('#5D4037')
          .lineWidth(1.5)
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .stroke();
        doc.moveDown(1);

        // ===== 核心指标 =====
        doc
          .fillColor('#5D4037')
          .fontSize(16)
          .font('Helvetica-Bold')
          .text('一、核心指标');
        doc.moveDown(0.5);

        const metrics: Array<[string, string]> = [
          ['新增家族数', `${data.totals.new_families}`],
          ['新增用户数', `${data.totals.new_users}`],
          ['新增媒体数', `${data.totals.new_media}`],
          ['新增订单数', `${data.totals.new_orders}`],
          ['营业收入（元）', `¥ ${data.totals.revenue.toFixed(2)}`],
        ];

        doc.fontSize(11).font('Helvetica').fillColor('#333');
        metrics.forEach(([label, value]) => {
          doc.text(`${label}：`, { continued: true });
          doc.fillColor('#5D4037').font('Helvetica-Bold').text(value);
          doc.fillColor('#333').font('Helvetica');
        });

        doc.moveDown(1.2);

        // ===== 收入趋势 =====
        doc
          .fillColor('#5D4037')
          .fontSize(16)
          .font('Helvetica-Bold')
          .text('二、收入趋势');
        doc.moveDown(0.5);

        if (data.trends.length === 0) {
          doc
            .fillColor('#999')
            .fontSize(10)
            .font('Helvetica')
            .text('（本周期暂无订单收入）');
        } else {
          doc.fontSize(10).font('Helvetica').fillColor('#333');
          data.trends.forEach((t) => {
            doc.text(
              `${t.date}    订单 ${t.order_count} 单    收入 ¥ ${t.revenue.toFixed(2)}`,
            );
          });
        }

        doc.moveDown(1.2);

        // ===== 家族排行 =====
        if (data.familyRanking && data.familyRanking.length > 0) {
          doc
            .fillColor('#5D4037')
            .fontSize(16)
            .font('Helvetica-Bold')
            .text('三、家族成员数排行 TOP 10');
          doc.moveDown(0.5);

          doc.fontSize(10).font('Helvetica').fillColor('#333');
          data.familyRanking.forEach((c, idx) => {
            doc.text(
              `${(idx + 1).toString().padStart(2, ' ')}.  ${c.name}    ${c.value} 人`,
            );
          });

          doc.moveDown(1.2);
        }

        // ===== 工具使用排行 =====
        if (data.toolRanking && data.toolRanking.length > 0) {
          doc
            .fillColor('#5D4037')
            .fontSize(16)
            .font('Helvetica-Bold')
            .text('四、工具使用排行 TOP 10');
          doc.moveDown(0.5);

          doc.fontSize(10).font('Helvetica').fillColor('#333');
          data.toolRanking.forEach((t, idx) => {
            doc.text(
              `${(idx + 1).toString().padStart(2, ' ')}.  ${t.tool_name}    ${t.count} 次`,
            );
          });

          doc.moveDown(1.2);
        }

        // ===== 页脚 =====
        doc.moveDown(2);
        doc
          .fillColor('#999')
          .fontSize(9)
          .font('Helvetica')
          .text(
            '本报表由寻根路 Admin 管理后台自动生成。如需详细数据请登录 admin.xungenlu.cn。',
            { align: 'center' },
          );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private periodLabel(period: Period): string {
    return period === 'day' ? '日报' : period === 'week' ? '周报' : '月报';
  }
}