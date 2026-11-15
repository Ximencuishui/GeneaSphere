import { buildPdfFontCss, injectPdfFonts } from './pdf-fonts';

describe('buildPdfFontCss', () => {
  it('三款预置字体分别指向不同的 Linux 字体，Noto 只做缺字回退', () => {
    const css = buildPdfFontCss('<p><span style="font-family: 宋体;">盖闻</span></p>');
    const src = (family: string) => css.match(new RegExp(`font-family:"${family}";src:([^;]+)`))?.[1] ?? '';
    const song = src('宋体');
    const kai = src('楷体');
    const fang = src('仿宋');
    expect(song.indexOf('local("SimSun")')).toBeLessThan(song.indexOf('local("AR PL UMing CN")'));
    expect(song).not.toContain('Noto');
    expect(kai.indexOf('local("LXGW WenKai")')).toBeLessThan(kai.indexOf('local("AR PL UKai CN")'));
    expect(kai).not.toContain('Noto');
    expect(fang).toContain('local("Zhuque Fangsong (technical preview)")');
    expect(fang).toContain('local("朱雀仿宋（预览测试版）")');
    expect(fang).not.toContain('Noto');
    expect(fang).not.toContain('UKai');
    expect(css).toContain('font-family:"GeneaSphere CJK Fallback"');
    expect(css).toContain('local("Noto Serif CJK SC")');
    expect(css).toContain('local("WenQuanYi Zen Hei")');
    expect(css).toContain('[style*="font-family: 楷体"]');
  });

  it('带引号的 font-family 和英文家族名也能对上', () => {
    const css = buildPdfFontCss(`<span style="font-family: '楷体', SimSun;">字</span>`);
    expect(css).toContain('font-family:"楷体"');
    expect(css).toContain('font-family:"SimSun"');
  });

  it('自定义字体的 Base64 和 URL 拼进 src，并盖过同名的系统回退', () => {
    const css = buildPdfFontCss('<p style="font-family: \'我的字体\'">正文</p>', [
      { family: '我的字体', src: 'data:font/woff2;base64,QQ==' },
      { family: '外链字体', src: 'https://cdn.example.com/fonts/clan.woff2' },
    ]);
    expect(css).toContain('font-family:"我的字体"');
    expect(css).toContain('url("data:font/woff2;base64,QQ==")');
    expect(css).not.toMatch(/font-family:"我的字体"[^}]*local\("我的字体"\)/);
    expect(css).toContain('url("https://cdn.example.com/fonts/clan.woff2")');
  });

  it('HTML 里已有的 @font-face 会保留', () => {
    const html = `<style>@font-face{font-family:'上传体';src:url("data:font/woff2;base64,QUJD");}</style><span style="font-family: '上传体'">甲</span>`;
    const css = buildPdfFontCss(html);
    expect(css).toContain('font-family:"上传体"');
    expect(css).toContain('data:font/woff2;base64,QUJD');
  });

  it('没有字体文件的自定义家族名回退到 Noto，避免汉字缺字', () => {
    const css = buildPdfFontCss('<span style="font-family: \'族谱手写\'">甲</span>');
    expect(css).toContain('font-family:"族谱手写"');
    expect(css).toContain('local("Noto Serif CJK SC")');
  });

  it('拒绝 javascript 地址', () => {
    const css = buildPdfFontCss('', [{ family: '坏字体', src: 'javascript:alert(1)' }]);
    expect(css).not.toContain('javascript:');
    expect(css).not.toContain('坏字体');
  });
});

describe('injectPdfFonts', () => {
  it('先注入样式，再 load 每个家族并等待 document.fonts.ready', async () => {
    const loaded: string[] = [];
    let ready = false;
    const added: string[] = [];
    const page = {
      addStyleTag: async ({ content }: { content: string }) => {
        added.push(content);
      },
      evaluate: async (fn: (names: string[]) => Promise<void>, names: string[]) => {
        const previous = global.document;
        (global as { document?: unknown }).document = {
          fonts: {
            load: async (spec: string) => {
              loaded.push(spec);
              return [];
            },
            ready: Promise.resolve().then(() => {
              ready = true;
            }),
          },
        };
        try {
          await fn(names);
        } finally {
          global.document = previous;
        }
      },
    };

    await injectPdfFonts(page, '<span style="font-family: 宋体">序</span>');

    expect(added[0]).toContain('font-family:"宋体"');
    expect(loaded.some((spec) => spec.includes('宋体'))).toBe(true);
    expect(loaded.some((spec) => spec.includes('楷体'))).toBe(true);
    expect(ready).toBe(true);
  });
});
