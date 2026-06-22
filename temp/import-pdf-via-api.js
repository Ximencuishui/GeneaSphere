/**
 * 通过HTTP API导入PDF到演示家族
 * 使用演示账号登录，然后调用PDF导入接口
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = 'http://localhost:3001';
const PDF_FILE = path.join(__dirname, '全国陈氏总谱.pdf');

// 演示账号信息
const DEMO_ACCOUNTS = [
  { phone: '13800000000', password: 'demo123', role: '管理员' },
  { phone: '13800000001', password: 'demo123', role: '族员' },
];

/**
 * 发送HTTP请求
 */
function httpRequest(url, options) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data),
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

/**
 * 演示账号登录
 */
async function demoLogin(isMember = false) {
  const endpoint = isMember ? '/auth/demo-member-login' : '/auth/demo-login';
  
  console.log(`🔐 正在登录（${isMember ? '族员' : '管理员'}）...`);
  
  const response = await httpRequest(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`登录失败: ${JSON.stringify(response.body)}`);
  }

  console.log('✅ 登录成功');
  console.log(`👤 用户ID: ${response.body.user.id}`);
  console.log(`🏛️  家族ID: ${response.body.demoClanId}`);

  return {
    token: response.body.access_token,
    userId: response.body.user.id,
    clanId: response.body.demoClanId,
  };
}

/**
 * 上传PDF文件
 */
async function uploadPdf(token, userId, clanId) {
  console.log('\n📤 正在上传PDF文件...');

  const pdfBuffer = fs.readFileSync(PDF_FILE);
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;

  const bodyParts = [];

  // 文件字段
  bodyParts.push(Buffer.from(`--${boundary}\r\n`));
  bodyParts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="全国陈氏总谱.pdf"\r\n`));
  bodyParts.push(Buffer.from(`Content-Type: application/pdf\r\n\r\n`));
  bodyParts.push(pdfBuffer);
  bodyParts.push(Buffer.from('\r\n'));

  // clan_id字段
  bodyParts.push(Buffer.from(`--${boundary}\r\n`));
  bodyParts.push(Buffer.from(`Content-Disposition: form-data; name="clan_id"\r\n\r\n`));
  bodyParts.push(Buffer.from(`${clanId}\r\n`));

  // user_id字段
  bodyParts.push(Buffer.from(`--${boundary}\r\n`));
  bodyParts.push(Buffer.from(`Content-Disposition: form-data; name="user_id"\r\n\r\n`));
  bodyParts.push(Buffer.from(`${userId}\r\n`));

  bodyParts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(bodyParts);

  const response = await httpRequest(`${BASE_URL}/import/pdf/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
    body: body,
  });

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`上传失败: ${JSON.stringify(response.body)}`);
  }

  console.log('✅ PDF上传成功');
  console.log(`🆔 任务ID: ${response.body.taskId}`);

  return response.body.taskId;
}

/**
 * 查询任务状态
 */
async function getTaskStatus(token, taskId) {
  const response = await httpRequest(`${BASE_URL}/import/pdf/task/${taskId}/status`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  return response.body;
}

/**
 * 获取预览数据
 */
async function getTaskPreview(token, taskId) {
  const response = await httpRequest(`${BASE_URL}/import/pdf/task/${taskId}/preview`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  return response.body;
}

/**
 * 执行导入
 */
async function executeImport(token, taskId, userId, clanId) {
  console.log('\n💾 正在执行导入...');

  const response = await httpRequest(`${BASE_URL}/import/pdf/task/${taskId}/execute`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: userId,
      clan_id: clanId,
    }),
  });

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`导入失败: ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

/**
 * 等待任务完成（轮询）
 */
async function waitForTask(token, taskId, maxWait = 60000) {
  console.log('\n⏳ 等待PDF解析完成...');
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const status = await getTaskStatus(token, taskId);
    console.log(`   状态: ${status.status}`);

    if (status.status === 'preview' || status.status === 'correcting') {
      console.log('✅ 解析完成');
      return status;
    }

    if (status.status === 'failed') {
      throw new Error(`解析失败: ${status.errorMessage}`);
    }
  }

  throw new Error('等待超时');
}

/**
 * 主函数
 */
async function main() {
  console.log('=== PDF族谱HTTP API导入脚本 ===\n');

  try {
    // 1. 检查PDF文件
    if (!fs.existsSync(PDF_FILE)) {
      console.error('❌ PDF文件不存在:', PDF_FILE);
      process.exit(1);
    }

    console.log('📄 PDF文件:', path.basename(PDF_FILE));
    console.log('📊 文件大小:', (fs.statSync(PDF_FILE).size / 1024 / 1024).toFixed(2), 'MB');

    // 2. 登录获取Token（使用管理员账号）
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const { token, userId, clanId } = await demoLogin(false);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 3. 上传PDF
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const taskId = await uploadPdf(token, userId, clanId);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 4. 等待解析完成
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const taskStatus = await waitForTask(token, taskId);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 5. 获取预览数据
    console.log('\n📋 获取预览数据...');
    const preview = await getTaskPreview(token, taskId);
    console.log(`✅ 提取到 ${preview.totalRecords} 条人员记录`);

    if (preview.totalRecords > 0) {
      console.log('\n📋 样本数据（前5条）:');
      preview.records.slice(0, 5).forEach((record, i) => {
        console.log(`  ${i + 1}. ${record.fullName} | ${record.gender === 'M' ? '男' : record.gender === 'F' ? '女' : '未知'} | 置信度: ${record.confidenceScore}%`);
      });
    }

    // 6. 执行导入
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const importResult = await executeImport(token, taskId, userId, clanId);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 7. 显示结果
    console.log('\n✅ 导入完成!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 导入统计:');
    console.log(`  ✓ 成功: ${importResult.successCount} 条`);
    console.log(`  ✗ 失败: ${importResult.failureCount} 条`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (importResult.errors && importResult.errors.length > 0) {
      console.log(`\n⚠️  错误详情（共${importResult.errors.length}个）:`);
      importResult.errors.slice(0, 10).forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }

    console.log('\n📌 查看导入结果:');
    console.log(`  族谱树: http://localhost:5173/tree/${clanId}`);
    console.log(`  用户中心: http://localhost:5173/user-center/families`);
    console.log('\n🔑 演示账号:');
    console.log('  管理员: 13800000000 / demo123');
    console.log('  族  员: 13800000001 / demo123');

  } catch (error) {
    console.error('\n❌ 导入失败:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 提示: 后端服务未启动，请先启动后端服务:');
      console.log('  cd apps/server && pnpm run dev');
    }
    
    process.exit(1);
  }
}

// 执行
main();
