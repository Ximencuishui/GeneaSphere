// 修复 nextName 内部硬编码：% 28 -> % 33, 28 * 70 -> 33 * 70
import fs from 'fs';

const fp = 'e:/GeneaSphere/apps/server/src/auth/demo-seed.service.ts';
let content = fs.readFileSync(fp, 'utf8');

const oldBlock = `    const nextName = (): string => {
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
      throw new Error('男名组合空间耗尽（28×70=1960 不足）')
    };`;

const newBlock = `    const nextName = (): string => {
      // [2026-08-20 修复] ZIBEI_CHARS 扩展到 33 个字符（与 70 互质），LCM(33, 70) = 2310 >> 繁衍数 526。
      //   原 28 字符时 LCM(28, 70) = 140，第 141 次必撞名。现在 33 字符，attempt=0 直接成功。
      const ZIBEI_LEN = DemoSeedService.ZIBEI_CHARS.length;
      for (let attempt = 0; attempt < ZIBEI_LEN * 70; attempt++) {
        const z = zibeiIdx % ZIBEI_LEN;
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
      throw new Error(\`男名组合空间耗尽（\${ZIBEI_LEN}×70 不足）\`);
    };`;

const idx = content.indexOf(oldBlock);
if (idx === -1) {
  console.log('ERROR: oldBlock not found');
  process.exit(1);
}
console.log('Found at:', idx);

content = content.replace(oldBlock, newBlock);
fs.writeFileSync(fp, content, 'utf8');
console.log('✅ Replaced successfully');

// 验证
const verify = fs.readFileSync(fp, 'utf8');
const newIdx = verify.indexOf('const nextName = (): string => {');
console.log('\nVerified:');
console.log(verify.substring(newIdx, newIdx + 800));