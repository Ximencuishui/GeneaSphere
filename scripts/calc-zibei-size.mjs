// 精确计算繁衍需要的男性名字数
const totalTargetByGen = {
  6: 6, 7: 10, 8: 14, 9: 18, 10: 22, 11: 26, 12: 30, 13: 32, 14: 34, 15: 36,
  16: 38, 17: 38, 18: 36, 19: 34, 20: 32, 21: 28, 22: 24, 23: 20, 24: 16,
  25: 12, 26: 8, 27: 6, 28: 4, 29: 2,
};
let totalMales = 0;
for (const [gen, n] of Object.entries(totalTargetByGen)) {
  totalMales += n;
}
console.log('繁衍总男性数 =', totalMales);

// 总繁衍数（包含妻子、女儿）
const totalTarget = 1000 - 32;  // TARGET_POPULATION - HISTORICAL_FIGURES
console.log('总繁衍目标人数 =', totalTarget);

// 每代 targetNewMales 是按"儿子"数计算，每儿子+1妻+50%女，totalCreated += 2/3
// 所以繁衍循环 i 数 ≈ 526 次（总儿子数），但实际 i 循环可能略少（totalCreated 提前达到 target）
console.log('\n需要组合空间 > 526 唯一 pair');

// 验证 ZIBEI_CHARS 不同长度下的 LCM
for (const len of [27, 28, 29, 30, 33, 35, 49, 70]) {
  const lcm = (a, b) => (a * b) / gcd(a, b);
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const cycle = lcm(len, 70);
  console.log(`ZIBEI_CHARS.length=${len}, pair cycle LCM(${len}, 70) = ${cycle}, sufficient=${cycle >= 526 ? '✓' : '✗'}`);
}