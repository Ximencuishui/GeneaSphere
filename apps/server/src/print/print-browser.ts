import * as fs from 'fs';

/** 单次 PDF 渲染的硬超时。启动浏览器和 page.pdf 共用这一段时间。 */
export const PDF_RENDER_TIMEOUT_MS = 60_000;

export const PDF_RENDER_TIMEOUT_MESSAGE = 'PDF 渲染超时（60 秒），已关闭浏览器';

/**
 * 浏览器可执行文件：
 * 1. PUPPETEER_EXECUTABLE_PATH
 * 2. puppeteer 缓存里的 Chrome（executablePath()，即安装 puppeteer / browsers install chrome 后的自带浏览器）
 */
export async function resolvePuppeteerExecutable(
  env: NodeJS.ProcessEnv,
  bundledChrome: () => Promise<string | undefined>,
  fileExists: (path: string) => boolean = fs.existsSync,
): Promise<string> {
  const fromEnv = env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv) {
    if (!fileExists(fromEnv)) {
      throw new Error(`PUPPETEER_EXECUTABLE_PATH 指向的浏览器不存在：${fromEnv}`);
    }
    return fromEnv;
  }
  const cached = (await bundledChrome())?.trim();
  if (cached && fileExists(cached)) return cached;
  throw new Error(
    '未设置 PUPPETEER_EXECUTABLE_PATH，且未找到 puppeteer 自带的 Chrome。请设置该变量，或先执行 npx puppeteer browsers install chrome。',
  );
}

export async function closeBrowserQuietly(browser: { close: () => Promise<unknown> }): Promise<void> {
  try {
    await browser.close();
  } catch {
    // 超时与失败路径可能已经关过一次。
  }
}

function isRenderTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const named = error as { name?: string; message?: string };
  return named.name === 'TimeoutError' || /timeout/i.test(named.message ?? '');
}

/**
 * 到点后关闭 browser，再抛出明确错误。成功、pdf() 失败、超时都会进入 finally 关闭。
 */
export async function renderWithinTimeout<T>(
  browser: { close: () => Promise<unknown> },
  work: () => Promise<T>,
  timeoutMs = PDF_RENDER_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const workPromise = work();
  workPromise.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(PDF_RENDER_TIMEOUT_MESSAGE));
    }, timeoutMs);
  });
  timeout.catch(() => undefined);
  try {
    return await Promise.race([workPromise, timeout]);
  } catch (error) {
    if (timedOut || isRenderTimeout(error)) {
      throw new Error(PDF_RENDER_TIMEOUT_MESSAGE);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    await closeBrowserQuietly(browser);
  }
}
