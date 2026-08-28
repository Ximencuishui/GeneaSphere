// 直接复刻 demo-seed 的 nextName 实现并模拟繁衍循环
const ZIBEI_CHARS = ['熹','塾','埜','在','鉴','铨','潜','鋆','浚','洪','沐','深','桂','桐','森','柄','模','朴','梓','樾','楷','检','樽','栻','栉','栒','栋','梁'];
const MALE_GIVEN_NAMES = ['康','宁','安','平','泰','昌','盛','荣','华','耀','明','德','仁','义','礼','智','信','忠','孝','廉','邦','国','家','民','世','代','永','长','久','远','福','禄','寿','喜','财','源','海','山','川','林','涛','波','渊','文','武','斌','勇','强','伟','雄','辉','光','星','辰','天','地','宇','宙','鸿','志','远','翔','飞','龙','虎','豹','麟','凤','祺','瑞'];

// 实际确认长度
console.log('ZIBEI_CHARS.length =', ZIBEI_CHARS.length);
console.log('MALE_GIVEN_NAMES.length =', MALE_GIVEN_NAMES.length);

// 初始化同 demo-seed
let zibeiIdx = 5;
let nameIdx = 0;
const usedMalePairs = new Set();
const HISTORICAL_NAMES = ['朱熹','刘氏','朱塾','朱埜','朱在','林氏','赵氏','范氏','朱鉴','朱铨','朱潜','朱鋆','郑氏','王氏','孙氏','徐氏','朱浚','朱洪','朱沐','朱深','陈氏','周氏','吴氏','何氏','朱桂','朱桐','朱森','朱柄','郭氏','马氏','黄氏','罗氏'];
const usedNames = new Set(HISTORICAL_NAMES);

const nextName = () => {
  // [2026-08-20 修复] attempt 序列：z 固定 zibeiIdx，g 步长 7 探索
  for (let attempt = 0; attempt < 28 * 70; attempt++) {
    const z = zibeiIdx % 28;
    const g = (nameIdx + attempt * 7) % 70;
    const pair = `${z}_${g}`;
    if (!usedMalePairs.has(pair)) {
      usedMalePairs.add(pair);
      const zibei = ZIBEI_CHARS[z];
      zibeiIdx++;
      const given = MALE_GIVEN_NAMES[g];
      nameIdx++;
      return '朱' + zibei + given;
    }
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

// 模拟繁衍：跑满 526 次 nextName
let callCount = 0;
let errorCount = 0;
try {
  for (let i = 0; i < 600; i++) {
    callCount++;
    const baseName = nextName();
    const sonName = ensureUnique(baseName);
    if (i < 5 || i > 595) {
      console.log(`#${callCount}: baseName=${baseName} sonName=${sonName}`);
    }
  }
} catch (e) {
  console.log(`第 ${callCount} 次调用出错: ${e.message}`);
  errorCount++;
}

console.log(`\n总调用次数: ${callCount}`);
console.log(`usedMalePairs.size: ${usedMalePairs.size}`);
console.log(`usedNames.size: ${usedNames.size}`);
console.log(`zibeiIdx: ${zibeiIdx}, nameIdx: ${nameIdx}`);