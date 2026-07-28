import fs from 'fs';
const buf = fs.readFileSync('apps/web/src/components/GenealogyTree.vue');
// 检查 L1493-L1500 (name default + gender + birth + death + living)
const idx1 = buf.indexOf(Buffer.from("data.original.full_name", 'utf8'));
console.log('full_name idx:', idx1);
const slice = buf.slice(idx1, idx1+500);
console.log('hex:', slice.toString('hex'));
console.log('utf8:', JSON.stringify(slice.toString('utf8')));
console.log('---');
// 检查 L1555-L1570 (focusElement + render fail)
const idx2 = buf.indexOf(Buffer.from("focusElement", 'utf8'));
console.log('focusElement idx:', idx2);
const slice2 = buf.slice(idx2, idx2+500);
console.log('utf8:', JSON.stringify(slice2.toString('utf8')));