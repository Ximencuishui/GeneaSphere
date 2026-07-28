import fs from 'fs';

const file = 'e:/GeneaSphere/apps/web/src/components/GenealogyTree.vue';
const buf = fs.readFileSync(file);
const isCRLF = buf.includes(Buffer.from([0x0d, 0x0a]));
const NL = isCRLF ? '\r\n' : '\n';
const text = buf.toString('utf8');
const lines = text.split(/\r?\n/);

// 用 Buffer.from 直接确保 UTF-8 字节对
const fixes = [];
// L1661 femaleNames: utf-8 bytes for '秀英','秀兰','桂花','秀梅','玉兰','玉梅','秀珍','桂兰','秀荣','玉珍'
const fixedFemaleNames = Buffer.from(
  "    const femaleNames = ['\xe7\xa9\xbe\xe8\x8b\xb1', '\xe7\xa9\xbe\xe5\x85\xb0', '\xe6\xa1\x82\xe8\x8a\xb1', '\xe7\xa9\xbe\xe6\xa2\x85', '\xe7\x8e\x89\xe5\x85\xb0', '\xe7\x8e\x89\xe6\xa2\x85', '\xe7\xa9\xbe\xe7\x8f\x8d', '\xe6\xa1\x82\xe5\x85\xb0', '\xe7\xa9\xbe\xe8\x8d\xa3', '\xe7\x8e\x89\xe7\x8f\x8d'];",
  'utf8'
).toString('utf8');
fixes.push([1660, fixedFemaleNames]);

// L1694: '配偶配偶'
const fixedSpouseName = Buffer.from("        name: '\xe9\x85\x8d\xe5\x81\xb6\xe9\x85\x8d\xe5\x81\xb6',", 'utf8').toString('utf8');
fixes.push([1693, fixedSpouseName]);

// L2143: '生成中…' : '压测 1000 节点'
const fixedPerfButton = Buffer.from(
  "            {{ perfTestLoading ? '\xe7\x94\x9f\xe6\x88\x90\xe4\xb8\xad\xe2\x80\xa6' : '\xe5\x8e\x8b\xe6\xb5\x8b 1000 \xe8\x8a\x82\xe7\x82\xb9' }}",
  'utf8'
).toString('utf8');
fixes.push([2142, fixedPerfButton]);

let count = 0;
for (const [idx, newLine] of fixes) {
  if (typeof lines[idx] !== 'string') {
    console.error(`行 ${idx + 1} 不存在`);
    continue;
  }
  // 把 Unicode escape 序列转换成真实 UTF-8 字符串
  const decoded = JSON.parse('"' + newLine.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  lines[idx] = decoded;
  count++;
}

const newText = lines.join(NL);
fs.writeFileSync(file, newText, 'utf8');
console.log(`OK ${count} 处`);
