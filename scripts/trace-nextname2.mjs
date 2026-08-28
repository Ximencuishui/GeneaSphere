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

while (totalCreated < 967 && gen <= 30) {
  const targetNewMales = totalTargetByGen[gen] || 0;
  if (targetNewMales === 0) {
    gen++;
    continue;
  }
  for (let i = 0; i < targetNewMales; i++) {
    callCount++;
    const before_zibeiIdx = zibeiIdx;
    const before_nameIdx = nameIdx;
    const baseName = nextName();
    if (callCount >= 78 && callCount <= 95) {
      console.log(`#${callCount}: gen=${gen} i=${i} before(zibeiIdx=${before_zibeiIdx}, nameIdx=${before_nameIdx}) baseName=${baseName} (zibei=${ZIBEI_CHARS[before_zibeiIdx % 28]}, given=${MALE_GIVEN_NAMES[before_nameIdx % 74]})`);
    }
    const sonName = ensureUnique(baseName, true);
    if (callCount >= 78 && callCount <= 95) {
      console.log(`   -> sonName=${sonName} (after: zibeiIdx=${zibeiIdx}, nameIdx=${nameIdx})`);
    }
    if (sonName === '朱塾明' || sonName === '朱栋德' || sonName === '朱栻仁') {
      console.log(`>>> 第${callCount}次, gen=${gen}, i=${i}, baseName=${baseName}, name=${sonName}`);
    }
    totalCreated += 2;
  }
  gen++;
}
