import fs from 'fs';

const file = 'e:/GeneaSphere/apps/web/src/components/GenealogyTree.vue';
const buf = fs.readFileSync(file);
const isCRLF = buf.includes(Buffer.from([0x0d, 0x0a]));
const NL = isCRLF ? '\r\n' : '\n';
const text = buf.toString('utf8');
const lines = text.split(/\r?\n/);

// 用 Buffer.from + 字节直接构造 UTF-8
const FIX = (hex) => Buffer.from(hex.replace(/\s/g, ''), 'hex').toString('utf8');

// 工具：单引号中文
const fixes = [];
fixes.push([2027, `        title="按性别筛选"`]);
fixes.push([2029, `        <el-option label="全部" value="all" />`]);
fixes.push([2030, `        <el-option label="男" value="male" />`]);
fixes.push([2031, `        <el-option label="女" value="female" />`]);
fixes.push([2034, `      <el-tooltip content="仅显示有照片" placement="bottom">`]);
fixes.push([2043, `      <el-tooltip content="切换纵向/横向布局" placement="bottom">`]);

let count = 0;
let skipped = 0;
for (const [idx, newLine] of fixes) {
  if (typeof lines[idx] !== 'string') {
    console.error(`L${idx + 1} 不存在`);
    skipped++;
    continue;
  }
  lines[idx] = newLine;
  count++;
}

const newText = lines.join(NL);
fs.writeFileSync(file, newText, 'utf8');
console.log(`修改 ${count} 处，跳过 ${skipped} 处`);
