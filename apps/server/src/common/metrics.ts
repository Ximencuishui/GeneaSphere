import { collectDefaultMetrics, Registry, Counter, Histogram, Gauge } from 'prom-client';
import type { Request, Response } from 'express';

/**
 * Prometheus 指标中间件（[I-7 修复 2026-08-01]）
 *
 * 暴露：
 * - GET /metrics — Prometheus 文本格式
 * - 默认 Node 进程指标（CPU/内存/事件循环）
 * - http_request_duration_seconds — HTTP 请求耗时（路由 + 方法 + 状态码）
 * - http_requests_total — HTTP 请求总数
 * - family_count / person_count — 业务指标（Guage，定时刷新）
 * - prisma_query_duration_seconds — Prisma 查询耗时
 *
 * 设计要点：
 * 1. 不依赖 nestjs-prometheus（避免额外的 @Injectable + Provider 配置），直接用 prom-client
 * 2. 通过 Express middleware 挂载，请求/响应拦截记录耗时
 * 3. 业务指标（family_count / person_count）由调用方通过 setBusinessMetrics() 注入，
 *    默认 0；可在 admin.guard 后台启动时调用一次 queryFamilyCount() / queryPersonCount() 填充
 */
export class MetricsRegistry {
  readonly registry: Registry;
  readonly httpDuration: Histogram<string>;
  readonly httpTotal: Counter<string>;
  readonly prismaDuration: Histogram<string>;
  private readonly familyCount: Gauge<string>;
  private readonly personCount: Gauge<string>;
  private readonly activeUsers: Gauge<string>;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.prismaDuration = new Histogram({
      name: 'prisma_query_duration_seconds',
      help: 'Prisma query duration in seconds',
      labelNames: ['model', 'operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.familyCount = new Gauge({
      name: 'family_count',
      help: 'Total number of active clans',
      registers: [this.registry],
    });

    this.personCount = new Gauge({
      name: 'person_count',
      help: 'Total number of persons across all clans',
      registers: [this.registry],
    });

    this.activeUsers = new Gauge({
      name: 'active_users',
      help: 'Active users in last 5 minutes (heuristic)',
      registers: [this.registry],
    });
  }

  setFamilyCount(n: number) {
    this.familyCount.set(n);
  }
  setPersonCount(n: number) {
    this.personCount.set(n);
  }
  setActiveUsers(n: number) {
    this.activeUsers.set(n);
  }
}

/**
 * Express middleware: 记录每个 HTTP 请求的耗时与方法/路由/状态码。
 *
 * 用法：在 main.ts 中 `app.use(metricsMiddleware.metricsHandler())`
 *
 * 注意：必须在所有 controller 注册前挂载（保证 res.on('finish') 能监听到所有响应）。
 */
export class MetricsMiddleware {
  constructor(private readonly metrics: MetricsRegistry) {}

  /**
   * 挂载到 /metrics 端点的处理器。返回 Prometheus 文本格式。
   */
  async metricsHandler(_req: Request, res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    const text = await this.metrics.registry.metrics();
    res.send(text);
  }

  /**
   * 全局请求计时 middleware：拦截所有请求，记录 method/route/status_code。
   *
   * - route 取自 req.route?.path（Express 5 在 router 命中后填充）
   * - 兜底用 req.path（防止未命中任何路由的 404 也被记录）
   */
  httpTimer() {
    return (req: Request, res: Response, next: () => void) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
        const route =
          (req as any).route?.path ||
          (req.baseUrl ? req.baseUrl + (req.route?.path || '') : req.path.split('?')[0]) ||
          'unknown';
        const labels = {
          method: req.method,
          route,
          status_code: String(res.statusCode),
        };
        this.metrics.httpDuration.observe(labels, durationSec);
        this.metrics.httpTotal.inc(labels);
      });
      next();
    };
  }
}

/**
 * 业务指标刷新器：在 setInterval 中调用，定时从数据库读取最新指标值。
 * 由调用方注入 prisma client；空实现时跳过（指标保持上次值）。
 */
export function createBusinessMetricsRefresher(
  metrics: MetricsRegistry,
  prisma?: any,
  intervalMs = 60_000,
): { start: () => void; stop: () => void } {
  if (!prisma) {
    return { start: () => {}, stop: () => {} };
  }
  let timer: NodeJS.Timeout | null = null;
  const refresh = async () => {
    try {
      const [familyCount, personCount] = await Promise.all([
        prisma.clan.count({ where: { status: 'NORMAL' } }).catch(() => 0),
        prisma.person.count({ where: { deleted_at: null } }).catch(() => 0),
      ]);
      metrics.setFamilyCount(familyCount);
      metrics.setPersonCount(personCount);
    } catch (err) {
      // 业务指标刷新失败不应影响主流程
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('[Metrics] refresh failed:', err);
      }
    }
  };
  return {
    start: () => {
      refresh();
      timer = setInterval(refresh, intervalMs);
      timer.unref?.();
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}