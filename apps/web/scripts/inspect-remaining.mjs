import fs from 'fs';
const file = 'e:/GeneaSphere/apps/web/src/components/GenealogyTree.vue';
const buf = fs.readFileSync(file);
const text = buf.toString('utf8');
const lines = text.split(/\r?\n/);

// 列出每个目标位置的真实字节（hex）和显示文字
function dumpLine(lineNo) {
  const line = lines[lineNo - 1];
  console.log(`=== L${lineNo} ===`);
  console.log(`text: ${line}`);
  const lineBytes = Buffer.from(line, 'utf8');
  console.log(`bytes: ${lineBytes.toString('hex').match(/.{1,2}/g).join(' ')}`);
}

[1674, 1704, 1712, 1769, 1770, 1794, 1796, 1970, 1976, 1977].forEach(dumpLine);