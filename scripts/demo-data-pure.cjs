/* eslint-disable */
/**
 * 演示数据生成纯函数版(剥离 Prisma / Logger 依赖)
 * 与 apps/server/src/auth/demo-seed.service.ts 中的 createDemoZhuXiGenealogy
 * 数据生成逻辑一致(2026-08-16 修复后的女性姓名展开逻辑),输出结构与
 * cepu.service.ts 的 ShiluEntry 输入格式对齐,用于不依赖数据库的视觉对照。
 */

const HISTORICAL_FIGURES = [
  { name: '朱熹', gender: 'male', birth: 1130, death: 1200, generation: 1, branch: 'A' },
  { name: '刘氏', gender: 'female', birth: 1132, death: 1195, generation: 1, branch: 'A' },
  { name: '朱塾', gender: 'male', birth: 1153, death: 1191, generation: 2, father: '朱熹', mother: '刘氏', branch: 'A' },
  { name: '朱埜', gender: 'male', birth: 1156, death: 1212, generation: 2, father: '朱熹', mother: '刘氏', branch: 'B' },
  { name: '朱在', gender: 'male', birth: 1169, death: 1239, generation: 2, father: '朱熹', mother: '刘氏', branch: 'C' },
  { name: '林氏', gender: 'female', birth: 1155, death: 1215, generation: 2, branch: 'A' },
  { name: '赵氏', gender: 'female', birth: 1158, death: 1218, generation: 2, branch: 'B' },
  { name: '范氏', gender: 'female', birth: 1172, death: 1240, generation: 2, branch: 'C' },
  { name: '朱鉴', gender: 'male', birth: 1190, death: 1258, generation: 3, father: '朱塾', mother: '林氏', branch: 'A' },
  { name: '朱铨', gender: 'male', birth: 1195, death: 1260, generation: 3, father: '朱塾', mother: '林氏', branch: 'A' },
  { name: '朱潜', gender: 'male', birth: 1200, death: 1270, generation: 3, father: '朱埜', mother: '赵氏', branch: 'B' },
  { name: '朱鋆', gender: 'male', birth: 1205, death: 1275, generation: 3, father: '朱在', mother: '范氏', branch: 'C' },
  { name: '郑氏', gender: 'female', birth: 1192, death: 1265, generation: 3, branch: 'A' },
  { name: '王氏', gender: 'female', birth: 1198, death: 1268, generation: 3, branch: 'A' },
  { name: '孙氏', gender: 'female', birth: 1203, death: 1275, generation: 3, branch: 'B' },
  { name: '徐氏', gender: 'female', birth: 1208, death: 1280, generation: 3, branch: 'C' },
  { name: '朱浚', gender: 'male', birth: 1220, death: 1290, generation: 4, father: '朱鉴', mother: '郑氏', branch: 'A' },
  { name: '朱洪', gender: 'male', birth: 1225, death: 1295, generation: 4, father: '朱铨', mother: '王氏', branch: 'A' },
  { name: '朱沐', gender: 'male', birth: 1230, death: 1300, generation: 4, father: '朱潜', mother: '孙氏', branch: 'B' },
  { name: '朱深', gender: 'male', birth: 1235, death: 1305, generation: 4, father: '朱鋆', mother: '徐氏', branch: 'C' },
  { name: '陈氏', gender: 'female', birth: 1223, death: 1293, generation: 4, branch: 'A' },
  { name: '周氏', gender: 'female', birth: 1228, death: 1298, generation: 4, branch: 'A' },
  { name: '吴氏', gender: 'female', birth: 1233, death: 1303, generation: 4, branch: 'B' },
  { name: '何氏', gender: 'female', birth: 1238, death: 1308, generation: 4, branch: 'C' },
  { name: '朱桂', gender: 'male', birth: 1252, death: 1320, generation: 5, father: '朱浚', mother: '陈氏', branch: 'A' },
  { name: '朱桐', gender: 'male', birth: 1258, death: 1325, generation: 5, father: '朱洪', mother: '周氏', branch: 'A' },
  { name: '朱森', gender: 'male', birth: 1263, death: 1330, generation: 5, father: '朱沐', mother: '吴氏', branch: 'B' },
  { name: '朱柄', gender: 'male', birth: 1268, death: 1335, generation: 5, father: '朱深', mother: '何氏', branch: 'C' },
  { name: '郭氏', gender: 'female', birth: 1255, death: 1323, generation: 5, branch: 'A' },
  { name: '马氏', gender: 'female', birth: 1260, death: 1328, generation: 5, branch: 'A' },
  { name: '黄氏', gender: 'female', birth: 1265, death: 1333, generation: 5, branch: 'B' },
  { name: '罗氏', gender: 'female', birth: 1270, death: 1338, generation: 5, branch: 'C' },
];

const CURRENT_YEAR = 2025;
const GENERATION_YEARS = 32;
const ZIBEI_CHARS = ['熹','塾','埜','在','鉴','铨','潜','鋆','浚','洪','沐','深','桂','桐','森','柄','模','朴','梓','樾','楷','检','樽','栻','栉','栒','栋','梁'];
const MALE_GIVEN_NAMES = ['康','宁','安','平','泰','昌','盛','荣','华','耀','明','德','仁','义','礼','智','信','忠','孝','廉','邦','国','家','民','世','代','永','长','久','远','福','禄','寿','喜','财','源','海','山','川','林','涛','波','渊','文','武','斌','勇','强','伟','雄','辉','光','星','辰','天','地','宇','宙','鸿','志','远','翔','飞','龙','虎','豹','麟','凤','祺','瑞'];
const MARRIAGE_SURNAMES = ['刘','陈','张','王','李','赵','黄','周','吴','徐','孙','胡','高','林','何','郭','马','罗','梁','宋','郑','谢','韩','唐','冯','于','董','萧','程','曹','袁','邓','许','傅','沈','曾','彭','吕','苏','卢','蒋','蔡','贾','丁','魏','薛','叶','阎','余','潘'];
const FEMALE_GIVEN_NAMES = ['娘','姑','英','华','芳','芬','萍','莉','梅','兰','菊','竹','莲','荷','玉','珍','珠','翠','凤','鸾','燕','莺','蝶','娥','媛','婷','娟','秀','惠','敏','慧','巧','美','丽','倩','仪','静','娴','淑','贤','德','贞','婉','柔','云','霞','月','星','瑶','琼'];
const BIRTH_PLACES = ['婺源','徽州','建阳','崇安','武夷山','杭州','福州','江西婺源','安徽歙县','福建建瓯','浙江淳安','江苏苏州'];
const TARGET_POPULATION = 1000;

/**
 * 生成完整 demo 数据(1000 人)
 * @returns {Array<{generation, full_name, birth_year, death_year, gender, native_place, branch, father_name}>}
 */
function generateDemoEntries() {
  const entries = [];
  // 历史人物(前 5 世)
  for (const f of HISTORICAL_FIGURES) {
    entries.push({
      generation: f.generation,
      full_name: f.name,
      gender: f.gender,
      birth_year: f.birth,
      death_year: f.death || null,
      is_living: !f.death || f.death >= CURRENT_YEAR,
      native_place: BIRTH_PLACES[f.generation % BIRTH_PLACES.length],
      branch: f.branch,
      father_name: f.father || null,
    });
  }

  // 程序化繁衍: 第 6 世起,目标总人数 1000
  const breedingPool = [];
  const fifthGenMales = HISTORICAL_FIGURES.filter((f) => f.gender === 'male' && f.generation === 5);
  const wifeMap5 = new Map([['朱桂','郭氏'],['朱桐','马氏'],['朱森','黄氏'],['朱柄','罗氏']]);
  for (const f of fifthGenMales) {
    breedingPool.push({ name: f.name, gen: f.generation, birth: f.birth, branch: f.branch || 'A', wife_name: wifeMap5.get(f.name) || null });
  }

  const usedNames = new Set(HISTORICAL_FIGURES.map((f) => f.name));
  let nameIdx = 0;
  let zibeiIdx = 5;
  const nextName = () => {
    const zibei = ZIBEI_CHARS[zibeiIdx % ZIBEI_CHARS.length];
    zibeiIdx++;
    const given = MALE_GIVEN_NAMES[nameIdx % MALE_GIVEN_NAMES.length];
    nameIdx++;
    return '朱' + zibei + given;
  };
  let femaleNameCounter = 0;
  const FEMALE_NAME_POOL = (() => {
    const arr = [];
    for (const sn of MARRIAGE_SURNAMES) for (const fn of FEMALE_GIVEN_NAMES) arr.push(sn + fn);
    return arr;
  })();
  const nextWifeName = () => FEMALE_NAME_POOL[femaleNameCounter++ % FEMALE_NAME_POOL.length];

  const ensureUnique = (baseName, isMale) => {
    let nm = baseName;
    let attempt = 0;
    while (usedNames.has(nm) && attempt < 500) {
      if (isMale) {
        const zibei = ZIBEI_CHARS[zibeiIdx % ZIBEI_CHARS.length];
        zibeiIdx++;
        const given = MALE_GIVEN_NAMES[(nameIdx + attempt) % MALE_GIVEN_NAMES.length];
        nm = '朱' + zibei + given;
      } else {
        nm = FEMALE_NAME_POOL[femaleNameCounter++ % FEMALE_NAME_POOL.length];
      }
      attempt++;
    }
    usedNames.add(nm);
    return nm;
  };

  let generation = 6;
  let totalCreated = 0;
  const totalTarget = TARGET_POPULATION - HISTORICAL_FIGURES.length;
  const totalTargetByGen = {
    6: 6, 7: 10, 8: 14, 9: 18, 10: 22, 11: 26, 12: 30, 13: 32, 14: 34, 15: 36,
    16: 38, 17: 38, 18: 36, 19: 34, 20: 32, 21: 28, 22: 24, 23: 20, 24: 16,
    25: 12, 26: 8, 27: 6, 28: 4, 29: 2,
  };

  const allMalesArr = breedingPool.slice();
  while (totalCreated < totalTarget && generation <= 30) {
    const targetNewMales = totalTargetByGen[generation] || 0;
    if (targetNewMales === 0 || allMalesArr.length === 0) { generation++; continue; }
    for (let i = 0; i < targetNewMales && totalCreated < totalTarget; i++) {
      const fatherIdx = (i + generation * 7 + nameIdx) % allMalesArr.length;
      const father = allMalesArr[fatherIdx];
      const sonName = ensureUnique(nextName(), true);
      const sonBirth = father.birth + 25 + ((i + generation) % 8);
      const sonDeath = sonBirth + 40 + ((nameIdx + i) % 50);
      entries.push({
        generation: generation, full_name: sonName, gender: 'male',
        birth_year: sonBirth, death_year: sonDeath,
        is_living: sonDeath >= CURRENT_YEAR,
        native_place: BIRTH_PLACES[generation % BIRTH_PLACES.length],
        branch: father.branch, father_name: father.name,
      });
      totalCreated++;
      const wname = ensureUnique(nextWifeName(), false);
      const wBirth = sonBirth + 18 + ((nameIdx + i) % 8);
      const wDeath = wBirth + 30 + ((nameIdx + i) % 55);
      entries.push({
        generation: generation, full_name: wname, gender: 'female',
        birth_year: wBirth, death_year: wDeath,
        is_living: wDeath >= CURRENT_YEAR,
        native_place: BIRTH_PLACES[generation % BIRTH_PLACES.length],
        branch: father.branch, father_name: sonName,
      });
      totalCreated++;
      // 50% 概率有女儿
      if ((nameIdx + i) % 2 === 0 && totalCreated < totalTarget) {
        const daughterName = ensureUnique(nextWifeName(), false);
        const dBirth = sonBirth + 3;
        const dDeath = dBirth + 35 + ((nameIdx + i) % 50);
        entries.push({
          generation: generation, full_name: daughterName, gender: 'female',
          birth_year: dBirth, death_year: dDeath,
          is_living: dDeath >= CURRENT_YEAR,
          native_place: BIRTH_PLACES[generation % BIRTH_PLACES.length],
          branch: father.branch, father_name: sonName,
        });
        totalCreated++;
      }
      allMalesArr.push({ name: sonName, gen: generation, birth: sonBirth, branch: father.branch, wife_name: wname });
    }
    generation++;
  }
  return entries;
}

module.exports = { generateDemoEntries, HISTORICAL_FIGURES, TARGET_POPULATION };