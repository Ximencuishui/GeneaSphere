/**
 * Round 5 — P5-06 / P5-07：100 并发 demo-login 压测 + 50 并发族谱树查询
 *
 * 用法：
 *   # 1. 安装 k6（一次性）
 *   # macOS:   brew install k6
 *   # Windows: choco install k6
 *   # Docker:  docker run --rm -i grafana/k6 run - <round5-login.js
 *
 *   # 2. 启动后端
 *   pnpm --filter server dev
 *
 *   # 3. 运行（默认压测 demo-login）
 *   k6 run tests/load/round5-login.js
 *
 *   # 4. 切换到族谱树压测：编辑下方 TARGET 改为 'tree'
 *
 * 期望：
 *   - demo-login: 0% error, QPS ≥ 200, p95 < 500ms
 *   - tree/full:  0% error, p95 < 3000ms
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
const CLAN_SLUG = 'zhuxi-demo';

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
  const res = http.post(
    `${BASE_URL}/api/auth/demo-login`,
    JSON.stringify({}),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'demo-login' } },
  );
  loginTrend.add(Date.now() - start);

  const ok = check(res, {
    'status is 201': (r) => r.status === 201,
    'has access_token': (r) => r.json('access_token') !== undefined,
    'has user.role': (r) => r.json('user.role') === 'OWNER',
  });
  errorRate.add(!ok);
  sleep(0.1);
}

// ---------- 族谱树全量查询压测 ----------
function runTree() {
  // 先登录拿 token
  const loginRes = http.post(
    `${BASE_URL}/api/auth/demo-login`,
    JSON.stringify({}),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (loginRes.status !== 201) {
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
  const loginRes = http.post(
    `${BASE_URL}/api/auth/demo-login`,
    JSON.stringify({}),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (loginRes.status !== 201) {
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
  const loginRes = http.post(
    `${BASE_URL}/api/auth/demo-login`,
    JSON.stringify({}),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (loginRes.status !== 201) {
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
