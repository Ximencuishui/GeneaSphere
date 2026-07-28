// 多层反向 GBK 解码
import fs from 'fs';
import iconv from 'iconv-lite';

const file = 'apps/web/src/components/GenealogyTree.vue';

// 第一步：恢复成原始 UTF-8 字节（从备份恢复）
// .bak 是反向解码前的原始字节
let raw;
if (fs.existsSync(file + '.original.bak')) {
  raw = fs.readFileSync(file + '.original.bak');
  console.log('restored from .original.bak');
} else {
  raw = fs.readFileSync(file);
  fs.writeFileSync(file + '.original.bak', raw);
  console.log('saved .original.bak');
}

// 多次反向 GBK 解码直到稳定
let current = raw;
for (let round = 1; round <= 5; round++) {
  const decoded = iconv.decode(current, 'gbk');
  const reencoded = Buffer.from(decoded, 'utf8');
  if (reencoded.equals(current)) {
    console.log(`round ${round}: stable (no more changes)`);
    break;
  }
  console.log(`round ${round}: ${current.length} → ${reencoded.length} bytes`);
  current = reencoded;
}

const final = iconv.decode(current, 'gbk');
const finalBuf = Buffer.from(final, 'utf8');
console.log('final length:', finalBuf.length);

// 检查中文恢复情况
const cn = (final.match(/[\u4e00-\u9fff]/g) || []).length;
const garbled = (final.match(/[\uff00-\uffef锕-鿿]/g) || []).length;
console.log('chinese chars:', cn);
console.log('garbled chars:', garbled);

// 检查关键行
const lines = final.split('\n');
console.log('--- key lines ---');
[286, 405, 406, 407, 408, 448, 449, 1493, 1494, 1645].forEach(n => {
  if (lines[n-1]) console.log(`L${n}: ${JSON.stringify(lines[n-1])}`);
});

// 写回（去除 BOM）
let toWrite = final;
if (toWrite.charCodeAt(0) === 0xFEFF) toWrite = toWrite.slice(1);
fs.writeFileSync(file, toWrite, { encoding: 'utf8' });
console.log('written');