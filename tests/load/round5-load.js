/**
 * Round 5 — P5-06 / P5-07：100 并发 demo-login 压测 + 50 并发族谱树查询
 *
 * 用法：
 *   # 1. 安装 k6（一次性）
 *   # macOS:   brew install k6
 *   # Windows: choco install k6
 *   # Docker:  docker run --rm -i grafana/k6 run - < tests/load/round5-load.js
 *
 *   # 2. 启动后端
 *   pnpm --filter server dev
 *
 *   # 3. 运行（默认压测 demo-login）
 *   k6 run tests/load/round5-load.js
 *
 *   # 生产验收应优先使用真实登录：
 *   # k6 run tests/load/round5-load.js -e AUTH_MODE=password -e LOAD_USERNAME=... -e LOAD_PASSWORD=...
 *
 *   # 4. 切换到族谱树压测：编辑下方 TARGET 改为 'tree'
 *
 * 期望：
 *   - demo-login: 0% error, QPS ≥ 200, p95 < 500ms
 *   - tree/full:  0% error, p95 < 3000ms
 *
 * 注意：生产验收使用 AUTH_MODE=password，并通过 LOAD_USERNAME/LOAD_PASSWORD 注入专用测试账号；
 * 不要把正式密码写入脚本、报告或版本库。
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ---------- 切换开关 ----------
const TARGET = __ENV.TARGET || 'login'; // 'login' | 'tree' | 'api-mix' | 'upload'

// ---------- 自定义指标 ----------
const errorRate = new Rate('errors');
const loginTrend = new Trend('login_duration');
const treeTrend = new Trend('tree_duration');

// ---------- 配置 ----------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3101';
const CLAN_SLUG = __ENV.CLAN_SLUG || 'zhuxi-demo';
const AUTH_MODE = __ENV.AUTH_MODE || 'demo';
const LOAD_USERNAME = __ENV.LOAD_USERNAME || '';
const LOAD_PASSWORD = __ENV.LOAD_PASSWORD || '';
const AUTH_PATH = __ENV.AUTH_PATH || '/api/auth/login';

function loginPayload() {
  if (AUTH_MODE === 'password') {
    return JSON.stringify({ username: LOAD_USERNAME, password: LOAD_PASSWORD });
  }
  return JSON.stringify({});
}

function login() {
  const path = AUTH_MODE === 'password' ? AUTH_PATH : '/api/auth/demo-login';
  return http.post(`${BASE_URL}${path}`, loginPayload(), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export const options = {
  scenarios: {
    [TARGET]: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: TARGET === 'tree' ? 50 : 100 }, // ramp-up
        { duration: '60s', target: TARGET === 'tree' ? 50 : 100 }, // steady
        { duration: '30s', target: 0 },                            // ramp-down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  if (TARGET === 'login') {
    return runLogin();
  }
  if (TARGET === 'tree') {
    return runTree();
  }
  if (TARGET === 'api-mix') {
    return runApiMix();
  }
  if (TARGET === 'upload') {
    return runUpload();
  }
}

// ---------- demo-login 压测 ----------
function runLogin() {
  const start = Date.now();
  const res = login();
  loginTrend.add(Date.now() - start);

  const ok = check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'has access_token': (r) => r.json('access_token') !== undefined,
  });
  errorRate.add(!ok);
  sleep(0.1);
}

// ---------- 族谱树全量查询压测 ----------
function runTree() {
  // 先登录拿 token
  const loginRes = login();
  if (loginRes.status < 200 || loginRes.status >= 300) {
    errorRate.add(true);
    return;
  }
  const token = loginRes.json('access_token');

  const start = Date.now();
  const res = http.get(
    `${BASE_URL}/api/tree/clan/${CLAN_SLUG}/full`,
    {
      headers: { Authorization: `Bearer ${token}` },
      tags: { name: 'tree-full' },
      timeout: '30s',
    },
  );
  treeTrend.add(Date.now() - start);

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'has persons': (r) => Array.isArray(r.json('persons')) || r.json('totalPersons') > 0,
  });
  errorRate.add(!ok);
  sleep(0.5);
}

// ---------- API mix 压测（CRUD 列表/详情）----------
function runApiMix() {
  const loginRes = login();
  if (loginRes.status < 200 || loginRes.status >= 300) {
    errorRate.add(true);
    return;
  }
  const token = loginRes.json('access_token');
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const endpoints = [
    'GET',
    `/api/admin/dashboard?clanSlug=${CLAN_SLUG}`,
    `/api/admin/members?clanSlug=${CLAN_SLUG}&page=1&pageSize=20`,
    `/api/admin/orders?clanSlug=${CLAN_SLUG}`,
    `/api/admin/announcements?clanSlug=${CLAN_SLUG}`,
    `/api/admin/logs?clanSlug=${CLAN_SLUG}`,
  ];

  for (const url of endpoints) {
    const res = http.get(`${BASE_URL}${url}`, auth);
    errorRate.add(res.status !== 200);
  }
  sleep(1);
}

// ---------- 4MB 文件上传压测 ----------
function runUpload() {
  const loginRes = login();
  if (loginRes.status < 200 || loginRes.status >= 300) {
    errorRate.add(true);
    return;
  }
  const token = loginRes.json('access_token');

  // 4MB 随机二进制
  const payload = new ArrayBuffer(4 * 1024 * 1024);
  const fd = {
    file: http.file(payload, 'loadtest.bin', 'application/octet-stream'),
  };

  const res = http.post(`${BASE_URL}/api/admin/media/upload`, fd, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ok = check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
  });
  errorRate.add(!ok);
  sleep(1);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    [`tests/load/results/round5-${TARGET}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`]: JSON.stringify(data, null, 2),
  };
}

// 内置 textSummary（k6 >= 0.41）
function textSummary(data, opts) {
  const metrics = data.metrics;
  const lines = [];
  lines.push('');
  lines.push('  ========== Round 5 压测结果 ==========');
  lines.push(`  目标场景：${TARGET}`);
  lines.push(`  总请求数：${metrics.http_reqs.values.count}`);
  lines.push(`  错误率  ：${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);
  lines.push(`  P50     ：${metrics.http_req_duration.values.p(50).toFixed(1)}ms`);
  lines.push(`  P95     ：${metrics.http_req_duration.values.p(95).toFixed(1)}ms`);
  lines.push(`  P99     ：${metrics.http_req_duration.values.p(99).toFixed(1)}ms`);
  lines.push(`  QPS     ：${metrics.http_reqs.values.rate.toFixed(1)}`);
  lines.push('  =====================================');
  lines.push('');
  return lines.join('\n');
}
