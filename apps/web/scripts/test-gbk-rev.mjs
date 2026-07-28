// 读取 GenealogyTree.vue，尝试把每个乱码字符用反向 GBK 解码回原始 UTF-8 字节
import fs from 'fs';

const file = 'apps/web/src/components/GenealogyTree.vue';
let content = fs.readFileSync(file, 'utf8');
const orig = content;

// 思路：
// "正" UTF-8 = 0xE6 0xAD 0xA3
// 当 PowerShell 把这段 UTF-8 字节流当作 GBK 解码时：
//   E6 AD → GBK "姝" (U+5A1D)
//   A3 → GBK 单字节区 "＜" 或半角字符，但通常会跟下一字节组成一个字符
//   所以连续的中文 UTF-8 字节流被破坏成多个 GBK 字符
//
// 反向思路：先按 UTF-8 字符编码所有中文字符（U+4E00-U+9FFF），
// 然后每个中文字符的 UTF-8 字节序列尝试按 GBK 解码，
// 如果解码出的字符属于"乱码常见字符"（在 GBK 高位区），就替换成原文。

// 常见 GBK→Unicode 范围：U+0080-U+FFEF（除了 ASCII 0-127）
// PowerShell 错误解码后的乱码通常出现在：
// - 全角标点区 U+FF00-U+FFEF（如 "ｅ" "？" "：" 等）
// - 中日韩区 U+4E00-U+9FFF 但实际是错的（如 "姝" 而非 "正"）
// - 私用区 U+E000-U+F8FF

// 简单粗暴的做法：直接构造一个 GBK 编码表，反向解码。
// 但 GBK 有 21003 个汉字，无法穷举。

// 更聪明的方法：找所有"双字节 UTF-8 中文字符"的乱码模式，
// 例如 "正" = E6 AD A3，对应乱码序列 姝（E6 AD）+ （A3 单独）= "姝＜" 或类似

// 先做一个测试：尝试一些常见中文字符的反向映射
const reverseMap = {
  // 正 → 姝＜，在 → ｅ湪，取 → ｅ彇，等
  // 实际更可能的映射：
  // UTF-8 E6 AD A3 (正) → PowerShell 解读 GBK：
  //   字节 1 E6 字节 2 AD → GBK 字符 0xE6AD = 姝 (U+5A1D)
  //   字节 3 A3 单字节 GBK = ＂ (U+FF02) 或类似
  // 所以 "正" → "姝＂" 或 "姝＜"
  //
  // 但实际看到的 "姝ｅ湪" 中：
  //   姝 = U+5A1D ✓ (GBK E6AD)
  //   ｅ = U+FF45 ← 这是半角 e 在全角区的镜像
  //   湪 = U+5E6A
  //
  // 嗯 湪 不是 in 的乱码啊...让我重新思考。
  // 原文 "正在" = U+6B63 U+5728
  //   6B63 UTF-8 = E6 AD A3
  //   5728 UTF-8 = E5 9C A8
  //   完整字节流: E6 AD A3 E5 9C A8
  //
  // 当作 GBK 解码：
  //   E6 AD → 姝 (U+5A1D)
  //   A3 E5 → 不对，GBK 单字节或双字节...
  //   实际看 A3 + 后续字节配对
  //
  //   让我们尝试读 A3 5C → GBK: 5C 是 "\" 单字节
  //   那 A3 E5 配对 → GBK 字符 "姝" 不对...
  //
  // 算了，我直接用 iconv-lite 试试看。
  // 但 node 没有 iconv-lite 默认安装。

  // 实际上更可能：PowerShell 把 UTF-8 文件读为字节流，
  // 然后按 GBK 解码每个"字符对"（GBK 是双字节字符集）。
  //
  // 原 UTF-8 字节流：
  //   E6 AD A3 E5 9C A8  (正在)
  //
  // GBK 解码（按双字节）：
  //   E6AD → 姝
  //   A3E5 → 5C？ 不对，A3 不是 GBK 字符
  //
  // 不对，GBK 解码规则是：遇到 high byte (>=0x81) 跟下一字节配对。
  // high byte = E6, A3, E5, 9C, A8
  // E6 AD = 姝
  // A3 E5 = GBK 0xA3E5 = ?
  // E5 9C = GBK 0xE59C = 灜
  // A8 单独字节 → GBK 单字节区
  //
  // 实际显示可能是：姝 A3E5字符 灜 A8字符
};

// 不从字节层做映射了。我们直接做一个字符替换表：
// 乱码文本 → 正确文本 的映射

// 从之前的 scan 结果中提取的乱码样本：
const samples = [
  { garbled: '姝ｅ湪鎷夊彇瀹舵棌鏁版嵁锟,', correct: '正在拉取家族数据…' },
  { garbled: '姝ｅ湪瑙ｆ瀽璋辩郴缁撴瀯锟,', correct: '正在解析谱系结构…' },
  { garbled: '姝ｅ湪娓叉煋鏃忚氨鏍戯拷?,', correct: '正在渲染族谱树…' },
  { garbled: '姝ｅ湪閫傞厤鐢诲竷锟,', correct: '正在适配画布…' },
  { garbled: '姝ｅ湪鍔犺浇鏃忚氨鏍戯拷?,', correct: '正在加载族谱树…' },
];

console.log('样本：');
for (const s of samples) {
  console.log('  ' + JSON.stringify(s.garbled) + ' → ' + JSON.stringify(s.correct));
}
console.log('garbled chars: 5 chars per 6 actual');
console.log('each char encodes 3 UTF-8 bytes');