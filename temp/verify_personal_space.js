const http = require('http');

const BASE = 'localhost';
const PORT = 3001;
let TOKEN = '';
let userId = '';
let albumId = null;
let photoId = null;
let messageId = null;
let passed = 0;
let failed = 0;
const results = [];

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: BASE,
      port: PORT,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function reqMultipart(method, path, parts, headers = {}) {
  const boundary = '----TestBoundary' + Date.now();
  let body = '';
  for (const p of parts) {
    body += '--' + boundary + '\r\n';
    if (p.filename) {
      body += `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\n`;
      body += `Content-Type: ${p.contentType || 'application/octet-stream'}\r\n\r\n`;
      body += p.value + '\r\n';
    } else {
      body += `Content-Disposition: form-data; name="${p.name}"\r\n\r\n`;
      body += p.value + '\r\n';
    }
  }
  body += '--' + boundary + '--\r\n';

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: BASE,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

function check(name, condition, detail) {
  if (condition) {
    passed++;
    results.push(`  ✅ ${name}`);
  } else {
    failed++;
    results.push(`  ❌ ${name} ${detail || ''}`);
  }
}

async function main() {
  console.log('=== 个人空间模块端到端验收 ===\n');

  // 1. 登录获取 token (使用演示族员账号)
  console.log('--- 1. 认证 ---');
  try {
    const login = await req('POST', '/auth/demo-member-login', {});
    if ((login.status === 200 || login.status === 201) && login.body.access_token) {
      TOKEN = login.body.access_token;
      userId = login.body.user?.id || '';
      check('演示族员登录成功', true, `userId=${userId}`);
    } else {
      // 回退：使用演示管理员
      const login2 = await req('POST', '/auth/demo-login', {});
      if ((login2.status === 200 || login2.status === 201) && login2.body.access_token) {
        TOKEN = login2.body.access_token;
        userId = login2.body.user?.id || '';
        check('演示管理员登录成功', true, `userId=${userId}`);
      } else {
        check('登录', false, `status=${login2.status} body=${JSON.stringify(login2.body).slice(0, 200)}`);
        console.log('无法获取 Token，终止测试');
        printResults();
        return;
      }
    }
  } catch (e) {
    check('登录', false, e.message);
    console.log('无法连接服务器，终止测试');
    printResults();
    return;
  }

  const auth = { Authorization: `Bearer ${TOKEN}` };

  // 2. 未认证保护
  console.log('\n--- 2. 认证保护 ---');
  const noAuth = await req('GET', '/api/personal-space/storage');
  check('未登录访问返回 401', noAuth.status === 401 || noAuth.status === 403,
    `status=${noAuth.status}`);

  // 3. 存储信息
  console.log('\n--- 3. 存储信息 ---');
  const storage = await req('GET', '/api/personal-space/storage', null, auth);
  check('获取存储信息 200', storage.status === 200, `status=${storage.status}`);
  check('存储包含 used_bytes', storage.body.used_bytes !== undefined);
  check('存储包含 quota_bytes', storage.body.quota_bytes !== undefined);
  check('配额为 200MB', Number(storage.body.quota_bytes) === 209715200);

  // 4. 相册 CRUD
  console.log('\n--- 4. 相册 CRUD ---');
  const listAlbums = await req('GET', '/api/personal-space/albums', null, auth);
  check('获取相册列表 200', listAlbums.status === 200, `status=${listAlbums.status}`);
  check('返回数组', Array.isArray(listAlbums.body));

  const createAlbum = await req('POST', '/api/personal-space/albums', {
    name: '测试相册',
    description: '这是一个测试相册',
    default_privacy: 'self',
  }, auth);
  check('创建相册 201', createAlbum.status === 201, `status=${createAlbum.status} body=${JSON.stringify(createAlbum.body).slice(0, 100)}`);
  if (createAlbum.body.id) {
    albumId = String(createAlbum.body.id);
    check('相册名称正确', createAlbum.body.name === '测试相册');
    check('相册隐私级别正确', createAlbum.body.default_privacy === 'self');
  }

  // 创建相册验证 - name必填
  const createAlbumInvalid = await req('POST', '/api/personal-space/albums', {
    description: '缺少name',
  }, auth);
  check('缺少name字段返回 400', createAlbumInvalid.status === 400, `status=${createAlbumInvalid.status}`);

  if (albumId) {
    const updateAlbum = await req('PUT', `/api/personal-space/albums/${albumId}`, {
      name: '重命名相册',
      description: '已更新描述',
    }, auth);
    check('更新相册 200', updateAlbum.status === 200, `status=${updateAlbum.status}`);
    if (updateAlbum.status === 200) {
      check('相册名已更新', updateAlbum.body.name === '重命名相册');
    }
  }

  // 5. 照片操作
  console.log('\n--- 5. 照片操作 ---');
  if (albumId) {
    const uploadResult = await reqMultipart('POST', '/api/personal-space/photos/upload', [
      { name: 'album_id', value: albumId },
      { name: 'location_name', value: '北京故宫' },
      { name: 'taken_year', value: '2020' },
      { name: 'taken_date', value: '2020-05-15' },
      { name: 'description', value: '测试照片描述' },
      { name: 'privacy', value: 'self' },
      { name: 'file', filename: 'test.jpg', contentType: 'image/jpeg', value: 'FAKE_JPG_DATA_FOR_TEST' },
    ], auth);
    check('上传照片 201', uploadResult.status === 201, `status=${uploadResult.status} body=${JSON.stringify(uploadResult.body).slice(0, 150)}`);
    if (uploadResult.body.id) {
      photoId = String(uploadResult.body.id);
      check('照片地点正确', uploadResult.body.location_name === '北京故宫');
      check('照片年份正确', uploadResult.body.taken_year === 2020);
    }

    // 上传缺少必填字段
    const uploadInvalid = await reqMultipart('POST', '/api/personal-space/photos/upload', [
      { name: 'album_id', value: albumId },
      { name: 'file', filename: 'test2.jpg', contentType: 'image/jpeg', value: 'FAKE' },
    ], auth);
    check('缺少地点/年份返回 400', uploadInvalid.status === 400, `status=${uploadInvalid.status}`);

    // 获取照片列表
    const listPhotos = await req('GET', `/api/personal-space/photos?album_id=${albumId}`, null, auth);
    check('获取照片列表 200', listPhotos.status === 200, `status=${listPhotos.status}`);

    if (photoId) {
      // 编辑照片
      const updatePhoto = await req('PUT', `/api/personal-space/photos/${photoId}`, {
        description: '已更新描述',
        location_name: '上海外滩',
      }, auth);
      check('更新照片 200', updatePhoto.status === 200, `status=${updatePhoto.status}`);

      // 移动照片 - 先创建另一个相册
      const album2 = await req('POST', '/api/personal-space/albums', {
        name: '目标相册',
        default_privacy: 'clan',
      }, auth);
      if (album2.body.id) {
        const moveResult = await req('POST', `/api/personal-space/photos/${photoId}/move`, {
          target_album_id: String(album2.body.id),
        }, auth);
        check('移动照片 200', moveResult.status === 200, `status=${moveResult.status}`);
      }
    }
  }

  // 6. 留言 CRUD
  console.log('\n--- 6. 留言板 CRUD ---');
  const listMessages = await req('GET', '/api/personal-space/messages', null, auth);
  check('获取留言列表 200', listMessages.status === 200, `status=${listMessages.status}`);

  const createMsg = await reqMultipart('POST', '/api/personal-space/messages', [
    { name: 'content', value: '这是一条测试留言，用于验收个人空间留言板功能。' },
    { name: 'privacy', value: 'self' },
  ], auth);
  check('发布留言 201', createMsg.status === 201, `status=${createMsg.status} body=${JSON.stringify(createMsg.body).slice(0, 100)}`);
  if (createMsg.body.id) {
    messageId = String(createMsg.body.id);
    check('留言内容正确', createMsg.body.content === '这是一条测试留言，用于验收个人空间留言板功能。');
    check('留言隐私级别正确', createMsg.body.privacy === 'self');
  }

  // 留言字数超限
  const longMsg = 'a'.repeat(201);
  const createMsgInvalid = await reqMultipart('POST', '/api/personal-space/messages', [
    { name: 'content', value: longMsg },
  ], auth);
  check('留言超200字返回 400', createMsgInvalid.status === 400, `status=${createMsgInvalid.status}`);

  if (messageId) {
    // 编辑留言
    const updateMsg = await req('PUT', `/api/personal-space/messages/${messageId}`, {
      content: '已编辑的留言内容',
    }, auth);
    check('编辑留言 200', updateMsg.status === 200, `status=${updateMsg.status}`);
    if (updateMsg.status === 200) {
      check('留言已标记编辑', updateMsg.body.is_edited === true);
    }
  }

  // 7. 清理测试数据
  console.log('\n--- 7. 数据清理 ---');
  if (messageId) {
    const delMsg = await req('DELETE', `/api/personal-space/messages/${messageId}`, null, auth);
    check('删除留言 200', delMsg.status === 200, `status=${delMsg.status}`);
  }
  if (photoId) {
    const delPhoto = await req('DELETE', `/api/personal-space/photos/${photoId}`, null, auth);
    check('删除照片 200', delPhoto.status === 200, `status=${delPhoto.status}`);
  }
  if (albumId) {
    const delAlbum = await req('DELETE', `/api/personal-space/albums/${albumId}`, null, auth);
    check('删除相册 200', delAlbum.status === 200, `status=${delAlbum.status}`);
  }

  printResults();
}

function printResults() {
  console.log('\n========== 验收结果 ==========');
  for (const r of results) console.log(r);
  console.log(`\n总计: ${passed + failed} 项  ✅ 通过: ${passed}  ❌ 失败: ${failed}`);
  console.log(`通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
}

main().catch((e) => {
  console.error('脚本异常:', e);
  printResults();
});
