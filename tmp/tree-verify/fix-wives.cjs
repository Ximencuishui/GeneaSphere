// 修复 demo 族妻子关联错乱（dry-run 模式先验证算法）
// 背景：旧 seed 女性姓名只有 50 种组合，500 个家庭只引用 116 个 distinct wife，
// 每个妻子被 ~4.3 个丈夫共享。本脚本为每个家庭分配唯一妻子（优先同名未用女性）。
// dryRun=true 只统计不写入。
const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1', port: 15432, user: 'geneauser',
  password: 'GeneaSphere2024!', database: 'geneasphere',
});
const DRY_RUN = process.argv.includes('--apply') ? false : true;

async function main() {
  await client.connect();
  const clanId = 4;

  // 1) 所有家庭
  const fams = await client.query(
    `SELECT id, husband_id, wife_id FROM family_units WHERE clan_id=$1 ORDER BY id`, [clanId]);
  console.log('families:', fams.rows.length);

  // 2) 所有女性 person（按名字分组）
  const females = await client.query(
    `SELECT id, full_name FROM persons WHERE clan_id=$1 AND deleted_at IS NULL AND gender='female' ORDER BY id`, [clanId]);
  const byName = new Map(); // name -> [ids]
  for (const f of females.rows) {
    if (!byName.has(f.full_name)) byName.set(f.full_name, []);
    byName.get(f.full_name).push(f.id);
  }
  console.log('female persons:', females.rows.length, '| distinct names:', byName.size);

  // 3) wife 使用次数
  const usage = new Map();
  for (const f of fams.rows) {
    if (f.wife_id) usage.set(String(f.wife_id), (usage.get(String(f.wife_id)) || 0) + 1);
  }
  const shared = [...usage.entries()].filter(([, c]) => c > 1);
  console.log('shared wives (used by >1 family):', shared.length, '| total wife slots:', fams.rows.length);

  // 4) 分配：为每个家庭选唯一妻子
  const usedWifeIds = new Set();
  const assignments = []; // {family_id, old_wife, new_wife}
  let sameNameMatches = 0, fallbackAssign = 0, kept = 0;
  const histWifeNames = new Set(['刘氏','林氏','赵氏','范氏','郑氏','王氏','孙氏','徐氏','陈氏','周氏','吴氏','何氏','郭氏','马氏','黄氏','罗氏']);

  for (const f of fams.rows) {
    const oldWife = f.wife_id ? String(f.wife_id) : null;
    if (!oldWife) { assignments.push({ family_id: f.id, old_wife: null, new_wife: null }); continue; }
    // 已是唯一使用 → 保留
    if (usage.get(oldWife) === 1 && !usedWifeIds.has(oldWife)) {
      usedWifeIds.add(oldWife);
      kept++;
      continue;
    }
    // 需要重分配：优先同名未用女性
    const wifeName = females.rows.find((x) => String(x.id) === oldWife)?.full_name;
    let candidate = null;
    if (wifeName) {
      const pool = byName.get(wifeName) || [];
      candidate = pool.find((id) => !usedWifeIds.has(String(id)));
    }
    if (!candidate) {
      // 兜底：任意未用女性（历史妻子名除外，避免跨辈错配）
      candidate = females.rows.find((x) => !usedWifeIds.has(String(x.id)) && !histWifeNames.has(x.full_name))?.id;
      if (!candidate) candidate = females.rows.find((x) => !usedWifeIds.has(String(x.id)))?.id;
      if (candidate) fallbackAssign++;
    } else {
      sameNameMatches++;
    }
    if (!candidate) { console.log('  !! no candidate for family', f.id); continue; }
    usedWifeIds.add(String(candidate));
    assignments.push({ family_id: f.id, old_wife: oldWife, new_wife: String(candidate) });
  }

  console.log(`\nkept unique: ${kept}, reassigned (same-name): ${sameNameMatches}, reassigned (fallback): ${fallbackAssign}, total reassigned: ${assignments.length}`);
  console.log('distinct wives after:', usedWifeIds.size, '| families:', fams.rows.length);

  // 5) 检查结果：每个家庭 wife 唯一
  const finalWifeCounts = new Map();
  for (const f of fams.rows) {
    const w = assignments.find((a) => a.family_id === f.id);
    const finalWife = w && w.new_wife !== undefined ? w.new_wife : (f.wife_id ? String(f.wife_id) : null);
    if (finalWife) finalWifeCounts.set(finalWife, (finalWifeCounts.get(finalWife) || 0) + 1);
  }
  const dup = [...finalWifeCounts.entries()].filter(([, c]) => c > 1);
  console.log('families with duplicated wife after fix:', dup.length);
  if (dup.length) console.log('  sample dup:', dup.slice(0, 5));

  if (DRY_RUN) {
    console.log('\n[dry-run] 未写入。加 --apply 执行。');
  } else {
    // 6) 事务写入
    await client.query('BEGIN');
    try {
      for (const a of assignments) {
        if (a.new_wife === null || a.old_wife === a.new_wife) continue;
        // 6.1) family_units.wife_id
        await client.query(`UPDATE family_units SET wife_id = $1 WHERE id = $2`, [a.new_wife, a.family_id]);
        // 6.2) 该家庭子女的 depth=1 母亲链（person_ancestry）old → new
        await client.query(`
          UPDATE person_ancestry SET ancestor_id = $1
          WHERE depth = 1 AND ancestor_id = $2
            AND descendant_id IN (
              SELECT fc.child_id FROM family_children fc WHERE fc.family_id = $3
            )
        `, [a.new_wife, a.old_wife, a.family_id]);
      }
      await client.query('COMMIT');
      console.log('\n[apply] 已写入:', assignments.length, '条家庭妻子重分配 + 对应 depth=1 母亲链更新');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[apply] 失败已回滚:', e.message);
      process.exit(1);
    }
  }
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
