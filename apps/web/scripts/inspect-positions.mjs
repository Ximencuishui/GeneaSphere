import fs from 'fs';
const buf = fs.readFileSync('apps/web/src/components/GenealogyTree.vue');

// 打印 L1704 附近 200 字节
const lines = buf.toString('utf8').split('\n');
const findLine = (text) => lines.findIndex(l => l.includes(text)) + 1;

console.log('=== L1704 (ElMessage.info) ===');
console.log(findLine('ElMessage.info'));
const l1704 = lines[1703];
console.log(JSON.stringify(l1704));
const slice = buf.slice(buf.indexOf(Buffer.from(l1704, 'utf8')), buf.indexOf(Buffer.from(l1704, 'utf8')) + 200);
console.log('hex:', slice.toString('hex'));

console.log('\n=== L1711 (ElMessage.success) ===');
const l1711 = lines[1710];
console.log(JSON.stringify(l1711));
const slice2 = buf.slice(buf.indexOf(Buffer.from(l1711, 'utf8')), buf.indexOf(Buffer.from(l1711, 'utf8')) + 200);
console.log('hex:', slice2.toString('hex'));

console.log('\n=== L1713 (压测失败) ===');
const l1713 = lines[1712];
console.log(JSON.stringify(l1713));

console.log('\n=== L1769 (console.warn) ===');
const l1769 = lines[1768];
console.log(JSON.stringify(l1769));
const slice3 = buf.slice(buf.indexOf(Buffer.from(l1769, 'utf8')), buf.indexOf(Buffer.from(l1769, 'utf8')) + 200);
console.log('hex:', slice3.toString('hex'));

console.log('\n=== L1794 (handleDrawerCreateMarriage) ===');
const l1794 = lines[1793];
console.log(JSON.stringify(l1794));

console.log('\n=== L1970 (toolbar title) ===');
const l1970 = lines.findIndex(l => l.includes('toolbarCollapsed ?')) + 1;
console.log('L1970 found at line:', l1970);
const l1970text = lines[l1970 - 1];
console.log(JSON.stringify(l1970text));

console.log('\n=== L1976 (search placeholder) ===');
const l1976 = lines.findIndex(l => l.includes('searchResultCount > 0')) + 1;
console.log('L1976 found at line:', l1976);
const l1976text = lines[l1976 - 1];
console.log(JSON.stringify(l1976text));