import fs from 'fs';
const t = fs.readFileSync('src/components/GenealogyTree.vue', 'utf8');
let inBack = false, inSgl = false, inDbl = false;
let line = 1, col = 1;
let out = '';
for (let i = 0; i < t.length; i++) {
  const c = t[i];
  if (c === '\\') { i++; col += 2; continue; }
  if (c === '`') {
    if (!inSgl && !inDbl) {
      inBack = !inBack;
      out += `L${line}C${col}: backtick ${inBack ? 'OPEN' : 'CLOSE'}\n`;
    }
  } else if (c === '"') {
    if (!inBack && !inSgl) {
      inDbl = !inDbl;
      out += `L${line}C${col}: double ${inDbl ? 'OPEN' : 'CLOSE'}\n`;
    }
  } else if (c === "'") {
    if (!inBack && !inDbl) {
      inSgl = !inSgl;
      out += `L${line}C${col}: single ${inSgl ? 'OPEN' : 'CLOSE'}\n`;
    }
  }
  if (c === '\n') { line++; col = 1; } else col++;
}
out += `\nFinal: backtick=${inBack} dbl=${inDbl} sgl=${inSgl}\n`;
fs.writeFileSync('scripts/quote-check-out.txt', out);
