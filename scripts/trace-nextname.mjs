// 模拟 nextName + ensureUnique 的执行
const ZIBEI_CHARS = ['熹','塾','埜','在','鉴','铨','潜','鋆','浚','洪','沐','深','桂','桐','森','柄','模','朴','梓','樾','楷','检','樽','栻','栉','栒','栋','梁'];
const MALE_GIVEN_NAMES = ['康','宁','安','平','泰','昌','盛','荣','华','耀','明','德','仁','义','礼','智','信','忠','孝','廉','邦','国','家','民','世','代','永','长','久','远','福','禄','寿','喜','财','源','海','山','川','林','涛','波','渊','文','武','斌','勇','强','伟','雄','辉','光','星','辰','天','地','宇','宙','鸿','志','远','翔','飞','龙','虎','豹','麟','凤','祺','瑞'];

// 历史人名
const usedNames = new Set(['朱熹','刘氏','朱塾','朱埜','朱在','林氏','赵氏','范氏','朱鉴','朱铨','朱潜','朱鋆','郑氏','王氏','孙氏','徐氏','朱浚','朱洪','朱沐','朱深','陈氏','周氏','吴氏','何氏','朱桂','朱桐','朱森','朱柄','郭氏','马氏','黄氏','罗氏']);

let nameIdx = 0;
let zibeiIdx = 5;
const nextName = () => {
  const zibei = ZIBEI_CHARS[zibeiIdx % ZIBEI_CHARS.length];
  zibeiIdx++;
  const given = MALE_GIVEN_NAMES[nameIdx % MALE_GIVEN_NAMES.length];
  nameIdx++;
  return '朱' + zibei + given;
};
const ensureUnique = (baseName, isMale) => {
  let nm = baseName;
  let attempt = 0;
  while (usedNames.has(nm) && attempt < 500) {
    if (isMale) {
      const zibei = ZIBEI_CHARS[zibeiIdx % ZIBEI_CHARS.length];
      zibeiIdx++;
      const given = MALE_GIVEN_NAMES[(nameIdx + attempt) % MALE_GIVEN_NAMES.length];
      nm = '朱' + zibei + given;
    }
    attempt++;
  }
  usedNames.add(nm);
  return nm;
};

// 模拟繁衍循环
const totalTargetByGen = {
  6: 6, 7: 10, 8: 14, 9: 18, 10: 22, 11: 26, 12: 30, 13: 32, 14: 34, 15: 36,
  16: 38, 17: 38, 18: 36, 19: 34, 20: 32, 21: 28, 22: 24, 23: 20, 24: 16,
  25: 12, 26: 8, 27: 6, 28: 4, 29: 2,
};

let gen = 6;
let totalCreated = 0;
let callCount = 0;
const result = [];

while (totalCreated < 967 && gen <= 30) {
  const targetNewMales = totalTargetByGen[gen] || 0;
  if (targetNewMales === 0) {
    gen++;
    continue;
  }
  for (let i = 0; i < targetNewMales; i++) {
    callCount++;
    const sonName = ensureUnique(nextName(), true);
    if (sonName === '朱塾明' || sonName === '朱栋德' || sonName === '朱栻仁') {
      console.log(`>>> 第${callCount}次 nextName + ensureUnique, gen=${gen}, i=${i}, zibeiIdx=${zibeiIdx}, nameIdx=${nameIdx}, name=${sonName}`);
    }
    totalCreated += 2; // son + wife
    // ...
  }
  gen++;
}
console.log(`总 nextName 调用: ${callCount}, 最后 zibeiIdx=${zibeiIdx}, nameIdx=${nameIdx}`);

// 测试 zibeiIdx 能否到 1
console.log(`\n'朱塾明' ZIBEI=1, MALE_GIVEN_NAMES[10]='明'`);
console.log(`从 zibeiIdx=5 递增，要 mod 28 = 1 需要 (5+x) % 28 = 1 → x = 24, 52, 80, ...`);
console.log(`nameIdx 同步递增，要 mod 74 = 10 需要 x = 10, 84, 158, ...`);
console.log(`无共同解。所以 nextName 永远不直接生成 '朱塾明'。`);

// 看 1194 是不是 ensureUnique 重试分支生成的
console.log(`\n测试 ensureUnique 重试一例：假设某次 nextName 返回 '朱铨康'（撞 usedNames），会发生什么？`);
usedNames.add('朱铨康');
const r1 = ensureUnique('朱铨康', true);
console.log(`  ensureUnique('朱铨康', true) → ${r1}, zibeiIdx=${zibeiIdx}, nameIdx=${nameIdx}`);
