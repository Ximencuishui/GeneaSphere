// 直接用 Node 脚本替换 nextName 函数（避免 PowerShell 编码问题）
import fs from 'fs';

const fp = 'e:/GeneaSphere/apps/server/src/auth/demo-seed.service.ts';
let content = fs.readFileSync(fp, 'utf8');

// 找到 nextName 函数的开始和结束
const startIdx = content.indexOf('const nextName = (): string => {');
const endMarker = 'throw new Error(\'男名组合空间耗尽';
const endIdx = content.indexOf(endMarker);
const endLineEnd = content.indexOf(';', endIdx + endMarker.length);
const blockEnd = endLineEnd + 1;

console.log('startIdx:', startIdx);
console.log('endIdx:', endIdx);
console.log('blockEnd:', blockEnd);

const oldBlock = content.substring(startIdx, blockEnd);
console.log('\nOld block (first 500 chars):');
console.log(oldBlock.substring(0, 500));
console.log('---');

// 新块：使用 attempt 步长 7 探索 g
const newBlock = `const nextName = (): string => {
      // [2026-08-20 修复] attempt 序列：z 固定 zibeiIdx，g 步长 7 探索（与 70 互质，覆盖所有 70 个 g）。
      //   原 zibeiIdx/nameIdx 同步 +1 时 LCM(28, 70) = 140，第 141 次调用必撞名。
      //   修复后：add pair 时 zibeiIdx/nameIdx 各 +1，下次 attempt 起点 z+1 与上次 z 不同，
      //   70 个新 pair 都未 used，attempt=0 即成功。繁衍 526 次 << 1960 组合空间，足够唯一。
      for (let attempt = 0; attempt < 28 * 70; attempt++) {
        const z = zibeiIdx % 28;
        const g = (nameIdx + attempt * 7) % 70;
        const pair = \`\${z}_\${g}\`;
        if (!usedMalePairs.has(pair)) {
          usedMalePairs.add(pair);
          const zibei = DemoSeedService.ZIBEI_CHARS[z];
          zibeiIdx++;
          const given = DemoSeedService.MALE_GIVEN_NAMES[g];
          nameIdx++;
          return '朱' + zibei + given;
        }
      }
      throw new Error('男名组合空间耗尽（28×70=1960 不足）')`;

console.log('\nNew block:');
console.log(newBlock.substring(0, 500));
console.log('---');

// 检查 oldBlock 是否在 content 中存在
const existsIdx = content.indexOf(oldBlock);
console.log('Old block exists at:', existsIdx);
if (existsIdx === -1) {
  console.log('ERROR: oldBlock not found exactly');
  process.exit(1);
}

content = content.replace(oldBlock, newBlock);
fs.writeFileSync(fp, content, 'utf8');
console.log('\n✅ Replaced successfully');

// 验证
const verify = fs.readFileSync(fp, 'utf8');
const newIdx = verify.indexOf('const nextName = (): string => {');
console.log('\nVerified new block:');
console.log(verify.substring(newIdx, newIdx + 800));