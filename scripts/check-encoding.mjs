import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, '..', '..');

const TARGETS = [
  join(ROOT, 'apps/web/src'),
  join(ROOT, 'apps/server/src'),
  join(ROOT, 'packages'),
];

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', '.cache', '.turbo',
  'coverage', 'storage', 'tmp', 'uploads', 'temp', '.pnpm-store',
  '.codebuddy', '.trae', '.qoder', '.vscode', '.github',
  'deploy_bundle', 'deploy_light', 'node_modules',
]);
const EXTS = new Set([
  '.vue', '.ts', '.tsx', '.js', '.cjs', '.mjs', '.json', '.md', '.html', '.css',
]);

// 已知 mojibake 签名：UTF-8 文件被当 GBK 解码产生的常见模式（来自本次整改中遇到的具体修复案例）
// 这些字符（CJK 部件被错位解码）是诊断特征，不能出现在 UTF-8 源文件里
const MOJIBAKE_PATTERNS = [
  '鑷', '閿欒', '绯荤粺', '绛栫暐', '鍚', '瀹屾垚', '娓叉煋', '鏄剧ず', '璁剧疆',
  '閮ㄧ', '鏍', '鏃犳硶', '鍔ㄦ', '澶勭', '鐢', '鐧', '鎴', '鐢ㄦ', '鏁',
  '搴', '绛', '閿', '绯', '杩', '櫒', '鎺', '缂', '鐨', '鍥',
  '鏂', '鎻', '鍙', '撳', '绱', '鐪', '浣', '冢', '缁', '閽',
  '浜', '锟', '桢', '澶', '鍙', '缁', '鐧', '閮',
  // 单独的 replacement character（U+FFFD）
  '\uFFFD',
];

const issues = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full);
      continue;
    }
    if (!e.isFile()) continue;
    const ext = extname(e.name).toLowerCase();
    if (!EXTS.has(ext)) continue;
    // 跳过 .bak 文件（含原始 mojibake 备份，避免误报）
    if (e.name.endsWith('.bak')) continue;

    let stat;
    try { stat = statSync(full); } catch (_) { continue; }
    if (stat.size > 2 * 1024 * 1024) continue;
    let buf;
    try { buf = readFileSync(full); } catch (_) { continue; }

    // 1. 文件中间 BOM
    for (let i = 1; i < buf.length - 2; i++) {
      if (buf[i] === 0xef && buf[i + 1] === 0xbb && buf[i + 2] === 0xbf) {
        issues.push({
          file: full, line: 0, char: 'MID_BOM',
          text: 'UTF-8 BOM detected in middle of file',
        });
      }
    }

    let text;
    try { text = buf.toString('utf8'); } catch (_) { continue; }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pat of MOJIBAKE_PATTERNS) {
        if (line.includes(pat)) {
          issues.push({
            file: full, line: i + 1, char: pat,
            text: line.trim().slice(0, 200),
          });
        }
      }
    }
  }
}

for (const t of TARGETS) walk(t);

if (issues.length === 0) {
  console.log('OK: no mojibake / replacement chars / mid-BOM detected.');
  process.exit(0);
}

const seen = new Set();
const unique = [];
for (const i of issues) {
  const k = `${i.file}::${i.line}::${i.char}`;
  if (seen.has(k)) continue;
  seen.add(k);
  unique.push(i);
}

console.log(`FOUND ${unique.length} mojibake issue(s):`);
console.log('');
for (const i of unique) {
  console.log(`  ${relative(ROOT, i.file)}:${i.line}  [${i.char}]`);
  console.log(`    > ${i.text}`);
}
process.exit(1);
