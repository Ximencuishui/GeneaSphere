import fs from 'fs';
const fp = 'e:/GeneaSphere/apps/server/src/auth/demo-seed.service.ts';
let content = fs.readFileSync(fp, 'utf8');

const oldBlock = `      while (usedNames.has(nm) && attempt < 500) {
        if (isMale) {
          const zibei = DemoSeedService.ZIBEI_CHARS[zibeiIdx % ZIBEI_CHARS.length];
          zibeiIdx++;
          const given = DemoSeedService.MALE_GIVEN_NAMES[(nameIdx + attempt) % MALE_GIVEN_NAMES.length];
          nm = '朱' + zibei + given;
        } else {
          // 女性重试同样从完整组合池顺序取，保证与 usedNames 永不冲突（池容量 2500 >> 所需 ~740）
          nm = FEMALE_NAME_POOL[femaleNameCounter++ % FEMALE_NAME_POOL.length];
        }
        attempt++;
      }
      usedNames.add(nm);
      return nm;`;

const newBlock = `      while (usedNames.has(nm) && attempt < 5000) {
        if (isMale) {
          // [2026-08-20 修复] nextName 改造后理论上 baseName 已是 unique，这里重试分支只作防御性兑现。
          //   顺序递增 zibei 跳出周期，提供更长的 retry space。
          zibeiIdx++;
          const z = zibeiIdx % 28;
          const given = DemoSeedService.MALE_GIVEN_NAMES[(nameIdx + attempt) % 70];
          nm = '朱' + DemoSeedService.ZIBEI_CHARS[z] + given;
        } else {
          // 女性重试同样从完整组合池顺序取，保证与 usedNames 永不冲突（池容量 2500 >> 所需 ~740）
          nm = FEMALE_NAME_POOL[femaleNameCounter++ % FEMALE_NAME_POOL.length];
        }
        attempt++;
      }
      if (usedNames.has(nm)) {
        throw new Error('ensureUnique 5000 次重试仍撞名 ' + nm + '，需扩 names 池');
      }
      usedNames.add(nm);
      return nm;`;

const idx = content.indexOf(oldBlock);
if (idx === -1) {
  console.log('Block not found');
  console.log('Searching for partial match...');
  if (content.includes('attempt < 500')) {
    console.log('Found "attempt < 500"');
  }
  process.exit(1);
}
content = content.replace(oldBlock, newBlock);
fs.writeFileSync(fp, content, 'utf8');
console.log('Replaced successfully');
