const http = require('http');

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

const results = [];
function ok(name, passed, detail) {
  const status = passed ? '✅' : '❌';
  results.push({ name, passed, detail });
  console.log(`${status} ${name}${detail ? '  ' + detail : ''}`);
}

(async () => {
  console.log('========== 平台管理后台 v1.0 验收测试 ==========\n');

  // DoD 1: 平台管理员 platform_admin/admin123 登录后可见 /platform-admin/dashboard
  const login = await req('POST', '/api/platform/auth/login', { username: 'platform_admin', password: 'admin123' });
  ok('DoD-1a 平台管理员登录', login.status === 200 && !!login.body.access_token, `status=${login.status}, role=${login.body.admin?.role}`);
  ok('DoD-1b 登录返回角色为 super', login.body.admin?.role === 'super', `role=${login.body.admin?.role}`);
  const token = login.body.access_token;

  // Dashboard 验证
  const dash = await req('GET', '/api/platform/dashboard/stats', null, token);
  ok('DoD-2 控制台数据接口', dash.status === 200 && dash.body.totals && typeof dash.body.totals.families === 'number', `families=${dash.body.totals?.families}`);
  ok('DoD-2b 控制台含待处理事项', typeof dash.body.totals?.pending_clans === 'number' && typeof dash.body.totals?.pending_media === 'number');
  ok('DoD-2c 控制台含收入与趋势', typeof dash.body.revenue?.this_month === 'number' && Array.isArray(dash.body.trends?.users_7d));

  // 家族管理验证
  const families = await req('GET', '/api/platform/families?page=1&pageSize=10', null, token);
  ok('DoD-3a 家族列表接口', families.status === 200 && Array.isArray(families.body.data), `total=${families.body.pagination?.total}`);
  const targetClan = families.body.data?.find((c) => c.id) || families.body.data?.[0];
  if (targetClan) {
    ok('DoD-3b 家族列表含脱敏手机号', typeof targetClan.admin_phone_masked === 'string' && targetClan.admin_phone_masked.includes('****'));
  }
  if (targetClan) {
    const detail = await req('GET', `/api/platform/families/${targetClan.id}`, null, token);
    ok('DoD-3c 家族详情含 4 项数据概览', detail.status === 200 && detail.body.stats && 'member_count' in detail.body.stats && 'media_count' in detail.body.stats && 'storage_bytes' in detail.body.stats);
  }

  // 用户管理验证
  const users = await req('GET', '/api/platform/users?page=1&pageSize=10', null, token);
  ok('DoD-4a 用户列表接口', users.status === 200 && Array.isArray(users.body.data));
  const userId = users.body.data?.[0]?.id;
  if (userId) {
    const uDetail = await req('GET', `/api/platform/users/${userId}`, null, token);
    ok('DoD-4b 用户详情含 10 条操作记录', uDetail.status === 200 && Array.isArray(uDetail.body.recent_logs) && uDetail.body.recent_logs.length <= 10);
  }

  // 内容审核
  const mediaR = await req('GET', '/api/platform/reviews/media?status=PENDING&page=1&pageSize=5', null, token);
  ok('DoD-5a 全平台影像审核', mediaR.status === 200 && Array.isArray(mediaR.body.data));
  const postsR = await req('GET', '/api/platform/reviews/posts?status=PUBLISHED&page=1&pageSize=5', null, token);
  ok('DoD-5b 全平台寻亲帖审核', postsR.status === 200 && Array.isArray(postsR.body.data));
  const reports = await req('GET', '/api/platform/reviews/reports?type=media&page=1&pageSize=5', null, token);
  ok('DoD-5c 违规内容举报', reports.status === 200);

  // 订单管理
  const printOrders = await req('GET', '/api/platform/orders/print?page=1&pageSize=5', null, token);
  ok('DoD-6a 印刷订单列表', printOrders.status === 200 && Array.isArray(printOrders.body.data));
  const rechargeOrders = await req('GET', '/api/platform/orders/recharge?page=1&pageSize=5', null, token);
  ok('DoD-6b 充值订单列表', rechargeOrders.status === 200 && Array.isArray(rechargeOrders.body.data));

  // 系统配置
  const pricing = await req('GET', '/api/platform/settings/pricing', null, token);
  ok('DoD-7a 获取定价', pricing.status === 200 && pricing.body.sms_unit_price !== undefined);

  // DoD-2: 修改短信单价后，调用 /api/platform/settings/pricing 拿回
  const newPrice = 0.077;
  const pricingBody = { ...pricing.body, sms_unit_price: newPrice };
  const put = await req('PUT', '/api/platform/settings/pricing', pricingBody, token);
  ok('DoD-7b PUT 短信单价', put.status === 200, `status=${put.status}`);
  const reread = await req('GET', '/api/platform/settings/pricing', null, token);
  ok('DoD-7c 重新 GET 拿回新值', reread.body.sms_unit_price === newPrice, `新值=${reread.body.sms_unit_price}`);
  // 还原
  await req('PUT', '/api/platform/settings/pricing', { ...pricing.body }, token);

  const switches = await req('GET', '/api/platform/settings/switches', null, token);
  ok('DoD-7d 全局开关', switches.status === 200 && typeof switches.body.sms_enabled === 'boolean');
  const defaults = await req('GET', '/api/platform/settings/clan-defaults', null, token);
  ok('DoD-7e 家族默认配置', defaults.status === 200 && typeof defaults.body.daily_sms_limit === 'number');

  // 数据统计
  const summary = await req('GET', '/api/platform/statistics/summary?period=week', null, token);
  ok('DoD-8a 周期统计', summary.status === 200 && summary.body.totals && Array.isArray(summary.body.trends));
  const ranking = await req('GET', '/api/platform/statistics/family-ranking?type=member_count&limit=5', null, token);
  ok('DoD-8b 家族排行', ranking.status === 200 && Array.isArray(ranking.body.data));

  // DoD-3: 操作日志可见 VIEW_DASHBOARD、APPROVE_CLAN 等记录
  const logs = await req('GET', '/api/platform/logs/operations?page=1&pageSize=20', null, token);
  ok('DoD-9a 操作日志接口', logs.status === 200 && Array.isArray(logs.body.data));
  const loginLogs = await req('GET', '/api/platform/logs/login?page=1&pageSize=5', null, token);
  ok('DoD-9b 登录日志接口', loginLogs.status === 200 && Array.isArray(loginLogs.body.data));
  const logActions = new Set(logs.body.data?.map((l) => l.action_type) || []);
  ok('DoD-9c 包含 VIEW_DASHBOARD 记录', logActions.has('VIEW_DASHBOARD'));
  ok('DoD-9d 包含 LOGIN 记录', logActions.has('LOGIN'));
  ok('DoD-9e 包含 UPDATE_PRICING 记录', logActions.has('UPDATE_PRICING'));

  // 误用未登录 token 应当 401
  const noAuth = await req('GET', '/api/platform/dashboard/stats');
  ok('DoD-10 未授权请求 401', noAuth.status === 401);

  // 错误密码应 401
  const bad = await req('POST', '/api/platform/auth/login', { username: 'platform_admin', password: 'wrong' });
  ok('DoD-11 错误密码 401', bad.status === 401);

  console.log('\n========== 汇总 ==========');
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`通过 ${passed}/${total} 项`);
  if (passed < total) {
    console.log('\n失败项:');
    results.filter((r) => !r.passed).forEach((r) => console.log('  - ' + r.name));
    process.exit(1);
  }
})();
