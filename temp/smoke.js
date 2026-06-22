const http = require('http');
const fs = require('fs');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
    };
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(buf) });
        } catch {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const login = await req('POST', '/api/platform/auth/login', { username: 'platform_admin', password: 'admin123' });
  console.log('LOGIN', login.status, JSON.stringify(login.body).slice(0, 200));
  const token = login.body.access_token;
  if (!token) process.exit(1);

  const tests = [
    ['GET', '/api/platform/dashboard/stats'],
    ['GET', '/api/platform/families?page=1&pageSize=5'],
    ['GET', '/api/platform/users?page=1&pageSize=5'],
    ['GET', '/api/platform/settings/pricing'],
    ['GET', '/api/platform/settings/clan-defaults'],
    ['GET', '/api/platform/settings/switches'],
    ['GET', '/api/platform/orders/print?page=1&pageSize=5'],
    ['GET', '/api/platform/orders/recharge?page=1&pageSize=5'],
    ['GET', '/api/platform/reviews/media?status=PENDING&page=1&pageSize=5'],
    ['GET', '/api/platform/reviews/posts?status=PUBLISHED&page=1&pageSize=5'],
    ['GET', '/api/platform/statistics/summary?period=day'],
    ['GET', '/api/platform/statistics/family-ranking?type=member_count&limit=5'],
    ['GET', '/api/platform/logs/operations?page=1&pageSize=5'],
    ['GET', '/api/platform/logs/login?page=1&pageSize=5'],
  ];
  for (const [m, p] of tests) {
    const r = await req(m, p, null, token);
    const summary = JSON.stringify(r.body).slice(0, 200);
    console.log(`${m} ${p}  -> ${r.status}  ${summary}`);
  }
})();
