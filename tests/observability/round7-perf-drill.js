#!/usr/bin/env node
/**
 * Round 7 性能压测 (Node 实现，替代 k6)
 *
 * 目标端点：
 *  - GET /api/health                 — liveness（轻）
 *  - GET /api/clans/1/statistics     — 真实统计路径（重）
 *  - POST /api/auth/login            — 鉴权路径（中）
 *
 * 模式：
 *  - 阶段 1：基线 5 并发 × 200 请求（统计 P50/P95/P99/max）
 *  - 阶段 2：突发 50 并发 × 100 请求（看错误率与 P99）
 *
 * 输出：tests/observability/results/round7-perf-<ts>.log + perf-summary.json
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3120';
const TOKEN_FILE = process.env.TOKEN_FILE || 'C:\\Users\\M\\AppData\\Local\\Temp\\token.txt';

function parseBase(url) {
  const u = new URL(url);
  return { hostname: u.hostname, port: u.port || 80, protocol: u.protocol };
}

function requestOnce(method, p, headers = {}, body = null) {
  return new Promise((resolve) => {
    const { hostname, port } = parseBase(BASE);
    const start = process.hrtime.bigint();
    const req = http.request(
      {
        hostname,
        port,
        path: p,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body ? Buffer.byteLength(body) : 0,
          ...headers,
        },
        agent: new http.Agent({ keepAlive: true }),
      },
      (res) => {
        let bytes = 0;
        res.on('data', (chunk) => (bytes += chunk.length));
        res.on('end', () => {
          const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
          resolve({
            status: res.statusCode,
            durationMs,
            bytes,
            ok: res.statusCode >= 200 && res.statusCode < 400,
          });
        });
      },
    );
    req.on('error', (err) => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({ status: 0, durationMs, bytes: 0, ok: false, error: err.message });
    });
    if (body) req.write(body);
    req.end();
  });
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)));
  return sorted[i];
}

async function runPhase(name, fn, concurrency, total, log) {
  log(`\n--- Phase: ${name} (concurrency=${concurrency}, total=${total}) ---`);
  const samples = [];
  const errors = { network: 0, http4xx: 0, http5xx: 0, other: 0 };
  let completed = 0;
  let nextIdx = 0;
  const startTime = Date.now();

  async function worker() {
    while (nextIdx < total) {
      const myIdx = nextIdx++;
      if (myIdx >= total) break;
      const r = await fn(myIdx);
      samples.push(r.durationMs);
      if (!r.ok) {
        if (r.status === 0) errors.network += 1;
        else if (r.status >= 400 && r.status < 500) errors.http4xx += 1;
        else if (r.status >= 500) errors.http5xx += 1;
        else errors.other += 1;
      }
      completed += 1;
      if (completed % 50 === 0 || completed === total) {
        process.stdout.write(`\r  progress: ${completed}/${total}`);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  const elapsedMs = Date.now() - startTime;
  const rps = (total / elapsedMs) * 1000;
  samples.sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  const summary = {
    name,
    concurrency,
    total,
    durationMs: elapsedMs,
    rps: Number(rps.toFixed(1)),
    avgMs: Number((sum / samples.length).toFixed(2)),
    p50Ms: Number(quantile(samples, 0.5).toFixed(2)),
    p95Ms: Number(quantile(samples, 0.95).toFixed(2)),
    p99Ms: Number(quantile(samples, 0.99).toFixed(2)),
    maxMs: Number(Math.max(...samples).toFixed(2)),
    errors,
  };
  log(`  RPS=${summary.rps} avg=${summary.avgMs}ms p50=${summary.p50Ms}ms p95=${summary.p95Ms}ms p99=${summary.p99Ms}ms max=${summary.maxMs}ms errors=${JSON.stringify(errors)}`);
  return summary;
}

function phasePasses(p) {
  // 差异化阈值（Round 7 已知业务特性）：
  //  - health/metrics:        p95 < 200ms  （轻）
  //  - login (4xx):           p95 < 1500ms （中等）
  //  - statistics 单机(5):    p95 < 3000ms （重）
  //  - statistics 突发(30):   p95 < 12000ms（DB 池 3 个，30 并发会排队）
  let p95Threshold;
  if (/health/i.test(p.name)) p95Threshold = 200;
  else if (/login/i.test(p.name)) p95Threshold = 1500;
  else if (/statistics-burst/i.test(p.name)) p95Threshold = 12000;
  else if (/statistics/i.test(p.name)) p95Threshold = 3000;
  else p95Threshold = 2000;
  const realErrors = (p.errors.http5xx || 0) + (p.errors.network || 0);
  const realErrorRate = realErrors / Math.max(1, p.total);
  return p.p95Ms < p95Threshold && realErrorRate < 0.05;
}

async function main() {
  const logDir = path.resolve(__dirname, '../observability/results');
  fs.mkdirSync(logDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(logDir, `round7-perf-${ts}.log`);
  const log = (line) => {
    console.log(line);
    fs.appendFileSync(logFile, line + '\n', 'utf8');
  };

  log(`# Round 7 Performance Drill @ ${new Date().toISOString()}`);
  log(`# target: ${BASE}`);

  let token = '';
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
      log(`# token loaded: ${token.length} chars`);
    } else {
      log('# token file not found — will skip authenticated probes');
    }
  } catch (e) {
    log(`# token read error: ${e.message}`);
  }

  const allResults = [];

  allResults.push(
    await runPhase(
      'health-baseline-5x200',
      async () => requestOnce('GET', '/api/health'),
      5,
      200,
      log,
    ),
  );

  allResults.push(
    await runPhase(
      'health-burst-50x100',
      async () => requestOnce('GET', '/api/health'),
      50,
      100,
      log,
    ),
  );

  if (token) {
    const auth = { Authorization: `Bearer ${token}` };
    allResults.push(
      await runPhase(
        'statistics-5x100',
        async () => requestOnce('GET', '/api/clans/1/statistics', auth, null),
        5,
        100,
        log,
      ),
    );
    allResults.push(
      await runPhase(
        'statistics-burst-30x100',
        async () => requestOnce('GET', '/api/clans/1/statistics', auth, null),
        30,
        100,
        log,
      ),
    );
  }

  allResults.push(
    await runPhase(
      'login-fail-5x50',
      async () =>
        requestOnce(
          'POST',
          '/api/auth/login',
          {},
          JSON.stringify({ phone: '13800000001', password: 'wrong' }),
        ),
      5,
      50,
      log,
    ),
  );

  const summary = {
    timestamp: new Date().toISOString(),
    base: BASE,
    phases: allResults,
    goNoGo: allResults.every(phasePasses) ? 'PASS' : 'FAIL',
  };

  const summaryPath = path.join(logDir, `perf-summary-${ts}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  log(`\n=== 总结 ===`);
  log(`GO/NO-GO: ${summary.goNoGo}`);
  log(`summary json: ${summaryPath}`);

  process.exit(summary.goNoGo === 'PASS' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});