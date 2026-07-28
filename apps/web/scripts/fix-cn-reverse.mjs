// 反向 GBK 解码修复 GenealogyTree.vue 的中文乱码
import fs from 'fs';
import iconv from 'iconv-lite';

const file = 'apps/web/src/components/GenealogyTree.vue';

// 原始文件是 UTF-8，但 PowerShell 写入时把 UTF-8 字节当 GBK 解码后又写回 UTF-8
// 现在的 UTF-8 字节流是"双重编码"：
//   原始 UTF-8 字节 → 被 GBK 解码为字符串 → 重新以 UTF-8 写入
//
// 反向解码：把当前文件的 UTF-8 字节流当作 GBK 来解码，
// 然后再以 UTF-8 编码回去，得到原始的字节流对应的 UTF-8 字符串。

const raw = fs.readFileSync(file); // 原始字节
console.log('original file size:', raw.length);

// 反向：UTF-8 字节 → 当 GBK 解码 → UTF-8 编码
const recovered = iconv.decode(raw, 'gbk');
console.log('recovered length:', recovered.length);

// 验证恢复情况
const originalCharCount = (recovered.match(/[\u4e00-\u9fff]/g) || []).length;
const garbledCount = (recovered.match(/[\uff00-\uffef]/g) || []).length;
const garbledChars2 = (recovered.match(/[锕-鿿]/g) || []).length; // 一些 GBK 中出现但不在常用中文区的字符
console.log('recovered chinese chars:', originalCharCount);
console.log('garbled chars (full-width):', garbledCount);

// 检查头部
console.log('first 200 chars:', JSON.stringify(recovered.slice(0, 200)));
console.log('---');

// 检查 L287（stage label 位置）
const lines = recovered.split('\n');
if (lines[286]) console.log('L287:', JSON.stringify(lines[286]));
if (lines[405]) console.log('L406:', JSON.stringify(lines[405]));
if (lines[406]) console.log('L407:', JSON.stringify(lines[406]));
if (lines[407]) console.log('L408:', JSON.stringify(lines[407]));
if (lines[408]) console.log('L409:', JSON.stringify(lines[408]));

// 备份原始文件
fs.writeFileSync(file + '.bak', raw);

// 写回恢复后的内容（UTF-8 无 BOM）
fs.writeFileSync(file, recovered, { encoding: 'utf8' });
console.log('written recovered file');