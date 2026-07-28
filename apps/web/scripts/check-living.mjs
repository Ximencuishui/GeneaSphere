import fs from 'fs';
const buf = fs.readFileSync('apps/web/src/components/GenealogyTree.vue');
const t = Buffer.from("data.is_living ? '", 'utf8');
const idx = buf.indexOf(t);
const slice = buf.slice(idx-50, idx+200);
console.log('hex:', slice.toString('hex'));
console.log('utf8:', JSON.stringify(slice.toString('utf8')));
console.log('---');
// 现在 lineEnd 是 62049，但 livingIdx=62007（现在？可能改了）
// 找下一个 ' : '
const sep = Buffer.from([0x27, 0x20, 0x3a, 0x20, 0x27]);
const sepIdx = buf.indexOf(sep, idx);
console.log('next : after living at:', sepIdx);
console.log('between living and sep:', JSON.stringify(buf.slice(idx+19, sepIdx+5).toString('utf8')));