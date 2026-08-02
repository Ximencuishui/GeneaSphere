// 临时数据：插入 1 条 merge application + 1 个 Zhuxi demo 族人作为 applicant
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString:
      'postgresql://geneauser:GeneaSphere2024!@127.0.0.1:15432/geneasphere?schema=public',
  });
  await client.connect();

  // 1. 查朱熹 demo 家族的 id
  const clan = await client.query(
    "SELECT id, slug FROM clans WHERE slug = 'zhuxi-demo' LIMIT 1"
  );
  if (clan.rowCount === 0) {
    console.error('no zhuxi-demo clan');
    process.exit(1);
  }
  const clanId = clan.rows[0].id;
  console.log('clanId:', clanId);

  // 2. 查一个族内 person（作为 matched_person）
  const person = await client.query(
    "SELECT id, full_name FROM persons WHERE clan_id = $1 LIMIT 1",
    [clanId]
  );
  console.log('person:', person.rows[0]);

  // 3. 查管理员 user（applicant）
  const admin = await client.query(
    "SELECT id FROM users WHERE phone = '13800000000' LIMIT 1"
  );
  const applicantId = admin.rows[0]?.id;
  console.log('admin id:', applicantId);

  // 4. 删除已存在的 demo merge application
  await client.query(
    "DELETE FROM merge_applications WHERE origin_place = '福建武夷山' AND clan_id = $1",
    [clanId]
  );

  // 5. 创建 3 条测试申请，覆盖 PENDING / REJECTED / APPROVED 三种状态
  const inserts = [];
  let personId = person.rows[0]?.id;
  if (personId) {
    inserts.push({
      status: 'PENDING',
      name: '朱熹后人甲（pending）',
      place: '福建武夷山（pending）',
      matched: personId,
      score: 87,
    });
    inserts.push({
      status: 'PENDING',
      name: '朱熹后人乙（pending 无匹配）',
      place: '江西婺源',
      matched: null,
      score: null,
    });
    inserts.push({
      status: 'REJECTED',
      name: '朱熹后人丙（已拒绝）',
      place: '安徽黄山',
      matched: null,
      score: null,
    });
  }

  for (const it of inserts) {
    await client.query(
      `INSERT INTO merge_applications
       (clan_id, applicant_id, origin_place, xipai_info, ancestor_name,
        migration_history, matched_person_id, match_score, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        clanId,
        applicantId,
        it.place,
        ['德', '仁', '义'],
        it.name,
        '明清时期由福建迁江西',
        it.matched,
        it.score,
        it.status,
      ]
    );
  }

  // 6. 列出结果
  const r = await client.query(
    `SELECT id, status, origin_place, ancestor_name, matched_person_id, match_score
     FROM merge_applications WHERE clan_id = $1 ORDER BY id`,
    [clanId]
  );
  console.log('inserted:', r.rows);

  await client.end();
})();
