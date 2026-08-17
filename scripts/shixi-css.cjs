/* eslint-disable */
// 与 cepu.service.ts 中 shixiTableCss() 行为一致 + 密集模式(防溢出)
module.exports = `
  .shixi-page{
    width:180mm; height:260mm;
    margin:0 auto 8mm;
    padding:16mm 12mm 14mm;
    box-sizing:border-box;
    position:relative;
    border:3px double #333;
    background:#fffdf6;
    writing-mode:vertical-rl;
    font-family:'KaiTi','SimSun','Songti SC','Microsoft YaHei',serif;
    page-break-after:always;
    break-after:page;
    overflow:hidden;
  }
  .shixi-page .shixi-page-dot{position:absolute; top:6mm; right:6mm; width:5mm; height:5mm; border:1.5px solid #333; border-radius:50%; background:#fffdf6;}
  .shixi-page .shixi-title{position:absolute; bottom:6mm; left:6mm; writing-mode:vertical-rl; font-family:'KaiTi','Songti SC',serif; color:#b22222; font-size:13pt; letter-spacing:6px; line-height:1.4;}
  .shixi-grid{display:flex; flex-direction:row-reverse; height:100%; gap:3mm; align-items:stretch;}
  .shixi-col{flex:1; position:relative; padding:14mm 3mm 4mm; border-left:1px solid #888; display:flex; flex-direction:column; align-items:center; writing-mode:vertical-rl; min-height:0;}
  .shixi-col:last-child{border-left:1px solid #888;}
  .shixi-col-header{position:absolute; top:0; right:0; background:#d9d9d9; border:1px solid #333; writing-mode:horizontal-tb; font-family:'KaiTi','Songti SC',serif; color:#b22222; font-size:13pt; font-weight:bold; padding:4px 10px; letter-spacing:4px;}
  .shixi-col::before{content:''; position:absolute; top:-6px; left:50%; transform:translateX(-50%); width:10px; height:10px; border:2px solid #333; border-radius:50%; background:#fffdf6;}
  .shixi-col::after{content:''; position:absolute; top:-1px; left:50%; width:100%; height:0; border-top:1px solid #333;}
  .shixi-page.no-connector .shixi-col::before, .shixi-page.no-connector .shixi-col::after{display:none;}
  .shixi-person{margin:3mm 0; text-align:center; max-width:30mm; writing-mode:vertical-rl; line-height:1.7; flex-shrink:0;}
  .shixi-name{font-family:'KaiTi','Songti SC',serif; font-size:13pt; font-weight:bold; margin-bottom:3px; letter-spacing:2px; color:#b22222;}
  .shixi-line{font-size:8.5pt; color:#1a1a1a; margin:1px 0; line-height:1.6;}
  .shixi-bio{font-size:8.5pt; color:#1a1a1a; margin-top:4px; line-height:1.7; text-align:justify;}

  /* 中等密集模式: 7-12 人/代 */
  .shixi-page.condense .shixi-person{margin:2mm 0; line-height:1.5;}
  .shixi-page.condense .shixi-name{font-size:11pt; margin-bottom:2px;}
  .shixi-page.condense .shixi-line{font-size:8pt; margin:1px 0; line-height:1.45;}
  .shixi-page.condense .shixi-bio{font-size:8pt; margin-top:3px; line-height:1.55;}
  .shixi-page.condense .shixi-col-header{font-size:11pt; padding:3px 8px; letter-spacing:3px;}
  .shixi-page.condense .shixi-title{font-size:12pt; letter-spacing:4px;}

  /* 强密集模式: >12 人/代,字号进一步缩小,行高压缩 */
  .shixi-page.condense-strong .shixi-person{margin:1.5mm 0; line-height:1.3;}
  .shixi-page.condense-strong .shixi-name{font-size:10pt; margin-bottom:1px;}
  .shixi-page.condense-strong .shixi-line{font-size:7.5pt; margin:0; line-height:1.3;}
  .shixi-page.condense-strong .shixi-bio{font-size:7.5pt; margin-top:2px; line-height:1.4;}
  .shixi-page.condense-strong .shixi-col-header{font-size:10pt; padding:2px 6px; letter-spacing:2px;}
  .shixi-page.condense-strong .shixi-title{font-size:11pt; letter-spacing:3px;}
`;