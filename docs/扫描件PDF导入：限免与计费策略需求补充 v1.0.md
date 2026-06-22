扫描件PDF导入：限免与计费策略需求补充 v1.0

本文档是对《数据导入功能需求文档》中“PDF/图片导入”部分的补充，针对扫描件PDF导入场景，原方案识别不了，引入腾讯云OCR方案来兜底，并制定用户端的限免与计费策略。

1. 背景

《全国陈氏总谱.pdf》这类扫描件PDF无法直接提取文字，必须通过OCR（光学字符识别）服务。我们选择腾讯云OCR作为主力方案，同时为控制成本，对用户端采取限免政策：每月免费处理一定额度，超出部分按页或按字数收费。

2. 限免与计费规则

2.1 免费额度

维度 额度 说明

每月免费页数 10 页 以PDF页数为单位，不足1页按1页计

每月免费字数 1000 字 OCR识别出的中文字符数，以先达到者为准

重置周期 自然月 每月1日重置免费额度

示例：
• 用户A本月上传了一份20页的PDF，前10页免费，后10页按页计费。

• 用户B上传了一份5页的PDF，识别出1200字，其中1000字免费，超出200字按字数计费。

2.2 超出计费

计费项 单价 说明

超出页数 ¥0.50/页 不足1页按1页计

超出字数 ¥0.05/百字 不足100字按100字计

扣费方式：从用户账户余额中扣除（与短信、AI工具箱共享余额体系）。

2.3 免费用户与付费用户的区别

项目 免费用户（未充值） 付费用户（有余额）

免费额度 每月10页/1000字 同上

超出处理 提示“额度不足，请充值后继续” 自动从余额扣费

处理优先级 低（可能排队） 高（优先处理）

3. 用户界面交互

3.1 导入前提示

在上传PDF/图片文件的步骤，增加额度提示：

┌─────────────────────────────────────────┐
│ 上传扫描件PDF/图片                        │
│                                         │
│ 您本月剩余免费额度：8页 / 600字           │
│ 超出部分：¥0.50/页，¥0.05/百字            │
│                                         │
│ 文件大小限制：50MB                        │
│ [选择文件]                               │
└─────────────────────────────────────────┘


3.2 导入中实时显示消耗

处理过程中，显示当前已消耗的页数和字数：

┌─────────────────────────────────────────┐
│ 正在识别... 第5/20页                     │
│ 已识别字数：450字                        │
│ 已消耗免费额度：5页 / 450字              │
│ 即将超出免费额度：第11页起将扣费          │
└─────────────────────────────────────────┘


3.3 导入结果页

显示本次导入的费用明细：

┌─────────────────────────────────────────┐
│ 导入完成                                │
│                                         │
│ 成功识别：18页，3200字                    │
│ 费用明细：                               │
│   - 免费页数：10页                       │
│   - 免费字数：1000字                     │
│   - 超出页数：8页 × ¥0.50 = ¥4.00        │
│   - 超出字数：2200字（22百字）× ¥0.05 = ¥1.10 │
│   - 合计：¥5.10                          │
│   - 已从余额扣除                         │
│                                         │
│ [查看导入数据] [继续导入]                 │
└─────────────────────────────────────────┘


3.4 余额不足时的处理

若用户余额不足以支付本次导入费用，弹出充值提示：

┌─────────────────────────────────────────┐
│ 余额不足                                │
│                                         │
│ 本次导入预计费用：¥5.10                   │
│ 当前余额：¥2.00                          │
│                                         │
│ 请充值后再继续导入                        │
│ [充值] [取消导入]                        │
└─────────────────────────────────────────┘


4. 后端实现要点

4.1 数据库字段扩展

在 user_credits 表中增加OCR相关字段：
ALTER TABLE user_credits ADD COLUMN
  ocr_pages_used INT DEFAULT 0,           -- 本月已用OCR页数
  ocr_chars_used INT DEFAULT 0,           -- 本月已用OCR字数
  ocr_reset_date DATE DEFAULT CURRENT_DATE; -- 最后一次重置日期


4.2 扣费逻辑（伪代码）

def process_ocr(pdf_file, user):
    # 1. 检查并重置月度额度
    if today().month != user.ocr_reset_date.month:
        user.ocr_pages_used = 0
        user.ocr_chars_used = 0
        user.ocr_reset_date = today()

    # 2. 计算本次消耗
    total_pages = pdf_page_count(pdf_file)
    free_pages_left = max(0, 10 - user.ocr_pages_used)
    chargeable_pages = max(0, total_pages - free_pages_left)

    # 3. 先执行OCR（异步），获取实际字数
    ocr_result = do_ocr(pdf_file)  # 调用腾讯云OCR
    actual_chars = count_chinese_chars(ocr_result.text)
    free_chars_left = max(0, 1000 - user.ocr_chars_used)
    chargeable_chars = max(0, actual_chars - free_chars_left)

    # 4. 计算费用
    fee = chargeable_pages * 0.5 + math.ceil(chargeable_chars / 100) * 0.05

    # 5. 检查余额
    if fee > 0 and user.balance < fee:
        raise InsufficientBalance("余额不足")

    # 6. 扣费（在事务中）
    if fee > 0:
        deduct_balance(user, fee)

    # 7. 更新使用量
    user.ocr_pages_used += min(total_pages, free_pages_left)  # 实际消耗免费页数
    user.ocr_chars_used += min(actual_chars, free_chars_left)  # 实际消耗免费字数

    # 8. 返回结果
    return ocr_result


4.3 腾讯云OCR调用封装

// ocrService.js
import tencentcloud from 'tencentcloud-sdk-nodejs-ocr'

export async function recognizePDF(pages) {
  const client = new tencentcloud.ocr.v20181119.Client({...})
  let allText = ''
  for (const base64 of pages) {
    const res = await client.GeneralBasicOCR({ ImageBase64: base64 })
    allText += res.TextDetections.map(t => t.DetectedText).join('\n')
  }
  return allText
}


5. 与现有模块的集成

模块 集成点

用户余额系统 扣费、余额查询

工具箱计费 共享余额体系，可复用充值入口

导入向导 在步骤一中增加额度提示，步骤四显示费用明细

用户中心 增加“OCR使用记录”查看入口

6. 验收标准

1. 用户上传一份15页的PDF，前10页免费，后5页从余额扣费（¥2.50），页面显示正确。
2. 用户上传一份5页的PDF，识别出1200字，前1000字免费，超出200字扣费（¥0.10）。
3. 余额不足时，弹出充值提示，充值后继续导入。
4. 每月1日重置免费额度，重置后旧记录保留。
5. 管理员后台可查看所有OCR使用记录和收入明细。

7. 后续优化

• v1.1：支持批量导入时合并计费（一次上传多个文件，统一结算）。

• v1.2：引入“夜间低价”策略（非高峰时段OCR费用减半）。

• v1.3：对家族管理员提供“家族共享额度包”（类似短信共享包）。

版本修订记录

版本 日期 修订内容

v1.0 2026-06-18 初版，覆盖扫描件PDF导入的限免与计费策略