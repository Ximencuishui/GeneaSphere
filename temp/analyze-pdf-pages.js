/**
 * 分析PDF页面结构：检查各页包含的图像和文本
 */

const fs = require('fs');
const path = require('path');

async function analyzePdf() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const workerPath = path.resolve(__dirname, '..', 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'file:///' + workerPath.replace(/\\/g, '/');

  const pdfBuffer = fs.readFileSync(path.join(__dirname, '全国陈氏总谱.pdf'));
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;

  console.log('=== PDF页面结构分析 ===\n');
  console.log(`总页数: ${pdf.numPages}\n`);

  const results = [];
  for (let pg = 1; pg <= pdf.numPages; pg++) {
    const page = await pdf.getPage(pg);
    const opList = await page.getOperatorList();
    const fnArr = opList.fnArray;

    // Count image operators (OPS codes: 26=paintImageXObject, 27=paintInlineImageXObject, 28=paintImageMaskXObject)
    let imgOps = 0;
    for (const fn of fnArr) {
      if (fn === 26 || fn === 27 || fn === 28) imgOps++;
    }

    const textContent = await page.getTextContent();

    results.push({
      page: pg,
      ops: fnArr.length,
      images: imgOps,
      texts: textContent.items.length,
      textPreview: textContent.items.map(i => i.str).join('').substring(0, 30),
    });

    if (pg <= 10 || pg % 10 === 0) {
      console.log(
        `第${pg}页: 操作符=${fnArr.length}, 图片=${imgOps}, 文本项=${textContent.items.length}` +
        (textContent.items.length > 0 ? ` 文本="${results[pg-1].textPreview}"` : '')
      );
    }
  }

  // Summary
  const pagesWithImages = results.filter(r => r.images > 0);
  const pagesWithText = results.filter(r => r.texts > 0);
  const pagesWithBoth = results.filter(r => r.images > 0 && r.texts === 0);

  console.log('\n=== 统计 ===');
  console.log(`包含图片的页面: ${pagesWithImages.length}/${pdf.numPages}`);
  console.log(`包含文本的页面: ${pagesWithText.length}/${pdf.numPages}`);
  console.log(`只有图片的页面: ${pagesWithBoth.length}/${pdf.numPages}`);
}

analyzePdf().catch(e => console.error('Error:', e.message));
