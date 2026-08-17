// 数据修复：16 个无家庭关联人员挂入族谱（镜像 pedigree.syncAncestryFromParents 的写入模式）
// 1) 朱小小：删重复 3040 + link 8，保留 3039；挂到主脉末端 朱樽强(3959) 下
// 2) E2E/Round4 测试人物(4009-4024)：分别挂到不同 depth=11 叶节点下
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});

async function attachChild(fatherId, childId, birthOrderHint) {
  // a) 闭包表：self-record + (father, child, 1) + father 的所有祖先 → child (depth+1)
  await client.query(`
    INSERT INTO person_ancestry (ancestor_id, descendant_id, depth)
    SELECT $1, $1, 0
    ON CONFLICT DO NOTHING
  `, [childId]);
  await client.query(`
    INSERT INTO person_ancestry (ancestor_id, descendant_id, depth)
    SELECT pa.ancestor_id, $2, pa.depth + 1
    FROM person_ancestry pa
    WHERE pa.descendant_id = $1
    ON CONFLICT DO NOTHING
  `, [fatherId, childId]);
  await client.query(`
    INSERT INTO person_ancestry (ancestor_id, descendant_id, depth)
    SELECT $1, $2, 1
    ON CONFLICT DO NOTHING
  `, [fatherId, childId]);

  // b) family_units：复用该父亲名下的单亲家庭，否则新建
  const fam = await client.query(`
    SELECT id FROM family_units
    WHERE husband_id = $1 AND wife_id IS NULL AND clan_id = 4
    LIMIT 1
  `, [fatherId]);
  let familyId;
  if (fam.rows.length) {
    familyId = fam.rows[0].id;
  } else {
    const created = await client.query(`
      INSERT INTO family_units (clan_id, husband_id, wife_id, union_type)
      VALUES (4, $1, NULL, 'normal') RETURNING id
    `, [fatherId]);
    familyId = created.rows[0].id;
  }

  // c) family_children（幂等）
  await client.query(`
    INSERT INTO family_children (family_id, child_id, birth_order, child_type)
    VALUES ($1, $2, $3, 'BIOLOGICAL')
    ON CONFLICT DO NOTHING
  `, [familyId, childId, birthOrderHint]);
}

async function main() {
  await client.connect();
  await client.query('BEGIN');
  try {
    // 1) 朱小小重复修复：删 3040 + 其 link，保留 3039
    await client.query(`DELETE FROM person_user_links WHERE id = 8`);
    await client.query(`DELETE FROM persons WHERE id = 3040`);
    console.log('已删除重复朱小小 3040 及其 person_user_link 8');

    // 2) 朱小小 3039 → 挂到 朱樽强 3959（长房主脉末端）
    await attachChild(3959, 3039, 1);
    console.log('朱小小 3039 → 父 朱樽强 3959');

    // 3) 14 个测试人物 → 挂到不同 depth=11 叶节点（branch 分布）
    // 先取 14 个真实 depth=11 叶节点（尚无子女者）
    const leavesQuery = await client.query(`
      SELECT p.id, p.full_name FROM person_ancestry pa
      JOIN persons p ON p.id = pa.descendant_id
      WHERE pa.ancestor_id = 3007 AND p.clan_id = 4 AND p.deleted_at IS NULL
        AND pa.depth = 11
        AND NOT EXISTS (
          SELECT 1 FROM family_children fc JOIN family_units fu ON fu.id = fc.family_id
          WHERE fu.clan_id = 4 AND fu.husband_id = p.id
        )
      ORDER BY p.id LIMIT 14
    `);
    console.log('可用叶节点:', leavesQuery.rows.length);
    if (leavesQuery.rows.length < 14) {
      throw new Error('depth=11 无子叶节点不足 14 个');
    }
    const testIds = [4009, 4010, 4011, 4012, 4013, 4015, 4017, 4018, 4019, 4020, 4021, 4022, 4023, 4024];
    for (let i = 0; i < testIds.length; i++) {
      const leaf = leavesQuery.rows[i];
      await attachChild(leaf.id, testIds[i], 1);
      console.log(`测试人物 ${testIds[i]} → 父 ${leaf.id}(${leaf.full_name})`);
    }

    await client.query('COMMIT');
    console.log('\n[apply] 全部挂载完成');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[apply] 失败已回滚:', e.message);
    process.exit(1);
  }
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
