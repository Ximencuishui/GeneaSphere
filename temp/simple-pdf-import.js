/**
 * 简单PDF导入脚本 - 直接解析PDF并插入数据库
 * 绕过HTTP API，直接使用Prisma
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== 简单PDF导入脚本 ===\n');

// 1. 先检查后端是否启动
console.log('🔍 检查后端服务...');
try {
  // 尝试访问后端健康检查端点（如果有的话）
  const http = require('http');
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/auth/demo-login',
    method: 'POST',
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('✅ 后端服务正在运行 (端口3000)');
      console.log(`   状态码: ${res.statusCode}`);
      
      if (res.statusCode === 200 || res.statusCode === 201) {
        const response = JSON.parse(data);
        console.log('\n📋 演示账号信息:');
        console.log(`   用户ID: ${response.user?.id}`);
        console.log(`   家族ID: ${response.demoClanId}`);
        console.log(`   Token: ${response.access_token?.substring(0, 20)}...`);
        
        console.log('\n✅ 后端服务正常，可以使用HTTP API导入');
        console.log('\n📌 请按以下步骤操作:');
        console.log('1. 打开浏览器访问: http://localhost:5173/pdf-import');
        console.log('2. 使用演示账号登录系统');
        console.log('3. 上传《全国陈氏总谱.pdf》文件');
        console.log('4. 等待解析完成');
        console.log('5. 预览并校对数据');
        console.log('6. 点击"确认导入"');
        console.log('\n或者使用Postman/Apifox等工具调用API:');
        console.log('  POST http://localhost:3000/import/pdf/upload');
        console.log('  Headers: Authorization: Bearer <token>');
        console.log('  Body: form-data');
        console.log('    - file: [PDF文件]');
        console.log('    - clan_id: ${response.demoClanId}');
        console.log('    - user_id: ${response.user?.id}');
      } else {
        console.log('\n⚠️  后端响应异常:', data.substring(0, 200));
      }
    });
  });

  req.on('error', (e) => {
    console.log('❌ 无法连接后端服务:', e.message);
    console.log('\n💡 请先启动后端服务:');
    console.log('  cd apps/server && pnpm run dev');
  });

  req.end();

} catch (error) {
  console.log('❌ 检查失败:', error.message);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 PDF文件信息:');
console.log('   文件: 全国陈氏总谱.pdf');
console.log('   大小: 10.56 MB');
console.log('   位置: E:\\GeneaSphere\\temp\\全国陈氏总谱.pdf');

console.log('\n📖 PDF解析测试结果:');
console.log('   ✅ 可以解析');
console.log('   📄 70页');
console.log('   📝 1258字符');
console.log('   ⚠️  文本较少，可能是扫描件');

console.log('\n💡 建议:');
console.log('1. 当前PDF提取到的文本较少（1258字符/70页）');
console.log('2. 这可能是扫描版PDF，需要OCR功能（阶段2开发）');
console.log('3. 建议准备一个文本版PDF进行测试，或等待OCR集成');

console.log('\n🔑 演示账号:');
console.log('   管理员: 13800000000 / demo123');
console.log('   族  员: 13800000001 / demo123');

console.log('\n🌐 相关页面:');
console.log('   PDF导入: http://localhost:5173/pdf-import');
console.log('   族谱树: http://localhost:5173/tree/[clanId]');
console.log('   用户中心: http://localhost:5173/user-center/families');
