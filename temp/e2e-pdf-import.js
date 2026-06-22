/**
 * 端到端PDF导入测试
 * 演示账号登录 → 上传PDF → 解析 → OCR → 导入数据库 → 验证
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE_URL = 'http://localhost:3001';

// HTTP请求封装（支持multipart/form-data）
function httpRequest(url, options) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = transport.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
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

// multipart/form-data上传
function uploadFile(url, filePath, fields = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).substring(2);
    const filename = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    
    const parts = [];
    
    // 添加普通字段
    for (const [key, value] of Object.entries(fields)) {
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
        `${value}\r\n`
      ));
    }
    
    // 添加文件字段
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/pdf\r\n\r\n`
    ));
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    
    const body = Buffer.concat(parts);
    
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = transport.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const startTime = Date.now();
  console.log('=== 端到端PDF导入测试 ===\n');
  console.log(`开始时间: ${new Date().toLocaleString('zh-CN')}\n`);

  try {
    // 1. 登录演示账号
    console.log('🔐 步骤1: 登录演示账号 (13800000000)');
    const loginRes = await httpRequest(`${BASE_URL}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13800000000', password: 'demo123' }),
    });

    if (loginRes.status !== 200 && loginRes.status !== 201) {
      console.log(`❌ 登录失败: ${loginRes.status}`);
      console.log('   响应:', JSON.stringify(loginRes.body).substring(0, 200));
      console.log('\n💡 演示账号可能未初始化。请先运行 seed 脚本。');
      return;
    }

    const token = loginRes.body.access_token;
    const user = loginRes.body.user;
    const clanId = loginRes.body.demoClanId || user?.clanId;

    console.log(`✅ 登录成功`);
    console.log(`   用户ID: ${user.id}`);
    console.log(`   用户名: ${user.full_name || user.phone}`);
    console.log(`   家族ID: ${clanId}`);
    console.log(`   Token: ${token?.substring(0, 20)}...\n`);

    // 2. 检查家族信息
    console.log('📋 步骤2: 获取家族信息');
    let personsBefore = 0;
    try {
      const clanRes = await httpRequest(`${BASE_URL}/tree/clan/${clanId}/full`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (clanRes.status === 200) {
        const tree = clanRes.body;
        personsBefore = tree.nodes?.length || tree.persons?.length || 0;
        console.log(`   当前家族人员: ${personsBefore} 人`);
      }
    } catch (e) {
      console.log(`   ⚠️  无法获取家族人员数: ${e.message}`);
    }
    console.log('');

    // 3. 上传PDF
    const pdfPath = path.join(__dirname, '全国陈氏总谱.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.log(`❌ 未找到PDF: ${pdfPath}`);
      return;
    }

    console.log('📤 步骤3: 上传《全国陈氏总谱.pdf》');
    const pdfSize = fs.statSync(pdfPath).size;
    console.log(`   文件大小: ${(pdfSize / 1024 / 1024).toFixed(2)} MB`);
    
    const uploadStartTime = Date.now();
    const uploadRes = await uploadFile(
      `${BASE_URL}/import/pdf/upload`,
      pdfPath,
      {
        clan_id: clanId.toString(),
        user_id: user.id.toString(),
      },
      { 'Authorization': `Bearer ${token}` }
    );
    const uploadTime = Date.now() - uploadStartTime;

    if (uploadRes.status !== 200 && uploadRes.status !== 201) {
      console.log(`❌ 上传失败: ${uploadRes.status}`);
      console.log('   响应:', JSON.stringify(uploadRes.body).substring(0, 500));
      return;
    }

    const taskId = uploadRes.body.taskId;
    console.log(`✅ 上传成功 (${uploadTime}ms)`);
    console.log(`   任务ID: ${taskId}`);
    console.log(`   消息: ${uploadRes.body.message}\n`);

    // 4. 轮询解析状态
    console.log('⏳ 步骤4: 轮询解析状态（OCR可能需要几分钟）');
    let status = 'pending';
    let pollCount = 0;
    let previewData = null;
    const maxPolls = 180; // 最多轮询180次 = 6分钟

    while (pollCount < maxPolls) {
      pollCount++;
      const statusRes = await httpRequest(
        `${BASE_URL}/import/pdf/task/${taskId}/status`,
        { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (statusRes.status !== 200) {
        console.log(`   ❌ 状态查询失败: ${statusRes.status}`);
        break;
      }

      status = statusRes.body.status;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      process.stdout.write(
        `\r   [${elapsed}s] 状态: ${status} | ` +
        `页数: ${statusRes.body.totalPages || '?'} | ` +
        `模式: ${statusRes.body.parseMode || '?'} | ` +
        `轮询: ${pollCount}/${maxPolls}     `
      );

      if (status === 'preview') {
        console.log('\n   ✅ 解析完成，进入预览阶段\n');
        // 获取预览数据
        const previewRes = await httpRequest(
          `${BASE_URL}/import/pdf/task/${taskId}/preview`,
          { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (previewRes.status === 200) {
          previewData = previewRes.body.records;
          console.log(`   📊 提取到 ${previewData?.length || 0} 条人员记录`);
          if (previewData && previewData.length > 0) {
            console.log('\n   前5条预览:');
            previewData.slice(0, 5).forEach((r, i) => {
              console.log(`     ${i + 1}. ${r.fullName} | ${r.gender === 'M' ? '男' : r.gender === 'F' ? '女' : '未知'} | 置信度: ${r.confidenceScore}%`);
            });
          }
        }
        break;
      } else if (status === 'failed') {
        console.log(`\n   ❌ 解析失败: ${statusRes.body.errorMessage || '未知错误'}`);
        return;
      }

      await sleep(2000); // 2秒轮询一次
    }

    if (status !== 'preview' || !previewData) {
      console.log('\n   ⚠️  解析超时或无数据，继续尝试执行导入');
    }

    // 5. 执行导入
    console.log('\n💾 步骤5: 执行数据库导入');
    const executeRes = await httpRequest(
      `${BASE_URL}/import/pdf/task/${taskId}/execute`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id.toString(),
          clan_id: clanId.toString(),
        }),
      }
    );

    if (executeRes.status !== 200 && executeRes.status !== 201) {
      console.log(`❌ 导入失败: ${executeRes.status}`);
      console.log('   响应:', JSON.stringify(executeRes.body).substring(0, 500));
    } else {
      console.log(`✅ 导入完成`);
      console.log(`   成功: ${executeRes.body.successCount} 条`);
      console.log(`   失败: ${executeRes.body.failureCount} 条`);
      if (executeRes.body.errors && executeRes.body.errors.length > 0) {
        console.log(`   错误示例: ${executeRes.body.errors[0]}`);
      }
    }

    // 6. 验证数据库结果
    console.log('\n🔍 步骤6: 验证数据库');
    await sleep(2000); // 等待数据写入

    try {
      const verifyRes = await httpRequest(
        `${BASE_URL}/tree/clan/${clanId}/full`,
        { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (verifyRes.status === 200) {
        const tree = verifyRes.body;
        const personsAfter = tree.nodes?.length || tree.persons?.length || 0;
        const imported = personsAfter - personsBefore;
        console.log(`   家族人员: ${personsAfter} 人 (导入前: ${personsBefore}, 新增: ${imported})`);
      }
    } catch (e) {
      console.log(`   ⚠️  验证失败: ${e.message}`);
    }

    // 7. 总结
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 测试总结');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   总耗时: ${totalTime}秒`);
    console.log(`   登录: ✅ 演示账号 13800000000`);
    console.log(`   上传: ✅ PDF上传成功`);
    console.log(`   解析: ${status === 'preview' ? '✅' : '⚠️'} 状态: ${status}`);
    console.log(`   提取: ${previewData ? `✅ ${previewData.length}条记录` : '⚠️ 无数据'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('\n❌ 测试异常:', error.message);
    console.error(error.stack);
  }
}

main();
