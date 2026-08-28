// 完整复刻 demo-seed 的繁衍循环（526 次 nextName），验证修复
const ZIBEI_CHARS = ['熹','塾','埜','在','鉴','铨','潜','鋆','浚','洪','沐','深','桂','桐','森','柄','模','朴','梓','樾','楷','检','樽','栻','栉','栒','栋','梁'];
const MALE_GIVEN_NAMES = ['康','宁','安','平','泰','昌','盛','荣','华','耀','明','德','仁','义','礼','智','信','忠','孝','廉','邦','国','家','民','世','代','永','长','久','远','福','禄','寿','喜','财','源','海','山','川','林','涛','波','渊','文','武','斌','勇','强','伟','雄','辉','光','星','辰','天','地','宇','宙','鸿','志','远','翔','飞','龙','虎','豹','麟','凤','祺','瑞'];

console.log('ZIBEI_CHARS.length =', ZIBEI_CHARS.length);
console.log('MALE_GIVEN_NAMES.length =', MALE_GIVEN_NAMES.length);

let zibeiIdx = 5;
let nameIdx = 0;
const usedMalePairs = new Set();
const usedNames = new Set(['朱熹','刘氏','朱塾','朱埜','朱在','林氏','赵氏','范氏','朱鉴','朱铨','朱潜','朱鋆','郑氏','王氏','孙氏','徐氏','朱浚','朱洪','朱沐','朱深','陈氏','周氏','吴氏','何氏','朱桂','朱桐','朱森','朱柄','郭氏','马氏','黄氏','罗氏']);

// [2026-08-20 修复] zibeiIdx +1, nameIdx +11 (与 70 互质)
const nextName = () => {
  for (let attempt = 0; attempt < 28 * 70; attempt++) {
    const z = zibeiIdx % 28;
    const g = nameIdx % 70;
    const pair = `${z}_${g}`;
    if (!usedMalePairs.has(pair)) {
      usedMalePairs.add(pair);
      const zibei = ZIBEI_CHARS[z];
      zibeiIdx++;
      const given = MALE_GIVEN_NAMES[g];
      nameIdx += 11;
      return '朱' + zibei + given;
    }
    zibeiIdx++;
    nameIdx += 11;
  }
  throw new Error('男名组合空间耗尽');
};

const ensureUnique = (baseName) => {
  let nm = baseName;
  let attempt = 0;
  while (usedNames.has(nm) && attempt < 5000) {
    zibeiIdx++;
    const z = zibeiIdx % 28;
    const given = MALE_GIVEN_NAMES[(nameIdx + attempt) % 70];
    nm = '朱' + ZIBEI_CHARS[z] + given;
    attempt++;
  }
  if (usedNames.has(nm)) throw new Error('5000 次重试仍撞名');
  usedNames.add(nm);
  return nm;
};

// 模拟繁衍循环：总繁衍数 526
let callCount = 0;
let errorCount = 0;
try {
  for (let i = 0; i < 526; i++) {
    callCount++;
    const baseName = nextName();
    const sonName = ensureUnique(baseName);
    if (i < 3 || i > 520) {
      console.log(`#${callCount}: baseName=${baseName}`);
    }
  }
  console.log(`\n✅ 完成 526 次繁衍，used male pairs: ${usedMalePairs.size}`);
} catch (e) {
  console.log(`第 ${callCount} 次调用出错: ${e.message}`);
  errorCount++;
}