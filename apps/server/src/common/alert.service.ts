import { Injectable, Logger } from '@nestjs/common';

/**
 * 告警 Webhook 服务
 *
 * 设计：
 * - 通过环境变量 ALERT_WEBHOOK_URL 配置接收方（钉钉/飞书/Slack/自定义 HTTP）
 * - send() 异步执行，不阻塞主请求链路；失败仅记录日志（不影响业务可用性）
 * - 内置最小 60 秒防抖（同类告警不重复），通过 process 级 Map 实现
 *
 * 触发来源：
 * - GlobalHttpExceptionFilter：所有 5xx 异常投递
 * - AlertController 的 /api/admin/alert/test 端点（手动演练）
 * - 健康检查与进程自愈（生产可挂到 onModuleInit）
 *
 * 负载格式（POST application/json）：
 * {
 *   "level": "P0|P1|P2|P3",
 *   "title": "...",
 *   "source": "exception|http-monitor|manual",
 *   "service": "geneasphere-server",
 *   "env": "production|...",
 *   "timestamp": "2026-08-02T...",
 *   "details": { ... }
 * }
 */

export type AlertLevel = 'P0' | 'P1' | 'P2' | 'P3';

export interface AlertPayload {
  level: AlertLevel;
  title: string;
  source: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly dedupe = new Map<string, number>();
  private readonly dedupeMs = parseInt(process.env.ALERT_DEDUPE_MS || '60000', 10);
  private readonly maxRetries = 2;
  private readonly timeoutMs = 4000;

  /**
   * 异步推送告警，失败仅记录日志。
   */
  send(payload: AlertPayload): void {
    if (this.shouldDedupe(payload)) {
      return;
    }
    const body = {
      ...payload,
      service: process.env.SERVICE_NAME || 'geneasphere-server',
      env: process.env.NODE_ENV || 'development',
      host: process.env.HOSTNAME || 'localhost',
      timestamp: new Date().toISOString(),
    };

    // fire-and-forget；失败不抛
    void this.deliver(body).catch((err) => {
      this.logger.warn(
        `alert webhook 投递失败 (${payload.title}): ${(err as Error).message}`,
      );
    });
  }

  /**
   * 同步推送：返回投递结果，供 /api/admin/alert/test 端点直接验证。
   */
  async sendSync(payload: AlertPayload): Promise<{
    ok: boolean;
    statusCode?: number;
    error?: string;
    durationMs: number;
  }> {
    const start = Date.now();
    const body = {
      ...payload,
      service: process.env.SERVICE_NAME || 'geneasphere-server',
      env: process.env.NODE_ENV || 'development',
      host: process.env.HOSTNAME || 'localhost',
      timestamp: new Date().toISOString(),
    };
    try {
      const statusCode = await this.deliver(body);
      return { ok: statusCode >= 200 && statusCode < 300, statusCode, durationMs: Date.now() - start };
    } catch (err) {
      return { ok: false, error: (err as Error).message, durationMs: Date.now() - start };
    }
  }

  /**
   * 简易去抖：同 source+title 在 dedupeMs 内只投递一次。
   */
  private shouldDedupe(payload: AlertPayload): boolean {
    const key = `${payload.source}::${payload.title}`;
    const last = this.dedupe.get(key);
    if (last && Date.now() - last < this.dedupeMs) {
      return true;
    }
    this.dedupe.set(key, Date.now());
    // 定期清理过期键
    if (this.dedupe.size > 200) {
      const cutoff = Date.now() - this.dedupeMs * 5;
      for (const [k, t] of this.dedupe) {
        if (t < cutoff) this.dedupe.delete(k);
      }
    }
    return false;
  }

  /**
   * 实际投递：POST 到 ALERT_WEBHOOK_URL，附带最大重试。
   * 返回 HTTP 状态码或抛错。
   */
  private async deliver(body: Record<string, unknown>): Promise<number> {
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!url) {
      this.logger.warn(
        `[AlertService] ALERT_WEBHOOK_URL 未配置，已记录 payload：${JSON.stringify(body).slice(0, 200)}`,
      );
      // 返回 200 以模拟"成功投递到日志"语义，但 .sendSync() 中 ok=false（未配置）
      throw new Error('ALERT_WEBHOOK_URL not configured');
    }

    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= this.maxRetries) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), this.timeoutMs);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Alert-Source': 'geneasphere',
          },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
        clearTimeout(timer);
        if (res.status >= 500 && attempt < this.maxRetries) {
          attempt += 1;
          await new Promise((r) => setTimeout(r, 200 * attempt));
          continue;
        }
        return res.status;
      } catch (err) {
        lastErr = err;
        attempt += 1;
        if (attempt > this.maxRetries) break;
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('webhook delivery failed');
  }
}