import fs from 'fs';
const r = Buffer.from("\u7537' : '\u5973'", 'utf8');
console.log('replacement bytes:', r.length);
console.log('replacement hex:', r.toString('hex'));
console.log('replacement utf8:', JSON.stringify(r.toString('utf8')));
console.log('replacement decoded as utf8 each char:');
const str = "\u7537' : '\u5973";
for (let i = 0; i < str.length; i++) {
  console.log('  ['+i+']', str.charCodeAt(i).toString(16), JSON.stringify(str[i]));
}