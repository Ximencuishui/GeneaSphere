/**
 * 真实启动一次无头 Chrome，走 injectPdfFonts → emulateMediaType → page.pdf。
 * 不连数据库。临时 PDF 写在系统临时目录，无论成功失败都会删掉。
 *
 *   pnpm exec ts-node --transpile-only scripts/verify-pdf-fonts.ts
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { PDFParse } from 'pdf-parse'
import * as puppeteer from 'puppeteer-core'
import { injectPdfFonts, PUPPETEER_PDF_ARGS } from '../src/print/pdf-fonts'

const SAMPLES = [
  { family: '宋体', text: '宋体盖闻吾族', hints: ['SimSun', 'NSimSun', 'Songti', 'STSong', 'UMing', '宋体'] },
  { family: '楷体', text: '楷体临池学书', hints: ['KaiTi', 'STKaiti', 'Kaiti SC', 'LXGW', 'WenKai', '霞鹜', '霞鶩', 'UKai', '楷体'] },
  { family: '仿宋', text: '仿宋刊刻卷首', hints: ['FangSong', 'STFangsong', 'Zhuque', '朱雀', '仿宋'] },
]

function findBrowser(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter((item): item is string => !!item)
  const found = candidates.find((item) => fs.existsSync(item))
  if (!found) throw new Error('未找到 Chrome / Edge，请设置 PUPPETEER_EXECUTABLE_PATH')
  return found
}

function pdfNames(pdf: Buffer): string[] {
  const raw = pdf.toString('latin1')
  const found = new Set<string>()
  const re = /\/BaseFont\s*\/([^\s<>\[\]()]+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    const decoded = match[1].replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    found.add(decoded.replace(/^[A-Z]{6}\+/, ''))
  }
  return [...found]
}

function embeddedFontObjects(pdf: Buffer): number {
  const raw = pdf.toString('latin1')
  return (raw.match(/\/FontFile2\b/g) ?? []).length + (raw.match(/\/FontFile3\b/g) ?? []).length
}

async function readText(pdf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdf })
  try {
    const result = await parser.getText()
    return result.text ?? ''
  } finally {
    await parser.destroy()
  }
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geneasphere-pdf-fonts-'))
  const pdfPath = path.join(dir, 'fonts.pdf')
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/></head><body>
${SAMPLES.map((sample) => `<p><span style="font-family: ${sample.family};">${sample.text}</span></p>`).join('\n')}
</body></html>`
  let browser: puppeteer.Browser | undefined
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: findBrowser(),
      args: PUPPETEER_PDF_ARGS,
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    await injectPdfFonts(page, html)
    await page.emulateMediaType('print')
    const pdf = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))
    fs.writeFileSync(pdfPath, pdf)

    const names = pdfNames(pdf)
    const text = await readText(pdf)
    const embedded = embeddedFontObjects(pdf)
    const matched = SAMPLES.map((sample) => ({
      family: sample.family,
      fonts: names.filter((name) => sample.hints.some((hint) => name.toLowerCase().includes(hint.toLowerCase()))),
    }))
    const distinct = new Set(matched.flatMap((item) => item.fonts))
    console.log(JSON.stringify({
      pdfBytes: pdf.length,
      embeddedFontObjects: embedded,
      baseFonts: names,
      matched,
      text: text.replace(/\s+/g, ''),
    }, null, 2))

    const problems: string[] = []
    if (embedded < 3) problems.push(`嵌入的字体对象只有 ${embedded} 个`)
    for (const item of matched) {
      if (item.fonts.length === 0) problems.push(`${item.family} 没有嵌入到独立字体`)
    }
    if (distinct.size < 3) problems.push(`三种样式落到了同一批字体名：${[...distinct].join(', ')}`)
    for (const sample of SAMPLES) {
      if (!text.includes(sample.text)) problems.push(`PDF 文本里没有「${sample.text}」`)
    }
    if (problems.length) {
      throw new Error(problems.join('；'))
    }
    console.log('通过：三种 font-family 嵌入了不同字体，文本可提取。')
  } finally {
    if (browser) await browser.close().catch(() => undefined)
    fs.rmSync(dir, { recursive: true, force: true })
    console.log(`已删除临时目录 ${dir}`)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
