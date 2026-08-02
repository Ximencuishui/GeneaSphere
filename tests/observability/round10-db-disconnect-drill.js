/**
 * Round 10 — 数据库断连与恢复演练
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LOG_DIR = path.resolve(__dirname, '../observability/results');
fs.mkdirSync(LOG_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = path.join(LOG_DIR, `round10-db-disconnect-${ts}.log`);
const SUMMARY_FILE = path.join(LOG_DIR, `round10-db-disconnect-${ts}.json`);

const log = (line) => {
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
};

function request(method, url, headers = {}, body = null, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const start = process.hrtime.bigint();
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json', ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - start) / 1e6;
          resolve({ status: res.statusCode, ms, body: data });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({ status: 0, ms, error: 'timeout' });
    });
    req.on('error', (err) => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({ status: 0, ms, error: err.message });
    });
    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Spawn an isolated NestJS server and return a promise that resolves
 * when either the process exits (bad-DB case) or the readiness probe
 * turns 200 + status=ready + db.ok=true (recovery case).
 */
async function spawnIsolated({ env, label, expect = 'exit' | 'ready', maxWaitMs = 35000 }) {
  const out = fs.openSync(path.join(LOG_DIR, `round10-${label}-${ts}.out.log`), 'w');
  const err = fs.openSync(path.join(LOG_DIR, `round10-${label}-${ts}.err.log`), 'w');
  const start = Date.now();
  const child = spawn(
    'D:\\nodejs\\node.exe',
    ['--enable-source-maps', 'E:\\GeneaSphere\\apps\\server\\dist\\main.js'],
    {
      cwd: 'E:\\GeneaSphere\\apps\\server',
      env: { ...process.env, ...env, NODE_ENV: 'test', LOG_LEVEL: 'warn' },
      stdio: ['ignore', out, err],
    },
  );
  log(`  pid=${child.pid} label=${label} expect=${expect}`);

  // Pipe exit
  const exitPromise = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      resolve({ code, signal, t: (Date.now() - start) / 1000 });
    });
  });

  // Watch for readiness
  let readyResolve;
  const readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
  });
  if (expect === 'ready') {
    (async () => {
      for (let i = 0; i < 90; i++) {
        await sleep(500);
        const probe = await request('GET', `http://127.0.0.1:${env.PORT}/api/health/ready`, {}, null, 3000);
        if (probe.status === 200) {
          try {
            const j = JSON.parse(probe.body);
            if (j?.status === 'ready' && j?.checks?.database?.ok === true) {
              readyResolve({ t: (Date.now() - start) / 1000, latency: j.checks.database.latency_ms });
              return;
            }
          } catch {}
        }
      }
    })();
  }

  // Race
  const result = await Promise.race([
    exitPromise.then((r) => ({ kind: 'exit', ...r })),
    readyPromise.then((r) => ({ kind: 'ready', ...r })),
    sleep(maxWaitMs).then(() => ({ kind: 'timeout' })),
  ]);

  // Always wait for exit before returning (clean up)
  if (result.kind === 'ready') {
    try { process.kill(child.pid, 'SIGTERM'); } catch {}
    await sleep(1000);
    try { process.kill(child.pid, 'SIGKILL'); } catch {}
    const exitInfo = await exitPromise;
    return { ...result, exitInfo };
  }

  return result;
}

(async () => {
  log(`# Round 10 DB disconnection drill @ ${new Date().toISOString()}`);
  log(`# TARGET: spawn isolated NestJS servers on ports 3122/3123`);

  const BAD_DB_URL = 'postgresql://nobody:nopass@127.0.0.1:1/nope?schema=public&connection_limit=1&pool_timeout=2';
  const REAL_DB_URL = process.env.DATABASE_URL || 'postgresql://geneauser:GeneaSphere2024!@127.0.0.1:15432/geneasphere?schema=public&connection_limit=3&pool_timeout=30';

  const checks = [];
  function record(name, ok, detail) {
    checks.push({ name, ok, detail });
    log(`  [${ok ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  }

  // 1. baseline
  log('\n--- Step 1: baseline on real server (3120) ---');
  const baselineReady = await request('GET', 'http://127.0.0.1:3120/api/health/ready', {}, null, 5000);
  const baselineLive = await request('GET', 'http://127.0.0.1:3120/api/health', {}, null, 5000);
  let baselineOk = false;
  try {
    const j = JSON.parse(baselineReady.body);
    baselineOk = j?.status === 'ready' && j?.checks?.database?.ok === true;
    log(`  baseline /api/health:        http=${baselineLive.status}`);
    log(`  baseline /api/health/ready:  status=${j?.status} db.ok=${j?.checks?.database?.ok} latency=${j?.checks?.database?.latency_ms}ms`);
  } catch {}
  record('baseline real server /api/health/ready status=ready', baselineOk, `http=${baselineReady.status}`);
  record('baseline real server /api/health returns 200', baselineLive.status === 200, `http=${baselineLive.status}`);

  // 2. bad-DB isolated (default 5 retries × 5s = ~25s + startup)
  log('\n--- Step 2: bad-DB isolated with default retry strategy ---');
  const badDb = await spawnIsolated({
    env: { PORT: '3122', DATABASE_URL: BAD_DB_URL },
    label: 'baddb',
    expect: 'exit',
    maxWaitMs: 40000,
  });
  log(`  -> ${JSON.stringify(badDb)}`);
  record(
    'bad-DB isolated process exits with non-zero code (fail-fast in DB error)',
    badDb.kind === 'exit' && badDb.code !== 0,
    `exitCode=${badDb.code} after ${badDb.t}s`,
  );

  // 3. recovery: 真实 DB URL, 期待 ready
  log('\n--- Step 3: recovery — isolated with real DATABASE_URL ---');
  const recovery = await spawnIsolated({
    env: { PORT: '3123', DATABASE_URL: REAL_DB_URL },
    label: 'recovery',
    expect: 'ready',
    maxWaitMs: 60000,
  });
  log(`  -> ${JSON.stringify(recovery)}`);
  record(
    'recovery — isolated instance with real DB starts and reports ready',
    recovery.kind === 'ready',
    recovery.kind === 'ready' ? `after ${recovery.t}s latency=${recovery.latency}ms` : `kind=${recovery.kind}`,
  );

  // 4. 实服务 3120 仍正常
  log('\n--- Step 4: real server (3120) still healthy after drill ---');
  const postReady = await request('GET', 'http://127.0.0.1:3120/api/health/ready', {}, null, 5000);
  let postOk = false;
  try {
    const j = JSON.parse(postReady.body);
    postOk = j?.status === 'ready' && j?.checks?.database?.ok === true;
    log(`  real server: status=${j?.status} db.ok=${j?.checks?.database?.ok} latency=${j?.checks?.database?.latency_ms}ms`);
  } catch {}
  record('real server /api/health/ready still status=ready after drill', postOk, `http=${postReady.status}`);

  // 5. /metrics 仍记录遥测
  log('\n--- Step 5: /metrics still reporting after drill ---');
  const metrics = await request('GET', 'http://127.0.0.1:3120/metrics', {}, null, 5000);
  let greps = { family: false, http: false, prisma: false };
  if (metrics.status === 200) {
    greps.family = /family_count/.test(metrics.body);
    greps.http = /http_requests_total/.test(metrics.body);
    greps.prisma = /prisma_query_duration/.test(metrics.body);
    log(`  /metrics: 200 lines=${metrics.body.split('\n').length} family_count=${greps.family} http_requests_total=${greps.http} prisma=${greps.prisma}`);
  }
  record(
    '/metrics exposes family_count + http_requests_total + prisma_query_duration',
    metrics.status === 200 && greps.family && greps.http && greps.prisma,
    `http=${metrics.status} family=${greps.family} http=${greps.http} prisma=${greps.prisma}`,
  );

  // 总结
  const total = checks.length;
  const passed = checks.filter((c) => c.ok).length;
  const failed = total - passed;
  log(`\n=== 总结 ===`);
  log(`PASS=${passed} FAIL=${failed} TOTAL=${total}`);
  log(`log: ${LOG_FILE}`);

  const summary = {
    timestamp: new Date().toISOString(),
    scenarios: [
      'baseline real server (3120) healthy',
      'bad-DB isolated (port 3122) fails with non-zero exit code',
      'recovery isolated (port 3123) starts and reports ready',
      'real server unaffected by isolated failures',
      '/metrics stable through drill',
    ],
    checks,
    pass: passed,
    fail: failed,
    goNoGo: failed === 0 ? 'PASS' : 'FAIL',
    notes: [
      'PrismaService.onModuleInit in DB 不可用时按 5×5s 重试后失败退出，进程不会被错误标记为 ready。',
      '运行时 DB 抖动由 queryWithRetry 包裹（PRISMA_QUERY_MAX_RETRIES=2, 300ms 退避）。',
      '5xx 异常会自动触发 webhook 告警（已在 Round 5 验证）。',
      '生产环境建议：liveness 探针用 /api/health；readiness 探针用 /api/health/ready；K8s/Helm 会自动隔离未 ready 的实例。',
    ],
  };
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf8');
  log(`summary: ${SUMMARY_FILE}`);

  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
