/**
 * 批量修复 4-arg 泛型破损模式：
 * 1. <X, Y, X, Y> → <X, Y>（前后相同的两对）
 * 2. <Pagination<X, Pagination<X> → <Pagination<X>>（缺右括号 + 错误嵌套）
 * 3. <any, X, any, X> → <X>（首参为 any 时合并）
 */
const fs = require('fs');
const path = require('path');

const FILES = [
  'apps/web/src/api/toolbox.ts',
  'apps/web/src/api/ocr.ts',
  'apps/web/src/api/migration.ts',
  'apps/web/src/api/personalSpace.ts',
];

function fixGenericArgs(src) {
  let total = 0;
  // 1) <X, Y, X, Y> → <X, Y>（按 ", " 切分四段，前后两两相同）
  const reQuad = /\.<a-zA-Z_]+(?:<[^<>]*(?:<[^<>]*>[^<>]*)*>)?(?:\[(?:[^[\]]|\[[^[\]]*\])*\])?,\s*[^,<>]+(?:<[^<>]*(?:<[^<>]*>[^<>]*)*>)?,\s*(.+),\s*\1>/g;
  // 用更保守的正则：匹配  request.get/post/put/delete<...>
  const reMethod4Args = /(request\.(?:get|post|put|delete))(<[^>]+>)/g;

  // 2) 修复 <X, Y, X, Y> 模式：要求第1=第3，第2=第4
  src = src.replace(reMethod4Args, (_match, method, raw) => {
    const inner = raw.slice(1, -1); // 去 < >
    // 用顶层括号感知的方式切分
    const parts = splitTopLevel(inner, ',');
    if (parts.length === 4 && parts[0] === parts[2] && parts[1] === parts[3]) {
      total++;
      // 简化：<X, Y, X, Y> → <X, Y>；
      // 若第 1 段是 any，则合并为 <Y>
      const a = parts[0].trim();
      const b = parts[1].trim();
      if (a === 'any') {
        return `${method}<${b}>`;
      }
      return `${method}<${a}, ${b}>`;
    }
    return _match;
  });

  // 3) 修复 personalSpace 的 <Pagination<X, Pagination<X>> 缺失右括号 + 错误嵌套
  // 匹配 <Pagination<X, Pagination<X>> 改成 <Pagination<X>>
  const reMissingClose = /(<Pagination<[A-Za-z_][A-Za-z0-9_]*),\s*Pagination<\1>>/g;
  const before3 = src;
  src = src.replace(reMissingClose, (_m, prefix) => {
    total++;
    return `${prefix}>>`;
  });
  if (before3 !== src) {
    console.log(`  personalSpace: 修复 ${(before3.match(/<Pagination<[A-Za-z_][A-Za-z0-9_]*,\s*Pagination/g) || []).length} 处`);
  }

  return { src, total };
}

/**
 * 按顶层逗号切分字符串。感知 < > ( ) [ ] 的嵌套。
 */
function splitTopLevel(str, sep) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '<' || ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === '>' || ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((s) => s.trim());
}

let grandTotal = 0;
for (const rel of FILES) {
  const abs = path.resolve(__dirname, '..', rel);
  if (!fs.existsSync(abs)) {
    console.log(`SKIP: ${rel} (not found)`);
    continue;
  }
  const orig = fs.readFileSync(abs, 'utf8');
  const { src, total } = fixGenericArgs(orig);
  if (total > 0) {
    fs.writeFileSync(abs, src, 'utf8');
    grandTotal += total;
    console.log(`FIXED: ${rel} (${total} 处)`);
  } else {
    console.log(`NOOP:  ${rel}`);
  }
}
console.log(`\n总计修复：${grandTotal} 处`);