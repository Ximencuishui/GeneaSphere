/**
 * 检查demo家族实际导入的数据量
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';

function httpRequest(url, options) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(data),
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
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

async function checkDemoData() {
  console.log('=== 检查Demo家族数据 ===\n');

  try {
    // 1. 登录获取token
    console.log('🔐 登录演示账号...');
    const loginRes = await httpRequest(`${BASE_URL}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (loginRes.status !== 200 && loginRes.status !== 201) {
      console.log('❌ 登录失败，后端可能未启动');
      console.log('   请先运行: cd apps/server && pnpm run dev');
      return;
    }

    const token = loginRes.body.access_token;
    const userId = loginRes.body.user.id;
    const clanId = loginRes.body.demoClanId;

    console.log('✅ 登录成功');
    console.log(`   用户ID: ${userId}`);
    console.log(`   家族ID: ${clanId}\n`);

    // 2. 查询家族信息
    console.log('🏛️  查询家族信息...');
    const clanRes = await httpRequest(`${BASE_URL}/clans/${clanId}`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });

    if (clanRes.status === 200) {
      console.log(`   家族名称: ${clanRes.body.name}`);
      console.log(`   创建时间: ${clanRes.body.created_at}\n`);
    }

    // 3. 查询人员总数
    console.log('👥 查询家族人员...');
    
    // 尝试获取人员列表
    const personsRes = await httpRequest(`${BASE_URL}/tree/${clanId}/persons`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });

    if (personsRes.status === 200) {
      const persons = Array.isArray(personsRes.body) ? personsRes.body : 
                      (personsRes.body.persons || personsRes.body.data || []);
      
      console.log(`\n📊 人员统计:`);
      console.log(`   总人数: ${persons.length} 人`);
      
      if (persons.length > 0) {
        // 统计性别分布
        const maleCount = persons.filter(p => p.gender === 'male').length;
        const femaleCount = persons.filter(p => p.gender === 'female').length;
        
        console.log(`   男性: ${maleCount} 人`);
        console.log(`   女性: ${femaleCount} 人`);
        
        // 统计在世状态
        const livingCount = persons.filter(p => p.is_living === true).length;
        const deceasedCount = persons.filter(p => p.is_living === false).length;
        
        console.log(`   在世: ${livingCount} 人`);
        console.log(`   已故: ${deceasedCount} 人`);
        
        // 显示最新导入的10条记录
        console.log(`\n📋 最新导入的人员（前10条）:`);
        const recentPersons = persons
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 10);
        
        recentPersons.forEach((person, index) => {
          const createdDate = new Date(person.created_at).toLocaleString('zh-CN');
          console.log(`   ${index + 1}. ${person.full_name} | ${person.gender === 'male' ? '男' : '女'} | ${person.is_living ? '在世' : '已故'}`);
          if (person.birth_date) {
            const birthDate = new Date(person.birth_date).toISOString().split('T')[0];
            console.log(`      出生: ${birthDate}`);
          }
          console.log(`      导入时间: ${createdDate}`);
        });
        
        if (persons.length > 10) {
          console.log(`   ... 还有 ${persons.length - 10} 条记录`);
        }
      } else {
        console.log('   ⚠️  家族中暂无人员数据');
      }
    } else {
      console.log(`   ⚠️  无法获取人员列表 (状态码: ${personsRes.status})`);
      console.log('   尝试其他API...');
      
      // 尝试其他可能的API端点
      const altEndpoints = [
        `/clans/${clanId}/persons`,
        `/clans/${clanId}/members`,
        `/persons?clan_id=${clanId}`,
      ];
      
      for (const endpoint of altEndpoints) {
        const altRes = await httpRequest(`${BASE_URL}${endpoint}`, {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        });
        
        if (altRes.status === 200) {
          const data = Array.isArray(altRes.body) ? altRes.body : 
                       (altRes.body.persons || altRes.body.data || []);
          console.log(`   ✅ 通过 ${endpoint} 获取到 ${data.length} 条记录`);
          break;
        }
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 总结:');
    console.log('   如果上面显示人数为0或很少，说明:');
    console.log('   1. 《全国陈氏总谱.pdf》是扫描件，无法提取数据');
    console.log('   2. 还没有通过PDF导入页面成功导入数据');
    console.log('   3. 需要先启动前后端服务，然后通过页面导入');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.log('❌ 检查失败:', error.message);
    console.log('\n💡 请确保:');
    console.log('   1. 后端服务已启动 (端口3001)');
    console.log('   2. 数据库连接正常');
    console.log('   3. 演示账号已初始化');
  }
}

checkDemoData();
