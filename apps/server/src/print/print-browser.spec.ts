import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  PDF_RENDER_TIMEOUT_MESSAGE,
  renderWithinTimeout,
  resolvePuppeteerExecutable,
} from './print-browser';

describe('resolvePuppeteerExecutable', () => {
  const executable = path.join(os.tmpdir(), `gs-chrome-${process.pid}`);

  beforeAll(() => {
    fs.writeFileSync(executable, '');
  });

  afterAll(() => {
    fs.rmSync(executable, { force: true });
  });

  it('优先使用 PUPPETEER_EXECUTABLE_PATH', async () => {
    const resolved = await resolvePuppeteerExecutable(
      { PUPPETEER_EXECUTABLE_PATH: executable },
      async () => '/missing/bundled-chrome',
    );
    expect(resolved).toBe(executable);
  });

  it('未设置环境变量时使用 puppeteer 自带 Chrome', async () => {
    const resolved = await resolvePuppeteerExecutable({}, async () => executable);
    expect(resolved).toBe(executable);
  });

  it('两者都没有时给出明确错误', async () => {
    await expect(resolvePuppeteerExecutable({}, async () => undefined)).rejects.toThrow(
      '未设置 PUPPETEER_EXECUTABLE_PATH',
    );
  });
});

describe('renderWithinTimeout', () => {
  it('pdf() 失败时仍关闭 browser', async () => {
    let closed = 0;
    const browser = {
      close: async () => {
        closed += 1;
      },
    };
    await expect(
      renderWithinTimeout(browser, async () => {
        throw new Error('pdf failed');
      }),
    ).rejects.toThrow('pdf failed');
    expect(closed).toBe(1);
  });

  it('超时后关闭 browser 并返回明确错误', async () => {
    let closed = 0;
    const browser = {
      close: async () => {
        closed += 1;
      },
    };
    await expect(
      renderWithinTimeout(browser, () => new Promise(() => undefined), 30),
    ).rejects.toThrow(PDF_RENDER_TIMEOUT_MESSAGE);
    expect(closed).toBe(1);
  });
});
