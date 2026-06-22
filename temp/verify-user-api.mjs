#!/usr/bin/env node
// 根脉云谱用户中心 API 验收脚本（Node 版本）
const BASE = 'http://localhost:3001';

let pass = 0, fail = 0;
const results = [];

function ok(name, detail = '') {
  pass++;
  results.push({ name, status: 'PASS', detail });
  console.log(`[OK] ${name}${detail ? ' - ' + detail : ''}`);
}

function fail_(name, detail = '') {
  fail++;
  results.push({ name, status: 'FAIL', detail });
  console.log(`[FAIL] ${name}${detail ? ' - ' + detail : ''}`);
}

async function main() {
  console.log('\n=== 1. 演示账号登录 ===');
  const loginRes = await fetch(`${BASE}/auth/demo-login`, { method: 'POST' });
  const loginData = await loginRes.json();
  if (loginRes.status === 201 && loginData.access_token) {
    ok('演示账号登录', `token 长度 ${loginData.access_token.length}`);
  } else {
    fail_('演示账号登录', `HTTP ${loginRes.status}`);
    return;
  }
  const TOKEN = loginData.access_token;
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };

  // ===== Profile =====
  console.log('\n=== 2. GET /api/user/profile ===');
  const profileRes = await fetch(`${BASE}/api/user/profile`, { headers });
  const profile = await profileRes.json();
  if (profileRes.status === 200 && profile.id) {
    ok('GET profile',
      `phone=${profile.phone}, nickname=${profile.nickname}, clan=${profile.primary_clan?.name}, role=${profile.primary_clan?.role}`);
    ok('profile.stats', `photos=${profile.stats.photo_count}, annotations=${profile.stats.annotation_count}, orders=${profile.stats.order_count}`);
    ok('profile.families.length', `${profile.families?.length || 0}`);
    ok('profile.setting', `crossClan=${profile.setting?.allow_cross_clan_friend_finding}`);
  } else {
    fail_('GET profile', `HTTP ${profileRes.status}`);
  }

  // ===== Profile update =====
  console.log('\n=== 3. PUT /api/user/profile ===');
  const updateBody = JSON.stringify({
    nickname: '验收测试',
    email: 'test@geneasphere.com',
  });
  const updateRes = await fetch(`${BASE}/api/user/profile`, {
    method: 'PUT',
    headers,
    body: updateBody,
  });
  const updateData = await updateRes.json();
  if (updateRes.status === 200 && updateData.nickname === '验收测试') {
    ok('PUT profile', `nickname 改为 "${updateData.nickname}"`);
  } else {
    fail_('PUT profile', `HTTP ${updateRes.status}: ${JSON.stringify(updateData).slice(0, 100)}`);
  }

  // ===== Settings GET =====
  console.log('\n=== 4. GET /api/user/settings ===');
  const settingsRes = await fetch(`${BASE}/api/user/settings`, { headers });
  const settings = await settingsRes.json();
  if (settingsRes.status === 200) {
    ok('GET settings',
      `crossClan=${settings.allow_cross_clan_friend_finding}, childhood=${settings.show_childhood_location}, in_app=${settings.enable_in_app_notification}`);
  } else {
    fail_('GET settings', `HTTP ${settingsRes.status}`);
  }

  // ===== Settings PUT =====
  console.log('\n=== 5. PUT /api/user/settings ===');
  const setBody = JSON.stringify({
    show_childhood_location: true,
    enable_sms_notification: true,
  });
  const setRes = await fetch(`${BASE}/api/user/settings`, {
    method: 'PUT',
    headers,
    body: setBody,
  });
  const setData = await setRes.json();
  if (setRes.status === 200 && setData.show_childhood_location === true && setData.enable_sms_notification === true) {
    ok('PUT settings', `childhood=${setData.show_childhood_location}, sms=${setData.enable_sms_notification}`);
  } else {
    fail_('PUT settings', `HTTP ${setRes.status}: ${JSON.stringify(setData).slice(0, 100)}`);
  }

  // ===== Notifications =====
  console.log('\n=== 6. Notifications ===');
  const unreadRes = await fetch(`${BASE}/api/user/notifications/unread-count`, { headers });
  const unreadData = await unreadRes.json();
  if (unreadRes.status === 200) {
    ok('GET unread-count', `unread=${unreadData.unread_count}`);
  } else {
    fail_('GET unread-count', `HTTP ${unreadRes.status}`);
  }

  const notifRes = await fetch(`${BASE}/api/user/notifications`, { headers });
  const notifData = await notifRes.json();
  if (notifRes.status === 200 && Array.isArray(notifData.data)) {
    ok('GET notifications', `${notifData.data.length} 条`);
  } else {
    fail_('GET notifications', `HTTP ${notifRes.status}`);
  }

  // ===== Photos =====
  console.log('\n=== 7. GET /api/user/photos ===');
  const photosRes = await fetch(`${BASE}/api/user/photos?page=1&pageSize=5`, { headers });
  const photosData = await photosRes.json();
  if (photosRes.status === 200 && Array.isArray(photosData.data)) {
    ok('GET photos', `total=${photosData.pagination.total}, page_size=${photosData.pagination.page_size}`);
  } else {
    fail_('GET photos', `HTTP ${photosRes.status}`);
  }

  // ===== Orders =====
  console.log('\n=== 8. GET /api/user/orders ===');
  const ordersRes = await fetch(`${BASE}/api/user/orders?page=1&pageSize=5`, { headers });
  const ordersData = await ordersRes.json();
  if (ordersRes.status === 200 && Array.isArray(ordersData.data)) {
    ok('GET orders', `total=${ordersData.pagination.total}`);
  } else {
    fail_('GET orders', `HTTP ${ordersRes.status}`);
  }

  // ===== Annotations =====
  console.log('\n=== 9. GET /api/user/annotations ===');
  const annRes = await fetch(`${BASE}/api/user/annotations?page=1&pageSize=5`, { headers });
  const annData = await annRes.json();
  if (annRes.status === 200 && Array.isArray(annData.data)) {
    ok('GET annotations', `total=${annData.pagination.total}`);
  } else {
    fail_('GET annotations', `HTTP ${annRes.status}`);
  }

  // ===== Mock 模块 =====
  console.log('\n=== 10. Mock 模块接口 ===');
  for (const [name, path] of [
    ['tool-history', '/api/user/tool-history'],
    ['groups', '/api/user/groups'],
    ['videos', '/api/user/videos'],
  ]) {
    const res = await fetch(`${BASE}${path}`, { headers });
    const data = await res.json();
    if (res.status === 200) {
      ok(`GET ${name}`, `data=${data.data?.length ?? 0}, notice="${data.notice?.slice(0, 30)}..."`);
    } else {
      fail_(`GET ${name}`, `HTTP ${res.status}`);
    }
  }

  // ===== 密码校验 =====
  console.log('\n=== 11. POST /api/user/password 旧密码错误 ===');
  const wrongRes = await fetch(`${BASE}/api/user/password`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      old_password: 'wrong_password',
      new_password: 'newpwd12345',
      confirm_password: 'newpwd12345',
    }),
  });
  if (wrongRes.status === 400) {
    ok('错误旧密码应返回 400', `HTTP ${wrongRes.status}`);
  } else {
    fail_('错误旧密码应返回 400', `实际 ${wrongRes.status}`);
  }

  // ===== 401 校验 =====
  console.log('\n=== 12. 未授权访问 ===');
  try {
    const noAuthRes = await fetch(`${BASE}/api/user/profile`);
    if (noAuthRes.status === 401) {
      ok('未授权返回 401');
    } else {
      fail_('未授权返回 401', `实际 ${noAuthRes.status}`);
    }
  } catch (err) {
    fail_('未授权测试', err.message);
  }

  // ===== 总结 =====
  console.log('\n=== 验收总结 ===');
  console.log(`通过: ${pass}`);
  console.log(`失败: ${fail}`);
  console.log(`总计: ${pass + fail}`);
  console.log(`通过率: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);

  if (fail > 0) {
    console.log('\n失败项：');
    results.filter((r) => r.status === 'FAIL').forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});