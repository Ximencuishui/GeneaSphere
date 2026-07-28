import fs from 'fs';
const file = 'e:/GeneaSphere/apps/web/src/components/GenealogyTree.vue';
const buf = fs.readFileSync(file);

// 先看换行符
const isCRLF = buf.includes(Buffer.from([0x0d, 0x0a]));
console.log('CRLF:', isCRLF);
const NL = isCRLF ? '\r\n' : '\n';

const text = buf.toString('utf8');
const lines = text.split(/\r?\n/);

console.log('Total lines:', lines.length);

// L1704: 整行替换
lines[1703] = '    ElMessage.info(`已生成 ${count} 个合成节点，开始渲染测试`);';
// L1769
lines[1768] = "    console.warn('[GenealogyTree] 编辑增量更新失败，回退到全量重建:', e);";
// L1794
lines[1793] = '  ElMessage.info(\'请从画布右键或顶部"添加婚姻"菜单选择第二位配偶完成创建\');';
// L1970 把"展展"改成"展开"
lines[1969] = '        :title="toolbarCollapsed ? \'展开工具\' : \'折叠工具\'"';
// L1976
lines[1975] = '        :placeholder="searchResultCount > 0 ? `找到 ${searchResultCount} 个匹配结果` : \'搜索姓名\'"';

const newText = lines.join(NL);
fs.writeFileSync(file, newText, 'utf8');
console.log('Done. Size:', Buffer.byteLength(newText, 'utf8'));