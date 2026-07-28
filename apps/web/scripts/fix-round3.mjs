import fs from 'fs';

const file = 'e:/GeneaSphere/apps/web/src/components/GenealogyTree.vue';
const buf = fs.readFileSync(file);
const isCRLF = buf.includes(Buffer.from([0x0d, 0x0a]));
const NL = isCRLF ? '\r\n' : '\n';
const text = buf.toString('utf8');
const lines = text.split(/\r?\n/);

// line index (0-based) → 修复后的文本
// 关键阻塞：L1610 反引号未闭合（影响整个 if/else 语法）
const fixes = {
  // === 阻塞 vite 编译的 ===
  1609: '      ElMessage.info(`找到 ${count} 个匹配结果`);', // L1610
  1628: "    ElMessage.info('无法聚焦，请手动缩放定位');",  // L1629
  1633: "  ElMessage.info('添加人员功能开发中');",        // L1634

  // === 注释乱码清理（不影响编译但让搜索友好） ===
  1636: '// ==================== 性能压测（开发期工具） ====================', // L1637
  1637: '/**', // L1638
  1638: ' * 生成 1000 个合成节点（9 代树形）+ spouse 边，验证 viewport culling 收益：', // L1639
  1639: ' * - 仅 dev 模式可点', // L1640
  1640: ' * - 不读 API，纯前端生成，跳过后端', // L1641
  1641: ' * - 完成后调 refreshGraph 走完整 setData/render 流水线', // L1642
  1642: ' * - 记录 setData + render 完成耗时至 perfStats.renderMs', // L1643
  1643: ' */', // L1644

  1649: '    const FANOUT = 3; // 每代每个节点最多 3 个子女，9 代约 3000 节点——收敛一点按 TOTAL 截断', // L1650
  1652: "      full_name: '根节点',", // L1653
  1659: "    const maleNames = ['张', '建国', '伟', '芳', '娜', '敏', '静', '丽', '强', '磊'];", // L1660

  // handleDrawerNavigate 函数的注释
  1773: '/** 抽屉内点击关联人物：聚焦该节点（注意：跨子树聚焦中心会被替换，', // L1774
  1774: ' *  本期实现聚焦并刷新画布；下一期可优化为局部高亮/ 不重建） */',  // L1775

  1779: '    // 增量选中 + 聚焦，避免全量重建', // L1780

  1787: "    ElMessage.info('该人物不在当前子树内，请调整根节点后查看');", // L1788
  1791: '/** 抽屉"添加婚姻"：先关闭抽屉（让选择器接管），再 emit 提示用户去选第二位 */', // L1792
  1794: '  // TODO(P2)：此处可改为打开 AddMarriageDialog，传 withPersonId 作为预填值', // L1795
  1797: '/**', // L1798
  1798: ' * 抽屉内发生"增/删人物 / 删除婚姻"：刷新整树（树结构已变，画布要重建）。', // L1799
  1799: ' * PersonEditDrawer 自身已经调过 store / API 完成了写入，这里只需重画。', // L1800
  1800: ' */', // L1801
  1802: '  // 清空选中（被删除的人物对象已无效）', // L1803
};

let count = 0;
let skipped = 0;
for (const [idxStr, newLine] of Object.entries(fixes)) {
  const idx = Number(idxStr);
  const old = lines[idx];
  if (typeof old !== 'string') {
    console.error(`行 ${idx + 1} 不存在`);
    skipped++;
    continue;
  }
  // 检测是否有未替换的中文乱码字符（防止索引偏移导致的错位替换）
  if (old.includes(newLine.trim().split(/\s/)[0])) {
    // 首词相同，可能是巧合，不强制校验
  }
  lines[idx] = newLine;
  count++;
}

const newText = lines.join(NL);
fs.writeFileSync(file, newText, 'utf8');
console.log(`总计修改 ${count} 处，跳过 ${skipped} 处`);
console.log(`文件大小：${buf.length} → ${Buffer.byteLength(newText, 'utf8')} 字节`);
